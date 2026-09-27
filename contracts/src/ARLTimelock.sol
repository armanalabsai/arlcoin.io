// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title ARL treasury timelock
/// @notice OpenZeppelin `TimelockController` that holds the treasury allocation. The treasury
/// Safe (3-of-5) is the proposer, canceller and executor; every operation waits at least
/// 48 hours between scheduling and execution. An independent guardian Safe holds only
/// `CANCELLER_ROLE`, so it can stop a pending operation but never propose, execute or move funds.
///
/// @dev ARL-specific changes to the OpenZeppelin contract:
/// - No external admin. The admin argument is fixed to `address(0)`, so only the timelock itself
///   holds `DEFAULT_ADMIN_ROLE`, and any role change must pass the delay.
/// - A 48-hour floor. `TimelockController.updateDelay` accepts any value, so a scheduled
///   operation could otherwise lower the delay to zero. Here the floor applies to the
///   constructor and to every later update.
/// - No zero-address role holders. `TimelockController` accepts `address(0)` in the role lists,
///   and an `address(0)` executor opens execution to everyone; here the constructor rejects it.
/// - An independent canceller. The guardian is granted `CANCELLER_ROLE` in the constructor and
///   must not also be a proposer or executor. It has no sunset.
contract ARLTimelock is TimelockController {
    /// @notice Minimum delay required by the ARL treasury policy.
    uint256 public constant MIN_DELAY_FLOOR = 48 hours;

    error ARLTimelockDelayBelowFloor(uint256 delay, uint256 floor);
    error ARLTimelockNoProposers();
    error ARLTimelockNoExecutors();
    error ARLTimelockZeroAddress();
    error ARLTimelockGuardianNotIndependent(address guardian);

    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address guardian
    ) TimelockController(_checkedDelay(minDelay), proposers, executors, address(0)) {
        if (proposers.length == 0) revert ARLTimelockNoProposers();
        if (executors.length == 0) revert ARLTimelockNoExecutors();
        if (guardian == address(0)) revert ARLTimelockZeroAddress();
        _checkRoleList(proposers, guardian);
        _checkRoleList(executors, guardian);
        _grantRole(CANCELLER_ROLE, guardian);
    }

    /// @inheritdoc TimelockController
    function updateDelay(uint256 newDelay) public override {
        super.updateDelay(_checkedDelay(newDelay));
    }

    function _checkRoleList(address[] memory accounts, address guardian) private pure {
        // Failing on the first bad entry is the intent: the whole deployment must revert.
        for (uint256 i = 0; i < accounts.length; ++i) {
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (accounts[i] == address(0)) revert ARLTimelockZeroAddress();
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (accounts[i] == guardian) revert ARLTimelockGuardianNotIndependent(guardian);
        }
    }

    function _checkedDelay(uint256 delay) private pure returns (uint256) {
        if (delay < MIN_DELAY_FLOOR) revert ARLTimelockDelayBelowFloor(delay, MIN_DELAY_FLOOR);
        return delay;
    }
}
