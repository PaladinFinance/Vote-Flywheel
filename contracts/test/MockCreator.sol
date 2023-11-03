// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Loot} from "../Loot.sol";

contract MockCreator {

    address public immutable loot;

    uint256 public slashedAmount;

    constructor(
        address _loot
    ) {
        loot = _loot;
    }

    function notifyUndistributedRewards(uint256 amount) external {
        slashedAmount += amount;
    }

    function createLoot(address user, uint256 startTs, uint256 palAmount, uint256 extraAmount) external {
        Loot(loot).createLoot(user, startTs, palAmount, extraAmount);
    }

}