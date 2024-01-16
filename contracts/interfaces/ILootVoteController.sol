// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

interface ILootVoteController {

	function isListedGauge(address gauge) external view returns(bool);

    function getBoardForGauge(address gauge) external view returns(address);
    function getDistributorForGauge(address gauge) external view returns(address);

	function getGaugeWeight(address gauge) external view returns(uint256);
    function getGaugeWeightAt(address gauge, uint256 ts) external view returns(uint256);

    function getTotalWeight() external view returns(uint256);

    function getGaugeRelativeWeight(address gauge) external view returns(uint256);
    function getGaugeRelativeWeight(address gauge, uint256 ts) external view returns(uint256);

	function getGaugeRelativeWeightWrite(address gauge) external returns(uint256);
    function getGaugeRelativeWeightWrite(address gauge, uint256 ts) external returns(uint256);

	function getGaugeCap(address gauge) external view returns(uint256);

    function getUserProxyVoters(address user) external view returns(address[] memory);

    function voteForGaugeWeights(address gauge, uint256 userPower) external;
    function voteForManyGaugeWeights(address[] memory gauge, uint256[] memory userPower) external;

    function voteForGaugeWeightsFor(address user, address gauge, uint256 userPower) external;
    function voteForManyGaugeWeightsFor(address user, address[] memory gauge, uint256[] memory userPower) external;

	function updateGaugeWeight(address gauge) external;
    function updateTotalWeight() external;

    function approveProxyManager(address manager) external;
    function setVoterProxy(address user, address proxy, uint256 maxPower, uint256 endTimestamp) external;
    function clearUserExpiredProxies(address user) external;

}
