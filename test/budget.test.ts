import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { LootBudget } from "../typechain/contracts/LootBudget";
import { MockCreator } from "../typechain/contracts/test/MockCreator";
import { IERC20 } from "../typechain/@openzeppelin/contracts/token/ERC20/IERC20";
import { IERC20__factory } from "../typechain/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";
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

let budgetFactory: ContractFactory
let creatorFactory: ContractFactory

const PAL_ADDRESS = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"
const PAL_HOLDER = "0x830B63eA52CCcf241A329F3932B4cfCf17287ed7"
const PAL_AMOUNT = ethers.utils.parseEther("500000")

const EXTRA_ADDRESS = "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e"
const EXTRA_HOLDER = "0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b"
const EXTRA_AMOUNT = ethers.utils.parseEther("250")

describe('LootBudget contract tests', () => {
    let admin: SignerWithAddress

    let lootReserve: SignerWithAddress
    let loot: SignerWithAddress

    let otherUser: SignerWithAddress

    let budget: LootBudget

    let lootCreator: MockCreator

    let pal: IERC20
    let extraToken: IERC20
    
    let new_creator: SignerWithAddress

    const pal_budget = ethers.utils.parseEther("1200")
    const extra_budget = ethers.utils.parseEther("0.01")

    const pal_limit = ethers.utils.parseEther("4500")
    const extra_limit = ethers.utils.parseEther("0.5")


    before(async () => {
        await resetFork();

        [admin, lootReserve, loot, otherUser, new_creator] = await ethers.getSigners();

        budgetFactory = await ethers.getContractFactory("LootBudget");
        creatorFactory = await ethers.getContractFactory("MockCreator");

        pal = IERC20__factory.connect(PAL_ADDRESS, provider)
        extraToken = IERC20__factory.connect(EXTRA_ADDRESS, provider)

        await getERC20(admin, PAL_HOLDER, pal, admin.address, PAL_AMOUNT);
        await getERC20(admin, EXTRA_HOLDER, extraToken, admin.address, EXTRA_AMOUNT);

    })

    beforeEach(async () => {

        lootCreator = (await creatorFactory.connect(admin).deploy(
            loot.address
        )) as MockCreator
        await lootCreator.deployed()

        budget = (await budgetFactory.connect(admin).deploy(
            pal.address,
            extraToken.address,
            lootCreator.address,
            lootReserve.address,
            pal_budget,
            extra_budget,
            pal_limit,
            extra_limit
        )) as LootBudget
        await budget.deployed()

        await pal.connect(admin).transfer(budget.address, PAL_AMOUNT.div(20))
        await extraToken.connect(admin).transfer(budget.address, EXTRA_AMOUNT.div(20))

    });

    it(' should be deployed correctly', async () => {
        expect(budget.address).to.properAddress

        expect(await budget.pal()).to.be.eq(pal.address)
        expect(await budget.extraToken()).to.be.eq(extraToken.address)
        
        expect(await budget.lootCreator()).to.be.eq(lootCreator.address)
        expect(await budget.lootReserve()).to.be.eq(lootReserve.address)
        
        expect(await budget.palWeeklyBudget()).to.be.eq(pal_budget)
        expect(await budget.extraWeeklyBudget()).to.be.eq(extra_budget)

    });

    describe('updateLootBudget', async () => {

        beforeEach(async () => {

            await pal.connect(admin).transfer(budget.address, pal_budget.mul(5))
            await extraToken.connect(admin).transfer(budget.address, extra_budget.mul(5))

        });

        it(' should transfer the budget from to the Reserve correctly & notify the Creator', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const prev_pal_balance = await pal.balanceOf(lootReserve.address)
            const prev_extra_balance = await extraToken.balanceOf(lootReserve.address)

            const prev_pal_balance_budget = await pal.balanceOf(budget.address)
            const prev_extra_balance_budget = await extraToken.balanceOf(budget.address)

            const prev_pal_budget = await lootCreator.palBudget()
            const prev_extra_budget = await lootCreator.extraBudget()

            expect(await budget.periodBudgetClaimed(current_ts)).to.be.false

            const tx = await budget.connect(loot).updateLootBudget()

            expect(await pal.balanceOf(lootReserve.address)).to.be.eq(prev_pal_balance.add(pal_budget))
            expect(await extraToken.balanceOf(lootReserve.address)).to.be.eq(prev_extra_balance.add(extra_budget))

            expect(await pal.balanceOf(budget.address)).to.be.eq(prev_pal_balance_budget.sub(pal_budget))
            expect(await extraToken.balanceOf(budget.address)).to.be.eq(prev_extra_balance_budget.sub(extra_budget))

            expect(await lootCreator.palBudget()).to.be.eq(prev_pal_budget.add(pal_budget))
            expect(await lootCreator.extraBudget()).to.be.eq(prev_extra_budget.add(extra_budget))

            expect(await budget.periodBudgetClaimed(current_ts)).to.be.true

            expect(tx).to.emit(pal, "Transfer").withArgs(budget.address, lootReserve.address, pal_budget)
            expect(tx).to.emit(extraToken, "Transfer").withArgs(budget.address, lootReserve.address, extra_budget)

        });

        it(' should not transfer any budget if already did for the current period', async () => {

            await budget.connect(loot).updateLootBudget()

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const prev_pal_balance = await pal.balanceOf(lootReserve.address)
            const prev_extra_balance = await extraToken.balanceOf(lootReserve.address)

            const prev_pal_balance_budget = await pal.balanceOf(budget.address)
            const prev_extra_balance_budget = await extraToken.balanceOf(budget.address)

            const prev_pal_budget = await lootCreator.palBudget()
            const prev_extra_budget = await lootCreator.extraBudget()

            expect(await budget.periodBudgetClaimed(current_ts)).to.be.true

            const tx = await budget.connect(loot).updateLootBudget()

            expect(await pal.balanceOf(lootReserve.address)).to.be.eq(prev_pal_balance)
            expect(await extraToken.balanceOf(lootReserve.address)).to.be.eq(prev_extra_balance)

            expect(await pal.balanceOf(budget.address)).to.be.eq(prev_pal_balance_budget)
            expect(await extraToken.balanceOf(budget.address)).to.be.eq(prev_extra_balance_budget)

            expect(await lootCreator.palBudget()).to.be.eq(prev_pal_budget)
            expect(await lootCreator.extraBudget()).to.be.eq(prev_extra_budget)

            expect(await budget.periodBudgetClaimed(current_ts)).to.be.true

            expect(tx).not.to.emit(pal, "Transfer")
            expect(tx).not.to.emit(extraToken, "Transfer")

        });

        it(' should only transfer PAL budget if the extra budget is set to 0', async () => {

            await budget.connect(admin).updateExtraWeeklyBudget(0)

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const prev_pal_balance = await pal.balanceOf(lootReserve.address)
            const prev_extra_balance = await extraToken.balanceOf(lootReserve.address)

            const prev_pal_balance_budget = await pal.balanceOf(budget.address)
            const prev_extra_balance_budget = await extraToken.balanceOf(budget.address)

            const prev_pal_budget = await lootCreator.palBudget()
            const prev_extra_budget = await lootCreator.extraBudget()

            expect(await budget.periodBudgetClaimed(current_ts)).to.be.false

            const tx = await budget.connect(loot).updateLootBudget()

            expect(await pal.balanceOf(lootReserve.address)).to.be.eq(prev_pal_balance.add(pal_budget))
            expect(await extraToken.balanceOf(lootReserve.address)).to.be.eq(prev_extra_balance)

            expect(await pal.balanceOf(budget.address)).to.be.eq(prev_pal_balance_budget.sub(pal_budget))
            expect(await extraToken.balanceOf(budget.address)).to.be.eq(prev_extra_balance_budget)

            expect(await lootCreator.palBudget()).to.be.eq(prev_pal_budget.add(pal_budget))
            expect(await lootCreator.extraBudget()).to.be.eq(prev_extra_budget)

            expect(await budget.periodBudgetClaimed(current_ts)).to.be.true

            expect(tx).to.emit(pal, "Transfer").withArgs(budget.address, lootReserve.address, pal_budget)
            expect(tx).not.to.emit(extraToken, "Transfer").withArgs(budget.address, lootReserve.address, extra_budget)

        });

    });

    describe('updatePalWeeklyBudget', async () => {

        const new_budget = ethers.utils.parseEther("500")

        it(' should list the budget correctly', async () => {

            expect(await budget.palWeeklyBudget()).to.be.eq(pal_budget)

            const tx = await budget.connect(admin).updatePalWeeklyBudget(new_budget)

            expect(await budget.palWeeklyBudget()).to.be.eq(new_budget)

            await expect(tx).to.emit(budget, 'PalWeeklyBudgetUpdated').withArgs(pal_budget, new_budget)

        });

        it(' should fail if over the limit', async () => {

            await expect(
                budget.connect(admin).updatePalWeeklyBudget(ethers.utils.parseEther("7500"))
            ).to.be.revertedWith('LootBudgetExceedLimit')

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                budget.connect(otherUser).updatePalWeeklyBudget(new_budget)
            ).to.be.reverted

            await expect(
                budget.connect(loot).updatePalWeeklyBudget(new_budget)
            ).to.be.reverted

        });

    });

    describe('updateExtraWeeklyBudget', async () => {

        const new_budget = ethers.utils.parseEther("0.005")

        it(' should list the budget correctly', async () => {

            expect(await budget.extraWeeklyBudget()).to.be.eq(extra_budget)

            const tx = await budget.connect(admin).updateExtraWeeklyBudget(new_budget)

            expect(await budget.extraWeeklyBudget()).to.be.eq(new_budget)

            await expect(tx).to.emit(budget, 'ExtraWeeklyBudgetUpdated').withArgs(extra_budget, new_budget)

        });

        it(' should fail if over the limit', async () => {

            await expect(
                budget.connect(admin).updateExtraWeeklyBudget(ethers.utils.parseEther("0.75"))
            ).to.be.revertedWith('LootBudgetExceedLimit')

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                budget.connect(otherUser).updateExtraWeeklyBudget(new_budget)
            ).to.be.reverted

            await expect(
                budget.connect(loot).updateExtraWeeklyBudget(new_budget)
            ).to.be.reverted

        });

    });

    describe('setPalWeeklyLimit', async () => {

        const new_limit = ethers.utils.parseEther("7500")

        it(' should update the limit correctly', async () => {

            expect(await budget.palWeeklyLimit()).to.be.eq(pal_limit)

            const tx = await budget.connect(admin).setPalWeeklyLimit(new_limit)

            expect(await budget.palWeeklyLimit()).to.be.eq(new_limit)

            await expect(tx).to.emit(budget, 'PalWeeklyLimitUpdated').withArgs(pal_limit, new_limit)

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                budget.connect(otherUser).setPalWeeklyLimit(new_limit)
            ).to.be.reverted

            await expect(
                budget.connect(loot).setPalWeeklyLimit(new_limit)
            ).to.be.reverted

        });

    });

    describe('setExtraWeeklyLimit', async () => {

        const new_limit = ethers.utils.parseEther("0.75")

        it(' should update the limit correctly', async () => {

            expect(await budget.extraWeeklyLimit()).to.be.eq(extra_limit)

            const tx = await budget.connect(admin).setExtraWeeklyLimit(new_limit)

            expect(await budget.extraWeeklyLimit()).to.be.eq(new_limit)

            await expect(tx).to.emit(budget, 'ExtraWeeklyLimitUpdated').withArgs(extra_limit, new_limit)

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                budget.connect(otherUser).setExtraWeeklyLimit(new_limit)
            ).to.be.reverted

            await expect(
                budget.connect(loot).setExtraWeeklyLimit(new_limit)
            ).to.be.reverted

        });

    });
    
    describe('updateLootCreator', async () => {

        it(' should update the parameter correctly', async () => {

            const tx = await budget.connect(admin).updateLootCreator(new_creator.address)

            expect(await budget.lootCreator()).to.be.eq(new_creator.address)
            
            expect(tx).to.emit(budget, 'LootCreatorUpdated').withArgs(lootCreator.address, new_creator.address)

        });

        it(' should fail if given incorrect parameters', async () => {

            await expect(
                budget.connect(admin).updateLootCreator(ethers.constants.AddressZero)
            ).to.be.revertedWith("InvalidParameter")

            await expect(
                budget.connect(admin).updateLootCreator(lootCreator.address)
            ).to.be.revertedWith("SameAddress")

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                budget.connect(otherUser).updateLootCreator(new_creator.address)
            ).to.be.reverted
            
            await expect(
                budget.connect(new_creator).updateLootCreator(new_creator.address)
            ).to.be.reverted

        });

    });

});