// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";

import {ARLAnonymousSignal, IARLSignalVerifier} from "../src/ARLAnonymousSignal.sol";
import {HonkVerifier} from "../zk/ARLSemaphoreVerifier.sol";

/// @title Local development fixture: the anonymous-signal verifier and contract
/// @notice Local Anvil (31337) only, like DevDapp. Deploys the generated verifier (forge links
/// its libraries) and ARLAnonymousSignal, and writes their addresses. The demo group is created by
/// apps/dapp/scripts/deploy-zk.ts, which computes the members' tree.
///   FOUNDRY_PROFILE=zk forge script zk-script/DevZk.s.sol:DevZk --rpc-url <local> --broadcast \
///     --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
contract DevZk is Script {
    address internal constant DEV_OPERATOR = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    string internal constant OUTPUT = "deploy/deployments/31337-zk.json";

    error DevZkLocalOnly(uint256 chainId);

    function run() external returns (ARLAnonymousSignal signal) {
        if (block.chainid != 31_337) revert DevZkLocalOnly(block.chainid);
        vm.startBroadcast(DEV_OPERATOR);
        HonkVerifier verifier = new HonkVerifier();
        signal = new ARLAnonymousSignal(IARLSignalVerifier(address(verifier)));
        vm.stopBroadcast();
        // A fresh checkout has no deployments directory (it is ignored by git).
        vm.createDir("deploy/deployments", true);
        vm.writeJson(
            string.concat(
                '{"chainId":31337,"verifier":"',
                vm.toString(address(verifier)),
                '","signal":"',
                vm.toString(address(signal)),
                '"}'
            ),
            OUTPUT
        );
    }
}
