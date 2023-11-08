// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockBudgetController {
    using SafeERC20 for IERC20;

    address public pal;
    address public extra;

    mapping(address => uint256) public palBudget;
    mapping(address => uint256) public extraBudget;

    constructor(address _pal, address _extra) {
        pal = _pal;
        extra = _extra;
    }

    function checkpoint(address gauge) external returns(bool) {
        return true;
    }

    function setCurrentBudget(address gauge, uint256 palAmount, uint256 extraAmount) external {
        palBudget[gauge] = palAmount;
        extraBudget[gauge] = extraAmount;
    }

    function getCurrentBudget(address gauge) external view returns(uint256 palAmount, uint256 extraAmount) {
        return (palBudget[gauge], extraBudget[gauge]);
    }

    function sendBudget(address gauge, address receiver) external returns(uint256 palAmount, uint256 extraAmount) {
        palAmount = palBudget[gauge];
        extraAmount = extraBudget[gauge];

        palBudget[gauge] = 0;
        extraBudget[gauge] = 0;

        IERC20(pal).safeTransfer(receiver, palAmount);
        IERC20(extra).safeTransfer(receiver, extraAmount);

        return (palAmount, extraAmount);
    }

}