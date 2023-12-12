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
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ILootCreator} from "./interfaces/ILootCreator.sol";
import "./utils/Owner.sol";
import "./libraries/Errors.sol";

/** @title Loot Budget contract */
/// @author Paladin
/*
    TODO: Add comments
*/

contract LootBudget is Owner, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants

    /** @notice Seconds in a Week */
    uint256 private constant WEEK = 604800;


    // Storage

    address immutable public pal;
    address immutable public extraToken;
    
    address immutable public lootCreator;
    address immutable public lootReserve;

    uint256 public palWeeklyBudget;
    uint256 public extraWeeklyBudget;

    mapping(uint256 => bool) public periodBudgetClaimed;


    // Events

    event PalWeeklyBudgetUpdated(uint256 oldBudget, uint256 newBudget);
    event ExtraWeeklyBudgetUpdated(uint256 oldBudget, uint256 newBudget);


    // Constructor

    constructor(
        address _pal,
        address _extraToken,
        address _lootCreator,
        address _lootReserve,
        uint256 _palWeeklyBudget,
        uint256 _extraWeeklyBudget
    ) {
        pal = _pal;
        extraToken = _extraToken;
        lootCreator = _lootCreator;
        lootReserve = _lootReserve;
        palWeeklyBudget = _palWeeklyBudget;
        extraWeeklyBudget = _extraWeeklyBudget;
    }


    // State-changing functions

    function updateLootBudget() external nonReentrant {
        uint256 currentPeriod = (block.timestamp / WEEK) * WEEK;
        uint256 palAmount = palWeeklyBudget;
        uint256 extraAmount = extraWeeklyBudget;

        if(periodBudgetClaimed[currentPeriod]) return;
        periodBudgetClaimed[currentPeriod] = true;

        IERC20(pal).safeTransfer(lootReserve, palAmount);
        if(extraAmount > 0) {
            IERC20(extraToken).safeTransfer(lootReserve, extraAmount);
        }

        ILootCreator(lootCreator).notifyNewBudget(palAmount, extraAmount);
    }


    // Admin functions

    function updatePalWeeklyBudget(uint256 newBudget) external onlyOwner() {
        uint256 oldBudget = palWeeklyBudget;
        palWeeklyBudget = newBudget;

        emit PalWeeklyBudgetUpdated(oldBudget, newBudget);
    }

    function updateExtraWeeklyBudget(uint256 newBudget) external onlyOwner() {
        uint256 oldBudget = extraWeeklyBudget;
        extraWeeklyBudget = newBudget;

        emit ExtraWeeklyBudgetUpdated(oldBudget, newBudget);
    }

}