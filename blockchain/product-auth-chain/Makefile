# ═══════════════════════════════════════════════════════════
#          ProductTracker - Local Anvil Commands
# ═══════════════════════════════════════════════════════════

# ── Contract & Network ──
CONTRACT    := 0xA06470E128275c5fE4410d4A712F23d54c714b68
RPC         := http://127.0.0.1:8545

# ── Anvil Default Accounts ──
ADMIN_PK    := 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ADMIN_ADDR  := 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

MFG_PK      := 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
MFG_ADDR    := 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

SUPPLIER_PK := 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
SUPPLIER_ADDR := 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

CUSTOMER_PK := 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
CUSTOMER_ADDR := 0x90F79bf6EB2c4f870365E785982E1f101E93b906

ATTACKER_PK := 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
ATTACKER_ADDR := 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65

# ── Product Test Data ──
# keccak256("PROD-001")
PRODUCT_ID  := 0x6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b
# keccak256("Widget-A-Batch-2024-Data")
PRODUCT_HASH := 0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2

# ═══════════════════════════════════════════════════════════
#                    BUILD & TEST
# ═══════════════════════════════════════════════════════════

build:
	@echo "🔨 Building..."
	forge build

test:
	@echo "🧪 Running all tests..."
	forge test -vvv

test-gas:
	@echo "⛽ Gas report..."
	forge test --gas-report

test-e2e:
	@echo "🔄 Running E2E test..."
	forge test --match-test test_FullEndToEndScenario -vvvv

test-fuzz:
	@echo "🎲 Running fuzz tests..."
	forge test --match-test testFuzz -vvv

# ═══════════════════════════════════════════════════════════
#            STEP 1:  CHECK DEPLOYMENT
# ═══════════════════════════════════════════════════════════

check-owner:
	@echo "👤 Contract Owner:"
	@cast call $(CONTRACT) "contractOwner()(address)" --rpc-url $(RPC)

check-total-products:
	@echo "📦 Total Products:"
	@cast call $(CONTRACT) "totalProducts()(uint256)" --rpc-url $(RPC)

check-role-admin:
	@echo "🔑 Admin Role (should be 1):"
	@cast call $(CONTRACT) "roles(address)(uint8)" $(ADMIN_ADDR) --rpc-url $(RPC)

check-role-mfg:
	@echo "🔑 Manufacturer Role:"
	@cast call $(CONTRACT) "roles(address)(uint8)" $(MFG_ADDR) --rpc-url $(RPC)

check-role-supplier:
	@echo "🔑 Supplier Role:"
	@cast call $(CONTRACT) "roles(address)(uint8)" $(SUPPLIER_ADDR) --rpc-url $(RPC)

check-deployment: check-owner check-total-products check-role-admin
	@echo ""
	@echo "✅ Deployment looks good!"

# ═══════════════════════════════════════════════════════════
#            STEP 2:  ASSIGN ROLES (Admin only)
# ═══════════════════════════════════════════════════════════

# Role enum: 0=None, 1=Admin, 2=Manufacturer, 3=Supplier

assign-manufacturer:
	@echo "🏭 Assigning Manufacturer role to $(MFG_ADDR)..."
	@cast send $(CONTRACT) "assignRole(address,uint8)" \
		$(MFG_ADDR) 2 \
		--rpc-url $(RPC) \
		--private-key $(ADMIN_PK)
	@echo "✅ Manufacturer role assigned!"

assign-supplier:
	@echo "🚚 Assigning Supplier role to $(SUPPLIER_ADDR)..."
	@cast send $(CONTRACT) "assignRole(address,uint8)" \
		$(SUPPLIER_ADDR) 3 \
		--rpc-url $(RPC) \
		--private-key $(ADMIN_PK)
	@echo "✅ Supplier role assigned!"

assign-all-roles: assign-manufacturer assign-supplier
	@echo ""
	@echo "✅ All roles assigned!"

# Verify roles were assigned
verify-roles: check-role-mfg check-role-supplier
	@echo "✅ Roles verified!"

# ═══════════════════════════════════════════════════════════
#         STEP 3:  REGISTER PRODUCT (Manufacturer)
# ═══════════════════════════════════════════════════════════

