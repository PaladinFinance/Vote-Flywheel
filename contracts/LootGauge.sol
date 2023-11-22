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
import {IPaladinBudgetController} from "./interfaces/IPaladinBudgetController.sol";
import {ILootCreator} from "./interfaces/ILootCreator.sol";
import "./utils/Owner.sol";
import "./libraries/Errors.sol";

/** @title Loot Gauge contract */
/// @author Paladin
/*
    TODO: Add comments
*/

contract LootGauge is Owner, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Storage

    address immutable public pal;
    address immutable public extraToken;
    
    address immutable public lootCreator;
    address immutable public lootReserve;

    address public budgetController;


    // Events

    event BudgetControllerSet(address indexed budgetController);


    // Constructor

    constructor(
        address _pal,
        address _extraToken,
        address _lootCreator,
        address _lootReserve
    ) {
        pal = _pal;
        extraToken = _extraToken;
        lootCreator = _lootCreator;
        lootReserve = _lootReserve;
    }

    function setBudgetController(address _budgetController) external onlyOwner {
        budgetController = _budgetController;

        emit BudgetControllerSet(_budgetController);
    }


    // State-changing functions

    function updateLootBudget() external nonReentrant {
        if(budgetController == address(0)) return;

        IPaladinBudgetController(budgetController).checkpoint(address(this));

        (uint256 palBudget, uint256 extraBudget) = IPaladinBudgetController(budgetController).getCurrentBudget(address(this));
        if(palBudget == 0 && extraBudget == 0) return;

        (uint256 palAmount, uint256 extraAmount) = IPaladinBudgetController(budgetController).sendBudget(address(this), lootReserve);

        ILootCreator(lootCreator).notifyNewBudget(palAmount, extraAmount);
    }


    // Admin functions

    function sendLootBudget(uint256 palAmount, uint256 extraAmount) external nonReentrant onlyOwner() {
        IERC20(pal).safeTransfer(lootReserve, palAmount);
        if(extraAmount > 0) {
            IERC20(extraToken).safeTransfer(lootReserve, extraAmount);
        }

        ILootCreator(lootCreator).notifyNewBudget(palAmount, extraAmount);
    }

}