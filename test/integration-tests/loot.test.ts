const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { HolyPalPower } from "../../typechain/contracts/HolyPalPower";
import { DelegationProxy } from "../../typechain/contracts/boost/DelegationProxy.vy/DelegationProxy";
import { BoostV2 } from "../../typechain/contracts/boost/BoostV2.vy/BoostV2";
import { IHolyPaladinToken } from "../../typechain/contracts/interfaces/IHolyPaladinToken";
import { IHolyPaladinToken__factory } from "../../typechain/factories/contracts/interfaces/IHolyPaladinToken__factory";
import { IQuestBoard } from "../../typechain/contracts/interfaces/IQuestBoard";
import { IQuestBoard__factory } from "../../typechain/factories/contracts/interfaces/IQuestBoard__factory";
import { IERC20 } from "../../typechain/@openzeppelin/contracts/token/ERC20/IERC20";
import { IERC20__factory } from "../../typechain/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";
import { LootVoteController } from "../../typechain/contracts/LootVoteController";
import { LootBudget } from "../../typechain/contracts/LootBudget";
import { LootCreator } from "../../typechain/contracts/LootCreator";
import { Loot } from "../../typechain/contracts/Loot";
import { MultiMerkleDistributorV2 } from "../../typechain/contracts/MultiMerkleDistributorV2";
import { LootReserve } from "../../typechain/contracts/LootReserve";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { parseBalanceMap } from "../utils/merkle/parse-balance-map";
import BalanceTree from "../utils/merkle/balance-tree";

import {
    advanceTime,
    resetFork,
    getERC20
} from "../utils/utils";

import {
    HPAL,
    HPAL_LOCKERS,
    BLOCK_NUMBER,
    BOARDS,
    VALID_GAUGES,
    REWARD_TOKEN,
    REWARD_HOLDER,
    REWARD_AMOUNT,
    PAL_ADDRESS,
    PAL_HOLDER,
    PAL_AMOUNT,
    BOARD_ADMIN
} from "./constant";

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

const WEEK = BigNumber.from(86400 * 7)
const UNIT = ethers.utils.parseEther('1')
const MAX_TIME = BigNumber.from(86400 * 365 * 4)

const MAX_MULTIPLIER = ethers.utils.parseEther("5")
const BASE_MULTIPLIER = ethers.utils.parseEther("1")

let powerFactory: ContractFactory
let proxyFactory: ContractFactory
let boostFactory: ContractFactory
let controllerFactory: ContractFactory
let budgetFactory: ContractFactory
let creatorFactory: ContractFactory
let lootFactory: ContractFactory
let reserveFactory: ContractFactory
let distributorFactory: ContractFactory