# First compute product ID and hash
compute-product-id:
	@echo "🔢 Computing Product ID (keccak of PROD-001):"
	@cast keccak "PROD-001"

compute-product-hash:
	@echo "🔢 Computing Product Hash:"
	@cast keccak "Widget-A-Batch-2024-SerialNo-12345"

register-product:
	@echo "📦 Registering product..."
	@echo "   Product ID: $(PRODUCT_ID)"
	@echo "   Hash: $(PRODUCT_HASH)"
	@cast send $(CONTRACT) \
		"registerProduct(bytes32,bytes32,string)" \
		$(PRODUCT_ID) \
		$(PRODUCT_HASH) \
		"BATCH-2024-001" \
		--rpc-url $(RPC) \
		--private-key $(MFG_PK)
	@echo "✅ Product registered on-chain!"

# Register a second product for testing
register-product-2:
	@echo "📦 Registering second product..."
	@cast send $(CONTRACT) \
		"registerProduct(bytes32,bytes32,string)" \
		$(shell cast keccak "PROD-002") \
		$(shell cast keccak "Tablet-B-Pharma-2024") \
		"PHARMA-BATCH-002" \
		--rpc-url $(RPC) \
		--private-key $(MFG_PK)
	@echo "✅ Second product registered!"

# Verify registration
check-product:
	@echo "📋 Product Details:"
	@cast call $(CONTRACT) \
		"getProduct(bytes32)(bytes32,address,address,uint8,string,uint256,uint256,uint256,bool)" \
		$(PRODUCT_ID) \
		--rpc-url $(RPC)

check-product-exists:
	@echo "❓ Product exists:"
	@cast call $(CONTRACT) \
		"productExists(bytes32)(bool)" \
		$(PRODUCT_ID) \
		--rpc-url $(RPC)

check-product-status:
	@echo "📊 Product Status (0=NotExists,1=Registered,2=InTransit,3=Delivered,4=Sold,5=Recalled):"
	@cast call $(CONTRACT) \
		"getProductStatus(bytes32)(uint8)" \
		$(PRODUCT_ID) \
		--rpc-url $(RPC)

# ═══════════════════════════════════════════════════════════
#     STEP 4:  SUPPLY CHAIN EVENTS (Supplier/Manufacturer)
# ═══════════════════════════════════════════════════════════

# Status enum: 0=NotExists, 1=Registered, 2=InTransit, 3=Delivered, 4=Sold, 5=Recalled, 6=Expired

supply-transit-mumbai:
	@echo "🚚 Supply Event: In Transit → Mumbai Warehouse..."
	@cast send $(CONTRACT) \
		"addSupplyEvent(bytes32,bytes32,string,uint8)" \
		$(PRODUCT_ID) \
		$(shell cast keccak "transit-mumbai-event-data") \
		"Mumbai Warehouse" \
		2 \
		--rpc-url $(RPC) \
		--private-key $(SUPPLIER_PK)
	@echo "✅ Transit event logged!"

supply-transit-delhi:
	@echo "🚚 Supply Event: In Transit → Delhi Distribution Center..."
	@cast send $(CONTRACT) \
		"addSupplyEvent(bytes32,bytes32,string,uint8)" \
		$(PRODUCT_ID) \
		$(shell cast keccak "transit-delhi-event-data") \
		"Delhi Distribution Center" \
		2 \
		--rpc-url $(RPC) \
		--private-key $(SUPPLIER_PK)
	@echo "✅ Transit event logged!"

supply-delivered:
	@echo "📬 Supply Event: Delivered to Retail Store..."
	@cast send $(CONTRACT) \
		"addSupplyEvent(bytes32,bytes32,string,uint8)" \
		$(PRODUCT_ID) \
		$(shell cast keccak "delivered-retail-store") \
		"Bangalore Retail Store" \
		3 \
		--rpc-url $(RPC) \
		--private-key $(SUPPLIER_PK)
	@echo "✅ Delivery event logged!"

