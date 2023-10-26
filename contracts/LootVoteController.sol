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
import {ILootVoteController} from "./interfaces/ILootVoteController.sol";
import {IHolyPalPower} from "./interfaces/IHolyPalPower.sol";
import {IHolyPowerDelegation} from "./interfaces/IHolyPowerDelegation.sol";
import "./libraries/Errors.sol";
import "./utils/Owner.sol";

/** @title Loot Vote Controller contract */
/// @author Paladin
/*
    to do
*/
contract LootVoteController is Owner, ReentrancyGuard, ILootVoteController {
    using SafeERC20 for IERC20;

    // Constants

    /** @notice Seconds in a Week */
    uint256 private constant WEEK = 604800;

    uint256 private constant UNIT = 1e18;

    uint256 private constant MAX_BPS = 10000;

    uint256 private constant VOTE_COOLDOWN = 864000; // 10 days


    // Structs

    struct QuestBoard {
        address board;
        address distributor;
    }

    struct Point {
        uint256 bias;
        uint256 slope;
    }

    struct VotedSlope {
        uint256 slope;
        uint256 power;
        uint256 end;
    }

    struct VoteVars {
        uint256 currentPeriod;
        uint256 nextPeriod;
        int128 userSlope;
        uint256 userLockEnd;
        uint256 oldBias;
        uint256 newBias;
        uint256 totalPowerUsed;
        uint256 oldWeightBias;
        uint256 oldWeightSlope;
        uint256 oldTotalBias;
        uint256 oldTotalSlope;
    }


    // Storage

    address public hPalPower;

    uint256 public nextBoardId; // ID 0 == no ID/not set

    mapping(uint256 => QuestBoard) public questBoards;
    mapping(address => uint256) public boardToId;
    mapping(address => uint256) public distributorToId;

    mapping(address => uint256) public gaugeToBoardId;
    
    uint256 public defaultCap = 0.1 * 1e18; // 10%
    mapping(address => uint256) public gaugeCaps;
    mapping(address => bool) public isGaugeKilled;

    // user -> gauge_addr -> VotedSlope
    mapping(address => mapping(address => VotedSlope)) public voteUserSlopes;
    // Total vote power used by user
    mapping(address => uint256) public voteUserPower;
    // Last user vote's timestamp for each gauge address
    mapping(address => mapping(address => uint256)) public lastUserVote;

    mapping(address => mapping(address => IHolyPowerDelegation.SlopeChange[])) public userSlopeChanges;

    // gauge_addr -> time -> Point
    mapping(address => mapping(uint256 => Point)) public pointsWeight;
    // gauge_addr -> time -> slope
    mapping(address => mapping(uint256 => uint256)) public changesWeight;
    // gauge_addr -> last scheduled time (next week)
    mapping(address => uint256) public timeWeight;

    // time -> Point
    mapping(uint256 => Point) public pointsWeightTotal;
    // time -> slope
    mapping(uint256 => uint256) public changesWeightTotal;
    // last scheduled time
    uint256 public timeTotal;


    // Events

    event VoteForGauge(
        uint256 time,
        address user,
        address gauge_addr,
        uint256 weight
    );

    event NewBoardListed(uint256 id, address indexed board, address indexed distributor);
    event BoardUpdated(uint256 id, address indexed newDistributor);

    event NewGaugeAdded(address indexed gauge, uint256 indexed boardId, uint256 cap);
    event GaugeCapUpdated(address indexed gauge, uint256 indexed boardId, uint256 newCap);
    event GaugeKilled(address indexed gauge, uint256 indexed boardId);
    event GaugeUnkilled(address indexed gauge, uint256 indexed boardId);


    // Constructor

    constructor(address _hPalPower) {
        hPalPower = _hPalPower;

        nextBoardId++;
    }


    // View functions

    function isListedGauge(address gauge) external view returns(bool) {
        return _isGaugeListed(gauge);
    }

    function getBoardForGauge(address gauge) external view returns(address) {
        return questBoards[gaugeToBoardId[gauge]].board;
    }

    function getDistributorForGauge(address gauge) external view returns(address) {
        return questBoards[gaugeToBoardId[gauge]].distributor;
    }

    function getGaugeWeight(address gauge) external view returns(uint256) {
        return pointsWeight[gauge][timeWeight[gauge]].bias;
    }

    function getGaugeWeightAt(address gauge, uint256 ts) external view returns(uint256) {
        ts = ts / WEEK * WEEK;
        return pointsWeight[gauge][ts].bias;
    }

    function getGaugeRelativeWeight(address gauge) external view returns(uint256) {
        return _getGaugeRelativeWeight(gauge, block.timestamp);
    }

    function getGaugeRelativeWeight(address gauge, uint256 ts) external view returns(uint256) {
        return _getGaugeRelativeWeight(gauge, ts);
    }

    function getGaugeCap(address gauge) external view returns(uint256) {
        return gaugeCaps[gauge];
    }


    // State-changing functions

    function voteForGaugeWeights(address gauge, uint256 userPower) external nonReentrant {
        _voteForGauge(msg.sender, gauge, userPower);
    }

    function voteForManyGaugeWeights(address[] memory gauge, uint256[] memory userPower) external nonReentrant {
        uint256 length = gauge.length;
        if(length != userPower.length) revert Errors.ArraySizeMismatch();
        for(uint256 i; i < length;) {
            _voteForGauge(msg.sender, gauge[i], userPower[i]);
            unchecked { ++i; }
        }
    }

    function getGaugeRelativeWeightWrite(address gauge) external returns(uint256) {
        _updateGaugeWeight(gauge);
        _updateTotalWeight();
        return _getGaugeRelativeWeight(gauge, block.timestamp);
    }

    function getGaugeRelativeWeightWrite(address gauge, uint256 ts) external returns(uint256) {
        _updateGaugeWeight(gauge);
        _updateTotalWeight();
        return _getGaugeRelativeWeight(gauge, ts);
    }

    function updateGaugeWeight(address gauge) external {
        _updateGaugeWeight(gauge);
    }

    function updateTotalWeight() external {
        _updateTotalWeight();
    }


    // Internal functions

    function _isGaugeListed(address gauge) internal view returns(bool) {
        return gaugeToBoardId[gauge] != 0;
    }

    function _voteForGauge(address user, address gauge, uint256 userPower) internal {
        VoteVars memory vars;
        
        vars.currentPeriod = (block.timestamp) / WEEK * WEEK;
        vars.nextPeriod = vars.currentPeriod + WEEK;
        vars.userSlope = IHolyPowerDelegation(hPalPower).getUserPointAt(user, vars.currentPeriod).slope;
        vars.userLockEnd = IHolyPowerDelegation(hPalPower).locked__end(user);

        if(vars.userLockEnd < vars.nextPeriod) revert Errors.LockExpired();
        if(userPower > MAX_BPS) revert Errors.VotingPowerInvalid();
        if(block.timestamp < lastUserVote[user][gauge] + VOTE_COOLDOWN) revert Errors.VotingCooldown();

        VotedSlope memory oldSlope = voteUserSlopes[user][gauge];
        if(oldSlope.end > vars.nextPeriod) {
            vars.oldBias = oldSlope.slope * (oldSlope.end - vars.nextPeriod);
        }

        VotedSlope memory newSlope = VotedSlope({
            slope: (convertInt128ToUint128(vars.userSlope) * userPower) / MAX_BPS,
            power: userPower,
            end: vars.userLockEnd
        });
        vars.newBias = newSlope.slope * (vars.userLockEnd - vars.nextPeriod);

        vars.totalPowerUsed = voteUserPower[user];
        vars.totalPowerUsed = vars.totalPowerUsed + newSlope.power - oldSlope.power;
        if(vars.totalPowerUsed > MAX_BPS) revert Errors.VotingPowerExceeded();
        voteUserPower[user] = vars.totalPowerUsed;

        vars.oldWeightBias = _updateGaugeWeight(gauge);
        vars.oldWeightSlope = pointsWeight[gauge][vars.nextPeriod].slope;

        vars.oldTotalBias = _updateTotalWeight();
        vars.oldTotalSlope = pointsWeightTotal[vars.nextPeriod].slope;

        pointsWeight[gauge][vars.nextPeriod].bias = max(vars.oldWeightBias + vars.newBias, vars.oldBias) - vars.oldBias;
        pointsWeightTotal[vars.nextPeriod].bias = max(vars.oldTotalBias + vars.newBias, vars.oldBias) - vars.oldBias;

        if(oldSlope.end > vars.nextPeriod) {
            pointsWeight[gauge][vars.nextPeriod].slope = max(vars.oldWeightSlope + newSlope.slope, oldSlope.slope) - oldSlope.slope;
            pointsWeightTotal[vars.nextPeriod].slope = max(vars.oldTotalSlope + newSlope.slope, oldSlope.slope) - oldSlope.slope;
        } else {
            pointsWeight[gauge][vars.nextPeriod].slope = newSlope.slope;
            pointsWeightTotal[vars.nextPeriod].slope = newSlope.slope;
        }

        if(oldSlope.end > block.timestamp) {
            changesWeight[gauge][oldSlope.end] -= oldSlope.slope;
            changesWeightTotal[oldSlope.end] -= oldSlope.slope;
        }
        changesWeight[gauge][newSlope.end] += newSlope.slope;
        changesWeightTotal[newSlope.end] += newSlope.slope;

        _updateUserSlopeChanges(user, gauge, userPower);

        _updateTotalWeight();

        voteUserSlopes[user][gauge] = newSlope;
        lastUserVote[user][gauge] = block.timestamp;

        emit VoteForGauge(block.timestamp, user, gauge, userPower);
    }

    function _updateUserSlopeChanges(address user, address gauge, uint256 userPower) internal {
       IHolyPowerDelegation.SlopeChange[] memory oldUserChanges = userSlopeChanges[user][gauge];
        uint256 length = oldUserChanges.length;
        if(length > 0) {
            for(uint256 i; i < length;) {
                if(oldUserChanges[i].endTimestamp < block.timestamp) continue;

                changesWeight[gauge][oldUserChanges[i].endTimestamp] -= oldUserChanges[i].slopeChange;
                changesWeightTotal[oldUserChanges[i].endTimestamp] -= oldUserChanges[i].slopeChange;

                unchecked { ++i; }
            }
        }

        delete userSlopeChanges[user][gauge];

        if(userPower == 0) return;

        IHolyPowerDelegation.SlopeChange[] memory newUserChanges = IHolyPowerDelegation(hPalPower).getUserSlopeChanges(user);
        length = newUserChanges.length;
        if(length == 0) return;

        for(uint256 i; i < length;) {
            if(newUserChanges[i].endTimestamp < block.timestamp) continue;

            newUserChanges[i].slopeChange = (newUserChanges[i].slopeChange * userPower) / MAX_BPS;

            changesWeight[gauge][newUserChanges[i].endTimestamp] += newUserChanges[i].slopeChange;
            changesWeightTotal[newUserChanges[i].endTimestamp] += newUserChanges[i].slopeChange;

            unchecked { ++i; }
        }
    }

    function _getGaugeRelativeWeight(address gauge, uint256 ts) internal view returns(uint256) {
        ts = ts / WEEK * WEEK;

        uint256 _totalWeight = pointsWeightTotal[ts].bias;
        if(_totalWeight == 0) return 0;

        return (pointsWeight[gauge][ts].bias * UNIT) / _totalWeight;
    }

    function _updateGaugeWeight(address gauge) internal returns(uint256) {
        uint256 ts = timeWeight[gauge];

        if(ts == 0) return 0;

        Point memory _point = pointsWeight[gauge][ts];
        for(uint256 i; i < 50;) {
            if(ts > block.timestamp) break;
            ts += WEEK;

            uint256 decreaseBias = _point.slope * WEEK;
            if(decreaseBias > _point.bias) {
                _point.bias = 0;
                _point.slope = 0;
            } else {
                _point.bias -= decreaseBias;
                uint256 decreaseSlope = changesWeight[gauge][ts];
                _point.slope -= decreaseSlope;
            }

            pointsWeight[gauge][ts] = _point;

            if(ts > block.timestamp) {
                timeWeight[gauge] = ts;
            }

            unchecked { ++i; }
        }

        return _point.bias;
    }

    function _updateTotalWeight() internal returns(uint256) {
        uint256 ts = timeTotal;

        if(ts == 0) return 0;

        Point memory _point = pointsWeightTotal[ts];
        for(uint256 i; i < 50;) {
            if(ts > block.timestamp) break;
            ts += WEEK;

            uint256 decreaseBias = _point.slope * WEEK;
            if(decreaseBias > _point.bias) {
                _point.bias = 0;
                _point.slope = 0;
            } else {
                _point.bias -= decreaseBias;
                uint256 decreaseSlope = changesWeightTotal[ts];
                _point.slope -= decreaseSlope;
            }

            pointsWeightTotal[ts] = _point;

            if(ts > block.timestamp) {
                timeTotal = ts;
            }

            unchecked { ++i; }
        }

        return _point.bias;
    }


    // Admin functions

    function addNewBoard(address board, address distributor) external onlyOwner {
        if(board == address(0) || distributor == address(0)) revert Errors.AddressZero();
        if(boardToId[board] != 0) revert Errors.AlreadyListed();
        
        uint256 boardId = nextBoardId;
        nextBoardId++;

        questBoards[boardId] = QuestBoard(board, distributor);
        boardToId[board] = boardId;
        distributorToId[distributor] = boardId;

        emit NewBoardListed(boardId, board, distributor);
    }

    function updateDistributor(address board, address newDistributor) external onlyOwner {
        if(board == address(0) || newDistributor == address(0)) revert Errors.AddressZero();
        
        uint256 boardId = boardToId[board];
        if(boardId == 0) revert Errors.InvalidParameter();

        questBoards[boardId].distributor = newDistributor;
        distributorToId[newDistributor] = boardId;

        emit BoardUpdated(boardId, newDistributor);
    }

    function addNewGauge(address gauge, uint256 boardId, uint256 cap) external onlyOwner {
        if(gauge == address(0)) revert Errors.AddressZero();
        if(boardId == 0) revert Errors.InvalidParameter();
        if(_isGaugeListed(gauge)) revert Errors.AlreadyListed();

        gaugeToBoardId[gauge] = boardId;
        gaugeCaps[gauge] = cap;

        timeWeight[gauge] = (block.timestamp + WEEK) / WEEK * WEEK;

        emit NewGaugeAdded(gauge, boardId, cap);
    }

    function updateGaugeCap(address gauge, uint256 newCap) external onlyOwner {
        if(gauge == address(0)) revert Errors.AddressZero();
        if(!isGaugeKilled[gauge]) revert Errors.InvalidParameter();

        gaugeCaps[gauge] = newCap;

        emit GaugeCapUpdated(gauge, gaugeToBoardId[gauge], newCap);
    }

    function killGauge(address gauge) external onlyOwner {
        if(gauge == address(0)) revert Errors.AddressZero();
        if(!isGaugeKilled[gauge]) revert Errors.InvalidParameter();

        isGaugeKilled[gauge] = true;

        emit GaugeKilled(gauge, gaugeToBoardId[gauge]);
    }

    function unkillGauge(address gauge) external onlyOwner {
        if(gauge == address(0)) revert Errors.AddressZero();
        if(isGaugeKilled[gauge]) revert Errors.InvalidParameter();

        isGaugeKilled[gauge] = false;

        emit GaugeUnkilled(gauge, gaugeToBoardId[gauge]);
    }

    // Maths

    function convertInt128ToUint128(int128 value) internal pure returns(uint128) {
        if (value < 0) revert Errors.ConversionOverflow();
        return uint128(value);
    }

    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }

}