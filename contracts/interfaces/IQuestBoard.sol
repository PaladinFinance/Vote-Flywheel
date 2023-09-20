// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

import "./libraries/QuestDataTypes.sol";

interface IQuestBoard {

	/** @notice Struct with all the Quest types */
    struct QuestTypes {
        QuestDataTypes.QuestVoteType voteType;
        QuestDataTypes.QuestRewardsType rewardsType;
        QuestDataTypes.QuestCloseType closeType;
    }

	/** @notice Struct holding the parameters of the Quest common for all periods */
    struct Quest {
        // Address of the Quest creator (caller of createQuest() method)
        address creator;
        // Address of the ERC20 used for rewards
        address rewardToken;
        // Address of the target Gauge
        address gauge;
        // Total number of periods for the Quest
        uint48 duration;
        // Timestamp where the 1st QuestPeriod starts
        uint48 periodStart;
        // Total amount of rewards paid for this Quest
        // If changes were made to the parameters of this Quest, this will account
        // any added reward amounts
        uint256 totalRewardAmount;
        // Quest Types
        QuestTypes types;
    }
    
	function getQuestIdsForPeriodForGauge(address gauge, uint256 period) external view returns(uint256[] memory);
    
	function quests(uint256 id) external view returns(Quest memory);

}
