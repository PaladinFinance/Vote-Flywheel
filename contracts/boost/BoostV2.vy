# @version 0.3.3
"""
@title Boost Delegation V2
@author CurveFi, modified by Paladin
"""


event Approval:
    _owner: indexed(address)
    _spender: indexed(address)
    _value: uint256

event Transfer:
    _from: indexed(address)
    _to: indexed(address)
    _value: uint256

event Boost:
    _from: indexed(address)
    _to: indexed(address)
    _bias: uint256
    _slope: uint256
    _start: uint256


interface HolyPalPower:
    def balanceOf(_user: address) -> uint256: view
    def balanceOfAt(_user: address, _timestamp: uint256) -> uint256: view
    def totalSupply() -> uint256: view
    def locked__end(_user: address) -> uint256: view
    def totalLocked() -> uint256: view
    def totalLockedAt(blockNumber: uint256) -> uint256: view


struct Point:
    bias: uint256
    slope: uint256
    ts: uint256


NAME: constant(String[32]) = "HolyPal Power Boost"
SYMBOL: constant(String[9]) = "hPalBoost"
VERSION: constant(String[8]) = "v2.0.0"

EIP712_TYPEHASH: constant(bytes32) = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
PERMIT_TYPEHASH: constant(bytes32) = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")

WEEK: constant(uint256) = 86400 * 7

HOLY_PAL_POWER: immutable(address)


allowance: public(HashMap[address, HashMap[address, uint256]])
nonces: public(HashMap[address, uint256])

delegated: public(HashMap[address, Point[1000000000]])
delegated_slope_changes: public(HashMap[address, HashMap[uint256, uint256]])
delegated_checkpoints_dates: public(HashMap[address, HashMap[uint256, uint256]])
delegated_checkpoints_nonces: public(HashMap[address, uint256])

received: public(HashMap[address, Point[1000000000]])
received_slope_changes: public(HashMap[address, HashMap[uint256, uint256]])
received_checkpoints_dates: public(HashMap[address, HashMap[uint256, uint256]])
received_checkpoints_nonces: public(HashMap[address, uint256])


@external
def __init__(_ve: address):
    HOLY_PAL_POWER = _ve

    log Transfer(ZERO_ADDRESS, msg.sender, 0)

@internal
@view
def _domain_separator() -> bytes32:
    return keccak256(_abi_encode(EIP712_TYPEHASH, keccak256(NAME), keccak256(VERSION), chain.id, self))

@internal
@pure
def _average(x: uint256, y: uint256) -> uint256:
    return unsafe_add(bitwise_and(x,y), shift(bitwise_xor(x,y),1))

@view
@internal
def _find_delegated_point(_user: address, _ts: uint256 = block.timestamp) -> Point:
    empty_point: Point = empty(Point)

    user_nonce : uint256 = self.delegated_checkpoints_nonces[_user]

    if user_nonce == 0:
        return empty_point

    if self.delegated_checkpoints_dates[_user][0] > _ts:
        return empty_point

    if self.delegated_checkpoints_dates[_user][user_nonce - 1] <= _ts:
        return self.delegated[_user][user_nonce - 1]

    high: uint256 = user_nonce - 1
    low: uint256 = 0
    mid: uint256 = 0

    # Should be enough iterations to find the correct checkpoint
    for _ in range(255):
        if low >= high:
            break

        mid = self._average(low, high)

        if self.delegated_checkpoints_dates[_user][mid] == _ts:
            return self.delegated[_user][mid]

        if self.delegated_checkpoints_dates[_user][mid] > _ts:
            high = mid
        else:
            low = mid + 1

    if high == 0:
        return empty_point

    return self.delegated[_user][high - 1]

@view
@internal
def _find_received_point(_user: address, _ts: uint256 = block.timestamp) -> Point:
    empty_point: Point = empty(Point)

    user_nonce : uint256 = self.received_checkpoints_nonces[_user]

    if user_nonce == 0:
        return empty_point

    if self.received_checkpoints_dates[_user][0] > _ts:
        return empty_point

    if self.received_checkpoints_dates[_user][user_nonce - 1] <= _ts:
        return self.received[_user][user_nonce - 1]

    high: uint256 = user_nonce - 1
    low: uint256 = 0
    mid: uint256 = 0

    # Should be enough iterations to find the correct checkpoint
    for _ in range(255):
        if low >= high:
            break

        mid = self._average(low, high)

        if self.received_checkpoints_dates[_user][mid] == _ts:
            return self.received[_user][mid]

        if self.received_checkpoints_dates[_user][mid] > _ts:
            high = mid
        else:
            low = mid + 1

    if high == 0:
        return empty_point

    return self.received[_user][high - 1]


