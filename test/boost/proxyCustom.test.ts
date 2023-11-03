const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { DelegationProxyCustom } from "../../typechain/contracts/boost/DelegationProxyCustom.sol/DelegationProxyCustom";
import { MockBoost } from "../../typechain/contracts/test/MockBoost";
import { MockPalPower } from "../../typechain/contracts/test/MockPalPower";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

import {
    advanceTime,
    resetFork
} from "../utils/utils";

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

const WEEK = BigNumber.from(86400 * 7)

let proxyFactory: ContractFactory
let boostFactory: ContractFactory
let escrowFactory: ContractFactory

describe('DelegationProxyCustom contract tests', () => {
    let admin: SignerWithAddress

    let proxy: DelegationProxyCustom

    let user: SignerWithAddress
    let otherUser: SignerWithAddress

    let escrow: MockPalPower

    let boost: MockBoost

    before(async () => {
        await resetFork();

        [admin, user, otherUser] = await ethers.getSigners();

        proxyFactory = await ethers.getContractFactory("DelegationProxyCustom");
        escrowFactory = await ethers.getContractFactory("MockPalPower");
        boostFactory = await ethers.getContractFactory("MockBoost");

    })

    beforeEach(async () => {

        escrow = (await escrowFactory.connect(admin).deploy()) as MockPalPower
        await escrow.deployed()

        boost = (await boostFactory.connect(admin).deploy()) as MockBoost
        await boost.deployed()

        proxy = (await proxyFactory.connect(admin).deploy(
            escrow.address,
            boost.address
        )) as DelegationProxyCustom
        await proxy.deployed()

    });

    it(' should be deployed & have correct parameters', async () => {
        expect(proxy.address).to.properAddress

        expect(await proxy.delegation()).to.be.eq(boost.address)
        
        expect(await proxy.owner()).to.be.eq(admin.address)

    });

    describe('adjusted_balance_of', async () => {

        const user_balance = ethers.utils.parseEther("1000")
        const user_boosted_balance = ethers.utils.parseEther("1250")

        const other_user_boosted_balance = ethers.utils.parseEther("5000")

        beforeEach(async () => {

            await escrow.connect(admin).setBalance(user.address, user_balance)

            await boost.connect(admin).setAdjustedBalance(user.address, user_boosted_balance)
            await boost.connect(admin).setAdjustedBalance(otherUser.address, other_user_boosted_balance)

        });

        it(' should return the adjuted balance for users', async () => {

            expect(await proxy.adjusted_balance_of(user.address)).to.be.eq(user_boosted_balance)

            expect(await proxy.adjusted_balance_of(otherUser.address)).to.be.eq(other_user_boosted_balance)

        });

        it(' should return the normal balance if delegation is killed', async () => {

            await proxy.connect(admin).kill_delegation()

            expect(await proxy.adjusted_balance_of(user.address)).to.be.eq(user_balance)

            expect(await proxy.adjusted_balance_of(otherUser.address)).to.be.eq(0)

        });

    });

    describe('adjusted_balance_of_at', async () => {

        const user_balance = ethers.utils.parseEther("1000")
        const user_boosted_balance = ethers.utils.parseEther("1250")

        const other_user_boosted_balance = ethers.utils.parseEther("5000")

        const ts = 12500

        beforeEach(async () => {

            await escrow.connect(admin).setBalanceAt(user.address, ts, user_balance)

            await boost.connect(admin).setAdjustedBalanceAt(user.address, ts, user_boosted_balance)
            await boost.connect(admin).setAdjustedBalanceAt(otherUser.address, ts, other_user_boosted_balance)

        });

        it(' should return the adjuted balance for users', async () => {

            expect(await proxy.adjusted_balance_of_at(user.address, ts)).to.be.eq(user_boosted_balance)

            expect(await proxy.adjusted_balance_of_at(otherUser.address, ts)).to.be.eq(other_user_boosted_balance)

        });

        it(' should return the normal balance if delegation is killed', async () => {

            await proxy.connect(admin).kill_delegation()

            expect(await proxy.adjusted_balance_of_at(user.address, ts)).to.be.eq(user_balance)

            expect(await proxy.adjusted_balance_of_at(otherUser.address, ts)).to.be.eq(0)

        });

    });

    describe('total_locked & total_locked_at', async () => {

        const total_locked = ethers.utils.parseEther("1000")
        const past_total_locked = ethers.utils.parseEther("1250")

        const past_block_number = 175250

        beforeEach(async () => {

            await escrow.connect(admin).setTotalLocked(total_locked)
            await escrow.connect(admin).setTotalLockedAt(past_block_number, past_total_locked)

            await boost.connect(admin).setTotalLocked(total_locked)
            await boost.connect(admin).setTotalLockedAt(past_block_number, past_total_locked)

        });

        it(' should return the correct data', async () => {

            expect(await proxy.total_locked()).to.be.eq(total_locked)

            expect(await proxy.total_locked_at(past_block_number)).to.be.eq(past_total_locked)

        });

    });

    describe('locked__end', async () => {

        const lock_end = 17525000

        beforeEach(async () => {

            await escrow.connect(admin).setLockedEnd(user.address, lock_end)

        });

        it(' should return the correct data', async () => {

            expect(await proxy.locked__end(user.address)).to.be.eq(lock_end)

        });

    });

    describe('getUserSlopeChanges', async () => {

        const changes = [
            {
                slopeChange: ethers.utils.parseEther("0.01"),
                endTimestamp: BigNumber.from(17589000)
            },
            {
                slopeChange: ethers.utils.parseEther("0.025"),
                endTimestamp: BigNumber.from(17592000)
            },
            {
                slopeChange: ethers.utils.parseEther("0.005"),
                endTimestamp: BigNumber.from(17788000)
            }
        ]

        beforeEach(async () => {

            await boost.connect(admin).setUserSlopeChanges(user.address, changes)

        });

        it(' should return the correct data', async () => {

            const received_changes = await proxy.getUserSlopeChanges(user.address)
            
            expect(received_changes.length).to.be.eq(changes.length)

            for(let i = 0; i < received_changes.length; i++) {
                expect(received_changes[i].slopeChange).to.be.eq(changes[i].slopeChange)
                expect(received_changes[i].endTimestamp).to.be.eq(changes[i].endTimestamp)
            }

        });

        it(' should return an empty array if no delegation set', async () => {

            await proxy.connect(admin).kill_delegation()

            expect(await proxy.getUserSlopeChanges(user.address)).to.be.eql([])

        });

    });

    describe('getUserPoint', async () => {

        const user_bias = ethers.utils.parseEther("5000")
        const user_slope = ethers.utils.parseEther("0.25")
        let user_end_ts = BigNumber.from(0)
        const user_block = BigNumber.from(15489)

        const user_adjusted_balance = ethers.utils.parseEther("2100")

        beforeEach(async () => {

            await boost.connect(admin).setAdjustedBalance(user.address, user_adjusted_balance)
            
            const current_ts = BigNumber.from((await ethers.provider.getBlock(
                await ethers.provider.getBlockNumber()
            )).timestamp)
            user_end_ts = current_ts.add(WEEK.mul(50))

            await escrow.connect(admin).setUserPoint(user.address, user_bias, user_slope, user_end_ts, user_block)

        });

        it(' should return the correct point with adjsuted balance', async () => {
            
            const current_ts = BigNumber.from((await ethers.provider.getBlock(
                await ethers.provider.getBlockNumber()
            )).timestamp)

            const expected_slope = user_adjusted_balance.div(user_end_ts.sub(current_ts))
            const expected_bias = expected_slope.mul(user_end_ts.sub(current_ts))

            const received_point = await proxy.getUserPoint(user.address)

            expect(received_point.bias).to.be.eq(expected_bias)
            expect(received_point.slope).to.be.eq(expected_slope)
            expect(received_point.endTimestamp).to.be.eq(user_end_ts)
            expect(received_point.blockNumber).to.be.eq(user_block)

        });

        it(' should return the normal point if no delegation set', async () => {

            await proxy.connect(admin).kill_delegation()

            const received_point = await proxy.getUserPoint(user.address)

            expect(received_point.bias).to.be.eq(user_bias)
            expect(received_point.slope).to.be.eq(user_slope)
            expect(received_point.endTimestamp).to.be.eq(user_end_ts)
            expect(received_point.blockNumber).to.be.eq(user_block)

        });

    });

    describe('getUserPointAt', async () => {

        const user_bias = ethers.utils.parseEther("6000")
        const user_slope = ethers.utils.parseEther("0.525")
        let user_end_ts = BigNumber.from(0)
        const user_block = BigNumber.from(15489)

        const user_adjusted_balance = ethers.utils.parseEther("3200")

        let target_ts = BigNumber.from(0)

        beforeEach(async () => {
            
            const current_ts = BigNumber.from((await ethers.provider.getBlock(
                await ethers.provider.getBlockNumber()
            )).timestamp)
            user_end_ts = current_ts.add(WEEK.mul(50))

            target_ts = current_ts.sub(WEEK.mul(2))

            await boost.connect(admin).setAdjustedBalanceAt(user.address, target_ts, user_adjusted_balance)

            await escrow.connect(admin).setUserPointAt(user.address, target_ts, user_bias, user_slope, user_end_ts, user_block)

        });

        it(' should return the correct point with adjsuted balance', async () => {

            const expected_slope = user_adjusted_balance.div(user_end_ts.sub(target_ts))
            const expected_bias = expected_slope.mul(user_end_ts.sub(target_ts))

            const received_point = await proxy.getUserPointAt(user.address, target_ts)

            expect(received_point.bias).to.be.eq(expected_bias)
            expect(received_point.slope).to.be.eq(expected_slope)
            expect(received_point.endTimestamp).to.be.eq(user_end_ts)
            expect(received_point.blockNumber).to.be.eq(user_block)

        });

        it(' should return the normal point if no delegation set', async () => {

            await proxy.connect(admin).kill_delegation()

            const received_point = await proxy.getUserPointAt(user.address, target_ts)

            expect(received_point.bias).to.be.eq(user_bias)
            expect(received_point.slope).to.be.eq(user_slope)
            expect(received_point.endTimestamp).to.be.eq(user_end_ts)
            expect(received_point.blockNumber).to.be.eq(user_block)

        });

    });

    // other methods here

    describe('kill_delegation', async () => {

        it(' should remove the delegation correctly', async () => {
            
            expect(await proxy.delegation()).to.be.eq(boost.address)

            const kill_tx = await proxy.connect(admin).kill_delegation()

            expect(await proxy.delegation()).to.be.eq(ethers.constants.AddressZero)

            expect(kill_tx).to.emit(proxy, "DelegationSet").withArgs(ethers.constants.AddressZero);

        });

        it(' should not be allowed for non-admins', async () => {

            await expect(
                proxy.connect(user).kill_delegation()
            ).to.be.reverted

            await expect(
                proxy.connect(otherUser).kill_delegation()
            ).to.be.reverted

        });

    });

    describe('set_delegation', async () => {

        let new_boost: MockBoost

        beforeEach(async () => {

            new_boost = (await boostFactory.connect(admin).deploy()) as MockBoost
            await new_boost.deployed()

        });

        it(' should update the delegation correctly', async () => {

            expect(await proxy.delegation()).to.be.eq(boost.address)

            const update_tx = await proxy.connect(admin).set_delegation(new_boost.address)

            expect(await proxy.delegation()).to.be.eq(new_boost.address)

            expect(update_tx).to.emit(proxy, "DelegationSet").withArgs(new_boost.address);

        });

        it(' should update if the delegation was killed before', async () => {

            await proxy.connect(admin).kill_delegation()

            expect(await proxy.delegation()).to.be.eq(ethers.constants.AddressZero)

            const update_tx = await proxy.connect(admin).set_delegation(new_boost.address)

            expect(await proxy.delegation()).to.be.eq(new_boost.address)

            expect(update_tx).to.emit(proxy, "DelegationSet").withArgs(new_boost.address);

        });

        it(' should update if was set as 0x0 at deploy', async () => {

            const proxy2 = (await proxyFactory.connect(admin).deploy(
                escrow.address,
                ethers.constants.AddressZero
            )) as DelegationProxyCustom
            await proxy2.deployed()

            expect(await proxy2.delegation()).to.be.eq(ethers.constants.AddressZero)

            const update_tx = await proxy2.connect(admin).set_delegation(boost.address)

            expect(await proxy2.delegation()).to.be.eq(boost.address)

            expect(update_tx).to.emit(proxy2, "DelegationSet").withArgs(boost.address);

        });

        it(' should fail if the given address if not a veBoost contract', async () => {

            await expect(
                proxy.connect(admin).set_delegation(otherUser.address)
            ).to.be.reverted

        });

        it(' should only be allowed for ownership admin', async () => {

            await expect(
                proxy.connect(user).set_delegation(new_boost.address)
            ).to.be.reverted

            await expect(
                proxy.connect(otherUser).set_delegation(new_boost.address)
            ).to.be.reverted

        });

    });

});