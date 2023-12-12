const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { DelegationProxy } from "../../typechain/contracts/boost/DelegationProxy.vy/DelegationProxy";
import { BoostV2 } from "../../typechain/contracts/boost/BoostV2.vy/BoostV2";
import { HolyPalPower } from "../../typechain/contracts/HolyPalPower";
import { IHolyPaladinToken } from "../../typechain/contracts/interfaces/IHolyPaladinToken";
import { IHolyPaladinToken__factory } from "../../typechain/factories/contracts/interfaces/IHolyPaladinToken__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

import {
    advanceTime,
    resetFork
} from "../utils/utils";

import {
    HPAL,
    HPAL_LOCKERS,
    BLOCK_NUMBER
} from "./constant";

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

const WEEK = BigNumber.from(86400 * 7)
const UNIT = ethers.utils.parseEther('1')
const MAX_TIME = BigNumber.from(86400 * 365 * 4)

let proxyFactory: ContractFactory
let boostFactory: ContractFactory
let powerFactory: ContractFactory

describe('Delegation Boost tests', () => {
    let admin: SignerWithAddress

    let proxy: DelegationProxy

    let power: HolyPalPower

    let hPal: IHolyPaladinToken

    let boost: BoostV2

    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress

    before(async () => {
        await resetFork(BLOCK_NUMBER);

        [admin] = await ethers.getSigners();

        proxyFactory = await ethers.getContractFactory("DelegationProxy");
        boostFactory = await ethers.getContractFactory("BoostV2");
        powerFactory = await ethers.getContractFactory("contracts/HolyPalPower.sol:HolyPalPower");

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
    
        user1 = await ethers.getSigner(HPAL_LOCKERS[0])
        user2 = await ethers.getSigner(HPAL_LOCKERS[1])
        user3 = await ethers.getSigner(HPAL_LOCKERS[2])

    })

    beforeEach(async () => {

        power = (await powerFactory.connect(admin).deploy(
            HPAL
        )) as HolyPalPower
        await power.deployed()

        boost = (await boostFactory.connect(admin).deploy(
            power.address,
        )) as BoostV2
        await boost.deployed()

        proxy = (await proxyFactory.connect(admin).deploy(
            power.address,
            boost.address,
            admin.address,
            admin.address
        )) as DelegationProxy
        await proxy.deployed()

    });

    it(' should be deployed correctly', async () => {
        expect(power.address).to.properAddress
        expect(boost.address).to.properAddress
        expect(proxy.address).to.properAddress

        expect(await power.hPal()).to.be.eq(HPAL)

        expect(await boost.HOLY_PAL_POWER()).to.be.equal(power.address)
        expect(await boost.name()).to.be.equal("HolyPal Power Boost")
        expect(await boost.symbol()).to.be.equal("hPalBoost")
        expect(await boost.decimals()).to.be.equal(18)

        expect(await proxy.delegation()).to.be.eq(boost.address)
        expect(await proxy.ownership_admin()).to.be.eq(admin.address)
        expect(await proxy.emergency_admin()).to.be.eq(admin.address)
        expect(await proxy.future_emergency_admin()).to.be.eq(ethers.constants.AddressZero)
        expect(await proxy.future_ownership_admin()).to.be.eq(ethers.constants.AddressZero)
    });

    describe('boost', async () => {

        const boost_amount = ethers.utils.parseEther('55000')

        const duration = WEEK.mul(12)

        let end_time: BigNumber;

        beforeEach(async () => {

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            end_time = BigNumber.from(current_ts).add(duration).div(WEEK).mul(WEEK)

        });

        it(' should delegate correctly', async () => {

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

            const current_user1_balance = await power.balanceOf(user1.address, { blockTag: tx_block })
            const current_user2_balance = await power.balanceOf(user2.address, { blockTag: tx_block })

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

            expect(new_adjusted_balance1).to.be.equal(current_user1_balance.sub(expected_bias))
            expect(new_adjusted_balance2).to.be.equal(current_user2_balance.add(expected_bias))

            expect(new_delegated_balance).to.be.equal(expected_bias)
            expect(new_delegeable_balance).to.be.equal(current_user1_balance.sub(expected_bias))
            expect(new_received_balance).to.be.equal(expected_bias)

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

            // check balances & adjusted return correct data
            expect(await boost.adjusted_balance_of(user1.address, { blockTag: tx_block })).to.be.equal(
                (await power.balanceOf(user1.address, { blockTag: tx_block })).sub(new_delegated_balance)
            )
            expect(await proxy.adjusted_balance_of(user1.address, { blockTag: tx_block })).to.be.equal(
                (await power.balanceOf(user1.address, { blockTag: tx_block })).sub(new_delegated_balance)
            )

            expect(await boost.adjusted_balance_of(user2.address, { blockTag: tx_block })).to.be.equal(
                (await power.balanceOf(user2.address, { blockTag: tx_block })).add(new_received_balance)
            )
            expect(await proxy.adjusted_balance_of(user2.address, { blockTag: tx_block })).to.be.equal(
                (await power.balanceOf(user2.address, { blockTag: tx_block })).add(new_received_balance)
            )

            await advanceTime(duration.toNumber())

            expect(await boost.adjusted_balance_of(user1.address)).to.be.equal(await power.balanceOf(user1.address))
            expect(await boost.balanceOf(user1.address)).to.be.equal(await power.balanceOf(user1.address))
            expect(await boost.adjusted_balance_of(user2.address)).to.be.equal(await power.balanceOf(user2.address))
            expect(await boost.balanceOf(user2.address)).to.be.equal(await power.balanceOf(user2.address))

            expect(await proxy.adjusted_balance_of(user1.address)).to.be.equal(await power.balanceOf(user1.address))
            expect(await proxy.adjusted_balance_of(user2.address)).to.be.equal(await power.balanceOf(user2.address))
            
            expect(await boost.delegated_balance(user1.address)).to.be.eq(0)
            expect(await boost.received_balance(user2.address)).to.be.eq(0)

            const prev_user1_delegated_nonce2 = await boost.delegated_checkpoints_nonces(user1.address)
            const prev_user1_received_nonce2 = await boost.received_checkpoints_nonces(user1.address)

            const prev_user2_delegated_nonce2 = await boost.delegated_checkpoints_nonces(user2.address)
            const prev_user2_received_nonce2 = await boost.received_checkpoints_nonces(user2.address)

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

            expect(await boost.delegated_checkpoints_nonces(user1.address)).to.be.equal(prev_user1_delegated_nonce2.add(1))
            expect(await boost.received_checkpoints_nonces(user2.address)).to.be.equal(prev_user2_received_nonce2.add(1))

            expect(await boost.delegated_checkpoints_nonces(user2.address)).to.be.equal(prev_user2_delegated_nonce2.add(1))
            expect(await boost.received_checkpoints_nonces(user1.address)).to.be.equal(prev_user1_received_nonce2.add(1))

            expect(await boost.delegated_checkpoints_dates(user1.address, prev_user1_delegated_nonce2)).to.be.equal(tx_ts1)
            expect(await boost.received_checkpoints_dates(user1.address, prev_user1_received_nonce2)).to.be.equal(tx_ts1)

            expect(await boost.received_checkpoints_dates(user2.address, prev_user2_received_nonce2)).to.be.equal(tx_ts2)
            expect(await boost.delegated_checkpoints_dates(user2.address, prev_user2_delegated_nonce2)).to.be.equal(tx_ts2)
        });
    
    });


});
