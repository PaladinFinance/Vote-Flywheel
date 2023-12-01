// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../interfaces/ILootVoteController.sol";

contract MockFetcher {

    uint256 public lastData;

    function fetchGetGaugeRelativeWeightWrite(address target, address gauge) external {
        lastData = ILootVoteController(target).getGaugeRelativeWeightWrite(gauge);
    }
    function fetchGetGaugeRelativeWeightWriteAt(address target, address gauge, uint256 ts) external {
        lastData = ILootVoteController(target).getGaugeRelativeWeightWrite(gauge, ts);
    }

}