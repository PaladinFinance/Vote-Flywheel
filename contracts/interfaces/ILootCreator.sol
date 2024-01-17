// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

interface ILootCreator {

    struct MultiCreate {
        // Address of the Distributor handling the Quest rewards
        address distributor;
        // ID of the Quest
        uint256 questId;
        // Timestamp of the period
        uint256 period;
    }

	function getBudgetForPeriod(uint256 period) external view returns(uint256 palAmount, uint256 extraAmount);
	function getGaugeBudgetForPeriod(
        address gauge,
        uint256 period
    ) external view returns(uint256 palAmount, uint256 extraAmount);
	function getQuestAllocationForPeriod(
        uint256 questId,
        address distributor,
        uint256 period
    ) external view returns(uint256 palPerVote, uint256 extraPerVote);

	function getListedDistributors() external view returns(address[] memory);

	function createLoot(address user, address distributor, uint256 questId, uint256 period) external;
	function createMultipleLoot(address user, MultiCreate[] calldata params) external;

	function notifyQuestClaim(address user, uint256 questId, uint256 period, uint256 claimedAmount) external;
	function notifyDistributedQuestPeriod(uint256 questId, uint256 period, uint256 totalRewards) external;
	function notifyUndistributedRewards(uint256 palAmount) external;
	function notifyNewBudget(uint256 palAmount, uint256 extraAmount) external;

	function updatePeriod() external;
}
