// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLTimelock} from "../src/ARLTimelock.sol";
import {ARLToken} from "../src/ARLToken.sol";
import {ARLVestingWallet} from "../src/ARLVestingWallet.sol";
import {Plan} from "./ARLDeployPlan.sol";

/// @notice Addresses produced by one deployment.
struct Deployment {
    address deployer;
    ARLToken token;
    ARLVestingWallet founderVesting;
    ARLVestingWallet reserveVesting;
    ARLTimelock timelock;
}

/// @title ARL system deployment
/// @notice Deploys the complete Phase 1 system from a validated plan, in this order:
/// founder vesting wallet, Ecosystem Reserve vesting wallet, treasury timelock, token. The token
/// mints every allocation in its constructor, so no transfer happens after deployment.
/// @dev Callers must run `ARLDeployPlan.validate` first and `ARLVerify.verify` afterwards.
library ARLDeployer {
    function deploy(Plan memory p, address deployer) internal returns (Deployment memory d) {
        d.deployer = deployer;

        d.founderVesting = new ARLVestingWallet(
            p.founderBeneficiary, p.founderCliffStart, p.founderCliffEnd, p.founderVestingEnd
        );

        // No cliff: the linear release starts at launch and lasts exactly the approved duration.
        d.reserveVesting = new ARLVestingWallet(
            p.reserveBeneficiary,
            p.reserveStart,
            p.reserveStart,
            p.reserveStart + ARLAllocation.ECOSYSTEM_RESERVE_DURATION
        );

        address[] memory safe = new address[](1);
        safe[0] = p.treasurySafe;
        d.timelock = new ARLTimelock(p.minDelay, safe, safe);

        d.token = new ARLToken(
            ARLToken.Recipients({
                founder: address(d.founderVesting),
                ecosystemReserve: address(d.reserveVesting),
                treasury: address(d.timelock),
                communityStaking: p.recipients.communityStaking,
                liquidity: p.recipients.liquidity,
                strategicPartnerships: p.recipients.strategicPartnerships,
                publicLaunch: p.recipients.publicLaunch,
                grantsBugBounty: p.recipients.grantsBugBounty,
                team: p.recipients.team,
                earlyUserRewards: p.recipients.earlyUserRewards
            })
        );
    }
}
