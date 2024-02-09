// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ILootCreator} from "../interfaces/ILootCreator.sol";

contract MockDistributor {

    address immutable public questBoard;

    constructor(
        address _questBoard
    ) {
        questBoard = _questBoard;
    }

    function sendNotifyDistributedQuestPeriod(address target, uint256 questId, uint256 period, uint256 totalRewards) external {
        ILootCreator(target).notifyDistributedQuestPeriod(questId, period, totalRewards);
    }

    function sendNotifyQuestClaim(address target, address user, uint256 questId, uint256 period, uint256 claimedAmount) external {
        ILootCreator(target).notifyQuestClaim(user, questId, period, claimedAmount);
    }

    function sendNotifyFixedQuestPeriod(address target, uint256 questId, uint256 period, uint256 newTotalRewards) external {
        ILootCreator(target).notifyFixedQuestPeriod(questId, period, newTotalRewards);
    }

    function sendNotifyAddedRewardsQuestPeriod(address target, uint256 questId, uint256 period, uint256 addedRewards) external {
        ILootCreator(target).notifyAddedRewardsQuestPeriod(questId, period, addedRewards);
    }

}