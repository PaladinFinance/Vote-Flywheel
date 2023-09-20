// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

interface IHolyPaladinToken {
    
	struct UserLock {
        // Amount of locked balance
        uint128 amount; // safe because PAL max supply is 10M tokens
        // Start of the Lock
        uint48 startTimestamp;
        // Duration of the Lock
        uint48 duration;
        // BlockNumber for the Lock
        uint32 fromBlock; // because we want to search by block number
    }

    struct TotalLock {
        // Total locked Supply
        uint224 total;
        // BlockNumber for the last update
        uint32 fromBlock;
    }

    function getUserLockCount(address user) external view returns (uint256);

    function getUserLock(address user) external view returns (UserLock memory);

    function getUserPastLock(
        address user,
        uint256 blockNumber
    ) external view returns (UserLock memory);

    function getTotalLockLength() external view returns(uint256);

    function getCurrentTotalLock() external view returns (TotalLock memory);

    function getPastTotalLock(
        uint256 blockNumber
    ) external view returns (TotalLock memory);

    function userLocks(
        address user,
        uint256 index
    ) external view returns (UserLock memory);

    function totalLocks(
        uint256 index
    ) external view returns (TotalLock memory);

	function totalSupply() external view returns(uint256);
}