@view
@internal
def _checkpoint_read(_user: address, _delegated: bool, _target_ts: uint256 = block.timestamp) -> Point:
    point: Point = empty(Point)

    if _delegated:
        point = self._find_delegated_point(_user, _target_ts)
    else:
        point = self._find_received_point(_user, _target_ts)

    if point.ts == 0:
        point.ts = _target_ts

    if point.ts == _target_ts:
        return point

    ts: uint256 = (point.ts / WEEK) * WEEK
    for _ in range(255):
        ts += WEEK

        dslope: uint256 = 0
        if _target_ts < ts:
            ts = _target_ts
        else:
            if _delegated:
                dslope = self.delegated_slope_changes[_user][ts]
            else:
                dslope = self.received_slope_changes[_user][ts]

        point.bias -= point.slope * (ts - point.ts)
        point.slope -= dslope
        point.ts = ts

        if ts == _target_ts:
            break

    return point


@internal
def _checkpoint_write(_user: address, _delegated: bool) -> Point:
    point: Point = empty(Point)

    if _delegated:
        point = self._find_delegated_point(_user, block.timestamp)
    else:
        point = self._find_received_point(_user, block.timestamp)

    if point.ts == 0:
        point.ts = block.timestamp

    if point.ts == block.timestamp:
        return point

    dbias: uint256 = 0
    ts: uint256 = (point.ts / WEEK) * WEEK
    for _ in range(255):
        ts += WEEK

        dslope: uint256 = 0
        if block.timestamp < ts:
            ts = block.timestamp
        else:
            if _delegated:
                dslope = self.delegated_slope_changes[_user][ts]
            else:
                dslope = self.received_slope_changes[_user][ts]

        amount: uint256 = point.slope * (ts - point.ts)

        dbias += amount
        point.bias -= amount
        point.slope -= dslope
        point.ts = ts

        if ts == block.timestamp:
            break

    if _delegated == False and dbias != 0:  # received boost
        log Transfer(_user, ZERO_ADDRESS, dbias)

    return point


@view
@internal
def _balance_of(_user: address) -> uint256:
    amount: uint256 = HolyPalPower(HOLY_PAL_POWER).balanceOf(_user)

    point: Point = self._checkpoint_read(_user, True)
    amount -= (point.bias - point.slope * (block.timestamp - point.ts))

    point = self._checkpoint_read(_user, False)
    amount += (point.bias - point.slope * (block.timestamp - point.ts))
    return amount


@view
@internal
def _balance_of_at(_user: address, _target_ts: uint256) -> uint256:
    amount: uint256 = HolyPalPower(HOLY_PAL_POWER).balanceOfAt(_user, _target_ts)

    point: Point = self._checkpoint_read(_user, True, _target_ts)
    amount -= (point.bias - point.slope * (_target_ts - point.ts))

    point = self._checkpoint_read(_user, False, _target_ts)
    amount += (point.bias - point.slope * (_target_ts - point.ts))
    return amount


