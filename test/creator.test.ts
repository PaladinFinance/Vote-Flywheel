import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { LootCreator } from "./../typechain/contracts/LootCreator";
import { Loot } from "./../typechain/contracts/Loot";
import { MockVoteController } from "./../typechain/contracts/test/MockVoteController";
import { MockGauge } from "./../typechain/contracts/test/MockGauge";
import { MockDistributor } from "./../typechain/contracts/test/MockDistributor";
import { MockQuestBoard } from "./../typechain/contracts/test/MockQuestBoard";
import { MockPowerDelegation } from "./../typechain/contracts/test/MockPowerDelegation";
import { IERC20 } from "./../typechain/@openzeppelin/contracts/token/ERC20/IERC20";
import { IERC20__factory } from "./../typechain/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

import {
    advanceTime,
    resetFork,
    getERC20
} from "./utils/utils";

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

const WEEK = BigNumber.from(86400 * 7)

let creatorFactory: ContractFactory
let lootFactory: ContractFactory
let gaugeFactory: ContractFactory
let controllerFactory: ContractFactory
let distributorFactory: ContractFactory
let boardFactory: ContractFactory
let powerFactory: ContractFactory

const PAL_ADDRESS = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"
const PAL_HOLDER = "0x830B63eA52CCcf241A329F3932B4cfCf17287ed7"
const PAL_AMOUNT = ethers.utils.parseEther("500000")

const EXTRA_ADDRESS = "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e"
const EXTRA_HOLDER = "0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b"
const EXTRA_AMOUNT = ethers.utils.parseEther("250")

const MAX_MULTIPLIER = ethers.utils.parseEther("5")
const BASE_MULTIPLIER = ethers.utils.parseEther("1")
const UNIT = ethers.utils.parseEther("1")

