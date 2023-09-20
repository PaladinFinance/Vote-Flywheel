// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

interface ILootVoteController {

	function isListedGauge(address gauge) external view returns(bool);

	function getGaugeWeight(address gauge) external view returns(uint256);
    function getGaugeWeightAt(address gauge, uint256 ts) external view returns(uint256);

    function getGaugeRelativeWeight(address gauge) external view returns(uint256);
    function getGaugeRelativeWeight(address gauge, uint256 ts) external view returns(uint256);

	function getGaugeRelativeWeightWrite(address gauge) external returns(uint256);
    function getGaugeRelativeWeightWrite(address gauge, uint256 ts) external returns(uint256);

	function getGaugeCap(address gauge) external view returns(uint256);

	function updateGaugeWeight(address gauge) external;

    function updateTotalWeight() external;

}