@internal
def _boost(_from: address, _to: address, _amount: uint256, _endtime: uint256):
    assert _to not in [_from, ZERO_ADDRESS]
    assert _amount != 0
    assert _endtime > block.timestamp
    assert _endtime % WEEK == 0
    assert _endtime <= HolyPalPower(HOLY_PAL_POWER).locked__end(_from)

    # checkpoint delegated point
    point: Point = self._checkpoint_write(_from, True)
    assert _amount <= HolyPalPower(HOLY_PAL_POWER).balanceOf(_from) - (point.bias - point.slope * (block.timestamp - point.ts))

    # calculate slope and bias being added
    slope: uint256 = _amount / (_endtime - block.timestamp)
    bias: uint256 = slope * (_endtime - block.timestamp)

    # update delegated point
    point.bias += bias
    point.slope += slope

    delegated_nonce: uint256 = 0
    received_nonce: uint256 = 0

    # store updated values
    delegated_nonce = self.delegated_checkpoints_nonces[_from]
    self.delegated[_from][delegated_nonce] = point
    self.delegated_slope_changes[_from][_endtime] += slope
    self.delegated_checkpoints_dates[_from][delegated_nonce] = block.timestamp
    self.delegated_checkpoints_nonces[_from] = delegated_nonce + 1

    # update received amount
    point = self._checkpoint_write(_to, False)
    point.bias += bias
    point.slope += slope

    # store updated values
    received_nonce = self.received_checkpoints_nonces[_to]
    self.received[_to][received_nonce] = point
    self.received_slope_changes[_to][_endtime] += slope
    self.received_checkpoints_dates[_to][received_nonce] = block.timestamp
    self.received_checkpoints_nonces[_to] = received_nonce + 1

    log Transfer(_from, _to, _amount)
    log Boost(_from, _to, bias, slope, block.timestamp)

    # also checkpoint received and delegated
    delegated_nonce = self.delegated_checkpoints_nonces[_to]
    received_nonce = self.received_checkpoints_nonces[_from]
    self.received[_from][received_nonce] = self._checkpoint_write(_from, False)
    self.delegated[_to][delegated_nonce] = self._checkpoint_write(_to, True)
    self.received_checkpoints_dates[_from][received_nonce] = block.timestamp
    self.delegated_checkpoints_dates[_to][delegated_nonce] = block.timestamp
    self.delegated_checkpoints_nonces[_to] = delegated_nonce + 1
    self.received_checkpoints_nonces[_from] = received_nonce + 1


@external
def boost(_to: address, _amount: uint256, _endtime: uint256, _from: address = msg.sender):
    # reduce approval if necessary
    if _from != msg.sender:
        allowance: uint256 = self.allowance[_from][msg.sender]
        if allowance != MAX_UINT256:
            self.allowance[_from][msg.sender] = allowance - _amount
            log Approval(_from, msg.sender, allowance - _amount)

    self._boost(_from, _to, _amount, _endtime)


@external
def checkpoint_user(_user: address):
    delegated_nonce: uint256 = self.delegated_checkpoints_nonces[_user]
    self.delegated[_user][delegated_nonce] = self._checkpoint_write(_user, True)
    self.delegated_checkpoints_dates[_user][delegated_nonce] = block.timestamp
    self.delegated_checkpoints_nonces[_user] = delegated_nonce + 1
    
    received_nonce: uint256 = self.received_checkpoints_nonces[_user]
    self.received[_user][received_nonce] = self._checkpoint_write(_user, False)
    self.received_checkpoints_dates[_user][received_nonce] = block.timestamp
    self.received_checkpoints_nonces[_user] = received_nonce + 1


@external
def approve(_spender: address, _value: uint256) -> bool:
    self.allowance[msg.sender][_spender] = _value

    log Approval(msg.sender, _spender, _value)
    return True


@external
def permit(_owner: address, _spender: address, _value: uint256, _deadline: uint256, _v: uint8, _r: bytes32, _s: bytes32) -> bool:
    assert _owner != ZERO_ADDRESS
    assert block.timestamp <= _deadline

    nonce: uint256 = self.nonces[_owner]
    digest: bytes32 = keccak256(
        concat(
            b"\x19\x01",
            self._domain_separator(),
            keccak256(_abi_encode(PERMIT_TYPEHASH, _owner, _spender, _value, nonce, _deadline))
        )
    )

    assert ecrecover(digest, convert(_v, uint256), convert(_r, uint256), convert(_s, uint256)) == _owner

    self.allowance[_owner][_spender] = _value
    self.nonces[_owner] = nonce + 1

    log Approval(_owner, _spender, _value)
    return True


@external
def increaseAllowance(_spender: address, _added_value: uint256) -> bool:
    allowance: uint256 = self.allowance[msg.sender][_spender] + _added_value
    self.allowance[msg.sender][_spender] = allowance

    log Approval(msg.sender, _spender, allowance)
    return True


@external
def decreaseAllowance(_spender: address, _subtracted_value: uint256) -> bool:
    allowance: uint256 = self.allowance[msg.sender][_spender] - _subtracted_value
    self.allowance[msg.sender][_spender] = allowance

    log Approval(msg.sender, _spender, allowance)
    return True


@view
@external
def balanceOf(_user: address) -> uint256:
    return self._balance_of(_user)


@view
@external
def adjusted_balance_of(_user: address) -> uint256:
    return self._balance_of(_user)


