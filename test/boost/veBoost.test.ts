const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { BoostV2 } from "../../typechain/contracts/boost/BoostV2.vy/BoostV2";
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
const UNIT = ethers.utils.parseEther('1')
const MAX_TIME = BigNumber.from(86400 * 365 * 4)

let boostFactory: ContractFactory
let escrowFactory: ContractFactory

const lock_amount = ethers.utils.parseEther('5000')
const lock_amount2 = ethers.utils.parseEther('1200')

const lock_duration = MAX_TIME
const lock_duration2 = WEEK.mul(200)

describe('BoostV2 contract tests', () => {
    let admin: SignerWithAddress
    let emergencyAdmin: SignerWithAddress

    let boost: BoostV2

    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress

    let holyPalPower: MockPalPower

    before(async () => {
        await resetFork();

        [admin, user1, user2, user3] = await ethers.getSigners();

        escrowFactory = await ethers.getContractFactory("MockPalPower");
        boostFactory = await ethers.getContractFactory("BoostV2");

    })

    beforeEach(async () => {

        holyPalPower = (await escrowFactory.connect(admin).deploy()) as MockPalPower
        await holyPalPower.deployed()

        boost = (await boostFactory.connect(admin).deploy(
            holyPalPower.address,
            ethers.constants.AddressZero
        )) as BoostV2
        await boost.deployed()

    });

    it(' should be deployed & have correct parameters', async () => {
        expect(boost.address).to.properAddress

        expect(await boost.HOLY_PAL_POWER()).to.be.equal(holyPalPower.address)
        expect(await boost.name()).to.be.equal("HolyPal Power Boost")
        expect(await boost.symbol()).to.be.equal("hPalBoost")
        expect(await boost.decimals()).to.be.equal(18)
    });

    const setUpLocks = async () => {

        const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
        const unlock_time = BigNumber.from(current_ts).add(lock_duration).div(WEEK).mul(WEEK)
        const unlock_time2 = BigNumber.from(current_ts).add(lock_duration2).div(WEEK).mul(WEEK)

        await holyPalPower.connect(admin).setLockedEnd(user1.address, unlock_time)
        await holyPalPower.connect(admin).setLockedEnd(user2.address, unlock_time2)

        await holyPalPower.connect(admin).setBalance(user1.address, lock_amount)
        await holyPalPower.connect(admin).setBalance(user2.address, lock_amount2)

    }

    describe('approve', async () => {

        beforeEach(async () => {

            await setUpLocks()

        });

        it(' should set the correct allowance', async () => {

            const amount = ethers.utils.parseEther('1000')

            const approve_tx = await boost.connect(user1).approve(user2.address, amount)
            
            expect(await boost.allowance(user1.address, user2.address)).to.be.equal(amount)

            expect(approve_tx).to.emit(boost, "Approval").withArgs(
                user1.address,
                user2.address,
                amount
            );

        });

        it(' should update the allowance correctly', async () => {

            await boost.connect(user1).approve(user2.address, ethers.utils.parseEther('1000'))

            const amount = ethers.utils.parseEther('5000')

            const approve_tx = await boost.connect(user1).approve(user2.address, amount)
            
            expect(await boost.allowance(user1.address, user2.address)).to.be.equal(amount)

            expect(approve_tx).to.emit(boost, "Approval").withArgs(
                user1.address,
                user2.address,
                amount
            );

        });

    });

    describe('increaseAllowance', async () => {

        const change_amount = ethers.utils.parseEther('1000')

        beforeEach(async () => {

            await setUpLocks()

            await boost.connect(user1).approve(user2.address, ethers.utils.parseEther('5000'))

        });

        it(' should update the allowance correctly', async () => {

            const prev_allowance = await boost.allowance(user1.address, user2.address)

            const approve_tx = await boost.connect(user1).increaseAllowance(user2.address, change_amount)

            const new_allowance = await boost.allowance(user1.address, user2.address)
            
            expect(new_allowance).to.be.equal(prev_allowance.add(change_amount))

            expect(approve_tx).to.emit(boost, "Approval").withArgs(
                user1.address,
                user2.address,
                prev_allowance.add(change_amount)
            );

        });

    });

    describe('decreaseAllowance', async () => {

        const change_amount = ethers.utils.parseEther('1000')

        beforeEach(async () => {

            await setUpLocks()

            await boost.connect(user1).approve(user2.address, ethers.utils.parseEther('5000'))

        });

        it(' should update the allowance correctly', async () => {

            const prev_allowance = await boost.allowance(user1.address, user2.address)

            const approve_tx = await boost.connect(user1).decreaseAllowance(user2.address, change_amount)

            const new_allowance = await boost.allowance(user1.address, user2.address)
            
            expect(new_allowance).to.be.equal(prev_allowance.sub(change_amount))

            expect(approve_tx).to.emit(boost, "Approval").withArgs(
                user1.address,
                user2.address,
                prev_allowance.sub(change_amount)
            );

        });

        it(' should fail if underflow', async () => {

            await expect(
                boost.connect(user1).decreaseAllowance(user2.address, ethers.utils.parseEther('100000'))
            ).to.be.reverted

        });

    });

    describe('boost', async () => {

        const boost_amount = ethers.utils.parseEther('1000')

        const duration = WEEK.mul(200)

        let end_time: BigNumber;

        beforeEach(async () => {

            await setUpLocks()

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            end_time = BigNumber.from(current_ts).add(duration).div(WEEK).mul(WEEK)

        });

        it(' should delegate correctly', async () => {

            const prev_adjusted_balance1 = await boost.adjusted_balance_of(user1.address)
            const prev_adjusted_balance2 = await boost.adjusted_balance_of(user2.address)

            const prev_delegated_balance = await boost.delegated_balance(user1.address)
            const prev_delegeable_balance = await boost.delegable_balance(user1.address)
            const prev_received_balance = await boost.received_balance(user2.address)

            const prev_user1_slope_changes = await boost.delegated_slope_changes(user1.address, end_time)
            const prev_user2_slope_changes = await boost.received_slope_changes(user2.address, end_time)

            const prev_user1_delegated_nonce = await boost.delegated_checkpoints_nonces(user1.address)
            const prev_user2_received_nonce = await boost.received_checkpoints_nonces(user2.address)

            const prev_user2_delegated_nonce = await boost.delegated_checkpoints_nonces(user2.address)
            const prev_user1_received_nonce = await boost.received_checkpoints_nonces(user1.address)

            const boost_tx = await boost.connect(user1)["boost(address,uint256,uint256)"](
                user2.address,
                boost_amount,
                end_time
            )
            
            const tx_block = (await boost_tx).blockNumber
            const tx_ts = (await ethers.provider.getBlock(tx_block || 0)).timestamp

            const user1_point = await boost.delegated_point(user1.address)
            const user2_point = await boost.received_point(user2.address)

            const new_user1_slope_changes = await boost.delegated_slope_changes(user1.address, end_time)
            const new_user2_slope_changes = await boost.received_slope_changes(user2.address, end_time)

            const new_adjusted_balance1 = await boost.adjusted_balance_of(user1.address, { blockTag: tx_block })
            const new_adjusted_balance2 = await boost.adjusted_balance_of(user2.address, { blockTag: tx_block })

            const new_delegated_balance = await boost.delegated_balance(user1.address, { blockTag: tx_block })
            const new_delegeable_balance = await boost.delegable_balance(user1.address, { blockTag: tx_block })
            const new_received_balance = await boost.received_balance(user2.address, { blockTag: tx_block })

            const expected_slope = boost_amount.div(end_time.sub(tx_ts))
            const expected_bias = expected_slope.mul(end_time.sub(tx_ts))

            expect(user1_point.slope).to.be.equal(expected_slope)
            expect(user1_point.bias).to.be.equal(expected_bias)
            expect(user1_point.ts).to.be.equal(tx_ts)

            expect(user2_point.slope).to.be.equal(expected_slope)
            expect(user2_point.bias).to.be.equal(expected_bias)
            expect(user2_point.ts).to.be.equal(tx_ts)

            expect(new_user1_slope_changes).to.be.equal(prev_user1_slope_changes.add(expected_slope))
            expect(new_user2_slope_changes).to.be.equal(prev_user2_slope_changes.add(expected_slope))

            expect(new_adjusted_balance1).to.be.equal(prev_adjusted_balance1.sub(expected_bias))
            expect(new_adjusted_balance2).to.be.equal(prev_adjusted_balance2.add(expected_bias))

            expect(new_delegated_balance).to.be.equal(prev_delegated_balance.add(expected_bias))
            expect(new_delegeable_balance).to.be.equal(prev_delegeable_balance.sub(expected_bias))
            expect(new_received_balance).to.be.equal(prev_received_balance.add(expected_bias))

            expect(await boost.delegated_checkpoints_nonces(user1.address)).to.be.equal(prev_user1_delegated_nonce.add(1))
            expect(await boost.received_checkpoints_nonces(user2.address)).to.be.equal(prev_user2_received_nonce.add(1))

            expect(await boost.delegated_checkpoints_nonces(user2.address)).to.be.equal(prev_user2_delegated_nonce.add(1))
            expect(await boost.received_checkpoints_nonces(user1.address)).to.be.equal(prev_user1_received_nonce.add(1))

            expect(await boost.delegated_checkpoints_dates(user1.address, prev_user1_delegated_nonce)).to.be.equal(tx_ts)
            expect(await boost.received_checkpoints_dates(user2.address, prev_user2_received_nonce)).to.be.equal(tx_ts)

            expect(await boost.received_checkpoints_dates(user1.address, prev_user1_received_nonce)).to.be.equal(tx_ts)
            expect(await boost.delegated_checkpoints_dates(user2.address, prev_user2_delegated_nonce)).to.be.equal(tx_ts)

            expect(boost_tx).to.emit(boost, "Transfer").withArgs(
                user1.address,
                user2.address,
                boost_amount
            );

            expect(boost_tx).to.emit(boost, "Boost").withArgs(
                user1.address,
                user2.address,
                expected_bias,
                expected_slope,
                tx_ts
            );
        });

        it(' should fail if incorrect parameters are given', async () => {

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)

            await expect(
                boost.connect(user1)["boost(address,uint256,uint256)"](
                    user1.address,
                    boost_amount,
                    end_time
                )
            ).to.be.reverted

            await expect(
                boost.connect(user1)["boost(address,uint256,uint256)"](
                    ethers.constants.AddressZero,
                    boost_amount,
                    end_time
                )
            ).to.be.reverted

            await expect(
                boost.connect(user1)["boost(address,uint256,uint256)"](
                    user2.address,
                    0,
                    end_time
                )
            ).to.be.reverted

            await expect(
                boost.connect(user1)["boost(address,uint256,uint256)"](
                    user2.address,
                    boost_amount,
                    BigNumber.from(current_ts).sub(WEEK)
                )
            ).to.be.reverted

            await expect(
                boost.connect(user1)["boost(address,uint256,uint256)"](
                    user2.address,
                    boost_amount,
                    BigNumber.from(current_ts)
                )
            ).to.be.reverted

            await expect(
                boost.connect(user1)["boost(address,uint256,uint256)"](
                    user2.address,
                    boost_amount,
                    BigNumber.from(current_ts).add(MAX_TIME.add(WEEK)).div(WEEK).mul(WEEK)
                )
            ).to.be.reverted

        });

        it(' should fail if trying to boost more than the current delegable balance - over balance', async () => {

            await boost.connect(user1)["boost(address,uint256,uint256)"](
                user2.address,
                boost_amount,
                end_time
            )

            await expect(
                boost.connect(user1)["boost(address,uint256,uint256)"](
                    admin.address,
                    ethers.utils.parseEther('4500'),
                    end_time
                )
            ).to.be.reverted

        });

        it(' should fail if trying to boost more than the current delegable balance - already delegating', async () => {

            await expect(
                boost.connect(user1)["boost(address,uint256,uint256)"](
                    user2.address,
                    lock_amount.mul(2),
                    end_time
                )
            ).to.be.reverted

        });

        it(' should allow user with allowance to boost from spender', async () => {

            await boost.connect(user1).approve(user2.address, boost_amount.mul(2))

            const prev_allowance = await boost.allowance(user1.address, user2.address)

            const prev_adjusted_balance1 = await boost.adjusted_balance_of(user1.address)
            const prev_adjusted_balance2 = await boost.adjusted_balance_of(user2.address)

            const prev_delegated_balance = await boost.delegated_balance(user1.address)
            const prev_delegeable_balance = await boost.delegable_balance(user1.address)
            const prev_received_balance = await boost.received_balance(user2.address)

            const prev_user1_slope_changes = await boost.delegated_slope_changes(user1.address, end_time)
            const prev_user2_slope_changes = await boost.received_slope_changes(user2.address, end_time)

            const prev_user1_delegated_nonce = await boost.delegated_checkpoints_nonces(user1.address)
            const prev_user2_received_nonce = await boost.received_checkpoints_nonces(user2.address)

            const prev_user2_delegated_nonce = await boost.delegated_checkpoints_nonces(user2.address)
            const prev_user1_received_nonce = await boost.received_checkpoints_nonces(user1.address)

            const boost_tx = await boost.connect(user2)["boost(address,uint256,uint256,address)"](
                user2.address,
                boost_amount,
                end_time,
                user1.address
            )
            
            const tx_block = (await boost_tx).blockNumber
            const tx_ts = (await ethers.provider.getBlock(tx_block || 0)).timestamp

            const new_allowance = await boost.allowance(user1.address, user2.address)

            expect(new_allowance).to.be.equal(prev_allowance.sub(boost_amount))

            const user1_point = await boost.delegated_point(user1.address)
            const user2_point = await boost.received_point(user2.address)

            const new_user1_slope_changes = await boost.delegated_slope_changes(user1.address, end_time)
            const new_user2_slope_changes = await boost.received_slope_changes(user2.address, end_time)

            const new_adjusted_balance1 = await boost.adjusted_balance_of(user1.address, { blockTag: tx_block })
            const new_adjusted_balance2 = await boost.adjusted_balance_of(user2.address, { blockTag: tx_block })

            const new_delegated_balance = await boost.delegated_balance(user1.address, { blockTag: tx_block })
            const new_delegeable_balance = await boost.delegable_balance(user1.address, { blockTag: tx_block })
            const new_received_balance = await boost.received_balance(user2.address, { blockTag: tx_block })

            const expected_slope = boost_amount.div(end_time.sub(tx_ts))
            const expected_bias = expected_slope.mul(end_time.sub(tx_ts))

            expect(user1_point.slope).to.be.equal(expected_slope)
            expect(user1_point.bias).to.be.equal(expected_bias)
            expect(user1_point.ts).to.be.equal(tx_ts)

            expect(user2_point.slope).to.be.equal(expected_slope)
            expect(user2_point.bias).to.be.equal(expected_bias)
            expect(user2_point.ts).to.be.equal(tx_ts)

            expect(new_user1_slope_changes).to.be.equal(prev_user1_slope_changes.add(expected_slope))
            expect(new_user2_slope_changes).to.be.equal(prev_user2_slope_changes.add(expected_slope))

            expect(new_adjusted_balance1).to.be.equal(prev_adjusted_balance1.sub(expected_bias))
            expect(new_adjusted_balance2).to.be.equal(prev_adjusted_balance2.add(expected_bias))

            expect(new_delegated_balance).to.be.equal(prev_delegated_balance.add(expected_bias))
            expect(new_delegeable_balance).to.be.equal(prev_delegeable_balance.sub(expected_bias))
            expect(new_received_balance).to.be.equal(prev_received_balance.add(expected_bias))

            expect(await boost.delegated_checkpoints_nonces(user1.address)).to.be.equal(prev_user1_delegated_nonce.add(1))
            expect(await boost.received_checkpoints_nonces(user2.address)).to.be.equal(prev_user2_received_nonce.add(1))

            expect(await boost.delegated_checkpoints_nonces(user2.address)).to.be.equal(prev_user2_delegated_nonce.add(1))
            expect(await boost.received_checkpoints_nonces(user1.address)).to.be.equal(prev_user1_received_nonce.add(1))

            expect(await boost.delegated_checkpoints_dates(user1.address, prev_user1_delegated_nonce)).to.be.equal(tx_ts)
            expect(await boost.received_checkpoints_dates(user2.address, prev_user2_received_nonce)).to.be.equal(tx_ts)

            expect(await boost.received_checkpoints_dates(user1.address, prev_user1_received_nonce)).to.be.equal(tx_ts)
            expect(await boost.delegated_checkpoints_dates(user2.address, prev_user2_delegated_nonce)).to.be.equal(tx_ts)

            expect(boost_tx).to.emit(boost, "Transfer").withArgs(
                user1.address,
                user2.address,
                boost_amount
            );

            expect(boost_tx).to.emit(boost, "Boost").withArgs(
                user1.address,
                user2.address,
                expected_bias,
                expected_slope,
                tx_ts
            );

        });

        it(' should not update allowance if Max was given', async () => {

            await boost.connect(user1).approve(user2.address, ethers.constants.MaxUint256)

            const prev_allowance = await boost.allowance(user1.address, user2.address)

            await boost.connect(user2)["boost(address,uint256,uint256,address)"](
                user2.address,
                boost_amount,
                end_time,
                user1.address
            )

            const new_allowance = await boost.allowance(user1.address, user2.address)

            expect(new_allowance).to.be.equal(prev_allowance)

        });

        it(' should fail if no allowance', async () => {

            await expect(
                boost.connect(user2)["boost(address,uint256,uint256,address)"](
                    user2.address,
                    boost_amount,
                    end_time,
                    user1.address
                )
            ).to.be.reverted

        });

    });

    describe('checkpoint_user', async () => {

        const boost_amount = ethers.utils.parseEther('1000')

        const duration = WEEK.mul(25)

        let end_time: BigNumber;

        beforeEach(async () => {

            await setUpLocks()

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            end_time = BigNumber.from(current_ts).add(duration).div(WEEK).mul(WEEK)

            await boost.connect(user1)["boost(address,uint256,uint256)"](
                user2.address,
                boost_amount,
                end_time
            )

        });

        it(' should update the point - delegated_point side', async () => {

            await advanceTime(duration.div(2).toNumber())

            const old_user_point = await boost.delegated_point(user1.address)

            const prev_user_delegated_nonce = await boost.delegated_checkpoints_nonces(user1.address)
            const prev_user_received_nonce = await boost.received_checkpoints_nonces(user1.address)

            const checkpoint_tx = await boost.connect(admin).checkpoint_user(user1.address)
            
            const tx_block = (await checkpoint_tx).blockNumber
            const tx_ts = BigNumber.from((await ethers.provider.getBlock(tx_block || 0)).timestamp)

            let new_slope = old_user_point.slope
            let new_bias = old_user_point.bias

            let last_update_ts = old_user_point.ts

            let ts = old_user_point.ts.div(WEEK).mul(WEEK)

            while(ts.lt(tx_ts)) {
                ts = ts.add(WEEK)
                if(ts.gt(tx_ts)) ts = tx_ts

                new_bias = new_bias.sub(new_slope.mul(ts.sub(last_update_ts)))

                last_update_ts = ts
                new_slope = new_slope.sub(
                    await boost.delegated_slope_changes(user1.address, ts)
                )
                
            }

            const new_user_point = await boost.delegated_point(user1.address)

            expect(new_user_point.slope).to.be.equal(new_slope)
            expect(new_user_point.bias).to.be.equal(new_bias)
            expect(new_user_point.ts).to.be.equal(tx_ts)

            expect(await boost.delegated_checkpoints_nonces(user1.address)).to.be.equal(prev_user_delegated_nonce.add(1))
            expect(await boost.received_checkpoints_nonces(user1.address)).to.be.equal(prev_user_received_nonce.add(1))

            expect(await boost.delegated_checkpoints_dates(user1.address, prev_user_delegated_nonce)).to.be.equal(tx_ts)
            expect(await boost.received_checkpoints_dates(user1.address, prev_user_received_nonce)).to.be.equal(tx_ts)


        });

        it(' should update the point - received_point side', async () => {

            await advanceTime(duration.div(2).toNumber())

            const old_user_point = await boost.received_point(user2.address)

            const prev_user_delegated_nonce = await boost.delegated_checkpoints_nonces(user2.address)
            const prev_user_received_nonce = await boost.received_checkpoints_nonces(user2.address)

            const checkpoint_tx = await boost.connect(admin).checkpoint_user(user2.address)
            
            const tx_block = (await checkpoint_tx).blockNumber
            const tx_ts = BigNumber.from((await ethers.provider.getBlock(tx_block || 0)).timestamp)

            let new_slope = old_user_point.slope
            let new_bias = old_user_point.bias

            let last_update_ts = old_user_point.ts

            let ts = old_user_point.ts.div(WEEK).mul(WEEK)

            while(ts.lt(tx_ts)) {
                ts = ts.add(WEEK)
                if(ts.gt(tx_ts)) ts = tx_ts

                new_bias = new_bias.sub(new_slope.mul(ts.sub(last_update_ts)))

                last_update_ts = ts
                new_slope = new_slope.sub(
                    await boost.received_slope_changes(user2.address, ts)
                )
                
            }

            const new_user_point = await boost.received_point(user2.address)

            expect(new_user_point.slope).to.be.equal(new_slope)
            expect(new_user_point.bias).to.be.equal(new_bias)
            expect(new_user_point.ts).to.be.equal(tx_ts)

            expect(await boost.delegated_checkpoints_nonces(user2.address)).to.be.equal(prev_user_delegated_nonce.add(1))
            expect(await boost.received_checkpoints_nonces(user2.address)).to.be.equal(prev_user_received_nonce.add(1))

            expect(await boost.delegated_checkpoints_dates(user2.address, prev_user_delegated_nonce)).to.be.equal(tx_ts)
            expect(await boost.received_checkpoints_dates(user2.address, prev_user_received_nonce)).to.be.equal(tx_ts)

        });

        it(' should put everything back to 0 after the delegation duration', async () => {

            await advanceTime(duration.add(WEEK).toNumber())

            const prev_user1_delegated_nonce = await boost.delegated_checkpoints_nonces(user1.address)
            const prev_user1_received_nonce = await boost.received_checkpoints_nonces(user1.address)

            const prev_user2_delegated_nonce = await boost.delegated_checkpoints_nonces(user2.address)
            const prev_user2_received_nonce = await boost.received_checkpoints_nonces(user2.address)

            const tx_1 = await boost.connect(admin).checkpoint_user(user1.address)

            const new_user1_point = await boost.delegated_point(user1.address)

            expect(new_user1_point.slope).to.be.equal(0)
            expect(new_user1_point.bias).to.be.equal(0)

            const tx_2 = await boost.connect(admin).checkpoint_user(user2.address)

            const new_user2_point = await boost.received_point(user2.address)

            expect(new_user2_point.slope).to.be.equal(0)
            expect(new_user2_point.bias).to.be.equal(0)
            
            const tx_block1 = (await tx_1).blockNumber
            const tx_block2 = (await tx_2).blockNumber
            const tx_ts1 = (await ethers.provider.getBlock(tx_block1 || 0)).timestamp
            const tx_ts2 = (await ethers.provider.getBlock(tx_block2 || 0)).timestamp

            expect(await boost.delegated_checkpoints_nonces(user1.address)).to.be.equal(prev_user1_delegated_nonce.add(1))
            expect(await boost.received_checkpoints_nonces(user2.address)).to.be.equal(prev_user2_received_nonce.add(1))

            expect(await boost.delegated_checkpoints_nonces(user2.address)).to.be.equal(prev_user2_delegated_nonce.add(1))
            expect(await boost.received_checkpoints_nonces(user1.address)).to.be.equal(prev_user1_received_nonce.add(1))

            expect(await boost.delegated_checkpoints_dates(user1.address, prev_user1_delegated_nonce)).to.be.equal(tx_ts1)
            expect(await boost.received_checkpoints_dates(user1.address, prev_user1_received_nonce)).to.be.equal(tx_ts1)

            expect(await boost.received_checkpoints_dates(user2.address, prev_user2_received_nonce)).to.be.equal(tx_ts2)
            expect(await boost.delegated_checkpoints_dates(user2.address, prev_user2_delegated_nonce)).to.be.equal(tx_ts2)

        });

    });

    describe('balanceOf & adjusted_balance_of', async () => {

        const boost_amount = ethers.utils.parseEther('1000')

        const duration = WEEK.mul(200)

        let end_time: BigNumber;

        beforeEach(async () => {

            await setUpLocks()

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            end_time = BigNumber.from(current_ts).add(duration).div(WEEK).mul(WEEK)

            await boost.connect(user1)["boost(address,uint256,uint256)"](
                user2.address,
                boost_amount,
                end_time
            )

        });

        it(' should return the correct balance for users', async () => {

            const old_user2_point = await boost.delegated_point(user1.address)
            const user1_balance = await holyPalPower.balanceOf(user1.address)
            const user2_balance = await holyPalPower.balanceOf(user2.address)

            await advanceTime(duration.div(2).toNumber())

            const current_ts = BigNumber.from(await provider.getBlock('latest').then(b => b.timestamp))

            let new_slope = old_user2_point.slope
            let new_bias = old_user2_point.bias

            let last_update_ts = old_user2_point.ts

            let ts = old_user2_point.ts.div(WEEK).mul(WEEK)

            while(ts.lt(current_ts)) {
                ts = ts.add(WEEK)
                if(ts.gt(current_ts)) ts = current_ts

                new_bias = new_bias.sub(new_slope.mul(ts.sub(last_update_ts)))

                last_update_ts = ts
                new_slope = new_slope.sub(
                    await boost.delegated_slope_changes(user1.address, ts)
                )
                
            }

            expect(await boost.balanceOf(user1.address)).to.be.equal(user1_balance.sub(new_bias))
            expect(await boost.balanceOf(user2.address)).to.be.equal(user2_balance.add(new_bias))

            expect(await boost.adjusted_balance_of(user1.address)).to.be.equal(user1_balance.sub(new_bias))
            expect(await boost.adjusted_balance_of(user2.address)).to.be.equal(user2_balance.add(new_bias))

            await advanceTime(duration.div(2).add(WEEK).toNumber())

            expect(await boost.balanceOf(user1.address)).to.be.equal(user1_balance)
            expect(await boost.balanceOf(user2.address)).to.be.equal(user2_balance)

            expect(await boost.adjusted_balance_of(user1.address)).to.be.equal(user1_balance)
            expect(await boost.adjusted_balance_of(user2.address)).to.be.equal(user2_balance)

        });

    });

    describe('balanceOfAt & adjusted_balance_of_at', async () => {

        const boost_amount = ethers.utils.parseEther('1000')

        const duration = WEEK.mul(200)

        let end_time: BigNumber;
        let target_ts: BigNumber;

        beforeEach(async () => {

            await setUpLocks()

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            end_time = BigNumber.from(current_ts).add(duration).div(WEEK).mul(WEEK)

            await boost.connect(user1)["boost(address,uint256,uint256)"](
                user2.address,
                boost_amount,
                end_time
            )

            target_ts = BigNumber.from(current_ts).add(WEEK.mul(3))

            await holyPalPower.connect(admin).setBalanceAt(user1.address, target_ts, lock_amount)
            await holyPalPower.connect(admin).setBalanceAt(user2.address, target_ts, lock_amount2)

            advanceTime(WEEK.mul(7).toNumber())
        });

        it(' should return the correct balance for users for the target ts', async () => {

            const old_user1_point = await boost.delegated_point(user1.address)
            const user1_balance = await holyPalPower.balanceOfAt(user1.address, target_ts)
            const user2_balance = await holyPalPower.balanceOfAt(user2.address, target_ts)

            let new_slope = old_user1_point.slope
            let new_bias = old_user1_point.bias

            let last_update_ts = old_user1_point.ts

            let ts = old_user1_point.ts.div(WEEK).mul(WEEK)

            while(ts.lt(target_ts)) {
                ts = ts.add(WEEK)
                if(ts.gt(target_ts)) ts = target_ts

                new_bias = new_bias.sub(new_slope.mul(ts.sub(last_update_ts)))

                last_update_ts = ts
                new_slope = new_slope.sub(
                    await boost.delegated_slope_changes(user1.address, ts)
                )
                
            }

            expect(await boost.balanceOfAt(user1.address, target_ts)).to.be.equal(user1_balance.sub(new_bias))
            expect(await boost.balanceOfAt(user2.address, target_ts)).to.be.equal(user2_balance.add(new_bias))

            expect(await boost.adjusted_balance_of_at(user1.address, target_ts)).to.be.equal(user1_balance.sub(new_bias))
            expect(await boost.adjusted_balance_of_at(user2.address, target_ts)).to.be.equal(user2_balance.add(new_bias))

        });

        it(' should return the correct balance for users for the target ts after an extra delegation', async () => {

            await boost.connect(user1)["boost(address,uint256,uint256)"](
                user2.address,
                boost_amount.sub(ethers.utils.parseEther('100')),
                end_time.add(WEEK.mul(5))
            )

            advanceTime(WEEK.mul(2).toNumber())

            const old_user1_point = await boost.delegated(user1.address, 
                (await boost.delegated_checkpoints_nonces(user1.address)).sub(2)
            )
            const user1_balance = await holyPalPower.balanceOfAt(user1.address, target_ts)
            const user2_balance = await holyPalPower.balanceOfAt(user2.address, target_ts)

            let new_slope = old_user1_point.slope
            let new_bias = old_user1_point.bias

            let last_update_ts = old_user1_point.ts

            let ts = old_user1_point.ts.div(WEEK).mul(WEEK)

            while(ts.lt(target_ts)) {
                ts = ts.add(WEEK)
                if(ts.gt(target_ts)) ts = target_ts

                new_bias = new_bias.sub(new_slope.mul(ts.sub(last_update_ts)))

                last_update_ts = ts
                new_slope = new_slope.sub(
                    await boost.delegated_slope_changes(user1.address, ts)
                )
                
            }

            expect(await boost.balanceOfAt(user1.address, target_ts)).to.be.equal(user1_balance.sub(new_bias))
            expect(await boost.balanceOfAt(user2.address, target_ts)).to.be.equal(user2_balance.add(new_bias))

            expect(await boost.adjusted_balance_of_at(user1.address, target_ts)).to.be.equal(user1_balance.sub(new_bias))
            expect(await boost.adjusted_balance_of_at(user2.address, target_ts)).to.be.equal(user2_balance.add(new_bias))

        });

        it(' should return null balance if target_ts is before the boost creation', async () => {
            
            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            end_time = BigNumber.from(current_ts).add(duration).div(WEEK).mul(WEEK)

            await boost.connect(user1)["boost(address,uint256,uint256)"](
                user3.address,
                boost_amount,
                end_time
            )

            target_ts = BigNumber.from(current_ts).sub(WEEK)

            expect(await boost.balanceOfAt(user3.address, target_ts)).to.be.equal(0)

            expect(await boost.adjusted_balance_of_at(user3.address, target_ts)).to.be.equal(0)

            await advanceTime(WEEK.mul(2).toNumber())

            expect(await boost.balanceOfAt(user3.address, target_ts)).to.be.equal(0)

            expect(await boost.adjusted_balance_of_at(user3.address, target_ts)).to.be.equal(0)

        });

    });

    describe('voting_adjusted_balance_of_at', async () => {

        const boost_amount = ethers.utils.parseEther('1000')

        const duration = WEEK.mul(200)

        let end_time: BigNumber;
        let target_ts: BigNumber;
        let snapshot_ts: BigNumber;

        beforeEach(async () => {

            await setUpLocks()

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            end_time = BigNumber.from(current_ts).add(duration).div(WEEK).mul(WEEK)

            await boost.connect(user1)["boost(address,uint256,uint256)"](
                user2.address,
                boost_amount,
                end_time
            )

            snapshot_ts = BigNumber.from(current_ts).add(WEEK.mul(2))
            target_ts = BigNumber.from(current_ts).add(WEEK.mul(3))

            await holyPalPower.connect(admin).setBalanceAt(user1.address, snapshot_ts, lock_amount)
            await holyPalPower.connect(admin).setBalanceAt(user2.address, snapshot_ts, lock_amount2)

            advanceTime(WEEK.mul(7).toNumber())
        });

        it(' should return the correct balance for users for the target ts', async () => {

            const old_user1_point = await boost.delegated_point(user1.address)
            const user1_balance = await holyPalPower.balanceOfAt(user1.address, snapshot_ts)
            const user2_balance = await holyPalPower.balanceOfAt(user2.address, snapshot_ts)

            let new_slope = old_user1_point.slope
            let new_bias = old_user1_point.bias

            let last_update_ts = old_user1_point.ts

            let ts = old_user1_point.ts.div(WEEK).mul(WEEK)

            while(ts.lt(target_ts)) {
                ts = ts.add(WEEK)
                if(ts.gt(target_ts)) ts = target_ts

                new_bias = new_bias.sub(new_slope.mul(ts.sub(last_update_ts)))

                last_update_ts = ts
                new_slope = new_slope.sub(
                    await boost.delegated_slope_changes(user1.address, ts)
                )
                
            }

            expect(await boost.voting_adjusted_balance_of_at(user1.address, snapshot_ts, target_ts)).to.be.equal(user1_balance.sub(new_bias))
            expect(await boost.voting_adjusted_balance_of_at(user2.address, snapshot_ts, target_ts)).to.be.equal(user2_balance.add(new_bias))

        });

        it(' should return the correct balance for users for the target ts after an extra delegation', async () => {

            await boost.connect(user1)["boost(address,uint256,uint256)"](
                user2.address,
                boost_amount.sub(ethers.utils.parseEther('100')),
                end_time.add(WEEK.mul(5))
            )

            advanceTime(WEEK.mul(2).toNumber())

            const old_user1_point = await boost.delegated(user1.address, 
                (await boost.delegated_checkpoints_nonces(user1.address)).sub(2)
            )
            const user1_balance = await holyPalPower.balanceOfAt(user1.address, snapshot_ts)
            const user2_balance = await holyPalPower.balanceOfAt(user2.address, snapshot_ts)

            let new_slope = old_user1_point.slope
            let new_bias = old_user1_point.bias

            let last_update_ts = old_user1_point.ts

            let ts = old_user1_point.ts.div(WEEK).mul(WEEK)

            while(ts.lt(target_ts)) {
                ts = ts.add(WEEK)
                if(ts.gt(target_ts)) ts = target_ts

                new_bias = new_bias.sub(new_slope.mul(ts.sub(last_update_ts)))

                last_update_ts = ts
                new_slope = new_slope.sub(
                    await boost.delegated_slope_changes(user1.address, ts)
                )
                
            }

            expect(await boost.voting_adjusted_balance_of_at(user1.address, snapshot_ts, target_ts)).to.be.equal(user1_balance.sub(new_bias))
            expect(await boost.voting_adjusted_balance_of_at(user2.address, snapshot_ts, target_ts)).to.be.equal(user2_balance.add(new_bias))

        });

    });

    describe('delegated_balance & received_balance & delegable_balance', async () => {

        const boost_amount = ethers.utils.parseEther('1000')

        const duration = WEEK.mul(200)

        let end_time: BigNumber;

        beforeEach(async () => {

            await setUpLocks()

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            end_time = BigNumber.from(current_ts).add(duration).div(WEEK).mul(WEEK)

            await boost.connect(user1)["boost(address,uint256,uint256)"](
                user2.address,
                boost_amount,
                end_time
            )

        });

        it(' should return the correct amount - delegated_balance & delegable_balance', async () => {

            const old_user_point = await boost.delegated_point(user1.address)
            const user_balance = await holyPalPower.balanceOf(user1.address)

            await advanceTime(duration.div(2).toNumber())

            const current_ts = BigNumber.from(await provider.getBlock('latest').then(b => b.timestamp))

            let new_slope = old_user_point.slope
            let new_bias = old_user_point.bias

            let last_update_ts = old_user_point.ts

            let ts = old_user_point.ts.div(WEEK).mul(WEEK)

            while(ts.lt(current_ts)) {
                ts = ts.add(WEEK)
                if(ts.gt(current_ts)) ts = current_ts

                new_bias = new_bias.sub(new_slope.mul(ts.sub(last_update_ts)))

                last_update_ts = ts
                new_slope = new_slope.sub(
                    await boost.delegated_slope_changes(user1.address, ts)
                )
                
            }

            expect(await boost.delegated_balance(user1.address)).to.be.equal(new_bias)
            expect(await boost.delegable_balance(user1.address)).to.be.equal(user_balance.sub(new_bias))

            await advanceTime(duration.div(2).add(WEEK).toNumber())

            expect(await boost.delegated_balance(user1.address)).to.be.equal(0)
            expect(await boost.delegable_balance(user1.address)).to.be.equal(user_balance)


        });

        it(' should return the correct amount - received_balance', async () => {

            const old_user_point = await boost.received_point(user2.address)

            await advanceTime(duration.div(2).toNumber())

            const current_ts = BigNumber.from(await provider.getBlock('latest').then(b => b.timestamp))

            let new_slope = old_user_point.slope
            let new_bias = old_user_point.bias

            let last_update_ts = old_user_point.ts

            let ts = old_user_point.ts.div(WEEK).mul(WEEK)

            while(ts.lt(current_ts)) {
                ts = ts.add(WEEK)
                if(ts.gt(current_ts)) ts = current_ts

                new_bias = new_bias.sub(new_slope.mul(ts.sub(last_update_ts)))

                last_update_ts = ts
                new_slope = new_slope.sub(
                    await boost.received_slope_changes(user2.address, ts)
                )
                
            }

            expect(await boost.received_balance(user2.address)).to.be.equal(new_bias)

            await advanceTime(duration.div(2).add(WEEK).toNumber())

            expect(await boost.received_balance(user2.address)).to.be.equal(0)

        });

        it(' should return 0 & empty Points if user never created or received Boost', async () => {

            expect(await boost.delegated_balance(user3.address)).to.be.equal(0)
            expect(await boost.received_balance(user3.address)).to.be.equal(0)
            expect(await boost.delegable_balance(user3.address)).to.be.equal(0)

            const delegated_point = await boost.delegated_point(user3.address)
            const received_point = await boost.received_point(user3.address)

            expect(delegated_point.slope).to.be.equal(0)
            expect(delegated_point.bias).to.be.equal(0)
            expect(delegated_point.ts).to.be.equal(0)

            expect(received_point.slope).to.be.equal(0)
            expect(received_point.bias).to.be.equal(0)
            expect(received_point.ts).to.be.equal(0)

        });

    });

    describe('totalSupply & total_locked & total_locked_at', async () => {

        const total_locked = ethers.utils.parseEther("1000")
        const past_total_locked = ethers.utils.parseEther("1250")

        const past_block_number = 175250

        beforeEach(async () => {

            await holyPalPower.connect(admin).setTotalLocked(total_locked)
            await holyPalPower.connect(admin).setTotalLockedAt(past_block_number, past_total_locked)

        });

        it(' should return the correct data', async () => {

            expect(await boost.totalSupply()).to.be.eq(total_locked)

            expect(await boost.total_locked()).to.be.eq(total_locked)

            expect(await boost.total_locked_at(past_block_number)).to.be.eq(past_total_locked)

        });

    });

});