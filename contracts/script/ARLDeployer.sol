// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ARLTimelock} from "../src/ARLTimelock.sol";
import {ARLToken} from "../src/ARLToken.sol";
import {ARLVestingWallet} from "../src/ARLVestingWallet.sol";
import {Plan, VestingPlan} from "./ARLDeployPlan.sol";

/// @notice Addresses produced by one deployment.
struct Deployment {
    address deployer;
    ARLToken token;
    ARLVestingWallet founderVesting;
    ARLVestingWallet investorsVesting;
    ARLVestingWallet partnershipsVesting;
    ARLTimelock timelock;
}

/// @title ARL system deployment
/// @notice Deploys the complete system from a validated plan, in this order: founder,
/// investors and strategic partnership vesting wallets, treasury timelock, token. The token
/// mints every allocation in its constructor, so no transfer happens after deployment.
/// @dev Callers must run `ARLDeployPlan.validate` first and `ARLVerify.verify` afterwards.
library ARLDeployer {
    function deploy(Plan memory p, address deployer) internal returns (Deployment memory d) {
        d.deployer = deployer;

        d.founderVesting = _vesting(p.founder);
        d.investorsVesting = _vesting(p.investors);
        d.partnershipsVesting = _vesting(p.strategicPartnerships);

        address[] memory safe = new address[](1);
        safe[0] = p.treasurySafe;
        d.timelock = new ARLTimelock(p.minDelay, safe, safe, p.treasuryGuardian);

        d.token = new ARLToken(
            ARLToken.Recipients({
                publicLaunch: p.recipients.publicLaunch,
                communityStaking: p.recipients.communityStaking,
                ecosystemGrowth: p.recipients.ecosystemGrowth,
                strategicPartnerships: address(d.partnershipsVesting),
                liquidity: p.recipients.liquidity,
                founder: address(d.founderVesting),
                investors: address(d.investorsVesting),
                treasury: address(d.timelock),
                team: p.recipients.team,
                earlyUsers: p.recipients.earlyUsers,
                grantsBugBounty: p.recipients.grantsBugBounty
            })
        );
    }

    function _vesting(VestingPlan memory v) private returns (ARLVestingWallet) {
        return new ARLVestingWallet(v.beneficiary, v.cliffStart, v.cliffEnd, v.vestingEnd);
    }
}
