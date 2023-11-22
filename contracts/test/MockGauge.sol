// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILootCreator} from "../interfaces/ILootCreator.sol";

contract MockGauge {
    using SafeERC20 for IERC20;

    address immutable public pal;
    address immutable public extraToken;
    
    address immutable public lootCreator;
    address immutable public lootReserve;

    uint256 public palBudget;
    uint256 public extraBudget;

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

    function sendLootBudget(uint256 palAmount, uint256 extraAmount) external {
        IERC20(pal).safeTransfer(lootReserve, palAmount);
        if(extraAmount > 0) {
            IERC20(extraToken).safeTransfer(lootReserve, extraAmount);
        }

        ILootCreator(lootCreator).notifyNewBudget(palAmount, extraAmount);
    }

    function addBudget(uint256 palAmount, uint256 extraAmount) external {
        palBudget += palAmount;
        extraBudget += extraAmount;
    }

    function updateLootBudget() external {
        if(palBudget == 0 && extraBudget == 0) return;

        IERC20(pal).safeTransfer(lootReserve, palBudget);
        IERC20(extraToken).safeTransfer(lootReserve, extraBudget);

        ILootCreator(lootCreator).notifyNewBudget(palBudget, extraBudget);

        palBudget = 0;
        extraBudget = 0;
    }

}