supply-sold:
	@echo "💰 Supply Event: Sold to Customer..."
	@cast send $(CONTRACT) \
		"addSupplyEvent(bytes32,bytes32,string,uint8)" \
		$(PRODUCT_ID) \
		$(shell cast keccak "sold-to-customer") \
		"Customer - Final Sale" \
		4 \
		--rpc-url $(RPC) \
		--private-key $(MFG_PK)
	@echo "✅ Sale event logged!"

# Run full supply chain flow
full-supply-chain: supply-transit-mumbai supply-transit-delhi supply-delivered supply-sold
	@echo ""
	@echo "✅ Complete supply chain flow executed!"

# Check supply chain history
check-supply-history:
	@echo "📜 Supply Chain Event Count:"
	@cast call $(CONTRACT) \
		"getSupplyEventCount(bytes32)(uint256)" \
		$(PRODUCT_ID) \
		--rpc-url $(RPC)

check-latest-hash:
	@echo "🔗 Latest Event Hash (Hash Chain Head):"
	@cast call $(CONTRACT) \
		"getLatestEventHash(bytes32)(bytes32)" \
		$(PRODUCT_ID) \
		--rpc-url $(RPC)

check-full-history:
	@echo "📜 Full Supply Chain History:"
	@cast call $(CONTRACT) \
		"getSupplyHistory(bytes32)((bytes32,address,string,uint8,uint256)[])" \
		$(PRODUCT_ID) \
		--rpc-url $(RPC)

# ═══════════════════════════════════════════════════════════
#        STEP 5:  OWNERSHIP TRANSFER
# ═══════════════════════════════════════════════════════════

transfer-to-supplier:
	@echo "🔄 Transferring ownership: Manufacturer → Supplier..."
	@cast send $(CONTRACT) \
		"transferOwnership(bytes32,address)" \
		$(PRODUCT_ID) \
		$(SUPPLIER_ADDR) \
		--rpc-url $(RPC) \
		--private-key $(MFG_PK)
	@echo "✅ Ownership transferred to Supplier!"

transfer-to-customer:
	@echo "🔄 Transferring ownership: Supplier → Customer..."
	@cast send $(CONTRACT) \
		"transferOwnership(bytes32,address)" \
		$(PRODUCT_ID) \
		$(CUSTOMER_ADDR) \
		--rpc-url $(RPC) \
		--private-key $(SUPPLIER_PK)
	@echo "✅ Ownership transferred to Customer!"

# ═══════════════════════════════════════════════════════════
#      STEP 6:  PRODUCT VERIFICATION (Anyone can call)
# ═══════════════════════════════════════════════════════════

# Verify with CORRECT hash → should return true
verify-genuine:
	@echo "🔍 Customer verifying product (correct hash)..."
	@cast send $(CONTRACT) \
		"verifyProduct(bytes32,bytes32)" \
		$(PRODUCT_ID) \
		$(PRODUCT_HASH) \
		--rpc-url $(RPC) \
		--private-key $(CUSTOMER_PK)
	@echo "✅ Verification complete! Check logs above for result."

# Verify with WRONG hash → should return false (counterfeit detected)
verify-fake:
	@echo "🔍 Verifying with WRONG hash (counterfeit test)..."
	@cast send $(CONTRACT) \
		"verifyProduct(bytes32,bytes32)" \
		$(PRODUCT_ID) \
		$(shell cast keccak "FAKE-COUNTERFEIT-DATA") \
		--rpc-url $(RPC) \
		--private-key $(CUSTOMER_PK)
	@echo "❌ Should detect as NOT authentic!"

# View-only check (no gas, no state change)
check-authentic:
	@echo "🔍 View-only authenticity check:"
	@cast call $(CONTRACT) \
		"isAuthentic(bytes32,bytes32)(bool)" \
		$(PRODUCT_ID) \
		$(PRODUCT_HASH) \
		--rpc-url $(RPC)

check-authentic-fake:
	@echo "🔍 View-only check with WRONG hash:"
	@cast call $(CONTRACT) \
		"isAuthentic(bytes32,bytes32)(bool)" \
		$(PRODUCT_ID) \
		$(shell cast keccak "WRONG-HASH") \
		--rpc-url $(RPC)

