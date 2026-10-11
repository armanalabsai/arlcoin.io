// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";

import {ARLAnonymousSignal, IARLSignalVerifier} from "../src/ARLAnonymousSignal.sol";
import {HonkVerifier} from "../zk/ARLSemaphoreVerifier.sol";

/// @title Base Sepolia: the anonymous-signal verifier and contract
/// @notice Base Sepolia (84532) only. Deploys the generated verifier (forge links its libraries)
/// and `ARLAnonymousSignal`. The contract has no owner; each group's admin is the account that
/// creates it. Optional `ARL_SIGNAL_OUT` (default `deploy/deployments/84532-signal.json`).
///   FOUNDRY_PROFILE=zk forge script zk-script/DeploySepoliaSignal.s.sol:DeploySepoliaSignal \
///     --rpc-url https://sepolia.base.org --broadcast --account <keystore> --slow
contract DeploySepoliaSignal is Script {
    error SepoliaOnly(uint256 chainId);

    function run() external returns (HonkVerifier verifier, ARLAnonymousSignal signal) {
        if (block.chainid != 84_532) revert SepoliaOnly(block.chainid);
        vm.startBroadcast();
        verifier = new HonkVerifier();
        signal = new ARLAnonymousSignal(IARLSignalVerifier(address(verifier)));
        vm.stopBroadcast();
        vm.createDir("deploy/deployments", true);
        vm.writeJson(
            string.concat(
                '{"chainId":84532,"verifier":"',
                vm.toString(address(verifier)),
                '","signal":"',
                vm.toString(address(signal)),
                '"}'
            ),
            vm.envOr("ARL_SIGNAL_OUT", string("deploy/deployments/84532-signal.json"))
        );
    }
}
