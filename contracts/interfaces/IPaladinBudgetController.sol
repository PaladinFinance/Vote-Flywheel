// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

interface IPaladinBudgetController {

	function checkpoint(address gauge) external returns(bool);

    function getCurrentBudget(address gauge) external view returns(uint256 palAmount, uint256 extraAmount);
    function sendBudget(address gauge, address receiver) external returns(uint256 palAmount, uint256 extraAmount);

}
