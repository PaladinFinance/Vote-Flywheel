//██████╗  █████╗ ██╗      █████╗ ██████╗ ██╗███╗   ██╗
//██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██║████╗  ██║
//██████╔╝███████║██║     ███████║██║  ██║██║██╔██╗ ██║
//██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██║██║╚██╗██║
//██║     ██║  ██║███████╗██║  ██║██████╔╝██║██║ ╚████║
//╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝
 

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ILootCreator} from "./interfaces/ILootCreator.sol";
import "./libraries/Errors.sol";
import "./utils/Owner.sol";

/** @title Loot contract */
/// @author Paladin
/*
    to do
*/

contract Loot is Owner, ReentrancyGuard {
    using SafeERC20 for IERC20;


    // Structs

    struct LootData { // TODO: better struct packing
        uint256 id;
        uint256 palAmount;
        uint256 extraAmount;
        uint256 startTs;
        bool claimed;
    }


    // Storage

    IERC20 public immutable pal;
    IERC20 public immutable extraToken;

    address public immutable tokenReserve;
    ILootCreator public lootCreator;

    uint256 public vestingDuration;

    mapping(address => LootData[]) public userLoots;


    // Events

    event LootCreated(address indexed user, uint256 indexed id, uint256 palAmount, uint256 extraAmount, uint256 startTs);

    event LootClaimed(address indexed user, uint256 indexed id, uint256 palAmount, uint256 extraAmount);

    event VestingDurationUpdated(uint256 newDuration);
    event LootCreatorUpdated(address oldCreator, address newCreator);


    // Modifiers

    modifier onlyLootCreator() {
        if(msg.sender != address(lootCreator)) revert Errors.CallerNotAllowed();
        _;
    }


    // Constructor

    constructor(
        address _pal,
        address _extraToken,
        address _tokenReserve,
        uint256 _vestingDuration
    ){
        pal = IERC20(_pal);
        extraToken = IERC20(_extraToken);
        tokenReserve = _tokenReserve;
        vestingDuration = _vestingDuration;
    }

    function setInitialLootCreator(address _lootCreator) external onlyOwner {
        if(address(lootCreator) != address(0)) revert Errors.CreatorAlreadySet();
        lootCreator = ILootCreator(_lootCreator);
    }


    // View functions

    function getLootData(address user, uint256 id) external view returns(
        uint256 palAmount,
        uint256 extraAmount,
        uint256 startTs,
        uint256 endTs,
        bool claimed
    ){
        LootData memory loot = userLoots[user][id];
        palAmount = loot.palAmount;
        extraAmount = loot.extraAmount;
        startTs = loot.startTs;
        endTs = loot.startTs + vestingDuration;
        claimed = loot.claimed;
    }

    function getAllUserLootIds(address user) external view returns(uint256[] memory){
        uint256 length = userLoots[user].length;
        uint256[] memory ids = new uint256[](length);

        for(uint256 i; i < length;){
            ids[i] = userLoots[user][i].id;
            unchecked { i++; }
        }

        return ids;
    }

    function getAllActiveUserLootIds(address user) external view returns(uint256[] memory){
        uint256 length = userLoots[user].length;
        uint256 activeCount;

        for(uint256 i; i < length;){
            if(!userLoots[user][i].claimed) activeCount++;
            unchecked { i++; }
        }

        uint256[] memory ids = new uint256[](activeCount);
        uint256 j;
        for(uint256 i; i < length;){
            if(!userLoots[user][i].claimed) {
                ids[j] = userLoots[user][i].id;
                unchecked { j++; }
            }
            unchecked { i++; }
        }

        return ids;        
    }

    function getAllUserLoot(address user) external view returns(LootData[] memory){
        return userLoots[user];
    }

    function getAllActiveUserLoot(address user) external view returns(LootData[] memory){
        uint256 length = userLoots[user].length;
        uint256 activeCount;

        for(uint256 i; i < length;){
            if(!userLoots[user][i].claimed) activeCount++;
            unchecked { i++; }
        }

        LootData[] memory loots = new LootData[](activeCount);
        uint256 j;
        for(uint256 i; i < length;){
            if(!userLoots[user][i].claimed) {
                loots[j] = userLoots[user][i];
                unchecked { j++; }
            }
            unchecked { i++; }
        }

        return loots;
    }


    // State-changing functions

    function createLoot(address user, uint256 startTs, uint256 palAmount, uint256 extraAmount) external nonReentrant onlyLootCreator {
        uint256 lootId = userLoots[user].length;

        userLoots[user].push(LootData({
            id: lootId,
            palAmount: palAmount,
            extraAmount: extraAmount,
            startTs: startTs,
            claimed: false
        }));

        emit LootCreated(user, lootId, palAmount, extraAmount, startTs);
    }

    function claimLoot(uint256 id, address receiver) external nonReentrant {
        if(id >= userLoots[msg.sender].length) revert Errors.InvalidId();
        if(receiver == address(0)) revert Errors.AddressZero();
        LootData storage loot = userLoots[msg.sender][id];

        if(loot.claimed) revert Errors.AlreadyClaimed();
        if(block.timestamp < loot.startTs) revert Errors.VestingNotStarted();
        loot.claimed = true;

        uint256 palAmount = loot.palAmount;
        uint256 vestingEndTs = loot.startTs + vestingDuration;
        if(block.timestamp < vestingEndTs){
            uint256 remainingVesting = vestingEndTs - block.timestamp;
            uint256 slashingAmount = palAmount * remainingVesting / vestingDuration;

            lootCreator.notifyUndistributedRewards(slashingAmount);

            palAmount -= slashingAmount;
        }

        pal.safeTransferFrom(tokenReserve, receiver, palAmount);
        extraToken.safeTransferFrom(tokenReserve, receiver, loot.extraAmount);

        emit LootClaimed(msg.sender, id, palAmount, loot.extraAmount);
    }

    function claimMultipleLoot(uint256[] calldata ids, address receiver) external nonReentrant {
        if(receiver == address(0)) revert Errors.AddressZero();
        uint256 length = ids.length;
        uint256 totalPalAmount;
        uint256 totalExtraAmount;

        for(uint256 i; i < length;){
            if(ids[i] >= userLoots[msg.sender].length) revert Errors.InvalidId();
            LootData storage loot = userLoots[msg.sender][ids[i]];

            if(loot.claimed) revert Errors.AlreadyClaimed();
            if(block.timestamp < loot.startTs) revert Errors.VestingNotStarted();
            loot.claimed = true;

            uint256 palAmount = loot.palAmount;
            uint256 vestingEndTs = loot.startTs + vestingDuration;
            if(block.timestamp < vestingEndTs){
                uint256 remainingVesting = vestingEndTs - block.timestamp;
                uint256 slashingAmount = palAmount * remainingVesting / vestingDuration;

                lootCreator.notifyUndistributedRewards(slashingAmount);

                palAmount -= slashingAmount;
            }

            totalPalAmount += palAmount;
            totalExtraAmount += loot.extraAmount;

            emit LootClaimed(msg.sender, ids[i], palAmount, loot.extraAmount);

            unchecked { i++; }
        }

        pal.safeTransferFrom(tokenReserve, receiver, totalPalAmount);
        extraToken.safeTransferFrom(tokenReserve, receiver, totalExtraAmount);
    }


    // Admin functions

    function updateVestingDuration(uint256 _vestingDuration) external onlyOwner {
        if(_vestingDuration < 1 weeks) revert Errors.InvalidParameter();

        vestingDuration = _vestingDuration;

        emit VestingDurationUpdated(_vestingDuration);
    }

    function updateLootCreator(address _lootCreator) external onlyOwner {
        if(_lootCreator == address(0)) revert Errors.InvalidParameter();

        address oldCreator = address(lootCreator);
        if(_lootCreator == oldCreator) revert Errors.SameAddress();
        
        lootCreator = ILootCreator(_lootCreator);

        emit LootCreatorUpdated(oldCreator, _lootCreator);
    }

}