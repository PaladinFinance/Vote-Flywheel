# @version 0.3.3
"""
@title Voting Escrow Delegation Proxy
@author Curve Finance, modified by Paladin
@license MIT
"""


interface HolyPalPower:
    def balanceOf(_user: address) -> uint256: view
    def balanceOfAt(_user: address, _timestamp: uint256) -> uint256: view

    def totalLocked() -> uint256: view
    def totalLockedAt(blockNumber: uint256) -> uint256: view


interface VeDelegation: # Boost V2
    def adjusted_balance_of(_account: address) -> uint256: view
    def adjusted_balance_of_write(_account: address) -> uint256: nonpayable
    def adjusted_balance_of_at(_account: address, _ts: uint256) -> uint256: view

    def total_locked() -> uint256: view
    def total_locked_at(block_number: uint256) -> uint256: view


event CommitAdmins:
    ownership_admin: address
    emergency_admin: address

event ApplyAdmins:
    ownership_admin: address
    emergency_admin: address

event DelegationSet:
    delegation: address


HOLY_PAL_POWER: immutable(address)


delegation: public(address)

emergency_admin: public(address)
ownership_admin: public(address)
future_emergency_admin: public(address)
future_ownership_admin: public(address)


@external
def __init__(_voting_escrow: address, _delegation: address, _o_admin: address, _e_admin: address):
    assert _voting_escrow != ZERO_ADDRESS
    assert _o_admin != ZERO_ADDRESS
    assert _e_admin != ZERO_ADDRESS

    HOLY_PAL_POWER = _voting_escrow

    self.delegation = _delegation

    self.ownership_admin = _o_admin
    self.emergency_admin = _e_admin

    log DelegationSet(_delegation)


@view
@external
def adjusted_balance_of(_account: address) -> uint256:
    """
    @notice Get the adjusted hPalPower balance from the active boost delegation contract
    @param _account The account to query the adjusted hPalPower balance of
    @return hPalPower balance
    """
    _delegation: address = self.delegation
    if _delegation == ZERO_ADDRESS:
        return HolyPalPower(HOLY_PAL_POWER).balanceOf(_account)
    return VeDelegation(_delegation).adjusted_balance_of(_account)

@external
def adjusted_balance_of_write(_account: address) -> uint256:
    """
    @notice Get the adjusted hPalPower balance from the active boost delegation contract
    @param _account The account to query the adjusted hPalPower balance of
    @return hPalPower balance
    """
    _delegation: address = self.delegation
    if _delegation == ZERO_ADDRESS:
        return HolyPalPower(HOLY_PAL_POWER).balanceOf(_account)
    return VeDelegation(_delegation).adjusted_balance_of_write(_account)


@view
@external
def adjusted_balance_of_at(_account: address, _ts: uint256) -> uint256:
    """
    @notice Get the adjusted hPalPower balance from the active boost delegation contract at a given timestamp
    @param _account The account to query the adjusted hPalPower balance of
    @param _ts Timestamp to look at
    @return hPalPower balance
    """
    _delegation: address = self.delegation
    if _delegation == ZERO_ADDRESS:
        return HolyPalPower(HOLY_PAL_POWER).balanceOfAt(_account, _ts)
    return VeDelegation(_delegation).adjusted_balance_of_at(_account, _ts)


@view
@external
def total_locked() -> uint256:
    """
    @notice Get the total hPAL locked
    @return Ttoal hPAL locked
    """
    return HolyPalPower(HOLY_PAL_POWER).totalLocked()


@view
@external
def total_locked_at(_blockNumber: uint256) -> uint256:
    """
    @notice Get the total hPAL locked at a given block
    @param _blockNumber Number fo the block to look at
    @return Ttoal hPAL locked
    """
    return HolyPalPower(HOLY_PAL_POWER).totalLockedAt(_blockNumber)


@external
def kill_delegation():
    """
    @notice Set delegation contract to 0x00, disabling boost delegation
    @dev Callable by the emergency admin in case of an issue with the delegation logic
    """
    assert msg.sender in [self.ownership_admin, self.emergency_admin]

    self.delegation = ZERO_ADDRESS
    log DelegationSet(ZERO_ADDRESS)


@external
def set_delegation(_delegation: address):
    """
    @notice Set the delegation contract
    @dev Only callable by the ownership admin
    @param _delegation `VotingEscrowDelegation` deployment address
    """
    assert msg.sender == self.ownership_admin

    # call `adjusted_balance_of` to make sure it works
    VeDelegation(_delegation).adjusted_balance_of(msg.sender)

    self.delegation = _delegation
    log DelegationSet(_delegation)


@external
def commit_set_admins(_o_admin: address, _e_admin: address):
    """
    @notice Set ownership admin to `_o_admin` and emergency admin to `_e_admin`
    @param _o_admin Ownership admin
    @param _e_admin Emergency admin
    """
    assert msg.sender == self.ownership_admin, "Access denied"

    self.future_ownership_admin = _o_admin
    self.future_emergency_admin = _e_admin

    log CommitAdmins(_o_admin, _e_admin)


@external
def apply_set_admins():
    """
    @notice Apply the effects of `commit_set_admins`
    """
    assert msg.sender == self.ownership_admin, "Access denied"

    _o_admin: address = self.future_ownership_admin
    _e_admin: address = self.future_emergency_admin
    self.ownership_admin = _o_admin
    self.emergency_admin = _e_admin

    log ApplyAdmins(_o_admin, _e_admin)