describe('LootCreator contract tests', () => {
    let admin: SignerWithAddress

    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress

    let reserve: SignerWithAddress

    let creator: LootCreator
    let loot: Loot

    let controller: MockVoteController
    let gauge: MockGauge
    let distributor: MockDistributor
    let board: MockQuestBoard
    let power: MockPowerDelegation

    let pal: IERC20
    let extraToken: IERC20

    let questGauge1: SignerWithAddress
    let questGauge2: SignerWithAddress
    let questGauge3: SignerWithAddress

    let otherGauge: SignerWithAddress

    let otherDistrib1: SignerWithAddress
    let otherDistrib2: SignerWithAddress

    const vesting_duration = BigNumber.from(86400 * 7 * 2)

    before(async () => {
        await resetFork();

        [admin, user1, user2, user3, reserve, questGauge1, questGauge2, questGauge3, otherGauge, otherDistrib1, otherDistrib2] = await ethers.getSigners();

        lootFactory = await ethers.getContractFactory("Loot");
        creatorFactory = await ethers.getContractFactory("LootCreator");
        controllerFactory = await ethers.getContractFactory("MockVoteController");
        gaugeFactory = await ethers.getContractFactory("MockGauge");
        distributorFactory = await ethers.getContractFactory("MockDistributor");
        boardFactory = await ethers.getContractFactory("MockQuestBoard");
        powerFactory = await ethers.getContractFactory("MockPowerDelegation");

        pal = IERC20__factory.connect(PAL_ADDRESS, provider)
        extraToken = IERC20__factory.connect(EXTRA_ADDRESS, provider)

        await getERC20(admin, PAL_HOLDER, pal, admin.address, PAL_AMOUNT);
        await getERC20(admin, EXTRA_HOLDER, extraToken, admin.address, EXTRA_AMOUNT);

    });

    beforeEach(async () => {

        controller = (await controllerFactory.deploy()) as MockVoteController;
        await controller.deployed()

        power = (await powerFactory.deploy()) as MockPowerDelegation;
        await power.deployed()

        board = (await boardFactory.deploy()) as MockQuestBoard;
        await board.deployed()

        distributor = (await distributorFactory.deploy(board.address)) as MockDistributor;
        await distributor.deployed()

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
            power.address
        )) as LootCreator
        await creator.deployed()

        gauge = (await gaugeFactory.deploy(
            pal.address,
            extraToken.address,
            creator.address,
            reserve.address
        )) as MockGauge
        await gauge.deployed()

        await loot.connect(admin).setInitialLootCreator(creator.address)

        await controller.connect(admin).addGauge(questGauge1.address, 0)
        await controller.connect(admin).addGauge(questGauge2.address, 0)
        await controller.connect(admin).addGauge(questGauge3.address, ethers.utils.parseEther('0.05'))

        await pal.connect(reserve).approve(loot.address, ethers.constants.MaxUint256)
        await extraToken.connect(reserve).approve(loot.address, ethers.constants.MaxUint256)

    });

    it(' should be deployed correctly', async () => {
        expect(creator.address).to.properAddress

        expect(await creator.loot()).to.be.eq(loot.address)
        expect(await creator.lootVoteController()).to.be.eq(controller.address)
        expect(await creator.holyPower()).to.be.eq(power.address)

        const current_ts = BigNumber.from(await ethers.provider.getBlock('latest').then(b => b.timestamp))
        expect(await creator.nextBudgetUpdatePeriod()).to.be.eq(current_ts.add(WEEK).div(WEEK).mul(WEEK))
        
        expect(await creator.lootGauge()).to.be.eq(ethers.constants.AddressZero)

        expect((await creator.pengingBudget()).palAmount).to.be.eq(0)
        expect((await creator.pengingBudget()).extraAmount).to.be.eq(0)

    });

    describe('init', async () => {

        it(' should set the creator correctly', async () => {

            expect(await creator.lootGauge()).to.be.eq(ethers.constants.AddressZero)

            await creator.connect(admin).init(gauge.address)

            expect(await creator.lootGauge()).to.be.eq(gauge.address)

        });

        it(' should fail if already set', async () => {

            await creator.connect(admin).init(gauge.address)
            
            await expect(
                creator.connect(admin).init(user3.address)
            ).to.be.revertedWith("AlreadyInitialized")

        });

        it(' should fail if given address 0x0', async () => {
            
            await expect(
                creator.connect(admin).init(ethers.constants.AddressZero)
            ).to.be.revertedWith("AddressZero")

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                creator.connect(user1).init(gauge.address)
            ).to.be.reverted
            
            await expect(
                creator.connect(reserve).init(gauge.address)
            ).to.be.reverted

        });

    });

    describe('addDistributor', async () => {

        it(' should list the distributor correctly', async () => {

            expect(await creator.allowedDistributors(distributor.address)).to.be.false
            expect((await creator.getListedDistributors()).length).to.be.eq(0)

            const tx = await creator.connect(admin).addDistributor(distributor.address)

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(1)

            await expect(tx).to.emit(creator, 'NewDistributorListed').withArgs(distributor.address)

        });

        it(' should allow to list multiple distributors', async () => {

            expect(await creator.allowedDistributors(distributor.address)).to.be.false
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.false
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.false
            expect((await creator.getListedDistributors()).length).to.be.eq(0)

            const tx1 = await creator.connect(admin).addDistributor(distributor.address)

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.false
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.false
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(1)

            await expect(tx1).to.emit(creator, 'NewDistributorListed').withArgs(distributor.address)

            const tx2 = await creator.connect(admin).addDistributor(otherDistrib1.address)

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.false
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect(await creator.distributors(1)).to.be.eq(otherDistrib1.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(2)

            await expect(tx2).to.emit(creator, 'NewDistributorListed').withArgs(otherDistrib1.address)

            const tx3 = await creator.connect(admin).addDistributor(otherDistrib2.address)

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.true
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect(await creator.distributors(1)).to.be.eq(otherDistrib1.address)
            expect(await creator.distributors(2)).to.be.eq(otherDistrib2.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(3)

            await expect(tx3).to.emit(creator, 'NewDistributorListed').withArgs(otherDistrib2.address)

        });

        it(' should fail if distributor already listed', async () => {

            await creator.connect(admin).addDistributor(distributor.address)

            await expect(
                creator.connect(admin).addDistributor(distributor.address)
            ).to.be.revertedWith("AlreadyListed")

        });

        it(' should fail if given an incorrect parameter', async () => {

            await expect(
                creator.connect(admin).addDistributor(ethers.constants.AddressZero)
            ).to.be.revertedWith("AddressZero")

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                creator.connect(reserve).addDistributor(distributor.address)
            ).to.be.reverted

            await expect(
                creator.connect(user1).addDistributor(distributor.address)
            ).to.be.reverted

        });

    });

    describe('removeDistributor', async () => {

        beforeEach(async () => {

            await creator.connect(admin).addDistributor(distributor.address)
            await creator.connect(admin).addDistributor(otherDistrib1.address)
            await creator.connect(admin).addDistributor(otherDistrib2.address)

        });

        it(' should remove the distributor correctly', async () => {

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.true
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect(await creator.distributors(1)).to.be.eq(otherDistrib1.address)
            expect(await creator.distributors(2)).to.be.eq(otherDistrib2.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(3)

            const tx = await creator.connect(admin).removeDistributor(otherDistrib1.address)

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.false
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.true
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect(await creator.distributors(1)).to.be.eq(otherDistrib2.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(2)
            expect(await creator.getListedDistributors()).not.to.include(otherDistrib1.address)

            await expect(tx).to.emit(creator, 'DistributorUnlisted').withArgs(otherDistrib1.address)

        });

        it(' should remove multiple distributor correctly', async () => {

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.true
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect(await creator.distributors(1)).to.be.eq(otherDistrib1.address)
            expect(await creator.distributors(2)).to.be.eq(otherDistrib2.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(3)

            const tx = await creator.connect(admin).removeDistributor(otherDistrib1.address)

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.false
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.true
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect(await creator.distributors(1)).to.be.eq(otherDistrib2.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(2)
            expect(await creator.getListedDistributors()).not.to.include(otherDistrib1.address)

            await expect(tx).to.emit(creator, 'DistributorUnlisted').withArgs(otherDistrib1.address)

            const tx2 = await creator.connect(admin).removeDistributor(otherDistrib2.address)

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.false
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.false
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(1)
            expect(await creator.getListedDistributors()).not.to.include(otherDistrib2.address)

            await expect(tx2).to.emit(creator, 'DistributorUnlisted').withArgs(otherDistrib2.address)

        });

        it(' should allow to re-list a distributor after being removed', async () => {

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.true
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect(await creator.distributors(1)).to.be.eq(otherDistrib1.address)
            expect(await creator.distributors(2)).to.be.eq(otherDistrib2.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(3)

            await creator.connect(admin).removeDistributor(otherDistrib1.address)

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.false
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.true
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect(await creator.distributors(1)).to.be.eq(otherDistrib2.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(2)
            expect(await creator.getListedDistributors()).not.to.include(otherDistrib1.address)

            await creator.connect(admin).addDistributor(otherDistrib1.address)

            expect(await creator.allowedDistributors(distributor.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib1.address)).to.be.true
            expect(await creator.allowedDistributors(otherDistrib2.address)).to.be.true
            expect(await creator.distributors(0)).to.be.eq(distributor.address)
            expect(await creator.distributors(1)).to.be.eq(otherDistrib2.address)
            expect(await creator.distributors(2)).to.be.eq(otherDistrib1.address)
            expect((await creator.getListedDistributors()).length).to.be.eq(3)

        });

        it(' should fail if the distributor is not listed', async () => {

            await expect(
                creator.connect(admin).removeDistributor(reserve.address)
            ).to.be.revertedWith("NotListed")

        });

        it(' should fail if given an incorrect parameter', async () => {

            await expect(
                creator.connect(admin).removeDistributor(ethers.constants.AddressZero)
            ).to.be.revertedWith("AddressZero")

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                creator.connect(reserve).removeDistributor(distributor.address)
            ).to.be.reverted

            await expect(
                creator.connect(user1).removeDistributor(distributor.address)
            ).to.be.reverted

        });

    });

    describe('notifyNewBudget', async () => {

        beforeEach(async () => {

            await creator.connect(admin).init(otherGauge.address)

            await creator.connect(admin).addDistributor(distributor.address)

        });

        it(' should update the pending budget correctly', async () => {

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("3500")

            const prev_pending_budget = await creator.pengingBudget()

            await creator.connect(otherGauge).notifyNewBudget(pal_amount, extra_amount)

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount.add(pal_amount))
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount.add(extra_amount))

        });

        it(' should update the pending budget correctly just for one token', async () => {

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0")

            const prev_pending_budget = await creator.pengingBudget()

            await creator.connect(otherGauge).notifyNewBudget(pal_amount, extra_amount)

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount.add(pal_amount))
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount)

        });

        it(' should only be allowed for the gauge', async () => {

            await expect(
                creator.connect(reserve).notifyNewBudget(ethers.utils.parseEther("2150"), ethers.utils.parseEther("3500"))
            ).to.be.revertedWith('CallerNotAllowed')

        });

    });

    describe('updatePeriod', async () => {

        let period: BigNumber

        beforeEach(async () => {

            await creator.connect(admin).init(gauge.address)

            await creator.connect(admin).addDistributor(distributor.address)

            await advanceTime(WEEK.toNumber())

            period = await creator.nextBudgetUpdatePeriod()

        });

        it(' should update the period correctly - no pending budget', async () => {

            const prev_period = await creator.nextBudgetUpdatePeriod()

            const tx = await creator.connect(admin).updatePeriod()
            const tx_block = (await tx).blockNumber

            const new_period = await creator.nextBudgetUpdatePeriod()

            expect(new_period).to.be.eq(prev_period.add(WEEK))

            const new_pending_budget = await creator.pengingBudget()
            expect(new_pending_budget.palAmount).to.be.eq(0)
            expect(new_pending_budget.extraAmount).to.be.eq(0)
            
            expect(await creator.periodBlockCheckpoint(prev_period)).to.be.eq(tx_block)

        });

        it(' should update the period correctly - with pending budget', async () => {

            await creator.connect(admin).updatePeriod()

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).sendLootBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period.sub(WEEK)

            const tx = await creator.connect(admin).updatePeriod()
            const tx_block = (await tx).blockNumber

            const new_period = await creator.nextBudgetUpdatePeriod()

            expect(new_period).to.be.eq(prev_period.add(WEEK))

            const new_pending_budget = await creator.pengingBudget()
            expect(new_pending_budget.palAmount).to.be.eq(0)
            expect(new_pending_budget.extraAmount).to.be.eq(0)

            const new_period_budget = await creator.periodBudget(prev_period)
            expect(new_period_budget.palAmount).to.be.eq(pal_amount)
            expect(new_period_budget.extraAmount).to.be.eq(extra_amount)
            
            expect(await creator.periodBlockCheckpoint(prev_period)).to.be.eq(tx_block)

        });

        it(' should pull the budget and update the period', async () => {

            await creator.connect(admin).updatePeriod()

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period.sub(WEEK)

            const tx = await creator.connect(admin).updatePeriod()
            const tx_block = (await tx).blockNumber

            const new_period = await creator.nextBudgetUpdatePeriod()

            expect(new_period).to.be.eq(prev_period.add(WEEK))

            const new_pending_budget = await creator.pengingBudget()
            expect(new_pending_budget.palAmount).to.be.eq(0)
            expect(new_pending_budget.extraAmount).to.be.eq(0)

            const new_period_budget = await creator.periodBudget(prev_period)
            expect(new_period_budget.palAmount).to.be.eq(pal_amount)
            expect(new_period_budget.extraAmount).to.be.eq(extra_amount)
            
            expect(await creator.periodBlockCheckpoint(prev_period)).to.be.eq(tx_block)

        });

        it(' should update the period and use the previous unspent budget', async () => {

            await board.connect(admin).addQuest(1, questGauge1.address)
            await board.connect(admin).addQuest(2, questGauge2.address)
            await board.connect(admin).addQuest(3, questGauge3.address)
            
            await creator.connect(admin).updatePeriod()

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).sendLootBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())
            
            await creator.connect(admin).updatePeriod()

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).sendLootBudget(pal_amount, extra_amount)

            period = (await creator.nextBudgetUpdatePeriod()).sub(WEEK)

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, ethers.utils.parseEther("0.25"))
            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, ethers.utils.parseEther("0.2"))

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                1,
                period,
                ethers.utils.parseEther("2500")
            )
            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                2,
                period,
                ethers.utils.parseEther("1750")
            )

            await advanceTime(WEEK.toNumber())
            
            await creator.connect(admin).updatePeriod()

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).sendLootBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()

            const past_period_budget = await creator.periodBudget(prev_period.sub(WEEK.mul(2)))
            const past_period_allocated = await creator.allocatedBudgetHistory(prev_period.sub(WEEK.mul(2)))

            expect(past_period_allocated.palAmount).not.to.be.eq(0)
            expect(past_period_allocated.extraAmount).not.to.be.eq(0)

            const tx = await creator.connect(admin).updatePeriod()
            const tx_block = (await tx).blockNumber

            const new_period = await creator.nextBudgetUpdatePeriod()

            expect(new_period).to.be.eq(prev_period.add(WEEK))

            const new_pending_budget = await creator.pengingBudget()
            expect(new_pending_budget.palAmount).to.be.eq(0)
            expect(new_pending_budget.extraAmount).to.be.eq(0)

            const new_period_budget = await creator.periodBudget(prev_period)
            expect(new_period_budget.palAmount).to.be.eq(pal_amount.add(
                past_period_budget.palAmount.sub(past_period_allocated.palAmount)
            ))
            expect(new_period_budget.extraAmount).to.be.eq(extra_amount.add(
                past_period_budget.extraAmount.sub(past_period_allocated.extraAmount)
            ))
            
            expect(await creator.periodBlockCheckpoint(prev_period)).to.be.eq(tx_block)

        });

    });

    describe('notifyDistributedQuestPeriod', async () => {

        let period: BigNumber

        const quest_id = 1

        const total_rewards = ethers.utils.parseEther("2500")

        const gauge_weight = ethers.utils.parseEther("0.15")

        beforeEach(async () => {

            await creator.connect(admin).init(gauge.address)

            await creator.connect(admin).addDistributor(distributor.address)

            await advanceTime(WEEK.toNumber())

            period = await creator.nextBudgetUpdatePeriod()

            await board.connect(admin).addQuest(quest_id, questGauge1.address)

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

        });
        
        it(' should update the period correctly if needed', async () => {

            await creator.connect(admin).updatePeriod()

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period.sub(WEEK)

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, gauge_weight)

            const tx = await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )
            const tx_block = (await tx).blockNumber

            expect(await creator.nextBudgetUpdatePeriod()).to.be.eq(prev_period.add(WEEK))
            expect(await creator.periodBlockCheckpoint(prev_period)).to.be.eq(tx_block)

        });

        it(' should allocate a budget for the gauge based on current budget & gauge weight', async () => {

            await creator.connect(admin).updatePeriod()

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, gauge_weight)

            const prev_period_allocated = await creator.allocatedBudgetHistory(period)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )

            const period_budget = await creator.periodBudget(period)

            const UNIT = ethers.utils.parseEther("1")

            const gauge_pal_amount = period_budget.palAmount.mul(gauge_weight).div(UNIT)
            const gauge_extra_amount = period_budget.extraAmount.mul(gauge_weight).div(UNIT)

            const gauge_budget = await creator.gaugeBudgetPerPeriod(questGauge1.address, period)

            expect(gauge_budget.palAmount).to.be.eq(gauge_pal_amount)
            expect(gauge_budget.extraAmount).to.be.eq(gauge_extra_amount)

            const new_period_allocated = await creator.allocatedBudgetHistory(period)

            expect(new_period_allocated.palAmount).to.be.eq(prev_period_allocated.palAmount.add(gauge_pal_amount))
            expect(new_period_allocated.extraAmount).to.be.eq(prev_period_allocated.extraAmount.add(gauge_extra_amount))
            
            expect(await creator.isGaugeAllocatedForPeriod(questGauge1.address, period)).to.be.true
            expect(await creator.totalQuestPeriodSet(distributor.address, quest_id, period)).to.be.true
            expect(await creator.totalQuestPeriodRewards(distributor.address, quest_id, period)).to.be.eq(total_rewards)
        });

        it(' should not allocate based on gauge cap if weight exceeds it', async () => {

            const bigger_gauge_weight = ethers.utils.parseEther("0.5")
            const gauge_cap = ethers.utils.parseEther("0.25")

            await creator.connect(admin).updatePeriod()

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, bigger_gauge_weight)

            const prev_period_allocated = await creator.allocatedBudgetHistory(period)

            const prev_pending_budget = await creator.pengingBudget()

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )

            const period_budget = await creator.periodBudget(period)

            const UNIT = ethers.utils.parseEther("1")

            const over_cap_pal_amount = period_budget.palAmount.mul(bigger_gauge_weight).div(UNIT)
            const over_cap_extra_amount = period_budget.extraAmount.mul(bigger_gauge_weight).div(UNIT)

            const gauge_pal_amount = period_budget.palAmount.mul(gauge_cap).div(UNIT)
            const gauge_extra_amount = period_budget.extraAmount.mul(gauge_cap).div(UNIT)

            const unused_pal_amount = over_cap_pal_amount.sub(gauge_pal_amount)
            const unused_extra_amount = over_cap_extra_amount.sub(gauge_extra_amount)

            const gauge_budget = await creator.gaugeBudgetPerPeriod(questGauge1.address, period)

            expect(gauge_budget.palAmount).to.be.eq(gauge_pal_amount)
            expect(gauge_budget.extraAmount).to.be.eq(gauge_extra_amount)

            const new_period_allocated = await creator.allocatedBudgetHistory(period)

            expect(new_period_allocated.palAmount).to.be.eq(prev_period_allocated.palAmount.add(over_cap_pal_amount))
            expect(new_period_allocated.extraAmount).to.be.eq(prev_period_allocated.extraAmount.add(over_cap_extra_amount))

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount.add(unused_pal_amount))
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount.add(unused_extra_amount))
            
            expect(await creator.isGaugeAllocatedForPeriod(questGauge1.address, period)).to.be.true
            expect(await creator.totalQuestPeriodSet(distributor.address, quest_id, period)).to.be.true
            expect(await creator.totalQuestPeriodRewards(distributor.address, quest_id, period)).to.be.eq(total_rewards)

        });

        it(' should not allocate more if already set for the gauge', async () => {

            await creator.connect(admin).updatePeriod()

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, gauge_weight)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )

            const prev_period_allocated = await creator.allocatedBudgetHistory(period)
            const prev_gauge_budget = await creator.gaugeBudgetPerPeriod(questGauge1.address, period)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )

            expect(await creator.gaugeBudgetPerPeriod(questGauge1.address, period)).to.be.deep.eq(prev_gauge_budget)
            expect(await creator.allocatedBudgetHistory(period)).to.be.deep.eq(prev_period_allocated)

        });

        it(' should not allocate if the gauge is not listed', async () => {

            const prev_period_allocated = await creator.allocatedBudgetHistory(period)
            const prev_gauge_budget = await creator.gaugeBudgetPerPeriod(questGauge1.address, period)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                52,
                period,
                total_rewards
            )

            expect(await creator.gaugeBudgetPerPeriod(questGauge1.address, period)).to.be.deep.eq(prev_gauge_budget)
            expect(await creator.allocatedBudgetHistory(period)).to.be.deep.eq(prev_period_allocated)

            expect((await creator.gaugeBudgetPerPeriod(questGauge1.address, period)).palAmount).to.be.eq(0)
            expect((await creator.gaugeBudgetPerPeriod(questGauge1.address, period)).extraAmount).to.be.eq(0)

        });

    });

    describe('getQuestAllocationForPeriod', async () => {

        let period: BigNumber

        const quest_id = 1
        const quest_id2 = 2
        const quest_id3 = 3

        const total_rewards = ethers.utils.parseEther("2500")
        const total_rewards2 = ethers.utils.parseEther("1700")

        const gauge_weight = ethers.utils.parseEther("0.15")
        const gauge_weight2 = ethers.utils.parseEther("0.10")

        beforeEach(async () => {

            await creator.connect(admin).init(gauge.address)

            await creator.connect(admin).addDistributor(distributor.address)

            await advanceTime(WEEK.toNumber())

            period = await creator.nextBudgetUpdatePeriod()

            await board.connect(admin).addQuest(quest_id, questGauge1.address)
            await board.connect(admin).addQuest(quest_id2, questGauge1.address)
            await board.connect(admin).addQuest(quest_id3, questGauge3.address)

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await creator.connect(admin).updatePeriod()

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period

            await board.connect(admin).addQuestIdForGaugePerPeriod(period, questGauge1.address, [quest_id, quest_id2])
            await board.connect(admin).addQuestIdForGaugePerPeriod(period, questGauge2.address, [quest_id3])

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, gauge_weight)
            await controller.connect(admin).setGaugeWeightAt(questGauge2.address, period, gauge_weight2)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id3,
                period,
                total_rewards2
            )

        });

        it(' should return the full gauge allocation if there is only 1 Quest on the gauge', async () => {

            const gauge_budget = await creator.getGaugeBudgetForPeriod(questGauge2.address, period)

            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id3, distributor.address, period)

            const quest_total_rewards_period = await creator.totalQuestPeriodRewards(distributor.address, quest_id3, period)

            const pal_per_vote = gauge_budget.palAmount.mul(UNIT).div(quest_total_rewards_period).mul(UNIT).div(MAX_MULTIPLIER)
            const extra_per_vote = gauge_budget.extraAmount.mul(UNIT).div(quest_total_rewards_period).mul(UNIT).div(MAX_MULTIPLIER)

            expect(quest_allocation.palPerVote).to.be.eq(pal_per_vote)
            expect(quest_allocation.extraPerVote).to.be.eq(extra_per_vote)
            
        });

        it(' should split the gauge allocation if there is multiple Quests on the gauge', async () => {

            const gauge_budget = await creator.getGaugeBudgetForPeriod(questGauge1.address, period)

            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id, distributor.address, period)

            const quest_total_rewards_period = await creator.totalQuestPeriodRewards(distributor.address, quest_id, period)

            const pal_per_vote = gauge_budget.palAmount.div(2).mul(UNIT).div(quest_total_rewards_period).mul(UNIT).div(MAX_MULTIPLIER)
            const extra_per_vote = gauge_budget.extraAmount.div(2).mul(UNIT).div(quest_total_rewards_period).mul(UNIT).div(MAX_MULTIPLIER)

            expect(quest_allocation.palPerVote).to.be.eq(pal_per_vote)
            expect(quest_allocation.extraPerVote).to.be.eq(extra_per_vote)

        });

    });

    describe('notifyQuestClaim', async () => {

        let period: BigNumber

        const quest_id = 1

        const total_rewards = ethers.utils.parseEther("2500")

        const gauge_weight = ethers.utils.parseEther("0.15")

        const claim_amount = ethers.utils.parseEther("750")

        beforeEach(async () => {

            await creator.connect(admin).init(gauge.address)

            await creator.connect(admin).addDistributor(distributor.address)

            await advanceTime(WEEK.toNumber())

            period = await creator.nextBudgetUpdatePeriod()

            await board.connect(admin).addQuest(quest_id, questGauge1.address)

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await creator.connect(admin).updatePeriod()

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period

            await board.connect(admin).addQuestIdForGaugePerPeriod(period, questGauge1.address, [quest_id])

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, gauge_weight)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )

        });

        it(' should notify the claim correctly', async () => {

            expect(await creator.userQuestPeriodRewards(distributor.address, quest_id, period, user1.address)).to.be.eq(0)

            await distributor.connect(admin).sendNotifyQuestClaim(
                creator.address,
                user1.address,
                quest_id,
                period,
                claim_amount
            )

            expect(await creator.userQuestPeriodRewards(distributor.address, quest_id, period, user1.address)).to.be.eq(claim_amount)

        });

        it(' should notify multiple claims of same user correctly (in case of fixed period)', async () => {

            const extra_claim_amount = ethers.utils.parseEther("125")

            expect(await creator.userQuestPeriodRewards(distributor.address, quest_id, period, user1.address)).to.be.eq(0)

            await distributor.connect(admin).sendNotifyQuestClaim(
                creator.address,
                user1.address,
                quest_id,
                period,
                claim_amount
            )

            expect(await creator.userQuestPeriodRewards(distributor.address, quest_id, period, user1.address)).to.be.eq(claim_amount)

            await distributor.connect(admin).sendNotifyQuestClaim(
                creator.address,
                user1.address,
                quest_id,
                period,
                extra_claim_amount
            )

            expect(await creator.userQuestPeriodRewards(distributor.address, quest_id, period, user1.address)).to.be.eq(claim_amount.add(extra_claim_amount))

        });

        it(' should only be allowed for listed distributor', async () => {

            await expect(
                creator.connect(reserve).notifyQuestClaim(
                    user1.address,
                    quest_id,
                    period,
                    claim_amount
                )
            ).to.be.revertedWith("CallerNotAllowed")

            await expect(
                creator.connect(user1).notifyQuestClaim(
                    user1.address,
                    quest_id,
                    period,
                    claim_amount
                )
            ).to.be.revertedWith("CallerNotAllowed")

        });

    });

    describe('createLoot', async () => {

        let period: BigNumber

        const quest_id = 1

        const total_rewards = ethers.utils.parseEther("2500")

        const gauge_weight = ethers.utils.parseEther("0.15")

        const claim_amount = ethers.utils.parseEther("750")

        const total_hPal_power = ethers.utils.parseEther("500000")

        const user_power_half = ethers.utils.parseEther("75000")
        const user_power_cap = ethers.utils.parseEther("150000")
        const user_power_over = ethers.utils.parseEther("200000")

        beforeEach(async () => {

            await creator.connect(admin).init(gauge.address)

            await creator.connect(admin).addDistributor(distributor.address)

            await advanceTime(WEEK.toNumber())

            period = await creator.nextBudgetUpdatePeriod()

            await board.connect(admin).addQuest(quest_id, questGauge1.address)

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await creator.connect(admin).updatePeriod()

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period

            await board.connect(admin).addQuestIdForGaugePerPeriod(period, questGauge1.address, [quest_id])

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, gauge_weight)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )

            await power.connect(admin).setTotalLockedAt(
                await creator.periodBlockCheckpoint(period),
                total_hPal_power
            )

            await distributor.connect(admin).sendNotifyQuestClaim(
                creator.address,
                user1.address,
                quest_id,
                period,
                claim_amount
            )

        });

        it(' should create the Loot correctly - no hPAL Boost', async () => {

            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id, distributor.address, period)

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(user1.address)).length

            const expected_pal_amount = quest_allocation.palPerVote.mul(claim_amount).div(UNIT)
            const expected_extra_amount = quest_allocation.extraPerVote.mul(claim_amount).div(UNIT)

            const tx = await creator.connect(user1).createLoot(
                user1.address,
                distributor.address,
                quest_id,
                period,
            )

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            const loot_id = new_user_loots[new_user_loots.length - 1].id

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count + 1)

            const new_loot = await loot.userLoots(user1.address, loot_id)

            expect(new_loot.id).to.be.eq(loot_id)
            expect(new_loot.palAmount).to.be.eq(expected_pal_amount)
            expect(new_loot.extraAmount).to.be.eq(expected_extra_amount)
            expect(new_loot.startTs).to.be.eq(period.add(WEEK))
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, loot_id, expected_pal_amount, expected_extra_amount, period.add(WEEK))
            
            const undistributed_pal = quest_allocation.palPerVote.mul(MAX_MULTIPLIER.sub(BASE_MULTIPLIER)).div(UNIT).mul(claim_amount).div(UNIT)
            const undistributed_extra = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER.sub(BASE_MULTIPLIER)).div(UNIT).mul(claim_amount).div(UNIT)

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount.add(undistributed_pal))
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount.add(undistributed_extra))

        });

        it(' should create the Loot correctly - half hPAL Boost', async () => {

            await power.connect(admin).setAdjustedBalanceAt(user1.address, period, user_power_half)

            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id, distributor.address, period)

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(user1.address)).length

            const expcted_user_ratio = user_power_half.mul(UNIT).div(total_hPal_power).mul(UNIT).div(
                claim_amount.mul(UNIT).div(total_rewards)
            )
            const expcted_user_multiplier = expcted_user_ratio.mul(MAX_MULTIPLIER).div(UNIT)

            const expected_pal_amount = quest_allocation.palPerVote.mul(expcted_user_multiplier).div(UNIT).mul(claim_amount).div(UNIT)
            const expected_extra_amount = quest_allocation.extraPerVote.mul(expcted_user_multiplier).div(UNIT).mul(claim_amount).div(UNIT)

            const tx = await creator.connect(user1).createLoot(
                user1.address,
                distributor.address,
                quest_id,
                period,
            )

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            const loot_id = new_user_loots[new_user_loots.length - 1].id

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count + 1)

            const new_loot = await loot.userLoots(user1.address, loot_id)

            expect(new_loot.id).to.be.eq(loot_id)
            expect(new_loot.palAmount).to.be.eq(expected_pal_amount)
            expect(new_loot.extraAmount).to.be.eq(expected_extra_amount)
            expect(new_loot.startTs).to.be.eq(period.add(WEEK))
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, loot_id, expected_pal_amount, expected_extra_amount, period.add(WEEK))
            
            const undistributed_pal = quest_allocation.palPerVote.mul(MAX_MULTIPLIER.sub(expcted_user_multiplier)).div(UNIT).mul(claim_amount).div(UNIT)
            const undistributed_extra = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER.sub(expcted_user_multiplier)).div(UNIT).mul(claim_amount).div(UNIT)

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount.add(undistributed_pal))
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount.add(undistributed_extra))
        });

        it(' should create the Loot correctly - full hPAL Boost', async () => {

            await power.connect(admin).setAdjustedBalanceAt(user1.address, period, user_power_cap)

            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id, distributor.address, period)

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(user1.address)).length

            const expected_pal_amount = quest_allocation.palPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(claim_amount).div(UNIT)
            const expected_extra_amount = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(claim_amount).div(UNIT)

            const tx = await creator.connect(user1).createLoot(
                user1.address,
                distributor.address,
                quest_id,
                period,
            )

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            const loot_id = new_user_loots[new_user_loots.length - 1].id

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count + 1)

            const new_loot = await loot.userLoots(user1.address, loot_id)

            expect(new_loot.id).to.be.eq(loot_id)
            expect(new_loot.palAmount).to.be.eq(expected_pal_amount)
            expect(new_loot.extraAmount).to.be.eq(expected_extra_amount)
            expect(new_loot.startTs).to.be.eq(period.add(WEEK))
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, loot_id, expected_pal_amount, expected_extra_amount, period.add(WEEK))

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount)
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount)

        });

        it(' should create the Loot correctly - over hPAL Boost', async () => {

            await power.connect(admin).setAdjustedBalanceAt(user1.address, period, user_power_over)

            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id, distributor.address, period)

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(user1.address)).length

            const expected_pal_amount = quest_allocation.palPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(claim_amount).div(UNIT)
            const expected_extra_amount = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(claim_amount).div(UNIT)

            const tx = await creator.connect(user1).createLoot(
                user1.address,
                distributor.address,
                quest_id,
                period,
            )

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            const loot_id = new_user_loots[new_user_loots.length - 1].id

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count + 1)

            const new_loot = await loot.userLoots(user1.address, loot_id)

            expect(new_loot.id).to.be.eq(loot_id)
            expect(new_loot.palAmount).to.be.eq(expected_pal_amount)
            expect(new_loot.extraAmount).to.be.eq(expected_extra_amount)
            expect(new_loot.startTs).to.be.eq(period.add(WEEK))
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, loot_id, expected_pal_amount, expected_extra_amount, period.add(WEEK))

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount)
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount)

        });

        it(' should not create if no rewards claimed from this Quest period', async () => {

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(user1.address)).length

            const tx = await creator.connect(user1).createLoot(
                user1.address,
                distributor.address,
                quest_id,
                period.sub(WEEK),
            )

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count)

            expect(tx).not.to.emit(loot, 'LootCreated')

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount)
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount)

        });

        it(' should not create if the given gauge is not listed', async () => {

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(user1.address)).length

            const tx = await creator.connect(user1).createLoot(
                user1.address,
                distributor.address,
                55,
                period,
            )

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count)

            expect(tx).not.to.emit(loot, 'LootCreated')

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount)
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount)

        });

        it(' should not create if the given distributor is not listed', async () => {

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(user1.address)).length

            const tx = await creator.connect(user1).createLoot(
                user1.address,
                otherDistrib1.address,
                quest_id,
                period,
            )

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count)

            expect(tx).not.to.emit(loot, 'LootCreated')

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount)
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount)

        });

        it(' should distribute all the rewards of the period if all users have max boost', async () => {

            const claim_amount2 = claim_amount.mul(2)
            const claim_amount3 = total_rewards.sub(claim_amount).sub(claim_amount2)

            await distributor.connect(admin).sendNotifyQuestClaim(
                creator.address,
                user2.address,
                quest_id,
                period,
                claim_amount2
            )

            await distributor.connect(admin).sendNotifyQuestClaim(
                creator.address,
                user3.address,
                quest_id,
                period,
                claim_amount3
            )

            await power.connect(admin).setAdjustedBalanceAt(user1.address, period, user_power_over)
            await power.connect(admin).setAdjustedBalanceAt(user2.address, period, user_power_over.mul(2))
            await power.connect(admin).setAdjustedBalanceAt(user3.address, period, user_power_over)

            const gauge_allocation = await creator.getGaugeBudgetForPeriod(questGauge1.address, period)
            const quest_allocation = await creator.getQuestAllocationForPeriod(quest_id, distributor.address, period)

            const prev_pending_budget = await creator.pengingBudget()

            const expected_pal_amount1 = quest_allocation.palPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(claim_amount).div(UNIT)
            const expected_extra_amount1 = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(claim_amount).div(UNIT)

            const expected_pal_amount2 = quest_allocation.palPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(claim_amount2).div(UNIT)
            const expected_extra_amount2 = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(claim_amount2).div(UNIT)

            const expected_pal_amount3 = quest_allocation.palPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(claim_amount3).div(UNIT)
            const expected_extra_amount3 = quest_allocation.extraPerVote.mul(MAX_MULTIPLIER).div(UNIT).mul(claim_amount3).div(UNIT)

            const tx = await creator.connect(user1).createLoot(
                user1.address,
                distributor.address,
                quest_id,
                period,
            )

            const tx2 = await creator.connect(user2).createLoot(
                user2.address,
                distributor.address,
                quest_id,
                period,
            )

            const tx3 = await creator.connect(user3).createLoot(
                user3.address,
                distributor.address,
                quest_id,
                period,
            )

            const new_user1_loots = await loot.getAllUserLoot(user1.address)
            const loot_id1 = new_user1_loots[new_user1_loots.length - 1].id
            const new_loot1 = await loot.userLoots(user1.address, loot_id1)

            expect(new_loot1.id).to.be.eq(loot_id1)
            expect(new_loot1.palAmount).to.be.eq(expected_pal_amount1)
            expect(new_loot1.extraAmount).to.be.eq(expected_extra_amount1)
            expect(new_loot1.startTs).to.be.eq(period.add(WEEK))
            expect(new_loot1.claimed).to.be.false

            const new_user2_loots = await loot.getAllUserLoot(user2.address)
            const loot_id2 = new_user2_loots[new_user2_loots.length - 1].id
            const new_loot2 = await loot.userLoots(user2.address, loot_id2)

            expect(new_loot2.id).to.be.eq(loot_id2)
            expect(new_loot2.palAmount).to.be.eq(expected_pal_amount2)
            expect(new_loot2.extraAmount).to.be.eq(expected_extra_amount2)
            expect(new_loot2.startTs).to.be.eq(period.add(WEEK))
            expect(new_loot2.claimed).to.be.false

            const new_user3_loots = await loot.getAllUserLoot(user3.address)
            const loot_id3 = new_user3_loots[new_user3_loots.length - 1].id
            const new_loot3 = await loot.userLoots(user3.address, loot_id3)

            expect(new_loot3.id).to.be.eq(loot_id3)
            expect(new_loot3.palAmount).to.be.eq(expected_pal_amount3)
            expect(new_loot3.extraAmount).to.be.eq(expected_extra_amount3)
            expect(new_loot3.startTs).to.be.eq(period.add(WEEK))
            expect(new_loot3.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, loot_id1, expected_pal_amount1, expected_extra_amount1, period.add(WEEK))
            expect(tx2).to.emit(loot, 'LootCreated').withArgs(user2.address, loot_id2, expected_pal_amount2, expected_extra_amount2, period.add(WEEK))
            expect(tx3).to.emit(loot, 'LootCreated').withArgs(user3.address, loot_id3, expected_pal_amount3, expected_extra_amount3, period.add(WEEK))

            expect(gauge_allocation.palAmount).to.be.eq(expected_pal_amount1.add(expected_pal_amount2).add(expected_pal_amount3))
            expect(gauge_allocation.extraAmount).to.be.eq(expected_extra_amount1.add(expected_extra_amount2).add(expected_extra_amount3))

        });

    });

    describe('createMultipleLoot', async () => {

        let period: BigNumber
        let period2: BigNumber
        let period3: BigNumber

        const quest_id = 1

        const total_rewards = ethers.utils.parseEther("2500")
        const total_rewards2 = ethers.utils.parseEther("2500")
        const total_rewards3 = ethers.utils.parseEther("2500")

        const gauge_weight = ethers.utils.parseEther("0.15")
        const gauge_weight2 = ethers.utils.parseEther("0.14")
        const gauge_weight3 = ethers.utils.parseEther("0.17")

        const claim_amount = ethers.utils.parseEther("750")
        const claim_amount2 = ethers.utils.parseEther("730")
        const claim_amount3 = ethers.utils.parseEther("700")

        const total_hPal_power = ethers.utils.parseEther("500000")
        const total_hPal_power2 = ethers.utils.parseEther("510000")
        const total_hPal_power3 = ethers.utils.parseEther("590000")

        const user_power = ethers.utils.parseEther("75000")
        const user_power2 = ethers.utils.parseEther("74000")
        const user_power3 = ethers.utils.parseEther("72000")

        beforeEach(async () => {

            await creator.connect(admin).init(gauge.address)

            await creator.connect(admin).addDistributor(distributor.address)

            await advanceTime(WEEK.toNumber())

            period = await creator.nextBudgetUpdatePeriod()

            await board.connect(admin).addQuest(quest_id, questGauge1.address)

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await creator.connect(admin).updatePeriod()

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period
            period2 = prev_period.add(WEEK)
            period3 = prev_period.add(WEEK.mul(2))

            await board.connect(admin).addQuestIdForGaugePerPeriod(period, questGauge1.address, [quest_id])

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, gauge_weight)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )

            await power.connect(admin).setTotalLockedAt(
                await creator.periodBlockCheckpoint(period),
                total_hPal_power
            )

            await distributor.connect(admin).sendNotifyQuestClaim(
                creator.address,
                user1.address,
                quest_id,
                period,
                claim_amount
            )

            await advanceTime(WEEK.toNumber())

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await creator.connect(admin).updatePeriod()

            await board.connect(admin).addQuestIdForGaugePerPeriod(period2, questGauge1.address, [quest_id])

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period2, gauge_weight2)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period2,
                total_rewards2
            )

            await power.connect(admin).setTotalLockedAt(
                await creator.periodBlockCheckpoint(period2),
                total_hPal_power2
            )

            await distributor.connect(admin).sendNotifyQuestClaim(
                creator.address,
                user1.address,
                quest_id,
                period2,
                claim_amount2
            )

            await advanceTime(WEEK.toNumber())

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await creator.connect(admin).updatePeriod()

            await board.connect(admin).addQuestIdForGaugePerPeriod(period3, questGauge1.address, [quest_id])

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period3, gauge_weight3)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period3,
                total_rewards3
            )

            await power.connect(admin).setTotalLockedAt(
                await creator.periodBlockCheckpoint(period3),
                total_hPal_power3
            )

            await distributor.connect(admin).sendNotifyQuestClaim(
                creator.address,
                user1.address,
                quest_id,
                period3,
                claim_amount3
            )

            await power.connect(admin).setAdjustedBalanceAt(user1.address, period, user_power)
            await power.connect(admin).setAdjustedBalanceAt(user1.address, period2, user_power2)
            await power.connect(admin).setAdjustedBalanceAt(user1.address, period3, user_power3)

        });

        it(' should create all the Loot at once correctly', async () => {

            // before

            const prev_pending_budget = await creator.pengingBudget()

            const prev_user_loot_count = (await loot.getAllUserLoot(user1.address)).length

            // create the Loots

            const claim_params = [
                {
                    'distributor': distributor.address,
                    'questId': quest_id,
                    'period': period,
                },
                {
                    'distributor': distributor.address,
                    'questId': quest_id,
                    'period': period2,
                },
                {
                    'distributor': distributor.address,
                    'questId': quest_id,
                    'period': period3,
                }
            ]

            const tx = await creator.connect(user1).createMultipleLoot(
                user1.address,
                claim_params
            )
            
            // general

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            expect(new_user_loots.length).to.be.eq(prev_user_loot_count + 3)


            // loot 1

            const quest_allocation1 = await creator.getQuestAllocationForPeriod(quest_id, distributor.address, period)
            
            const expcted_user_ratio1 = user_power.mul(UNIT).div(total_hPal_power).mul(UNIT).div(
                claim_amount.mul(UNIT).div(total_rewards)
            )
            const expcted_user_multiplier1 = expcted_user_ratio1.mul(MAX_MULTIPLIER).div(UNIT)

            const expected_pal_amount1 = quest_allocation1.palPerVote.mul(expcted_user_multiplier1).div(UNIT).mul(claim_amount).div(UNIT)
            const expected_extra_amount1 = quest_allocation1.extraPerVote.mul(expcted_user_multiplier1).div(UNIT).mul(claim_amount).div(UNIT)

            const loot_id1 = new_user_loots[new_user_loots.length - 3].id

            const new_loot1 = await loot.userLoots(user1.address, loot_id1)

            expect(new_loot1.id).to.be.eq(loot_id1)
            expect(new_loot1.palAmount).to.be.eq(expected_pal_amount1)
            expect(new_loot1.extraAmount).to.be.eq(expected_extra_amount1)
            expect(new_loot1.startTs).to.be.eq(period.add(WEEK))
            expect(new_loot1.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, loot_id1, expected_pal_amount1, expected_extra_amount1, period.add(WEEK))
            
            const undistributed_pal1 = quest_allocation1.palPerVote.mul(MAX_MULTIPLIER.sub(expcted_user_multiplier1)).div(UNIT).mul(claim_amount).div(UNIT)
            const undistributed_extra1 = quest_allocation1.extraPerVote.mul(MAX_MULTIPLIER.sub(expcted_user_multiplier1)).div(UNIT).mul(claim_amount).div(UNIT)

            
            // loot 2

            const quest_allocation2 = await creator.getQuestAllocationForPeriod(quest_id, distributor.address, period2)
            
            const expcted_user_ratio2 = user_power2.mul(UNIT).div(total_hPal_power2).mul(UNIT).div(
                claim_amount2.mul(UNIT).div(total_rewards2)
            )
            const expcted_user_multiplier2 = expcted_user_ratio2.mul(MAX_MULTIPLIER).div(UNIT)

            const expected_pal_amount2 = quest_allocation2.palPerVote.mul(expcted_user_multiplier2).div(UNIT).mul(claim_amount2).div(UNIT)
            const expected_extra_amount2 = quest_allocation2.extraPerVote.mul(expcted_user_multiplier2).div(UNIT).mul(claim_amount2).div(UNIT)

            const loot_id2 = new_user_loots[new_user_loots.length - 2].id

            const new_loot2 = await loot.userLoots(user1.address, loot_id2)

            expect(new_loot2.id).to.be.eq(loot_id2)
            expect(new_loot2.palAmount).to.be.eq(expected_pal_amount2)
            expect(new_loot2.extraAmount).to.be.eq(expected_extra_amount2)
            expect(new_loot2.startTs).to.be.eq(period2.add(WEEK))
            expect(new_loot2.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, loot_id2, expected_pal_amount2, expected_extra_amount2, period2.add(WEEK))
            
            const undistributed_pal2 = quest_allocation2.palPerVote.mul(MAX_MULTIPLIER.sub(expcted_user_multiplier2)).div(UNIT).mul(claim_amount2).div(UNIT)
            const undistributed_extra2 = quest_allocation2.extraPerVote.mul(MAX_MULTIPLIER.sub(expcted_user_multiplier2)).div(UNIT).mul(claim_amount2).div(UNIT)
            

            // loot 3

            const quest_allocation3 = await creator.getQuestAllocationForPeriod(quest_id, distributor.address, period3)
            
            const expcted_user_ratio3 = user_power3.mul(UNIT).div(total_hPal_power3).mul(UNIT).div(
                claim_amount3.mul(UNIT).div(total_rewards3)
            )
            const expcted_user_multiplier3 = expcted_user_ratio3.mul(MAX_MULTIPLIER).div(UNIT)

            const expected_pal_amount3 = quest_allocation3.palPerVote.mul(expcted_user_multiplier3).div(UNIT).mul(claim_amount3).div(UNIT)
            const expected_extra_amount3 = quest_allocation3.extraPerVote.mul(expcted_user_multiplier3).div(UNIT).mul(claim_amount3).div(UNIT)

            const loot_id3 = new_user_loots[new_user_loots.length - 1].id

            const new_loot3 = await loot.userLoots(user1.address, loot_id3)

            expect(new_loot3.id).to.be.eq(loot_id3)
            expect(new_loot3.palAmount).to.be.eq(expected_pal_amount3)
            expect(new_loot3.extraAmount).to.be.eq(expected_extra_amount3)
            expect(new_loot3.startTs).to.be.eq(period3.add(WEEK))
            expect(new_loot3.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, loot_id3, expected_pal_amount3, expected_extra_amount3, period3.add(WEEK))
            
            const undistributed_pal3 = quest_allocation3.palPerVote.mul(MAX_MULTIPLIER.sub(expcted_user_multiplier3)).div(UNIT).mul(claim_amount3).div(UNIT)
            const undistributed_extra3 = quest_allocation3.extraPerVote.mul(MAX_MULTIPLIER.sub(expcted_user_multiplier3)).div(UNIT).mul(claim_amount3).div(UNIT)


            // general 2

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(
                prev_pending_budget.palAmount.add(undistributed_pal1).add(undistributed_pal2).add(undistributed_pal3)
            )
            expect(new_pending_budget.extraAmount).to.be.eq(
                prev_pending_budget.extraAmount.add(undistributed_extra1).add(undistributed_extra2).add(undistributed_extra3)
            )
            

        });

    });

    describe('notifyUndistributedRewards', async () => {

        let period: BigNumber

        const quest_id = 1

        const total_rewards = ethers.utils.parseEther("2500")

        const gauge_weight = ethers.utils.parseEther("0.15")

        const claim_amount = ethers.utils.parseEther("750")

        const total_hPal_power = ethers.utils.parseEther("500000")

        let loot_id: BigNumber

        beforeEach(async () => {

            await creator.connect(admin).init(gauge.address)

            await creator.connect(admin).addDistributor(distributor.address)

            await advanceTime(WEEK.toNumber())

            period = await creator.nextBudgetUpdatePeriod()

            await board.connect(admin).addQuest(quest_id, questGauge1.address)

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await creator.connect(admin).updatePeriod()

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period

            await board.connect(admin).addQuestIdForGaugePerPeriod(period, questGauge1.address, [quest_id])

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, gauge_weight)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )

            await power.connect(admin).setTotalLockedAt(
                await creator.periodBlockCheckpoint(period),
                total_hPal_power
            )

            await distributor.connect(admin).sendNotifyQuestClaim(
                creator.address,
                user1.address,
                quest_id,
                period,
                claim_amount
            )

            await creator.connect(user1).createLoot(
                user1.address,
                distributor.address,
                quest_id,
                period,
            )

            await advanceTime(WEEK.toNumber())

            const user_loots = await loot.getAllUserLoot(user1.address)
            loot_id = (user_loots[user_loots.length - 1]).id

        });

        it(' should add the slashed pal amount to the pending budget correctly', async () => {

            const prev_pending_budget = await creator.pengingBudget()

            const tx = await loot.connect(user1).claimLoot(loot_id, user1.address)
            const tx_ts = BigNumber.from((await provider.getBlock((await tx).blockNumber || 0)).timestamp)

            const loot_data = await loot.getLootData(user1.address, loot_id)

            const expected_slash_amount = loot_data.palAmount.mul(loot_data.endTs.sub(tx_ts)).div(vesting_duration)

            const new_pending_budget = await creator.pengingBudget()

            expect(new_pending_budget.palAmount).to.be.eq(prev_pending_budget.palAmount.add(expected_slash_amount))
            expect(new_pending_budget.extraAmount).to.be.eq(prev_pending_budget.extraAmount)

        });

    });

    describe('notifyAddedRewardsQuestPeriod', async () => {

        let period: BigNumber

        const quest_id = 1

        const total_rewards = ethers.utils.parseEther("2500")
        const added_rewards = ethers.utils.parseEther("475")

        const gauge_weight = ethers.utils.parseEther("0.15")

        beforeEach(async () => {

            await creator.connect(admin).init(gauge.address)

            await creator.connect(admin).addDistributor(distributor.address)

            await advanceTime(WEEK.toNumber())

            period = await creator.nextBudgetUpdatePeriod()

            await board.connect(admin).addQuest(quest_id, questGauge1.address)

            const pal_amount = ethers.utils.parseEther("2150")
            const extra_amount = ethers.utils.parseEther("0.005")

            await pal.connect(admin).transfer(gauge.address, pal_amount)
            await extraToken.connect(admin).transfer(gauge.address, extra_amount)

            await gauge.connect(admin).addBudget(pal_amount, extra_amount)

            await creator.connect(admin).updatePeriod()

            await advanceTime(WEEK.toNumber())

            const prev_period = await creator.nextBudgetUpdatePeriod()
            period = prev_period

            await controller.connect(admin).setGaugeWeightAt(questGauge1.address, period, gauge_weight)

            await distributor.connect(admin).sendNotifyDistributedQuestPeriod(
                creator.address,
                quest_id,
                period,
                total_rewards
            )

        });

        it(' should update the storage corectly', async () => {

            const prev_total_quest_period = await creator.totalQuestPeriodRewards(distributor.address, quest_id, period)

            await distributor.connect(admin).sendNotifyAddedRewardsQuestPeriod(creator.address, quest_id, period, added_rewards)

            const new_total_quest_period = await creator.totalQuestPeriodRewards(distributor.address, quest_id, period)

            expect(new_total_quest_period).to.be.eq(prev_total_quest_period.add(added_rewards))

        });

        it(' should not update if given 0', async () => {

            const prev_total_quest_period = await creator.totalQuestPeriodRewards(distributor.address, quest_id, period)

            await distributor.connect(admin).sendNotifyAddedRewardsQuestPeriod(creator.address, quest_id, period, 0)

            const new_total_quest_period = await creator.totalQuestPeriodRewards(distributor.address, quest_id, period)

            expect(new_total_quest_period).to.be.eq(prev_total_quest_period)

        });

        it(' should fail if caller is not allowed', async () => {

            await expect(
                creator.connect(user1).notifyAddedRewardsQuestPeriod(quest_id, period, added_rewards)
            ).to.be.revertedWith("CallerNotAllowed")

            await expect(
                creator.connect(admin).notifyAddedRewardsQuestPeriod(quest_id, period, added_rewards)
            ).to.be.revertedWith("CallerNotAllowed")

        });

    });

});