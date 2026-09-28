// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {ARLAnonymousSignal, IARLSignalVerifier} from "../src/ARLAnonymousSignal.sol";
import {HonkVerifier} from "../zk/ARLSemaphoreVerifier.sol";

/// @dev Real proofs from packages/zk (fixture: test/fixtures/zk/signals.json): a group of five
/// development identities; member 2 signals 1 in scope 7 and again in scope 8, member 4
/// signals 2 in scope 7.
contract ARLAnonymousSignalTest is Test {
    using stdJson for string;

    struct Proof {
        uint256 scope;
        uint256 message;
        uint256 root;
        uint256 nullifier;
        bytes proof;
    }

    ARLAnonymousSignal internal signals;
    uint256 internal root;
    Proof[3] internal p;
    address internal admin = makeAddr("admin");

    function setUp() public {
        string memory json = vm.readFile("test/fixtures/zk/signals.json");
        root = vm.parseUint(json.readString(".root"));
        for (uint256 i; i < 3; ++i) {
            string memory k = string.concat(".signals[", vm.toString(i), "]");
            p[i] = Proof({
                scope: vm.parseUint(json.readString(string.concat(k, ".scope"))),
                message: vm.parseUint(json.readString(string.concat(k, ".message"))),
                root: vm.parseUint(json.readString(string.concat(k, ".root"))),
                nullifier: vm.parseUint(json.readString(string.concat(k, ".nullifier"))),
                proof: json.readBytes(string.concat(k, ".proof"))
            });
        }
        signals = new ARLAnonymousSignal(IARLSignalVerifier(address(new HonkVerifier())));
        vm.prank(admin);
        signals.createGroup(root);
    }

    function _signal(Proof memory x) internal {
        signals.signal(0, x.scope, x.message, x.root, x.nullifier, x.proof);
    }

    function test_membersSignalOncePerScope() public {
        vm.expectEmit(address(signals));
        emit ARLAnonymousSignal.Signal(0, p[0].scope, p[0].message, p[0].nullifier, root);
        _signal(p[0]);
        assertTrue(signals.isNullifierUsed(0, p[0].nullifier));

        // Another member in the same scope, and the same member in another scope.
        _signal(p[2]);
        _signal(p[1]);

        // The same member in the same scope again: refused, even from another sender.
        vm.prank(makeAddr("relayer"));
        vm.expectRevert(
            abi.encodeWithSelector(ARLAnonymousSignal.SignalNullifierUsed.selector, p[0].nullifier)
        );
        _signal(p[0]);
    }

    function test_rejectsAChangedMessage() public {
        Proof memory x = p[0];
        x.message = 2;
        vm.expectRevert();
        _signal(x);
    }

    function test_rejectsAChangedScopeOrNullifier() public {
        Proof memory x = p[0];
        x.scope = 8;
        vm.expectRevert();
        _signal(x);
        x = p[0];
        x.nullifier = p[2].nullifier;
        vm.expectRevert();
        _signal(x);
    }

    function test_rejectsAChangedProofByte() public {
        Proof memory x = p[0];
        x.proof[100] = x.proof[100] ^ 0x01;
        vm.expectRevert();
        _signal(x);
    }

    function test_rejectsARootThatIsNotTheGroups() public {
        Proof memory x = p[0];
        x.root = root + 1;
        vm.expectRevert(
            abi.encodeWithSelector(ARLAnonymousSignal.SignalUnknownRoot.selector, root + 1)
        );
        _signal(x);
    }

    function test_replacedRootWorksDuringTheGracePeriodOnly() public {
        vm.prank(admin);
        signals.updateRoot(0, 12_345);
        assertEq(signals.groupRoot(0), 12_345);
        _signal(p[0]);

        vm.warp(block.timestamp + signals.ROOT_GRACE_PERIOD() + 1);
        vm.expectRevert(abi.encodeWithSelector(ARLAnonymousSignal.SignalRootExpired.selector, root));
        _signal(p[2]);
    }

    function test_restoredRootIsCurrentAgain() public {
        vm.startPrank(admin);
        signals.updateRoot(0, 12_345);
        signals.updateRoot(0, root);
        vm.stopPrank();
        vm.warp(block.timestamp + 30 days);
        _signal(p[0]);
    }

    function test_onlyTheAdminManagesTheGroup() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ARLAnonymousSignal.SignalNotAdmin.selector, 0));
        signals.updateRoot(0, 1);
        vm.expectRevert(abi.encodeWithSelector(ARLAnonymousSignal.SignalNotAdmin.selector, 0));
        signals.changeAdmin(0, stranger);
        vm.stopPrank();

        vm.prank(admin);
        signals.changeAdmin(0, address(0));
        assertEq(signals.groupAdmin(0), address(0));
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ARLAnonymousSignal.SignalNotAdmin.selector, 0));
        signals.updateRoot(0, 1);
    }

    function test_rootsMustBeFieldElements() public {
        uint256 field = signals.SNARK_FIELD();
        vm.expectRevert(ARLAnonymousSignal.SignalInvalidRoot.selector);
        signals.createGroup(0);
        vm.expectRevert(ARLAnonymousSignal.SignalInvalidRoot.selector);
        signals.createGroup(field);
        vm.prank(admin);
        vm.expectRevert(ARLAnonymousSignal.SignalInvalidRoot.selector);
        signals.updateRoot(0, root);
    }

    function test_unknownGroup() public {
        vm.expectRevert(abi.encodeWithSelector(ARLAnonymousSignal.SignalNoGroup.selector, 1));
        signals.signal(1, p[0].scope, p[0].message, p[0].root, p[0].nullifier, p[0].proof);
    }

    function test_proofIsGroupBound() public {
        // The same membership root in a second group is a separate nullifier space.
        uint256 g = signals.createGroup(root);
        signals.signal(g, p[0].scope, p[0].message, p[0].root, p[0].nullifier, p[0].proof);
        _signal(p[0]);
    }

    function test_hashToFieldMatchesTheProver() public view {
        assertEq(
            signals.hashToField(1), 0xb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0c
        );
    }

    function test_rejectsZeroVerifier() public {
        vm.expectRevert(ARLAnonymousSignal.SignalZeroAddress.selector);
        new ARLAnonymousSignal(IARLSignalVerifier(address(0)));
    }

    function test_addMembersPublishesCommitmentsAndRoot() public {
        uint256[] memory added = new uint256[](2);
        added[0] = 111;
        added[1] = 222;
        vm.expectEmit(address(signals));
        emit ARLAnonymousSignal.MembersAdded(0, added);
        vm.expectEmit(address(signals));
        emit ARLAnonymousSignal.RootUpdated(0, root, 999);
        vm.prank(admin);
        signals.addMembers(0, added, 999);
        assertEq(signals.groupRoot(0), 999);
        // Proofs against the previous root still work during the grace period.
        _signal(p[0]);
    }

    function test_addMembersChecksCommitmentsAndAdmin() public {
        uint256[] memory bad = new uint256[](1);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(ARLAnonymousSignal.SignalInvalidCommitment.selector, 0)
        );
        signals.addMembers(0, bad, 999);
        bad[0] = 5;
        vm.expectRevert(abi.encodeWithSelector(ARLAnonymousSignal.SignalNotAdmin.selector, 0));
        signals.addMembers(0, bad, 999);
    }

    function test_createGroupWithMembersPublishesThem() public {
        uint256[] memory members = new uint256[](1);
        members[0] = 7;
        vm.expectEmit(address(signals));
        emit ARLAnonymousSignal.GroupCreated(1, address(this), 7);
        vm.expectEmit(address(signals));
        emit ARLAnonymousSignal.MembersAdded(1, members);
        assertEq(signals.createGroupWithMembers(members, 7), 1);
        members[0] = 0;
        vm.expectRevert(
            abi.encodeWithSelector(ARLAnonymousSignal.SignalInvalidCommitment.selector, 0)
        );
        signals.createGroupWithMembers(members, 7);
    }
}