@external
def adjusted_balance_of_write(_user: address) -> uint256:
    delegated_nonce: uint256 = self.delegated_checkpoints_nonces[_user]
    self.delegated[_user][delegated_nonce] = self._checkpoint_write(_user, True)
    self.delegated_checkpoints_dates[_user][delegated_nonce] = block.timestamp
    self.delegated_checkpoints_nonces[_user] = delegated_nonce + 1
    
    received_nonce: uint256 = self.received_checkpoints_nonces[_user]
    self.received[_user][received_nonce] = self._checkpoint_write(_user, False)
    self.received_checkpoints_dates[_user][received_nonce] = block.timestamp
    self.received_checkpoints_nonces[_user] = received_nonce + 1

    return self._balance_of(_user)


@view
@external
def balanceOfAt(_user: address, _ts: uint256) -> uint256:
    return self._balance_of_at(_user, _ts)


@view
@external
def adjusted_balance_of_at(_user: address, _ts: uint256) -> uint256:
    return self._balance_of_at(_user, _ts)


@view
@external
def voting_adjusted_balance_of_at(_user: address, _snapshot_ts: uint256, _target_ts: uint256) -> uint256:
    """
    @notice Get the adjusted balance of a user at a target timestmap, using the Point of a snapshot timestamp
    @param _user The address of the user
    @param _snapshot_ts Timestamp to fetch the Point at
    @param _target_ts Timestamp to calculated the adjusted balance at
    @return The adjusted balance
    """
    amount: uint256 = HolyPalPower(HOLY_PAL_POWER).balanceOfAt(_user, _snapshot_ts)

    delegated_point: Point = self._checkpoint_read(_user, True, _snapshot_ts)
    received_point: Point = self._checkpoint_read(_user, False, _snapshot_ts)
    
    ts: uint256 = (_snapshot_ts / WEEK) * WEEK
    for _ in range(255):
        ts += WEEK

        delegated_dslope: uint256 = 0
        received_dslope: uint256 = 0
        if _target_ts < ts:
            ts = _target_ts
        else:
            delegated_dslope = self.delegated_slope_changes[_user][ts]
            received_dslope = self.received_slope_changes[_user][ts]

        delegated_point.bias -= delegated_point.slope * (ts - delegated_point.ts)
        delegated_point.slope -= delegated_dslope
        delegated_point.ts = ts

        received_point.bias -= received_point.slope * (ts - received_point.ts)
        received_point.slope -= received_dslope
        received_point.ts = ts

        if ts == _target_ts:
            break
    
    amount -= (delegated_point.bias - delegated_point.slope * (_target_ts - delegated_point.ts))
    amount += (received_point.bias - received_point.slope * (_target_ts - received_point.ts))
    return amount


@view
@external
def totalSupply() -> uint256:
    return HolyPalPower(HOLY_PAL_POWER).totalLocked()


@view
@external
def total_locked() -> uint256:
    return HolyPalPower(HOLY_PAL_POWER).totalLocked()


@view
@external
def total_locked_at(block_number: uint256) -> uint256:
    return HolyPalPower(HOLY_PAL_POWER).totalLockedAt(block_number)


@view
@external
def delegated_balance(_user: address) -> uint256:
    point: Point = self._checkpoint_read(_user, True)
    return point.bias - point.slope * (block.timestamp - point.ts)


@view
@external
def received_balance(_user: address) -> uint256:
    point: Point = self._checkpoint_read(_user, False)
    return point.bias - point.slope * (block.timestamp - point.ts)


@view
@external
def delegable_balance(_user: address) -> uint256:
    point: Point = self._checkpoint_read(_user, True)
    return HolyPalPower(HOLY_PAL_POWER).balanceOf(_user) - (point.bias - point.slope * (block.timestamp - point.ts))


@view
@external
def delegated_point(_user: address) -> Point:
    user_nonce: uint256 = self.delegated_checkpoints_nonces[_user]
    if user_nonce == 0:
        return empty(Point)
    return self.delegated[_user][user_nonce - 1]


@view
@external
def received_point(_user: address) -> Point:
    user_nonce: uint256 = self.received_checkpoints_nonces[_user]
    if user_nonce == 0:
        return empty(Point)
    return self.received[_user][user_nonce - 1]


@pure
@external
def name() -> String[32]:
    return NAME


@pure
@external
def symbol() -> String[9]:
    return SYMBOL


@pure
@external
def decimals() -> uint8:
    return 18


@view
@external
def DOMAIN_SEPARATOR() -> bytes32:
    return self._domain_separator()


@pure
@external
def HOLY_PAL_POWER() -> address:
    return HOLY_PAL_POWER