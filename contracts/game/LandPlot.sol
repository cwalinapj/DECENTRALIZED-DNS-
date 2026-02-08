// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract LandPlot is ERC721 {
    address public minter;
    uint256 public nextId;

    constructor(address minter_) ERC721("DDNS Land", "LAND") {
        minter = minter_;
        nextId = 1;
    }

    function mintTo(address to) external returns (uint256) {
        require(msg.sender == minter, "not_minter");
        uint256 tokenId = nextId;
        nextId += 1;
        _safeMint(to, tokenId);
        return tokenId;
    }
}
