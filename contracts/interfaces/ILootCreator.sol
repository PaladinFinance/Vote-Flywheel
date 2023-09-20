// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

interface ILootCreator {

	function createLoot(address user, uint256 questId, uint256 period, uint256 claimedAmount, uint256 totalAmount) external;
    
	function notifyDistributedQuestPeriod(uint256 questId, uint256 period, uint256 totalRewards) external;
	function notifyUndistributedRewards(uint256 palAmount) external;

	function notifyNewBudget(uint256 palAmount, uint256 extraAmount) external;
}
