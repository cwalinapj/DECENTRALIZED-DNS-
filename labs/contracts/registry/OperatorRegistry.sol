// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract OperatorRegistry {
    address public owner;

    mapping(address => bool) public operators;

    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    modifier onlyOwner() {
        require(msg.sender == owner, "not_owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function addOperator(address operator) external onlyOwner {
        require(operator != address(0), "bad_operator");
        require(!operators[operator], "already_operator");
        operators[operator] = true;
        emit OperatorAdded(operator);
    }

    function removeOperator(address operator) external onlyOwner {
        require(operators[operator], "not_operator");
        operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    function isOperator(address operator) external view returns (bool) {
        return operators[operator];
    }
}
