// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract MockBoost {

    struct SlopeChange {
        uint256 slopeChange;
        uint256 endTimestamp;
    }

    mapping(address => uint256) private adjustedBalances;
    mapping(address => mapping(uint256 => uint256)) private adjustedBalancesAt;

    mapping(address => SlopeChange[]) private slopeChanges;

    uint256 public totalLocked;
    mapping(uint256 => uint256) public totalLockedAt;
    
    function setTotalLocked(uint256 amount) external {
        totalLocked = amount;
    }
    
    function setTotalLockedAt(uint256 blockNumber, uint256 amount) external {
        totalLockedAt[blockNumber] = amount;
    }
    
    function setAdjustedBalanceAt(address user, uint256 ts, uint256 balance) external {
        adjustedBalancesAt[user][ts] = balance;
    }
    
    function setAdjustedBalance(address user, uint256 balance) external {
        adjustedBalances[user] = balance;
    }

    function adjusted_balance_of(address user) external view returns(uint256) {
        return adjustedBalances[user];
    }

    function adjusted_balance_of_at(address user, uint256 ts) external view returns(uint256) {
        return adjustedBalancesAt[user][ts];
    }

    function setUserSlopeChanges(address _user, SlopeChange[] memory changes) external {
        uint256 length = changes.length;
        for(uint256 i; i < length; i++) {
            slopeChanges[_user].push(changes[i]);
        }
    }

    function getUserSlopeChanges(address _user) external view returns(SlopeChange[] memory) {
        return slopeChanges[_user];
    }
}