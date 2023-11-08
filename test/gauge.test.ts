import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { LootGauge } from "./../typechain/contracts/LootGauge";
import { MockBudgetController } from "./../typechain/contracts/test/MockBudgetController";
import { MockCreator } from "./../typechain/contracts/test/MockCreator";
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

let gaugeFactory: ContractFactory
let controllerFactory: ContractFactory
let creatorFactory: ContractFactory

const PAL_ADDRESS = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"
const PAL_HOLDER = "0x830B63eA52CCcf241A329F3932B4cfCf17287ed7"
const PAL_AMOUNT = ethers.utils.parseEther("500000")

const EXTRA_ADDRESS = "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e"
const EXTRA_HOLDER = "0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b"
const EXTRA_AMOUNT = ethers.utils.parseEther("250")

describe('Loot contract tests', () => {
    let admin: SignerWithAddress

    let lootReserve: SignerWithAddress
    let loot: SignerWithAddress

    let otherUser: SignerWithAddress

    let gauge: LootGauge

    let controller: MockBudgetController

    let lootCreator: MockCreator

    let pal: IERC20
    let extraToken: IERC20


    before(async () => {
        await resetFork();

        [admin, lootReserve, loot, otherUser] = await ethers.getSigners();

        gaugeFactory = await ethers.getContractFactory("LootGauge");
        controllerFactory = await ethers.getContractFactory("MockBudgetController");
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

        gauge = (await gaugeFactory.connect(admin).deploy(
            pal.address,
            extraToken.address,
            lootCreator.address,
            lootReserve.address
        )) as LootGauge
        await gauge.deployed()

        controller = (await controllerFactory.connect(admin).deploy(
            pal.address,
            extraToken.address
        )) as MockBudgetController
        await controller.deployed()

        await pal.connect(admin).transfer(gauge.address, PAL_AMOUNT.div(100))
        await extraToken.connect(admin).transfer(gauge.address, EXTRA_AMOUNT.div(100))

    });

    it(' should be deployed correctly', async () => {
        expect(gauge.address).to.properAddress

        expect(await gauge.pal()).to.be.eq(pal.address)
        expect(await gauge.extraToken()).to.be.eq(extraToken.address)
        
        expect(await gauge.lootCreator()).to.be.eq(lootCreator.address)
        expect(await gauge.lootReserve()).to.be.eq(lootReserve.address)
        expect(await gauge.budgetController()).to.be.eq(ethers.constants.AddressZero)

    });

    describe('setBudgetController', async () => {

        it(' should set the given address', async () => {

            expect(await gauge.budgetController()).to.be.eq(ethers.constants.AddressZero)

            const tx = await gauge.connect(admin).setBudgetController(controller.address)
            
            expect(await gauge.budgetController()).to.be.eq(controller.address)

            expect(tx).to.emit(gauge, "BudgetControllerSet").withArgs(controller.address)

        });

        it(' should only be allowed for admin', async () => {

            await expect(
                gauge.connect(otherUser).setBudgetController(controller.address)
            ).to.be.reverted

            await expect(
                gauge.connect(lootReserve).setBudgetController(controller.address)
            ).to.be.reverted

        });

    });

    describe('updateLootBudget', async () => {

        const pal_budget = ethers.utils.parseEther("1200")
        const extra_budget = ethers.utils.parseEther("0.01")

        beforeEach(async () => {

            await pal.connect(admin).transfer(controller.address, pal_budget)
            await extraToken.connect(admin).transfer(controller.address, extra_budget)

            await controller.connect(admin).setCurrentBudget(gauge.address, pal_budget, extra_budget)

        });

        it(' should not do anything if the controller is not set', async () => {

            const prev_pal_balance = await pal.balanceOf(lootReserve.address)
            const prev_extra_balance = await extraToken.balanceOf(lootReserve.address)

            const prev_pal_budget = await lootCreator.palBudget()
            const prev_extra_budget = await lootCreator.extraBudget()

            const tx = await gauge.connect(loot).updateLootBudget()

            expect(await pal.balanceOf(lootReserve.address)).to.be.eq(prev_pal_balance)
            expect(await extraToken.balanceOf(lootReserve.address)).to.be.eq(prev_extra_balance)

            expect(await lootCreator.palBudget()).to.be.eq(prev_pal_budget)
            expect(await lootCreator.extraBudget()).to.be.eq(prev_extra_budget)
            
            expect(tx).not.to.emit(pal, "Transfer")
            expect(tx).not.to.emit(extraToken, "Transfer")

        });

        it(' should transfer the budget from the Controller to the Reserve correctly & notify the Creator', async () => {

            await gauge.connect(admin).setBudgetController(controller.address)

            const prev_pal_balance = await pal.balanceOf(lootReserve.address)
            const prev_extra_balance = await extraToken.balanceOf(lootReserve.address)

            const prev_pal_balance_controller = await pal.balanceOf(controller.address)
            const prev_extra_balance_controller = await extraToken.balanceOf(controller.address)

            const prev_pal_budget = await lootCreator.palBudget()
            const prev_extra_budget = await lootCreator.extraBudget()

            const tx = await gauge.connect(loot).updateLootBudget()

            expect(await pal.balanceOf(lootReserve.address)).to.be.eq(prev_pal_balance.add(pal_budget))
            expect(await extraToken.balanceOf(lootReserve.address)).to.be.eq(prev_extra_balance.add(extra_budget))

            expect(await pal.balanceOf(controller.address)).to.be.eq(prev_pal_balance_controller.sub(pal_budget))
            expect(await extraToken.balanceOf(controller.address)).to.be.eq(prev_extra_balance_controller.sub(extra_budget))

            expect(await lootCreator.palBudget()).to.be.eq(prev_pal_budget.add(pal_budget))
            expect(await lootCreator.extraBudget()).to.be.eq(prev_extra_budget.add(extra_budget))
            
            expect(tx).to.emit(pal, "Transfer").withArgs(controller.address, lootReserve.address, pal_budget)
            expect(tx).to.emit(extraToken, "Transfer").withArgs(controller.address, lootReserve.address, extra_budget)

        });

    });

    describe('sendLootBudget', async () => {

        const pal_budget = ethers.utils.parseEther("1200")
        const extra_budget = ethers.utils.parseEther("0.01")

        beforeEach(async () => {

            await pal.connect(admin).transfer(gauge.address, pal_budget)
            await extraToken.connect(admin).transfer(gauge.address, extra_budget)

        });

        it(' should transfer the budget to the Reserve & notify the Creator', async () => {

            const prev_pal_balance = await pal.balanceOf(lootReserve.address)
            const prev_extra_balance = await extraToken.balanceOf(lootReserve.address)

            const prev_pal_balance_gauge = await pal.balanceOf(gauge.address)
            const prev_extra_balance_gauge = await extraToken.balanceOf(gauge.address)

            const prev_pal_budget = await lootCreator.palBudget()
            const prev_extra_budget = await lootCreator.extraBudget()

            const tx = await gauge.connect(admin).sendLootBudget(pal_budget, extra_budget)

            expect(await pal.balanceOf(lootReserve.address)).to.be.eq(prev_pal_balance.add(pal_budget))
            expect(await extraToken.balanceOf(lootReserve.address)).to.be.eq(prev_extra_balance.add(extra_budget))

            expect(await pal.balanceOf(gauge.address)).to.be.eq(prev_pal_balance_gauge.sub(pal_budget))
            expect(await extraToken.balanceOf(gauge.address)).to.be.eq(prev_extra_balance_gauge.sub(extra_budget))

            expect(await lootCreator.palBudget()).to.be.eq(prev_pal_budget.add(pal_budget))
            expect(await lootCreator.extraBudget()).to.be.eq(prev_extra_budget.add(extra_budget))
            
            expect(tx).to.emit(pal, "Transfer").withArgs(gauge.address, lootReserve.address, pal_budget)
            expect(tx).to.emit(extraToken, "Transfer").withArgs(gauge.address, lootReserve.address, extra_budget)

        });

        it(' should only transfer & notify for PAL budget if no extra token budget', async () => {

            const prev_pal_balance = await pal.balanceOf(lootReserve.address)
            const prev_extra_balance = await extraToken.balanceOf(lootReserve.address)

            const prev_pal_balance_gauge = await pal.balanceOf(gauge.address)
            const prev_extra_balance_gauge = await extraToken.balanceOf(gauge.address)

            const prev_pal_budget = await lootCreator.palBudget()
            const prev_extra_budget = await lootCreator.extraBudget()

            const tx = await gauge.connect(admin).sendLootBudget(pal_budget, 0)

            expect(await pal.balanceOf(lootReserve.address)).to.be.eq(prev_pal_balance.add(pal_budget))
            expect(await extraToken.balanceOf(lootReserve.address)).to.be.eq(prev_extra_balance)

            expect(await pal.balanceOf(gauge.address)).to.be.eq(prev_pal_balance_gauge.sub(pal_budget))
            expect(await extraToken.balanceOf(gauge.address)).to.be.eq(prev_extra_balance_gauge)

            expect(await lootCreator.palBudget()).to.be.eq(prev_pal_budget.add(pal_budget))
            expect(await lootCreator.extraBudget()).to.be.eq(prev_extra_budget)
            
            expect(tx).to.emit(pal, "Transfer").withArgs(gauge.address, lootReserve.address, pal_budget)
            expect(tx).not.to.emit(extraToken, "Transfer")

        });

        it(' should only be allowed for admin', async () => {

            await expect(
                gauge.connect(otherUser).sendLootBudget(pal_budget, extra_budget)
            ).to.be.reverted

            await expect(
                gauge.connect(lootReserve).sendLootBudget(pal_budget, extra_budget)
            ).to.be.reverted

        });

    });

});