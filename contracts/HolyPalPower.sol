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
    
    /** @notice Anchor block used to approximate past block number calculations */
    uint256 private constant ANCHOR_BLOCK = 14709709;
    /** @notice Anchor timestamp used to approximate past block number calculations */
    uint256 private constant ANCHOR_TIMESTAMP = 1651650836;

    /** @notice Scale unit used for past block number calculations */
    uint256 private constant SCALE_UNIT = 1000000000;


    // Storage

    /** @notice Address of the hPAL contract */
    address public immutable hPal;


    // Constructor

    constructor(address _hPal) {
        hPal = _hPal;
    }


    // External Methods

    /**
    * @notice Returns the hPalPower balance of a user
    * @dev Returns the hPalPower balance of a user (based on current Lock)
    * @param user Address of the user
    * @return uint256 : hPalPower balance
    */
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

    /**
    * @notice Returns the hPalPower balance of a user at a given timestamp
    * @dev Returns the hPalPower balance of a user at a given timestamp (based on past Lock)
    * @param user Address of the user
    * @param timestamp Timestamp to get the balance at
    * @return uint256 : hPalPower balance
    */
    function balanceOfAt(address user, uint256 timestamp) external view returns(uint256) {
        // Fetch the user Lock for the given timestamp
        Point memory point = _convertLock(_findUserPastLock(user, timestamp));

        // Return 0 if the found Lock was expired
        if(point.endTimestamp <= timestamp) return 0;

        // Calculate the balance based on the slope and end of the lock
        return (uint128(point.slope) * (point.endTimestamp - timestamp));
    }

    /**
    * @notice Returns the user Point (slope & bias) for the current Lock
    * @dev Returns the user Point (slope & bias) for the current Lock
    * @param user Address of the user
    * @return Point : User Point
    */
    function getUserPoint(address user) external view returns(Point memory) {
        return _convertLock(IHolyPaladinToken(hPal).getUserLock(user));
    }

    /**
    * @notice Returns the user Point (slope & bias) for the Lock at a given timestamp
    * @dev Returns the user Point (slope & bias) for the Lock at a given timestamp
    * @param user Address of the user
    * @param timestamp Timestamp to get the balance at
    * @return Point : User Point
    */
    function getUserPointAt(address user, uint256 timestamp) external view returns(Point memory) {
        return _convertLock(_findUserPastLock(user, timestamp));
    }

    /**
    * @notice Returns the user Lock end timestamp
    * @dev Returns the user Lock end timestamp (rounded down to weeks)
    * @param user Address of the user
    * @return uint256 : Lock end timestamp
    */
    // to match with veToken interface
    // solhint-disable-next-line
    function locked__end(address user) external view returns(uint256) {
        IHolyPaladinToken.UserLock memory currentLock = IHolyPaladinToken(hPal).getUserLock(user);
        // Round down the Lock end to weeks (for voting purposes)
        return ((currentLock.startTimestamp + currentLock.duration) / WEEK) * WEEK;
    }

    /**
    * @notice Returns the total hPALPower supply
    * @dev Returns the total hPALPower supply
    * @return uint256 : Total hPALPower supply
    */
    function totalSupply() external view returns(uint256) {
        return IHolyPaladinToken(hPal).getCurrentTotalLock().total;
    }

    /**
    * @notice Returns the total amount of hPAL locked
    * @dev Returns the total amount of hPAL locked
    * @return uint256 : Total hPAL locked
    */
    function totalLocked() external view returns(uint256) {
        return IHolyPaladinToken(hPal).getCurrentTotalLock().total;
    }

    /**
    * @notice Returns the total amount of hPAL locked at a given block
    * @dev Returns the total amount of hPAL locked at a given block
    * @param blockNumber Number of the block to get the total locked at
    * @return uint256 : Total hPAL locked
    */
    function totalLockedAt(uint256 blockNumber) external view returns(uint256) {
        return IHolyPaladinToken(hPal).getPastTotalLock(blockNumber).total;
    }


    // Internal functions

    /**
    * @dev Converts a user Lock to a Point (slope & bias)
    * @param lock Lock to convert
    * @return Point : User Point
    */
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

    /**
    * @dev Returns the user Lock at a given timestamp
    * @param user Address of the user
    * @param timestamp Timestamp to get the Lock at
    * @return UserLock : User Lock
    */
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
            mid = avg(low, high);
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

    /**
    * @dev Calculates the approximative block number for a given timestamp
    * @param timestamp Timestamp to find the block number for
    * @return uint256 : Calculated block number
    */
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

    // Taken from Solady FixedPointMathLib.sol
    /// @dev Returns the average of `x` and `y`.
    function avg(uint256 x, uint256 y) internal pure returns (uint256 z) {
        unchecked {
            z = (x & y) + ((x ^ y) >> 1);
        }
    }

}