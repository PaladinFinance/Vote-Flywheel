const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { HolyPalPower } from "../../typechain/contracts/HolyPalPower";
import { IHolyPaladinToken } from "../../typechain/contracts/interfaces/IHolyPaladinToken";
import { IHolyPaladinToken__factory } from "../../typechain/factories/contracts/interfaces/IHolyPaladinToken__factory";
import { LootVoteController } from "../../typechain/contracts/LootVoteController";
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
    BLOCK_NUMBER,
    BOARDS,
    VALID_GAUGES
} from "./constant";

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

const WEEK = BigNumber.from(86400 * 7)
const UNIT = ethers.utils.parseEther('1')
const MAX_TIME = BigNumber.from(86400 * 365 * 4)

let powerFactory: ContractFactory
let controllerFactory: ContractFactory

describe('Vote Controller - Voting tests', () => {
    let admin: SignerWithAddress

    let power: HolyPalPower

    let hPal: IHolyPaladinToken

    let controller: LootVoteController

    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress

    before(async () => {
        await resetFork(BLOCK_NUMBER);

        [admin] = await ethers.getSigners();

        controllerFactory = await ethers.getContractFactory("LootVoteController");
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

        controller = (await controllerFactory.connect(admin).deploy(
            power.address
        )) as LootVoteController
        await controller.deployed()

    });

    it(' should be deployed correctly', async () => {
        expect(power.address).to.properAddress
        expect(controller.address).to.properAddress

        expect(await power.hPal()).to.be.eq(HPAL)

        expect(await controller.hPalPower()).to.be.eq(power.address)

        expect(await controller.nextBoardId()).to.be.eq(1)
        expect(await controller.defaultCap()).to.be.eq(ethers.utils.parseEther("0.1"))

    });

    describe('vote for gauges', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                BOARDS[0].board,
                BOARDS[0].distributor,
            )
            await controller.connect(admin).addNewBoard(
                BOARDS[1].board,
                BOARDS[1].distributor,
            )

            await controller.connect(admin).addNewGauge(
                VALID_GAUGES[0].gauge,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                VALID_GAUGES[1].gauge,
                board1_id,
                ethers.utils.parseEther("0.15")
            )
            await controller.connect(admin).addNewGauge(
                VALID_GAUGES[2].gauge,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                VALID_GAUGES[3].gauge,
                board2_id,
                0
            )

        });

        it(' should vote for the gauge with the correct power - 1 user', async () => {

            const vote_power = 4000

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const previous_gauge_change = await controller.changesWeight(VALID_GAUGES[0].gauge, user_point.endTimestamp)
            const previous_total_change = await controller.changesWeightTotal(user_point.endTimestamp)

            const tx = await controller.connect(user1).voteForGaugeWeights(VALID_GAUGES[0].gauge, vote_power)
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const expected_vote_slope = user_point.slope.mul(vote_power).div(10000)
            const expected_vote_bias = expected_vote_slope.mul(user_point.endTimestamp.sub(next_period))

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.add(vote_power))
            expect(await controller.usedFreePower(user1.address)).to.be.eq(user_prev_used_power.add(vote_power))

            const new_gauge_point = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias.add(expected_vote_bias))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope.add(expected_vote_slope))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.add(expected_vote_bias))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.add(expected_vote_slope))

            expect(await controller.changesWeight(VALID_GAUGES[0].gauge, user_point.endTimestamp)).to.be.eq(previous_gauge_change.add(expected_vote_slope))
            expect(await controller.changesWeightTotal(user_point.endTimestamp)).to.be.eq(previous_total_change.add(expected_vote_slope))

            expect(await controller.lastUserVote(user1.address, VALID_GAUGES[0].gauge)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, VALID_GAUGES[0].gauge)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(vote_power)
            expect(last_user_vote_slope.end).to.be.eq(user_point.endTimestamp)
            expect(last_user_vote_slope.caller).to.be.eq(user1.address)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                VALID_GAUGES[0].gauge,
                vote_power
            )

        });

        it(' should vote for the gauge with the correct power - all users', async () => {

            const vote_power = 6000
            const vote_power2 = 5000
            const vote_power3 = 10000

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)
            const user_prev_used_power2 = await controller.voteUserPower(user2.address)
            const user_prev_used_power3 = await controller.voteUserPower(user3.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)
            const user_point2 = await power.getUserPointAt(user2.address, current_ts)
            const user_point3 = await power.getUserPointAt(user3.address, current_ts)

            const previous_gauge_change = await controller.changesWeight(VALID_GAUGES[0].gauge, user_point.endTimestamp)
            const previous_total_change = await controller.changesWeightTotal(user_point.endTimestamp)
            const previous_gauge_change2 = await controller.changesWeight(VALID_GAUGES[0].gauge, user_point2.endTimestamp)
            const previous_total_change2 = await controller.changesWeightTotal(user_point2.endTimestamp)
            const previous_gauge_change3 = await controller.changesWeight(VALID_GAUGES[0].gauge, user_point3.endTimestamp)
            const previous_total_change3 = await controller.changesWeightTotal(user_point3.endTimestamp)

            const tx = await controller.connect(user1).voteForGaugeWeights(VALID_GAUGES[0].gauge, vote_power)
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const tx2 = await controller.connect(user2).voteForGaugeWeights(VALID_GAUGES[0].gauge, vote_power2)
            const tx_ts2 = BigNumber.from((await provider.getBlock(tx2.blockNumber || 0)).timestamp)

            const tx3 = await controller.connect(user3).voteForGaugeWeights(VALID_GAUGES[0].gauge, vote_power3)
            const tx_ts3 = BigNumber.from((await provider.getBlock(tx3.blockNumber || 0)).timestamp)

            const expected_vote_slope = user_point.slope.mul(vote_power).div(10000)
            const expected_vote_bias = expected_vote_slope.mul(user_point.endTimestamp.sub(next_period))

            const expected_vote_slope2 = user_point2.slope.mul(vote_power2).div(10000)
            const expected_vote_bias2 = expected_vote_slope2.mul(user_point2.endTimestamp.sub(next_period))

            const expected_vote_slope3 = user_point3.slope.mul(vote_power3).div(10000)
            const expected_vote_bias3 = expected_vote_slope3.mul(user_point3.endTimestamp.sub(next_period))

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.add(vote_power))
            expect(await controller.voteUserPower(user2.address)).to.be.eq(user_prev_used_power2.add(vote_power2))
            expect(await controller.voteUserPower(user3.address)).to.be.eq(user_prev_used_power3.add(vote_power3))

            const new_gauge_point = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(
                previous_gauge_point.bias.add(expected_vote_bias).add(expected_vote_bias2).add(expected_vote_bias3)
            )
            expect(new_gauge_point.slope).to.be.eq(
                previous_gauge_point.slope.add(expected_vote_slope).add(expected_vote_slope2).add(expected_vote_slope3)
            )

            expect(new_total_point.bias).to.be.eq(
                previous_total_point.bias.add(expected_vote_bias).add(expected_vote_bias2).add(expected_vote_bias3)
            )
            expect(new_total_point.slope).to.be.eq(
                previous_total_point.slope.add(expected_vote_slope).add(expected_vote_slope2).add(expected_vote_slope3)
            )

            expect(await controller.changesWeight(VALID_GAUGES[0].gauge, user_point.endTimestamp)).to.be.eq(
                previous_gauge_change.add(expected_vote_slope)
            )
            expect(await controller.changesWeightTotal(user_point.endTimestamp)).to.be.eq(
                previous_total_change.add(expected_vote_slope)
            )

            expect(await controller.changesWeight(VALID_GAUGES[0].gauge, user_point2.endTimestamp)).to.be.eq(
                previous_gauge_change2.add(expected_vote_slope2)
            )
            expect(await controller.changesWeightTotal(user_point2.endTimestamp)).to.be.eq(
                previous_total_change2.add(expected_vote_slope2)
            )

            expect(await controller.changesWeight(VALID_GAUGES[0].gauge, user_point3.endTimestamp)).to.be.eq(
                previous_gauge_change3.add(expected_vote_slope3)
            )
            expect(await controller.changesWeightTotal(user_point3.endTimestamp)).to.be.eq(
                previous_total_change3.add(expected_vote_slope3)
            )

            expect(await controller.lastUserVote(user1.address, VALID_GAUGES[0].gauge)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user2.address, VALID_GAUGES[0].gauge)).to.be.eq(tx_ts2)
            expect(await controller.lastUserVote(user3.address, VALID_GAUGES[0].gauge)).to.be.eq(tx_ts3)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, VALID_GAUGES[0].gauge)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(vote_power)
            expect(last_user_vote_slope.end).to.be.eq(user_point.endTimestamp)

            const last_user_vote_slope2 = await controller.voteUserSlopes(user2.address, VALID_GAUGES[0].gauge)

            expect(last_user_vote_slope2.slope).to.be.eq(expected_vote_slope2)
            expect(last_user_vote_slope2.power).to.be.eq(vote_power2)
            expect(last_user_vote_slope2.end).to.be.eq(user_point2.endTimestamp)

            const last_user_vote_slope3 = await controller.voteUserSlopes(user3.address, VALID_GAUGES[0].gauge)

            expect(last_user_vote_slope3.slope).to.be.eq(expected_vote_slope3)
            expect(last_user_vote_slope3.power).to.be.eq(vote_power3)
            expect(last_user_vote_slope3.end).to.be.eq(user_point3.endTimestamp)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                VALID_GAUGES[0].gauge,
                vote_power
            )
            
            expect(tx2).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts2,
                user2.address,
                VALID_GAUGES[0].gauge,
                vote_power2
            )
            
            expect(tx3).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts3,
                user3.address,
                VALID_GAUGES[0].gauge,
                vote_power3
            )

        });

        it(' should vote for the gauges with the correct powers - 1 user', async () => {

            const vote_power = 4000
            const vote_power2 = 2500
            const vote_power3 = 3500

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const previous_gauge_point2 = await controller.pointsWeight(VALID_GAUGES[1].gauge, next_period)
            const previous_gauge_point3 = await controller.pointsWeight(VALID_GAUGES[2].gauge, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const previous_gauge_change = await controller.changesWeight(VALID_GAUGES[0].gauge, user_point.endTimestamp)
            const previous_gauge_change2 = await controller.changesWeight(VALID_GAUGES[1].gauge, user_point.endTimestamp)
            const previous_gauge_change3 = await controller.changesWeight(VALID_GAUGES[2].gauge, user_point.endTimestamp)
            const previous_total_change = await controller.changesWeightTotal(user_point.endTimestamp)

            const tx = await controller.connect(user1).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge],
                [vote_power, vote_power2, vote_power3]
            )
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const expected_vote_slope = user_point.slope.mul(vote_power).div(10000)
            const expected_vote_bias = expected_vote_slope.mul(user_point.endTimestamp.sub(next_period))
            const expected_vote_slope2 = user_point.slope.mul(vote_power2).div(10000)
            const expected_vote_bias2 = expected_vote_slope2.mul(user_point.endTimestamp.sub(next_period))
            const expected_vote_slope3 = user_point.slope.mul(vote_power3).div(10000)
            const expected_vote_bias3 = expected_vote_slope3.mul(user_point.endTimestamp.sub(next_period))

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.add(
                vote_power + vote_power2 + vote_power3
            ))

            const new_gauge_point = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const new_gauge_point2 = await controller.pointsWeight(VALID_GAUGES[1].gauge, next_period)
            const new_gauge_point3 = await controller.pointsWeight(VALID_GAUGES[2].gauge, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias.add(expected_vote_bias))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope.add(expected_vote_slope))
            expect(new_gauge_point2.bias).to.be.eq(previous_gauge_point2.bias.add(expected_vote_bias2))
            expect(new_gauge_point2.slope).to.be.eq(previous_gauge_point2.slope.add(expected_vote_slope2))
            expect(new_gauge_point3.bias).to.be.eq(previous_gauge_point3.bias.add(expected_vote_bias3))
            expect(new_gauge_point3.slope).to.be.eq(previous_gauge_point3.slope.add(expected_vote_slope3))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.add(
                expected_vote_bias.add(expected_vote_bias2).add(expected_vote_bias3)
            ))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.add(
                expected_vote_slope.add(expected_vote_slope2).add(expected_vote_slope3)
            ))

            expect(await controller.changesWeight(VALID_GAUGES[0].gauge, user_point.endTimestamp)).to.be.eq(previous_gauge_change.add(expected_vote_slope))
            expect(await controller.changesWeight(VALID_GAUGES[1].gauge, user_point.endTimestamp)).to.be.eq(previous_gauge_change2.add(expected_vote_slope2))
            expect(await controller.changesWeight(VALID_GAUGES[2].gauge, user_point.endTimestamp)).to.be.eq(previous_gauge_change3.add(expected_vote_slope3))
            expect(await controller.changesWeightTotal(user_point.endTimestamp)).to.be.eq(previous_total_change.add(
                expected_vote_slope.add(expected_vote_slope2).add(expected_vote_slope3)
            ))

            expect(await controller.lastUserVote(user1.address, VALID_GAUGES[0].gauge)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, VALID_GAUGES[0].gauge)
            const last_user_vote_slope2 = await controller.voteUserSlopes(user1.address, VALID_GAUGES[1].gauge)
            const last_user_vote_slope3 = await controller.voteUserSlopes(user1.address, VALID_GAUGES[2].gauge)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(vote_power)
            expect(last_user_vote_slope.end).to.be.eq(user_point.endTimestamp)

            expect(last_user_vote_slope2.slope).to.be.eq(expected_vote_slope2)
            expect(last_user_vote_slope2.power).to.be.eq(vote_power2)
            expect(last_user_vote_slope2.end).to.be.eq(user_point.endTimestamp)

            expect(last_user_vote_slope3.slope).to.be.eq(expected_vote_slope3)
            expect(last_user_vote_slope3.power).to.be.eq(vote_power3)
            expect(last_user_vote_slope3.end).to.be.eq(user_point.endTimestamp)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                VALID_GAUGES[0].gauge,
                vote_power
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                VALID_GAUGES[1].gauge,
                vote_power2
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                VALID_GAUGES[2].gauge,
                vote_power3
            )

        });

        it(' should vote for the gauges with the correct powers - all users', async () => {

            const vote_powers1 = [BigNumber.from(4000), BigNumber.from(2500), BigNumber.from(3500)]
            const vote_powers2 = [BigNumber.from(5000), BigNumber.from(1500), BigNumber.from(2500), BigNumber.from(1000)]
            const vote_powers3 = [BigNumber.from(3000), BigNumber.from(3000), BigNumber.from(4000)]

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point1 = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const previous_gauge_point2 = await controller.pointsWeight(VALID_GAUGES[1].gauge, next_period)
            const previous_gauge_point3 = await controller.pointsWeight(VALID_GAUGES[2].gauge, next_period)
            const previous_gauge_point4 = await controller.pointsWeight(VALID_GAUGES[3].gauge, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_point1 = await power.getUserPointAt(user1.address, current_ts)
            const user_point2 = await power.getUserPointAt(user2.address, current_ts)
            const user_point3 = await power.getUserPointAt(user3.address, current_ts)

            const previous_gauge_change1_1 = await controller.changesWeight(VALID_GAUGES[0].gauge, user_point1.endTimestamp)
            const previous_gauge_change1_2 = await controller.changesWeight(VALID_GAUGES[1].gauge, user_point1.endTimestamp)
            const previous_gauge_change1_3 = await controller.changesWeight(VALID_GAUGES[2].gauge, user_point1.endTimestamp)
            const previous_gauge_change2_1 = await controller.changesWeight(VALID_GAUGES[0].gauge, user_point2.endTimestamp)
            const previous_gauge_change2_2 = await controller.changesWeight(VALID_GAUGES[1].gauge, user_point2.endTimestamp)
            const previous_gauge_change2_3 = await controller.changesWeight(VALID_GAUGES[2].gauge, user_point2.endTimestamp)
            const previous_gauge_change2_4 = await controller.changesWeight(VALID_GAUGES[3].gauge, user_point2.endTimestamp)
            const previous_gauge_change3_2 = await controller.changesWeight(VALID_GAUGES[1].gauge, user_point3.endTimestamp)
            const previous_gauge_change3_3 = await controller.changesWeight(VALID_GAUGES[2].gauge, user_point3.endTimestamp)
            const previous_gauge_change3_4 = await controller.changesWeight(VALID_GAUGES[3].gauge, user_point3.endTimestamp)
            const previous_total_change1 = await controller.changesWeightTotal(user_point1.endTimestamp)
            const previous_total_change2 = await controller.changesWeightTotal(user_point2.endTimestamp)
            const previous_total_change3 = await controller.changesWeightTotal(user_point3.endTimestamp)

            const tx = await controller.connect(user1).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge],
                vote_powers1
            )
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const tx2 = await controller.connect(user2).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                vote_powers2
            )
            const tx_ts2 = BigNumber.from((await provider.getBlock(tx2.blockNumber || 0)).timestamp)

            const tx3 = await controller.connect(user3).voteForManyGaugeWeights(
                [VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                vote_powers3
            )
            const tx_ts3 = BigNumber.from((await provider.getBlock(tx3.blockNumber || 0)).timestamp)

            const expected_vote_slope1_1 = user_point1.slope.mul(vote_powers1[0]).div(10000)
            const expected_vote_slope1_2 = user_point1.slope.mul(vote_powers1[1]).div(10000)
            const expected_vote_slope1_3 = user_point1.slope.mul(vote_powers1[2]).div(10000)
            const expected_vote_slope2_1 = user_point2.slope.mul(vote_powers2[0]).div(10000)
            const expected_vote_slope2_2 = user_point2.slope.mul(vote_powers2[1]).div(10000)
            const expected_vote_slope2_3 = user_point2.slope.mul(vote_powers2[2]).div(10000)
            const expected_vote_slope2_4 = user_point2.slope.mul(vote_powers2[3]).div(10000)
            const expected_vote_slope3_2 = user_point3.slope.mul(vote_powers3[0]).div(10000)
            const expected_vote_slope3_3 = user_point3.slope.mul(vote_powers3[1]).div(10000)
            const expected_vote_slope3_4 = user_point3.slope.mul(vote_powers3[2]).div(10000)

            const expected_vote_bias1_1 = expected_vote_slope1_1.mul(user_point1.endTimestamp.sub(next_period))
            const expected_vote_bias1_2 = expected_vote_slope1_2.mul(user_point1.endTimestamp.sub(next_period))
            const expected_vote_bias1_3 = expected_vote_slope1_3.mul(user_point1.endTimestamp.sub(next_period))
            const expected_vote_bias2_1 = expected_vote_slope2_1.mul(user_point2.endTimestamp.sub(next_period))
            const expected_vote_bias2_2 = expected_vote_slope2_2.mul(user_point2.endTimestamp.sub(next_period))
            const expected_vote_bias2_3 = expected_vote_slope2_3.mul(user_point2.endTimestamp.sub(next_period))
            const expected_vote_bias2_4 = expected_vote_slope2_4.mul(user_point2.endTimestamp.sub(next_period))
            const expected_vote_bias3_2 = expected_vote_slope3_2.mul(user_point3.endTimestamp.sub(next_period))
            const expected_vote_bias3_3 = expected_vote_slope3_3.mul(user_point3.endTimestamp.sub(next_period))
            const expected_vote_bias3_4 = expected_vote_slope3_4.mul(user_point3.endTimestamp.sub(next_period))

            const total_expected_bias1 = expected_vote_bias1_1.add(expected_vote_bias1_2).add(expected_vote_bias1_3)
            const total_expected_bias2 = expected_vote_bias2_1.add(expected_vote_bias2_2).add(expected_vote_bias2_3).add(expected_vote_bias2_4)
            const total_expected_bias3 = expected_vote_bias3_2.add(expected_vote_bias3_3).add(expected_vote_bias3_4)

            const total_expected_slope1 = expected_vote_slope1_1.add(expected_vote_slope1_2).add(expected_vote_slope1_3)
            const total_expected_slope2 = expected_vote_slope2_1.add(expected_vote_slope2_2).add(expected_vote_slope2_3).add(expected_vote_slope2_4)
            const total_expected_slope3 = expected_vote_slope3_2.add(expected_vote_slope3_3).add(expected_vote_slope3_4)

            expect(await controller.voteUserPower(user1.address)).to.be.eq(10000)
            expect(await controller.voteUserPower(user2.address)).to.be.eq(10000)
            expect(await controller.voteUserPower(user3.address)).to.be.eq(10000)

            const new_gauge_point = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const new_gauge_point2 = await controller.pointsWeight(VALID_GAUGES[1].gauge, next_period)
            const new_gauge_point3 = await controller.pointsWeight(VALID_GAUGES[2].gauge, next_period)
            const new_gauge_point4 = await controller.pointsWeight(VALID_GAUGES[3].gauge, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point1.bias.add(
                expected_vote_bias1_1.add(expected_vote_bias2_1)
            ))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point1.slope.add(
                expected_vote_slope1_1.add(expected_vote_slope2_1)
            ))
            expect(new_gauge_point2.bias).to.be.eq(previous_gauge_point2.bias.add(
                expected_vote_bias1_2.add(expected_vote_bias2_2).add(expected_vote_bias3_2)
            ))
            expect(new_gauge_point2.slope).to.be.eq(previous_gauge_point2.slope.add(
                expected_vote_slope1_2.add(expected_vote_slope2_2).add(expected_vote_slope3_2)
            ))
            expect(new_gauge_point3.bias).to.be.eq(previous_gauge_point3.bias.add(
                expected_vote_bias1_3.add(expected_vote_bias2_3).add(expected_vote_bias3_3)
            ))
            expect(new_gauge_point3.slope).to.be.eq(previous_gauge_point3.slope.add(
                expected_vote_slope1_3.add(expected_vote_slope2_3).add(expected_vote_slope3_3)
            ))
            expect(new_gauge_point4.bias).to.be.eq(previous_gauge_point4.bias.add(
                expected_vote_bias2_4.add(expected_vote_bias3_4)
            ))
            expect(new_gauge_point4.slope).to.be.eq(previous_gauge_point4.slope.add(
                expected_vote_slope2_4.add(expected_vote_slope3_4)
            ))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.add(
                total_expected_bias1.add(total_expected_bias2).add(total_expected_bias3)
            ))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.add(
                total_expected_slope1.add(total_expected_slope2).add(total_expected_slope3)
            ))

            expect(
                await controller.changesWeight(VALID_GAUGES[0].gauge, user_point1.endTimestamp)
            ).to.be.eq(
                previous_gauge_change1_1.add(expected_vote_slope1_1)
            )
            expect(
                await controller.changesWeight(VALID_GAUGES[1].gauge, user_point1.endTimestamp)
            ).to.be.eq(
                previous_gauge_change1_2.add(expected_vote_slope1_2)
            )
            expect(
                await controller.changesWeight(VALID_GAUGES[2].gauge, user_point1.endTimestamp)
            ).to.be.eq(
                previous_gauge_change1_3.add(expected_vote_slope1_3)
            )
            expect(
                await controller.changesWeight(VALID_GAUGES[0].gauge, user_point2.endTimestamp)
            ).to.be.eq(
                previous_gauge_change2_1.add(expected_vote_slope2_1)
            )
            expect(
                await controller.changesWeight(VALID_GAUGES[1].gauge, user_point2.endTimestamp)
            ).to.be.eq(
                previous_gauge_change2_2.add(expected_vote_slope2_2)
            )
            expect(
                await controller.changesWeight(VALID_GAUGES[2].gauge, user_point2.endTimestamp)
            ).to.be.eq(
                previous_gauge_change2_3.add(expected_vote_slope2_3)
            )
            expect(
                await controller.changesWeight(VALID_GAUGES[3].gauge, user_point2.endTimestamp)
            ).to.be.eq(
                previous_gauge_change2_4.add(expected_vote_slope2_4)
            )
            expect(
                await controller.changesWeight(VALID_GAUGES[1].gauge, user_point3.endTimestamp)
            ).to.be.eq(
                previous_gauge_change3_2.add(expected_vote_slope3_2)
            )
            expect(
                await controller.changesWeight(VALID_GAUGES[2].gauge, user_point3.endTimestamp)
            ).to.be.eq(
                previous_gauge_change3_3.add(expected_vote_slope3_3)
            )
            expect(
                await controller.changesWeight(VALID_GAUGES[3].gauge, user_point3.endTimestamp)
            ).to.be.eq(
                previous_gauge_change3_4.add(expected_vote_slope3_4)
            )

            expect(
                await controller.changesWeightTotal(user_point1.endTimestamp)
            ).to.be.eq(previous_total_change1.add(
                total_expected_slope1
            ))
            expect(
                await controller.changesWeightTotal(user_point2.endTimestamp)
            ).to.be.eq(previous_total_change2.add(
                total_expected_slope2
            ))
            expect(
                await controller.changesWeightTotal(user_point3.endTimestamp)
            ).to.be.eq(previous_total_change3.add(
                total_expected_slope3
            ))

            expect(await controller.lastUserVote(user1.address, VALID_GAUGES[0].gauge)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, VALID_GAUGES[1].gauge)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, VALID_GAUGES[2].gauge)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user2.address, VALID_GAUGES[0].gauge)).to.be.eq(tx_ts2)
            expect(await controller.lastUserVote(user2.address, VALID_GAUGES[1].gauge)).to.be.eq(tx_ts2)
            expect(await controller.lastUserVote(user2.address, VALID_GAUGES[2].gauge)).to.be.eq(tx_ts2)
            expect(await controller.lastUserVote(user2.address, VALID_GAUGES[3].gauge)).to.be.eq(tx_ts2)
            expect(await controller.lastUserVote(user3.address, VALID_GAUGES[1].gauge)).to.be.eq(tx_ts3)
            expect(await controller.lastUserVote(user3.address, VALID_GAUGES[2].gauge)).to.be.eq(tx_ts3)
            expect(await controller.lastUserVote(user3.address, VALID_GAUGES[3].gauge)).to.be.eq(tx_ts3)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope1_1 = await controller.voteUserSlopes(user1.address, VALID_GAUGES[0].gauge)
            const last_user_vote_slope1_2 = await controller.voteUserSlopes(user1.address, VALID_GAUGES[1].gauge)
            const last_user_vote_slope1_3 = await controller.voteUserSlopes(user1.address, VALID_GAUGES[2].gauge)
            const last_user_vote_slope2_1 = await controller.voteUserSlopes(user2.address, VALID_GAUGES[0].gauge)
            const last_user_vote_slope2_2 = await controller.voteUserSlopes(user2.address, VALID_GAUGES[1].gauge)
            const last_user_vote_slope2_3 = await controller.voteUserSlopes(user2.address, VALID_GAUGES[2].gauge)
            const last_user_vote_slope2_4 = await controller.voteUserSlopes(user2.address, VALID_GAUGES[3].gauge)
            const last_user_vote_slope3_2 = await controller.voteUserSlopes(user3.address, VALID_GAUGES[1].gauge)
            const last_user_vote_slope3_3 = await controller.voteUserSlopes(user3.address, VALID_GAUGES[2].gauge)
            const last_user_vote_slope3_4 = await controller.voteUserSlopes(user3.address, VALID_GAUGES[3].gauge)

            expect(last_user_vote_slope1_1.slope).to.be.eq(expected_vote_slope1_1)
            expect(last_user_vote_slope1_2.slope).to.be.eq(expected_vote_slope1_2)
            expect(last_user_vote_slope1_3.slope).to.be.eq(expected_vote_slope1_3)
            expect(last_user_vote_slope2_1.slope).to.be.eq(expected_vote_slope2_1)
            expect(last_user_vote_slope2_2.slope).to.be.eq(expected_vote_slope2_2)
            expect(last_user_vote_slope2_3.slope).to.be.eq(expected_vote_slope2_3)
            expect(last_user_vote_slope2_4.slope).to.be.eq(expected_vote_slope2_4)
            expect(last_user_vote_slope3_2.slope).to.be.eq(expected_vote_slope3_2)
            expect(last_user_vote_slope3_3.slope).to.be.eq(expected_vote_slope3_3)
            expect(last_user_vote_slope3_4.slope).to.be.eq(expected_vote_slope3_4)
            
            expect(last_user_vote_slope1_1.power).to.be.eq(vote_powers1[0])
            expect(last_user_vote_slope1_2.power).to.be.eq(vote_powers1[1])
            expect(last_user_vote_slope1_3.power).to.be.eq(vote_powers1[2])
            expect(last_user_vote_slope2_1.power).to.be.eq(vote_powers2[0])
            expect(last_user_vote_slope2_2.power).to.be.eq(vote_powers2[1])
            expect(last_user_vote_slope2_3.power).to.be.eq(vote_powers2[2])
            expect(last_user_vote_slope2_4.power).to.be.eq(vote_powers2[3])
            expect(last_user_vote_slope3_2.power).to.be.eq(vote_powers3[0])
            expect(last_user_vote_slope3_3.power).to.be.eq(vote_powers3[1])
            expect(last_user_vote_slope3_4.power).to.be.eq(vote_powers3[2])
            
            expect(last_user_vote_slope1_1.end).to.be.eq(user_point1.endTimestamp)
            expect(last_user_vote_slope1_2.end).to.be.eq(user_point1.endTimestamp)
            expect(last_user_vote_slope1_3.end).to.be.eq(user_point1.endTimestamp)
            expect(last_user_vote_slope2_1.end).to.be.eq(user_point2.endTimestamp)
            expect(last_user_vote_slope2_2.end).to.be.eq(user_point2.endTimestamp)
            expect(last_user_vote_slope2_3.end).to.be.eq(user_point2.endTimestamp)
            expect(last_user_vote_slope2_4.end).to.be.eq(user_point2.endTimestamp)
            expect(last_user_vote_slope3_2.end).to.be.eq(user_point3.endTimestamp)
            expect(last_user_vote_slope3_3.end).to.be.eq(user_point3.endTimestamp)
            expect(last_user_vote_slope3_4.end).to.be.eq(user_point3.endTimestamp)

        });

        it(' should move the votes from gauges correctly', async () => {

            const vote_power = 4000
            const vote_power2 = 2500
            const vote_power3 = 3500

            const new_vote_power1 = 0
            const new_vote_power2 = 5500
            const new_vote_power3 = 1500
            const new_vote_power4 = 3000

            await controller.connect(user1).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge],
                [vote_power, vote_power2, vote_power3]
            )

            await advanceTime(WEEK.mul(2).toNumber())

            await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[0].gauge)
            await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[1].gauge)
            await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[2].gauge)
            await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[3].gauge)
            await controller.connect(user1).updateTotalWeight()

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const previous_gauge_point2 = await controller.pointsWeight(VALID_GAUGES[1].gauge, next_period)
            const previous_gauge_point3 = await controller.pointsWeight(VALID_GAUGES[2].gauge, next_period)
            const previous_gauge_point4 = await controller.pointsWeight(VALID_GAUGES[3].gauge, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const prev_user_voted_slope = await controller.voteUserSlopes(user1.address, VALID_GAUGES[0].gauge)
            const prev_user_voted_slope2 = await controller.voteUserSlopes(user1.address, VALID_GAUGES[1].gauge)
            const prev_user_voted_slope3 = await controller.voteUserSlopes(user1.address, VALID_GAUGES[2].gauge)
            const expected_prev_bias = prev_user_voted_slope.slope.mul(prev_user_voted_slope.end.sub(next_period))
            const expected_prev_bias2 = prev_user_voted_slope2.slope.mul(prev_user_voted_slope2.end.sub(next_period))
            const expected_prev_bias3 = prev_user_voted_slope3.slope.mul(prev_user_voted_slope3.end.sub(next_period))

            const previous_gauge_change = await controller.changesWeight(VALID_GAUGES[0].gauge, prev_user_voted_slope.end)
            const previous_gauge_change2 = await controller.changesWeight(VALID_GAUGES[1].gauge, prev_user_voted_slope.end)
            const previous_gauge_change3 = await controller.changesWeight(VALID_GAUGES[2].gauge, prev_user_voted_slope.end)
            const previous_gauge_change4 = await controller.changesWeight(VALID_GAUGES[3].gauge, prev_user_voted_slope.end)
            const previous_total_change = await controller.changesWeightTotal(prev_user_voted_slope.end)

            const tx = await controller.connect(user1).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                [new_vote_power1, new_vote_power2, new_vote_power3, new_vote_power4]
            )
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const expected_vote_slope = BigNumber.from(0)
            const expected_vote_slope2 = user_point.slope.mul(new_vote_power2).div(10000)
            const expected_vote_slope3 = user_point.slope.mul(new_vote_power3).div(10000)
            const expected_vote_slope4 = user_point.slope.mul(new_vote_power4).div(10000)
            const expected_vote_bias = BigNumber.from(0)
            const expected_vote_bias2 = expected_vote_slope2.mul(user_point.endTimestamp.sub(next_period))
            const expected_vote_bias3 = expected_vote_slope3.mul(user_point.endTimestamp.sub(next_period))
            const expected_vote_bias4 = expected_vote_slope4.mul(user_point.endTimestamp.sub(next_period))

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.sub(
                vote_power + vote_power2 + vote_power3
            ).add(
                new_vote_power2 + new_vote_power3 + new_vote_power4
            ))

            const new_gauge_point = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const new_gauge_point2 = await controller.pointsWeight(VALID_GAUGES[1].gauge, next_period)
            const new_gauge_point3 = await controller.pointsWeight(VALID_GAUGES[2].gauge, next_period)
            const new_gauge_point4 = await controller.pointsWeight(VALID_GAUGES[3].gauge, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias.sub(expected_prev_bias).add(expected_vote_bias))
            expect(new_gauge_point2.bias).to.be.eq(previous_gauge_point2.bias.sub(expected_prev_bias2).add(expected_vote_bias2))
            expect(new_gauge_point3.bias).to.be.eq(previous_gauge_point3.bias.sub(expected_prev_bias3).add(expected_vote_bias3))
            expect(new_gauge_point4.bias).to.be.eq(previous_gauge_point4.bias.add(expected_vote_bias4))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope.sub(prev_user_voted_slope.slope).add(expected_vote_slope))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.sub(
                expected_prev_bias.add(expected_prev_bias2).add(expected_prev_bias3)
            ).add(
                expected_vote_bias.add(expected_vote_bias2).add(expected_vote_bias3).add(expected_vote_bias4)
            ))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.sub(
                prev_user_voted_slope.slope.add(prev_user_voted_slope2.slope).add(prev_user_voted_slope3.slope)
            ).add(
                expected_vote_slope.add(expected_vote_slope2).add(expected_vote_slope3).add(expected_vote_slope4)
            ))

            expect(await controller.changesWeight(VALID_GAUGES[0].gauge, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change.sub(prev_user_voted_slope.slope).add(expected_vote_slope))
            expect(await controller.changesWeight(VALID_GAUGES[1].gauge, prev_user_voted_slope2.end)).to.be.eq(previous_gauge_change2.sub(prev_user_voted_slope2.slope).add(expected_vote_slope2))
            expect(await controller.changesWeight(VALID_GAUGES[2].gauge, prev_user_voted_slope3.end)).to.be.eq(previous_gauge_change3.sub(prev_user_voted_slope3.slope).add(expected_vote_slope3))
            expect(await controller.changesWeight(VALID_GAUGES[3].gauge, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change4.add(expected_vote_slope4))
            expect(await controller.changesWeightTotal(prev_user_voted_slope.end)).to.be.eq(previous_total_change.sub(
                prev_user_voted_slope.slope.add(prev_user_voted_slope2.slope).add(prev_user_voted_slope3.slope)
            ).add(
                expected_vote_slope.add(expected_vote_slope2).add(expected_vote_slope3).add(expected_vote_slope4)
            ))

            expect(await controller.lastUserVote(user1.address, VALID_GAUGES[0].gauge)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, VALID_GAUGES[1].gauge)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, VALID_GAUGES[2].gauge)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, VALID_GAUGES[3].gauge)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, VALID_GAUGES[0].gauge)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(0)
            expect(last_user_vote_slope.end).to.be.eq(prev_user_voted_slope.end)

            const last_user_vote_slope2 = await controller.voteUserSlopes(user1.address, VALID_GAUGES[1].gauge)

            expect(last_user_vote_slope2.slope).to.be.eq(expected_vote_slope2)
            expect(last_user_vote_slope2.power).to.be.eq(new_vote_power2)
            expect(last_user_vote_slope2.end).to.be.eq(prev_user_voted_slope2.end)

            const last_user_vote_slope3 = await controller.voteUserSlopes(user1.address, VALID_GAUGES[2].gauge)

            expect(last_user_vote_slope3.slope).to.be.eq(expected_vote_slope3)
            expect(last_user_vote_slope3.power).to.be.eq(new_vote_power3)
            expect(last_user_vote_slope3.end).to.be.eq(prev_user_voted_slope3.end)

            const last_user_vote_slope4 = await controller.voteUserSlopes(user1.address, VALID_GAUGES[3].gauge)

            expect(last_user_vote_slope4.slope).to.be.eq(expected_vote_slope4)
            expect(last_user_vote_slope4.power).to.be.eq(new_vote_power4)
            expect(last_user_vote_slope4.end).to.be.eq(prev_user_voted_slope.end)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                VALID_GAUGES[0].gauge,
                0
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                VALID_GAUGES[1].gauge,
                new_vote_power2
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                VALID_GAUGES[2].gauge,
                new_vote_power3
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                VALID_GAUGES[3].gauge,
                new_vote_power4
            )

        });

        it(' should set all bias and slope to 0 after all votes are expired', async () => {

            const vote_powers1 = [BigNumber.from(4000), BigNumber.from(2500), BigNumber.from(3500)]
            const vote_powers2 = [BigNumber.from(5000), BigNumber.from(1500), BigNumber.from(2500), BigNumber.from(1000)]
            const vote_powers3 = [BigNumber.from(3000), BigNumber.from(3000), BigNumber.from(4000)]

            await controller.connect(user1).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge],
                vote_powers1
            )

            await controller.connect(user2).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                vote_powers2
            )

            await controller.connect(user3).voteForManyGaugeWeights(
                [VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                vote_powers3
            )

            await advanceTime(WEEK.mul(2).toNumber())

            await controller.connect(user1).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge],
                [0,0,0]
            )

            await controller.connect(user2).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                [0,0,0,0]
            )

            await controller.connect(user3).voteForManyGaugeWeights(
                [VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                [0,0,0]
            )

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts
            const next_period = current_ts.add(WEEK)

            const user1_lock_end = await power.locked__end(user1.address)
            const user2_lock_end = await power.locked__end(user2.address)
            const user3_lock_end = await power.locked__end(user3.address)

            const next_period_gauge_point1 = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
            const next_period_gauge_point2 = await controller.pointsWeight(VALID_GAUGES[1].gauge, next_period)
            const next_period_gauge_point3 = await controller.pointsWeight(VALID_GAUGES[2].gauge, next_period)
            const next_period_gauge_point4 = await controller.pointsWeight(VALID_GAUGES[3].gauge, next_period)
            const next_period_total_point = await controller.pointsWeightTotal(next_period)

            expect(next_period_gauge_point1.bias).to.be.eq(0)
            expect(next_period_gauge_point1.slope).to.be.eq(0)

            expect(next_period_gauge_point2.bias).to.be.eq(0)
            expect(next_period_gauge_point2.slope).to.be.eq(0)

            expect(next_period_gauge_point3.bias).to.be.eq(0)
            expect(next_period_gauge_point3.slope).to.be.eq(0)

            expect(next_period_gauge_point4.bias).to.be.eq(0)
            expect(next_period_gauge_point4.slope).to.be.eq(0)

            expect(next_period_total_point.bias).to.be.eq(0)
            expect(next_period_total_point.slope).to.be.eq(0)

            expect(
                await controller.changesWeight(VALID_GAUGES[0].gauge, user1_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeight(VALID_GAUGES[1].gauge, user1_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeight(VALID_GAUGES[2].gauge, user1_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeight(VALID_GAUGES[0].gauge, user2_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeight(VALID_GAUGES[1].gauge, user2_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeight(VALID_GAUGES[2].gauge, user2_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeight(VALID_GAUGES[3].gauge, user2_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeight(VALID_GAUGES[1].gauge, user3_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeight(VALID_GAUGES[2].gauge, user3_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeight(VALID_GAUGES[3].gauge, user3_lock_end)
            ).to.be.eq(0)

            expect(
                await controller.changesWeightTotal(user1_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeightTotal(user2_lock_end)
            ).to.be.eq(0)
            expect(
                await controller.changesWeightTotal(user3_lock_end)
            ).to.be.eq(0)

            for(let i = 0; i < 5; i++) {
                await advanceTime(WEEK.toNumber())

                let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
                current_ts = current_ts.div(WEEK).mul(WEEK)
                const next_period = current_ts.add(WEEK)

                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[0].gauge)
                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[1].gauge)
                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[2].gauge)
                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[3].gauge)

                const next_period_gauge_point1 = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
                const next_period_gauge_point2 = await controller.pointsWeight(VALID_GAUGES[1].gauge, next_period)
                const next_period_gauge_point3 = await controller.pointsWeight(VALID_GAUGES[2].gauge, next_period)
                const next_period_gauge_point4 = await controller.pointsWeight(VALID_GAUGES[3].gauge, next_period)
                const next_period_total_point = await controller.pointsWeightTotal(next_period)

                expect(next_period_gauge_point1.bias).to.be.eq(0)
                expect(next_period_gauge_point1.slope).to.be.eq(0)

                expect(next_period_gauge_point2.bias).to.be.eq(0)
                expect(next_period_gauge_point2.slope).to.be.eq(0)

                expect(next_period_gauge_point3.bias).to.be.eq(0)
                expect(next_period_gauge_point3.slope).to.be.eq(0)

                expect(next_period_gauge_point4.bias).to.be.eq(0)
                expect(next_period_gauge_point4.slope).to.be.eq(0)

                expect(next_period_total_point.bias).to.be.eq(0)
                expect(next_period_total_point.slope).to.be.eq(0)
            }

        });

        it(' should set all bias and slope to 0 after all votes are expired', async () => {

            const vote_powers1 = [BigNumber.from(4000), BigNumber.from(2500), BigNumber.from(3500)]
            const vote_powers2 = [BigNumber.from(5000), BigNumber.from(1500), BigNumber.from(2500), BigNumber.from(1000)]
            const vote_powers3 = [BigNumber.from(3000), BigNumber.from(3000), BigNumber.from(4000)]

            await controller.connect(user1).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge],
                vote_powers1
            )

            await controller.connect(user2).voteForManyGaugeWeights(
                [VALID_GAUGES[0].gauge, VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                vote_powers2
            )

            await controller.connect(user3).voteForManyGaugeWeights(
                [VALID_GAUGES[1].gauge, VALID_GAUGES[2].gauge, VALID_GAUGES[3].gauge],
                vote_powers3
            )

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts

            const user1_lock_end = await power.locked__end(user1.address)
            const user2_lock_end = await power.locked__end(user2.address)
            const user3_lock_end = await power.locked__end(user3.address)

            let last_lock_end = BigNumber.from(0)
            if (user1_lock_end.gt(last_lock_end)) {
                last_lock_end = user1_lock_end
            }
            if (user2_lock_end.gt(last_lock_end)) {
                last_lock_end = user2_lock_end
            }
            if (user3_lock_end.gt(last_lock_end)) {
                last_lock_end = user3_lock_end
            }

            let ts = current_ts
            while(ts.lt(last_lock_end)) {
                await advanceTime(WEEK.toNumber())

                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[0].gauge)
                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[1].gauge)
                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[2].gauge)
                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[3].gauge)

                ts = ts.add(WEEK)
            }

            for(let i = 0; i < 5; i++) {
                await advanceTime(WEEK.toNumber())

                let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
                current_ts = current_ts.div(WEEK).mul(WEEK)
                const next_period = current_ts.add(WEEK)

                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[0].gauge)
                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[1].gauge)
                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[2].gauge)
                await controller.connect(user1).updateGaugeWeight(VALID_GAUGES[3].gauge)

                const next_period_gauge_point1 = await controller.pointsWeight(VALID_GAUGES[0].gauge, next_period)
                const next_period_gauge_point2 = await controller.pointsWeight(VALID_GAUGES[1].gauge, next_period)
                const next_period_gauge_point3 = await controller.pointsWeight(VALID_GAUGES[2].gauge, next_period)
                const next_period_gauge_point4 = await controller.pointsWeight(VALID_GAUGES[3].gauge, next_period)
                const next_period_total_point = await controller.pointsWeightTotal(next_period)

                expect(next_period_gauge_point1.bias).to.be.eq(0)
                expect(next_period_gauge_point1.slope).to.be.eq(0)

                expect(next_period_gauge_point2.bias).to.be.eq(0)
                expect(next_period_gauge_point2.slope).to.be.eq(0)

                expect(next_period_gauge_point3.bias).to.be.eq(0)
                expect(next_period_gauge_point3.slope).to.be.eq(0)

                expect(next_period_gauge_point4.bias).to.be.eq(0)
                expect(next_period_gauge_point4.slope).to.be.eq(0)

                expect(next_period_total_point.bias).to.be.eq(0)
                expect(next_period_total_point.slope).to.be.eq(0)
            }

        });

    });

});