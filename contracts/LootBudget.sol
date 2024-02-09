//██████╗  █████╗ ██╗      █████╗ ██████╗ ██╗███╗   ██╗
//██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██║████╗  ██║
//██████╔╝███████║██║     ███████║██║  ██║██║██╔██╗ ██║
//██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██║██║╚██╗██║
//██║     ██║  ██║███████╗██║  ██║██████╔╝██║██║ ╚████║
//╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝
 

//SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILootCreator} from "./interfaces/ILootCreator.sol";
import "./utils/Owner.sol";
import "./libraries/Errors.sol";

/** @title Loot Budget contract */
/// @author Paladin
/*
    Contract holding the PAL & extra token budget for the Loot system
    and managing the preiodical allocation to the LootReserve
*/

contract LootBudget is Owner, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants

    /** @notice Seconds in a Week */
    uint256 private constant WEEK = 604800;


    // Storage

    /** @notice Address of the PAL token */
    address immutable public pal;
    /** @notice Address of the extra token */
    address immutable public extraToken;
    
    /** @notice Address of the Loot Creator contract */
    address immutable public lootCreator;
    /** @notice Address of the Loot Reserve contract */
    address immutable public lootReserve;

    /** @notice Limit amount of PAL allocated weekly */
    uint256 public palWeeklyLimit;
    /** @notice Limit amount of extra token allocated weekly */
    uint256 public extraWeeklyLimit;

    /** @notice Amount of PAL allocated weekly */
    uint256 public palWeeklyBudget;
    /** @notice Amount of extra token allocated weekly */
    uint256 public extraWeeklyBudget;

    /** @notice Flag set if the period's budget was already claimed */
    mapping(uint256 => bool) public periodBudgetClaimed;


    // Events

    /** @notice Event emitted when the PAL weekly limit is updated */
    event PalWeeklyLimitUpdated(uint256 oldLimit, uint256 newLimit);
    /** @notice Event emitted when when the extra token weekly limit is updated */
    event ExtraWeeklyLimitUpdated(uint256 oldLimit, uint256 newLimit);
    /** @notice Event emitted when the PAL weekly budget is updated */
    event PalWeeklyBudgetUpdated(uint256 oldBudget, uint256 newBudget);
    /** @notice Event emitted when when the extra token weekly budget is updated */
    event ExtraWeeklyBudgetUpdated(uint256 oldBudget, uint256 newBudget);
    /** @notice Event emitted when the Reserve is canceled and token claimed back */
    event CancelReserve(uint256 retrievedPalAmount, uint256 retrievedExtraAmount);


    // Constructor

    constructor(
        address _pal,
        address _extraToken,
        address _lootCreator,
        address _lootReserve,
        uint256 _palWeeklyBudget,
        uint256 _extraWeeklyBudget,
        uint256 _palWeeklyLimit,
        uint256 _extraWeeklyLimit
    ) {
        if(
            _pal == address(0)
            || _extraToken == address(0)
            || _lootCreator == address(0)
            || _lootReserve == address(0)
        ) revert Errors.AddressZero();

        pal = _pal;
        extraToken = _extraToken;
        lootCreator = _lootCreator;
        lootReserve = _lootReserve;
        palWeeklyBudget = _palWeeklyBudget;
        extraWeeklyBudget = _extraWeeklyBudget;
        palWeeklyLimit = _palWeeklyLimit;
        extraWeeklyLimit = _extraWeeklyLimit;
    }


    // State-changing functions

    /**
    * @notice Update the period budget
    * @dev Send the period budget to the LootReserve (PAL & extra token if set)
    */
    function updateLootBudget() external nonReentrant {
        uint256 currentPeriod = (block.timestamp / WEEK) * WEEK;
        uint256 palAmount = palWeeklyBudget;
        uint256 extraAmount = extraWeeklyBudget;

        // Set the current period as claimed
        if(periodBudgetClaimed[currentPeriod]) return;
        periodBudgetClaimed[currentPeriod] = true;

        // Send the budget to the LootReserve
        IERC20(pal).safeTransfer(lootReserve, palAmount);
        if(extraAmount > 0) {
            IERC20(extraToken).safeTransfer(lootReserve, extraAmount);
        }

        // Notify the LootCreator of the new budget
        ILootCreator(lootCreator).notifyNewBudget(palAmount, extraAmount);
    }


    // Admin functions

    function setPalWeeklyLimit(uint256 newLimit) external onlyOwner() {
        uint256 oldLimit = palWeeklyLimit;
        palWeeklyLimit = newLimit;

        emit PalWeeklyLimitUpdated(oldLimit, newLimit);
    }

    function setExtraWeeklyLimit(uint256 newLimit) external onlyOwner() {
        uint256 oldLimit = extraWeeklyLimit;
        extraWeeklyLimit = newLimit;

        emit ExtraWeeklyLimitUpdated(oldLimit, newLimit);
    }

    /**
    * @notice Updates the PAL weekly budget
    * @dev Updates the PAL weekly budget
    * @param newBudget new weekly budget amount
    */
    function updatePalWeeklyBudget(uint256 newBudget) external onlyOwner() {
        if(newBudget > palWeeklyLimit) revert Errors.LootBudgetExceedLimit();

        uint256 oldBudget = palWeeklyBudget;
        palWeeklyBudget = newBudget;

        emit PalWeeklyBudgetUpdated(oldBudget, newBudget);
    }

    /**
    * @notice Updates the extra token weekly budget
    * @dev Updates the extra token weekly budget
    * @param newBudget new weekly budget amount
    */
    function updateExtraWeeklyBudget(uint256 newBudget) external onlyOwner() {
        if(newBudget > extraWeeklyLimit) revert Errors.LootBudgetExceedLimit();

        uint256 oldBudget = extraWeeklyBudget;
        extraWeeklyBudget = newBudget;

        emit ExtraWeeklyBudgetUpdated(oldBudget, newBudget);
    }

    /**
    * @notice Empty this contract and send all tokens to the owner
    * @dev Empty this contract and send all tokens to the owner
    */
    function emptyReserve() external onlyOwner {
        uint256 palBalance = IERC20(pal).balanceOf(address(this));
        uint256 extraBalance = IERC20(extraToken).balanceOf(address(this));

        IERC20(pal).safeTransfer(owner(), palBalance);
        IERC20(extraToken).safeTransfer(owner(), extraBalance);

        emit CancelReserve(palBalance, extraBalance);
    }

}