//██████╗  █████╗ ██╗      █████╗ ██████╗ ██╗███╗   ██╗
//██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██║████╗  ██║
//██████╔╝███████║██║     ███████║██║  ██║██║██╔██╗ ██║
//██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██║██║╚██╗██║
//██║     ██║  ██║███████╗██║  ██║██████╔╝██║██║ ╚████║
//╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝
 

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ILootCreator} from "./interfaces/ILootCreator.sol";
import {ILootGauge} from "./interfaces/ILootGauge.sol";
import {ILootVoteController} from "./interfaces/ILootVoteController.sol";
import {IQuestBoard} from "./interfaces/IQuestBoard.sol";
import {IHolyPowerDelegation} from "./interfaces/IHolyPowerDelegation.sol";
import {Loot} from "./Loot.sol";
import {MultiMerkleDistributorV2} from "./MultiMerkleDistributorV2.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./utils/Owner.sol";
import "./libraries/Errors.sol";

/** @title Loot Creator contract */
/// @author Paladin
/*
    TODO
*/
contract LootCreator is Owner, ReentrancyGuard, ILootCreator {

    // Constants

    /** @notice Seconds in a Week */
    uint256 private constant WEEK = 604800;

    uint256 private constant UNIT = 1e18;

    uint256 public constant BASE_MULTIPLIER = 1e18;

    uint256 public constant MAX_MULTIPLIER = 5e18;


    // Structs

    struct Budget {
        uint128 palAmount;
        uint128 extraAmount;
    }

    struct Allocation {
        uint128 palPerVote;
        uint128 extraPerVote;
    }

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

    // immutables here
    address public immutable loot;
    address public immutable lootVoteController;
    address public immutable holyPower;
    address public lootGauge;

    mapping(address => bool) public allowedDistributors;
    address[] public distributors;

    uint256 public nextBudgetUpdatePeriod;

    Budget public pengingBudget;

    mapping(uint256 => Budget) public periodBudget;
    mapping(uint256 => Budget) public allocatedBudgetHistory;

    mapping(address => mapping(uint256 => Allocation)) public gaugeAllocationPerPeriod;
    mapping(address => mapping(uint256 => bool)) public isGaugeAllocatedForPeriod;

    mapping(uint256 => uint256) public periodBlockCheckpoint;

    // id -> period -> total
    mapping(uint256 => mapping(uint256 => uint256)) public totalQuestPeriodRewards;
    mapping(uint256 => mapping(uint256 => bool)) public totalQuestPeriodSet;
    // distributor -> id -> period -> user -> amount
    mapping(address => mapping(uint256 => mapping(uint256 => mapping(address => uint256)))) public userQuestPeriodRewards;


    // Events

    event NewDistributorListed(address indexed distributor);
    event DistributorUnlisted(address indexed distributor);


    // Modifiers

    modifier onlyAllowedDistributor() {
        if(!allowedDistributors[msg.sender]) revert Errors.CallerNotAllowed();
        _;
    }

    modifier onlyLoot() {
        if(msg.sender != loot) revert Errors.CallerNotAllowed();
        _;
    }

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
        loot = _loot;
        lootVoteController = _lootVoteController;
        holyPower = _holyPower;

        nextBudgetUpdatePeriod = (block.timestamp + WEEK) / WEEK * WEEK;
    }

    function init(address _lootGauge) external onlyOwner {
        if(_lootGauge == address(0)) revert Errors.AddressZero();
        if(lootGauge != address(0)) revert Errors.AlreadyInitialized();

        lootGauge = _lootGauge;
    }


    // View functions

    function getBudgetForPeriod(uint256 period) external view returns(uint256 palAmount, uint256 extraAmount) {
        palAmount = periodBudget[period].palAmount;
        extraAmount = periodBudget[period].extraAmount;
    }

    function getGaugeAllocationForPeriod(
        address gauge,
        uint256 period
    ) external view returns(uint256 palPerVote, uint256 extraPerVote) {
        Allocation memory allocation = gaugeAllocationPerPeriod[gauge][period];
        palPerVote = allocation.palPerVote;
        extraPerVote = allocation.extraPerVote;
    }

    function getQuestAllocationForPeriod(
        uint256 questId,
        address distributor,
        uint256 period
    ) external view returns(uint256 palPerVote, uint256 extraPerVote) {
        address gauge = _getQuestGauge(questId, distributor);
        Allocation memory allocation = _getQuestAllocationForPeriod(gauge, distributor, period);
        palPerVote = allocation.palPerVote;
        extraPerVote = allocation.extraPerVote;
    }

    function getListedDistributors() external view returns(address[] memory) {
        return distributors;
    }


    // State-changing functions

    function createLoot(address user, address distributor, uint256 questId, uint256 period) external nonReentrant {
        _createLoot(user, distributor, questId, period);
    }

    struct MultiCreate {
        address distributor;
        uint256 questId;
        uint256 period;
    }

    function createMultipleLoot(address user, MultiCreate[] calldata params) external nonReentrant {
        uint256 length = params.length;
        if(length == 0) revert Errors.EmptyParameters();

        for(uint256 i; i < length; i++){
            _createLoot(user, params[i].distributor, params[i].questId, params[i].period);
        }
    }

    function notifyQuestClaim(address user, uint256 questId, uint256 period, uint256 claimedAmount) external onlyAllowedDistributor nonReentrant {
        userQuestPeriodRewards[msg.sender][questId][period][user] = claimedAmount;
    }

    function notifyDistributedQuestPeriod(uint256 questId, uint256 period, uint256 totalRewards) external onlyAllowedDistributor nonReentrant {
        _pullBudget();
        _updatePeriod();
        
        address gauge = _getQuestGauge(questId, msg.sender);
        if(!ILootVoteController(lootVoteController).isListedGauge(gauge)) return;

        if(!totalQuestPeriodSet[questId][period]) {
            totalQuestPeriodRewards[questId][period] = totalRewards;
            totalQuestPeriodSet[questId][period] = true;
        }

        if(isGaugeAllocatedForPeriod[gauge][period]) return;
        isGaugeAllocatedForPeriod[gauge][period] = true;

        uint256 gaugeWeight = ILootVoteController(lootVoteController).getGaugeRelativeWeightWrite(gauge, period);
        uint256 gaugeCap = ILootVoteController(lootVoteController).getGaugeCap(gauge);

        Budget memory budget = periodBudget[period];

        if(gaugeWeight > gaugeCap) {
            uint256 unsunedWeight = gaugeWeight - gaugeCap;

            gaugeWeight = gaugeCap;

            // Handle un-allocated
            pengingBudget.palAmount += uint128(uint256(budget.palAmount) * unsunedWeight / UNIT);
            pengingBudget.extraAmount += uint128(uint256(budget.extraAmount) * unsunedWeight / UNIT);
        }

        uint256 palAmount = uint256(budget.palAmount) * gaugeWeight / UNIT;
        uint256 extraAmount = uint256(budget.extraAmount) * gaugeWeight / UNIT;

        allocatedBudgetHistory[period].palAmount += uint128(palAmount);
        allocatedBudgetHistory[period].extraAmount += uint128(extraAmount);

        uint256 palPerVote = (((palAmount * UNIT) / totalRewards) * UNIT) / MAX_MULTIPLIER;
        uint256 extraPerVote = (((extraAmount * UNIT) / totalRewards) * UNIT) / MAX_MULTIPLIER;

        Allocation memory allocation = Allocation(
            uint128(palPerVote),
            uint128(extraPerVote)
        );

        gaugeAllocationPerPeriod[gauge][period] = allocation;

    }

	function notifyUndistributedRewards(uint256 palAmount) external onlyLoot nonReentrant {
        pengingBudget.palAmount += uint128(palAmount);
    }

	function notifyNewBudget(uint256 palAmount, uint256 extraAmount) external onlyGauge {
        pengingBudget.palAmount += uint128(palAmount);
        pengingBudget.extraAmount += uint128(extraAmount);
    }

    function updatePeriod() external {
        _pullBudget();
        _updatePeriod();
    }


    // Internal functions

    function _pullBudget() internal {
        if(lootGauge == address(0)) return;
        ILootGauge(lootGauge).updateLootBudget();
    }

    function _getQuestGauge(
        uint256 questId,
        address distributor
    ) internal view returns(address) {
        address board = MultiMerkleDistributorV2(distributor).questBoard();
        return IQuestBoard(board).quests(questId).gauge;
    }

    function _getQuestAllocationForPeriod(
        address gauge,
        address distributor,
        uint256 period
    ) internal view returns(Allocation memory) {
        address board = MultiMerkleDistributorV2(distributor).questBoard();
        uint256 nbQuestForGauge = IQuestBoard(board).getQuestIdsForPeriodForGauge(gauge, period).length;

        if(nbQuestForGauge == 0) return Allocation(0, 0);
        if(nbQuestForGauge == 1) return gaugeAllocationPerPeriod[gauge][period];

        Allocation memory allocation = gaugeAllocationPerPeriod[gauge][period];
        allocation.palPerVote = uint128(uint256(allocation.palPerVote) / nbQuestForGauge);
        allocation.extraPerVote = uint128(uint256(allocation.extraPerVote) / nbQuestForGauge);

        return allocation;
    }

    function _updatePeriod() internal {
        if(block.timestamp < nextBudgetUpdatePeriod) return;

        periodBlockCheckpoint[nextBudgetUpdatePeriod] = block.number;

        Budget memory pending = pengingBudget;
        pengingBudget = Budget(0, 0);

        // 2 weeks difference to not impact the current distribution and allocations
        Budget memory previousBudget = periodBudget[nextBudgetUpdatePeriod - WEEK];
        Budget memory previousSpent = allocatedBudgetHistory[nextBudgetUpdatePeriod - WEEK];
        pending.palAmount += previousBudget.palAmount - previousSpent.palAmount;
        pending.extraAmount += previousBudget.extraAmount - previousSpent.extraAmount;

        periodBudget[nextBudgetUpdatePeriod + WEEK] = pending;

        nextBudgetUpdatePeriod += WEEK;
    }

    function _createLoot(address user, address distributor, uint256 questId, uint256 period) internal {
        CreateVars memory vars;
        if(!allowedDistributors[distributor]) return;
        
        vars.gauge = _getQuestGauge(questId, distributor);
        if(!ILootVoteController(lootVoteController).isListedGauge(vars.gauge)) return;

        // get Quest allocation
        Allocation memory allocation = _getQuestAllocationForPeriod(vars.gauge, distributor, period);

        // get user boost power and total power
        vars.userPower = IHolyPowerDelegation(holyPower).adjusted_balance_of_at(user, period);
        vars.totalPower = IHolyPowerDelegation(holyPower).total_locked_at(periodBlockCheckpoint[period]);

        vars.userPeriodRewards = userQuestPeriodRewards[distributor][questId][period][user];
        if(vars.userPeriodRewards == 0) return;

        // calculate ratios based on that
        vars.lockedRatio = (vars.userPower * UNIT) / vars.totalPower;
        vars.rewardRatio = (vars.userPeriodRewards * UNIT) / totalQuestPeriodRewards[questId][period];
        if(vars.rewardRatio > 0) vars.totalRatio = (vars.lockedRatio * UNIT) / vars.rewardRatio;

        vars.userMultiplier = (vars.totalRatio * MAX_MULTIPLIER) / UNIT;
        if(vars.userMultiplier < BASE_MULTIPLIER) vars.userMultiplier = BASE_MULTIPLIER; // don't go under the min
        if(vars.userMultiplier > MAX_MULTIPLIER) vars.userMultiplier = MAX_MULTIPLIER; // don't want to go higher than the max

        // calculate user undistributed rewards
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

        // create the Loot
        Loot(loot).createLoot(user, period, vars.userPalAmount, vars.userExtraAmount);

    }


    // Admin functions

    function addDistributor(address distributor) external onlyOwner {
        if(distributor == address(0)) revert Errors.AddressZero();
        if(allowedDistributors[distributor]) revert Errors.AlreadyListed();

        allowedDistributors[distributor] = true;
        distributors.push(distributor);

        emit NewDistributorListed(distributor);
    }

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


}