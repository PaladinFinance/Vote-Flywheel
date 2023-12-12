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
        address caller;
    }

    struct VoteVars {
        uint256 currentPeriod;
        uint256 nextPeriod;
        int128 userSlope;
        uint256 userLockEnd;
        uint256 oldBias;
        uint256 newBias;
        uint256 totalPowerUsed;
        uint256 oldUsedPower;
        uint256 oldWeightBias;
        uint256 oldWeightSlope;
        uint256 oldTotalBias;
        uint256 oldTotalSlope;
    }

    struct ProxyManager {
        uint256 maxPower;
        uint256 usedPower;
        uint256 endTimestamp;
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

    // user -> proxy voter -> bool
    mapping(address => mapping(address => bool)) public isProxyManager;

    // user -> proxy voter -> state
    mapping(address => mapping(address => ProxyManager)) public proxyManagerState;

    mapping(address => address[]) public currentUserProxyVoters;

    mapping(address => uint256) public blockedProxyPower;
    mapping(address => uint256) public usedFreePower;



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

    event SetProxyManager(address indexed user, address indexed manager);
    event SetNewProxyVoter(address indexed user, address indexed proxyVoter, uint256 maxPower, uint256 endTimestamp);


    // Constructor

    constructor(address _hPalPower) {
        hPalPower = _hPalPower;

        nextBoardId++;

        timeTotal = (block.timestamp) / WEEK * WEEK;
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

    function getTotalWeight() external view returns(uint256) {
        return pointsWeightTotal[timeTotal].bias;
    }

    function getGaugeRelativeWeight(address gauge) external view returns(uint256) {
        return _getGaugeRelativeWeight(gauge, block.timestamp);
    }

    function getGaugeRelativeWeight(address gauge, uint256 ts) external view returns(uint256) {
        return _getGaugeRelativeWeight(gauge, ts);
    }

    function getGaugeCap(address gauge) external view returns(uint256) {
        return gaugeCaps[gauge] != 0 ? gaugeCaps[gauge] : defaultCap;
    }

    function getUserProxyVoters(address user) external view returns(address[] memory) {
        return currentUserProxyVoters[user];
    }


    // State-changing functions

    function voteForGaugeWeights(address gauge, uint256 userPower) external nonReentrant {
        _voteForGauge(msg.sender, gauge, userPower, msg.sender);
    }

    function voteForManyGaugeWeights(address[] memory gauge, uint256[] memory userPower) external nonReentrant {
        uint256 length = gauge.length;
        if(length != userPower.length) revert Errors.ArraySizeMismatch();
        for(uint256 i; i < length; i++) {
            _voteForGauge(msg.sender, gauge[i], userPower[i], msg.sender);
        }
    }

    function voteForGaugeWeightsFor(address user, address gauge, uint256 userPower) external nonReentrant {
        ProxyManager memory proxyState = proxyManagerState[user][msg.sender];
        if(proxyState.maxPower == 0) revert Errors.NotAllowedManager();
        if(proxyState.endTimestamp < block.timestamp) revert Errors.ExpiredProxy();
        if(userPower > proxyState.maxPower) revert Errors.VotingPowerProxyExceeded();

        _voteForGauge(user, gauge, userPower, msg.sender);
    }

    function voteForManyGaugeWeightsFor(address user, address[] memory gauge, uint256[] memory userPower) external nonReentrant {
        ProxyManager memory proxyState = proxyManagerState[user][msg.sender];
        if(proxyState.maxPower == 0) revert Errors.NotAllowedManager();
        if(proxyState.endTimestamp < block.timestamp) revert Errors.ExpiredProxy();
        uint256 totalPower;

        uint256 length = gauge.length;
        if(length != userPower.length) revert Errors.ArraySizeMismatch();
        for(uint256 i; i < length; i++) {
            totalPower += userPower[i];
            _voteForGauge(user, gauge[i], userPower[i], msg.sender);
        }
        if(totalPower > proxyState.maxPower) revert Errors.VotingPowerProxyExceeded();
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

    function approveProxyManager(address manager) external {
        if(manager == address(0)) revert Errors.AddressZero();

        isProxyManager[msg.sender][manager] = true;

        emit SetProxyManager(msg.sender, manager);
    }

    function setVoterProxy(address user, address proxy, uint256 maxPower, uint256 endTimestamp) external nonReentrant {
        if(!isProxyManager[user][msg.sender] && msg.sender != user) revert Errors.NotAllowedManager();
        if(maxPower == 0 || maxPower > MAX_BPS) revert Errors.VotingPowerInvalid();

        // Round down the end timestamp to weeks & check the user Lock is not expired then
        endTimestamp = endTimestamp / WEEK * WEEK;
        uint256 userLockEnd = IHolyPalPower(hPalPower).locked__end(user);
        if(endTimestamp < block.timestamp || endTimestamp > userLockEnd) revert Errors.InvalidTimestamp();

        // Clear any expired past Proxy
        _clearExpiredProxies(user);

        // Revert if the user already has a Proxy with the same address
        ProxyManager memory prevProxyState = proxyManagerState[user][proxy];
        if(prevProxyState.maxPower != 0) revert Errors.ProxyAlreadyActive();

        // Block the user's power for the Proxy & revert if the user execeed's its voting power
        uint256 userBlockedPower = blockedProxyPower[user];
        if(userBlockedPower + maxPower > MAX_BPS) revert Errors.ProxyPowerExceeded();
        blockedProxyPower[user] = userBlockedPower + maxPower;

        // Set up the Proxy
        proxyManagerState[user][proxy] = ProxyManager({
            maxPower: maxPower,
            usedPower: 0,
            endTimestamp: endTimestamp
        });

        // Add the Proxy to the user's list
        currentUserProxyVoters[user].push(proxy);

        emit SetNewProxyVoter(user, proxy, maxPower, endTimestamp);
    }

    function clearUserExpiredProxies(address user) external {
        _clearExpiredProxies(user);
    }


    // Internal functions

    function _isGaugeListed(address gauge) internal view returns(bool) {
        return gaugeToBoardId[gauge] != 0;
    }

    function _clearExpiredProxies(address user) internal {
        address[] memory proxies = currentUserProxyVoters[user];
        uint256 length = proxies.length;
        if(length == 0) return;
        uint256 lastIndex = length - 1;
        for(uint256 i; i < length; i++) {
            address proxyVoter = proxies[i];
            if(proxyManagerState[user][proxyVoter].endTimestamp < block.timestamp) {
                // Free the user blocked voting power
                blockedProxyPower[user] -= proxyManagerState[user][proxyVoter].maxPower;
                // Delete the Proxy
                delete proxyManagerState[user][proxyVoter];
                
                // Remove the Proxy from the user's list
                if(i != lastIndex) {
                    currentUserProxyVoters[user][i] = currentUserProxyVoters[user][length-1];
                }
                currentUserProxyVoters[user].pop();
            }
        }
    }

    function _voteForGauge(address user, address gauge, uint256 userPower, address caller) internal {
        VoteVars memory vars;
        
        // Get the periods timestamps & user lock state
        vars.currentPeriod = (block.timestamp) / WEEK * WEEK;
        vars.nextPeriod = vars.currentPeriod + WEEK;
        vars.userSlope = IHolyPalPower(hPalPower).getUserPointAt(user, vars.currentPeriod).slope;
        vars.userLockEnd = IHolyPalPower(hPalPower).locked__end(user);

        // Check the gauge is listed & the user lock is not expired
        if(!_isGaugeListed(gauge)) revert Errors.NotListed();
        if(vars.userLockEnd < vars.nextPeriod) revert Errors.LockExpired();
        // Check the user has enough voting power & the cooldown is respected
        if(userPower > MAX_BPS) revert Errors.VotingPowerInvalid();
        if(block.timestamp < lastUserVote[user][gauge] + VOTE_COOLDOWN) revert Errors.VotingCooldown();

        // Clear any expired past Proxy
        _clearExpiredProxies(user);

        // Load the user past vote state
        VotedSlope memory oldSlope = voteUserSlopes[user][gauge];
        if(oldSlope.end > vars.nextPeriod) {
            vars.oldBias = oldSlope.slope * (oldSlope.end - vars.nextPeriod);
        }

        // Calculate the new vote state
        VotedSlope memory newSlope = VotedSlope({
            slope: (convertInt128ToUint128(vars.userSlope) * userPower) / MAX_BPS,
            power: userPower,
            end: vars.userLockEnd,
            caller: caller
        });
        vars.newBias = newSlope.slope * (vars.userLockEnd - vars.nextPeriod);

        // Check if the caller is allowed to change this vote
        if(
            oldSlope.caller != caller && proxyManagerState[user][oldSlope.caller].endTimestamp > block.timestamp
        ) revert Errors.NotAllowedVoteChange();

        // Update the voter used voting power & the proxy one if needed
        vars.totalPowerUsed = voteUserPower[user];
        vars.totalPowerUsed = vars.totalPowerUsed + newSlope.power - oldSlope.power;
        if(user == caller) {
            uint256 usedPower = usedFreePower[user];
            vars.oldUsedPower = oldSlope.caller != user ? 0 : oldSlope.power;
            usedPower = usedPower + newSlope.power - vars.oldUsedPower;
            if(usedPower > (MAX_BPS - blockedProxyPower[user])) revert Errors.VotingPowerExceeded();
            usedFreePower[user] = usedPower;
        } else {
            uint256 proxyPower = proxyManagerState[user][caller].usedPower;
            vars.oldUsedPower = oldSlope.caller == caller ? oldSlope.power : 0;
            proxyPower = proxyPower + newSlope.power - vars.oldUsedPower;
            if(oldSlope.caller == user) {
                usedFreePower[user] -= oldSlope.power;
            }
            if(proxyPower > proxyManagerState[user][caller].maxPower) revert Errors.VotingPowerProxyExceeded();

            proxyManagerState[user][caller].usedPower = proxyPower;
        }
        if(vars.totalPowerUsed > MAX_BPS) revert Errors.VotingPowerExceeded();
        voteUserPower[user] = vars.totalPowerUsed;

        // Update the gauge weight
        vars.oldWeightBias = _updateGaugeWeight(gauge);
        vars.oldWeightSlope = pointsWeight[gauge][vars.nextPeriod].slope;

        // Update the total weight
        vars.oldTotalBias = _updateTotalWeight();
        vars.oldTotalSlope = pointsWeightTotal[vars.nextPeriod].slope;

        // Update the new gauge bias & total bias
        pointsWeight[gauge][vars.nextPeriod].bias = max(vars.oldWeightBias + vars.newBias, vars.oldBias) - vars.oldBias;
        pointsWeightTotal[vars.nextPeriod].bias = max(vars.oldTotalBias + vars.newBias, vars.oldBias) - vars.oldBias;

        // Update the new gauge slope & total slope
        if(oldSlope.end > vars.nextPeriod) {
            pointsWeight[gauge][vars.nextPeriod].slope = max(vars.oldWeightSlope + newSlope.slope, oldSlope.slope) - oldSlope.slope;
            pointsWeightTotal[vars.nextPeriod].slope = max(vars.oldTotalSlope + newSlope.slope, oldSlope.slope) - oldSlope.slope;
        } else {
            pointsWeight[gauge][vars.nextPeriod].slope += newSlope.slope;
            pointsWeightTotal[vars.nextPeriod].slope += newSlope.slope;
        }

        // Update the gauge slope changes & total slope changes
        if(oldSlope.end > block.timestamp) {
            changesWeight[gauge][oldSlope.end] -= oldSlope.slope;
            changesWeightTotal[oldSlope.end] -= oldSlope.slope;
        }
        changesWeight[gauge][newSlope.end] += newSlope.slope;
        changesWeightTotal[newSlope.end] += newSlope.slope;

        // Store the user vote state
        voteUserSlopes[user][gauge] = newSlope;
        lastUserVote[user][gauge] = block.timestamp;

        emit VoteForGauge(block.timestamp, user, gauge, userPower);
    }

    function _getGaugeRelativeWeight(address gauge, uint256 ts) internal view returns(uint256) {
        if(isGaugeKilled[gauge]) return 0;

        ts = ts / WEEK * WEEK;

        uint256 _totalWeight = pointsWeightTotal[ts].bias;
        if(_totalWeight == 0) return 0;

        return (pointsWeight[gauge][ts].bias * UNIT) / _totalWeight;
    }

    function _updateGaugeWeight(address gauge) internal returns(uint256) {
        uint256 ts = timeWeight[gauge];

        if(ts == 0) return 0;

        Point memory _point = pointsWeight[gauge][ts];
        for(uint256 i; i < 100; i++) {
            if(ts > block.timestamp) break;
            ts += WEEK;

            uint256 decreaseBias = _point.slope * WEEK;
            if(decreaseBias >= _point.bias) {
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
        }

        return _point.bias;
    }

    function _updateTotalWeight() internal returns(uint256) {
        uint256 ts = timeTotal;

        if(ts == 0) return 0;

        Point memory _point = pointsWeightTotal[ts];
        for(uint256 i; i < 100; i++) {
            if(ts > block.timestamp) break;
            ts += WEEK;

            uint256 decreaseBias = _point.slope * WEEK;
            if(decreaseBias >= _point.bias) {
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
        }

        return _point.bias;
    }


    // Admin functions

    function addNewBoard(address board, address distributor) external onlyOwner {
        if(board == address(0) || distributor == address(0)) revert Errors.AddressZero();
        if(boardToId[board] != 0 || distributorToId[distributor] != 0) revert Errors.AlreadyListed();
        
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
        if(gaugeToBoardId[gauge] == 0) revert Errors.InvalidParameter();
        if(isGaugeKilled[gauge]) revert Errors.KilledGauge();

        gaugeCaps[gauge] = newCap;

        emit GaugeCapUpdated(gauge, gaugeToBoardId[gauge], newCap);
    }

    function killGauge(address gauge) external onlyOwner {
        if(gauge == address(0)) revert Errors.AddressZero();
        if(!_isGaugeListed(gauge)) revert Errors.NotListed();
        if(isGaugeKilled[gauge]) revert Errors.KilledGauge();

        isGaugeKilled[gauge] = true;

        emit GaugeKilled(gauge, gaugeToBoardId[gauge]);
    }

    function unkillGauge(address gauge) external onlyOwner {
        if(gauge == address(0)) revert Errors.AddressZero();
        if(!isGaugeKilled[gauge]) revert Errors.NotKilledGauge();

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