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


    // Storage

    address public immutable hPal;


    // Constructor

    constructor(address _hPal) {
        hPal = _hPal;
    }


    // External Methods

    function balanceOf(address user) external view returns(uint256) {
        IHolyPaladinToken.UserLock memory currentLock = IHolyPaladinToken(hPal).getUserLock(user);
        if(currentLock.amount == 0) return 0;

        uint256 slope = currentLock.amount / currentLock.duration;
        uint256 bias = slope * currentLock.duration;
        uint256 endTimestamp = currentLock.startTimestamp + currentLock.duration;

        return bias - (slope * (endTimestamp - block.timestamp));
    }

    function balanceOfAt(address user, uint256 timestamp) external view returns(uint256) {
        Point memory point = _convertLock(_findUserPastLock(user, timestamp));

        if(point.endTimestamp <= timestamp) return 0;

        return uint128(point.bias) - (uint128(point.slope) * (point.endTimestamp - timestamp));
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
        return currentLock.startTimestamp + currentLock.duration;
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

        // Calculate the slope & bias
        point.slope = convertUint128ToInt128(lock.amount / lock.duration);
        point.bias = point.slope * convertUint128ToInt128(uint128(lock.duration));

        // Fill the rest of the Point
        // (we round down endTimestamp to weeks for voting purposes)
        point.endTimestamp = (lock.startTimestamp + lock.duration / WEEK) * WEEK;
        point.blockNumber = lock.fromBlock;

        return point;
    }

    function _findUserPastLock(address user, uint256 timestamp) internal view returns(IHolyPaladinToken.UserLock memory) {
        IHolyPaladinToken.UserLock memory emptyLock = IHolyPaladinToken.UserLock(0,0,0,0);
        IHolyPaladinToken _hPal = IHolyPaladinToken(hPal);

        uint256 locksCount = _hPal.getUserLockCount(user);
        if(locksCount == 0) return emptyLock;

        // Check curent active Lock is old enough
        IHolyPaladinToken.UserLock memory lock = _hPal.getUserLock(user);
        if(lock.startTimestamp <= timestamp) return lock;

        // Check there is a Lock old enough
        lock = _hPal.userLocks(user, 0);
        if(lock.startTimestamp <= timestamp) return emptyLock;

        // Otherwise look in user Locks to find the correct one
        uint256 high = locksCount - 1; // last Lock already checked
        uint256 low;
        uint256 mid;

        while (low < high) {
            mid = Math.average(low, high);
            IHolyPaladinToken.UserLock memory midLock = _hPal.userLocks(user, mid);
            if (midLock.startTimestamp == timestamp) {
                return midLock;
            }
            if (midLock.startTimestamp > timestamp) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        return high == 0 ? emptyLock : _hPal.userLocks(user, high - 1);
    }

    // Maths

    function convertUint128ToInt128(uint128 value) internal pure returns(int128) {
        if (value > uint128(type(int128).max)) revert Errors.ConversionOverflow();
        return int128(value);
    }

}