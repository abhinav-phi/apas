// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ProductTracker
 * @author Supply Chain Integrity Team
 * @notice Automated Product Authentication & Supply Chain Integrity System
 * @dev Stores hashed proofs of supply chain events on-chain for tamper-proof verification.
 *      Full product data lives off-chain (Supabase); blockchain = verification layer only.
 */
contract ProductTracker {

    // ═══════════════════════════════════════════════════════
    //                       ENUMS
    // ═══════════════════════════════════════════════════════

    enum Role {
        None,           // 0 - no access
        Admin,          // 1 - monitors system, views audit logs
        Manufacturer,   // 2 - registers products, recalls
        Supplier        // 3 - updates supply chain events
    }

    enum Status {
        NotExists,  // 0
        Registered, // 1
        InTransit,  // 2
        Delivered,  // 3
        Sold,       // 4
        Recalled,   // 5
        Expired     // 6
    }

    // ═══════════════════════════════════════════════════════
    //                       STRUCTS
    // ═══════════════════════════════════════════════════════

    /// @notice On-chain product record (lightweight — only hashes & metadata)
    struct Product {
        bytes32 productHash;      // hash(productData + timestamp)
        address manufacturer;
        address currentOwner;
        Status  status;
        string  batchId;
        uint256 createdAt;
        uint256 lastUpdated;
        uint256 scanCount;
        bool    recalled;
    }

    /// @notice Individual supply-chain event stored as append-only log
    struct SupplyEvent {
        bytes32 eventHash;        // hash(previous_hash + event_data)
        address actor;
        string  location;
        Status  newStatus;
        uint256 timestamp;
    }

    // ═══════════════════════════════════════════════════════
    //                    STATE VARIABLES
    // ═══════════════════════════════════════════════════════

    address public immutable contractOwner;
    uint256 public totalProducts;

    /// @dev role-based access control
    mapping(address => Role) public roles;

    /// @dev productId => Product
    mapping(bytes32 => Product) public products;

    /// @dev productId => supply-chain event history (append-only)
    mapping(bytes32 => SupplyEvent[]) internal _supplyHistory;

    /// @dev productId => exists flag
    mapping(bytes32 => bool) public productExists;

    /// @dev productId => last scan block.timestamp (fraud: rapid duplicate scans)
    mapping(bytes32 => uint256) public lastScanTime;

    /// @dev all registered product IDs (for enumeration / analytics)
    bytes32[] internal _allProductIds;

    // ═══════════════════════════════════════════════════════
    //                 EVENTS  (AUDIT TRAIL)
    // ═══════════════════════════════════════════════════════

    event RoleAssigned(
        address indexed account,
        Role    indexed role,
        uint256 timestamp
    );

    event RoleRevoked(
        address indexed account,
        Role    indexed previousRole,
        uint256 timestamp
    );

    event ProductRegistered(
        bytes32 indexed productId,
        bytes32 productHash,
        address indexed manufacturer,
        string  batchId,
        uint256 timestamp
    );

    event SupplyChainUpdated(
        bytes32 indexed productId,
        bytes32 eventHash,
        address indexed actor,
        string  location,
        Status  newStatus,
        uint256 timestamp
    );

    event OwnershipTransferred(
        bytes32 indexed productId,
        address indexed previousOwner,
        address indexed newOwner,
        uint256 timestamp
    );

    event ProductRecalled(
        bytes32 indexed productId,
        address indexed recalledBy,
        uint256 timestamp
    );

    event ProductVerified(
        bytes32 indexed productId,
        address indexed verifier,
        bool    isAuthentic,
        uint256 timestamp
    );

    event FraudDetected(
        bytes32 indexed productId,
        string  reason,
        address indexed detector,
        uint256 timestamp
    );

    event ProductScanned(
        bytes32 indexed productId,
        address indexed scanner,
        uint256 totalScans,
        uint256 timestamp
    );

    // ═══════════════════════════════════════════════════════
    //                      ERRORS
    // ═══════════════════════════════════════════════════════

    error Unauthorized();
    error InvalidAddress();
    error ProductAlreadyExists();
    error ProductNotFound();
    error ProductIsRecalled();
    error InvalidHash();
    error EmptyString();
    error InvalidStatusTransition(Status from, Status to);
    error NotProductOwner();
    error CannotTransferToSelf();
    error AlreadyRecalled();
    error NotProductManufacturer();
    error CannotRevokeOwner();
    error NoRoleToRevoke();

    // ═══════════════════════════════════════════════════════
    //                     MODIFIERS
    // ═══════════════════════════════════════════════════════

    modifier onlyContractOwner() {
        if (msg.sender != contractOwner) revert Unauthorized();
        _;
    }

    modifier onlyManufacturer() {
        if (roles[msg.sender] != Role.Manufacturer) revert Unauthorized();
        _;
    }

    modifier onlyManufacturerOrSupplier() {
        if (roles[msg.sender] != Role.Manufacturer && roles[msg.sender] != Role.Supplier)
            revert Unauthorized();
        _;
    }

    modifier mustExist(bytes32 _productId) {
        if (!productExists[_productId]) revert ProductNotFound();
        _;
    }

    modifier notRecalled(bytes32 _productId) {
        if (products[_productId].recalled) revert ProductIsRecalled();
        _;
    }

    // ═══════════════════════════════════════════════════════
    //                    CONSTRUCTOR
    // ═══════════════════════════════════════════════════════

    constructor() {
        contractOwner = msg.sender;
        roles[msg.sender] = Role.Admin;
        emit RoleAssigned(msg.sender, Role.Admin, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════
    //              1. ROLE MANAGEMENT (RBAC)
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Assign a role to an address (Admin only)
     * @param _account Target address
     * @param _role    Role to assign (Admin / Manufacturer / Supplier)
     */
    function assignRole(address _account, Role _role) external onlyContractOwner {
        if (_account == address(0)) revert InvalidAddress();
        if (_role == Role.None) revert Unauthorized();

        roles[_account] = _role;
        emit RoleAssigned(_account, _role, block.timestamp);
    }

    /**
     * @notice Revoke any role from an address (Admin only)
     */
    function revokeRole(address _account) external onlyContractOwner {
        if (_account == address(0)) revert InvalidAddress();
        if (_account == contractOwner) revert CannotRevokeOwner();

        Role prev = roles[_account];
        if (prev == Role.None) revert NoRoleToRevoke();

        roles[_account] = Role.None;
        emit RoleRevoked(_account, prev, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════
    //            2. PRODUCT REGISTRATION
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Register a new product (Manufacturer only)
     * @param _productId  Unique product identifier (e.g. keccak256 of serial)
     * @param _productHash Hash of full product data (computed off-chain)
     * @param _batchId     Human-readable batch / lot identifier
     */
    function registerProduct(
        bytes32 _productId,
        bytes32 _productHash,
        string calldata _batchId
    ) external onlyManufacturer {
        if (productExists[_productId]) revert ProductAlreadyExists();
        if (_productHash == bytes32(0))  revert InvalidHash();
        if (bytes(_batchId).length == 0) revert EmptyString();

        products[_productId] = Product({
            productHash:  _productHash,
            manufacturer: msg.sender,
            currentOwner: msg.sender,
            status:       Status.Registered,
            batchId:      _batchId,
            createdAt:    block.timestamp,
            lastUpdated:  block.timestamp,
            scanCount:    0,
            recalled:     false
        });

        productExists[_productId] = true;
        _allProductIds.push(_productId);
        totalProducts++;

        // First link in the hash chain
        bytes32 genesisHash = keccak256(
            abi.encodePacked(_productHash, msg.sender, block.timestamp, "REGISTERED")
        );

        _supplyHistory[_productId].push(SupplyEvent({
            eventHash: genesisHash,
            actor:     msg.sender,
            location:  "Factory",
            newStatus: Status.Registered,
            timestamp: block.timestamp
        }));

        emit ProductRegistered(_productId, _productHash, msg.sender, _batchId, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════
    //          3. SUPPLY CHAIN EVENT TRACKING
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Append a supply-chain event (Manufacturer or Supplier)
     * @dev    Hash chain: eventHash = hash(previousHash + newData)
     */
    function addSupplyEvent(
        bytes32 _productId,
        bytes32 _eventDataHash,
        string calldata _location,
        Status _newStatus
    )
        external
        onlyManufacturerOrSupplier
        mustExist(_productId)
        notRecalled(_productId)
    {
        if (_eventDataHash == bytes32(0)) revert InvalidHash();
        if (bytes(_location).length == 0) revert EmptyString();

        Status current = products[_productId].status;
        if (!_validTransition(current, _newStatus))
            revert InvalidStatusTransition(current, _newStatus);

        // Build hash chain: link to previous event
        SupplyEvent[] storage history = _supplyHistory[_productId];
        bytes32 previousHash = history[history.length - 1].eventHash;

        bytes32 chainedHash = keccak256(
            abi.encodePacked(previousHash, _eventDataHash, msg.sender, block.timestamp)
        );

        history.push(SupplyEvent({
            eventHash: chainedHash,
            actor:     msg.sender,
            location:  _location,
            newStatus: _newStatus,
            timestamp: block.timestamp
        }));

        products[_productId].status      = _newStatus;
        products[_productId].lastUpdated = block.timestamp;

        emit SupplyChainUpdated(
            _productId, chainedHash, msg.sender, _location, _newStatus, block.timestamp
        );
    }

    // ═══════════════════════════════════════════════════════
    //            4. OWNERSHIP TRANSFER
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Transfer product ownership to another address
     */
    function transferOwnership(
        bytes32 _productId,
        address _newOwner
    )
        external
        mustExist(_productId)
        notRecalled(_productId)
    {
        if (_newOwner == address(0))  revert InvalidAddress();
        if (_newOwner == msg.sender)  revert CannotTransferToSelf();

        Product storage p = products[_productId];
        if (p.currentOwner != msg.sender) revert NotProductOwner();

        address prev = p.currentOwner;
        p.currentOwner = _newOwner;
        p.lastUpdated  = block.timestamp;

        emit OwnershipTransferred(_productId, prev, _newOwner, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════
    //              5. PRODUCT RECALL
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Recall a product (only its original manufacturer)
     */
    function recallProduct(bytes32 _productId)
        external
        onlyManufacturer
        mustExist(_productId)
    {
        Product storage p = products[_productId];
        if (p.manufacturer != msg.sender) revert NotProductManufacturer();
        if (p.recalled) revert AlreadyRecalled();

        p.recalled    = true;
        p.status      = Status.Recalled;
        p.lastUpdated = block.timestamp;

        // Append recall to hash chain
        SupplyEvent[] storage history = _supplyHistory[_productId];
        bytes32 previousHash = history[history.length - 1].eventHash;
        bytes32 recallHash = keccak256(
            abi.encodePacked(previousHash, _productId, msg.sender, block.timestamp, "RECALLED")
        );

        history.push(SupplyEvent({
            eventHash: recallHash,
            actor:     msg.sender,
            location:  "N/A",
            newStatus: Status.Recalled,
            timestamp: block.timestamp
        }));

        emit ProductRecalled(_productId, msg.sender, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════
    //     6. PRODUCT VERIFICATION & FRAUD DETECTION
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Verify product authenticity (anyone can call)
     * @dev    Also performs fraud detection:
     *         - Rapid duplicate scan (< 30 seconds apart)
     *         - Recalled product check
     * @return isAuthentic  true if hash matches and product not recalled
     * @return fraudFlag    true if suspicious activity detected
     */
    function verifyProduct(
        bytes32 _productId,
        bytes32 _expectedHash
    )
        external
        mustExist(_productId)
        returns (bool isAuthentic, bool fraudFlag)
    {
        Product storage p = products[_productId];
        p.scanCount++;

        // ── Fraud Detection: rapid duplicate scan ──
        uint256 gap = block.timestamp - lastScanTime[_productId];
        if (lastScanTime[_productId] != 0 && gap < 30) {
            fraudFlag = true;
            emit FraudDetected(
                _productId,
                "Rapid duplicate scan detected",
                msg.sender,
                block.timestamp
            );
        }
        lastScanTime[_productId] = block.timestamp;

        // ── Hash verification ──
        isAuthentic = (p.productHash == _expectedHash) && !p.recalled;

        emit ProductVerified(_productId, msg.sender, isAuthentic, block.timestamp);
        emit ProductScanned(_productId, msg.sender, p.scanCount, block.timestamp);
    }

    /**
     * @notice Pure view-only authenticity check (no state change, no fraud detection)
     */
    function isAuthentic(
        bytes32 _productId,
        bytes32 _expectedHash
    ) external view mustExist(_productId) returns (bool) {
        Product storage p = products[_productId];
        return (p.productHash == _expectedHash) && !p.recalled;
    }

    // ═══════════════════════════════════════════════════════
    //              7. VIEW / GETTER FUNCTIONS
    // ═══════════════════════════════════════════════════════

    function getProduct(bytes32 _productId)
        external
        view
        mustExist(_productId)
        returns (
            bytes32 productHash,
            address manufacturer,
            address currentOwner,
            Status  status,
            string memory batchId,
            uint256 createdAt,
            uint256 lastUpdated,
            uint256 scanCount,
            bool    recalled
        )
    {
        Product storage p = products[_productId];
        return (
            p.productHash,
            p.manufacturer,
            p.currentOwner,
            p.status,
            p.batchId,
            p.createdAt,
            p.lastUpdated,
            p.scanCount,
            p.recalled
        );
    }

    function getSupplyHistory(bytes32 _productId)
        external
        view
        mustExist(_productId)
        returns (SupplyEvent[] memory)
    {
        return _supplyHistory[_productId];
    }

    function getSupplyEventCount(bytes32 _productId)
        external view returns (uint256)
    {
        return _supplyHistory[_productId].length;
    }

    function getLatestEventHash(bytes32 _productId)
        external
        view
        mustExist(_productId)
        returns (bytes32)
    {
        SupplyEvent[] storage h = _supplyHistory[_productId];
        return h[h.length - 1].eventHash;
    }

    function getAllProductIds() external view returns (bytes32[] memory) {
        return _allProductIds;
    }

    function getProductStatus(bytes32 _productId)
        external view mustExist(_productId) returns (Status)
    {
        return products[_productId].status;
    }

    /// @notice Compute a trust score (0–100) based on on-chain signals
    function getTrustScore(bytes32 _productId)
        external
        view
        mustExist(_productId)
        returns (uint256 score)
    {
        Product storage p = products[_productId];

        if (p.recalled) return 0;

        score = 100;

        // Deduct if too many scans (possible duplication)
        if (p.scanCount > 50)  score -= 30;
        else if (p.scanCount > 20) score -= 15;
        else if (p.scanCount > 10) score -= 5;

        // Deduct if supply chain is suspiciously short
        uint256 events = _supplyHistory[_productId].length;
        if (events < 2) score -= 20;

        // Bonus for complete lifecycle
        if (p.status == Status.Sold) score = score; // no deduction
        else if (p.status == Status.Delivered) score -= 5;

        // Clamp
        if (score > 100) score = 100;
    }

    // ═══════════════════════════════════════════════════════
    //           8. INTERNAL HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════

    /**
     * @dev Valid status transitions:
     *   Registered → InTransit
     *   InTransit  → InTransit  (multiple legs)
     *   InTransit  → Delivered
     *   Delivered  → Sold
     *   Delivered  → InTransit  (return / redirect)
     *   Any        → Expired
     */
    function _validTransition(Status _from, Status _to) internal pure returns (bool) {
        if (_to == Status.Expired) return true;

        if (_from == Status.Registered && _to == Status.InTransit)  return true;
        if (_from == Status.InTransit  && _to == Status.InTransit)  return true;
        if (_from == Status.InTransit  && _to == Status.Delivered)  return true;
        if (_from == Status.Delivered  && _to == Status.Sold)       return true;
        if (_from == Status.Delivered  && _to == Status.InTransit)  return true;

        return false;
    }
}