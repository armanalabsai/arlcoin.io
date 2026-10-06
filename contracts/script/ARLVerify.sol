// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLTimelock} from "../src/ARLTimelock.sol";
import {ARLToken} from "../src/ARLToken.sol";
import {ARLVestingWallet} from "../src/ARLVestingWallet.sol";
import {ARLDeployPlan, Allocations, Plan, VestingPlan} from "./ARLDeployPlan.sol";
import {Deployment} from "./ARLDeployer.sol";

/// @title Post-deployment verification
/// @notice Read-only. Compares on-chain state with the plan and reverts with the name of the
/// first check that fails. Must run immediately after deployment, before any token moves:
/// it asserts the exact genesis distribution.
library ARLVerify {
    error VerifyFailed(string check);
    error VerifyUintMismatch(string check, uint256 expected, uint256 actual);
    error VerifyAddressMismatch(string check, address expected, address actual);

    function verify(Plan memory p, Deployment memory d) internal view {
        _chainAndCode(p, d);
        _token(p, d);
        _distribution(p, d);
        _vesting("investors", p.investors, d.investorsVesting, d);
        _vesting("strategic partnerships", p.strategicPartnerships, d.partnershipsVesting, d);
        _timelock(p, d);
    }

    // ------------------------------------------------------------------ chain and code

    function _chainAndCode(Plan memory p, Deployment memory d) private view {
        _eq("chain id", p.chainId, block.chainid);
        _hasCode("token", address(d.token));
        _hasCode("investors vesting wallet", address(d.investorsVesting));
        _hasCode("strategic partnerships vesting wallet", address(d.partnershipsVesting));
        _hasCode("treasury timelock", address(d.timelock));
        if (p.requireRecipientCode) {
            (string[12] memory field, address[12] memory account) = ARLDeployPlan.safeRoles(p);
            for (uint256 i = 0; i < 12; i++) {
                _hasCode(field[i], account[i]);
            }
            // Every Safe role is a genuine Safe v1.5.0 proxy of an allowed singleton.
            if (p.safeSingletons.length == 0) revert VerifyFailed("safe singletons listed");
            for (uint256 i = 0; i < p.safeSingletons.length; i++) {
                if (!ARLDeployPlan.singletonAllowed(
                        p.chainId,
                        p.safeSingletons[i],
                        ARLDeployPlan.SAFE_SINGLETON_V150_CODEHASH,
                        ARLDeployPlan.SAFE_L2_SINGLETON_V150_CODEHASH
                    )) {
                    // forge-lint: disable-next-line(require-revert-in-loop)
                    revert VerifyAddressMismatch(
                        "canonical safe singleton",
                        ARLDeployPlan.SAFE_SINGLETON_V150,
                        p.safeSingletons[i]
                    );
                }
            }
            for (uint256 i = 0; i < 12; i++) {
                if (!ARLDeployPlan.isSafeProxy(
                        account[i], p.safeSingletons, ARLDeployPlan.SAFE_PROXY_V150_CODEHASH
                    )) {
                    // forge-lint: disable-next-line(require-revert-in-loop)
                    revert VerifyFailed(string.concat(field[i], " is a Safe v1.5.0 proxy"));
                }
            }
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

    /// @dev Every allocation has its own holder. Checks that the eleven holders are distinct,
    /// that each holds exactly its planned amount, and that together they hold the whole supply,
    /// so no allocation can sit at an unexpected address. The Founder holder is a plan
    /// recipient, never a vesting wallet deployed here, and no founder schedule exists.
    function _distribution(Plan memory p, Deployment memory d) private view {
        Allocations memory a = p.allocations;
        address[11] memory holder = [
            p.recipients.publicLaunch,
            p.recipients.communityStaking,
            p.recipients.ecosystemGrowth,
            address(d.partnershipsVesting),
            p.recipients.liquidity,
            p.recipients.founder,
            address(d.investorsVesting),
            address(d.timelock),
            p.recipients.team,
            p.recipients.earlyUsers,
            p.recipients.grantsBugBounty
        ];
        uint256[11] memory amount = [
            a.publicLaunch,
            a.communityStaking,
            a.ecosystemGrowth,
            a.strategicPartnerships,
            a.liquidity,
            a.founder,
            a.investors,
            a.treasury,
            a.team,
            a.earlyUsers,
            a.grantsBugBounty
        ];

        uint256 accounted = 0;
        for (uint256 i = 0; i < 11; i++) {
            for (uint256 j = i + 1; j < 11; j++) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                if (holder[i] == holder[j]) revert VerifyFailed("allocation holders are distinct");
            }
            _eq("allocation balance", amount[i], d.token.balanceOf(holder[i]));
            accounted += amount[i];
        }
        _eq("supply held by planned recipients", d.token.totalSupply(), accounted);
        _eq("deployer balance", 0, d.token.balanceOf(d.deployer));

        // Stated against the contract constants as well, so a plan that agreed with a changed
        // allocation table could not pass.
        _eq("founder balance", ARLAllocation.FOUNDER, d.token.balanceOf(holder[5]));
        _eq("investors vesting balance", ARLAllocation.INVESTORS, d.token.balanceOf(holder[6]));
        _eq(
            "strategic partnerships vesting balance",
            ARLAllocation.STRATEGIC_PARTNERSHIPS,
            d.token.balanceOf(holder[3])
        );
        _eq("treasury balance", ARLAllocation.TREASURY, d.token.balanceOf(holder[7]));
    }

    // ------------------------------------------------------------------ vesting

    function _vesting(
        string memory name,
        VestingPlan memory v,
        ARLVestingWallet w,
        Deployment memory d
    ) private view {
        _addr(string.concat(name, " beneficiary"), v.beneficiary, w.owner());
        _eq(string.concat(name, " cliff start"), v.cliffStart, w.cliffStart());
        _eq(string.concat(name, " cliff end"), v.cliffEnd, w.cliffEnd());
        _eq(string.concat(name, " vesting end"), v.vestingEnd, w.vestingEnd());
        _eq(string.concat(name, " linear duration"), v.vestingEnd - v.cliffEnd, w.duration());
        _eq(string.concat(name, " released"), 0, w.released(address(d.token)));
        // The planned schedule itself must have the approved 12 + 36 calendar-month durations.
        ARLDeployPlan.validateSchedule(name, v);
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

        // The guardian can only cancel pending operations.
        if (p.treasuryGuardian == p.treasurySafe) revert VerifyFailed("guardian is independent");
        _role(tl, "guardian is canceller", canceller, p.treasuryGuardian, true);
        _role(tl, "guardian is not proposer", proposer, p.treasuryGuardian, false);
        _role(tl, "guardian is not executor", executor, p.treasuryGuardian, false);
        _role(tl, "guardian is not admin", admin, p.treasuryGuardian, false);

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
