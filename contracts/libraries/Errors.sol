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
    error VotingCooldown();

    // Loot
    error CreatorAlreadySet();
    error InvalidId();
    error VestingNotStarted();

    // Loot Creator
    error NotListed();

    //Maths
    error ConversionOverflow();
}