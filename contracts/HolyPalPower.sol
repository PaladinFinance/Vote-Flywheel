//██████╗  █████╗ ██╗      █████╗ ██████╗ ██╗███╗   ██╗
//██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██║████╗  ██║
//██████╔╝███████║██║     ███████║██║  ██║██║██╔██╗ ██║
//██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██║██║╚██╗██║
//██║     ██║  ██║███████╗██║  ██║██████╔╝██║██║ ╚████║
//╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝
 

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IHolyPaladinToken} from "./interfaces/IHolyPaladinToken.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IHolyPalPower} from "./interfaces/IHolyPalPower.sol";
import "./libraries/Errors.sol";

/** @title hPAL Power contract */
/// @author Paladin
/*
    Calculates a decreasing power value based on user hPAL Lock.
    The power is expressed as a combo of slope and bias.
    This contracts need to fetch over pas user Locks to find the correct slope & bias.
*/

contract HolyPalPower is IHolyPalPower {

    // Constants

    /** @notice Seconds in a Week */
    uint256 private constant WEEK = 604800;
    
    uint256 private constant ANCHOR_BLOCK = 14709709;
    uint256 private constant ANCHOR_TIMESTAMP = 1651650836;

    uint256 private constant SCALE_UNIT = 1000000000;


    // Storage

    address public immutable hPal;


    // Constructor

    constructor(address _hPal) {
        hPal = _hPal;
    }


    // External Methods

    function balanceOf(address user) external view returns(uint256) {
        // Fetch user current Lock & return 0 if no Lock
        IHolyPaladinToken.UserLock memory currentLock = IHolyPaladinToken(hPal).getUserLock(user);
        if(currentLock.amount == 0) return 0;
        
        // Calculate the end of the current Lock (rounded down to weeks) & return 0 if already expired
        uint256 endTimestamp = ((currentLock.startTimestamp + currentLock.duration) / WEEK) * WEEK;
        if(endTimestamp <= block.timestamp) return 0;
        
        // Calculate the slope
        uint256 duration = endTimestamp - currentLock.startTimestamp;
        uint256 slope = currentLock.amount / duration;

        // Calculate the balance based on the slope and end of the lock
        return (slope * (endTimestamp - block.timestamp));
    }

    function balanceOfAt(address user, uint256 timestamp) external view returns(uint256) {
        // Fetch the user Lock for the given timestamp
        Point memory point = _convertLock(_findUserPastLock(user, timestamp));

        // Return 0 if the found Lock was expired
        if(point.endTimestamp <= timestamp) return 0;

        // Calculate the balance based on the slope and end of the lock
        return (uint128(point.slope) * (point.endTimestamp - timestamp));
    }

    function getUserPoint(address user) external view returns(Point memory) {
        return _convertLock(IHolyPaladinToken(hPal).getUserLock(user));
    }

    function getUserPointAt(address user, uint256 timestamp) external view returns(Point memory) {
        return _convertLock(_findUserPastLock(user, timestamp));
    }

    // to match with veToken interface
    // solhint-disable-next-line
    function locked__end(address user) external view returns(uint256) {
        IHolyPaladinToken.UserLock memory currentLock = IHolyPaladinToken(hPal).getUserLock(user);
        // Round down the Lock end to weeks (for voting purposes)
        return ((currentLock.startTimestamp + currentLock.duration) / WEEK) * WEEK;
    }

    function totalSupply() external view returns(uint256) {
        return IHolyPaladinToken(hPal).getCurrentTotalLock().total;
    }

    function totalLocked() external view returns(uint256) {
        return IHolyPaladinToken(hPal).getCurrentTotalLock().total;
    }

    function totalLockedAt(uint256 blockNumber) external view returns(uint256) {
        return IHolyPaladinToken(hPal).getPastTotalLock(blockNumber).total;
    }


    // Internal functions

    function _convertLock(IHolyPaladinToken.UserLock memory lock) internal pure returns(Point memory) {
        Point memory point = Point(0,0,0,0);

        // Empty Lock (no Lock for user, or not old enough)
        if(lock.amount == 0) return point;
        
        // Get the end timetamp
        // (we round down endTimestamp to weeks for voting purposes)
        point.endTimestamp = ((lock.startTimestamp + lock.duration) / WEEK) * WEEK;
        uint256 duration = point.endTimestamp - lock.startTimestamp;

        // Calculate the slope & bias
        point.slope = convertUint128ToInt128(lock.amount / uint128(duration));
        point.bias = point.slope * convertUint128ToInt128(uint128(duration));

        // Fill the rest of the Point
        point.blockNumber = lock.fromBlock;

        return point;
    }

    function _findUserPastLock(address user, uint256 timestamp) internal view returns(IHolyPaladinToken.UserLock memory) {
        IHolyPaladinToken.UserLock memory emptyLock = IHolyPaladinToken.UserLock(0,0,0,0);
        IHolyPaladinToken _hPal = IHolyPaladinToken(hPal);

        // Get user Lock count, return an empty Point if user never locked
        uint256 locksCount = _hPal.getUserLockCount(user);
        if(locksCount == 0) return emptyLock;


        // Check curent active Lock is old enough
        IHolyPaladinToken.UserLock memory lock = _hPal.getUserLock(user);
        if(timestamp >= block.timestamp) return lock;
        uint256 targetBlockNumber = _findBlockNumberForTimestamp(timestamp);
        if(lock.fromBlock <= targetBlockNumber) return lock;

        // Check there is a Lock old enough
        lock = _hPal.userLocks(user, 0);
        if(lock.fromBlock > targetBlockNumber) return emptyLock;

        // Otherwise look in user Locks to find the correct one
        uint256 high = locksCount - 1; // last Lock already checked
        uint256 low;
        uint256 mid;

        while (low < high) {
            mid = Math.average(low, high);
            IHolyPaladinToken.UserLock memory midLock = _hPal.userLocks(user, mid);
            if (midLock.fromBlock == targetBlockNumber) {
                return midLock;
            }
            if (midLock.fromBlock > targetBlockNumber || midLock.startTimestamp > timestamp) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        return high == 0 ? emptyLock : _hPal.userLocks(user, high - 1);
    }

    function _findBlockNumberForTimestamp(uint256 timestamp) internal view returns(uint256) {
        uint256 deltaBlocks = block.number - ANCHOR_BLOCK;
        uint256 deltaTs = block.timestamp - ANCHOR_TIMESTAMP;

        uint256 secPerBlock = (deltaTs * SCALE_UNIT) / deltaBlocks;

        return block.number - (((block.timestamp - timestamp) * SCALE_UNIT) / secPerBlock);
    }

    // Maths

    function convertUint128ToInt128(uint128 value) internal pure returns(int128) {
        if (value > uint128(type(int128).max)) revert Errors.ConversionOverflow();
        return int128(value);
    }

}