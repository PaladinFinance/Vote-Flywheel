## Overview

For Overview of the codebase and installation instructions, see README.md

## Scope

### Files in scope

|File|SLOC|Coverage|
|:-|:-:|:-:|
|HolyPalPower.sol | 211 | 93.33% |
|Loot.sol | 309 | 95.3125% |
|LootBudget.sol | 116 | 76.9975% |
|LootCreator.sol | 463 | 89.6% |
|LootGauge.sol | 93 | 92.8575% |
|LootReserve.sol | 100 | 100.00% |
|LootVoteController.sol | 668 | 98.17% |
|MultiMerkleDistributorV2.sol | 358 | 98.4375% |
|BoostV2.vy | 413 | -% |
|DelegationProxy.vy | 134 | -% |
|Total: | 2865 | 94.935% |

### Files out of scope

|File or Directories|
|:-|
|interfaces/ |
|libraries/ |
|test/ |
|utils/ |
|@@openzeppelin/contracts/ |

## Smart contracts

### HolyPalPower

Converts the hPAL Locks into a decreasing balance, similar to a veToken, with a Point structure (bias & slope). Allows to fetch past total locked supply and users past Locks

### Loot

Contract hosting the Loot reward logic. A Loot is a struct holding the data for PAL & extra rewards allocated to an user based on distribution, user voting rewards from Quest and boosting power from their hPAL locks. The PAL rewards in the Loot are vested for a given duration, and can be claimed beforehand but are slashed based on the reamining duration of the vesting. The extra rewards are not vested and not slashed.

### LootBudget

Contract holding the PAL & extra token budget for the Loot system and managing the periodical allocation to the LootReserve. This is to be later replaced by the LootGauge contract.

### LootCreator

Contract handling the Budget for gauges & Quests and the Loot creation. The budget allocated to each Quest for each period is based on the weight of a gauge received through votes on the LootVoteController, and the number of Quest on each gauge. All unallocated budget is pushed back to the pending budget for the next period. The rewards allocated to Quest voters are allocated by this contract (which creates the Loot), based on the Quest allocation, the user voting rewards and the user boosting power. All rewards not allocated to an user for its Loot (by lack of boosting power) are pushed back to the pending budget for the next period.
Each period budget is pulled from the LootBudget or the LootGauge.

### LootGauge

Contract meant to manage PAL & extra rewards budgets from a future budgeting system to be introduced later in the Paladin ecosystem. The budget received by this contract is then allocated to the LootCreator (and sent to the Loot REserve contract) 

### LootReserve

Contract holding all PAL & extra rewards allocated to the Loot system. The tokens are then sent to users when claiming Loot rewards.

### LootVoteController

Contract handling the vote logic for repartition of the global Loot budget between all the listed gauges for the Quest system. User voting power is based on their hPAL locks, transformed into a bias via the HolyPalPower contract. Votes are sticky, meaning users do not need to cast them every period, but can set their vote and update it periods later. Before an user can change its votes, a vote cooldown need to be respected.

### MultiMerkleDistributorV2

Updated version of the MultiMerkleDistributor used in Quest, distributing the voting rewards to voters. Modified to handle Loot triggers for Loot creations based on the rewards claimed by users, and the total rewards in each Quest periods.

### BoostV2

Modified version of the BoostV2 contract by Curve, allowing to delegate boosting power. Modified to handle the HolyPalPower contract, and to have checkpoints for past delegations of boosting power.

### DelegationProxy

Modified version of the DelegationProxy contract by Curve, to match the chnages in the BoostV2 contract & fallbacks to the hPAL contract if delegation is not active.