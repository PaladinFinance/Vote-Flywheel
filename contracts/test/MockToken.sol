// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {

    constructor(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 _total_supply
    )
        ERC20(name_, symbol_)
    {
        // mint the total token supply to the owner
        _mint(owner_, _total_supply);
    }
}