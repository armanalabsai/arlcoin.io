// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {ComputePayment} from "../../src/ComputePayment.sol";
import {DeployComputePayment} from "../../script/DeployComputePayment.s.sol";
import {ARLTestBase} from "../ARLTestBase.sol";

contract FakeARL is ERC20 {
    constructor(uint256 supply) ERC20("ARL", "ARL") {
        _mint(msg.sender, supply);
    }
}

/// @dev The ComputePayment deployment: allowed chains only, ARL only, and the deployed state.
contract DeployComputePaymentTest is ARLTestBase {
    DeployComputePayment internal script;

    function setUp() public override {
        super.setUp();
        script = new DeployComputePayment();
    }

    function test_refusesBaseMainnetAndOtherChains() public {
        uint256[4] memory chains = [uint256(8453), 1, 10, 11_155_111];
        for (uint256 i; i < chains.length; ++i) {
            vm.chainId(chains[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    DeployComputePayment.ComputePaymentChainNotAllowed.selector, chains[i]
                )
            );
            script.deploy(address(token));
        }
    }

    function test_refusesATokenThatIsNotARL() public {
        vm.chainId(84_532);
        address eoa = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(DeployComputePayment.NotARL.selector, eoa));
        script.deploy(eoa);

        // Right name and symbol, wrong supply.
        FakeARL fake = new FakeARL(1 ether);
        vm.expectRevert(abi.encodeWithSelector(DeployComputePayment.NotARL.selector, fake));
        script.deploy(address(fake));
    }

    function test_deploysOnBaseSepoliaAndLocal() public {
        uint256[2] memory chains = [uint256(84_532), 31_337];
        for (uint256 i; i < chains.length; ++i) {
            vm.chainId(chains[i]);
            ComputePayment payment = script.deploy(address(token));
            assertEq(address(payment.paymentToken()), address(token));
            assertEq(payment.streamCounter(), 0);
            assertEq(payment.MAX_DURATION(), 365 days);
        }
    }

    /// Outside a real broadcast (here, a test; on the command line, a dry run) nothing is
    /// deployed, so no deployment record may be written.
    function test_writesNoRecordWithoutBroadcast() public {
        string memory record = "deploy/deployments/84532-compute-payment.json";
        if (vm.exists(record)) vm.removeFile(record);
        vm.chainId(84_532);
        script.deploy(address(token));
        assertFalse(vm.exists(record));
    }
}
