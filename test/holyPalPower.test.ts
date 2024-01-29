import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { HolyPalPower } from "./../typechain/contracts/HolyPalPower";
import { IHolyPaladinToken } from "./../typechain/contracts/interfaces/IHolyPaladinToken";
import { IHolyPaladinToken__factory } from "./../typechain/factories/contracts/interfaces/IHolyPaladinToken__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

import {
    advanceTime,
    resetFork
} from "./utils/utils";

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

const WEEK = BigNumber.from(86400 * 7)

let powerFactory: ContractFactory

const HPAL_ADDRESS = "0x624D822934e87D3534E435b83ff5C19769Efd9f6"

const TEST_USER = "0x9824697F7c12CAbAda9b57842060931c48dEA969"
const TEST_USER_2 = "0xAFe4043c9FFd31753c5bE2B76dfc45AaA70ebD6f"
const TEST_USER_3 = "0x79603115Df2Ba00659ADC63192325CF104ca529C"

describe('HolyPalPower contract tests', () => {
    let admin: SignerWithAddress

    let power: HolyPalPower

    let hPal: IHolyPaladinToken

    // timestamps to check

    const before_initial_lock_ts = BigNumber.from('1651745000')

    const ts_1 = BigNumber.from('1653755700')
    const ts_2 = BigNumber.from('1686236000')
    const ts_3 = BigNumber.from('1690356000')

    // block numbers to check

    const tx_block_1 = BigNumber.from('14717400')
    const tx_block_2 = BigNumber.from('16436500')
    const tx_block_3 = BigNumber.from('18129000')


    before(async () => {
        await resetFork();

        [admin] = await ethers.getSigners();

        powerFactory = await ethers.getContractFactory("contracts/HolyPalPower.sol:HolyPalPower");

        hPal = IHolyPaladinToken__factory.connect(HPAL_ADDRESS, provider);

    })

    beforeEach(async () => {

        power = (await powerFactory.connect(admin).deploy(
            HPAL_ADDRESS
        )) as HolyPalPower
        await power.deployed()

    });

    it(' should be deployed correctly', async () => {
        expect(power.address).to.properAddress

        expect(await power.hPal()).to.be.eq(HPAL_ADDRESS)

    });
    
    describe('totalSupply & totalLocked & totalLockedAt', async () => {

        it(' should return the correct data', async () => {

            expect(await power.totalSupply()).to.be.eq((await hPal.getCurrentTotalLock()).total)

            expect(await power.totalLocked()).to.be.eq((await hPal.getCurrentTotalLock()).total)

            expect(await power.totalLockedAt(tx_block_1)).to.be.eq((await hPal.getPastTotalLock(tx_block_1)).total)
            expect(await power.totalLockedAt(tx_block_2)).to.be.eq((await hPal.getPastTotalLock(tx_block_2)).total)
            expect(await power.totalLockedAt(tx_block_3)).to.be.eq((await hPal.getPastTotalLock(tx_block_3)).total)

        });

    });
    
    describe('locked__end', async () => {

        it(' should return the correct lock end', async () => {

            const lock_1 = await hPal.getUserLock(TEST_USER)
            expect(await power.locked__end(TEST_USER)).to.be.eq(
                BigNumber.from(lock_1.startTimestamp).add(lock_1.duration).div(WEEK).mul(WEEK)
            )

            const lock_2 = await hPal.getUserLock(TEST_USER_2)
            expect(await power.locked__end(TEST_USER_2)).to.be.eq(
                BigNumber.from(lock_2.startTimestamp).add(lock_2.duration).div(WEEK).mul(WEEK)
            )

            const lock_3 = await hPal.getUserLock(TEST_USER_3)
            expect(await power.locked__end(TEST_USER_3)).to.be.eq(
                BigNumber.from(lock_3.startTimestamp).add(lock_3.duration).div(WEEK).mul(WEEK)
            )

        });

    });

    describe('getUserPoint', async () => {

        it(' should return a valid point - user 1', async () => {

            const lock = await hPal.getUserLock(TEST_USER)

            const endTs = BigNumber.from(lock.startTimestamp).add(lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(lock.startTimestamp)

            const slope = lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPoint(TEST_USER)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(lock.fromBlock)

        });

        it(' should return a valid point - user 2', async () => {

            const lock = await hPal.getUserLock(TEST_USER_2)

            const endTs = BigNumber.from(lock.startTimestamp).add(lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(lock.startTimestamp)

            const slope = lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPoint(TEST_USER_2)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(lock.fromBlock)

        });

        it(' should return a valid point - user 3', async () => {

            const lock = await hPal.getUserLock(TEST_USER_3)

            const endTs = BigNumber.from(lock.startTimestamp).add(lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(lock.startTimestamp)

            const slope = lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPoint(TEST_USER_3)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(lock.fromBlock)

        });

    });

    describe('balanceOf', async () => {

        it(' should return the correct balance - user 1', async () => {

            const lock = await hPal.getUserLock(TEST_USER)

            const endTs = BigNumber.from(lock.startTimestamp).add(lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(lock.startTimestamp)

            const slope = lock.amount.div(duration)

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            const expected_balance = slope.mul(endTs.sub(current_ts))

            expect(await power.balanceOf(TEST_USER)).to.be.eq(expected_balance)

        });

        it(' should return the correct balance - user 2', async () => {

            const lock = await hPal.getUserLock(TEST_USER_2)

            const endTs = BigNumber.from(lock.startTimestamp).add(lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(lock.startTimestamp)

            const slope = lock.amount.div(duration)

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            const expected_balance = slope.mul(endTs.sub(current_ts))

            expect(await power.balanceOf(TEST_USER_2)).to.be.eq(expected_balance)

        });

        it(' should return the correct balance - user 3', async () => {

            const lock = await hPal.getUserLock(TEST_USER_3)

            const endTs = BigNumber.from(lock.startTimestamp).add(lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(lock.startTimestamp)

            const slope = lock.amount.div(duration)

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            const expected_balance = slope.mul(endTs.sub(current_ts))

            expect(await power.balanceOf(TEST_USER_3)).to.be.eq(expected_balance)

        });

    });

    describe('getUserPointAt', async () => {

        it(' should return the correct point - user 1 - 1st ts', async () => {

            const expected_lock_number = BigNumber.from('1')

            const expected_lock = await hPal.userLocks(TEST_USER, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPointAt(TEST_USER, ts_1)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(expected_lock.fromBlock)

        });

        it(' should return the correct point - user 1 - 2nd ts', async () => {

            const expected_lock_number = BigNumber.from('11')

            const expected_lock = await hPal.userLocks(TEST_USER, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPointAt(TEST_USER, ts_2)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(expected_lock.fromBlock)

        });

        it(' should return the correct point - user 1 - 3rd ts', async () => {

            const expected_lock_number = BigNumber.from('15')

            const expected_lock = await hPal.userLocks(TEST_USER, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPointAt(TEST_USER, ts_3)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(expected_lock.fromBlock)

        });

        it(' should return the correct point - user 1 - before 1st lock', async () => {
            
            const user_point = await power.getUserPointAt(TEST_USER, before_initial_lock_ts)

            expect(user_point.bias).to.be.eq(0)
            expect(user_point.slope).to.be.eq(0)
            expect(user_point.endTimestamp).to.be.eq(0)
            expect(user_point.blockNumber).to.be.eq(0)

        });

        it(' should return the correct point - user 1 - in future', async () => {
            
            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            const target_ts = BigNumber.from(current_ts).add(WEEK.mul(2))

            const expected_lock = await hPal.getUserLock(TEST_USER)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPointAt(TEST_USER, target_ts)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(expected_lock.fromBlock)

        });

        it(' should return the correct point - user 2 - 1st ts', async () => {

            const expected_lock_number = BigNumber.from('1')

            const expected_lock = await hPal.userLocks(TEST_USER_2, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPointAt(TEST_USER_2, ts_1)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(expected_lock.fromBlock)

        });

        it(' should return the correct point - user 2 - 2nd ts', async () => {

            const expected_lock_number = BigNumber.from('5')

            const expected_lock = await hPal.userLocks(TEST_USER_2, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPointAt(TEST_USER_2, ts_2)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(expected_lock.fromBlock)

        });

        it(' should return the correct point - user 2 - 3rd ts', async () => {

            const expected_lock_number = BigNumber.from('6')

            const expected_lock = await hPal.userLocks(TEST_USER_2, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPointAt(TEST_USER_2, ts_3)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(expected_lock.fromBlock)

        });

        it(' should return the correct point - user 3 - 1st ts', async () => {

            const expected_lock_number = BigNumber.from('1')

            const expected_lock = await hPal.userLocks(TEST_USER_3, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPointAt(TEST_USER_3, ts_1)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(expected_lock.fromBlock)

        });

        it(' should return the correct point - user 3 - 2nd ts', async () => {

            const expected_lock_number = BigNumber.from('3')

            const expected_lock = await hPal.userLocks(TEST_USER_3, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPointAt(TEST_USER_3, ts_2)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(expected_lock.fromBlock)

        });

        it(' should return the correct point - user 3 - 3rd ts', async () => {

            const expected_lock_number = BigNumber.from('3')

            const expected_lock = await hPal.userLocks(TEST_USER_3, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const bias = slope.mul(duration)
            
            const user_point = await power.getUserPointAt(TEST_USER_3, ts_3)

            expect(user_point.bias).to.be.eq(bias)
            expect(user_point.slope).to.be.eq(slope)
            expect(user_point.endTimestamp).to.be.eq(endTs)
            expect(user_point.blockNumber).to.be.eq(expected_lock.fromBlock)

        });

    });
    
    describe('balanceOfAt', async () => {

        it(' should return the correct point - user 1 - 1st ts', async () => {

            const expected_lock_number = BigNumber.from('1')

            const expected_lock = await hPal.userLocks(TEST_USER, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const expected_balance = slope.mul(endTs.sub(ts_1))

            expect(await power.balanceOfAt(TEST_USER, ts_1)).to.be.eq(expected_balance)

        });

        it(' should return the correct point - user 1 - 2nd ts', async () => {

            const expected_lock_number = BigNumber.from('11')

            const expected_lock = await hPal.userLocks(TEST_USER, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const expected_balance = slope.mul(endTs.sub(ts_2))

            expect(await power.balanceOfAt(TEST_USER, ts_2)).to.be.eq(expected_balance)

        });

        it(' should return the correct point - user 1 - 3rd ts', async () => {

            const expected_lock_number = BigNumber.from('15')

            const expected_lock = await hPal.userLocks(TEST_USER, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const expected_balance = slope.mul(endTs.sub(ts_3))

            expect(await power.balanceOfAt(TEST_USER, ts_3)).to.be.eq(expected_balance)

        });

        it(' should return the correct point - user 1 - before 1st lock', async () => {

            expect(await power.balanceOfAt(TEST_USER, before_initial_lock_ts)).to.be.eq(0)

        });

        it(' should return the correct point - user 1 - in future', async () => {
            
            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            const target_ts = BigNumber.from(current_ts).add(WEEK.mul(2))

            const expected_lock = await hPal.getUserLock(TEST_USER)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const expected_balance = slope.mul(endTs.sub(target_ts))

            expect(await power.balanceOfAt(TEST_USER, target_ts)).to.be.eq(expected_balance)

            const target_ts_2 = BigNumber.from(endTs).add(WEEK.mul(3))

            expect(await power.balanceOfAt(TEST_USER, target_ts_2)).to.be.eq(0)

        });

        it(' should return the correct point - user 2 - 1st ts', async () => {

            const expected_lock_number = BigNumber.from('1')

            const expected_lock = await hPal.userLocks(TEST_USER_2, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const expected_balance = slope.mul(endTs.sub(ts_1))

            expect(await power.balanceOfAt(TEST_USER_2, ts_1)).to.be.eq(expected_balance)

        });

        it(' should return the correct point - user 2 - 2nd ts', async () => {

            const expected_lock_number = BigNumber.from('5')

            const expected_lock = await hPal.userLocks(TEST_USER_2, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const expected_balance = slope.mul(endTs.sub(ts_2))

            expect(await power.balanceOfAt(TEST_USER_2, ts_2)).to.be.eq(expected_balance)

        });

        it(' should return the correct point - user 2 - 3rd ts', async () => {

            const expected_lock_number = BigNumber.from('6')

            const expected_lock = await hPal.userLocks(TEST_USER_2, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const expected_balance = slope.mul(endTs.sub(ts_3))

            expect(await power.balanceOfAt(TEST_USER_2, ts_3)).to.be.eq(expected_balance)

        });

        it(' should return the correct point - user 3 - 1st ts', async () => {

            const expected_lock_number = BigNumber.from('1')

            const expected_lock = await hPal.userLocks(TEST_USER_3, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const expected_balance = slope.mul(endTs.sub(ts_1))

            expect(await power.balanceOfAt(TEST_USER_3, ts_1)).to.be.eq(expected_balance)

        });

        it(' should return the correct point - user 3 - 2nd ts', async () => {

            const expected_lock_number = BigNumber.from('3')

            const expected_lock = await hPal.userLocks(TEST_USER_3, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const expected_balance = slope.mul(endTs.sub(ts_2))

            expect(await power.balanceOfAt(TEST_USER_3, ts_2)).to.be.eq(expected_balance)

        });

        it(' should return the correct point - user 3 - 3rd ts', async () => {

            const expected_lock_number = BigNumber.from('3')

            const expected_lock = await hPal.userLocks(TEST_USER_3, expected_lock_number)

            const endTs = BigNumber.from(expected_lock.startTimestamp).add(expected_lock.duration).div(WEEK).mul(WEEK)
            const duration = endTs.sub(expected_lock.startTimestamp)

            const slope = expected_lock.amount.div(duration)
            const expected_balance = slope.mul(endTs.sub(ts_3))

            expect(await power.balanceOfAt(TEST_USER_3, ts_3)).to.be.eq(expected_balance)

        });

    });

});