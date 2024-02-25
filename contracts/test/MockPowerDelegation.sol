// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract MockPowerDelegation {

    struct Point {
        int128 bias;
        int128 slope;
        uint256 endTimestamp;
        uint256 blockNumber;
    }

    mapping(address => mapping(uint256 => uint256)) public adjustedBalancesAt;
    mapping(uint256 => uint256) public totalLockedAt;
    mapping(address => mapping(uint256 => Point)) public userPoints;
    mapping(address => uint256) public userLocksEnd;
    mapping(uint256 => uint256) public totalLockedAtTs;

    function setAdjustedBalanceAt(address account, uint256 period, uint256 amount) external {
        adjustedBalancesAt[account][period] = amount;
    }

    function setTotalLockedAt(uint256 blockNumber, uint256 amount) external {
        totalLockedAt[blockNumber] = amount;
    }

    // solhint-disable-next-line
    function adjusted_balance_of_at(address account, uint256 period) external view returns (uint256) {
        return adjustedBalancesAt[account][period];
    }

    // solhint-disable-next-line
    function total_locked_at(uint256 blockNumber) external view returns (uint256) {
        return totalLockedAt[blockNumber];
    }
    
    // solhint-disable-next-line
    function locked__end(address user) external view returns(uint256) {
        return userLocksEnd[user];
    }

    function setLockedEnd(address user, uint256 timestamp) external {
        userLocksEnd[user] = timestamp;
    }

    function getUserPointAt(address user, uint256 timestamp) external view returns(Point memory) {
        return userPoints[user][timestamp];
    }

    function setUserPointAt(address user, uint256 timestamp, Point memory point) external {
        userPoints[user][timestamp] = point;
    }

    // solhint-disable-next-line
    function find_total_locked_at(uint256 timestamp) external view returns(uint256) {
        return totalLockedAtTs[timestamp];
    }
    
    function setTotalLockedAtTs(uint256 timestamp, uint256 amount) external {
        totalLockedAtTs[timestamp] = amount;
    }
}