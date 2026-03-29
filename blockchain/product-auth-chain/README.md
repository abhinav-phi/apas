# Automated Product Authentication & Supply Chain Integrity System

A secure, role-based product verification smart contract deployed on Ethereum that tracks products across their lifecycle, enables authenticity verification, and detects counterfeit products using validation, tracking, and tamper-resistant data mechanisms.

This is not a QR code project. QR acts only as an interface. The system ensures authenticity, traceability, fraud detection, and data integrity through structured validation and secure on-chain design.

## Deployed Contract

| Detail | Value |
|---|---|
| Network | Ethereum Sepolia Testnet |
| Contract Address | [0xA06470E128275c5fE4410d4A712F23d54c714b68](https://sepolia.etherscan.io/address/0xA06470E128275c5fE4410d4A712F23d54c714b68) |
| Owner | 0x16c39DDF7BB70FD943f379f7165d627bEDF2D614 |
| Block | 10545700 |
| TX Hash | [0x7ff33b22ee709579d862d8f96582610534df1f02aa18dd05ba1a647252c2f3f3](https://sepolia.etherscan.io/tx/0x7ff33b22ee709579d862d8f96582610534df1f02aa18dd05ba1a647252c2f3f3) |
| Solidity | 0.8.24 |
| Verified | Yes |

## Problem Statement

Product counterfeiting is a major issue across pharmaceuticals, electronics, cosmetics, and FMCG industries. Customers cannot reliably verify product authenticity, and traditional systems based on simple QR codes or centralized databases are vulnerable to duplication and tampering.

This leads to financial losses for brands and consumers, safety risks from counterfeit medicines and electronics, and loss of consumer trust in genuine products.

Existing supply chains lack transparency and do not provide complete visibility of a product journey from manufacturer to end customer.

## Solution

The system provides a blockchain-backed verification layer where manufacturers register products with unique hashed identifiers, suppliers update product movement through the supply chain, customers verify authenticity by comparing hashes stored on-chain, and admins monitor the system and manage access control.

Critical event hashes are stored on blockchain to ensure immutability, while full product data is kept off-chain in a database for performance.

## Architecture

The system follows a layered architecture. The frontend built with React and Tailwind CSS communicates with backend logic, which interacts with both the Supabase database for full product data and the Ethereum Sepolia blockchain for hash proofs only. During verification, the hash from the database is compared with the hash on blockchain. If they match the product is genuine. If there is a mismatch the product has been tampered with.

What blockchain stores includes product creation hash, supply chain event hashes that are hash-chained, ownership records, recall status, scan count and fraud flags.

What the database stores includes product metadata and images and descriptions, user accounts and sessions, detailed supply chain logs, and analytics and reports.

## Smart Contract Features

### 1. Role-Based Access Control

The Admin can assign and revoke roles and monitor the system. The Manufacturer can register products, initiate recalls, and update supply chain. The Supplier can update supply chain events such as transit and delivery. Anyone can verify product authenticity and view trust score.

### 2. Product Registration

Unique product ID generation using keccak256 hash. Product data hash stored on-chain for tamper detection. Batch and lot identifier tracking. Genesis event automatically created in hash chain.

### 3. Supply Chain Tracking with Hash Chain

Each supply chain event is linked to the previous one using the formula eventHash equals keccak256 of previousHash plus eventDataHash plus actor plus timestamp. This creates a tamper-resistant chain. If any event is modified all subsequent hashes break making tampering immediately detectable.

Valid status transitions are Registered to InTransit, InTransit to InTransit for multiple legs, InTransit to Delivered, Delivered to Sold, Delivered to InTransit for return or redirect, and any status to Expired.

### 4. Product Verification

Hash comparison where the system recomputes hash from data and compares with on-chain hash. Returns isAuthentic as true or false and fraudFlag as true or false. Both state-changing and view-only verification functions available.

### 5. Fraud Detection Engine

Rapid duplicate scan detection flags scans within 30 seconds of each other. Hash mismatch detection where wrong hash means counterfeit or tampered data. Recalled product detection where recalled products always return not authentic. Emits FraudDetected event with reason for audit trail.

### 6. Trust Score System

Dynamic product reliability score from 0 to 100 calculated from recall status where recalled equals 0, scan count where excessive scans reduce score, supply chain completeness where too few events reduce score, and lifecycle stage.

### 7. Ownership Transfer

Traceable product handoffs between parties. Only current owner can transfer. Cannot transfer to self or zero address. Blocked for recalled products.

### 8. Product Recall

Only the original manufacturer can recall their product. Recall event appended to hash chain. Recalled products cannot receive supply updates or ownership transfers. Verification always returns false for recalled products.

### 9. Audit Trail Events

Every action emits an event for complete traceability. RoleAssigned is emitted when a role is granted to an address. RoleRevoked is emitted when a role is removed from an address. ProductRegistered is emitted when a new product is created. SupplyChainUpdated is emitted when a supply chain event is added. OwnershipTransferred is emitted when product ownership changes. ProductRecalled is emitted when a product is recalled by manufacturer. ProductVerified is emitted when product authenticity is checked. ProductScanned is emitted when a product is scanned and scan count is updated. FraudDetected is emitted when suspicious activity is detected.

## Tech Stack

| Component | Technology |
|---|---|
| Smart Contract | Solidity 0.8.24 |
| Framework | Foundry using Forge and Cast and Anvil |
| Testing | Forge Test with 54 tests |
| Deployment | Forge Script |
| Network | Ethereum Sepolia Testnet |
| Verification | Etherscan |
| Frontend | React and Tailwind CSS |
| Database | Supabase |

## Project Structure

The project root contains foundry.toml for Foundry configuration, Makefile for demo and interaction commands, README.md for project documentation, and .gitignore for git ignore rules. The .env file for environment variables is not included in the repo. The src folder contains ProductTracker.sol which is the main smart contract. The script folder contains DeployProductTracker.s.sol for local Anvil deployment and DeployProductTrackerSepolia.s.sol for Sepolia deployment. The test folder contains ProductTracker.t.sol which is the comprehensive test suite.

## Getting Started

### Prerequisites

Install Foundry by running curl -L https://foundry.paradigm.xyz | bash and then foundryup.

### Clone and Build

Clone the repository with git clone https://github.com/YOUR_USERNAME/product-auth-chain.git then cd product-auth-chain and run forge install followed by forge build.

### Run Tests

Run all tests with forge test -vvv. Get gas report with forge test --gas-report. Run specific test with forge test --match-test test_FullEndToEndScenario -vvvv. Run fuzz tests with forge test --match-test testFuzz -vvv.

### Local Deployment with Anvil

In terminal 1 start local blockchain with anvil. In terminal 2 deploy with forge script script/DeployProductTracker.s.sol:DeployProductTracker --rpc-url http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast.

### Run Full Demo Locally

Run make demo to execute the complete demonstration.

### See All Available Commands

Run make help to see all available commands.

## Test Suite

54 comprehensive tests covering all functionality.

| Category | Tests | Description |
|---|---|---|
| Deployment | 3 | Owner assignment and role setup and initial state |
| Role Management | 6 | Assign and revoke and access control and edge cases |
| Product Registration | 9 | Valid and invalid registration and events and data integrity |
| Supply Chain Updates | 8 | Status transitions and hash chaining and full flow |
| Ownership Transfer | 5 | Transfer and chaining and access control |
| Product Recall | 6 | Recall and event logging and blocking further updates |
| Verification and Fraud | 7 | Auth check and fraud detection and scan counting |
| Trust Score | 4 | Score calculation and edge cases |
| Integration and E2E | 3 | Hash chain integrity and multi-product and end-to-end |
| Fuzz Tests | 3 | Random hash testing and wrong hash and duplicate ID |
| Total | 54 | All Passing |

## Security Measures

Custom errors for gas-efficient error handling with no string reverts. Role-based access control where only authorized actors can perform actions. Input validation on all inputs before processing. Status transition guards rejecting invalid state changes. Hash chain integrity providing tamper-evident linked hash structure. Immutable owner set at deployment that cannot be changed. Recall protection blocking recalled products from all operations. Re-entrancy safe with no external calls that could enable re-entrancy.

## Makefile Commands Reference

Build and test commands include make build to compile contracts, make test to run all 54 tests, make test-gas for gas consumption report, and make test-e2e for end-to-end test only.

Role commands include make assign-all-roles to setup manufacturer and supplier, and make verify-roles to verify role assignments.

Product commands include make register-product to register a test product, and make check-product to view product details.

Supply chain commands include make full-supply-chain to run complete supply chain flow, and make check-full-history to view all supply chain events.

Verification commands include make check-authentic to verify with correct hash which should return true, make check-authentic-fake to verify with wrong hash which should return false, and make verify-genuine for full verification transaction.

Fraud and security commands include make fraud-rapid-scan to test duplicate scan fraud detection, and make run-all-attacks to test all attack vectors.

Analytics commands include make analytics for system overview, make product-dashboard for complete product report, and make check-trust-score to view trust score.

Recall commands include make recall-product to recall a product.

Full demo commands include make demo to run everything in sequence, and make help to show all commands.

## How Verification Works

Step 1 is that the manufacturer registers the product. Product data is hashed off-chain. The hash is stored on blockchain. A genesis event is created in the hash chain.

Step 2 is that supply chain actors update events. Each event is hashed with the previous event hash creating a chain. Status transitions are validated. Events are stored as an append-only log.

Step 3 is that the customer scans the QR code. The QR contains the product ID. The system fetches data from the database. It recomputes hash from the fetched data. It compares with the hash stored on blockchain.

Step 4 is the result. If the hash matches and the product is not recalled then it is genuine. If there is a hash mismatch then it is tampered or counterfeit. If the product is recalled then it is not authentic. If there is a rapid duplicate scan then a fraud flag is raised.

## Real-World Applications

Pharmaceuticals for detecting counterfeit medicines before patient consumption. Electronics for verifying device authenticity and warranty claims. Luxury goods for protecting brand value against counterfeits. FMCG products for ensuring supply chain transparency for consumers.

## Software Engineering Concepts Applied

Requirement analysis and modular design. Role-based architecture using RBAC. Event-driven architecture using Solidity events as audit logs. Data flow modeling. Validation rules engine for status transitions. Hash chain for tamper resistance. Comprehensive testing including unit and integration and fuzz tests.

## Future Enhancements

Geo-based fraud detection with location mismatch analysis. Batch-level analytics and risk scoring. Expiry date tracking and alerts. Multi-chain deployment on Polygon and Base. Product authenticity certificate generation using NFTs. Frontend integration with QR scanner.

## License

MIT