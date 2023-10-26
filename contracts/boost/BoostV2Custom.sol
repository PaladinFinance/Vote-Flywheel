//██████╗  █████╗ ██╗      █████╗ ██████╗ ██╗███╗   ██╗
//██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██║████╗  ██║
//██████╔╝███████║██║     ███████║██║  ██║██║██╔██╗ ██║
//██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██║██║╚██╗██║
//██║     ██║  ██║███████╗██║  ██║██████╔╝██║██║ ╚████║
//╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝
 

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/** @title Boost V2.1 contract */
/// @author Curve, modified by Paladin
/*
    TODO
    Note : not following the mixedCase convention to match Vyper version of BoostV2
*/

interface HolyPalPower {
    function balanceOf(address user) external view returns(uint256);
    function balanceOfAt(address user, uint256 timestamp) external view returns(uint256);
    function totalSupply() external view returns(uint256);
    // solhint-disable-next-line
    function locked__end(address user) external view returns(uint256);
    function totalLocked() external view returns(uint256);
    function totalLockedAt(uint256 blockNumber) external view returns(uint256);
}


contract BoostV2Custom {

    // Constants

    string constant private NAME = "HolyPal Power Boost 2";
    string constant private SYMBOL = "hPalBoost2";
    string constant private VERSION = "v2.1.0";

    bytes32 constant private EIP712_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 constant private PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    uint256 constant private WEEK = 86400 * 7;


    // Struct 

    struct Point {
        uint256 bias;
        uint256 slope;
        uint256 ts;
    }

    struct SlopeChange {
        uint256 slopeChange;
        uint256 endTimestamp;
    }


    // Storage

    bytes32 immutable public DOMAIN_SEPARATOR;
    address immutable public HOLY_PAL_POWER;

    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;

    mapping(address => Point[]) public delegated;
    mapping(address => mapping(uint256 => uint256)) public delegatedSlopeChanges;
    mapping(address => mapping(uint256 => uint256)) public delegatedCheckpointsDates;
    mapping(address => uint256) public delegatedCheckpointsNonces;

    mapping(address => Point[]) public received;
    mapping(address => mapping(uint256 => uint256)) public receivedSlopeChanges;
    mapping(address => mapping(uint256 => uint256)) public receivedCheckpointsDates;
    mapping(address => uint256) public receivedCheckpointsNonces;

    mapping(address => SlopeChange[]) public receiverSlopeChanges;


    // Events

    event Approval(
        address indexed _owner,
        address indexed _spender,
        uint256 _value
    );

    event Transfer(
        address indexed _from,
        address indexed _to,
        uint256 _value
    );

    event Boost(
        address indexed _from,
        address indexed _to,
        uint256 _bias,
        uint256 _slope,
        uint256 _start
    );


    // Errors

    error InvalidAddress();
    error NullAmount();
    error TimestampInPast();
    error InvalidTimestamp();
    error EndAfterLockEnd();
    error InsufficientBalance();
    error DeadlineReached();
    error InvalidSigner();

    // Constructor

    constructor(address _ve) {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            EIP712_TYPEHASH,
            keccak256(bytes(NAME)),
            keccak256(bytes(VERSION)),
            block.chainid,
            address(this)
        ));
        HOLY_PAL_POWER = _ve;

        emit Transfer(address(0), msg.sender, 0);
    }


    // View functions

    function name() external pure returns(string memory) {
        return NAME;
    }

    function symbol() external pure returns(string memory) {
        return SYMBOL;
    }

    function decimals() external pure returns(uint256) {
        return 18;
    }

    function totalSupply() external view returns(uint256) {
        return HolyPalPower(HOLY_PAL_POWER).totalLocked();
    }

    // solhint-disable-next-line
    function total_locked() external view returns(uint256) {
        return HolyPalPower(HOLY_PAL_POWER).totalLocked();
    }
    
    // solhint-disable-next-line
    function total_locked_at(uint256 blockNumber) external view returns(uint256) {
        return HolyPalPower(HOLY_PAL_POWER).totalLockedAt(blockNumber);
    }

    function balanceOf(address _user) external view returns(uint256) {
        return _balanceOf(_user);
    }

    // solhint-disable-next-line
    function adjusted_balance_of(address _user) external view returns(uint256) {
        return _balanceOf(_user);
    }

    function balanceOfAt(address _user, uint256 _ts) external view returns(uint256) {
        return _balanceOfAt(_user, _ts);
    }

    // solhint-disable-next-line
    function adjusted_balance_of_at(address _user, uint256 _ts) external view returns(uint256) {
        return _balanceOfAt(_user, _ts);
    }

    // solhint-disable-next-line
    function voting_adjusted_balance_of_at(address _user, uint256 _snapshot_ts, uint256 _target_ts) external view returns(uint256) {
        uint256 amount = HolyPalPower(HOLY_PAL_POWER).balanceOfAt(_user, _snapshot_ts);

        Point memory delegatedPoint = _checkpointRead(_user, true, _snapshot_ts);
        Point memory receivedPoint = _checkpointRead(_user, false, _snapshot_ts);
        
        uint256 ts= (_snapshot_ts / WEEK) * WEEK;
        for(uint256 i; i < 255;) {
            ts += WEEK;

            uint256 delegated_dslope;
            uint256 received_dslope;
            if(_target_ts < ts) {
                ts = _target_ts;
            } else {
                delegated_dslope = delegatedSlopeChanges[_user][ts];
                received_dslope = receivedSlopeChanges[_user][ts];
            }

            delegatedPoint.bias -= delegatedPoint.slope * (ts - delegatedPoint.ts);
            delegatedPoint.slope -= delegated_dslope;
            delegatedPoint.ts = ts;

            receivedPoint.bias -= receivedPoint.slope * (ts - receivedPoint.ts);
            receivedPoint.slope -= received_dslope;
            receivedPoint.ts = ts;

            if(ts == _target_ts) break;

            unchecked { ++i; }
        }
        
        amount -= (delegatedPoint.bias - delegatedPoint.slope * (_target_ts - delegatedPoint.ts));
        amount += (receivedPoint.bias - receivedPoint.slope * (_target_ts - receivedPoint.ts));
        return amount;
    }

    // solhint-disable-next-line
    function delegated_balance(address _user) external view returns(uint256) {
        Point memory point = _checkpointRead(_user, true, 0);
        return point.bias - point.slope * (block.timestamp - point.ts);
    }

    // solhint-disable-next-line
    function received_balance(address _user) external view returns(uint256) {
        Point memory point = _checkpointRead(_user, false, 0);
        return point.bias - point.slope * (block.timestamp - point.ts);
    }

    // solhint-disable-next-line
    function delegable_balance(address _user) external view returns(uint256) {
        Point memory point = _checkpointRead(_user, true, 0);
        return HolyPalPower(HOLY_PAL_POWER).balanceOf(_user) - (point.bias - point.slope * (block.timestamp - point.ts));
    }

    // solhint-disable-next-line
    function delegated_point(address _user) external view returns(Point memory) {
        uint256 user_nonce = delegatedCheckpointsNonces[_user];
        if(user_nonce == 0) return Point(0, 0, 0);
        return delegated[_user][user_nonce - 1];
    }

    // solhint-disable-next-line
    function received_point(address _user) external view returns(Point memory) {
        uint256 user_nonce = receivedCheckpointsNonces[_user];
        if(user_nonce == 0) return Point(0, 0, 0);
        return received[_user][user_nonce - 1];
    }

    function getUserSlopeChanges(address _user) external view returns(SlopeChange[] memory) {
        return receiverSlopeChanges[_user];
    }


    // State-changing functions

    function boost(address _to, uint256 _amount, uint256 _endtime) external {
        _boost(msg.sender, _to, _amount, _endtime);
    }

    function boost(address _to, uint256 _amount, uint256 _endtime, address _from) external {
        // reduce approval if necessary
        if(_from != msg.sender) {
            uint256 _allowance = allowance[_from][msg.sender];
            if(_allowance != type(uint256).max) {
                allowance[_from][msg.sender] = _allowance - _amount;
                emit Approval(_from, msg.sender, _allowance - _amount);
            }
        }

        _boost(_from, _to, _amount, _endtime);
    }

    // solhint-disable-next-line
    function checkpoint_user(address _user) external {
        uint256 delegatedNonce = delegatedCheckpointsNonces[_user];
        uint256 receivedNonce = receivedCheckpointsNonces[_user];
        delegated[_user].push(_checkpointWrite(_user, true));
        received[_user].push(_checkpointWrite(_user, false));
        delegatedCheckpointsDates[_user][delegatedNonce] = block.timestamp;
        receivedCheckpointsDates[_user][receivedNonce] = block.timestamp;
        delegatedCheckpointsNonces[_user] = receivedNonce + 1;
        receivedCheckpointsNonces[_user] = receivedNonce + 1;

        _updateReceivedSlopeChanges(_user);
    }

    function approve(address _spender, uint256 _value) external returns(bool) {
        allowance[msg.sender][_spender] = _value;

        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function permit(
        address _owner,
        address _spender,
        uint256 _value,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external returns(bool) {
        if(_owner == address(0)) revert InvalidAddress();
        if(block.timestamp > _deadline) revert DeadlineReached();

        uint256 nonce = nonces[_owner];
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, _owner, _spender, _value, nonce, _deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = ecrecover(digest, _v, _r, _s);

        if(signer == address(0) || signer != _owner) revert InvalidSigner();

        allowance[_owner][_spender] = _value;
        nonces[_owner] = nonce + 1;

        emit Approval(_owner, _spender, _value);
        return true;
    }

    function increaseAllowance(address _spender, uint256 _added_value) external returns(bool) {
        uint256 _allowance = allowance[msg.sender][_spender] + _added_value;
        allowance[msg.sender][_spender] = _allowance;

        emit Approval(msg.sender, _spender, _allowance);
        return true;
    }

    function decreaseAllowance(address _spender, uint256 _subtracted_value) external returns(bool) {
        uint256 _allowance = allowance[msg.sender][_spender] - _subtracted_value;
        allowance[msg.sender][_spender] = _allowance;

        emit Approval(msg.sender, _spender, _allowance);
        return true;
    }


    // Internal functions

    function _findDelegatedPoint(address _user, uint256 _ts) internal view returns(Point memory) {
        if(_ts == 0) _ts = block.timestamp;
        Point memory empty_point = Point(0, 0, 0);

        uint256 user_nonce = delegatedCheckpointsNonces[_user];

        if(user_nonce == 0) return empty_point;

        if(delegatedCheckpointsDates[_user][0] > _ts) return empty_point;

        if(delegatedCheckpointsDates[_user][user_nonce - 1] <= _ts) return delegated[_user][user_nonce - 1];

        uint256 high = user_nonce - 1;
        uint256 low = 0;
        uint256 mid = 0;

        while(high > low) {
            mid = _average(low, high);

            if(delegatedCheckpointsDates[_user][mid] == _ts) return delegated[_user][mid];

            if(delegatedCheckpointsDates[_user][mid] > _ts) {
                high = mid;
            } else {
                low = mid + 1;
            }    
        }

        if(high == 0) return empty_point;

        return delegated[_user][high - 1];
    }

    function _findReceivedPoint(address _user, uint256 _ts) internal view returns(Point memory) {
        if(_ts == 0) _ts = block.timestamp;
        Point memory empty_point = Point(0, 0, 0);

        uint256 user_nonce = receivedCheckpointsNonces[_user];

        if(user_nonce == 0) return empty_point;

        if(receivedCheckpointsDates[_user][0] > _ts) return empty_point;

        if(receivedCheckpointsDates[_user][user_nonce - 1] <= _ts) return received[_user][user_nonce - 1];

        uint256 high = user_nonce - 1;
        uint256 low = 0;
        uint256 mid = 0;

        while(high > low) {
            mid = _average(low, high);

            if(receivedCheckpointsDates[_user][mid] == _ts) return received[_user][mid];

            if(receivedCheckpointsDates[_user][mid] > _ts) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        if(high == 0) return empty_point;

        return received[_user][high - 1];
    }

    function _checkpointRead(address _user, bool _delegated, uint256 _target_ts) internal view returns(Point memory) {
        if(_target_ts == 0) _target_ts = block.timestamp;
        Point memory point = Point(0, 0, 0);

        if(_delegated) {
            point = _findDelegatedPoint(_user, _target_ts);
        } else {
            point = _findReceivedPoint(_user, _target_ts);
        }

        if(point.ts == 0) point.ts = _target_ts;

        if(point.ts == _target_ts) return point;

        uint256 ts = (point.ts / WEEK) * WEEK;
        for(uint256 i; i < 255;) {
            ts += WEEK;

            uint256 dslope;
            if(_target_ts < ts) {
                ts = _target_ts;
            } else {
                if(_delegated) {
                    dslope = delegatedSlopeChanges[_user][ts];
                } else {
                    dslope = receivedSlopeChanges[_user][ts];
                }
            }

            point.bias -= point.slope * (ts - point.ts);
            point.slope -= dslope;
            point.ts = ts;

            if(ts == _target_ts) break;

            unchecked { ++i; }
        }

        return point;
    }

    function _checkpointWrite(address _user, bool _delegated) internal returns(Point memory) {
        Point memory point = Point(0, 0, 0);

        if(_delegated) {
            point = _findDelegatedPoint(_user, block.timestamp);
        } else {
            point = _findReceivedPoint(_user, block.timestamp);
        }

        if(point.ts == 0) point.ts = block.timestamp;

        if(point.ts == block.timestamp) return point;

        uint256 dbias;
        uint256 ts = (point.ts / WEEK) * WEEK;
        for(uint256 i; i < 255;) {
            ts += WEEK;

            uint256 dslope;
            if(block.timestamp < ts) {
                ts = block.timestamp;
            } else {
                if(_delegated) {
                    dslope = delegatedSlopeChanges[_user][ts];
                } else {
                    dslope = receivedSlopeChanges[_user][ts];
                }
            }

            uint256 amount = point.slope * (ts - point.ts);

            dbias += amount;
            point.bias -= amount;
            point.slope -= dslope;
            point.ts = ts;

            if(ts == block.timestamp) break;

            unchecked { ++i; }
        }

        if(_delegated == false && dbias != 0) {  // received boost
            emit Transfer(_user, address(0), dbias);
        }

        return point;
    }

    function _updateReceivedSlopeChanges(address _user) internal {
        SlopeChange[] memory userChanges = receiverSlopeChanges[_user];
        uint256 length = userChanges.length;
        if(length == 0) return;
        if(userChanges[0].endTimestamp > block.timestamp) return;

        uint256 expiredCount;
        for(uint256 i; i < length;) {
            if(userChanges[i].endTimestamp <= block.timestamp) {
                expiredCount++;
            } else if(userChanges[i].endTimestamp > block.timestamp) {
                break;
            }
            unchecked { ++i; }
        }

        for(uint256 i = expiredCount; i < length;) {
            receiverSlopeChanges[_user][i - expiredCount] = userChanges[i];
            unchecked { ++i; }
        }
        for(uint256 i; i < expiredCount;) {
            receiverSlopeChanges[_user].pop();
            unchecked { ++i; }
        }
    }

    function _balanceOf(address _user) internal view returns(uint256) {
        uint256 amount = HolyPalPower(HOLY_PAL_POWER).balanceOf(_user);

        Point memory point = _checkpointRead(_user, true, 0);
        amount -= (point.bias - point.slope * (block.timestamp - point.ts));

        point = _checkpointRead(_user, false, 0);
        amount += (point.bias - point.slope * (block.timestamp - point.ts));
        return amount;
    }

    function _balanceOfAt(address _user, uint256 _target_ts) internal view returns(uint256) {
        uint256 amount = HolyPalPower(HOLY_PAL_POWER).balanceOfAt(_user, _target_ts);

        Point memory point = _checkpointRead(_user, true, _target_ts);
        amount -= (point.bias - point.slope * (_target_ts - point.ts));

        point = _checkpointRead(_user, false, _target_ts);
        amount += (point.bias - point.slope * (_target_ts - point.ts));
        return amount;
    }

    function _boost(address _from, address _to, uint256 _amount, uint256 _endtime) internal {
        if(_to == address(0) || _to == _from) revert InvalidAddress();
        if(_amount == 0) revert NullAmount();
        if(_endtime <= block.timestamp) revert TimestampInPast();
        if(_endtime % WEEK != 0) revert InvalidTimestamp();
        if(_endtime > HolyPalPower(HOLY_PAL_POWER).locked__end(_from)) revert EndAfterLockEnd();

        // checkpoint delegated point
        Point memory point = _checkpointWrite(_from, true);
        if(
            _amount > HolyPalPower(HOLY_PAL_POWER).balanceOf(_from) - (point.bias - point.slope * (block.timestamp - point.ts))
        ) revert InsufficientBalance();

        // calculate slope and bias being added
        uint256 slope = _amount / (_endtime - block.timestamp);
        uint256 bias = slope * (_endtime - block.timestamp);

        // update delegated point
        point.bias += bias;
        point.slope += slope;

        uint256 delegatedNonce;
        uint256 receivedNonce;

        // store updated values
        delegatedNonce = delegatedCheckpointsNonces[_from];
        delegated[_from].push(point);
        delegatedSlopeChanges[_from][_endtime] += slope;
        delegatedCheckpointsDates[_from][delegatedNonce] = block.timestamp;
        delegatedCheckpointsNonces[_from] = delegatedNonce + 1;

        // update received amount
        point = _checkpointWrite(_to, false);
        point.bias += bias;
        point.slope += slope;

        // store updated values
        receivedNonce = receivedCheckpointsNonces[_to];
        received[_to].push(point);
        receivedSlopeChanges[_to][_endtime] += slope;
        receivedCheckpointsDates[_to][receivedNonce] = block.timestamp;
        receivedCheckpointsNonces[_to] = receivedNonce + 1;

        // also checkpoint received and delegated
        delegatedNonce = delegatedCheckpointsNonces[_to];
        receivedNonce = receivedCheckpointsNonces[_from];
        received[_from].push(_checkpointWrite(_from, false));
        delegated[_to].push(_checkpointWrite(_to, true));
        receivedCheckpointsDates[_from][receivedNonce] = block.timestamp;
        delegatedCheckpointsDates[_to][delegatedNonce] = block.timestamp;
        delegatedCheckpointsNonces[_to] = delegatedNonce + 1;
        receivedCheckpointsNonces[_from] = receivedNonce + 1;

        // update slope changes
        _updateReceivedSlopeChanges(_from);
        _updateReceivedSlopeChanges(_to);
        receiverSlopeChanges[_to].push(SlopeChange(slope, _endtime));

        emit Transfer(_from, _to, _amount);
        emit Boost(_from, _to, bias, slope, block.timestamp);
    }

    // Maths

    function _average(uint256 a, uint256 b) internal pure returns (uint256) {
        // (a + b) / 2 can overflow.
        return (a & b) + (a ^ b) / 2;
    }

}