describe('Vote Controller - Voting tests', () => {
    let admin: SignerWithAddress
    let boardAdmin: SignerWithAddress

    let power: HolyPalPower

    let proxy: DelegationProxy

    let boost: BoostV2

    let hPal: IHolyPaladinToken

    let controller: LootVoteController

    let budget: LootBudget

    let creator: LootCreator

    let loot: Loot

    let reserve: LootReserve

    let distributor1: MultiMerkleDistributorV2
    let distributor2: MultiMerkleDistributorV2

    let voter1: SignerWithAddress
    let voter2: SignerWithAddress
    let voter3: SignerWithAddress

    let pal: IERC20
    let extraToken: IERC20

    let questRewardToken: IERC20

    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress
    let user4: SignerWithAddress
    let user5: SignerWithAddress
    let user6: SignerWithAddress

    const vesting_duration = BigNumber.from(86400 * 7 * 2)

    before(async () => {
        await resetFork(BLOCK_NUMBER);

        [admin, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();

        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [BOARD_ADMIN],
        });
        await admin.sendTransaction({
            to: BOARD_ADMIN,
            value: ethers.utils.parseEther("10"),
        });
        boardAdmin = await ethers.getSigner(BOARD_ADMIN)

        budgetFactory = await ethers.getContractFactory("LootBudget");
        controllerFactory = await ethers.getContractFactory("LootVoteController");
        powerFactory = await ethers.getContractFactory("contracts/HolyPalPower.sol:HolyPalPower");
        proxyFactory = await ethers.getContractFactory("DelegationProxy");
        boostFactory = await ethers.getContractFactory("BoostV2");
        creatorFactory = await ethers.getContractFactory("LootCreator");
        lootFactory = await ethers.getContractFactory("Loot");
        reserveFactory = await ethers.getContractFactory("LootReserve");
        distributorFactory = await ethers.getContractFactory("MultiMerkleDistributorV2");

        hPal = IHolyPaladinToken__factory.connect(HPAL, provider);

        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [HPAL_LOCKERS[0]],
        });
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [HPAL_LOCKERS[1]],
        });
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [HPAL_LOCKERS[2]],
        });
    
        await admin.sendTransaction({
            to: HPAL_LOCKERS[0],
            value: ethers.utils.parseEther("10"),
        });
        await admin.sendTransaction({
            to: HPAL_LOCKERS[1],
            value: ethers.utils.parseEther("10"),
        });
        await admin.sendTransaction({
            to: HPAL_LOCKERS[2],
            value: ethers.utils.parseEther("10"),
        });
    
        voter1 = await ethers.getSigner(HPAL_LOCKERS[0])
        voter2 = await ethers.getSigner(HPAL_LOCKERS[1])
        voter3 = await ethers.getSigner(HPAL_LOCKERS[2])

        pal = IERC20__factory.connect(PAL_ADDRESS, provider)
        extraToken = IERC20__factory.connect(REWARD_TOKEN, provider)
        questRewardToken = IERC20__factory.connect("0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", provider)

        await getERC20(admin, PAL_HOLDER, pal, admin.address, PAL_AMOUNT);
        await getERC20(admin, REWARD_HOLDER, extraToken, admin.address, REWARD_AMOUNT);
        await getERC20(admin, "0x820fb25352BB0c5E03E07AFc1d86252fFD2F0A18", questRewardToken, admin.address, ethers.utils.parseEther("5000000"));

    })

    beforeEach(async () => {

        distributor1 = (await distributorFactory.connect(admin).deploy(BOARDS[0].board)) as MultiMerkleDistributorV2;
        await distributor1.deployed();
        distributor2 = (await distributorFactory.connect(admin).deploy(BOARDS[1].board)) as MultiMerkleDistributorV2;
        await distributor2.deployed();

        power = (await powerFactory.connect(admin).deploy(
            HPAL
        )) as HolyPalPower
        await power.deployed()

        boost = (await boostFactory.connect(admin).deploy(
            power.address,
        )) as BoostV2
        await boost.deployed()

        controller = (await controllerFactory.connect(admin).deploy(
            power.address
        )) as LootVoteController
        await controller.deployed()

        proxy = (await proxyFactory.connect(admin).deploy(
            power.address,
            boost.address,
            admin.address,
            admin.address
        )) as DelegationProxy
        await proxy.deployed()

        reserve = (await reserveFactory.connect(admin).deploy(
            pal.address,
            extraToken.address
        )) as LootReserve
        await reserve.deployed()

        loot = (await lootFactory.connect(admin).deploy(
            pal.address,
            extraToken.address,
            reserve.address,
            vesting_duration
        )) as Loot
        await loot.deployed()

        creator = (await creatorFactory.connect(admin).deploy(
            loot.address,
            controller.address,
            proxy.address
        )) as LootCreator
        await creator.deployed()

        budget = (await budgetFactory.connect(admin).deploy(
            pal.address,
            extraToken.address,
            creator.address,
            reserve.address,
            0,
            0
        )) as LootBudget
        await budget.deployed()

        await reserve.connect(admin).init(loot.address)

        await creator.connect(admin).init(budget.address)

        await loot.connect(admin).setInitialLootCreator(creator.address)

        await distributor1.connect(admin).setLootCreator(creator.address)
        await distributor2.connect(admin).setLootCreator(creator.address)

    });

    describe('loot creation & claim', async () => {

        let board1: IQuestBoard
        let board2: IQuestBoard

        let board1_id: BigNumber
        let board2_id: BigNumber

        const pal_budget = ethers.utils.parseEther("4500")
        const extra_budget = ethers.utils.parseEther("12500")

        const vote_powers1 = [BigNumber.from(4000), BigNumber.from(2500), BigNumber.from(3500)]
        const vote_powers2 = [BigNumber.from(5000), BigNumber.from(1500), BigNumber.from(2500), BigNumber.from(1000)]
        const vote_powers3 = [BigNumber.from(3000), BigNumber.from(3000), BigNumber.from(4000)]

        const reward_per_vote = ethers.utils.parseEther('0.5')
        const reward_per_vote2 = ethers.utils.parseEther('0.75')

        const rewards_per_period = ethers.utils.parseEther('5000')
        const rewards_per_period2 = ethers.utils.parseEther('3500')

        const duration = 2

        const total_rewards_amount = rewards_per_period.mul(duration)
        const total_rewards_amount2 = rewards_per_period2.mul(duration)
        const total_fees = total_rewards_amount.mul(400).div(10000)
        const total_fees2 = total_rewards_amount2.mul(400).div(10000)

        let tree: BalanceTree;
        let tree2: BalanceTree;

        let tree_root: string
        let tree_root2: string

        let quest_id1: BigNumber
        let quest_id2: BigNumber

        let closed_period: BigNumber

        let user_claims1: BigNumber[]
        let user_claims2: BigNumber[]

        beforeEach(async () => {

            board1 = IQuestBoard__factory.connect(BOARDS[0].board, provider);
            board2 = IQuestBoard__factory.connect(BOARDS[1].board, provider);
            await board1.connect(boardAdmin).updateDistributor(distributor1.address)
            await board2.connect(boardAdmin).updateDistributor(distributor2.address)

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                BOARDS[0].board,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                BOARDS[1].board,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                VALID_GAUGES[0].gauge,
                board1_id,
                ethers.utils.parseEther("0.5")
            )
            await controller.connect(admin).addNewGauge(
                VALID_GAUGES[1].gauge,
                board1_id,
                ethers.utils.parseEther("0.5")
            )
            await controller.connect(admin).addNewGauge(
                VALID_GAUGES[2].gauge,
                board2_id,
                ethers.utils.parseEther("0.2")
            )
            await controller.connect(admin).addNewGauge(
                VALID_GAUGES[3].gauge,
                board2_id,
                ethers.utils.parseEther("0.5")
            )

            await creator.connect(admin).addDistributor(distributor1.address)
            await creator.connect(admin).addDistributor(distributor2.address)

            await budget.connect(admin).updatePalWeeklyBudget(pal_budget)
            await budget.connect(admin).updateExtraWeeklyBudget(extra_budget)

            await pal.connect(admin).transfer(budget.address, pal_budget.mul(10))
            await extraToken.connect(admin).transfer(budget.address, extra_budget.mul(10))
            await creator.connect(admin).updatePeriod()

            await advanceTime(WEEK.toNumber())

            await creator.connect(admin).updatePeriod()

            await controller.connect(voter1).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge],
                vote_powers1
            )
            await controller.connect(voter2).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                vote_powers2
            )
            await controller.connect(voter3).voteForManyGaugeWeights(
                [VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                vote_powers3
            )

            await advanceTime(WEEK.toNumber())

            await creator.connect(admin).updatePeriod()

            await questRewardToken.connect(admin).approve(board1.address, total_rewards_amount.add(total_fees))
            await questRewardToken.connect(admin).approve(board2.address, total_rewards_amount2.add(total_fees2))

            quest_id1 = await board1.nextID()
            quest_id2 = await board2.nextID()

            await board1.connect(admin).createFixedQuest(
                VALID_GAUGES[0].gauge,
                questRewardToken.address,
                false,
                duration,
                reward_per_vote,
                total_rewards_amount,
                total_fees,
                0,
                0,
                []
            )

            await board2.connect(admin).createFixedQuest(
                VALID_GAUGES[2].gauge,
                questRewardToken.address,
                false,
                duration,
                reward_per_vote2,
                total_rewards_amount2,
                total_fees2,
                0,
                0,
                []
            )

            let current_period = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_period = current_period.div(WEEK).mul(WEEK)
            closed_period = current_period

            tree = new BalanceTree([
                { account: user1.address, amount: ethers.utils.parseEther("2000"), questID: quest_id1, period: current_period },
                { account: voter1.address, amount: ethers.utils.parseEther("800"), questID: quest_id1, period: current_period },
                { account: user3.address, amount: ethers.utils.parseEther("1200"), questID: quest_id1, period: current_period },
                { account: user4.address, amount: ethers.utils.parseEther("1000"), questID: quest_id1, period: current_period },
            ]); 
            tree_root = tree.getHexRoot()
            user_claims1 = [
                ethers.utils.parseEther("2000"),
                ethers.utils.parseEther("800"),
                ethers.utils.parseEther("1200"),
                ethers.utils.parseEther("1000"),
            ]

            tree2 = new BalanceTree([
                { account: user1.address, amount: ethers.utils.parseEther("1100"), questID: quest_id2, period: current_period },
                { account: voter2.address, amount: ethers.utils.parseEther("230"), questID: quest_id2, period: current_period },
                { account: user3.address, amount: ethers.utils.parseEther("900"), questID: quest_id2, period: current_period },
                { account: user4.address, amount: ethers.utils.parseEther("1270"), questID: quest_id2, period: current_period },
            ]); 
            tree_root2 = tree2.getHexRoot()
            user_claims2 = [
                ethers.utils.parseEther("1100"),
                ethers.utils.parseEther("230"),
                ethers.utils.parseEther("900"),
                ethers.utils.parseEther("1270"),
            ]

            // print zone - to remove

            /*const voter_1_balance = await power.balanceOf(voter1.address)
            const voter_2_balance = await power.balanceOf(voter2.address)
            const voter_3_balance = await power.balanceOf(voter3.address)
            const total_locked = await power.totalLocked()

            console.log(voter_1_balance, " - ", voter_1_balance.mul(10000).div(total_locked))
            console.log(voter_2_balance, " - ", voter_2_balance.mul(10000).div(total_locked))
            console.log(voter_3_balance, " - ", voter_3_balance.mul(10000).div(total_locked))
            console.log(total_locked)*/

        });

        it(' should allocate the correct amounts for Loot for the Quests', async () => {

            await advanceTime(WEEK.toNumber())

            const prev_budget_period = await creator.nextBudgetUpdatePeriod()

            const prev_period_allocated = await creator.allocatedBudgetHistory(closed_period)

            await board1.connect(boardAdmin).closeQuestPeriod(closed_period)
            await board2.connect(boardAdmin).closeQuestPeriod(closed_period)

            const tx = await board1.connect(boardAdmin).addMerkleRoot(quest_id1, closed_period, rewards_per_period, tree_root)
            await board2.connect(boardAdmin).addMerkleRoot(quest_id2, closed_period, rewards_per_period2, tree_root2)
            const tx_block = (await tx).blockNumber

            // check allocated amount for Quests rewards

            expect(await creator.totalQuestPeriodRewards(distributor1.address, quest_id1, closed_period)).to.be.eq(rewards_per_period)
            expect(await creator.totalQuestPeriodRewards(distributor2.address, quest_id2, closed_period)).to.be.eq(rewards_per_period2)
            expect(await creator.totalQuestPeriodSet(distributor1.address, quest_id1, closed_period)).to.be.true
            expect(await creator.totalQuestPeriodSet(distributor2.address, quest_id2, closed_period)).to.be.true

            expect(await creator.nextBudgetUpdatePeriod()).to.be.eq(prev_budget_period.add(WEEK))
            expect(await creator.periodBlockCheckpoint(prev_budget_period)).to.be.eq(tx_block)

            const period_budget = await creator.periodBudget(closed_period)

            const gauge_weight = await controller["getGaugeRelativeWeight(address,uint256)"](VALID_GAUGES[0].gauge, closed_period)

            const gauge_pal_amount = period_budget.palAmount.mul(gauge_weight).div(UNIT)
            const gauge_extra_amount = period_budget.extraAmount.mul(gauge_weight).div(UNIT)

            const gauge_pal_per_vote = gauge_pal_amount.mul(UNIT).div(rewards_per_period).mul(UNIT).div(MAX_MULTIPLIER)
            const gauge_extra_per_vote = gauge_extra_amount.mul(UNIT).div(rewards_per_period).mul(UNIT).div(MAX_MULTIPLIER)

            const gauge_budget = await creator.gaugeBudgetPerPeriod(VALID_GAUGES[0].gauge, closed_period)
            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id1, distributor1.address, closed_period)

            expect(gauge_budget.palAmount).to.be.eq(gauge_pal_amount)
            expect(gauge_budget.extraAmount).to.be.eq(gauge_extra_amount)
            expect(quest_allocation.palPerVote).to.be.eq(gauge_pal_per_vote)
            expect(quest_allocation.extraPerVote).to.be.eq(gauge_extra_per_vote)

            const gauge_weight2 = await controller["getGaugeRelativeWeight(address,uint256)"](VALID_GAUGES[2].gauge, closed_period)
            const gauge_cap2 = await controller.getGaugeCap(VALID_GAUGES[2].gauge)

            expect(gauge_weight2).to.be.gt(gauge_cap2)

            const gauge_pal_amount2 = period_budget.palAmount.mul(gauge_cap2).div(UNIT)
            const gauge_extra_amount2 = period_budget.extraAmount.mul(gauge_cap2).div(UNIT)

            const gauge_pal_per_vote2 = gauge_pal_amount2.mul(UNIT).div(rewards_per_period2).mul(UNIT).div(MAX_MULTIPLIER)
            const gauge_extra_per_vote2 = gauge_extra_amount2.mul(UNIT).div(rewards_per_period2).mul(UNIT).div(MAX_MULTIPLIER)

            const gauge_budget2 = await creator.gaugeBudgetPerPeriod(VALID_GAUGES[2].gauge, closed_period)
            const quest_allocation2 = await creator.getQuestAllocationForPeriod(quest_id2, distributor2.address, closed_period)

            expect(gauge_budget2.palAmount).to.be.eq(gauge_pal_amount2)
            expect(gauge_budget2.extraAmount).to.be.eq(gauge_extra_amount2)
            expect(quest_allocation2.palPerVote).to.be.eq(gauge_pal_per_vote2)
            expect(quest_allocation2.extraPerVote).to.be.eq(gauge_extra_per_vote2)

            const new_period_allocated = await creator.allocatedBudgetHistory(closed_period)

            expect(new_period_allocated.palAmount).to.be.eq(prev_period_allocated.palAmount.add(gauge_pal_amount).add(gauge_pal_amount2))
            expect(new_period_allocated.extraAmount).to.be.eq(prev_period_allocated.extraAmount.add(gauge_extra_amount).add(gauge_extra_amount2))
            
            expect(await creator.isGaugeAllocatedForPeriod(VALID_GAUGES[0].gauge, closed_period)).to.be.true
            expect(await creator.totalQuestPeriodSet(distributor1.address, quest_id1, closed_period)).to.be.true
            expect(await creator.totalQuestPeriodRewards(distributor1.address, quest_id1, closed_period)).to.be.eq(rewards_per_period)

            expect(await creator.isGaugeAllocatedForPeriod(VALID_GAUGES[2].gauge, closed_period)).to.be.true
            expect(await creator.totalQuestPeriodSet(distributor2.address, quest_id2, closed_period)).to.be.true
            expect(await creator.totalQuestPeriodRewards(distributor2.address, quest_id2, closed_period)).to.be.eq(rewards_per_period2)

        });

        it(' should set the correct amounts for users when claiming Quest rewards', async () => {

            await advanceTime(WEEK.toNumber())

            await board1.connect(boardAdmin).closeQuestPeriod(closed_period)
            await board2.connect(boardAdmin).closeQuestPeriod(closed_period)

            await board1.connect(boardAdmin).addMerkleRoot(quest_id1, closed_period, rewards_per_period, tree_root)
            await board2.connect(boardAdmin).addMerkleRoot(quest_id2, closed_period, rewards_per_period2, tree_root2)

            let proof = tree.getProof(quest_id1, closed_period, 0, user1.address, user_claims1[0]);
            await distributor1.connect(user1).claim(quest_id1, closed_period, 0, user1.address, user_claims1[0], proof)
            expect(await creator.userQuestPeriodRewards(distributor1.address, quest_id1, closed_period, user1.address)).to.be.eq(user_claims1[0])

            let proof2 = tree.getProof(quest_id1, closed_period, 1, voter1.address, user_claims1[1]);
            await distributor1.connect(voter1).claim(quest_id1, closed_period, 1, voter1.address, user_claims1[1], proof2)
            expect(await creator.userQuestPeriodRewards(distributor1.address, quest_id1, closed_period, voter1.address)).to.be.eq(user_claims1[1])

            let proof3 = tree2.getProof(quest_id2, closed_period, 0, user1.address, user_claims2[0]);
            await distributor2.connect(user1).claim(quest_id2, closed_period, 0, user1.address, user_claims2[0], proof3)
            expect(await creator.userQuestPeriodRewards(distributor2.address, quest_id2, closed_period, user1.address)).to.be.eq(user_claims2[0])

            let proof4 = tree2.getProof(quest_id2, closed_period, 1, voter2.address, user_claims2[1]);
            await distributor2.connect(voter2).claim(quest_id2, closed_period, 1, voter2.address, user_claims2[1], proof4)
            expect(await creator.userQuestPeriodRewards(distributor2.address, quest_id2, closed_period, voter2.address)).to.be.eq(user_claims2[1])

        });

        it(' should create the correct Loot for the user & claim it - half boost', async () => {

            await advanceTime(WEEK.toNumber())

            await board1.connect(boardAdmin).closeQuestPeriod(closed_period)
            await board2.connect(boardAdmin).closeQuestPeriod(closed_period)

            await board1.connect(boardAdmin).addMerkleRoot(quest_id1, closed_period, rewards_per_period, tree_root)
            await board2.connect(boardAdmin).addMerkleRoot(quest_id2, closed_period, rewards_per_period2, tree_root2)

            let proof = tree.getProof(quest_id1, closed_period, 1, voter1.address, user_claims1[1]);
            await distributor1.connect(voter1).claim(quest_id1, closed_period, 1, voter1.address, user_claims1[1], proof)
            
            // create the loot

            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id1, distributor1.address, closed_period)

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(voter1.address)).length

            const user_pal_power = await proxy.adjusted_balance_of_at(voter1.address, closed_period)
            const total_pal_power = await proxy.total_locked_at(
                await creator.periodBlockCheckpoint(closed_period)
            )

            const expcted_user_ratio = user_pal_power.mul(UNIT).div(total_pal_power).mul(UNIT).div(
                user_claims1[1].mul(UNIT).div(rewards_per_period)
            )
            const expcted_user_multiplier = expcted_user_ratio.mul(MAX_MULTIPLIER).div(UNIT)

            const expected_pal_amount = quest_allocation.palPerVote.mul(expcted_user_multiplier).div(UNIT).mul(user_claims1[1]).div(UNIT)
            const expected_extra_amount = quest_allocation.extraPerVote.mul(expcted_user_multiplier).div(UNIT).mul(user_claims1[1]).div(UNIT)

            const tx = await creator.connect(voter1).createLoot(
                voter1.address,
                distributor1.address,
                quest_id1,
                closed_period,
            )

            const new_user_loots = await loot.getAllUserLoot(voter1.address)

            const loot_id = new_user_loots[new_user_loots.length - 1].id

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count + 1)

            const new_loot = await loot.userLoots(voter1.address, loot_id)

            expect(new_loot.id).to.be.eq(loot_id)
            expect(new_loot.palAmount).to.be.eq(expected_pal_amount)
            expect(new_loot.extraAmount).to.be.eq(expected_extra_amount)
            expect(new_loot.startTs).to.be.eq(closed_period.add(WEEK))
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(voter1.address, loot_id, expected_pal_amount, expected_extra_amount, closed_period.add(WEEK))
            
            const undistributed_pal = quest_allocation.palPerVote.mul(MAX_MULTIPLIER.sub(expcted_user_multiplier)).div(UNIT).mul(user_claims1[1]).div(UNIT)
            const undistributed_extra = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER.sub(expcted_user_multiplier)).div(UNIT).mul(user_claims1[1]).div(UNIT)

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount.add(undistributed_pal))
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount.add(undistributed_extra))

            // claim the loot

            await advanceTime(vesting_duration.toNumber())

            const prev_pal_balance = await pal.balanceOf(voter1.address)
            const prev_extra_balance = await extraToken.balanceOf(voter1.address)

            const prev_slashed_total = (await creator.pengingBudget()).palAmount

            const tx2 = await loot.connect(voter1).claimLoot(loot_id, voter1.address)

            const loot_data = await loot.getLootData(voter1.address, loot_id)

            expect(loot_data.claimed).to.be.true

            const new_pal_balance = await pal.balanceOf(voter1.address)
            const new_extra_balance = await extraToken.balanceOf(voter1.address)

            expect(new_pal_balance).to.be.eq(prev_pal_balance.add(loot_data.palAmount))
            expect(new_extra_balance).to.be.eq(prev_extra_balance.add(loot_data.extraAmount))

            expect((await creator.pengingBudget()).palAmount).to.be.eq(prev_slashed_total)

            expect(tx2).to.emit(loot, 'LootClaimed').withArgs(voter1.address, loot_id, loot_data.palAmount, loot_data.extraAmount)


        });

        it(' should create the correct Loot for the user & claim it - full boost', async () => {

            await advanceTime(WEEK.toNumber())

            await board1.connect(boardAdmin).closeQuestPeriod(closed_period)
            await board2.connect(boardAdmin).closeQuestPeriod(closed_period)

            await board1.connect(boardAdmin).addMerkleRoot(quest_id1, closed_period, rewards_per_period, tree_root)
            await board2.connect(boardAdmin).addMerkleRoot(quest_id2, closed_period, rewards_per_period2, tree_root2)

            let proof = tree2.getProof(quest_id2, closed_period, 1, voter2.address, user_claims2[1]);
            await distributor2.connect(voter2).claim(quest_id2, closed_period, 1, voter2.address, user_claims2[1], proof)
            
            // create the loot

            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id2, distributor2.address, closed_period)

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(voter2.address)).length

            const expected_pal_amount = quest_allocation.palPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(user_claims2[1]).div(UNIT)
            const expected_extra_amount = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(user_claims2[1]).div(UNIT)

            const tx = await creator.connect(voter2).createLoot(
                voter2.address,
                distributor2.address,
                quest_id2,
                closed_period,
            )

            const new_user_loots = await loot.getAllUserLoot(voter2.address)

            const loot_id = new_user_loots[new_user_loots.length - 1].id

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count + 1)

            const new_loot = await loot.userLoots(voter2.address, loot_id)

            expect(new_loot.id).to.be.eq(loot_id)
            expect(new_loot.palAmount).to.be.eq(expected_pal_amount)
            expect(new_loot.extraAmount).to.be.eq(expected_extra_amount)
            expect(new_loot.startTs).to.be.eq(closed_period.add(WEEK))
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(voter2.address, loot_id, expected_pal_amount, expected_extra_amount, closed_period.add(WEEK))

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount)
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount)

            // claim the loot

            await advanceTime(vesting_duration.toNumber())

            const prev_pal_balance = await pal.balanceOf(voter2.address)
            const prev_extra_balance = await extraToken.balanceOf(voter2.address)

            const prev_slashed_total = (await creator.pengingBudget()).palAmount

            const tx2 = await loot.connect(voter2).claimLoot(loot_id, voter2.address)

            const loot_data = await loot.getLootData(voter2.address, loot_id)

            expect(loot_data.claimed).to.be.true

            const new_pal_balance = await pal.balanceOf(voter2.address)
            const new_extra_balance = await extraToken.balanceOf(voter2.address)

            expect(new_pal_balance).to.be.eq(prev_pal_balance.add(loot_data.palAmount))
            expect(new_extra_balance).to.be.eq(prev_extra_balance.add(loot_data.extraAmount))

            expect((await creator.pengingBudget()).palAmount).to.be.eq(prev_slashed_total)

            expect(tx2).to.emit(loot, 'LootClaimed').withArgs(voter2.address, loot_id, loot_data.palAmount, loot_data.extraAmount)

        });

        it(' should create the correct Loot for the user & claim it - no boost - full vesting', async () => {

            await advanceTime(WEEK.toNumber())

            await board1.connect(boardAdmin).closeQuestPeriod(closed_period)
            await board2.connect(boardAdmin).closeQuestPeriod(closed_period)

            await board1.connect(boardAdmin).addMerkleRoot(quest_id1, closed_period, rewards_per_period, tree_root)
            await board2.connect(boardAdmin).addMerkleRoot(quest_id2, closed_period, rewards_per_period2, tree_root2)

            let proof = tree.getProof(quest_id1, closed_period, 0, user1.address, user_claims1[0]);
            await distributor1.connect(user1).claim(quest_id1, closed_period, 0, user1.address, user_claims1[0], proof)
            
            // create the loot

            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id1, distributor1.address, closed_period)

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(user1.address)).length

            const expected_pal_amount = quest_allocation.palPerVote.mul(user_claims1[0]).div(UNIT)
            const expected_extra_amount = quest_allocation.extraPerVote.mul(user_claims1[0]).div(UNIT)

            const tx = await creator.connect(user1).createLoot(
                user1.address,
                distributor1.address,
                quest_id1,
                closed_period,
            )

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            const loot_id = new_user_loots[new_user_loots.length - 1].id

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count + 1)

            const new_loot = await loot.userLoots(user1.address, loot_id)

            expect(new_loot.id).to.be.eq(loot_id)
            expect(new_loot.palAmount).to.be.eq(expected_pal_amount)
            expect(new_loot.extraAmount).to.be.eq(expected_extra_amount)
            expect(new_loot.startTs).to.be.eq(closed_period.add(WEEK))
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, loot_id, expected_pal_amount, expected_extra_amount, closed_period.add(WEEK))
            
            const undistributed_pal = quest_allocation.palPerVote.mul(MAX_MULTIPLIER.sub(BASE_MULTIPLIER)).div(UNIT).mul(user_claims1[0]).div(UNIT)
            const undistributed_extra = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER.sub(BASE_MULTIPLIER)).div(UNIT).mul(user_claims1[0]).div(UNIT)

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount.add(undistributed_pal))
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount.add(undistributed_extra))

            // claim the loot

            await advanceTime(vesting_duration.toNumber())

            const prev_pal_balance = await pal.balanceOf(user1.address)
            const prev_extra_balance = await extraToken.balanceOf(user1.address)

            const prev_slashed_total = (await creator.pengingBudget()).palAmount

            const tx2 = await loot.connect(user1).claimLoot(loot_id, user1.address)

            const loot_data = await loot.getLootData(user1.address, loot_id)

            expect(loot_data.claimed).to.be.true

            const new_pal_balance = await pal.balanceOf(user1.address)
            const new_extra_balance = await extraToken.balanceOf(user1.address)

            expect(new_pal_balance).to.be.eq(prev_pal_balance.add(loot_data.palAmount))
            expect(new_extra_balance).to.be.eq(prev_extra_balance.add(loot_data.extraAmount))

            expect((await creator.pengingBudget()).palAmount).to.be.eq(prev_slashed_total)

            expect(tx2).to.emit(loot, 'LootClaimed').withArgs(user1.address, loot_id, loot_data.palAmount, loot_data.extraAmount)


        });

        it(' should create the correct Loot for the user & claim it - no boost - half vesting', async () => {

            await advanceTime(WEEK.toNumber())

            await board1.connect(boardAdmin).closeQuestPeriod(closed_period)
            await board2.connect(boardAdmin).closeQuestPeriod(closed_period)

            await board1.connect(boardAdmin).addMerkleRoot(quest_id1, closed_period, rewards_per_period, tree_root)
            await board2.connect(boardAdmin).addMerkleRoot(quest_id2, closed_period, rewards_per_period2, tree_root2)

            let proof = tree.getProof(quest_id1, closed_period, 0, user1.address, user_claims1[0]);
            await distributor1.connect(user1).claim(quest_id1, closed_period, 0, user1.address, user_claims1[0], proof)
            
            // create the loot

            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id1, distributor1.address, closed_period)

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(user1.address)).length

            const expected_pal_amount = quest_allocation.palPerVote.mul(user_claims1[0]).div(UNIT)
            const expected_extra_amount = quest_allocation.extraPerVote.mul(user_claims1[0]).div(UNIT)

            const tx = await creator.connect(user1).createLoot(
                user1.address,
                distributor1.address,
                quest_id1,
                closed_period,
            )

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            const loot_id = new_user_loots[new_user_loots.length - 1].id

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count + 1)

            const new_loot = await loot.userLoots(user1.address, loot_id)

            expect(new_loot.id).to.be.eq(loot_id)
            expect(new_loot.palAmount).to.be.eq(expected_pal_amount)
            expect(new_loot.extraAmount).to.be.eq(expected_extra_amount)
            expect(new_loot.startTs).to.be.eq(closed_period.add(WEEK))
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, loot_id, expected_pal_amount, expected_extra_amount, closed_period.add(WEEK))
            
            const undistributed_pal = quest_allocation.palPerVote.mul(MAX_MULTIPLIER.sub(BASE_MULTIPLIER)).div(UNIT).mul(user_claims1[0]).div(UNIT)
            const undistributed_extra = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER.sub(BASE_MULTIPLIER)).div(UNIT).mul(user_claims1[0]).div(UNIT)

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount.add(undistributed_pal))
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount.add(undistributed_extra))

            // claim the loot

            await advanceTime(WEEK.toNumber())

            const prev_pal_balance = await pal.balanceOf(user1.address)
            const prev_extra_balance = await extraToken.balanceOf(user1.address)

            const prev_slashed_total = (await creator.pengingBudget()).palAmount

            const tx2 = await loot.connect(user1).claimLoot(loot_id, user1.address)
            const tx_ts2 = BigNumber.from((await provider.getBlock((await tx2).blockNumber || 0)).timestamp)

            const loot_data = await loot.getLootData(user1.address, loot_id)

            expect(loot_data.claimed).to.be.true

            const expected_slash_amount = loot_data.palAmount.mul(loot_data.endTs.sub(tx_ts2)).div(vesting_duration)
            const claim_pal_amount = loot_data.palAmount.sub(expected_slash_amount)

            const new_pal_balance = await pal.balanceOf(user1.address)
            const new_extra_balance = await extraToken.balanceOf(user1.address)

            expect(new_pal_balance).to.be.eq(prev_pal_balance.add(claim_pal_amount))
            expect(new_extra_balance).to.be.eq(prev_extra_balance.add(loot_data.extraAmount))

            expect((await creator.pengingBudget()).palAmount).to.be.eq(prev_slashed_total.add(expected_slash_amount))

            expect(tx2).to.emit(loot, 'LootClaimed').withArgs(user1.address, loot_id, claim_pal_amount, loot_data.extraAmount)


        });

    });

});