// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title SpendEscrow
/// @notice Holds Index Units on behalf of users and allows authorized settlement debits.
contract SpendEscrow {
  address public owner;
  mapping(address => uint256) public balanceOf;
  mapping(address => uint256) public spendLimit;
  mapping(address => bool) public isSettler;

  event Deposited(address indexed user, uint256 amount);
  event Withdrawn(address indexed user, uint256 amount);
  event Debited(address indexed user, uint256 amount, bytes32 settlementId);
  event SettlerUpdated(address indexed settler, bool allowed);
  event SpendLimitUpdated(address indexed user, uint256 limit);

  modifier onlyOwner() {
    require(msg.sender == owner, "not_owner");
    _;
  }

  modifier onlySettler() {
    require(isSettler[msg.sender], "not_settler");
    _;
  }

  constructor() {
    owner = msg.sender;
  }

  function setSettler(address settler, bool allowed) external onlyOwner {
    isSettler[settler] = allowed;
    emit SettlerUpdated(settler, allowed);
  }

  function setSpendLimit(address user, uint256 limit) external onlyOwner {
    spendLimit[user] = limit;
    emit SpendLimitUpdated(user, limit);
  }

  function deposit(address user, uint256 amount) external {
    require(user != address(0), "invalid_user");
    require(amount > 0, "invalid_amount");
    balanceOf[user] += amount;
    emit Deposited(user, amount);
  }

  function withdraw(uint256 amount) external {
    require(amount > 0, "invalid_amount");
    uint256 current = balanceOf[msg.sender];
    require(current >= amount, "insufficient_balance");
    balanceOf[msg.sender] = current - amount;
    emit Withdrawn(msg.sender, amount);
  }

  function debitForSettlement(address user, uint256 amount, bytes32 settlementId) external onlySettler {
    require(user != address(0), "invalid_user");
    require(amount > 0, "invalid_amount");
    uint256 current = balanceOf[user];
    require(current >= amount, "insufficient_balance");
    uint256 limit = spendLimit[user];
    if (limit > 0) {
      require(amount <= limit, "spend_limit_exceeded");
    }
    balanceOf[user] = current - amount;
    emit Debited(user, amount, settlementId);
  }
}
