import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { LootReserve } from "./../typechain/contracts/LootReserve";
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

let reserveFactory: ContractFactory

const PAL_ADDRESS = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"
const PAL_HOLDER = "0x830B63eA52CCcf241A329F3932B4cfCf17287ed7"
const PAL_AMOUNT = ethers.utils.parseEther("500000")

const EXTRA_ADDRESS = "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e"
const EXTRA_HOLDER = "0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b"
const EXTRA_AMOUNT = ethers.utils.parseEther("250")

describe('Loot contract tests', () => {
    let admin: SignerWithAddress

    let loot: SignerWithAddress

    let otherUser: SignerWithAddress

    let reserve: LootReserve

    let pal: IERC20
    let extraToken: IERC20


    before(async () => {
        await resetFork();

        [admin, loot, otherUser] = await ethers.getSigners();

        reserveFactory = await ethers.getContractFactory("LootReserve");

        pal = IERC20__factory.connect(PAL_ADDRESS, provider)
        extraToken = IERC20__factory.connect(EXTRA_ADDRESS, provider)

        await getERC20(admin, PAL_HOLDER, pal, admin.address, PAL_AMOUNT);
        await getERC20(admin, EXTRA_HOLDER, extraToken, admin.address, EXTRA_AMOUNT);

    })

    beforeEach(async () => {

        reserve = (await reserveFactory.connect(admin).deploy(
            pal.address,
            extraToken.address
        )) as LootReserve
        await reserve.deployed()

        await pal.connect(admin).transfer(reserve.address, PAL_AMOUNT.div(100))
        await extraToken.connect(admin).transfer(reserve.address, EXTRA_AMOUNT.div(100))

    });

    it(' should be deployed correctly', async () => {
        expect(reserve.address).to.properAddress

        expect(await reserve.pal()).to.be.eq(pal.address)
        expect(await reserve.extraToken()).to.be.eq(extraToken.address)
        
        expect(await reserve.loot()).to.be.eq(ethers.constants.AddressZero)

    });

    describe('init', async () => {

        it(' should set the Loot correctly & set correct allowances', async () => {

            expect(await reserve.loot()).to.be.eq(ethers.constants.AddressZero)

            expect(await pal.allowance(reserve.address, loot.address)).to.be.eq(0)
            expect(await extraToken.allowance(reserve.address, loot.address)).to.be.eq(0)

            const tx = await reserve.connect(admin).init(loot.address)

            expect(await reserve.loot()).to.be.eq(loot.address)

            expect(await pal.allowance(reserve.address, loot.address)).to.be.eq(ethers.constants.MaxUint256)
            expect(await extraToken.allowance(reserve.address, loot.address)).to.be.eq(ethers.constants.MaxUint256)

            expect(tx).to.emit(reserve, "Init").withArgs(loot.address)

            expect(tx).to.emit(reserve, "MaxAllowanceSet").withArgs(pal.address, loot.address)
            expect(tx).to.emit(reserve, "MaxAllowanceSet").withArgs(extraToken.address, loot.address)

        });

        it(' should fail if already set', async () => {

            await reserve.connect(admin).init(loot.address)
            
            await expect(
                reserve.connect(admin).init(otherUser.address)
            ).to.be.revertedWith("CreatorAlreadySet")

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                reserve.connect(otherUser).init(loot.address)
            ).to.be.reverted

        });

    });

    describe('getBalances', async () => {

        beforeEach(async () => {

            await reserve.connect(admin).init(loot.address)

        });

        it(' should return the correct balances', async () => {

            const balances = await reserve.getBalances()

            expect(balances.palBalance).to.be.eq(await pal.balanceOf(reserve.address))
            expect(balances.extraBalance).to.be.eq(await extraToken.balanceOf(reserve.address))

        });

        it(' should return the correct balances after a transfer', async () => {

            await pal.connect(loot).transferFrom(reserve.address, otherUser.address, ethers.utils.parseEther("500"))
            await extraToken.connect(loot).transferFrom(reserve.address, otherUser.address, ethers.utils.parseEther("0.005"))

            const balances = await reserve.getBalances()

            expect(balances.palBalance).to.be.eq(await pal.balanceOf(reserve.address))
            expect(balances.extraBalance).to.be.eq(await extraToken.balanceOf(reserve.address))

        });

    });

    describe('getRemainingAllowances', async () => {

        beforeEach(async () => {

            await reserve.connect(admin).init(loot.address)

        });

        it(' should return the correct allowances', async () => {

            const allowances = await reserve.getRemainingAllowances()

            expect(allowances.palAllowance).to.be.eq(await pal.allowance(reserve.address, loot.address))
            expect(allowances.extraAllowance).to.be.eq(await extraToken.allowance(reserve.address, loot.address))

        });

        it(' should return the correct allowances after a transfer', async () => {

            await pal.connect(loot).transferFrom(reserve.address, otherUser.address, ethers.utils.parseEther("500"))
            await extraToken.connect(loot).transferFrom(reserve.address, otherUser.address, ethers.utils.parseEther("0.005"))

            const allowances = await reserve.getRemainingAllowances()

            expect(allowances.palAllowance).to.be.eq(await pal.allowance(reserve.address, loot.address))
            expect(allowances.extraAllowance).to.be.eq(await extraToken.allowance(reserve.address, loot.address))

        });

    });

    describe('resetMaxAllowance', async () => {

        beforeEach(async () => {

            await reserve.connect(admin).init(loot.address)

        });

        it(' should reset the allowances', async () => {

            await pal.connect(loot).transferFrom(reserve.address, otherUser.address, ethers.utils.parseEther("500"))
            await extraToken.connect(loot).transferFrom(reserve.address, otherUser.address, ethers.utils.parseEther("0.005"))

            // here allowance is lower than the max for the extra token

            const tx = await reserve.connect(admin).resetMaxAllowance()

            const allowances = await reserve.getRemainingAllowances()

            expect(allowances.palAllowance).to.be.eq(ethers.constants.MaxUint256)
            expect(allowances.extraAllowance).to.be.eq(ethers.constants.MaxUint256)
            expect(await pal.allowance(reserve.address, loot.address)).to.be.eq(ethers.constants.MaxUint256)
            expect(await extraToken.allowance(reserve.address, loot.address)).to.be.eq(ethers.constants.MaxUint256)

            expect(tx).to.emit(reserve, "MaxAllowanceSet").withArgs(pal.address, loot.address)
            expect(tx).to.emit(reserve, "MaxAllowanceSet").withArgs(extraToken.address, loot.address)

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                reserve.connect(otherUser).resetMaxAllowance()
            ).to.be.reverted

        });

    });

    describe('resetMaxAllowance', async () => {

        beforeEach(async () => {

            await reserve.connect(admin).init(loot.address)

        });

        it(' should empty the balances', async () => {

            const prev_balances = await reserve.getBalances()

            const tx = await reserve.connect(admin).emptyReserve()

            expect(await pal.balanceOf(reserve.address)).to.be.eq(0)
            expect(await extraToken.balanceOf(reserve.address)).to.be.eq(0)

            expect(tx).to.emit(reserve, "CancelReserve").withArgs(prev_balances.palBalance, prev_balances.extraBalance)

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                reserve.connect(otherUser).emptyReserve()
            ).to.be.reverted

        });

    });

});