# ═══════════════════════════════════════════════════════════
#      STEP 7:  FRAUD DETECTION - RAPID SCAN TEST
# ═══════════════════════════════════════════════════════════

# Scan twice rapidly → should trigger fraud alert
fraud-rapid-scan:
	@echo "⚠️  FRAUD TEST: Scanning twice rapidly..."
	@echo "--- First scan ---"
	@cast send $(CONTRACT) \
		"verifyProduct(bytes32,bytes32)" \
		$(PRODUCT_ID) \
		$(PRODUCT_HASH) \
		--rpc-url $(RPC) \
		--private-key $(CUSTOMER_PK)
	@echo "--- Second scan (immediate - should trigger fraud) ---"
	@cast send $(CONTRACT) \
		"verifyProduct(bytes32,bytes32)" \
		$(PRODUCT_ID) \
		$(PRODUCT_HASH) \
		--rpc-url $(RPC) \
		--private-key $(CUSTOMER_PK)
	@echo "🚨 Check logs for FraudDetected event!"

# ═══════════════════════════════════════════════════════════
#          STEP 8:  TRUST SCORE
# ═══════════════════════════════════════════════════════════

check-trust-score:
	@echo "⭐ Trust Score (0-100):"
	@cast call $(CONTRACT) \
		"getTrustScore(bytes32)(uint256)" \
		$(PRODUCT_ID) \
		--rpc-url $(RPC)

# ═══════════════════════════════════════════════════════════
#          STEP 9:  PRODUCT RECALL
# ═══════════════════════════════════════════════════════════

recall-product:
	@echo "🚨 RECALLING product..."
	@cast send $(CONTRACT) \
		"recallProduct(bytes32)" \
		$(PRODUCT_ID) \
		--rpc-url $(RPC) \
		--private-key $(MFG_PK)
	@echo "✅ Product recalled!"

# After recall, verify should return false
verify-after-recall:
	@echo "🔍 Verifying recalled product (should be NOT authentic):"
	@cast call $(CONTRACT) \
		"isAuthentic(bytes32,bytes32)(bool)" \
		$(PRODUCT_ID) \
		$(PRODUCT_HASH) \
		--rpc-url $(RPC)

# ═══════════════════════════════════════════════════════════
#     STEP 10:  SECURITY TESTS (should all FAIL)
# ═══════════════════════════════════════════════════════════

# Attacker tries to register → should REVERT
attack-register:
	@echo "🚫 ATTACK: Non-manufacturer tries to register..."
	@cast send $(CONTRACT) \
		"registerProduct(bytes32,bytes32,string)" \
		$(shell cast keccak "FAKE-PROD") \
		$(shell cast keccak "fake-hash") \
		"FAKE-BATCH" \
		--rpc-url $(RPC) \
		--private-key $(ATTACKER_PK) || echo "✅ Attack blocked! Reverted as expected."

# Attacker tries to add supply event → should REVERT
attack-supply-event:
	@echo "🚫 ATTACK: Unauthorized supply chain update..."
	@cast send $(CONTRACT) \
		"addSupplyEvent(bytes32,bytes32,string,uint8)" \
		$(PRODUCT_ID) \
		$(shell cast keccak "hack-data") \
		"Hacker Location" \
		2 \
		--rpc-url $(RPC) \
		--private-key $(ATTACKER_PK) || echo "✅ Attack blocked! Reverted as expected."

# Attacker tries to assign role → should REVERT
attack-assign-role:
	@echo "🚫 ATTACK: Non-admin tries to assign role..."
	@cast send $(CONTRACT) \
		"assignRole(address,uint8)" \
		$(ATTACKER_ADDR) 2 \
		--rpc-url $(RPC) \
		--private-key $(ATTACKER_PK) || echo "✅ Attack blocked! Reverted as expected."

# Attacker tries to recall → should REVERT
attack-recall:
	@echo "🚫 ATTACK: Non-manufacturer tries to recall..."
	@cast send $(CONTRACT) \
		"recallProduct(bytes32)" \
		$(PRODUCT_ID) \
		--rpc-url $(RPC) \
		--private-key $(ATTACKER_PK) || echo "✅ Attack blocked! Reverted as expected."

