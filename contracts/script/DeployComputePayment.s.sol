// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ComputePayment} from "../src/ComputePayment.sol";

/// @title Deploys ComputePayment against an already deployed ARL token
/// @notice Local Anvil (31337) and Base Sepolia (84532) only; Base Mainnet and every other chain
/// are refused. Before deploying, the token must be ARL: code at the address, symbol "ARL",
/// 18 decimals and a total supply of exactly 21,000,000. After deploying, the contract must
/// point at that token and hold no stream. The address is written to
/// deploy/deployments/<chainId>-compute-payment.json.
///
/// Run (the sender is the deployer; ComputePayment has no owner, so the deployer keeps no role):
///   ARL_TOKEN=<ARL address> forge script script/DeployComputePayment.s.sol:DeployComputePayment \
///     --rpc-url <rpc> --broadcast --sender <deployer> [--account <keystore>] [--verify]
contract DeployComputePayment is Script {
    uint256 internal constant LOCAL_CHAIN_ID = 31_337;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    error ComputePaymentChainNotAllowed(uint256 chainId);
    error NotARL(address token);
    error DeploymentCheckFailed();

    function run() external returns (ComputePayment payment) {
        payment = deploy(vm.envAddress("ARL_TOKEN"));
    }

    function deploy(address token) public returns (ComputePayment payment) {
        if (block.chainid != LOCAL_CHAIN_ID && block.chainid != BASE_SEPOLIA_CHAIN_ID) {
            revert ComputePaymentChainNotAllowed(block.chainid);
        }
        _requireARL(token);

        vm.startBroadcast();
        payment = new ComputePayment(IERC20(token));
        vm.stopBroadcast();

        if (address(payment.paymentToken()) != token || payment.streamCounter() != 0) {
            revert DeploymentCheckFailed();
        }

        vm.createDir("deploy/deployments", true);
        string memory json = string.concat(
            '{"chainId":',
            vm.toString(block.chainid),
            ',"blockNumber":',
            vm.toString(block.number),
            ',"paymentToken":"',
            vm.toString(token),
            '","ComputePayment":"',
            vm.toString(address(payment)),
            '"}'
        );
        vm.writeJson(
            json,
            string.concat(
                "deploy/deployments/", vm.toString(block.chainid), "-compute-payment.json"
            )
        );
    }

    function _requireARL(address token) private view {
        if (token.code.length == 0) revert NotARL(token);
        IERC20Metadata t = IERC20Metadata(token);
        if (
            keccak256(bytes(t.symbol())) != keccak256("ARL") || t.decimals() != 18
                || t.totalSupply() != ARLAllocation.MAX_SUPPLY
        ) revert NotARL(token);
    }
}
