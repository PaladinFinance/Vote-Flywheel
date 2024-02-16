// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract MockPalPower {

    struct Point {
        int128 bias;
        int128 slope;
        uint256 endTimestamp;
        uint256 blockNumber;
    }

    mapping(address => uint256) private balances;
    mapping(address => mapping(uint256 => uint256)) private balancesAt;

    mapping(address => Point) private userPoint;
    mapping(address => mapping(uint256 => Point)) private userPointAt;

    mapping(address => uint256) public locked__end;

    uint256 public totalSupply;

    uint256 public totalLocked;
    mapping(uint256 => uint256) public totalLockedAt;
    mapping(uint256 => uint256) public totalLockedAtTs;
    
    function setTotalSupply(uint256 amount) external {
        totalSupply = amount;
    }
    
    function setTotalLocked(uint256 amount) external {
        totalLocked = amount;
    }
    
    function setTotalLockedAt(uint256 blockNumber, uint256 amount) external {
        totalLockedAt[blockNumber] = amount;
    }
    
    function setBalanceAt(address user, uint256 ts, uint256 balance) external {
        balancesAt[user][ts] = balance;
    }
    
    function setBalance(address user, uint256 balance) external {
        balances[user] = balance;
    }

    function balanceOf(address user) external view returns(uint256) {
        return balances[user];
    }
    
    function setLockedEnd(address user, uint256 ts) external {
        locked__end[user] = ts;
    }

    function balanceOfAt(address user, uint256 ts) external view returns(uint256) {
        return balancesAt[user][ts];
    }

    function setUserPoint(address user, int128 bias, int128 slope, uint256 endTimestamp, uint256 blockNumber) external {
        userPoint[user] = Point(bias, slope, endTimestamp, blockNumber);
    }

    function setUserPointAt(address user, uint256 ts, int128 bias, int128 slope, uint256 endTimestamp, uint256 blockNumber) external {
        userPointAt[user][ts] = Point(bias, slope, endTimestamp, blockNumber);
    }

    function getUserPoint(address user) external view returns(Point memory) {
        return userPoint[user];
    }

    function getUserPointAt(address user, uint256 timestamp) external view returns(Point memory) {
        return userPointAt[user][timestamp];
    }

    function findTotalLockedAt(uint256 timestamp) external view returns(uint256) {
        return totalLockedAtTs[timestamp];
    }
    
    function setTotalLockedAtTs(uint256 timestamp, uint256 amount) external {
        totalLockedAtTs[timestamp] = amount;
    }
}