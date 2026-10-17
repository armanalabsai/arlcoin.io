"""Read-only testnet figures for /status: faucet float and the staking reward window.

Both sources are public: the operator status endpoint of the ARL app and a Base Sepolia RPC
call. Nothing is signed or sent. Results are cached so a busy group cannot hammer either source.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

import httpx

log = logging.getLogger("arlbot")

OPERATOR_STATUS_URL = "https://app.arlcoin.io/api/operator/status"
RPC_URL = "https://sepolia.base.org"
STAKING = "0xA78480c1802F5c17B1007c59b7c2CF849549724e"
PERIOD_FINISH_SELECTOR = "0xebe2b12b"  # periodFinish()
CACHE_SECONDS = 60
TIMEOUT_SECONDS = 8.0
WEI = 10**18


@dataclass(frozen=True)
class Status:
    faucet_arl: Optional[int]  # whole ARL held by the operator, None if unknown
    faucet_amount: Optional[int]  # whole ARL per faucet claim
    reward_period_finish: Optional[int]  # unix seconds, 0 if never started, None if unknown


def parse_operator(body: dict) -> tuple[Optional[int], Optional[int]]:
    try:
        return int(body["arl"]) // WEI, int(body["faucetAmount"]) // WEI
    except (KeyError, TypeError, ValueError):
        return None, None


def parse_uint(result: object) -> Optional[int]:
    if not isinstance(result, str) or not result.startswith("0x"):
        return None
    try:
        return int(result, 16)
    except ValueError:
        return None


class StatusReader:
    def __init__(self, client: Optional[httpx.AsyncClient] = None) -> None:
        self._client = client
        self._cached: Optional[tuple[float, Status]] = None

    async def read(self) -> Status:
        if self._cached and time.monotonic() - self._cached[0] < CACHE_SECONDS:
            return self._cached[1]
        client = self._client or httpx.AsyncClient(timeout=TIMEOUT_SECONDS)
        try:
            faucet, amount = await self._operator(client)
            finish = await self._period_finish(client)
        finally:
            if self._client is None:
                await client.aclose()
        status = Status(faucet, amount, finish)
        self._cached = (time.monotonic(), status)
        return status

    async def _operator(self, client: httpx.AsyncClient) -> tuple[Optional[int], Optional[int]]:
        try:
            res = await client.get(OPERATOR_STATUS_URL)
            res.raise_for_status()
            return parse_operator(res.json())
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("operator status unavailable: %s", type(exc).__name__)
            return None, None

    async def _period_finish(self, client: httpx.AsyncClient) -> Optional[int]:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_call",
            "params": [{"to": STAKING, "data": PERIOD_FINISH_SELECTOR}, "latest"],
        }
        try:
            res = await client.post(RPC_URL, json=payload)
            res.raise_for_status()
            return parse_uint(res.json().get("result"))
        except (httpx.HTTPError, ValueError, AttributeError) as exc:
            log.warning("staking read unavailable: %s", type(exc).__name__)
            return None
