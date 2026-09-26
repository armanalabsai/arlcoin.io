// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title ARL treasury timelock
/// @notice OpenZeppelin `TimelockController` that holds the treasury allocation. The treasury
/// Safe (3-of-5) is the proposer, canceller and executor; every operation waits at least
/// 48 hours between scheduling and execution.
///
/// @dev ARL-specific changes to the OpenZeppelin contract:
/// - No external admin. The admin argument is fixed to `address(0)`, so only the timelock itself
///   holds `DEFAULT_ADMIN_ROLE`, and any role change must pass the delay.
/// - A 48-hour floor. `TimelockController.updateDelay` accepts any value, so a scheduled
///   operation could otherwise lower the delay to zero. Here the floor applies to the
///   constructor and to every later update.
contract ARLTimelock is TimelockController {
    /// @notice Minimum delay required by the ARL treasury policy.
    uint256 public constant MIN_DELAY_FLOOR = 48 hours;

    error ARLTimelockDelayBelowFloor(uint256 delay, uint256 floor);
    error ARLTimelockNoProposers();
    error ARLTimelockNoExecutors();

    constructor(uint256 minDelay, address[] memory proposers, address[] memory executors)
        TimelockController(_checkedDelay(minDelay), proposers, executors, address(0))
    {
        if (proposers.length == 0) revert ARLTimelockNoProposers();
        if (executors.length == 0) revert ARLTimelockNoExecutors();
    }

    /// @inheritdoc TimelockController
    function updateDelay(uint256 newDelay) public override {
        super.updateDelay(_checkedDelay(newDelay));
    }

    function _checkedDelay(uint256 delay) private pure returns (uint256) {
        if (delay < MIN_DELAY_FLOOR) revert ARLTimelockDelayBelowFloor(delay, MIN_DELAY_FLOOR);
        return delay;
    }
}
