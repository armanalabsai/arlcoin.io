"""arl-proof/1: the Python hashes equal the TypeScript reference on every vector."""

import json
from pathlib import Path

import pytest

from arl_protocol.proof import proof_hash, submitted_deliverable

VECTORS = Path(__file__).resolve().parents[3] / "spec" / "arl-proof" / "v0.1.0" / "vectors.json"


@pytest.mark.parametrize(
    "vector", json.loads(VECTORS.read_text(encoding="utf-8"))["valid"], ids=lambda v: v["name"]
)
def test_proof_hashes_match_the_reference(vector):
    assert proof_hash(vector["proof"]) == vector["proofHash"]
    assert submitted_deliverable(vector["proof"]) == vector["submittedDeliverable"]
