// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract MockVoteController {

    mapping(address => bool) public validGauges;
    mapping(address => mapping(uint256 => uint256)) public gaugeWeightAt;
    mapping(address => uint256) public gaugeCap;

    uint256 public defaultCap = 0.25 * 1e18;

    uint256 private nothing;

    function addGauge(address gauge, uint256 cap) external {
        validGauges[gauge] = true;

        if(cap != 0) {
            gaugeCap[gauge] = cap;
        } else {
            gaugeCap[gauge] = defaultCap;
        }
    }

    function setGaugeWeightAt(address gauge, uint256 period, uint256 weight) external {
        gaugeWeightAt[gauge][period] = weight;
    }

    function isListedGauge(address gauge) external view returns (bool) {
        return validGauges[gauge];
    }

    function getGaugeRelativeWeightWrite(address gauge, uint256 period) external returns (uint256) {
        nothing++;
        return gaugeWeightAt[gauge][period];
    }

    function getGaugeCap(address gauge) external view returns (uint256) {
        return gaugeCap[gauge];
    }
    
}