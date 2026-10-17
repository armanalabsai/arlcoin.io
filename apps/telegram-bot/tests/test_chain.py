from arlbot import chain, texts


def test_parse_operator():
    body = {"arl": str(200_000 * 10**18), "faucetAmount": str(1_000 * 10**18)}
    assert chain.parse_operator(body) == (200_000, 1_000)
    assert chain.parse_operator({}) == (None, None)
    assert chain.parse_operator({"arl": "x", "faucetAmount": "1"}) == (None, None)


def test_parse_uint():
    assert chain.parse_uint("0x" + "0" * 56 + "6afa1f88") == 0x6AFA1F88
    assert chain.parse_uint("0x") is None
    assert chain.parse_uint(None) is None


def test_status_text():
    now = 1_800_000_000
    assert "empty" in texts.status(0, 1_000, now + 10, now)
    assert "not running" in texts.status(5_000, 1_000, now - 1, now)
    assert "unknown" in texts.status(None, None, None, now)


def test_launch_countdown():
    target = 1792713600
    assert "6 days 0 hours to go" in texts.launch(target - 6 * 86400)
    assert "5 hours to go" in texts.launch(target - 5 * 3600)
    assert "was 2026-10-23" in texts.launch(target + 1)
