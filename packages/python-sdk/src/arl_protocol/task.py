"""arl-task/1 hashing in Python, identical to @arl/protocol (spec/arl-task/v0.1.0).

The task hash is keccak256 over canonical JSON: object keys sorted, no whitespace, strings
escaped as JSON.stringify does, integers only. Floats are refused so number formatting cannot
differ between implementations.
"""

from __future__ import annotations

import json
from typing import Any

from web3 import Web3

TASK_VERSION = "arl-task/1"


class CanonicalError(ValueError):
    """A value that has no canonical JSON form."""


def _canonical(value: Any) -> str:
    if value is None or isinstance(value, bool):
        return json.dumps(value)
    if isinstance(value, int):
        if abs(value) > 2**53 - 1:
            raise CanonicalError(f"not a safe integer: {value}")
        return str(value)
    if isinstance(value, float):
        raise CanonicalError(f"floats have no canonical form: {value}")
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(_canonical(v) for v in value) + "]"
    if isinstance(value, dict):
        for k in value:
            if not isinstance(k, str) or not k.isascii():
                raise CanonicalError("object keys must be ASCII strings")
        items = sorted(value.items(), key=lambda kv: kv[0])
        return (
            "{"
            + ",".join(json.dumps(k) + ":" + _canonical(v) for k, v in items)
            + "}"
        )
    raise CanonicalError(f"cannot canonicalize a {type(value).__name__}")


def canonicalize(value: Any) -> str:
    """The canonical JSON text of a document."""
    return _canonical(value)


def task_hash(task: dict) -> str:
    """keccak256 of the canonical task, as 0x-prefixed lowercase hex."""
    if not isinstance(task, dict) or task.get("version") != TASK_VERSION:
        raise CanonicalError(f"version must be {TASK_VERSION}")
    return "0x" + Web3.keccak(text=canonicalize(task)).hex().removeprefix("0x")
