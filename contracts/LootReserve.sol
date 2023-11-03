//██████╗  █████╗ ██╗      █████╗ ██████╗ ██╗███╗   ██╗
//██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██║████╗  ██║
//██████╔╝███████║██║     ███████║██║  ██║██║██╔██╗ ██║
//██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██║██║╚██╗██║
//██║     ██║  ██║███████╗██║  ██║██████╔╝██║██║ ╚████║
//╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝
 

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./libraries/Errors.sol";
import "./utils/Owner.sol";

/** @title Loot Reserve contract */
/// @author Paladin
/*
    Reserve holding all tokens (PAL & extra token) to be distributed
    through the Loot contract
*/

contract LootReserve is Owner {
    using SafeERC20 for IERC20;

    // Storage

    IERC20 public immutable pal;
    IERC20 public immutable extraToken;

    address public loot;


    // Events

    event Init(address loot);
    event MaxAllowanceSet(address indexed token, address indexed spender);
    event CancelReserve(uint256 retrievedPalAmount, uint256 retrievedExtraAmount);


    // Constructor & Init

    constructor(
        address _pal,
        address _extraToken
    ){
        pal = IERC20(_pal);
        extraToken = IERC20(_extraToken);
    }

    function init(address _loot) external onlyOwner {
        if(_loot != address(0)) revert Errors.CreatorAlreadySet();
        loot = _loot;

        pal.safeApprove(_loot, type(uint256).max);
        extraToken.safeApprove(_loot, type(uint256).max);

        emit MaxAllowanceSet(address(pal), _loot);
        emit MaxAllowanceSet(address(extraToken), _loot);

        emit Init(_loot);
    }


    // View functions

    function getBalances() external view returns(uint256 palBalance, uint256 extraBalance){
        palBalance = pal.balanceOf(address(this));
        extraBalance = extraToken.balanceOf(address(this));
    }

    function getRemainingAllowances() external view returns(uint256 palAllowance, uint256 extraAllowance){
        palAllowance = pal.allowance(address(this), loot);
        extraAllowance = extraToken.allowance(address(this), loot);
    }


    // Admin functions

    function resetMaxAllowance() external onlyOwner {
        pal.safeApprove(loot, type(uint256).max);
        extraToken.safeApprove(loot, type(uint256).max);

        emit MaxAllowanceSet(address(pal), loot);
        emit MaxAllowanceSet(address(extraToken), loot);
    }

    function emptyReserve() external onlyOwner {
        uint256 palBalance = pal.balanceOf(address(this));
        uint256 extraBalance = extraToken.balanceOf(address(this));

        pal.safeTransfer(owner(), palBalance);
        extraToken.safeTransfer(owner(), extraBalance);

        emit CancelReserve(palBalance, extraBalance);
    }

}