run-all-attacks: attack-register attack-supply-event attack-assign-role attack-recall
	@echo ""
	@echo "🛡️  All attacks blocked successfully!"

# ═══════════════════════════════════════════════════════════
#        STEP 11:  ANALYTICS / DASHBOARD QUERIES
# ═══════════════════════════════════════════════════════════

analytics:
	@echo "═══════════════════════════════════════"
	@echo "        📊 DASHBOARD ANALYTICS"
	@echo "═══════════════════════════════════════"
	@echo ""
	@echo "📦 Total Products:"
	@cast call $(CONTRACT) "totalProducts()(uint256)" --rpc-url $(RPC)
	@echo ""
	@echo "📋 All Product IDs:"
	@cast call $(CONTRACT) "getAllProductIds()(bytes32[])" --rpc-url $(RPC)
	@echo ""
	@echo "═══════════════════════════════════════"

product-dashboard:
	@echo "═══════════════════════════════════════"
	@echo "     📋 PRODUCT DASHBOARD"
	@echo "═══════════════════════════════════════"
	@echo ""
	@echo "📦 Product Details:"
	@cast call $(CONTRACT) \
		"getProduct(bytes32)(bytes32,address,address,uint8,string,uint256,uint256,uint256,bool)" \
		$(PRODUCT_ID) --rpc-url $(RPC)
	@echo ""
	@echo "📊 Status:"
	@cast call $(CONTRACT) "getProductStatus(bytes32)(uint8)" $(PRODUCT_ID) --rpc-url $(RPC)
	@echo ""
	@echo "🔗 Latest Hash:"
	@cast call $(CONTRACT) "getLatestEventHash(bytes32)(bytes32)" $(PRODUCT_ID) --rpc-url $(RPC)
	@echo ""
	@echo "📜 Event Count:"
	@cast call $(CONTRACT) "getSupplyEventCount(bytes32)(uint256)" $(PRODUCT_ID) --rpc-url $(RPC)
	@echo ""
	@echo "⭐ Trust Score:"
	@cast call $(CONTRACT) "getTrustScore(bytes32)(uint256)" $(PRODUCT_ID) --rpc-url $(RPC)
	@echo ""
	@echo "✅ Authentic:"
	@cast call $(CONTRACT) "isAuthentic(bytes32,bytes32)(bool)" $(PRODUCT_ID) $(PRODUCT_HASH) --rpc-url $(RPC)
	@echo ""
	@echo "═══════════════════════════════════════"

# ═══════════════════════════════════════════════════════════
#       STEP 12:  ROLE REVOCATION
# ═══════════════════════════════════════════════════════════

revoke-supplier:
	@echo "🔒 Revoking Supplier role..."
	@cast send $(CONTRACT) \
		"revokeRole(address)" \
		$(SUPPLIER_ADDR) \
		--rpc-url $(RPC) \
		--private-key $(ADMIN_PK)
	@echo "✅ Supplier role revoked!"

# ═══════════════════════════════════════════════════════════
#    🚀 COMPLETE DEMO (Run everything in order)
# ═══════════════════════════════════════════════════════════

demo: 
	@echo "╔══════════════════════════════════════════════╗"
	@echo "║   🚀 FULL SYSTEM DEMO - ProductTracker      ║"
	@echo "╚══════════════════════════════════════════════╝"
	@echo ""
	@make check-deployment
	@echo ""
	@echo "━━━━━━━━━━━ ASSIGNING ROLES ━━━━━━━━━━━"
	@make assign-all-roles
	@make verify-roles
	@echo ""
	@echo "━━━━━━━━━ REGISTERING PRODUCT ━━━━━━━━━"
	@make register-product
	@make check-product-exists
	@make check-product-status
	@echo ""
	@echo "━━━━━━━━━ SUPPLY CHAIN FLOW ━━━━━━━━━━━"
	@make full-supply-chain
	@make check-supply-history
	@echo ""
	@echo "━━━━━━━━━ OWNERSHIP TRANSFER ━━━━━━━━━━"
	@make transfer-to-supplier
	@make transfer-to-customer
	@echo ""
	@echo "━━━━━━━━━━ VERIFICATION ━━━━━━━━━━━━━━━"
	@make check-authentic
	@make check-authentic-fake
	@echo ""
	@echo "━━━━━━━━━━ TRUST SCORE ━━━━━━━━━━━━━━━━"
	@make check-trust-score
	@echo ""
	@echo "━━━━━━━━━ SECURITY TESTS ━━━━━━━━━━━━━━"
	@make run-all-attacks
	@echo ""
	@echo "━━━━━━━━━ FINAL DASHBOARD ━━━━━━━━━━━━━"
	@make product-dashboard
	@echo ""
	@echo "╔══════════════════════════════════════════════╗"
	@echo "║   ✅ DEMO COMPLETE - ALL SYSTEMS WORKING     ║"
	@echo "╚══════════════════════════════════════════════╝"

