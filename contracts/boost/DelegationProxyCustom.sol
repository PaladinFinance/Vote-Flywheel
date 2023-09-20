//██████╗  █████╗ ██╗      █████╗ ██████╗ ██╗███╗   ██╗
//██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██║████╗  ██║
//██████╔╝███████║██║     ███████║██║  ██║██║██╔██╗ ██║
//██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██║██║╚██╗██║
//██║     ██║  ██║███████╗██║  ██║██████╔╝██║██║ ╚████║
//╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝
 

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../utils/Owner.sol";

/** @title Boost Delegation Proxy v2.1 custom contract */
/// @author Curve, modified by Paladin
/*
    TODO
    Note : not following the mixedCase convention to match Vyper version of BoostV2
*/

interface HolyPalPower {

    function balanceOf(address _user) external view returns(uint256);
    function balanceOfAt(address _user, uint256 _timestamp) external view returns(uint256);

    function totalLocked() external view returns(uint256);
    function totalLockedAt(uint256 blockNumber) external view returns(uint256);
}

interface VeDelegation {

    struct SlopeChange {
        uint256 slopeChange;
        uint256 endTimestamp;
    }

    // solhint-disable-next-line
    function adjusted_balance_of(address _account) external view returns(uint256);
    // solhint-disable-next-line
    function adjusted_balance_of_at(address _account, uint256 _ts) external view returns(uint256);

    function totalLocked() external view returns(uint256);
    function totalLockedAt(uint256 blockNumber) external view returns(uint256);

    // solhint-disable-next-line
    function voting_adjusted_balance_of_at(address _user, uint256 _snapshot_ts, uint256 _target_ts) external view returns(uint256);

    function getUserSlopeChanges(address _user) external view returns(SlopeChange[] memory);
}


contract DelegationProxyCustom is Owner {

    // Storage

    address public immutable HOLY_PAL_POWER;

    address public delegation;


    // Events

    event DelegationSet(address delegation);


    // Constructor

    constructor(address _voting_escrow, address _delegation) {
        HOLY_PAL_POWER = _voting_escrow;

        delegation = _delegation;

        emit DelegationSet(_delegation);
    }


    // User Methods

    // solhint-disable-next-line
    function adjusted_balance_of(address _account) external view returns(uint256) {
        address _delegation = delegation;
        if(_delegation == address(0)) return HolyPalPower(HOLY_PAL_POWER).balanceOf(_account);

        return VeDelegation(_delegation).adjusted_balance_of(_account);
    }

    // solhint-disable-next-line
    function adjusted_balance_of_at(address _account, uint256 _ts) external view returns(uint256) {
        address _delegation = delegation;
        if(_delegation == address(0)) return HolyPalPower(HOLY_PAL_POWER).balanceOfAt(_account, _ts);

        return VeDelegation(_delegation).adjusted_balance_of_at(_account, _ts);
    }

    // solhint-disable-next-line
    function total_locked() external view returns(uint256) {
        return HolyPalPower(HOLY_PAL_POWER).totalLocked();
    }

    // solhint-disable-next-line
    function total_locked_at(uint256 _blockNumber) external view returns(uint256) {
        return HolyPalPower(HOLY_PAL_POWER).totalLockedAt(_blockNumber);
    }

    function getUserSlopeChanges(address _user) external view returns(VeDelegation.SlopeChange[] memory) {
        address _delegation = delegation;
        VeDelegation.SlopeChange[] memory empty = new VeDelegation.SlopeChange[](0);
        if(_delegation == address(0)) return empty;

        return VeDelegation(_delegation).getUserSlopeChanges(_user);
    }


    // Admin Methods

    // solhint-disable-next-line
    function kill_delegation() external onlyOwner {
        delegation = address(0);
        emit DelegationSet(address(0));
    }

    // solhint-disable-next-line
    function set_delegation(address _delegation) external onlyOwner {
        // call `adjusted_balance_of` to make sure it works
        VeDelegation(_delegation).adjusted_balance_of(msg.sender);

        delegation = _delegation;
        emit DelegationSet(_delegation);
    }

}