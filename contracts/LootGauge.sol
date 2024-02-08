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
import {IPaladinBudgetController} from "./interfaces/IPaladinBudgetController.sol";
import {ILootCreator} from "./interfaces/ILootCreator.sol";
import "./utils/Owner.sol";
import "./libraries/Errors.sol";

/** @title Loot Gauge contract */
/// @author Paladin
/*
    Gauge to be used with the BudgetController for PAL incentives,
    handling the part of incentives to be allocated to the Loot system
*/

contract LootGauge is Owner, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Storage

    /** @notice Address of the PAL token */
    address immutable public pal;
    /** @notice Address of the extra token */
    address immutable public extraToken;
    
    /** @notice Address of the Loot Creator contract */
    address immutable public lootCreator;
    /** @notice Address of the Loot Reserve contract */
    address immutable public lootReserve;

    /** @notice Address of the Budget Controller contract */
    address public budgetController;


    // Events

    /** @notice Event emitted when the Budget Controller address is set */
    event BudgetControllerSet(address indexed budgetController);


    // Constructor

    constructor(
        address _pal,
        address _extraToken,
        address _lootCreator,
        address _lootReserve
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
    }

    /**
    * @notice Set the BudgetController contract address
    * @dev Set the BudgetController contract address
    * @param _budgetController Address of the BudgetController contract
    */
    function setBudgetController(address _budgetController) external onlyOwner {
        budgetController = _budgetController;

        emit BudgetControllerSet(_budgetController);
    }


    // State-changing functions

    /**
    * @notice Update the period budget
    * @dev Claim the period budget from the BudgetController & send the period budget to the LootReserve (PAL & extra token if set)
    */
    function updateLootBudget() external nonReentrant {
        if(budgetController == address(0)) return;
        IPaladinBudgetController controller = IPaladinBudgetController(budgetController);

        // Checkpoint this gauge in the Controller
        controller.checkpoint(address(this));

        // Get the current budget from the Controller
        (uint256 palBudget, uint256 extraBudget) = controller.getCurrentBudget(address(this));
        if(palBudget == 0 && extraBudget == 0) return;

        // Send the budget to the LootReserve
        (uint256 palAmount, uint256 extraAmount) = controller.sendBudget(address(this), lootReserve);

        // Notify the LootCreator of the new budget
        ILootCreator(lootCreator).notifyNewBudget(palAmount, extraAmount);
    }


    // Admin functions

    /**
    * @notice Send budget to the Loot system
    * @dev Send budget to the LootReserve (PAL & extra token if set)
    * @param palAmount Amount of PAL to send
    * @param extraAmount Amount of extra token to send
    */
    function sendLootBudget(uint256 palAmount, uint256 extraAmount) external nonReentrant onlyOwner() {
        // Send the budget to the LootReserve
        IERC20(pal).safeTransfer(lootReserve, palAmount);
        if(extraAmount > 0) {
            IERC20(extraToken).safeTransfer(lootReserve, extraAmount);
        }

        // Notify the LootCreator of the new budget
        ILootCreator(lootCreator).notifyNewBudget(palAmount, extraAmount);
    }

}