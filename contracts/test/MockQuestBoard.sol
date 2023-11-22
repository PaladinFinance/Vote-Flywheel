// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../interfaces/libraries/QuestDataTypes.sol";

contract MockQuestBoard {

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

    mapping(uint256 => Quest) public quests;

    mapping(uint256 => mapping(address => uint256[])) public questIdsForGaugePerPeriod;

    function addQuest(uint256 id, address gauge) external {
        quests[id] = Quest(
            address(0),
            address(0),
            gauge,
            0,
            0,
            0,
            QuestTypes(
                QuestDataTypes.QuestVoteType.NORMAL,
                QuestDataTypes.QuestRewardsType.FIXED,
                QuestDataTypes.QuestCloseType.NORMAL
            )
        );
    }

    function addQuestIdForGaugePerPeriod(uint256 period, address gauge, uint256[] calldata ids) external {
        questIdsForGaugePerPeriod[period][gauge] = ids;
    }

    function getQuestIdsForPeriodForGauge(address gauge, uint256 period) external view returns (uint256[] memory) {
        return questIdsForGaugePerPeriod[period][gauge];
    }
    
}