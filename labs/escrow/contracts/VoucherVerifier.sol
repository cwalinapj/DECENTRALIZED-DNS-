// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title VoucherVerifier
/// @notice Verifies signed vouchers and prevents replay.
contract VoucherVerifier {
  address public owner;
  mapping(address => uint256) public lastNonce;
  mapping(bytes32 => bool) public voucherUsed;

  event VoucherAccepted(address indexed user, bytes32 voucherId, uint256 amount, bytes32 settlementId);
  event VoucherRejected(address indexed user, bytes32 voucherId, string reason);

  modifier onlyOwner() {
    require(msg.sender == owner, "not_owner");
    _;
  }

  constructor() {
    owner = msg.sender;
  }

  /// @dev In a full implementation this would recover signer via ECDSA.
  /// For now, this is a placeholder to demonstrate replay protection.
  function submitVoucher(
    address user,
    uint256 nonce,
    uint256 amount,
    bytes32 voucherId,
    bytes32 settlementId
  ) external returns (bool) {
    if (voucherUsed[voucherId]) {
      emit VoucherRejected(user, voucherId, "replay");
      return false;
    }
    if (nonce <= lastNonce[user]) {
      emit VoucherRejected(user, voucherId, "nonce");
      return false;
    }
    voucherUsed[voucherId] = true;
    lastNonce[user] = nonce;
    emit VoucherAccepted(user, voucherId, amount, settlementId);
    return true;
  }

  function setOwner(address nextOwner) external onlyOwner {
    owner = nextOwner;
  }
}
