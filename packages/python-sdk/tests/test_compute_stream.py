"""Serve on stream without a chain: the terms, and every reason a request is refused."""

import json

import pytest

from arl_protocol import (
    ArlError,
    ComputeStreams,
    ServeOnStream,
    StreamState,
    stream_auth_headers,
    stream_auth_message,
)
from arl_protocol.compute_stream import COMPUTE_PAYMENT, STREAM_HEADER, STREAM_SIGNATURE_HEADER

# Anvil development accounts 0 and 1 (public test keys).
SENDER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
STRANGER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
PROVIDER = "0x00000000000000000000000000000000000000b2"
NOW = 1_800_000_000
RATE = 10**15
VIEM_SIGNATURE = (
    "0xefec28fc1580d266b3d4a6633953d6b7afe9e65415c9e5b3f996408814e29487"
    "440325d7299fcd796bb0bb4c19c029ed0de170be631a20ed6ad932fb0a05efa21b"
)


def state(**changes) -> StreamState:
    values = dict(
        stream_id=1,
        contract=COMPUTE_PAYMENT,
        sender=SENDER,
        provider=PROVIDER,
        rate_per_second=RATE,
        start_time=NOW - 100,
        end_time=NOW + 500,
        stop_time=0,
        settled=False,
        deposit=RATE * 600,
        streamed=RATE * 100,
        withdrawable=RATE * 100,
        live=True,
        seconds_left=500,
        read_at=NOW,
    )
    return StreamState(**{**values, **changes})


class Offline(ServeOnStream):
    """The service with its chain read replaced."""

    def __init__(self, stream=None, missing=False):
        super().__init__(provider=PROVIDER, rate_per_second=RATE)
        found = stream or state()

        class Reads(ComputeStreams):
            def get(self, stream_id):
                if missing:
                    raise ArlError("stream does not exist")
                return found

        self.streams = Reads()


def headers(key=SENDER_KEY, stream_id=1, at=NOW, chain_id=8453):
    return stream_auth_headers(key, stream_id, chain_id=chain_id, now=at)


def reason(response):
    return json.loads(response.body).get("error")


def test_the_message_and_signature_match_the_typescript_sdk():
    # streamAuthMessage(8453, COMPUTE_PAYMENT, 1n, 1800000000n), signed by Anvil account 0 with
    # viem's signMessage.
    assert (
        stream_auth_message(8453, COMPUTE_PAYMENT.lower(), 1, NOW)
        == "ARL compute stream 8453:0x1bFE932896fdd32175836a7364dcaf53d49EE464:1 at 1800000000"
    )
    assert headers()[STREAM_SIGNATURE_HEADER] == f"{NOW}:{VIEM_SIGNATURE}"


def test_no_stream_named_answers_402_with_the_terms():
    r = Offline().handle({}, lambda s: "never")
    assert r.status == 402
    accepts = json.loads(r.body)["accepts"][0]
    assert accepts["scheme"] == "arl-stream"
    assert accepts["payTo"].lower() == PROVIDER.lower()
    assert accepts["extra"] == {
        "contract": COMPUTE_PAYMENT,
        "ratePerSecond": str(RATE),
        "minSecondsLeft": "1",
    }


def test_serves_the_sender_of_a_live_stream():
    seen = []
    r = Offline().handle(headers(), lambda s: seen.append(s) or {"completion": "ok"})
    assert r.status == 200 and json.loads(r.body) == {"completion": "ok"}
    assert seen[0].seconds_left == 500


def test_header_names_are_case_insensitive():
    lowered = {k.lower(): v for k, v in headers().items()}
    assert Offline().handle(lowered, lambda s: "ok").status == 200


def test_refuses_someone_elses_signature():
    r = Offline().handle(headers(key=STRANGER_KEY), lambda s: "never")
    assert r.status == 402 and reason(r) == "the signature is not the stream sender's"


def test_refuses_a_signature_for_another_stream_or_an_old_one():
    reused = {**headers(), STREAM_SIGNATURE_HEADER: headers(stream_id=2)[STREAM_SIGNATURE_HEADER]}
    assert reason(Offline().handle(reused, lambda s: "x")) == "the signature is not the stream sender's"
    old = Offline().handle(headers(at=NOW - 301), lambda s: "x")
    assert reason(old) == "the signature is too old"


@pytest.mark.parametrize(
    "changes, expected",
    [
        ({"provider": SENDER}, "the stream pays another provider"),
        ({"rate_per_second": RATE - 1}, "the stream's rate is too low"),
        ({"live": False, "seconds_left": 0}, "the stream has ended"),
        ({"seconds_left": 0}, "the stream is about to end"),
    ],
)
def test_refuses_a_stream_that_does_not_pay_this_service(changes, expected):
    r = Offline(stream=state(**changes)).handle(headers(), lambda s: "never")
    assert r.status == 402 and reason(r) == expected


def test_refuses_another_chain_a_missing_stream_and_malformed_headers():
    elsewhere = Offline().handle(headers(chain_id=84532), lambda s: "x")
    assert reason(elsewhere) == "the stream is on another chain or contract"
    assert reason(Offline(missing=True).handle(headers(), lambda s: "x")) == "no such stream"
    assert Offline().handle({STREAM_HEADER: "1"}, lambda s: "x").status == 400
    assert Offline().handle({STREAM_HEADER: headers()[STREAM_HEADER]}, lambda s: "x").status == 400


def test_opening_a_stream_needs_a_key_and_sane_terms():
    with pytest.raises(ArlError):
        ComputeStreams().open(provider=PROVIDER, rate_per_second=RATE, max_seconds=60)
    with pytest.raises(ArlError):
        ServeOnStream(provider=PROVIDER, rate_per_second=0)

