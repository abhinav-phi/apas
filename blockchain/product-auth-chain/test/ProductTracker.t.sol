// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ProductTracker} from "../src/ProductTracker.sol";

contract ProductTrackerTest is Test {

    // ── Contracts ──
    ProductTracker public tracker;

    // ── Actors ──
    address public admin;
    address public manufacturer;
    address public supplier;
    address public customer;
    address public attacker;
    address public manufacturerTwo;

    // ── Test Data ──
    bytes32 public productId;
    bytes32 public productHash;
    string  public batchId;

    // ═══════════════════════════════════════════════════════
    //                     SETUP
    // ═══════════════════════════════════════════════════════

    function setUp() public {
        // Create labelled addresses
        admin          = makeAddr("admin");
        manufacturer   = makeAddr("manufacturer");
        supplier       = makeAddr("supplier");
        customer       = makeAddr("customer");
        attacker       = makeAddr("attacker");
        manufacturerTwo = makeAddr("manufacturerTwo");

        // Deploy as admin
        vm.prank(admin);
        tracker = new ProductTracker();

        // Assign roles
        vm.startPrank(admin);
        tracker.assignRole(manufacturer, ProductTracker.Role.Manufacturer);
        tracker.assignRole(manufacturerTwo, ProductTracker.Role.Manufacturer);
        tracker.assignRole(supplier, ProductTracker.Role.Supplier);
        vm.stopPrank();

        // Prepare test product data
        productId   = keccak256(abi.encodePacked("PROD-001"));
        productHash = keccak256(abi.encodePacked("Widget-A", "Batch-2024", uint256(1000)));
        batchId     = "BATCH-2024-001";
    }

    // ═══════════════════════════════════════════════════════
    //            SECTION A:  DEPLOYMENT TESTS
    // ═══════════════════════════════════════════════════════

    function test_DeploymentSetsOwner() public view {
        assertEq(tracker.contractOwner(), admin);
    }

    function test_DeployerIsAdmin() public view {
        assertEq(uint256(tracker.roles(admin)), uint256(ProductTracker.Role.Admin));
    }

    function test_InitialProductCountIsZero() public view {
        assertEq(tracker.totalProducts(), 0);
    }

    // ═══════════════════════════════════════════════════════
    //        SECTION B:  ROLE MANAGEMENT TESTS
    // ═══════════════════════════════════════════════════════

    function test_AssignRoleAsAdmin() public {
        address newUser = makeAddr("newUser");

        vm.prank(admin);
        tracker.assignRole(newUser, ProductTracker.Role.Supplier);

        assertEq(uint256(tracker.roles(newUser)), uint256(ProductTracker.Role.Supplier));
    }

    function test_RevertAssignRoleAsNonAdmin() public {
        vm.prank(manufacturer);
        vm.expectRevert(ProductTracker.Unauthorized.selector);
        tracker.assignRole(customer, ProductTracker.Role.Supplier);
    }

    function test_RevertAssignRoleToZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(ProductTracker.InvalidAddress.selector);
        tracker.assignRole(address(0), ProductTracker.Role.Manufacturer);
    }

    function test_RevertAssignNoneRole() public {
        vm.prank(admin);
        vm.expectRevert(ProductTracker.Unauthorized.selector);
        tracker.assignRole(customer, ProductTracker.Role.None);
    }

    function test_RevokeRole() public {
        vm.prank(admin);
        tracker.revokeRole(manufacturer);

        assertEq(uint256(tracker.roles(manufacturer)), uint256(ProductTracker.Role.None));
    }

    function test_RevertRevokeOwnerRole() public {
        vm.prank(admin);
        vm.expectRevert(ProductTracker.CannotRevokeOwner.selector);
        tracker.revokeRole(admin);
    }

    function test_RevertRevokeNonExistentRole() public {
        vm.prank(admin);
        vm.expectRevert(ProductTracker.NoRoleToRevoke.selector);
        tracker.revokeRole(customer); // customer has no role
    }

    // ═══════════════════════════════════════════════════════
    //       SECTION C:  PRODUCT REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════

    function test_RegisterProduct() public {
        vm.prank(manufacturer);
        tracker.registerProduct(productId, productHash, batchId);

        assertEq(tracker.totalProducts(), 1);
        assertTrue(tracker.productExists(productId));
    }

    function test_RegisterProductEmitsEvent() public {
        vm.prank(manufacturer);
        vm.expectEmit(true, true, true, true);
        emit ProductTracker.ProductRegistered(
            productId, productHash, manufacturer, batchId, block.timestamp
        );
        tracker.registerProduct(productId, productHash, batchId);
    }

    function test_RegisterProductStoresCorrectData() public {
        vm.prank(manufacturer);
        tracker.registerProduct(productId, productHash, batchId);

        (
            bytes32 hash_,
            address mfg,
            address owner_,
            ProductTracker.Status status_,
            string memory batch_,
            uint256 created_,
            ,
            uint256 scans_,
            bool recalled_
        ) = tracker.getProduct(productId);

        assertEq(hash_, productHash);
        assertEq(mfg, manufacturer);
        assertEq(owner_, manufacturer);
        assertEq(uint256(status_), uint256(ProductTracker.Status.Registered));
        assertEq(batch_, batchId);
        assertGt(created_, 0);
        assertEq(scans_, 0);
        assertFalse(recalled_);
    }

    function test_RegisterProductCreatesGenesisEvent() public {
        vm.prank(manufacturer);
        tracker.registerProduct(productId, productHash, batchId);

        assertEq(tracker.getSupplyEventCount(productId), 1);

        ProductTracker.SupplyEvent[] memory h = tracker.getSupplyHistory(productId);
        assertEq(h[0].actor, manufacturer);
        assertEq(uint256(h[0].newStatus), uint256(ProductTracker.Status.Registered));
    }

    function test_RevertRegisterDuplicateProduct() public {
        vm.prank(manufacturer);
        tracker.registerProduct(productId, productHash, batchId);

        vm.prank(manufacturer);
        vm.expectRevert(ProductTracker.ProductAlreadyExists.selector);
        tracker.registerProduct(productId, productHash, batchId);
    }

    function test_RevertRegisterWithZeroHash() public {
        vm.prank(manufacturer);
        vm.expectRevert(ProductTracker.InvalidHash.selector);
        tracker.registerProduct(productId, bytes32(0), batchId);
    }

    function test_RevertRegisterWithEmptyBatch() public {
        vm.prank(manufacturer);
        vm.expectRevert(ProductTracker.EmptyString.selector);
        tracker.registerProduct(productId, productHash, "");
    }

    function test_RevertRegisterByNonManufacturer() public {
        vm.prank(supplier);
        vm.expectRevert(ProductTracker.Unauthorized.selector);
        tracker.registerProduct(productId, productHash, batchId);
    }

    function test_RevertRegisterByAttacker() public {
        vm.prank(attacker);
        vm.expectRevert(ProductTracker.Unauthorized.selector);
        tracker.registerProduct(productId, productHash, batchId);
    }

    function test_RegisterMultipleProducts() public {
        bytes32 id2 = keccak256("PROD-002");
        bytes32 hash2 = keccak256("hash2");

        vm.startPrank(manufacturer);
        tracker.registerProduct(productId, productHash, batchId);
        tracker.registerProduct(id2, hash2, "BATCH-002");
        vm.stopPrank();

        assertEq(tracker.totalProducts(), 2);

        bytes32[] memory ids = tracker.getAllProductIds();
        assertEq(ids.length, 2);
        assertEq(ids[0], productId);
        assertEq(ids[1], id2);
    }

    // ═══════════════════════════════════════════════════════
    //       SECTION D:  SUPPLY CHAIN UPDATE TESTS
    // ═══════════════════════════════════════════════════════

    function _registerDefaultProduct() internal {
        vm.prank(manufacturer);
        tracker.registerProduct(productId, productHash, batchId);
    }

    function test_AddSupplyEvent_InTransit() public {
        _registerDefaultProduct();

        bytes32 evHash = keccak256("event-data-1");

        vm.prank(supplier);
        tracker.addSupplyEvent(
            productId,
            evHash,
            "Mumbai Warehouse",
            ProductTracker.Status.InTransit
        );

        assertEq(
            uint256(tracker.getProductStatus(productId)),
            uint256(ProductTracker.Status.InTransit)
        );
        assertEq(tracker.getSupplyEventCount(productId), 2); // genesis + this
    }

    function test_SupplyEventHashChaining() public {
        _registerDefaultProduct();

        bytes32 genesisHash = tracker.getLatestEventHash(productId);

        bytes32 evHash = keccak256("transit-data");
        vm.prank(supplier);
        tracker.addSupplyEvent(productId, evHash, "Delhi", ProductTracker.Status.InTransit);

        bytes32 newHash = tracker.getLatestEventHash(productId);

        // New hash should incorporate previous hash (hash chain)
        assertTrue(newHash != genesisHash);
        assertTrue(newHash != bytes32(0));
    }

    function test_FullSupplyChainFlow() public {
        _registerDefaultProduct();

        // Step 1: In Transit
        vm.prank(supplier);
        tracker.addSupplyEvent(
            productId,
            keccak256("transit-1"),
            "Mumbai",
            ProductTracker.Status.InTransit
        );

        // Step 2: Another transit leg
        vm.warp(block.timestamp + 1 days);
        vm.prank(supplier);
        tracker.addSupplyEvent(
            productId,
            keccak256("transit-2"),
            "Delhi",
            ProductTracker.Status.InTransit
        );

        // Step 3: Delivered
        vm.warp(block.timestamp + 1 days);
        vm.prank(supplier);
        tracker.addSupplyEvent(
            productId,
            keccak256("delivered"),
            "Retailer Store",
            ProductTracker.Status.Delivered
        );

        // Step 4: Sold
        vm.warp(block.timestamp + 1 hours);
        vm.prank(manufacturer);
        tracker.addSupplyEvent(
            productId,
            keccak256("sold"),
            "Customer",
            ProductTracker.Status.Sold
        );

        assertEq(
            uint256(tracker.getProductStatus(productId)),
            uint256(ProductTracker.Status.Sold)
        );
        assertEq(tracker.getSupplyEventCount(productId), 5); // genesis + 4

        // Verify full history
        ProductTracker.SupplyEvent[] memory history = tracker.getSupplyHistory(productId);
        assertEq(history.length, 5);
        assertEq(uint256(history[0].newStatus), uint256(ProductTracker.Status.Registered));
        assertEq(uint256(history[4].newStatus), uint256(ProductTracker.Status.Sold));
    }

    function test_RevertInvalidStatusTransition() public {
        _registerDefaultProduct();

        // Registered → Sold is invalid (must go through InTransit → Delivered first)
        vm.prank(supplier);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProductTracker.InvalidStatusTransition.selector,
                ProductTracker.Status.Registered,
                ProductTracker.Status.Sold
            )
        );
        tracker.addSupplyEvent(
            productId,
            keccak256("data"),
            "Location",
            ProductTracker.Status.Sold
        );
    }

    function test_RevertSupplyEventOnNonExistentProduct() public {
        bytes32 fakeId = keccak256("FAKE");

        vm.prank(supplier);
        vm.expectRevert(ProductTracker.ProductNotFound.selector);
        tracker.addSupplyEvent(fakeId, keccak256("x"), "Loc", ProductTracker.Status.InTransit);
    }

    function test_RevertSupplyEventByAttacker() public {
        _registerDefaultProduct();

        vm.prank(attacker);
        vm.expectRevert(ProductTracker.Unauthorized.selector);
        tracker.addSupplyEvent(
            productId,
            keccak256("data"),
            "Location",
            ProductTracker.Status.InTransit
        );
    }

    function test_RevertSupplyEventWithEmptyLocation() public {
        _registerDefaultProduct();

        vm.prank(supplier);
        vm.expectRevert(ProductTracker.EmptyString.selector);
        tracker.addSupplyEvent(productId, keccak256("d"), "", ProductTracker.Status.InTransit);
    }

    function test_RevertSupplyEventWithZeroHash() public {
        _registerDefaultProduct();

        vm.prank(supplier);
        vm.expectRevert(ProductTracker.InvalidHash.selector);
        tracker.addSupplyEvent(
            productId, bytes32(0), "Loc", ProductTracker.Status.InTransit
        );
    }

    function test_ExpiryFromAnyState() public {
        _registerDefaultProduct();

        // Directly expire from Registered
        vm.prank(supplier);
        tracker.addSupplyEvent(
            productId,
            keccak256("expired"),
            "Warehouse",
            ProductTracker.Status.Expired
        );

        assertEq(
            uint256(tracker.getProductStatus(productId)),
            uint256(ProductTracker.Status.Expired)
        );
    }

    // ═══════════════════════════════════════════════════════
    //        SECTION E:  OWNERSHIP TRANSFER TESTS
    // ═══════════════════════════════════════════════════════

    function test_TransferOwnership() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        tracker.transferOwnership(productId, supplier);

        (, , address newOwner, , , , , , ) = tracker.getProduct(productId);
        assertEq(newOwner, supplier);
    }

    function test_TransferOwnershipEmitsEvent() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        vm.expectEmit(true, true, true, true);
        emit ProductTracker.OwnershipTransferred(
            productId, manufacturer, supplier, block.timestamp
        );
        tracker.transferOwnership(productId, supplier);
    }

    function test_ChainedOwnershipTransfer() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        tracker.transferOwnership(productId, supplier);

        vm.prank(supplier);
        tracker.transferOwnership(productId, customer);

        (, , address finalOwner, , , , , , ) = tracker.getProduct(productId);
        assertEq(finalOwner, customer);
    }

    function test_RevertTransferByNonOwner() public {
        _registerDefaultProduct();

        vm.prank(supplier); // not owner
        vm.expectRevert(ProductTracker.NotProductOwner.selector);
        tracker.transferOwnership(productId, customer);
    }

    function test_RevertTransferToSelf() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        vm.expectRevert(ProductTracker.CannotTransferToSelf.selector);
        tracker.transferOwnership(productId, manufacturer);
    }

    function test_RevertTransferToZeroAddress() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        vm.expectRevert(ProductTracker.InvalidAddress.selector);
        tracker.transferOwnership(productId, address(0));
    }

    // ═══════════════════════════════════════════════════════
    //          SECTION F:  PRODUCT RECALL TESTS
    // ═══════════════════════════════════════════════════════

    function test_RecallProduct() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        tracker.recallProduct(productId);

        (, , , ProductTracker.Status status_, , , , , bool recalled_) =
            tracker.getProduct(productId);

        assertTrue(recalled_);
        assertEq(uint256(status_), uint256(ProductTracker.Status.Recalled));
    }

    function test_RecallProductEmitsEvent() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        vm.expectEmit(true, true, true, true);
        emit ProductTracker.ProductRecalled(productId, manufacturer, block.timestamp);
        tracker.recallProduct(productId);
    }

    function test_RecallAddsEventToHistory() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        tracker.recallProduct(productId);

        assertEq(tracker.getSupplyEventCount(productId), 2); // genesis + recall
    }

    function test_RevertRecallByNonManufacturer() public {
        _registerDefaultProduct();

        vm.prank(supplier);
        vm.expectRevert(ProductTracker.Unauthorized.selector);
        tracker.recallProduct(productId);
    }

    function test_RevertRecallByDifferentManufacturer() public {
        _registerDefaultProduct(); // registered by `manufacturer`

        vm.prank(manufacturerTwo);
        vm.expectRevert(ProductTracker.NotProductManufacturer.selector);
        tracker.recallProduct(productId);
    }

    function test_RevertDoubleRecall() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        tracker.recallProduct(productId);

        vm.prank(manufacturer);
        vm.expectRevert(ProductTracker.AlreadyRecalled.selector);
        tracker.recallProduct(productId);
    }

    function test_RevertSupplyEventOnRecalledProduct() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        tracker.recallProduct(productId);

        vm.prank(supplier);
        vm.expectRevert(ProductTracker.ProductIsRecalled.selector);
        tracker.addSupplyEvent(
            productId,
            keccak256("data"),
            "Loc",
            ProductTracker.Status.InTransit
        );
    }

    function test_RevertOwnershipTransferOnRecalledProduct() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        tracker.recallProduct(productId);

        vm.prank(manufacturer);
        vm.expectRevert(ProductTracker.ProductIsRecalled.selector);
        tracker.transferOwnership(productId, customer);
    }

    // ═══════════════════════════════════════════════════════
    //    SECTION G:  VERIFICATION & FRAUD DETECTION TESTS
    // ═══════════════════════════════════════════════════════

    function test_VerifyAuthentic() public {
        _registerDefaultProduct();

        vm.prank(customer);
        (bool authentic, bool fraud) = tracker.verifyProduct(productId, productHash);

        assertTrue(authentic);
        assertFalse(fraud);
    }

    function test_VerifyWrongHash() public {
        _registerDefaultProduct();

        bytes32 wrongHash = keccak256("wrong-data");

        vm.prank(customer);
        (bool authentic, ) = tracker.verifyProduct(productId, wrongHash);

        assertFalse(authentic);
    }

    function test_VerifyRecalledProductNotAuthentic() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        tracker.recallProduct(productId);

        vm.prank(customer);
        (bool authentic, ) = tracker.verifyProduct(productId, productHash);

        assertFalse(authentic); // recalled → not authentic even if hash matches
    }

    function test_VerifyIncrementsScanCount() public {
        _registerDefaultProduct();

        vm.prank(customer);
        tracker.verifyProduct(productId, productHash);

        (, , , , , , , uint256 scans, ) = tracker.getProduct(productId);
        assertEq(scans, 1);

        vm.warp(block.timestamp + 60);
        vm.prank(customer);
        tracker.verifyProduct(productId, productHash);

        (, , , , , , , scans, ) = tracker.getProduct(productId);
        assertEq(scans, 2);
    }

    function test_FraudDetection_RapidDuplicateScan() public {
        _registerDefaultProduct();

        // First scan
        vm.prank(customer);
        tracker.verifyProduct(productId, productHash);

        // Second scan within 30 seconds → fraud!
        vm.warp(block.timestamp + 10); // only 10 seconds later
        vm.prank(customer);
        vm.expectEmit(true, true, true, false);
        emit ProductTracker.FraudDetected(
            productId,
            "Rapid duplicate scan detected",
            customer,
            block.timestamp
        );
        (, bool fraudFlag) = tracker.verifyProduct(productId, productHash);

        assertTrue(fraudFlag);
    }

    function test_NoFraudWhenScansAreSpacedOut() public {
        _registerDefaultProduct();

        vm.prank(customer);
        tracker.verifyProduct(productId, productHash);

        vm.warp(block.timestamp + 60); // 60 seconds later — safe
        vm.prank(customer);
        (, bool fraudFlag) = tracker.verifyProduct(productId, productHash);

        assertFalse(fraudFlag);
    }

    function test_ViewOnlyIsAuthentic() public {
        _registerDefaultProduct();

        bool result = tracker.isAuthentic(productId, productHash);
        assertTrue(result);

        // Should not change scan count (view function)
        (, , , , , , , uint256 scans, ) = tracker.getProduct(productId);
        assertEq(scans, 0);
    }

    function test_RevertVerifyNonExistentProduct() public {
        bytes32 fakeId = keccak256("FAKE");

        vm.prank(customer);
        vm.expectRevert(ProductTracker.ProductNotFound.selector);
        tracker.verifyProduct(fakeId, productHash);
    }

    // ═══════════════════════════════════════════════════════
    //          SECTION H:  TRUST SCORE TESTS
    // ═══════════════════════════════════════════════════════

    function test_TrustScoreFullLifecycle() public {
        _registerDefaultProduct();

        // Complete supply chain
        vm.prank(supplier);
        tracker.addSupplyEvent(productId, keccak256("t1"), "Mumbai", ProductTracker.Status.InTransit);

        vm.warp(block.timestamp + 1 days);
        vm.prank(supplier);
        tracker.addSupplyEvent(productId, keccak256("d1"), "Store", ProductTracker.Status.Delivered);

        vm.warp(block.timestamp + 1 hours);
        vm.prank(manufacturer);
        tracker.addSupplyEvent(productId, keccak256("s1"), "Customer", ProductTracker.Status.Sold);

        uint256 score = tracker.getTrustScore(productId);
        assertEq(score, 100); // Perfect lifecycle
    }

    function test_TrustScoreRecalledIsZero() public {
        _registerDefaultProduct();

        vm.prank(manufacturer);
        tracker.recallProduct(productId);

        uint256 score = tracker.getTrustScore(productId);
        assertEq(score, 0);
    }

    function test_TrustScoreDeductsForFewEvents() public {
        _registerDefaultProduct();
        // Only 1 event (genesis) — deduction for short chain
        uint256 score = tracker.getTrustScore(productId);
        assertTrue(score < 100);
    }

    function test_TrustScoreDeductsForHighScanCount() public {
        _registerDefaultProduct();

        // Add supply events to make chain healthy
        vm.prank(supplier);
        tracker.addSupplyEvent(productId, keccak256("t"), "X", ProductTracker.Status.InTransit);

        vm.warp(block.timestamp + 1 days);
        vm.prank(supplier);
        tracker.addSupplyEvent(productId, keccak256("d"), "Y", ProductTracker.Status.Delivered);

        vm.warp(block.timestamp + 1 days);
        vm.prank(manufacturer);
        tracker.addSupplyEvent(productId, keccak256("s"), "Z", ProductTracker.Status.Sold);

        // Simulate 25 scans
        for (uint256 i = 0; i < 25; i++) {
            vm.warp(block.timestamp + 60);
            vm.prank(customer);
            tracker.verifyProduct(productId, productHash);
        }

        uint256 score = tracker.getTrustScore(productId);
        assertTrue(score < 100); // Should be deducted
    }

    // ═══════════════════════════════════════════════════════
    //         SECTION I:  EDGE CASE / INTEGRATION TESTS
    // ═══════════════════════════════════════════════════════

    function test_HashChainIntegrity() public {
        _registerDefaultProduct();

        bytes32 hash1 = tracker.getLatestEventHash(productId);

        vm.prank(supplier);
        tracker.addSupplyEvent(productId, keccak256("e1"), "A", ProductTracker.Status.InTransit);
        bytes32 hash2 = tracker.getLatestEventHash(productId);

        vm.warp(block.timestamp + 1 days);
        vm.prank(supplier);
        tracker.addSupplyEvent(productId, keccak256("e2"), "B", ProductTracker.Status.Delivered);
        bytes32 hash3 = tracker.getLatestEventHash(productId);

        // Each hash must be unique (chained)
        assertTrue(hash1 != hash2);
        assertTrue(hash2 != hash3);
        assertTrue(hash1 != hash3);

        // None should be zero
        assertTrue(hash1 != bytes32(0));
        assertTrue(hash2 != bytes32(0));
        assertTrue(hash3 != bytes32(0));
    }

    function test_MultipleProductsIndependent() public {
        bytes32 id1 = keccak256("P1");
        bytes32 id2 = keccak256("P2");
        bytes32 h1 = keccak256("data1");
        bytes32 h2 = keccak256("data2");

        vm.startPrank(manufacturer);
        tracker.registerProduct(id1, h1, "B1");
        tracker.registerProduct(id2, h2, "B2");
        vm.stopPrank();

        // Recall one, other unaffected
        vm.prank(manufacturer);
        tracker.recallProduct(id1);

        assertTrue(tracker.isAuthentic(id2, h2));
        assertFalse(tracker.isAuthentic(id1, h1));
    }

    function test_FullEndToEndScenario() public {
        console.log("========= FULL E2E TEST =========");

        // 1. Register
        vm.prank(manufacturer);
        tracker.registerProduct(productId, productHash, batchId);
        console.log("Product registered");

        // 2. Transit
        vm.warp(block.timestamp + 1 hours);
        vm.prank(supplier);
        tracker.addSupplyEvent(
            productId, keccak256("transit"), "Mumbai", ProductTracker.Status.InTransit
        );
        console.log("In transit to Mumbai");

        // 3. Deliver
        vm.warp(block.timestamp + 2 days);
        vm.prank(supplier);
        tracker.addSupplyEvent(
            productId, keccak256("deliver"), "Delhi Store", ProductTracker.Status.Delivered
        );
        console.log("Delivered to Delhi");

        // 4. Transfer ownership
        vm.prank(manufacturer);
        tracker.transferOwnership(productId, supplier);
        console.log("Ownership transferred to supplier");

        // 5. Sell
        vm.warp(block.timestamp + 1 hours);
        vm.prank(supplier);
        tracker.addSupplyEvent(
            productId, keccak256("sold"), "Customer", ProductTracker.Status.Sold
        );
        console.log("Product sold");

        // 6. Customer verifies
        vm.warp(block.timestamp + 1 days);
        vm.prank(customer);
        (bool auth, bool fraud) = tracker.verifyProduct(productId, productHash);

        assertTrue(auth);
        assertFalse(fraud);
        console.log("Verification: GENUINE");

        // 7. Check history
        ProductTracker.SupplyEvent[] memory hist = tracker.getSupplyHistory(productId);
        assertEq(hist.length, 4); // genesis + transit + deliver + sold

        // 8. Trust score
        uint256 score = tracker.getTrustScore(productId);
        assertEq(score, 100);
        console.log("Trust Score:", score);

        console.log("========= E2E PASSED =========");
    }

    // ═══════════════════════════════════════════════════════
    //        SECTION J:  FUZZ TESTS
    // ═══════════════════════════════════════════════════════

    function testFuzz_RegisterWithAnyValidHash(bytes32 _hash) public {
        vm.assume(_hash != bytes32(0));
        bytes32 _id = keccak256(abi.encodePacked(_hash, "id"));

        vm.prank(manufacturer);
        tracker.registerProduct(_id, _hash, "FUZZ-BATCH");

        assertTrue(tracker.productExists(_id));
        assertTrue(tracker.isAuthentic(_id, _hash));
    }

    function testFuzz_VerificationAlwaysFailsWithWrongHash(bytes32 _wrongHash) public {
        _registerDefaultProduct();
        vm.assume(_wrongHash != productHash);

        bool result = tracker.isAuthentic(productId, _wrongHash);
        assertFalse(result);
    }

    function testFuzz_CannotRegisterSameIdTwice(bytes32 _hash1, bytes32 _hash2) public {
        vm.assume(_hash1 != bytes32(0));
        vm.assume(_hash2 != bytes32(0));

        vm.prank(manufacturer);
        tracker.registerProduct(productId, _hash1, "B1");

        vm.prank(manufacturer);
        vm.expectRevert(ProductTracker.ProductAlreadyExists.selector);
        tracker.registerProduct(productId, _hash2, "B2");
    }
}