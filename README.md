# Vote Flywheel


Vote Flywheel smart contracts


## Overview

Vote Flywheel is the 2nd part of the Paladin tokenomics, built upon Quest V2.  
This system allcoates PAL & an extra reward token, bundled as LOOT, to be distributed to Quest voters as extra rewards.  
hPAL locks are the based voting power used in Vote Flywheel, and the Locks are converted into a decreasing balance called HolyPalPower (similar to a veToken), allowing to vote on LOOT allocation & boosting LOOT claim for voters.  
The PAL & extra token are distributed into the system each week (via the LootBudget contract), and is allocated between gauge listed in the LootVoteController contract (gauges listed come from the Curve, Balancer, Bunni, ... ecosystems, having Quests created for voting incentives). The allocation is split based on the votes received on each gauge, and divided for each Quest if the gauge has multiple Quests for the same period.  
The Loot is then distributed to users based on their amount of rewards from Quests, and boosted based on the hPalPower of the user. The LOOT need to be created by the user, and can be claimed any time, but need to be vest for 2 weeks to receive the full PAL amount.  
The HPalPower boosting can be delegated using the veBoost logic.  
Each week, all budget that was not allocated (because no Quests were created on the gauge, or the gauge cap over exceeded, or the users didn't have enough boosting power to receive all rewards, or PAL was slashed from the LOOT vesting) is pushed back into the pending budget for future period, increasing the amount to allocate.  


![Diagram](misc/Vote_Flywheel_diagram.png?raw=true "Diagram")



### Deployed contracts

to do


## Dependencies & Installation


To start, make sure you have `node` & `npm` installed : 
* `node` - tested with v16.4.0
* `npm` - tested with v7.18.1

Then, clone this repo, and install the dependencies : 

```
git clone https://github.com/PaladinFinance/Vote-Flywheel.git
cd Vote-Flywheel
npm install
```

This will install `Hardhat`, `Ethers v5`, and all the hardhat plugins used in this project.


## Contracts

to do


## Tests


Unit tests can be found in the [test](https://github.com/PaladinFinance/Vote-Flywheel/tree/main/test) directory.

To run all the tests : 
```
npm run test
```

To run the test on only one contract : 
```
npm run test ./test/questBoard.test.ts  
```


## Deploy


```
npm run build
npm run deploy
```

To deploy some contracts only, see the scripts in [scripts/deploy](https://github.com/PaladinFinance/Vote-Flywheel/tree/main/scripts/deploy), and setting the correct parameters in [scripts/utils/main_params.js](https://github.com/PaladinFinance/Vote-Flywheel/tree/main/scripts/deploy/utils/main_params.js)


## Security & Audit


coming soon


## Ressources


Website : [paladin.vote](https://.paladin.vote)

Documentation : [doc.paladin.vote](https://doc.paladin.vote)


## Community

For any question about this project, or to engage with us :

[Twitter](https://twitter.com/Paladin_vote)

[Discord](https://discord.com/invite/esZhmTbKHc)



## License


This project is licensed under the [MIT](https://github.com/PaladinFinance/Warden-Quest/blob/main/MIT-LICENSE.TXT) license


