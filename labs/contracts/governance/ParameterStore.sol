// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ParameterStore {
    address public governor;
    mapping(bytes32 => uint256) public values;

    event ValueSet(bytes32 indexed key, uint256 value);

    constructor(address governor_) {
        governor = governor_;
    }

    modifier onlyGovernor() {
        require(msg.sender == governor, "not_governor");
        _;
    }

    function setValue(bytes32 key, uint256 value) external onlyGovernor {
        values[key] = value;
        emit ValueSet(key, value);
    }
}
