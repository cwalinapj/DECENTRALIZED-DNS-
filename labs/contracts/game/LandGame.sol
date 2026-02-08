// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LandPlot} from "./LandPlot.sol";
import {OreToken} from "./OreToken.sol";

contract LandGame {
    struct LandState {
        uint8 level;
        uint64 lastClaim;
    }

    IERC20 public immutable nativeToken;
    OreToken public immutable oreToken;
    LandPlot public immutable land;
    address public treasury;

    uint256 public landPrice;
    uint256 public orePerNative;
    uint256 public baseRatePerSecond;
    uint8 public maxLevel;
    uint256[] public upgradeCosts;

    mapping(uint256 => LandState) public landState;

    event LandMinted(address indexed owner, uint256 indexed landId);
    event OreClaimed(address indexed owner, uint256 indexed landId, uint256 amount);
    event LandUpgraded(uint256 indexed landId, uint8 newLevel);
    event OreRedeemed(address indexed owner, uint256 oreAmount, uint256 nativeOut);

    constructor(
        address nativeToken_,
        address treasury_,
        uint256 landPrice_,
        uint256 orePerNative_,
        uint256 baseRatePerSecond_,
        uint8 maxLevel_,
        uint256[] memory upgradeCosts_
    ) {
        nativeToken = IERC20(nativeToken_);
        treasury = treasury_;
        landPrice = landPrice_;
        orePerNative = orePerNative_;
        baseRatePerSecond = baseRatePerSecond_;
        maxLevel = maxLevel_;
        upgradeCosts = upgradeCosts_;

        land = new LandPlot(address(this));
        oreToken = new OreToken(address(this));
    }

    function mintLand() external returns (uint256) {
        if (landPrice > 0) {
            require(nativeToken.transferFrom(msg.sender, treasury, landPrice), "payment_failed");
        }
        uint256 landId = land.mintTo(msg.sender);
        landState[landId] = LandState({ level: 1, lastClaim: uint64(block.timestamp) });
        emit LandMinted(msg.sender, landId);
        return landId;
    }

    function claim(uint256 landId) external {
        require(land.ownerOf(landId) == msg.sender, "not_owner");
        LandState storage state = landState[landId];
        uint256 elapsed = block.timestamp - state.lastClaim;
        require(elapsed > 0, "nothing_to_claim");
        uint256 rate = baseRatePerSecond * state.level;
        uint256 amount = elapsed * rate;
        state.lastClaim = uint64(block.timestamp);
        oreToken.mint(msg.sender, amount);
        emit OreClaimed(msg.sender, landId, amount);
    }

    function upgrade(uint256 landId) external {
        require(land.ownerOf(landId) == msg.sender, "not_owner");
        LandState storage state = landState[landId];
        require(state.level < maxLevel, "max_level");
        uint8 nextLevel = state.level + 1;
        uint256 cost = upgradeCosts[nextLevel];
        oreToken.burn(msg.sender, cost);
        state.level = nextLevel;
        emit LandUpgraded(landId, nextLevel);
    }

    function redeemOre(uint256 oreAmount) external {
        require(oreAmount > 0, "zero_amount");
        require(oreAmount % orePerNative == 0, "invalid_amount");
        uint256 nativeOut = oreAmount / orePerNative;
        oreToken.burn(msg.sender, oreAmount);
        require(nativeToken.transfer(msg.sender, nativeOut), "native_transfer_failed");
        emit OreRedeemed(msg.sender, oreAmount, nativeOut);
    }

    function getUpgradeCost(uint8 level) external view returns (uint256) {
        return upgradeCosts[level];
    }
}
