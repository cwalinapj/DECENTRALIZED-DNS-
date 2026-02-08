// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {DDNSVotesToken} from "../governance/DDNSVotesToken.sol";
import {DDNSGovernor} from "../governance/DDNSGovernor.sol";
import {DDNSTimelock} from "../governance/Timelock.sol";

contract DeployGovernance is Script {
    function run() external {
        address owner = vm.envAddress("GOV_TOKEN_OWNER");
        string memory name = vm.envString("GOV_TOKEN_NAME");
        string memory symbol = vm.envString("GOV_TOKEN_SYMBOL");
        uint256 minDelay = vm.envUint("TIMELOCK_MIN_DELAY_SEC");
        uint48 votingDelay = uint48(vm.envUint("GOV_VOTING_DELAY_SEC"));
        uint32 votingPeriod = uint32(vm.envUint("GOV_VOTING_PERIOD_SEC"));
        uint256 proposalThreshold = vm.envUint("GOV_PROPOSAL_THRESHOLD");
        uint256 quorumPercent = vm.envUint("GOV_QUORUM_PERCENT");

        vm.startBroadcast();
        DDNSVotesToken token = new DDNSVotesToken(name, symbol, owner);
        address[] memory proposers = new address[](1);
        proposers[0] = address(0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        DDNSTimelock timelock = new DDNSTimelock(minDelay, proposers, executors);
        DDNSGovernor governor = new DDNSGovernor(
            token,
            timelock,
            votingDelay,
            votingPeriod,
            proposalThreshold,
            quorumPercent
        );
        vm.stopBroadcast();

        console2.log("DDNSVotesToken:", address(token));
        console2.log("DDNSTimelock:", address(timelock));
        console2.log("DDNSGovernor:", address(governor));
    }
}
