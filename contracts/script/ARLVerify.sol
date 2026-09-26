// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLTimelock} from "../src/ARLTimelock.sol";
import {ARLToken} from "../src/ARLToken.sol";
import {ARLVestingWallet} from "../src/ARLVestingWallet.sol";
import {Allocations, Plan} from "./ARLDeployPlan.sol";
import {Deployment} from "./ARLDeployer.sol";

/// @title Post-deployment verification
/// @notice Read-only. Compares on-chain state with the plan and reverts with the name of the
/// first check that fails. Must run immediately after deployment, before any token moves:
/// it asserts the exact genesis distribution.
library ARLVerify {
    /// @dev The approved Ecosystem Reserve duration, stated independently of ARLAllocation so a
    /// change to the constant cannot pass verification.
    uint64 internal constant APPROVED_RESERVE_DURATION = 1830 days;

    error VerifyFailed(string check);
    error VerifyUintMismatch(string check, uint256 expected, uint256 actual);
    error VerifyAddressMismatch(string check, address expected, address actual);

    function verify(Plan memory p, Deployment memory d) internal view {
        _chainAndCode(p, d);
        _token(p, d);
        _distribution(p, d);
        _vesting(p, d);
        _timelock(p, d);
    }

    // ------------------------------------------------------------------ chain and code

    function _chainAndCode(Plan memory p, Deployment memory d) private view {
        _eq("chain id", p.chainId, block.chainid);
        _hasCode("token", address(d.token));
        _hasCode("founder vesting wallet", address(d.founderVesting));
        _hasCode("ecosystem reserve vesting wallet", address(d.reserveVesting));
        _hasCode("treasury timelock", address(d.timelock));
        if (p.requireRecipientCode) {
            _hasCode("treasury safe", p.treasurySafe);
            _hasCode("ecosystem reserve beneficiary", p.reserveBeneficiary);
            _hasCode("community staking recipient", p.recipients.communityStaking);
            _hasCode("liquidity recipient", p.recipients.liquidity);
            _hasCode("strategic partnerships recipient", p.recipients.strategicPartnerships);
            _hasCode("public launch recipient", p.recipients.publicLaunch);
            _hasCode("grants recipient", p.recipients.grantsBugBounty);
            _hasCode("team pool recipient", p.recipients.team);
            _hasCode("early user rewards recipient", p.recipients.earlyUserRewards);
        }
    }

    // ------------------------------------------------------------------ token

    function _token(Plan memory p, Deployment memory d) private view {
        ARLToken t = d.token;
        _eq("total supply", 21_000_000e18, t.totalSupply());
        _eq("MAX_SUPPLY", 21_000_000e18, t.MAX_SUPPLY());
        _eq("plan max supply", 21_000_000e18, p.maxSupply);
        _eq("decimals", 18, t.decimals());
        if (keccak256(bytes(t.name())) != keccak256("ARL")) revert VerifyFailed("token name");
        if (keccak256(bytes(t.symbol())) != keccak256("ARL")) revert VerifyFailed("token symbol");
    }

    // ------------------------------------------------------------------ distribution

    /// @dev Aggregates planned amounts per holder (one address may hold several allocations),
    /// checks every holder's balance, and checks the holders account for the whole supply, so
    /// no allocation can sit at an unexpected address.
    function _distribution(Plan memory p, Deployment memory d) private view {
        Allocations memory a = p.allocations;
        address[10] memory holder = [
            address(d.founderVesting),
            address(d.reserveVesting),
            address(d.timelock),
            p.recipients.communityStaking,
            p.recipients.liquidity,
            p.recipients.strategicPartnerships,
            p.recipients.publicLaunch,
            p.recipients.grantsBugBounty,
            p.recipients.team,
            p.recipients.earlyUserRewards
        ];
        uint256[10] memory amount = [
            a.founder,
            a.ecosystemReserve,
            a.treasury,
            a.communityStaking,
            a.liquidity,
            a.strategicPartnerships,
            a.publicLaunch,
            a.grantsBugBounty,
            a.team,
            a.earlyUserRewards
        ];

        uint256 accounted = 0;
        for (uint256 i = 0; i < 10; i++) {
            bool seen = false;
            for (uint256 j = 0; j < i; j++) {
                if (holder[j] == holder[i]) seen = true;
            }
            if (seen) continue;
            uint256 expected = 0;
            for (uint256 j = i; j < 10; j++) {
                if (holder[j] == holder[i]) expected += amount[j];
            }
            _eq("allocation balance", expected, d.token.balanceOf(holder[i]));
            accounted += expected;
        }
        _eq("supply held by planned recipients", d.token.totalSupply(), accounted);

        _eq("deployer balance", 0, d.token.balanceOf(d.deployer));
        _eq("founder vesting balance", ARLAllocation.FOUNDER, d.token.balanceOf(holder[0]));
        _eq(
            "reserve vesting balance", ARLAllocation.ECOSYSTEM_RESERVE, d.token.balanceOf(holder[1])
        );
        _eq("treasury balance", ARLAllocation.TREASURY, d.token.balanceOf(holder[2]));
    }

    // ------------------------------------------------------------------ vesting

    function _vesting(Plan memory p, Deployment memory d) private view {
        ARLVestingWallet f = d.founderVesting;
        _addr("founder beneficiary", p.founderBeneficiary, f.owner());
        _eq("founder cliff start", p.founderCliffStart, f.cliffStart());
        _eq("founder cliff end", p.founderCliffEnd, f.cliffEnd());
        _eq("founder vesting end", p.founderVestingEnd, f.vestingEnd());
        _eq("founder linear duration", p.founderVestingEnd - p.founderCliffEnd, f.duration());
        _eq("founder released", 0, f.released(address(d.token)));

        ARLVestingWallet r = d.reserveVesting;
        _addr("reserve beneficiary", p.reserveBeneficiary, r.owner());
        _eq("reserve start", p.reserveStart, r.start());
        _eq("reserve has no cliff", r.cliffStart(), r.start());
        _eq("reserve duration", APPROVED_RESERVE_DURATION, r.duration());
        _eq("reserve end", uint256(p.reserveStart) + APPROVED_RESERVE_DURATION, r.end());
        _eq("reserve released", 0, r.released(address(d.token)));
    }

    // ------------------------------------------------------------------ timelock

    function _timelock(Plan memory p, Deployment memory d) private view {
        ARLTimelock tl = d.timelock;
        _eq("timelock delay", p.minDelay, tl.getMinDelay());
        if (tl.getMinDelay() < 48 hours) revert VerifyFailed("timelock delay below 48 hours");

        bytes32 admin = tl.DEFAULT_ADMIN_ROLE();
        bytes32 proposer = tl.PROPOSER_ROLE();
        bytes32 canceller = tl.CANCELLER_ROLE();
        bytes32 executor = tl.EXECUTOR_ROLE();

        _role(tl, "treasury safe is proposer", proposer, p.treasurySafe, true);
        _role(tl, "treasury safe is canceller", canceller, p.treasurySafe, true);
        _role(tl, "treasury safe is executor", executor, p.treasurySafe, true);
        _role(tl, "timelock administers itself", admin, address(tl), true);
        _role(tl, "treasury safe is not admin", admin, p.treasurySafe, false);

        // A role granted to address(0) is open to everyone in TimelockController.
        _role(tl, "zero address is not proposer", proposer, address(0), false);
        _role(tl, "zero address is not canceller", canceller, address(0), false);
        _role(tl, "zero address is not executor", executor, address(0), false);
        _role(tl, "zero address is not admin", admin, address(0), false);

        _role(tl, "deployer is not admin", admin, d.deployer, false);
        _role(tl, "deployer is not proposer", proposer, d.deployer, false);
        _role(tl, "deployer is not canceller", canceller, d.deployer, false);
        _role(tl, "deployer is not executor", executor, d.deployer, false);
    }

    // ------------------------------------------------------------------ helpers

    function _role(ARLTimelock tl, string memory check, bytes32 role, address account, bool want)
        private
        view
    {
        if (tl.hasRole(role, account) != want) revert VerifyFailed(check);
    }

    function _eq(string memory check, uint256 expected, uint256 actual) private pure {
        if (expected != actual) revert VerifyUintMismatch(check, expected, actual);
    }

    function _addr(string memory check, address expected, address actual) private pure {
        if (expected != actual) revert VerifyAddressMismatch(check, expected, actual);
    }

    function _hasCode(string memory check, address account) private view {
        if (account.code.length == 0) revert VerifyAddressMismatch(check, account, address(0));
    }
}
