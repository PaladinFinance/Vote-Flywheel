// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

library Errors {
    
    // Commons
    error AddressZero();
    error NullAmount();
    error InvalidParameter();
    error SameAddress();
    error ArraySizeMismatch();
    error AlreadyInitialized();

    // Access Control
    error CannotBeOwner();
    error CallerNotPendingOwner();
    error CallerNotAllowed();

    // Merkle Distributor
    error EmptyParameters();
    error InvalidProof();
    error AlreadyClaimed();
    error MerkleRootNotUpdated();
    error EmptyMerkleRoot();
    error IncorrectQuestID();
    error QuestAlreadyListed();
    error QuestNotListed();
    error PeriodAlreadyUpdated();
    error PeriodNotClosed();
    error IncorrectPeriod();
    error PeriodNotListed();
    error TokenNotWhitelisted();
    error IncorrectRewardAmount();
    error CannotRecoverToken();

    // HolyPalPower
    error InvalidTimestamp();

    // Vote Controller
    error AlreadyListed();
    error LockExpired();
    error VotingPowerInvalid();
    error VotingPowerExceeded();
    error VotingPowerProxyExceeded();
    error VotingCooldown();
    error KilledGauge();
    error NotKilledGauge();
    error NotAllowedManager();
    error NotAllowedProxyVoter();
    error ExpiredProxy();
    error ProxyAlreadyActive();
    error ProxyPowerExceeded();
    error NotAllowedVoteChange();
    error MaxVoteListExceeded();
    error MaxProxyListExceeded();

    // Loot
    error CreatorAlreadySet();
    error InvalidId(uint256 id);
    error VestingNotStarted(uint256 id);

    // Loot Creator
    error NotListed();

    // Loot Buget
    error LootBudgetExceedLimit();

    //Maths
    error ConversionOverflow();
}