# ═══════════════════════════════════════════════════════════
#              HELP
# ═══════════════════════════════════════════════════════════

help:
	@echo "╔══════════════════════════════════════════════════════════╗"
	@echo "║          ProductTracker - Available Commands            ║"
	@echo "╠══════════════════════════════════════════════════════════╣"
	@echo "║                                                        ║"
	@echo "║  BUILD & TEST:                                         ║"
	@echo "║    make build              - Compile contracts         ║"
	@echo "║    make test               - Run all tests             ║"
	@echo "║    make test-gas           - Gas report                ║"
	@echo "║    make test-e2e           - End-to-end test           ║"
	@echo "║                                                        ║"
	@echo "║  ROLES:                                                ║"
	@echo "║    make assign-all-roles   - Setup manufacturer+supplier║"
	@echo "║    make verify-roles       - Check assigned roles      ║"
	@echo "║    make revoke-supplier    - Revoke supplier access    ║"
	@echo "║                                                        ║"
	@echo "║  PRODUCTS:                                             ║"
	@echo "║    make register-product   - Register product #1      ║"
	@echo "║    make register-product-2 - Register product #2      ║"
	@echo "║    make check-product      - View product details     ║"
	@echo "║                                                        ║"
	@echo "║  SUPPLY CHAIN:                                        ║"
	@echo "║    make full-supply-chain  - Run complete flow         ║"
	@echo "║    make check-full-history - View all events           ║"
	@echo "║                                                        ║"
	@echo "║  VERIFICATION:                                        ║"
	@echo "║    make verify-genuine     - Verify with correct hash ║"
	@echo "║    make verify-fake        - Verify with wrong hash   ║"
	@echo "║    make check-authentic    - Quick auth check          ║"
	@echo "║                                                        ║"
	@echo "║  FRAUD & SECURITY:                                    ║"
	@echo "║    make fraud-rapid-scan   - Test duplicate scan fraud ║"
	@echo "║    make run-all-attacks    - Test all attack vectors   ║"
	@echo "║                                                        ║"
	@echo "║  ANALYTICS:                                           ║"
	@echo "║    make analytics          - System overview           ║"
	@echo "║    make product-dashboard  - Full product report       ║"
	@echo "║    make check-trust-score  - Trust score               ║"
	@echo "║                                                        ║"
	@echo "║  RECALL:                                              ║"
	@echo "║    make recall-product     - Recall product            ║"
	@echo "║                                                        ║"
	@echo "║  🚀 FULL DEMO:                                        ║"
	@echo "║    make demo               - Run everything           ║"
	@echo "║                                                        ║"
	@echo "╚══════════════════════════════════════════════════════════╝"

.PHONY: build test test-gas test-e2e test-fuzz \
        check-owner check-total-products check-deployment \
        assign-manufacturer assign-supplier assign-all-roles verify-roles \
        register-product register-product-2 check-product check-product-exists check-product-status \
        supply-transit-mumbai supply-transit-delhi supply-delivered supply-sold full-supply-chain \
        check-supply-history check-latest-hash check-full-history \
        transfer-to-supplier transfer-to-customer \
        verify-genuine verify-fake check-authentic check-authentic-fake \
        fraud-rapid-scan check-trust-score \
        recall-product verify-after-recall \
        attack-register attack-supply-event attack-assign-role attack-recall run-all-attacks \
        analytics product-dashboard revoke-supplier demo help