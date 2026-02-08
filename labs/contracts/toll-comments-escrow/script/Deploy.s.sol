// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TollCommentsEscrow.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address refundOperator = vm.envAddress("REFUND_OPERATOR");
        address forfeitOperator = vm.envAddress("FORFEIT_OPERATOR");
        uint64 forfeitDelay = uint64(vm.envUint("FORFEIT_DELAY"));

        vm.startBroadcast(deployerKey);
        new TollCommentsEscrow(treasury, refundOperator, forfeitOperator, forfeitDelay);
        vm.stopBroadcast();
    }
}
