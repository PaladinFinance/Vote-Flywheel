import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Loot } from "./../typechain/contracts/Loot";
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

let lootFactory: ContractFactory
let creatorFactory: ContractFactory

const PAL_ADDRESS = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"
const PAL_HOLDER = "0x830B63eA52CCcf241A329F3932B4cfCf17287ed7"
const PAL_AMOUNT = ethers.utils.parseEther("500000")

const EXTRA_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
const EXTRA_HOLDER = "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8"
const EXTRA_AMOUNT = ethers.utils.parseEther("2500000")

describe('Loot contract tests', () => {
    let admin: SignerWithAddress

    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress

    let reserve: SignerWithAddress

    let loot: Loot

    let creator: MockCreator

    let pal: IERC20
    let extraToken: IERC20

    const vesting_duration = BigNumber.from(86400 * 7 * 2)

    let new_creator: SignerWithAddress
    const new_vesting_duration = BigNumber.from(86400 * 7 * 4)


    before(async () => {
        await resetFork();

        [admin, user1, user2, user3, reserve, new_creator] = await ethers.getSigners();

        lootFactory = await ethers.getContractFactory("Loot");
        creatorFactory = await ethers.getContractFactory("MockCreator");

        pal = IERC20__factory.connect(PAL_ADDRESS, provider)
        extraToken = IERC20__factory.connect(EXTRA_ADDRESS, provider)

        await getERC20(admin, PAL_HOLDER, pal, reserve.address, PAL_AMOUNT);
        await getERC20(admin, EXTRA_HOLDER, extraToken, reserve.address, EXTRA_AMOUNT);

    })

    beforeEach(async () => {

        loot = (await lootFactory.connect(admin).deploy(
            pal.address,
            extraToken.address,
            reserve.address,
            vesting_duration
        )) as Loot
        await loot.deployed()

        creator = (await creatorFactory.connect(admin).deploy(
            loot.address,
        )) as MockCreator
        await creator.deployed()

        await pal.connect(reserve).approve(loot.address, ethers.constants.MaxUint256)
        await extraToken.connect(reserve).approve(loot.address, ethers.constants.MaxUint256)

    });

    it(' should be deployed correctly', async () => {
        expect(loot.address).to.properAddress

        expect(await loot.pal()).to.be.eq(pal.address)
        expect(await loot.extraToken()).to.be.eq(extraToken.address)
        expect(await loot.tokenReserve()).to.be.eq(reserve.address)
        expect(await loot.vestingDuration()).to.be.eq(vesting_duration)
        
        expect(await loot.lootCreator()).to.be.eq(ethers.constants.AddressZero)

    });
    
    describe('setInitialLootCreator', async () => {

        it(' should set the creator correctly', async () => {

            expect(await loot.lootCreator()).to.be.eq(ethers.constants.AddressZero)

            await loot.connect(admin).setInitialLootCreator(creator.address)

            expect(await loot.lootCreator()).to.be.eq(creator.address)

        });

        it(' should fail if already set', async () => {

            await loot.connect(admin).setInitialLootCreator(creator.address)
            
            await expect(
                loot.connect(admin).setInitialLootCreator(user3.address)
            ).to.be.revertedWith("CreatorAlreadySet")

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                loot.connect(user1).setInitialLootCreator(creator.address)
            ).to.be.reverted
            
            await expect(
                loot.connect(reserve).setInitialLootCreator(creator.address)
            ).to.be.reverted

        });

    });
    
    describe('createLoot', async () => {

        const pal_amount = ethers.utils.parseEther("7500")
        const extra_amount = ethers.utils.parseEther("12500")

        const pal_amount_2 = ethers.utils.parseEther("5425")
        const extra_amount_2 = ethers.utils.parseEther("10650")

        let start_ts: BigNumber
        let start_ts_2: BigNumber

        beforeEach(async () => {

            await loot.connect(admin).setInitialLootCreator(creator.address)

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            start_ts = BigNumber.from(current_ts).div(WEEK).mul(WEEK)
            start_ts_2 = start_ts.add(WEEK)

        });

        it(' should create the Loot struct correctly & with correct parameters', async () => {

            const expected_id = 0

            const prev_user_loot_length = (await loot.getAllUserLoot(user1.address)).length

            const tx = await creator.connect(admin).createLoot(user1.address, start_ts, pal_amount, extra_amount)

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            expect(new_user_loots.length).to.be.eq(prev_user_loot_length + 1)

            const new_loot = await loot.userLoots(user1.address, expected_id)

            expect(new_loot.id).to.be.eq(expected_id)
            expect(new_loot.palAmount).to.be.eq(pal_amount)
            expect(new_loot.extraAmount).to.be.eq(extra_amount)
            expect(new_loot.startTs).to.be.eq(start_ts)
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, expected_id, pal_amount, extra_amount, start_ts)

        });

        it(' should allow to create other Loots for the same user', async () => {

            const prev_user_loot_length = (await loot.getAllUserLoot(user1.address)).length

            const expected_id = prev_user_loot_length

            const tx = await creator.connect(admin).createLoot(user1.address, start_ts, pal_amount, extra_amount)

            const new_loot = await loot.userLoots(user1.address, expected_id)

            expect(new_loot.id).to.be.eq(expected_id)
            expect(new_loot.palAmount).to.be.eq(pal_amount)
            expect(new_loot.extraAmount).to.be.eq(extra_amount)
            expect(new_loot.startTs).to.be.eq(start_ts)
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, expected_id, pal_amount, extra_amount, start_ts)

            const expected_id_2 = (await loot.getAllUserLoot(user1.address)).length

            const tx_2 = await creator.connect(admin).createLoot(user1.address, start_ts_2, pal_amount_2, extra_amount_2)

            const new_loot_2 = await loot.userLoots(user1.address, expected_id_2)

            expect(new_loot_2.id).to.be.eq(expected_id_2)
            expect(new_loot_2.palAmount).to.be.eq(pal_amount_2)
            expect(new_loot_2.extraAmount).to.be.eq(extra_amount_2)
            expect(new_loot_2.startTs).to.be.eq(start_ts_2)
            expect(new_loot_2.claimed).to.be.false

            expect(tx_2).to.emit(loot, 'LootCreated').withArgs(user1.address, expected_id_2, pal_amount_2, extra_amount_2, start_ts_2)

            const new_user_loots = await loot.getAllUserLoot(user1.address)

            expect(new_user_loots.length).to.be.eq(prev_user_loot_length + 2)

        });

        it(' should allow to create other Loots for other user', async () => {

            const prev_user_1_loot_length = (await loot.getAllUserLoot(user1.address)).length
            const prev_user_2_loot_length = (await loot.getAllUserLoot(user2.address)).length

            const expected_id = prev_user_1_loot_length
            const expected_id_2 = prev_user_2_loot_length

            const tx = await creator.connect(admin).createLoot(user1.address, start_ts, pal_amount, extra_amount)

            const new_loot = await loot.userLoots(user1.address, expected_id)

            expect(new_loot.id).to.be.eq(expected_id)
            expect(new_loot.palAmount).to.be.eq(pal_amount)
            expect(new_loot.extraAmount).to.be.eq(extra_amount)
            expect(new_loot.startTs).to.be.eq(start_ts)
            expect(new_loot.claimed).to.be.false

            expect(tx).to.emit(loot, 'LootCreated').withArgs(user1.address, expected_id, pal_amount, extra_amount, start_ts)

            const tx_2 = await creator.connect(admin).createLoot(user2.address, start_ts, pal_amount_2, extra_amount_2)

            const new_loot_2 = await loot.userLoots(user2.address, expected_id_2)

            expect(new_loot_2.id).to.be.eq(expected_id_2)
            expect(new_loot_2.palAmount).to.be.eq(pal_amount_2)
            expect(new_loot_2.extraAmount).to.be.eq(extra_amount_2)
            expect(new_loot_2.startTs).to.be.eq(start_ts)
            expect(new_loot_2.claimed).to.be.false

            expect(tx_2).to.emit(loot, 'LootCreated').withArgs(user2.address, expected_id_2, pal_amount_2, extra_amount_2, start_ts)

            const new_user_1_loots = await loot.getAllUserLoot(user1.address)
            const new_user_2_loots = await loot.getAllUserLoot(user2.address)

            expect(new_user_1_loots.length).to.be.eq(prev_user_1_loot_length + 1)
            expect(new_user_2_loots.length).to.be.eq(prev_user_2_loot_length + 1)
            

        });

        it(' should only be allowed for the Loot Creator', async () => {

            await expect(
                loot.connect(user1).createLoot(user1.address, start_ts, pal_amount, extra_amount)
            ).to.be.revertedWith('CallerNotAllowed')

            await expect(
                loot.connect(admin).createLoot(user1.address, start_ts, pal_amount, extra_amount)
            ).to.be.revertedWith('CallerNotAllowed')

        });

    });

    describe('getLootData', async () => {

        const pal_amount = ethers.utils.parseEther("7500")
        const extra_amount = ethers.utils.parseEther("12500")
        
        let start_ts: BigNumber
        
        let loot_id: number

        beforeEach(async () => {

            await loot.connect(admin).setInitialLootCreator(creator.address)

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            start_ts = BigNumber.from(current_ts).div(WEEK).mul(WEEK)

            loot_id = (await loot.getAllUserLoot(user1.address)).length

            await creator.connect(admin).createLoot(user1.address, start_ts, pal_amount, extra_amount)

        });

        it(' should return the correct data', async () => {

            const loot_data = await loot.getLootData(user1.address, loot_id)

            expect(loot_data.palAmount).to.be.eq(pal_amount)
            expect(loot_data.extraAmount).to.be.eq(extra_amount)
            expect(loot_data.startTs).to.be.eq(start_ts)
            expect(loot_data.endTs).to.be.eq(start_ts.add(vesting_duration))
            expect(loot_data.claimed).to.be.false

        });

    });

    describe('getAllUserLootIds & getAllActiveUserLootIds', async () => {

        const pal_amount = ethers.utils.parseEther("7500")
        const extra_amount = ethers.utils.parseEther("12500")
        
        let start_ts: BigNumber
        let start_ts_2: BigNumber
        let start_ts_3: BigNumber

        let user_1_ids = [BigNumber.from(0),BigNumber.from(1),BigNumber.from(2)]
        let user_2_ids = [BigNumber.from(0),BigNumber.from(1)]
        let user_1_active_ids = [BigNumber.from(1),BigNumber.from(2)]

        beforeEach(async () => {

            await loot.connect(admin).setInitialLootCreator(creator.address)

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            start_ts = BigNumber.from(current_ts).div(WEEK).mul(WEEK)
            start_ts_2 = start_ts.add(WEEK)
            start_ts_3 = start_ts.sub(WEEK.mul(5))

            await creator.connect(admin).createLoot(user1.address, start_ts_3, pal_amount, extra_amount)
            await creator.connect(admin).createLoot(user1.address, start_ts, pal_amount, extra_amount)
            await creator.connect(admin).createLoot(user1.address, start_ts_2, pal_amount, extra_amount)

            await creator.connect(admin).createLoot(user2.address, start_ts, pal_amount, extra_amount)
            await creator.connect(admin).createLoot(user2.address, start_ts_2, pal_amount, extra_amount)

            await loot.connect(user1).claimLoot(user_1_ids[0], user1.address)

        });

        it(' should return the correct ids for both functions & both users', async () => {

            expect(await loot.getAllUserLootIds(user1.address)).to.be.deep.eq(user_1_ids)
            expect(await loot.getAllUserLootIds(user2.address)).to.be.deep.eq(user_2_ids)
            
            expect(await loot.getAllActiveUserLootIds(user1.address)).to.be.deep.eq(user_1_active_ids)
            expect(await loot.getAllActiveUserLootIds(user2.address)).to.be.deep.eq(user_2_ids)

        });

    });

    describe('getAllUserLoot & getAllActiveUserLoot', async () => {

        const pal_amounts_1 = [ethers.utils.parseEther("7500"),ethers.utils.parseEther("6250"),ethers.utils.parseEther("8100")]
        const pal_amounts_2 = [ethers.utils.parseEther("550"),ethers.utils.parseEther("850")]
        const extra_amounts_1 = [ethers.utils.parseEther("12500"),ethers.utils.parseEther("11400"),ethers.utils.parseEther("13000")]
        const extra_amounts_2 = [ethers.utils.parseEther("5545"),ethers.utils.parseEther("7565")]
        
        let start_ts: BigNumber
        let start_ts_2: BigNumber
        let start_ts_3: BigNumber

        let start_ts_list_1: BigNumber[]
        let start_ts_list_2: BigNumber[]

        let user_1_ids = [BigNumber.from(0),BigNumber.from(1),BigNumber.from(2)]
        let user_2_ids = [BigNumber.from(0),BigNumber.from(1)]
        let user_1_active_ids = [BigNumber.from(1),BigNumber.from(2)]

        beforeEach(async () => {

            await loot.connect(admin).setInitialLootCreator(creator.address)

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            start_ts = BigNumber.from(current_ts).div(WEEK).mul(WEEK)
            start_ts_2 = start_ts.add(WEEK)
            start_ts_3 = start_ts.sub(WEEK.mul(5))

            await creator.connect(admin).createLoot(user1.address, start_ts_3, pal_amounts_1[0], extra_amounts_1[0])
            await creator.connect(admin).createLoot(user1.address, start_ts, pal_amounts_1[1], extra_amounts_1[1])
            await creator.connect(admin).createLoot(user1.address, start_ts_2, pal_amounts_1[2], extra_amounts_1[2])

            await creator.connect(admin).createLoot(user2.address, start_ts, pal_amounts_2[0], extra_amounts_2[0])
            await creator.connect(admin).createLoot(user2.address, start_ts_2, pal_amounts_2[1], extra_amounts_2[1])

            await loot.connect(user1).claimLoot(user_1_ids[0], user1.address)

            start_ts_list_1 =  [start_ts_3, start_ts, start_ts_2]
            start_ts_list_2 =  [start_ts, start_ts_2]

        });

        it(' should return the correct Loots for both users - getAllUserLoot', async () => {

            const user_1_loots = await loot.getAllUserLoot(user1.address)

            expect(user_1_loots.length).to.be.eq(user_1_ids.length)

            for(let i = 0; i < user_1_ids.length; i++) {
                expect(user_1_loots[i].id).to.be.eq(user_1_ids[i])
                expect(user_1_loots[i].palAmount).to.be.eq(pal_amounts_1[i])
                expect(user_1_loots[i].extraAmount).to.be.eq(extra_amounts_1[i])
                expect(user_1_loots[i].startTs).to.be.eq(start_ts_list_1[i])
                if(i == 0) {
                    expect(user_1_loots[i].claimed).to.be.true
                } else {
                    expect(user_1_loots[i].claimed).to.be.false
                }
            }

            const user_2_loots = await loot.getAllUserLoot(user2.address)

            expect(user_2_loots.length).to.be.eq(user_2_ids.length)

            for(let i = 0; i < user_2_ids.length; i++) {
                expect(user_2_loots[i].id).to.be.eq(user_2_ids[i])
                expect(user_2_loots[i].palAmount).to.be.eq(pal_amounts_2[i])
                expect(user_2_loots[i].extraAmount).to.be.eq(extra_amounts_2[i])
                expect(user_2_loots[i].startTs).to.be.eq(start_ts_list_2[i])
                expect(user_2_loots[i].claimed).to.be.false
            }

        });

        it(' should return the correct Loots for both users - getAllActiveUserLoot', async () => {

            const user_1_loots = await loot.getAllActiveUserLoot(user1.address)

            expect(user_1_loots.length).to.be.eq(user_1_active_ids.length)

            for(let i = 0; i < user_1_active_ids.length; i++) {
                expect(user_1_loots[i].id).to.be.eq(user_1_active_ids[i])
                expect(user_1_loots[i].palAmount).to.be.eq(pal_amounts_1[i + 1])
                expect(user_1_loots[i].extraAmount).to.be.eq(extra_amounts_1[i + 1])
                expect(user_1_loots[i].startTs).to.be.eq(start_ts_list_1[i + 1])
                expect(user_1_loots[i].claimed).to.be.false
            }

            const user_2_loots = await loot.getAllActiveUserLoot(user2.address)

            expect(user_2_loots.length).to.be.eq(user_2_ids.length)

            for(let i = 0; i < user_2_ids.length; i++) {
                expect(user_2_loots[i].id).to.be.eq(user_2_ids[i])
                expect(user_2_loots[i].palAmount).to.be.eq(pal_amounts_2[i])
                expect(user_2_loots[i].extraAmount).to.be.eq(extra_amounts_2[i])
                expect(user_2_loots[i].startTs).to.be.eq(start_ts_list_2[i])
                expect(user_2_loots[i].claimed).to.be.false
            }

        });

    });

    describe('claimLoot & claimMultipleLoot', async () => {

        const pal_amounts_1 = [ethers.utils.parseEther("7500"),ethers.utils.parseEther("6250"),ethers.utils.parseEther("8100")]
        const pal_amounts_2 = [ethers.utils.parseEther("550"),ethers.utils.parseEther("850")]
        const extra_amounts_1 = [ethers.utils.parseEther("12500"),ethers.utils.parseEther("11400"),ethers.utils.parseEther("13000")]
        const extra_amounts_2 = [ethers.utils.parseEther("5545"),ethers.utils.parseEther("7565")]
        
        let start_ts: BigNumber
        let start_ts_2: BigNumber
        let start_ts_3: BigNumber

        let user_1_ids = [BigNumber.from(0),BigNumber.from(1),BigNumber.from(2)]
        let user_2_ids = [BigNumber.from(0),BigNumber.from(1)]

        beforeEach(async () => {

            await loot.connect(admin).setInitialLootCreator(creator.address)

            const current_ts = await provider.getBlock('latest').then(b => b.timestamp)
            start_ts = BigNumber.from(current_ts).div(WEEK).mul(WEEK)
            start_ts_2 = start_ts.add(WEEK)
            start_ts_3 = start_ts.sub(WEEK.mul(5))

            await creator.connect(admin).createLoot(user1.address, start_ts_3, pal_amounts_1[0], extra_amounts_1[0])
            await creator.connect(admin).createLoot(user1.address, start_ts, pal_amounts_1[1], extra_amounts_1[1])
            await creator.connect(admin).createLoot(user1.address, start_ts_2, pal_amounts_1[2], extra_amounts_1[2])

            await creator.connect(admin).createLoot(user2.address, start_ts, pal_amounts_2[0], extra_amounts_2[0])
            await creator.connect(admin).createLoot(user2.address, start_ts_2, pal_amounts_2[1], extra_amounts_2[1])

        });

        it(' should claim a Loot correctly with the full amounts after the vesting is over', async () => {

            const prev_pal_balance = await pal.balanceOf(user1.address)
            const prev_extra_balance = await extraToken.balanceOf(user1.address)

            const prev_slashed_total = await creator.slashedAmount()

            const tx = await loot.connect(user1).claimLoot(user_1_ids[0], user1.address)

            const loot_data = await loot.getLootData(user1.address, user_1_ids[0])

            expect(loot_data.claimed).to.be.true

            const new_pal_balance = await pal.balanceOf(user1.address)
            const new_extra_balance = await extraToken.balanceOf(user1.address)

            expect(new_pal_balance).to.be.eq(prev_pal_balance.add(loot_data.palAmount))
            expect(new_extra_balance).to.be.eq(prev_extra_balance.add(loot_data.extraAmount))

            expect(await creator.slashedAmount()).to.be.eq(prev_slashed_total)

            expect(tx).to.emit(loot, 'LootClaimed').withArgs(user1.address, user_1_ids[0], loot_data.palAmount, loot_data.extraAmount)

        });

        it(' should slash the PAL rewards if the vesting is not finished yet', async () => {

            const prev_pal_balance = await pal.balanceOf(user1.address)
            const prev_extra_balance = await extraToken.balanceOf(user1.address)

            const prev_slashed_total = await creator.slashedAmount()

            const tx = await loot.connect(user1).claimLoot(user_1_ids[1], user1.address)
            const tx_ts = BigNumber.from((await provider.getBlock((await tx).blockNumber || 0)).timestamp)

            const loot_data = await loot.getLootData(user1.address, user_1_ids[1])

            expect(loot_data.claimed).to.be.true

            const expected_slash_amount = loot_data.palAmount.mul(loot_data.endTs.sub(tx_ts)).div(vesting_duration)
            const claim_pal_amount = loot_data.palAmount.sub(expected_slash_amount)

            const new_pal_balance = await pal.balanceOf(user1.address)
            const new_extra_balance = await extraToken.balanceOf(user1.address)

            expect(new_pal_balance).to.be.eq(prev_pal_balance.add(claim_pal_amount))
            expect(new_extra_balance).to.be.eq(prev_extra_balance.add(loot_data.extraAmount))

            expect(await creator.slashedAmount()).to.be.eq(prev_slashed_total.add(expected_slash_amount))

            expect(tx).to.emit(loot, 'LootClaimed').withArgs(user1.address, user_1_ids[1], claim_pal_amount, loot_data.extraAmount)

        });

        it(' should allow user to claim other Loots', async () => {

            await advanceTime(vesting_duration.add(WEEK).toNumber())

            const prev_pal_balance = await pal.balanceOf(user1.address)
            const prev_extra_balance = await extraToken.balanceOf(user1.address)

            const prev_slashed_total = await creator.slashedAmount()

            const tx = await loot.connect(user1).claimLoot(user_1_ids[0], user1.address)

            const loot_data = await loot.getLootData(user1.address, user_1_ids[0])

            expect(loot_data.claimed).to.be.true

            const new_pal_balance = await pal.balanceOf(user1.address)
            const new_extra_balance = await extraToken.balanceOf(user1.address)

            expect(new_pal_balance).to.be.eq(prev_pal_balance.add(loot_data.palAmount))
            expect(new_extra_balance).to.be.eq(prev_extra_balance.add(loot_data.extraAmount))

            expect(await creator.slashedAmount()).to.be.eq(prev_slashed_total)

            expect(tx).to.emit(loot, 'LootClaimed').withArgs(user1.address, user_1_ids[0], loot_data.palAmount, loot_data.extraAmount)

            const tx_2 = await loot.connect(user1).claimLoot(user_1_ids[1], user1.address)

            const loot_data_2 = await loot.getLootData(user1.address, user_1_ids[1])

            expect(loot_data_2.claimed).to.be.true

            const new_pal_balance_2 = await pal.balanceOf(user1.address)
            const new_extra_balance_2 = await extraToken.balanceOf(user1.address)

            expect(new_pal_balance_2).to.be.eq(new_pal_balance.add(loot_data_2.palAmount))
            expect(new_extra_balance_2).to.be.eq(new_extra_balance.add(loot_data_2.extraAmount))

            expect(await creator.slashedAmount()).to.be.eq(prev_slashed_total)

            expect(tx_2).to.emit(loot, 'LootClaimed').withArgs(user1.address, user_1_ids[1], loot_data_2.palAmount, loot_data_2.extraAmount)

        });

        it(' should allow other users to claim too', async () => {

            await advanceTime(vesting_duration.add(WEEK).toNumber())

            const prev_pal_balance_1 = await pal.balanceOf(user1.address)
            const prev_pal_balance_2 = await pal.balanceOf(user2.address)
            const prev_extra_balance_1 = await extraToken.balanceOf(user1.address)
            const prev_extra_balance_2 = await extraToken.balanceOf(user2.address)

            const prev_slashed_total = await creator.slashedAmount()

            const tx_1 = await loot.connect(user1).claimLoot(user_1_ids[1], user1.address)

            const loot_data_1 = await loot.getLootData(user1.address, user_1_ids[1])

            expect(loot_data_1.claimed).to.be.true

            const tx_2 = await loot.connect(user2).claimLoot(user_2_ids[0], user2.address)

            const loot_data_2 = await loot.getLootData(user2.address, user_2_ids[0])

            expect(loot_data_2.claimed).to.be.true

            const new_pal_balance_1 = await pal.balanceOf(user1.address)
            const new_extra_balance_1 = await extraToken.balanceOf(user1.address)

            expect(new_pal_balance_1).to.be.eq(prev_pal_balance_1.add(loot_data_1.palAmount))
            expect(new_extra_balance_1).to.be.eq(prev_extra_balance_1.add(loot_data_1.extraAmount))

            const new_pal_balance_2 = await pal.balanceOf(user2.address)
            const new_extra_balance_2 = await extraToken.balanceOf(user2.address)

            expect(new_pal_balance_2).to.be.eq(prev_pal_balance_2.add(loot_data_2.palAmount))
            expect(new_extra_balance_2).to.be.eq(prev_extra_balance_2.add(loot_data_2.extraAmount))

            expect(await creator.slashedAmount()).to.be.eq(prev_slashed_total)

            expect(tx_1).to.emit(loot, 'LootClaimed').withArgs(user1.address, user_1_ids[1], loot_data_1.palAmount, loot_data_1.extraAmount)
            expect(tx_2).to.emit(loot, 'LootClaimed').withArgs(user2.address, user_2_ids[0], loot_data_2.palAmount, loot_data_2.extraAmount)

        });

        it(' should allow other users to claim too - with slashing too', async () => {

            await advanceTime(WEEK.toNumber())

            const prev_pal_balance_1 = await pal.balanceOf(user1.address)
            const prev_pal_balance_2 = await pal.balanceOf(user2.address)
            const prev_extra_balance_1 = await extraToken.balanceOf(user1.address)
            const prev_extra_balance_2 = await extraToken.balanceOf(user2.address)

            const prev_slashed_total = await creator.slashedAmount()

            const tx_1 = await loot.connect(user1).claimLoot(user_1_ids[1], user1.address)
            const tx_ts_1 = BigNumber.from((await provider.getBlock((await tx_1).blockNumber || 0)).timestamp)

            const loot_data_1 = await loot.getLootData(user1.address, user_1_ids[1])

            expect(loot_data_1.claimed).to.be.true

            const expected_slash_amount_1 = loot_data_1.palAmount.mul(loot_data_1.endTs.sub(tx_ts_1)).div(vesting_duration)
            const claim_pal_amount_1 = loot_data_1.palAmount.sub(expected_slash_amount_1)

            const tx_2 = await loot.connect(user2).claimLoot(user_2_ids[0], user2.address)
            const tx_ts_2 = BigNumber.from((await provider.getBlock((await tx_2).blockNumber || 0)).timestamp)

            const loot_data_2 = await loot.getLootData(user2.address, user_2_ids[0])

            expect(loot_data_2.claimed).to.be.true

            const expected_slash_amount_2 = loot_data_2.palAmount.mul(loot_data_2.endTs.sub(tx_ts_2)).div(vesting_duration)
            const claim_pal_amount_2 = loot_data_2.palAmount.sub(expected_slash_amount_2)

            const new_pal_balance_1 = await pal.balanceOf(user1.address)
            const new_extra_balance_1 = await extraToken.balanceOf(user1.address)

            expect(new_pal_balance_1).to.be.eq(prev_pal_balance_1.add(claim_pal_amount_1))
            expect(new_extra_balance_1).to.be.eq(prev_extra_balance_1.add(loot_data_1.extraAmount))

            const new_pal_balance_2 = await pal.balanceOf(user2.address)
            const new_extra_balance_2 = await extraToken.balanceOf(user2.address)

            expect(new_pal_balance_2).to.be.eq(prev_pal_balance_2.add(claim_pal_amount_2))
            expect(new_extra_balance_2).to.be.eq(prev_extra_balance_2.add(loot_data_2.extraAmount))

            expect(await creator.slashedAmount()).to.be.eq(prev_slashed_total.add(expected_slash_amount_1).add(expected_slash_amount_2))

            expect(tx_1).to.emit(loot, 'LootClaimed').withArgs(user1.address, user_1_ids[1], claim_pal_amount_1, loot_data_1.extraAmount)
            expect(tx_2).to.emit(loot, 'LootClaimed').withArgs(user2.address, user_2_ids[0], claim_pal_amount_2, loot_data_2.extraAmount)

        });

        it(' should claim all given Loots for users - no slashing', async () => {

            await advanceTime(vesting_duration.add(WEEK.mul(2)).toNumber())

            const prev_pal_balance = await pal.balanceOf(user1.address)
            const prev_extra_balance = await extraToken.balanceOf(user1.address)

            const prev_slashed_total = await creator.slashedAmount()

            const tx = await loot.connect(user1).claimMultipleLoot(user_1_ids, user1.address)

            let total_pal_amount = BigNumber.from(0)
            let total_extra_amount = BigNumber.from(0)

            for(let i = 0; i < user_1_ids.length; i++) {
                const loot_data = await loot.getLootData(user1.address, user_1_ids[i])

                expect(loot_data.claimed).to.be.true

                total_pal_amount = total_pal_amount.add(loot_data.palAmount)
                total_extra_amount = total_extra_amount.add(loot_data.extraAmount)

                expect(tx).to.emit(loot, 'LootClaimed').withArgs(user1.address, user_1_ids[i], loot_data.palAmount, loot_data.extraAmount)
            }

            const new_pal_balance = await pal.balanceOf(user1.address)
            const new_extra_balance = await extraToken.balanceOf(user1.address)

            expect(new_pal_balance).to.be.eq(prev_pal_balance.add(total_pal_amount))
            expect(new_extra_balance).to.be.eq(prev_extra_balance.add(total_extra_amount))

            expect(await creator.slashedAmount()).to.be.eq(prev_slashed_total)

        });

        it(' should claim all given Loots for users - slashing', async () => {

            await advanceTime(WEEK.toNumber())

            const prev_pal_balance = await pal.balanceOf(user2.address)
            const prev_extra_balance = await extraToken.balanceOf(user2.address)

            const prev_slashed_total = await creator.slashedAmount()

            const tx = await loot.connect(user2).claimMultipleLoot(user_2_ids, user2.address)
            const tx_ts = BigNumber.from((await provider.getBlock((await tx).blockNumber || 0)).timestamp)

            let total_pal_amount = BigNumber.from(0)
            let total_extra_amount = BigNumber.from(0)
            let total_slashed_amount = BigNumber.from(0)

            for(let i = 0; i < user_2_ids.length; i++) {
                const loot_data = await loot.getLootData(user2.address, user_2_ids[i])

                expect(loot_data.claimed).to.be.true

                const expected_slash_amount = loot_data.palAmount.mul(loot_data.endTs.sub(tx_ts)).div(vesting_duration)
                const claim_pal_amount = loot_data.palAmount.sub(expected_slash_amount)

                total_pal_amount = total_pal_amount.add(claim_pal_amount)
                total_extra_amount = total_extra_amount.add(loot_data.extraAmount)
                total_slashed_amount = total_slashed_amount.add(expected_slash_amount)

                expect(tx).to.emit(loot, 'LootClaimed').withArgs(user2.address, user_2_ids[i], claim_pal_amount, loot_data.extraAmount)
            }

            const new_pal_balance = await pal.balanceOf(user2.address)
            const new_extra_balance = await extraToken.balanceOf(user2.address)

            expect(new_pal_balance).to.be.eq(prev_pal_balance.add(total_pal_amount))
            expect(new_extra_balance).to.be.eq(prev_extra_balance.add(total_extra_amount))

            expect(await creator.slashedAmount()).to.be.eq(prev_slashed_total.add(total_slashed_amount))

        });

        it(' should fail if given an incorrect id', async () => {

            await expect(
                loot.connect(user1).claimLoot(98, user1.address)
            ).to.be.revertedWith("InvalidId")

        });

        it(' should fail if given an incorrect id - multiclaim', async () => {

            await expect(
                loot.connect(user1).claimMultipleLoot([0,98,1], user1.address)
            ).to.be.revertedWith("InvalidId")

        });

        it(' should fail if already claimed', async () => {

            await loot.connect(user1).claimLoot(user_1_ids[0], user1.address)

            await expect(
                loot.connect(user1).claimLoot(user_1_ids[0], user1.address)
            ).to.be.revertedWith("AlreadyClaimed")

        });

        it(' should fail if already claimed - multiclaim', async () => {

            await loot.connect(user1).claimLoot(user_1_ids[0], user1.address)

            await expect(
                loot.connect(user1).claimMultipleLoot(user_1_ids, user1.address)
            ).to.be.revertedWith("AlreadyClaimed")

        });

    });
    
    describe('updateVestingDuration', async () => {

        beforeEach(async () => {

            await loot.connect(admin).setInitialLootCreator(creator.address)

        });

        it(' should update the parameter correctly', async () => {

            const tx = await loot.connect(admin).updateVestingDuration(new_vesting_duration)

            expect(await loot.vestingDuration()).to.be.eq(new_vesting_duration)
            
            expect(tx).to.emit(loot, 'VestingDurationUpdated').withArgs(vesting_duration, new_vesting_duration)

        });

        it(' should fail if given incorrect parameters', async () => {

            await expect(
                loot.connect(admin).updateVestingDuration(BigNumber.from(86400 * 5))
            ).to.be.revertedWith("InvalidParameter")

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                loot.connect(user1).updateVestingDuration(new_vesting_duration)
            ).to.be.reverted
            
            await expect(
                loot.connect(reserve).updateVestingDuration(new_vesting_duration)
            ).to.be.reverted

        });

    });
    
    describe('updateLootCreator', async () => {

        beforeEach(async () => {

            await loot.connect(admin).setInitialLootCreator(creator.address)

        });

        it(' should update the parameter correctly', async () => {

            const tx = await loot.connect(admin).updateLootCreator(new_creator.address)

            expect(await loot.lootCreator()).to.be.eq(new_creator.address)
            
            expect(tx).to.emit(loot, 'LootCreatorUpdated').withArgs(creator.address, new_creator.address)

        });

        it(' should fail if given incorrect parameters', async () => {

            await expect(
                loot.connect(admin).updateLootCreator(ethers.constants.AddressZero)
            ).to.be.revertedWith("InvalidParameter")

            await expect(
                loot.connect(admin).updateLootCreator(creator.address)
            ).to.be.revertedWith("SameAddress")

        });

        it(' should only be allowed for owner', async () => {

            await expect(
                loot.connect(user1).updateLootCreator(new_creator.address)
            ).to.be.reverted
            
            await expect(
                loot.connect(reserve).updateLootCreator(new_creator.address)
            ).to.be.reverted

        });

    });

});