"""arl-proof/1 hashing in Python, identical to @arl/protocol (spec/arl-proof/v0.1.0)."""

from __future__ import annotations

from web3 import Web3

from .task import CanonicalError, canonicalize

PROOF_VERSION = "arl-proof/1"


def _keccak(document: dict) -> str:
    return "0x" + Web3.keccak(text=canonicalize(document)).hex().removeprefix("0x")


def proof_hash(proof: dict) -> str:
    """keccak256 of the canonical proof, as 0x-prefixed lowercase hex."""
    if not isinstance(proof, dict) or proof.get("version") != PROOF_VERSION:
        raise CanonicalError(f"version must be {PROOF_VERSION}")
    return _keccak(proof)


def submitted_deliverable(proof: dict) -> str:
    """The bytes32 for ARLJobs.submit: the result manifest hash (reexec) or the proof hash."""
    manifest = proof.get("result_manifest")
    return _keccak(manifest) if manifest is not None else proof_hash(proof)
