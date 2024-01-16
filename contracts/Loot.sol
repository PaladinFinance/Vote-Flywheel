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
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILootCreator} from "./interfaces/ILootCreator.sol";
import "./libraries/Errors.sol";
import "./utils/Owner.sol";

/** @title Loot contract */
/// @author Paladin
/*
    Contract handling the Loot data, vesting & distribution
*/

contract Loot is Owner, ReentrancyGuard {
    using SafeERC20 for IERC20;


    // Structs

    /** @notice Loot Data strcut */
    struct LootData {
        // ID of the Loot for the user
        uint256 id;
        // Amount of PAL to be distributed through vesting
        uint256 palAmount;
        // Amount of extra token to be distributed
        uint256 extraAmount;
        // Timestamp at which the vesting starts
        uint256 startTs;
        // Flag to check if the Loot has been claimed
        bool claimed;
    }


    // Storage

    /** @notice PAL token */
    IERC20 public immutable pal;
    /** @notice Extra reward token */
    IERC20 public immutable extraToken;

    /** @notice Address of the Reserve contract holding token to be distributed */
    address public immutable tokenReserve;
    /** @notice Loot Creator contract */
    ILootCreator public lootCreator;

    /** @notice Duration of vesting for Loots */
    uint256 public vestingDuration;

    /** @notice List of Loot for each user */
    mapping(address => LootData[]) public userLoots;


    // Events

    /** @notice Event emitted when a Loot is created */
    event LootCreated(address indexed user, uint256 indexed id, uint256 palAmount, uint256 extraAmount, uint256 startTs);

    /** @notice Event emitted when a Loot is claimed */
    event LootClaimed(address indexed user, uint256 indexed id, uint256 palAmount, uint256 extraAmount);

    /** @notice Event emitted when the vesting duration is updated */
    event VestingDurationUpdated(uint256 newDuration);
    /** @notice Event emitted when the Loot Creator address is updated */
    event LootCreatorUpdated(address oldCreator, address newCreator);


    // Modifiers

    /** @notice Checks the caller is the allowed Loot Creator */
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

    /**
    * @notice Sets the Loot Creator contract address
    * @dev Sets the inital Loot Creator contract address
    * @param _lootCreator Address of the Loot Creator contract
    */
    function setInitialLootCreator(address _lootCreator) external onlyOwner {
        if(address(lootCreator) != address(0)) revert Errors.CreatorAlreadySet();
        lootCreator = ILootCreator(_lootCreator);
    }


    // View functions

    /**
    * @notice Returns the data of a Loot for a user & an id
    * @dev Returns the data of a Loot for a user & an id
    * @param user Address of the user
    * @param id ID of the Loot
    * @return palAmount (uint256) : Amount of PAL
    * @return extraAmount (uint256) : Amount of extra token
    * @return startTs (uint256) : Timestamp at which the vesting starts
    * @return endTs (uint256) : Timestamp at which the vesting ends
    * @return claimed (uint256) : Is Loot already claimed
    */
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

    /**
    * @notice Returns all the user Loot IDs
    * @dev Returns all the user Loot IDs
    * @param user Address of the user
    * @return uint256[] : List of Loot IDs
    */
    function getAllUserLootIds(address user) external view returns(uint256[] memory){
        uint256 length = userLoots[user].length;
        uint256[] memory ids = new uint256[](length);

        for(uint256 i; i < length;){
            ids[i] = userLoots[user][i].id;
            unchecked { i++; }
        }

        return ids;
    }

    /**
    * @notice Returns all the user active Loot IDs
    * @dev Returns all the user active Loot IDs
    * @param user Address of the user
    * @return uint256[] : List of active Loot IDs
    */
    function getAllActiveUserLootIds(address user) external view returns(uint256[] memory){
        uint256 length = userLoots[user].length;
        uint256 activeCount;

        for(uint256 i; i < length;){
            if(!userLoots[user][i].claimed) activeCount++;
            unchecked { i++; }
        }

        // Reduce the array to the actual active Loot size
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

    /**
    * @notice Returns all the user Loots
    * @dev Returns all the user Loots
    * @param user Address of the user
    * @return LootData[] : List of Loots
    */
    function getAllUserLoot(address user) external view returns(LootData[] memory){
        return userLoots[user];
    }

    /**
    * @notice Returns all the user active Loots
    * @dev Returns all the user active Loots
    * @param user Address of the user
    * @return LootData[] : List of active Loots
    */
    function getAllActiveUserLoot(address user) external view returns(LootData[] memory){
        uint256 length = userLoots[user].length;
        uint256 activeCount;

        for(uint256 i; i < length;){
            if(!userLoots[user][i].claimed) activeCount++;
            unchecked { i++; }
        }

        // Reduce the array to the actual active Loot size
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

    /**
    * @notice Creates a new Loot for a user
    * @dev Creates a new Loot for a user
    * @param user Address of the user
    * @param startTs Timestamp at which the vesting starts
    * @param palAmount Amount of PAL
    * @param extraAmount Amount of extra token
    */
    function createLoot(address user, uint256 startTs, uint256 palAmount, uint256 extraAmount) external nonReentrant onlyLootCreator {
        uint256 lootId = userLoots[user].length;

        // Write the Loot parameters based on inputs
        userLoots[user].push(LootData({
            id: lootId,
            palAmount: palAmount,
            extraAmount: extraAmount,
            startTs: startTs,
            claimed: false
        }));

        emit LootCreated(user, lootId, palAmount, extraAmount, startTs);
    }

    /**
    * @notice Claims a Loot for a user
    * @dev Claims a Loot for a user & slashes the PAL amount if the vesting isn't over
    * @param id ID of the Loot
    * @param receiver Address to receive the PAL & extra token
    */
    function claimLoot(uint256 id, address receiver) external nonReentrant {
        if(id >= userLoots[msg.sender].length) revert Errors.InvalidId();
        if(receiver == address(0)) revert Errors.AddressZero();
        // Load the Loot state
        LootData storage loot = userLoots[msg.sender][id];

        if(loot.claimed) revert Errors.AlreadyClaimed();
        if(block.timestamp < loot.startTs) revert Errors.VestingNotStarted();
        loot.claimed = true;

        // Check if the Loot is still vesting, and slash the PAL amount if needed
        uint256 palAmount = loot.palAmount;
        uint256 vestingEndTs = loot.startTs + vestingDuration;
        if(block.timestamp < vestingEndTs){
            uint256 remainingVesting = vestingEndTs - block.timestamp;
            uint256 slashingAmount = palAmount * remainingVesting / vestingDuration;

            // Notify the LootCreator of the slashed amount
            lootCreator.notifyUndistributedRewards(slashingAmount);

            palAmount -= slashingAmount;
        }

        // Transfer the PAL & extra token to the receiver
        pal.safeTransferFrom(tokenReserve, receiver, palAmount);
        extraToken.safeTransferFrom(tokenReserve, receiver, loot.extraAmount);

        emit LootClaimed(msg.sender, id, palAmount, loot.extraAmount);
    }

    /**
    * @notice Claims multiple Loots for a user
    * @dev Claims multiple Loots for a user & slashes the PAL amounts if the vesting isn't over
    * @param ids List of Loot IDs
    * @param receiver Address to receive the PAL & extra token
    */
    function claimMultipleLoot(uint256[] calldata ids, address receiver) external nonReentrant {
        if(receiver == address(0)) revert Errors.AddressZero();
        uint256 length = ids.length;
        uint256 totalPalAmount;
        uint256 totalExtraAmount;

        for(uint256 i; i < length;){
            if(ids[i] >= userLoots[msg.sender].length) revert Errors.InvalidId();
            // Load the Loot state
            LootData storage loot = userLoots[msg.sender][ids[i]];

            if(loot.claimed) revert Errors.AlreadyClaimed();
            if(block.timestamp < loot.startTs) revert Errors.VestingNotStarted();
            loot.claimed = true;

            // Check if the Loot is still vesting, and slash the PAL amount if needed
            uint256 palAmount = loot.palAmount;
            uint256 vestingEndTs = loot.startTs + vestingDuration;
            if(block.timestamp < vestingEndTs){
                uint256 remainingVesting = vestingEndTs - block.timestamp;
                uint256 slashingAmount = palAmount * remainingVesting / vestingDuration;

                // Notify the LootCreator of the slashed amount
                lootCreator.notifyUndistributedRewards(slashingAmount);

                palAmount -= slashingAmount;
            }

            // Sum up all the PAL & extra token to be transferred
            totalPalAmount += palAmount;
            totalExtraAmount += loot.extraAmount;

            emit LootClaimed(msg.sender, ids[i], palAmount, loot.extraAmount);

            unchecked { i++; }
        }

        // Transfer the PAL & extra token to the receiver
        pal.safeTransferFrom(tokenReserve, receiver, totalPalAmount);
        extraToken.safeTransferFrom(tokenReserve, receiver, totalExtraAmount);
    }


    // Admin functions

    /**
    * @notice Updates the vesting duration for Loots
    * @dev Updates the vesting duration for Loots
    * @param _vestingDuration New vesting duration
    */
    function updateVestingDuration(uint256 _vestingDuration) external onlyOwner {
        if(_vestingDuration < 1 weeks) revert Errors.InvalidParameter();

        vestingDuration = _vestingDuration;

        emit VestingDurationUpdated(_vestingDuration);
    }

    /**
    * @notice Updates the Loot Creator contract address
    * @dev Updates the Loot Creator contract address
    * @param _lootCreator Address of the new Loot Creator contract
    */
    function updateLootCreator(address _lootCreator) external onlyOwner {
        if(_lootCreator == address(0)) revert Errors.InvalidParameter();

        address oldCreator = address(lootCreator);
        if(_lootCreator == oldCreator) revert Errors.SameAddress();
        
        lootCreator = ILootCreator(_lootCreator);

        emit LootCreatorUpdated(oldCreator, _lootCreator);
    }

}