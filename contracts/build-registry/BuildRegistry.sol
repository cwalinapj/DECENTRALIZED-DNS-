// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BuildRegistry - minimal on-chain approved build hash registry
/// @notice Stores approved build hashes (bytes32) per component_id (bytes32)
/// @dev build_hash is intended to be derived off-chain (e.g., BLAKE3-256 of docker repo digest string)
contract BuildRegistry {
    address public admin;

    struct ApprovedBuild {
        uint32 version;     // monotonically increasing
        bytes32 buildHash;  // approved hash
        uint64 updatedAt;   // unix seconds
    }

    mapping(bytes32 => ApprovedBuild) private builds;

    event AdminChanged(address indexed newAdmin);
    event BuildApproved(bytes32 indexed componentId, uint32 version, bytes32 buildHash, uint64 updatedAt);

    modifier onlyAdmin() {
        require(msg.sender == admin, "NOT_ADMIN");
        _;
    }

    constructor(address _admin) {
        require(_admin != address(0), "BAD_ADMIN");
        admin = _admin;
        emit AdminChanged(_admin);
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "BAD_ADMIN");
        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    /// @notice Approve a build hash for a component
    /// @param componentId bytes32 identifier (recommend keccak256(utf8(componentName)))
    /// @param version monotonically increasing per component
    /// @param buildHash bytes32 approved build hash (off-chain computed)
    function approveBuild(bytes32 componentId, uint32 version, bytes32 buildHash) external onlyAdmin {
        ApprovedBuild storage cur = builds[componentId];
        require(version > cur.version, "VERSION_NOT_INCREASING");
        builds[componentId] = ApprovedBuild({
            version: version,
            buildHash: buildHash,
            updatedAt: uint64(block.timestamp)
        });
        emit BuildApproved(componentId, version, buildHash, uint64(block.timestamp));
    }

    function getApproved(bytes32 componentId) external view returns (uint32 version, bytes32 buildHash, uint64 updatedAt) {
        ApprovedBuild memory b = builds[componentId];
        return (b.version, b.buildHash, b.updatedAt);
    }
}
