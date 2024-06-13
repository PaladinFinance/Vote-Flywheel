// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

import "./libraries/QuestDataTypes.sol";

interface IQuestBoard2 {

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
        // Total reward amount that can be distributed for each period
        uint256 rewardAmountPerPeriod;
        // Min Amount of reward for each vote (for 1 veToken)
        uint256 minRewardPerVote;
        // Max Amount of reward for each vote (for 1 veToken)
        uint256 maxRewardPerVote;
        // Min Target Bias for the Gauge
        uint256 minObjectiveVotes;
        // Max Target Bias for the Gauge
        uint256 maxObjectiveVotes;
        // Quest Types
        QuestTypes types;
    }
    
	function getQuestIdsForPeriodForGauge(address gauge, uint256 period) external view returns(uint256[] memory);
    
	function nextID() external view returns(uint256);

	function quests(uint256 id) external view returns(Quest memory);

    function updateDistributor(address newDistributor) external;
    function createFixedQuest(
        address gauge,
        address rewardToken,
        bool startNextPeriod,
        uint48 duration,
        uint256 rewardPerVote,
        uint256 totalRewardAmount,
        uint256 feeAmount,
        QuestDataTypes.QuestVoteType voteType,
        QuestDataTypes.QuestCloseType closeType,
        address[] calldata voterList
    ) external returns(uint256);
    function closeQuestPeriod(uint256 period) external returns(uint256 closed, uint256 skipped);
    function addMerkleRoot(uint256 questID, uint256 period, uint256 totalAmount, bytes32 merkleRoot) external;

}
