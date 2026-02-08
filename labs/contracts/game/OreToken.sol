// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OreToken is ERC20 {
    address public minter;

    constructor(address minter_) ERC20("DDNS Ore", "ORE") {
        minter = minter_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "not_minter");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == minter, "not_minter");
        _burn(from, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        require(from == address(0) || to == address(0), "soulbound");
        super._update(from, to, value);
    }
}
