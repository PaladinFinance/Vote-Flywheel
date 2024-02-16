//██████╗  █████╗ ██╗      █████╗ ██████╗ ██╗███╗   ██╗
//██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██║████╗  ██║
//██████╔╝███████║██║     ███████║██║  ██║██║██╔██╗ ██║
//██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██║██║╚██╗██║
//██║     ██║  ██║███████╗██║  ██║██████╔╝██║██║ ╚████║
//╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝
 

//SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILootVoteController} from "./interfaces/ILootVoteController.sol";
import {IHolyPalPower} from "./interfaces/IHolyPalPower.sol";
import "./libraries/Errors.sol";
import "./utils/Owner.sol";

/** @title Loot Vote Controller contract */
/// @author Paladin
/*
    Contract handling the vote logic for repartition of the global Loot budget
    between all the listed gauges for the Quest system
*/
contract LootVoteController is Owner, ILootVoteController {
    using SafeERC20 for IERC20;

    // Constants

    /** @notice Seconds in a Week */
    uint256 private constant WEEK = 604800;

    /** @notice Unit scale for wei calculations */
    uint256 private constant UNIT = 1e18;

    /** @notice Max BPS value */
    uint256 private constant MAX_BPS = 10000;

    /** @notice Cooldown between 2 votes */
    uint256 private constant VOTE_COOLDOWN = 864000; // 10 days

    /** @notice Max number of votes an user can vote at once */
    uint256 private constant MAX_VOTE_LENGTH = 10;


    // Structs

    /** @notice Quest Board & distributor struct */
    struct QuestBoard {
        address board;
        address distributor;
    }

    /** @notice Point struct */
    struct Point {
        uint256 bias;
        uint256 slope;
    }

    /** @notice Voted Slope struct */
    struct VotedSlope {
        uint256 slope;
        uint256 power;
        uint256 end;
        address caller;
    }

    /** @notice Struct used for the vote method */
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

    /** @notice Proxy Voter struct */
    struct ProxyVoter {
        uint256 maxPower;
        uint256 usedPower;
        uint256 endTimestamp;
    }


    // Storage

    /** @notice Address of the hPalPower contract */
    address public hPalPower;

    /** @notice Next ID to list Boards */
    uint256 public nextBoardId; // ID 0 == no ID/not set

    /** @notice Listed Quest Boards */
    mapping(uint256 => QuestBoard) public questBoards;
    /** @notice Match Board address to ID */
    mapping(address => uint256) public boardToId;
    /** @notice Match Distributor address to ID */
    mapping(address => uint256) public distributorToId;

    /** @notice Match a Gauge to a Board ID */
    mapping(address => uint256) public gaugeToBoardId;
    
    /** @notice Default weight cap for gauges */
    uint256 public defaultCap = 0.1 * 1e18; // 10%
    /** @notice Custom caps for gauges */
    mapping(address => uint256) public gaugeCaps;
    /** @notice Flag for killed gauges */
    mapping(address => bool) public isGaugeKilled;

    /** @notice User VotedSlopes for each gauge */
    // user -> gauge -> VotedSlope
    mapping(address => mapping(address => VotedSlope)) public voteUserSlopes;
    /** @notice Total vote power used by user */
    mapping(address => uint256) public voteUserPower;
    /** @notice Last user vote's timestamp for each gauge address */
    mapping(address => mapping(address => uint256)) public lastUserVote;

    /** @notice Point weight for each gauge */
    // gauge -> time -> Point
    mapping(address => mapping(uint256 => Point)) public pointsWeight;
    /** @notice Slope changes for each gauge */
    // gauge -> time -> slope
    mapping(address => mapping(uint256 => uint256)) public changesWeight;
    /** @notice Last scheduled time for gauge weight update */
    // gauge -> last scheduled time (next week)
    mapping(address => uint256) public timeWeight;

    /** @notice Total Point weights */
    // time -> Point
    mapping(uint256 => Point) public pointsWeightTotal;
    /** @notice Total weight slope changes */
    // time -> slope
    mapping(uint256 => uint256) public changesWeightTotal;
    /** @notice Last scheduled time for weight update */
    uint256 public timeTotal;

    /** @notice Proxy Managers set for each user */
    // user -> proxy voter -> bool
    mapping(address => mapping(address => bool)) public isProxyManager;

    /** @notice State of Proxy Managers for each user */
    // user -> proxy voter -> state
    mapping(address => mapping(address => ProxyVoter)) public proxyVoterState;

    /** @notice List of current proxy for each user */
    mapping(address => address[]) public currentUserProxyVoters;

    /** @notice Blocked (for Proxies) voting power for each user */
    mapping(address => uint256) public blockedProxyPower;
    /** @notice Used free voting power for each user */
    mapping(address => uint256) public usedFreePower;



    // Events

    /** @notice Event emitted when a vote is casted for a gauge */
    event VoteForGauge(
        uint256 time,
        address user,
        address gauge_addr,
        uint256 weight
    );

    /** @notice Event emitted when a new Board is listed */
    event NewBoardListed(uint256 id, address indexed board, address indexed distributor);
    /** @notice Event emitted when a Board is udpated */
    event BoardUpdated(uint256 id, address indexed newDistributor);

    /** @notice Event emitted when a new Gauge is listed */
    event NewGaugeAdded(address indexed gauge, uint256 indexed boardId, uint256 cap);
    /** @notice Event emitted when a Gauge is updated */
    event GaugeCapUpdated(address indexed gauge, uint256 indexed boardId, uint256 newCap);
    /** @notice Event emitted when a Gauge is killed */
    event GaugeKilled(address indexed gauge, uint256 indexed boardId);
    /** @notice Event emitted when a Gauge is unkilled */
    event GaugeUnkilled(address indexed gauge, uint256 indexed boardId);

    /** @notice Event emitted when a Proxy Manager is set */
    event SetProxyManager(address indexed user, address indexed manager);
    /** @notice Event emitted when a Proxy Manager is removed */
    event RemoveProxyManager(address indexed user, address indexed manager);
    /** @notice Event emitted when a Proxy Voter is set */
    event SetNewProxyVoter(address indexed user, address indexed proxyVoter, uint256 maxPower, uint256 endTimestamp);


    // Constructor

    constructor(address _hPalPower) {
        if(_hPalPower == address(0)) revert Errors.AddressZero();

        hPalPower = _hPalPower;

        nextBoardId++;

        timeTotal = (block.timestamp) / WEEK * WEEK;
    }


    // View functions

    /**
    * @notice Is the gauge listed
    * @param gauge Address of the gauge
    * @return bool : Is the gauge listed
    */
    function isListedGauge(address gauge) external view returns(bool) {
        return _isGaugeListed(gauge);
    }

    /**
    * @notice Returns the Quest Board assocatied to a gauge
    * @param gauge Address of the gauge
    * @return address : Address of the Quest Board
    */
    function getBoardForGauge(address gauge) external view returns(address) {
        return questBoards[gaugeToBoardId[gauge]].board;
    }

    /**
    * @notice Returns the Distributor assocatied to a gauge
    * @param gauge Address of the gauge
    * @return address : Address of the Distributor
    */
    function getDistributorForGauge(address gauge) external view returns(address) {
        return questBoards[gaugeToBoardId[gauge]].distributor;
    }

    /**
    * @notice Returns the current gauge weight
    * @param gauge Address of the gauge
    * @return uint256 : Current gauge weight
    */
    function getGaugeWeight(address gauge) external view returns(uint256) {
        return pointsWeight[gauge][timeWeight[gauge]].bias;
    }

    /**
    * @notice Returns the gauge weight at a specific timestamp
    * @param gauge Address of the gauge
    * @param ts Timestamp
    * @return uint256 : Gauge weight at the timestamp
    */
    function getGaugeWeightAt(address gauge, uint256 ts) external view returns(uint256) {
        ts = ts / WEEK * WEEK;
        return pointsWeight[gauge][ts].bias;
    }

    /**
    * @notice Returns the current total weight
    * @return uint256 : Total weight
    */
    function getTotalWeight() external view returns(uint256) {
        return pointsWeightTotal[timeTotal].bias;
    }

    /**
    * @notice Returns a gauge relative weight
    * @param gauge Address of the gauge
    * @return uint256 : Gauge relative weight
    */
    function getGaugeRelativeWeight(address gauge) external view returns(uint256) {
        return _getGaugeRelativeWeight(gauge, block.timestamp);
    }

    /**
    * @notice Returns a gauge relative weight at a specific timestamp
    * @param gauge Address of the gauge
    * @param ts Timestamp
    * @return uint256 : Gauge relative weight at the timestamp
    */
    function getGaugeRelativeWeight(address gauge, uint256 ts) external view returns(uint256) {
        return _getGaugeRelativeWeight(gauge, ts);
    }

    /**
    * @notice Returns the cap relative weight for a gauge
    * @param gauge Address of the gauge
    * @return uint256 : Gauge cap
    */
    function getGaugeCap(address gauge) external view returns(uint256) {
        return gaugeCaps[gauge] != 0 ? gaugeCaps[gauge] : defaultCap;
    }

    /**
    * @notice Returns the list of current proxies for a user
    * @param user Address of the user
    * @return address[] : List of proxy addresses
    */
    function getUserProxyVoters(address user) external view returns(address[] memory) {
        return currentUserProxyVoters[user];
    }


    // State-changing functions

    /**
    * @notice Votes for a gauge weight
    * @dev Votes for a gauge weight based on the given user power
    * @param gauge Address of the gauge
    * @param userPower Power used for this gauge
    */
    function voteForGaugeWeights(address gauge, uint256 userPower) external {
        // Clear any expired past Proxy
        _clearExpiredProxies(msg.sender);

        _voteForGauge(msg.sender, gauge, userPower, msg.sender);
    }

    /**
    * @notice Votes for multiple gauge weights
    * @dev Votes for multiple gauge weights based on the given user powers
    * @param gauge Address of the gauges
    * @param userPower Power used for each gauge
    */
    function voteForManyGaugeWeights(address[] memory gauge, uint256[] memory userPower) external {
        // Clear any expired past Proxy
        _clearExpiredProxies(msg.sender);

        uint256 length = gauge.length;
        if(length > MAX_VOTE_LENGTH) revert Errors.MaxVoteListExceeded();
        if(length != userPower.length) revert Errors.ArraySizeMismatch();
        for(uint256 i; i < length; i++) {
            _voteForGauge(msg.sender, gauge[i], userPower[i], msg.sender);
        }
    }

    /**
    * @notice Votes for a gauge weight as another user
    * @dev Votes for a gauge weight based on the given user power as another user (need to have a proxy set)
    * @param user Address of the user
    * @param gauge Address of the gauge
    * @param userPower Power used for this gauge
    */
    function voteForGaugeWeightsFor(address user, address gauge, uint256 userPower) external {
        // Clear any expired past Proxy
        _clearExpiredProxies(user);

        ProxyVoter memory proxyState = proxyVoterState[user][msg.sender];
        if(proxyState.maxPower == 0) revert Errors.NotAllowedProxyVoter();
        if(proxyState.endTimestamp < block.timestamp) revert Errors.ExpiredProxy();
        if(userPower > proxyState.maxPower) revert Errors.VotingPowerProxyExceeded();

        _voteForGauge(user, gauge, userPower, msg.sender);
    }

    /**
    * @notice Votes for multiple gauge weights as another user
    * @dev Votes for multiple gauge weights based on the given user powers as another user (need to have a proxy set)
    * @param user Address of the user
    * @param gauge Address of the gauges
    * @param userPower Power used for each gauge
    */
    function voteForManyGaugeWeightsFor(address user, address[] memory gauge, uint256[] memory userPower) external {
        // Clear any expired past Proxy
        _clearExpiredProxies(user);

        ProxyVoter memory proxyState = proxyVoterState[user][msg.sender];
        if(proxyState.maxPower == 0) revert Errors.NotAllowedProxyVoter();
        if(proxyState.endTimestamp < block.timestamp) revert Errors.ExpiredProxy();
        uint256 totalPower;

        uint256 length = gauge.length;
        if(length > MAX_VOTE_LENGTH) revert Errors.MaxVoteListExceeded();
        if(length != userPower.length) revert Errors.ArraySizeMismatch();
        for(uint256 i; i < length; i++) {
            totalPower += userPower[i];
            _voteForGauge(user, gauge[i], userPower[i], msg.sender);
        }
        if(totalPower > proxyState.maxPower) revert Errors.VotingPowerProxyExceeded();
    }

    /**
    * @notice Returns the updated gauge relative weight
    * @dev Updates the gauge weight & returns the new relative weight
    * @param gauge Address of the gauge
    * @return uint256 : Updated gauge relative weight
    */
    function getGaugeRelativeWeightWrite(address gauge) external returns(uint256) {
        _updateGaugeWeight(gauge);
        _updateTotalWeight();
        return _getGaugeRelativeWeight(gauge, block.timestamp);
    }

    /**
    * @notice Returns the updated gauge relative weight at a given timestamp
    * @dev Updates the gauge weight & returns the relative weight at a given timestamp
    * @param gauge Address of the gauge
    * @param ts Timestamp
    * @return uint256 : Updated gauge relative weight at the timestamp
    */
    function getGaugeRelativeWeightWrite(address gauge, uint256 ts) external returns(uint256) {
        _updateGaugeWeight(gauge);
        _updateTotalWeight();
        return _getGaugeRelativeWeight(gauge, ts);
    }

    /**
    * @notice Updates the gauge weight
    * @dev Updates a gauge current weight for all past non-updated periods
    * @param gauge Address of the gauge
    */
    function updateGaugeWeight(address gauge) external {
        _updateGaugeWeight(gauge);
    }

    /**
    * @notice Updates the total weight
    * @dev Updates the total wieght for all past non-updated periods
    */
    function updateTotalWeight() external {
        _updateTotalWeight();
    }

    /**
    * @notice Approves a Proxy Manager for the caller
    * @dev Approves a Proxy Manager for the caller allowed to create Proxy on his voting power
    * @param manager Address of the Proxy Manager
    */
    function approveProxyManager(address manager) external {
        if(manager == address(0)) revert Errors.AddressZero();

        isProxyManager[msg.sender][manager] = true;

        emit SetProxyManager(msg.sender, manager);
    }

    /**
    * @notice Approves a Proxy Manager for the caller
    * @dev Approves a Proxy Manager for the caller allowed to create Proxy on his voting power
    * @param manager Address of the Proxy Manager
    */
    function removeProxyManager(address manager) external {
        if(manager == address(0)) revert Errors.AddressZero();

        isProxyManager[msg.sender][manager] = false;

        emit RemoveProxyManager(msg.sender, manager);
    }

    /**
    * @notice Sets a Proxy Voter for the user
    * @dev Sets a Proxy Voter for the user allowed to vote on his behalf
    * @param user Address of the user
    * @param proxy Address of the Proxy Voter
    * @param maxPower Max voting power allowed for the Proxy
    * @param endTimestamp Timestamp of the Proxy expiry
    */
    function setVoterProxy(address user, address proxy, uint256 maxPower, uint256 endTimestamp) external {
        if(!isProxyManager[user][msg.sender] && msg.sender != user) revert Errors.NotAllowedManager();
        if(maxPower == 0 || maxPower > MAX_BPS) revert Errors.VotingPowerInvalid();

        // Round down the end timestamp to weeks & check the user Lock is not expired then
        endTimestamp = endTimestamp / WEEK * WEEK;
        uint256 userLockEnd = IHolyPalPower(hPalPower).locked__end(user);
        if(endTimestamp < block.timestamp || endTimestamp > userLockEnd) revert Errors.InvalidTimestamp();

        // Clear any expired past Proxy
        _clearExpiredProxies(user);

        // Revert if the user already has a Proxy with the same address
        ProxyVoter memory prevProxyState = proxyVoterState[user][proxy];
        if(prevProxyState.maxPower != 0) revert Errors.ProxyAlreadyActive();

        // Block the user's power for the Proxy & revert if the user execeed's its voting power
        uint256 userBlockedPower = blockedProxyPower[user];
        if(userBlockedPower + maxPower > MAX_BPS) revert Errors.ProxyPowerExceeded();
        blockedProxyPower[user] = userBlockedPower + maxPower;

        // Set up the Proxy
        proxyVoterState[user][proxy] = ProxyVoter({
            maxPower: maxPower,
            usedPower: 0,
            endTimestamp: endTimestamp
        });

        // Add the Proxy to the user's list
        currentUserProxyVoters[user].push(proxy);

        emit SetNewProxyVoter(user, proxy, maxPower, endTimestamp);
    }

    /**
    * @notice Clears expired Proxies for a user
    * @dev Clears all expired Proxies for a user & frees the blocked voting power
    * @param user Address of the user
    */
    function clearUserExpiredProxies(address user) external {
        _clearExpiredProxies(user);
    }


    // Internal functions

    /**
    * @dev Checks if a gauge is listed
    * @param gauge Address of the gauge
    * @return bool : Is the gauge listed
    */
    function _isGaugeListed(address gauge) internal view returns(bool) {
        return gaugeToBoardId[gauge] != 0;
    }

    /**
    * @dev Clears expired Proxies for a user & frees the blocked voting power
    * @param user Address of the user
    */
    function _clearExpiredProxies(address user) internal {
        uint256 length = currentUserProxyVoters[user].length;
        if(length == 0) return;
        for(uint256 i; i < length;) {
            address proxyVoter = currentUserProxyVoters[user][i];
            if(proxyVoterState[user][proxyVoter].endTimestamp < block.timestamp) {
                // Free the user blocked voting power
                blockedProxyPower[user] -= proxyVoterState[user][proxyVoter].maxPower;
                // Delete the Proxy
                delete proxyVoterState[user][proxyVoter];
                
                // Remove the Proxy from the user's list
                uint256 lastIndex = length - 1;
                if(i != lastIndex) {
                    currentUserProxyVoters[user][i] = currentUserProxyVoters[user][length-1];
                }
                currentUserProxyVoters[user].pop();
                length--;
            } else {
                unchecked{ i++; }
            }
        }
    }

    /**
    * @dev Vote for a gauge weight based on the given user power
    * @param user Address of the user
    * @param gauge Address of the gauge
    * @param userPower Power used for this gauge
    * @param caller Address of the caller
    */
    function _voteForGauge(address user, address gauge, uint256 userPower, address caller) internal {
        VoteVars memory vars;
        
        // Get the periods timestamps & user lock state
        vars.currentPeriod = (block.timestamp) / WEEK * WEEK;
        vars.nextPeriod = vars.currentPeriod + WEEK;
        vars.userSlope = IHolyPalPower(hPalPower).getUserPointAt(user, vars.currentPeriod).slope;
        vars.userLockEnd = IHolyPalPower(hPalPower).locked__end(user);

        // Check the gauge is listed & the user lock is not expired
        if(!_isGaugeListed(gauge)) revert Errors.NotListed();
        if(vars.userLockEnd <= vars.nextPeriod) revert Errors.LockExpired();
        // Check the user has enough voting power & the cooldown is respected
        if(userPower > MAX_BPS) revert Errors.VotingPowerInvalid();
        if(block.timestamp < lastUserVote[user][gauge] + VOTE_COOLDOWN) revert Errors.VotingCooldown();

        // Load the user past vote state
        VotedSlope memory oldSlope = voteUserSlopes[user][gauge];
        if(oldSlope.end > vars.nextPeriod) {
            vars.oldBias = oldSlope.slope * (oldSlope.end - vars.nextPeriod);
        }

        // No vote to cast & no previous vote to remove == useless action
        if(userPower == 0 && oldSlope.power == 0) return;

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
            oldSlope.caller != caller && proxyVoterState[user][oldSlope.caller].endTimestamp > block.timestamp
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
            uint256 proxyPower = proxyVoterState[user][caller].usedPower;
            vars.oldUsedPower = oldSlope.caller == caller ? oldSlope.power : 0;
            proxyPower = proxyPower + newSlope.power - vars.oldUsedPower;
            if(oldSlope.caller == user) {
                usedFreePower[user] -= oldSlope.power;
            }
            if(proxyPower > proxyVoterState[user][caller].maxPower) revert Errors.VotingPowerProxyExceeded();

            proxyVoterState[user][caller].usedPower = proxyPower;
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

    /**
    * @dev Returns a gauge relative weight based on its weight and the total weight at a given period
    * @param gauge Address of the gauge
    * @param ts Timestamp
    * @return uint256 : Gauge relative weight
    */
    function _getGaugeRelativeWeight(address gauge, uint256 ts) internal view returns(uint256) {
        if(isGaugeKilled[gauge]) return 0;

        ts = ts / WEEK * WEEK;

        uint256 _totalWeight = pointsWeightTotal[ts].bias;
        if(_totalWeight == 0) return 0;

        return (pointsWeight[gauge][ts].bias * UNIT) / _totalWeight;
    }

    /**
    * @dev Updates the gauge weight for all past non-updated periods & returns the current gauge weight
    * @param gauge Address of the gauge
    * @return uint256 : Current gauge weight
    */
    function _updateGaugeWeight(address gauge) internal returns(uint256) {
        uint256 ts = timeWeight[gauge];

        if(ts == 0) return 0;

        Point memory _point = pointsWeight[gauge][ts];
        for(uint256 i; i < 150; i++) {
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

    /**
    * @dev Updates the total weight for all past non-updated periods & returns the current total weight
    * @return uint256 : Current total weight
    */
    function _updateTotalWeight() internal returns(uint256) {
        uint256 ts = timeTotal;

        if(ts == 0) return 0;

        Point memory _point = pointsWeightTotal[ts];
        for(uint256 i; i < 150; i++) {
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

    /**
    * @notice Adds a new Quest Board & its Distributor
    * @dev Adds a new Quest Board & its Distributor
    * @param board Address of the Quest Board
    * @param distributor Address of the Distributor
    */
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

    /**
    * @notice Updates the Distributor for a Quest Board
    * @dev Updates the Distributor for a Quest Board
    * @param board Address of the Quest Board
    * @param newDistributor Address of the new Distributor
    */
    function updateDistributor(address board, address newDistributor) external onlyOwner {
        if(board == address(0) || newDistributor == address(0)) revert Errors.AddressZero();
        
        uint256 boardId = boardToId[board];
        if(boardId == 0) revert Errors.InvalidParameter();

        questBoards[boardId].distributor = newDistributor;
        distributorToId[newDistributor] = boardId;

        emit BoardUpdated(boardId, newDistributor);
    }

    /**
    * @notice Adds a new Gauge (with a cap)
    * @dev Adds a new Gauge linked to a listed Quest Board & sets a weight cap
    * @param gauge Address of the gauge
    * @param boardId ID of the Quest Board
    * @param cap Weight cap for the gauge
    */
    function addNewGauge(address gauge, uint256 boardId, uint256 cap) external onlyOwner {
        if(gauge == address(0)) revert Errors.AddressZero();
        if(boardId == 0) revert Errors.InvalidParameter();
        if(_isGaugeListed(gauge)) revert Errors.AlreadyListed();

        gaugeToBoardId[gauge] = boardId;
        gaugeCaps[gauge] = cap;

        timeWeight[gauge] = (block.timestamp + WEEK) / WEEK * WEEK;

        emit NewGaugeAdded(gauge, boardId, cap);
    }

    /**
    * @notice Updates the weight cap for a gauge
    * @dev Updates the weight cap for a gauge
    * @param gauge Address of the gauge
    * @param newCap New weight cap for the gauge
    */
    function updateGaugeCap(address gauge, uint256 newCap) external onlyOwner {
        if(gauge == address(0)) revert Errors.AddressZero();
        if(gaugeToBoardId[gauge] == 0) revert Errors.InvalidParameter();
        if(isGaugeKilled[gauge]) revert Errors.KilledGauge();

        gaugeCaps[gauge] = newCap;

        emit GaugeCapUpdated(gauge, gaugeToBoardId[gauge], newCap);
    }

    /**
    * @notice Kills a gauge
    * @dev Kills a gauge, blocking the votes & weight updates
    * @param gauge Address of the gauge
    */
    function killGauge(address gauge) external onlyOwner {
        if(gauge == address(0)) revert Errors.AddressZero();
        if(!_isGaugeListed(gauge)) revert Errors.NotListed();
        if(isGaugeKilled[gauge]) revert Errors.KilledGauge();

        isGaugeKilled[gauge] = true;

        emit GaugeKilled(gauge, gaugeToBoardId[gauge]);
    }

    /**
    * @notice Unkills a gauge
    * @dev Unkills a gauge, unblocking the votes & weight updates
    * @param gauge Address of the gauge
    */
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