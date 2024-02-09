// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Loot} from "../Loot.sol";

contract MockCreator {

    address public immutable loot;

    uint256 public slashedAmount;

    uint256 public palBudget;
    uint256 public extraBudget;

    // id -> period -> total
    mapping(uint256 => mapping(uint256 => uint256)) public totalQuestPeriodRewards;
    mapping(uint256 => mapping(uint256 => bool)) public totalQuestPeriodSet;
    // id -> period -> user -> amount
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public userQuestPeriodRewards;

    bool public emergencyNotified;

    constructor(
        address _loot
    ) {
        loot = _loot;
    }

    function notifyUndistributedRewards(uint256 amount) external {
        slashedAmount += amount;
    }

    function createLoot(address user, uint256 startTs, uint256 palAmount, uint256 extraAmount) external {
        Loot(loot).createLoot(user, startTs, palAmount, extraAmount);
    }

    function notifyNewBudget(uint256 palAmount, uint256 extraAmount) external {
        palBudget += palAmount;
        extraBudget += extraAmount;
    }

    function notifyDistributedQuestPeriod(uint256 questID, uint256 period, uint256 totalAmount) external {
        totalQuestPeriodRewards[questID][period] = totalAmount;
        totalQuestPeriodSet[questID][period] = true;
    }

    function notifyFixedQuestPeriod(uint256 questId, uint256 period, uint256 newTotalRewards) external {
        totalQuestPeriodRewards[questId][period] = newTotalRewards;
    }

    function notifyAddedRewardsQuestPeriod(uint256 questId, uint256 period, uint256 addedRewards) external {
        totalQuestPeriodRewards[questId][period] += addedRewards;
        emergencyNotified = true;
    }

    function resetEmergencyNotified() external {
        emergencyNotified = false;
    }

    function notifyQuestClaim(address user, uint256 questID, uint256 period, uint256 claimedAmount) external {
        userQuestPeriodRewards[questID][period][user] = claimedAmount;
    }

}