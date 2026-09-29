// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLAnonymousSignal} from "../src/ARLAnonymousSignal.sol";
import {DevZk} from "../zk-script/DevZk.s.sol";

/// @dev The app's anonymous-signal fixture: local Anvil only.
contract DevZkTest is Test {
    function test_refusesEveryChainButLocalAnvil() public {
        DevZk script = new DevZk();
        uint256[4] memory chains = [uint256(1), 8453, 84_532, 11_155_111];
        for (uint256 i; i < chains.length; ++i) {
            vm.chainId(chains[i]);
            vm.expectRevert(abi.encodeWithSelector(DevZk.DevZkLocalOnly.selector, chains[i]));
            script.run();
        }
    }

    function test_deploysTheSignalContract() public {
        vm.chainId(31_337);
        ARLAnonymousSignal signal = new DevZk().run();
        assertTrue(address(signal.verifier()).code.length > 0);
        assertEq(signal.groupCount(), 0);
    }
}
