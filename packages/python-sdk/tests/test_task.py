"""arl-task/1: the Python hash equals the TypeScript reference on every vector."""

import json
from pathlib import Path

import pytest

from arl_protocol.task import CanonicalError, canonicalize, task_hash

VECTORS = Path(__file__).resolve().parents[3] / "spec" / "arl-task" / "v0.1.0" / "vectors.json"


def load():
    return json.loads(VECTORS.read_text(encoding="utf-8"))


@pytest.mark.parametrize("vector", load()["valid"], ids=lambda v: v["name"])
def test_task_hash_matches_the_reference(vector):
    assert task_hash(vector["task"]) == vector["taskHash"]


def test_canonical_form():
    assert canonicalize({"b": 1, "a": [True, None, "ü\n"]}) == '{"a":[true,null,"ü\\n"],"b":1}'


def test_refuses_floats_and_wrong_versions():
    with pytest.raises(CanonicalError):
        canonicalize({"x": 1.5})
    with pytest.raises(CanonicalError):
        task_hash({"version": "arl-task/0"})
