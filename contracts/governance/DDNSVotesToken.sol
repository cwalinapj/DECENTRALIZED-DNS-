// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

contract DDNSVotesToken is ERC20, ERC20Permit, ERC20Votes {
    address public owner;

    constructor(string memory name_, string memory symbol_, address owner_) ERC20(name_, symbol_) ERC20Permit(name_) {
        owner = owner_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "not_owner");
        _mint(to, amount);
    }

    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function _mint(address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._mint(to, value);
    }

    function _burn(address account, uint256 value) internal override(ERC20, ERC20Votes) {
        super._burn(account, value);
    }
}
