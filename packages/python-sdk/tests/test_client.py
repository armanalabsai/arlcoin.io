"""Offline checks: amounts, hashes, the ABI and the deployed addresses. No network."""

from decimal import Decimal

import pytest
from web3 import Web3

from arl_protocol import ESCROWS, STATUS, Arl, ArlError
from arl_protocol.client import JOBS_ABI, to_bytes32, to_units

# A throwaway key used only to build the client offline; it holds nothing.
TEST_KEY = "0x" + "11" * 32


def test_amounts_in_token_units():
    assert to_units("10", 18) == 10 * 10**18
    assert to_units("0.5", 6) == 500_000
    assert to_units(Decimal("1.000001"), 6) == 1_000_001
    with pytest.raises(ArlError):
        to_units("0", 18)
    with pytest.raises(ArlError):
        to_units("0.0000001", 6)


def test_deliverables_become_hashes():
    assert to_bytes32("https://example.com/result") == Web3.keccak(text="https://example.com/result")
    digest = "0x" + "ab" * 32
    assert to_bytes32(digest) == bytes.fromhex("ab" * 32)
    assert to_bytes32(b"\x01" * 32) == b"\x01" * 32
    with pytest.raises(ArlError):
        to_bytes32("  ")


def test_abi_matches_the_escrow_selectors():
    w3 = Web3()
    jobs = w3.eth.contract(address=ESCROWS["ARL"], abi=JOBS_ABI)
    selectors = {
        "createJob": "createJob(address,address,uint256,string,address)",
        "setBudget": "setBudget(uint256,uint256,bytes)",
        "fund": "fund(uint256,uint256,bytes)",
        "submit": "submit(uint256,bytes32,bytes)",
        "complete": "complete(uint256,bytes32,bytes)",
        "reject": "reject(uint256,bytes32,bytes)",
        "claimRefund": "claimRefund(uint256)",
        "getJob": "getJob(uint256)",
    }
    for name, signature in selectors.items():
        fn = jobs.get_function_by_name(name)
        assert fn.signature == signature


def test_addresses_and_statuses():
    assert set(ESCROWS) == {"ARL", "USDC"}
    for address in ESCROWS.values():
        assert Web3.is_checksum_address(address)
    assert STATUS[3] == "Completed"


def test_client_rejects_unknown_tokens():
    with pytest.raises(ArlError):
        Arl(private_key=TEST_KEY, token="DAI")
    arl = Arl(private_key=TEST_KEY)
    assert Web3.is_checksum_address(arl.address)
