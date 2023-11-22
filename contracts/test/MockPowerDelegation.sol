// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract MockPowerDelegation {

    mapping(address => mapping(uint256 => uint256)) public adjustedBalancesAt;
    mapping(uint256 => uint256) public totalLockedAt;

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
}