//██████╗  █████╗ ██╗      █████╗ ██████╗ ██╗███╗   ██╗
//██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██║████╗  ██║
//██████╔╝███████║██║     ███████║██║  ██║██║██╔██╗ ██║
//██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██║██║╚██╗██║
//██║     ██║  ██║███████╗██║  ██║██████╔╝██║██║ ╚████║
//╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝
 

//SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.20;

import {ILootCreator} from "./interfaces/ILootCreator.sol";
import {ILootGauge} from "./interfaces/ILootGauge.sol";
import {ILootVoteController} from "./interfaces/ILootVoteController.sol";
import {IQuestBoard} from "./interfaces/IQuestBoard.sol";
import {IHolyPowerDelegation} from "./interfaces/IHolyPowerDelegation.sol";
import {Loot} from "./Loot.sol";
import {MultiMerkleDistributorV2} from "./MultiMerkleDistributorV2.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./utils/Owner.sol";
import "./libraries/Errors.sol";

/** @title Loot Creator contract */
/// @author Paladin
/*
    Contract handling the Budget for gauges & Quests and the Loot creation
*/
contract LootCreator is Owner, ReentrancyGuard, ILootCreator {

    // Constants

    /** @notice Seconds in a Week */
    uint256 private constant WEEK = 604800;

    /** @notice Scale unit (1e18) */
    uint256 private constant UNIT = 1e18;

    /** @notice Base Multiplier for Loot rewards */
    uint256 public constant BASE_MULTIPLIER = 1e18;

    /** @notice Max Multiplier for Loot rewards */
    uint256 public constant MAX_MULTIPLIER = 5e18;


    // Structs

    /** @notice Budget struct */
    struct Budget {
        uint128 palAmount;
        uint128 extraAmount;
    }

    /** @notice Allocation strcut */
    struct Allocation {
        uint128 palPerVote;
        uint128 extraPerVote;
    }

    /** @notice Struct use in memory for Loot creation method */
    struct CreateVars {
        address gauge;
        uint256 userPower;
        uint256 totalPower;
        uint256 lockedRatio;
        uint256 rewardRatio;
        uint256 totalRatio;
        uint256 userPeriodRewards;
        uint256 userMultiplier;
        uint256 userPalAmount;
        uint256 userExtraAmount;
    }


    // Storage

    /** @notice Address of the Loot contract */
    address public immutable loot;
    /** @notice Address of the Loot Vote Controller contract */
    address public immutable lootVoteController;
    /** @notice Address of the HolyPalPower contract */
    address public immutable holyPower;
    /** @notice Address of the Loot Gauge or Budget contract */
    address public lootGauge;

    /** @notice Quest Distributors allowed to intract with this contract */
    mapping(address => bool) public allowedDistributors;
    /** @notice List of listed Quest Distributors */
    address[] public distributors;

    /** @notice Timestamp of the next Budget update */
    uint256 public nextBudgetUpdatePeriod;

    /** @notice Current pending budget to be used during next period */
    Budget public pengingBudget;

    /** @notice Budgets for each period */
    mapping(uint256 => Budget) public periodBudget;
    /** @notice History of allocated amounts from the Budget of each period */
    mapping(uint256 => Budget) public allocatedBudgetHistory;

    /** @notice Budget allocated to a Gauge for each period */
    mapping(address => mapping(uint256 => Budget)) public gaugeBudgetPerPeriod;
    /** @notice Was the gauge allocated a Budget for each period */
    mapping(address => mapping(uint256 => bool)) public isGaugeAllocatedForPeriod;

    /** @notice Checkpointed block number for each period */
    mapping(uint256 => uint256) public periodBlockCheckpoint;

    /** @notice Total Rewards distributed for a period for a Quest */
    // distributor -> id -> period -> total
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public totalQuestPeriodRewards;
    /** @notice Was the total reward set for a Quest period */
    mapping(address => mapping(uint256 => mapping(uint256 => bool))) public totalQuestPeriodSet;
    /** @notice User claime damount for a Quest period */
    // distributor -> id -> period -> user -> amount
    mapping(address => mapping(uint256 => mapping(uint256 => mapping(address => uint256)))) public userQuestPeriodRewards;


    // Events

    /** @notice Event emitted when the contract is initialized */
    event Init(address lootGauge);
    /** @notice Event emitted when a new Distributor is listed */
    event NewDistributorListed(address indexed distributor);
    /** @notice Event emitted when Distributor is unlisted */
    event DistributorUnlisted(address indexed distributor);
    /** @notice Event emitted when the budget Gauge is updated */
    event GaugeUpdated(address indexed oldGauge, address indexed newGauge);


    // Modifiers

    /** @notice Checks the caller is an allowed Distributor */
    modifier onlyAllowedDistributor() {
        if(!allowedDistributors[msg.sender]) revert Errors.CallerNotAllowed();
        _;
    }

    /** @notice Checks the caller is the Loot contract */
    modifier onlyLoot() {
        if(msg.sender != loot) revert Errors.CallerNotAllowed();
        _;
    }

    /** @notice Checks the caller is the Loot Gauge contract */
    modifier onlyGauge() {
        if(msg.sender != lootGauge) revert Errors.CallerNotAllowed();
        _;
    }


    // Constructor

    constructor(
        address _loot,
        address _lootVoteController,
        address _holyPower
    ) {
        if(
            _loot == address(0)
            || _lootVoteController == address(0)
            || _holyPower == address(0)
        ) revert Errors.AddressZero();

        loot = _loot;
        lootVoteController = _lootVoteController;
        holyPower = _holyPower;

        nextBudgetUpdatePeriod = (block.timestamp + WEEK) / WEEK * WEEK;
    }

    /**
    * @notice Initialize the contract
    * @dev Init the contract with the Loot Gauge/Budget address
    * @param _lootGauge Address of the Loot Gauge or Budget address
    */
    function init(address _lootGauge) external onlyOwner {
        if(_lootGauge == address(0)) revert Errors.AddressZero();
        if(lootGauge != address(0)) revert Errors.AlreadyInitialized();

        lootGauge = _lootGauge;

        emit Init(_lootGauge);
    }


    // View functions

    /**
    * @notice Returns the global budget for a period
    * @param period Timestamp of the period
    * @return palAmount (uint256) : Amount of PAL tokens allocated for the period
    * @return extraAmount (uint25 : Amount of extra tokens allocated for the period
    */
    function getBudgetForPeriod(uint256 period) external view returns(uint256 palAmount, uint256 extraAmount) {
        palAmount = periodBudget[period].palAmount;
        extraAmount = periodBudget[period].extraAmount;
    }

    /**
    * @notice Returns the gauge budget for a period
    * @param gauge Address of the gauge
    * @param period Timestamp of the period
    * @return palAmount (uint256) : Amount of PAL tokens allocated for the period
    * @return extraAmount (uint25 : Amount of extra tokens allocated for the period
    */
    function getGaugeBudgetForPeriod(
        address gauge,
        uint256 period
    ) external view returns(uint256 palAmount, uint256 extraAmount) {
        Budget memory budget = gaugeBudgetPerPeriod[gauge][period];
        palAmount = budget.palAmount;
        extraAmount = budget.extraAmount;
    }

    /**
    * @notice Returns the allocation for a Quest for a period
    * @param questId ID of the Quest
    * @param distributor Address of the Distributor handling the Quest rewards
    * @param period Timestamp of the period
    * @return palPerVote (uint256) : Amount of PAL tokens allocated for the period
    * @return extraPerVote (uint25 : Amount of extra tokens allocated for the period
    */
    function getQuestAllocationForPeriod(
        uint256 questId,
        address distributor,
        uint256 period
    ) external view returns(uint256 palPerVote, uint256 extraPerVote) {
        address gauge = _getQuestGauge(questId, distributor);
        Allocation memory allocation = _getQuestAllocationForPeriod(gauge, questId, distributor, period);
        palPerVote = allocation.palPerVote;
        extraPerVote = allocation.extraPerVote;
    }

    /**
    * @notice Returns all listed Distributors
    * @return uint256 : List of Distributors
    */
    function getListedDistributors() external view returns(address[] memory) {
        return distributors;
    }


    // State-changing functions

    /**
    * @notice Creates a Loot for a user
    * @dev Creates a Loot for a user based on the Quest rewards for the period
    * @param user Address of the user
    * @param distributor Address of the Distributor handling the Quest rewards
    * @param questId ID of the Quest
    * @param period Timestamp of the period
    */
    function createLoot(address user, address distributor, uint256 questId, uint256 period) external nonReentrant {
        _createLoot(user, distributor, questId, period);
    }

    /**
    * @notice Creates multiple Loots for a user
    * @dev Creates multiple Loots for a user based on the Quest rewards for each period
    * @param user Address of the user
    * @param params Quest claim parameters (distributor, questId, period)
    */
    function createMultipleLoot(address user, MultiCreate[] calldata params) external nonReentrant {
        uint256 length = params.length;
        if(length == 0) revert Errors.EmptyParameters();

        for(uint256 i; i < length; i++){
            _createLoot(user, params[i].distributor, params[i].questId, params[i].period);
        }
    }

    /**
    * @notice Notifies of a Quest claim
    * @dev Notofies of the amount claimed by a user on a Quest for later Loot creation
    * @param user Address of the user
    * @param questId ID of the Quest
    * @param period Timestamp of the period
    * @param claimedAmount Amount of rewards claimed by the user
    */
    function notifyQuestClaim(address user, uint256 questId, uint256 period, uint256 claimedAmount) external onlyAllowedDistributor {
        userQuestPeriodRewards[msg.sender][questId][period][user] = claimedAmount;
    }

    /**
    * @notice Notifies of a Quest period distribution
    * @dev Notofies of the amount distributed on a Quest for a period & allocates the budget for a gauge if needed
    * @param questId ID of the Quest
    * @param period Timestamp of the period
    * @param totalRewards Total amount of rewards distributed for the period for the Quest
    */
    function notifyDistributedQuestPeriod(uint256 questId, uint256 period, uint256 totalRewards) external onlyAllowedDistributor nonReentrant {
        // Pull any new budget & update the current period to have an up to date budget
        _pullBudget();
        _updatePeriod();
        
        // Fetch the gauge for the quest & check if it's listed
        address gauge = _getQuestGauge(questId, msg.sender);
        if(!ILootVoteController(lootVoteController).isListedGauge(gauge)) return;

        // If not set yet, set the total rewards for the quest & period
        if(!totalQuestPeriodSet[msg.sender][questId][period]) {
            totalQuestPeriodRewards[msg.sender][questId][period] = totalRewards;
            totalQuestPeriodSet[msg.sender][questId][period] = true;
        }

        // If the period is already allocated for the gauge, return
        if(isGaugeAllocatedForPeriod[gauge][period]) return;
        isGaugeAllocatedForPeriod[gauge][period] = true;

        // Fetch the gauge weight & cap
        uint256 gaugeWeight = ILootVoteController(lootVoteController).getGaugeRelativeWeightWrite(gauge, period);
        uint256 gaugeCap = ILootVoteController(lootVoteController).getGaugeCap(gauge);

        // Load the budget for the period
        Budget memory budget = periodBudget[period];

        // If the gauge weight is higher than the cap, we need to handle the un-allocated rewards
        if(gaugeWeight > gaugeCap) {
            uint256 unsunedWeight = gaugeWeight - gaugeCap;

            gaugeWeight = gaugeCap;

            // Handle un-allocated budget => set it as pending for next periods
            pengingBudget.palAmount += uint128(uint256(budget.palAmount) * unsunedWeight / UNIT);
            pengingBudget.extraAmount += uint128(uint256(budget.extraAmount) * unsunedWeight / UNIT);
        }

        // Calculate the allocated budget for the gauge
        uint256 palAmount = uint256(budget.palAmount) * gaugeWeight / UNIT;
        uint256 extraAmount = uint256(budget.extraAmount) * gaugeWeight / UNIT;

        // Update the allocated budget history
        allocatedBudgetHistory[period].palAmount += uint128(palAmount);
        allocatedBudgetHistory[period].extraAmount += uint128(extraAmount);

        // Save the Budget for the gauge for the period
        gaugeBudgetPerPeriod[gauge][period] = Budget(
            uint128(palAmount),
            uint128(extraAmount)
        );

    }

    /**
    * @dev Notifies of the amount distributed on a Quest was fixed
    * @param questId ID of the Quest
    * @param period Timestamp of the period
    * @param newTotalRewards New total amount of rewards distributed for the period for the Quest
    */
    function notifyFixedQuestPeriod(uint256 questId, uint256 period, uint256 newTotalRewards) external onlyAllowedDistributor {
        totalQuestPeriodRewards[msg.sender][questId][period] = newTotalRewards;
    }

    /**
    * @dev Notifies of the amount added to a Quest period via emergency update in Distributors
    * @param questId ID of the Quest
    * @param period Timestamp of the period
    * @param addedRewards Amount added to the total
    */
    function notifyAddedRewardsQuestPeriod(uint256 questId, uint256 period, uint256 addedRewards) external onlyAllowedDistributor {
        totalQuestPeriodRewards[msg.sender][questId][period] += addedRewards;
    }

    /**
    * @notice Notifies of undistributed rewards
    * @dev Notifies the amount of rewards slashed from a claimed Loot & add them to the pending budget
    * @param palAmount Amount of PAL tokens slashed
    */
	function notifyUndistributedRewards(uint256 palAmount) external onlyLoot {
        // Add undistributed rewards from Loot to the pending budget
        pengingBudget.palAmount += uint128(palAmount);
    }

    /**
    * @notice Notifies of new budget
    * @dev Notifies the amount of rewards added to the pending budget from the Loot Gauge/Budget contract
    * @param palAmount Amount of PAL tokens added to the budget
    * @param extraAmount Amount of extra tokens added to the budget
    */
	function notifyNewBudget(uint256 palAmount, uint256 extraAmount) external onlyGauge {
        // Update the pending budget with the new budget from the gauge
        pengingBudget.palAmount += uint128(palAmount);
        pengingBudget.extraAmount += uint128(extraAmount);
    }

    /**
    * @notice Updates the period
    * @dev Updates the period by pulling the new budget and updating the current period budget
    */
    function updatePeriod() external nonReentrant {
        _pullBudget();
        _updatePeriod();
    }


    // Internal functions

    /**
    * @dev Pulls any new Budget from the Loot Gauge/Budget contract
    */
    function _pullBudget() internal {
        if(lootGauge == address(0)) return;
        ILootGauge(lootGauge).updateLootBudget();
    }

    /**
    * @dev Returns the gauge for a Quest
    * @param questId ID of the Quest
    * @param distributor Address of the Distributor handling the Quest rewards
    * @return address : Address of the gauge
    */
    function _getQuestGauge(
        uint256 questId,
        address distributor
    ) internal view returns(address) {
        address board = MultiMerkleDistributorV2(distributor).questBoard();
        return IQuestBoard(board).quests(questId).gauge;
    }

    /**
    * @dev Returns the allocation of a Quest for a period based on the budget for a gauge & the number of Quests for the gauge for this period
    * @param gauge Address of the gauge
    * @param questId ID of the Quest
    * @param distributor Address of the Distributor handling the Quest rewards
    * @param period Timestamp of the period
    * @return Allocation : Quest Allocation for the period
    */
    function _getQuestAllocationForPeriod(
        address gauge,
        uint256 questId,
        address distributor,
        uint256 period
    ) internal view returns(Allocation memory) {
        address board = MultiMerkleDistributorV2(distributor).questBoard();
        uint256 nbQuestForGauge = IQuestBoard(board).getQuestIdsForPeriodForGauge(gauge, period).length;
        uint256 questTotalRewards = totalQuestPeriodRewards[distributor][questId][period];

        if(nbQuestForGauge == 0 || questTotalRewards == 0) return Allocation(0, 0);

        Allocation memory allocation;
        // Load the Budget for the gauge for the period
        Budget memory budget = gaugeBudgetPerPeriod[gauge][period];

        // Calculate the allocation per vote based on the gauge budget 
        // & total rewards for the Quest & the number of Quests for the gauge
        if(nbQuestForGauge == 1) {
            allocation.palPerVote = uint128((((budget.palAmount * UNIT) / questTotalRewards) * UNIT) / MAX_MULTIPLIER);
            allocation.extraPerVote = uint128((((budget.extraAmount * UNIT) / questTotalRewards) * UNIT) / MAX_MULTIPLIER);
        } else {
            allocation.palPerVote = uint128(((((budget.palAmount / nbQuestForGauge) * UNIT) / questTotalRewards) * UNIT) / MAX_MULTIPLIER);
            allocation.extraPerVote = uint128(((((budget.extraAmount / nbQuestForGauge) * UNIT) / questTotalRewards) * UNIT) / MAX_MULTIPLIER);
        }

        return allocation;
    }

    /**
    * @dev Updates the current period budget & uses the pending budget
    */
    function _updatePeriod() internal {
        if(block.timestamp < nextBudgetUpdatePeriod) return;

        // Save the current block number for checkpointing
        periodBlockCheckpoint[nextBudgetUpdatePeriod] = block.number;

        // Update the current period budget
        Budget memory pending = pengingBudget;
        pengingBudget = Budget(0, 0);

        // 2 weeks difference to not impact the current distribution and allocations
        uint256 lastFinishedPeriod = nextBudgetUpdatePeriod - (WEEK * 2);
        Budget memory previousBudget = periodBudget[lastFinishedPeriod];
        Budget memory previousSpent = allocatedBudgetHistory[lastFinishedPeriod];
        pending.palAmount += previousBudget.palAmount - previousSpent.palAmount;
        pending.extraAmount += previousBudget.extraAmount - previousSpent.extraAmount;

        // Save the new set budget
        periodBudget[nextBudgetUpdatePeriod] = pending;

        nextBudgetUpdatePeriod += WEEK;
    }

    /**
    * @dev Creates a Loot based on the user claimed Quest rewards and its hPalPower adjusted balance
    * @param user Address of the user
    * @param distributor Address of the Distributor handling the Quest rewards
    * @param questId ID of the Quest
    * @param period Timestamp of the period
    */
    function _createLoot(address user, address distributor, uint256 questId, uint256 period) internal {
        CreateVars memory vars;
        if(!allowedDistributors[distributor]) return;
        
        vars.gauge = _getQuestGauge(questId, distributor);
        if(!ILootVoteController(lootVoteController).isListedGauge(vars.gauge)) return;

        // Get Quest allocation
        Allocation memory allocation = _getQuestAllocationForPeriod(vars.gauge, questId, distributor, period);

        // Get user boost power and total power
        vars.userPower = IHolyPowerDelegation(holyPower).adjusted_balance_of_at(user, period);
        vars.totalPower = IHolyPowerDelegation(holyPower).total_locked_at(periodBlockCheckpoint[period]);

        vars.userPeriodRewards = userQuestPeriodRewards[distributor][questId][period][user];
        if(vars.userPeriodRewards == 0) return;

        // Calculate ratios based on that
        vars.lockedRatio = (vars.userPower * UNIT) / vars.totalPower;
        vars.rewardRatio = (vars.userPeriodRewards * UNIT) / totalQuestPeriodRewards[distributor][questId][period];
        if(vars.rewardRatio > 0) vars.totalRatio = (vars.lockedRatio * UNIT) / vars.rewardRatio;

        vars.userMultiplier = (vars.totalRatio * MAX_MULTIPLIER) / UNIT;
        if(vars.userMultiplier < BASE_MULTIPLIER) vars.userMultiplier = BASE_MULTIPLIER; // don't go under the min
        if(vars.userMultiplier > MAX_MULTIPLIER) vars.userMultiplier = MAX_MULTIPLIER; // don't want to go higher than the max

        // Calculate user undistributed rewards
        vars.userPalAmount = ((uint256(allocation.palPerVote) * vars.userMultiplier / UNIT) * vars.userPeriodRewards / UNIT);
        vars.userExtraAmount = ((uint256(allocation.extraPerVote) * vars.userMultiplier / UNIT) * vars.userPeriodRewards / UNIT);

        // Retrieve unallocated rewards
        if(vars.userMultiplier < MAX_MULTIPLIER) {
            pengingBudget.palAmount += uint128(
                ((uint256(allocation.palPerVote) * (MAX_MULTIPLIER - vars.userMultiplier) / UNIT) * vars.userPeriodRewards / UNIT)
            );
            pengingBudget.extraAmount += uint128(
                ((uint256(allocation.extraPerVote) * (MAX_MULTIPLIER - vars.userMultiplier) / UNIT) * vars.userPeriodRewards / UNIT)
            );
        }

        // Create the Loot
        Loot(loot).createLoot(user, period + WEEK, vars.userPalAmount, vars.userExtraAmount);

    }


    // Admin functions

    /**
    * @notice Adds a Distributor to the list
    * @dev Adds a new Distributor allowed to interact with this contract
    * @param distributor Address of the Distributor
    */
    function addDistributor(address distributor) external onlyOwner {
        if(distributor == address(0)) revert Errors.AddressZero();
        if(allowedDistributors[distributor]) revert Errors.AlreadyListed();

        allowedDistributors[distributor] = true;
        distributors.push(distributor);

        emit NewDistributorListed(distributor);
    }

    /**
    * @notice Removes a Distributor from the list
    * @dev Removes a Distributor allowed to interact with this contract
    * @param distributor Address of the Distributor
    */
    function removeDistributor(address distributor) external onlyOwner {
        if(distributor == address(0)) revert Errors.AddressZero();
        if(!allowedDistributors[distributor]) revert Errors.NotListed();

        allowedDistributors[distributor] = false;

        uint256 length = distributors.length;
        for(uint256 i; i < length;){
            if(distributors[i] == distributor){
                if(i != length - 1){
                    distributors[i] = distributors[length - 1];
                }
                distributors.pop();

                break;
            }

            unchecked { i++; }
        }

        emit DistributorUnlisted(distributor);
    }

    /**
    * @notice Updates the Loot Gauge/Budget address
    * @dev Updates the Loot Gauge/Budget address
    * @param newGauge Address of the new Loot Gauge/Budget contract
    */
    function updateLootGauge(address newGauge) external onlyOwner {
        if(newGauge == address(0)) revert Errors.AddressZero();
        if(lootGauge == newGauge) revert Errors.SameAddress();

        address oldGauge = lootGauge;
        lootGauge = newGauge;

        emit GaugeUpdated(oldGauge, newGauge);
    }


}