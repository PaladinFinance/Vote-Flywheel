import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { QuestBoardProxy } from "../typechain/contracts/peripheral/QuestBoardProxy";
import { MockQuestBoard } from "../typechain/contracts/test/MockQuestBoard";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { parseBalanceMap } from "./utils/merkle/parse-balance-map";
import BalanceTree from "./utils/merkle/balance-tree";

import {
    resetFork
} from "./utils/utils";

import {
    BLOCK_NUMBER
} from "./integration-tests/constant";

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

let proxyFactory: ContractFactory
let boardFactory: ContractFactory

describe('QuestBoardProxy tests', () => {
    let admin: SignerWithAddress

    let proxy: QuestBoardProxy

    let gauge: SignerWithAddress

    let board1: MockQuestBoard
    let board2: MockQuestBoard
    let board3: MockQuestBoard
    let board4: MockQuestBoard

    let creator1: SignerWithAddress
    let creator2: SignerWithAddress

    before(async () => {
        await resetFork(BLOCK_NUMBER);

        [admin, gauge, creator1, creator2] = await ethers.getSigners();

        proxyFactory = await ethers.getContractFactory("QuestBoardProxy");
        boardFactory = await ethers.getContractFactory("MockQuestBoard");

    })

    beforeEach(async () => {

        board1 = (await boardFactory.deploy()) as MockQuestBoard;
        await board1.deployed()

        board2 = (await boardFactory.deploy()) as MockQuestBoard;
        await board2.deployed()

        board3 = (await boardFactory.deploy()) as MockQuestBoard;
        await board3.deployed()

        board4 = (await boardFactory.deploy()) as MockQuestBoard;
        await board4.deployed()

        proxy = (await proxyFactory.connect(admin).deploy(
            board1.address,
            [board2.address]
        )) as QuestBoardProxy
        await proxy.deployed()

    });

    it(' should be deployed correctly', async () => {
        expect(proxy.address).to.properAddress

        expect(await proxy.mainBoard()).to.be.eq(board1.address)
        expect(await proxy.otherBoards(0)).to.be.eq(board2.address)

        expect(await proxy.isOtherBoard(board1.address)).to.be.eq(false)
        expect(await proxy.isOtherBoard(board2.address)).to.be.eq(true)
        expect(await proxy.isOtherBoard(board3.address)).to.be.eq(false)
        expect(await proxy.isOtherBoard(board4.address)).to.be.eq(false)

        const other_boards = await proxy.getAllOtherBoard()
        expect(other_boards).not.to.include(board1.address)
        expect(other_boards).to.include(board2.address)
        expect(other_boards).not.to.include(board3.address)
        expect(other_boards).not.to.include(board4.address)
        expect(other_boards.length).to.be.eq(1)

    });

    describe('addOtherBoard', async () => {

        it(' should add a new Board correctly', async () => {

            expect(await proxy.isOtherBoard(board3.address)).to.be.eq(false)
            const other_boards = await proxy.getAllOtherBoard()
            expect(other_boards).not.to.include(board1.address)
            expect(other_boards).to.include(board2.address)
            expect(other_boards).not.to.include(board3.address)
            expect(other_boards).not.to.include(board4.address)
            expect(other_boards.length).to.be.eq(1)

            const tx = await proxy.connect(admin).addOtherBoard(board3.address)

            expect(await proxy.isOtherBoard(board3.address)).to.be.eq(true)
            expect(await proxy.otherBoards(0)).to.be.eq(board2.address)
            expect(await proxy.otherBoards(1)).to.be.eq(board3.address)
            const new_other_boards = await proxy.getAllOtherBoard()
            expect(new_other_boards).not.to.include(board1.address)
            expect(new_other_boards).to.include(board2.address)
            expect(new_other_boards).to.include(board3.address)
            expect(new_other_boards).not.to.include(board4.address)
            expect(new_other_boards.length).to.be.eq(2)

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                proxy.connect(admin).addOtherBoard(ethers.constants.AddressZero)
            ).to.be.revertedWith("AddressZero")

        });

        it(' should fail if board is already listed', async () => {

            await expect(
                proxy.connect(admin).addOtherBoard(board2.address)
            ).to.be.revertedWith("AlreadyListed")

        });

        it(' should fail if board is main board', async () => {

            await expect(
                proxy.connect(admin).addOtherBoard(board1.address)
            ).to.be.revertedWith("AlreadyListed")

        });

        it(' should fail if caller not admin', async () => {

            await expect(
                proxy.connect(gauge).addOtherBoard(board3.address)
            ).to.be.reverted

        });

    });

    describe('removeOtherBoard', async () => {

        beforeEach(async () => {

            await proxy.connect(admin).addOtherBoard(board3.address)

        });

        it(' should remove the board correctly', async () => {

            expect(await proxy.isOtherBoard(board2.address)).to.be.eq(true)
            expect(await proxy.isOtherBoard(board3.address)).to.be.eq(true)
            const other_boards = await proxy.getAllOtherBoard()
            expect(other_boards).not.to.include(board1.address)
            expect(other_boards).to.include(board2.address)
            expect(other_boards).to.include(board3.address)
            expect(other_boards).not.to.include(board4.address)
            expect(other_boards.length).to.be.eq(2)

            await proxy.connect(admin).removeOtherBoard(board2.address)

            expect(await proxy.isOtherBoard(board2.address)).to.be.eq(false)
            expect(await proxy.isOtherBoard(board3.address)).to.be.eq(true)
            const new_other_boards = await proxy.getAllOtherBoard()
            expect(new_other_boards).not.to.include(board1.address)
            expect(new_other_boards).not.to.include(board2.address)
            expect(new_other_boards).to.include(board3.address)
            expect(new_other_boards).not.to.include(board4.address)
            expect(new_other_boards.length).to.be.eq(1)

        });

        it(' should fail if board is not listed', async () => {

            await expect(
                proxy.connect(admin).removeOtherBoard(board4.address)
            ).to.be.revertedWith("NotListed")

            await expect(
                proxy.connect(admin).removeOtherBoard(board1.address)
            ).to.be.revertedWith("NotListed")

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                proxy.connect(admin).removeOtherBoard(ethers.constants.AddressZero)
            ).to.be.revertedWith("AddressZero")

        });

        it(' should fail if caller not admin', async () => {

            await expect(
                proxy.connect(gauge).removeOtherBoard(board2.address)
            ).to.be.reverted

        });

    });

    describe('quests', async () => {

        it(' should return the correct Quest id', async () => {

            await board1.connect(admin).addCustomQuest(1, gauge.address, creator1.address)
            await board1.connect(admin).addCustomQuest(2, gauge.address, creator1.address)
            await board2.connect(admin).addCustomQuest(1, gauge.address, creator2.address)

            const quest_data = await proxy.quests(1)

            expect(quest_data.gauge).to.be.eq(gauge.address)
            expect(quest_data.creator).to.be.eq(creator1.address)
            expect(quest_data.creator).not.to.be.eq(creator2.address)

        });

    });

    describe('getQuestIdsForPeriodForGauge', async () => {

        let period = 15000

        it(' should return the correct array size - 2 Boards', async () => {

            await board1.connect(admin).addQuestIdForGaugePerPeriod(period, gauge.address, [1,2,3])
            await board2.connect(admin).addQuestIdForGaugePerPeriod(period, gauge.address, [1,4])

            const all_quests = await proxy.getQuestIdsForPeriodForGauge(gauge.address, period)

            expect(all_quests.length).to.be.eq(5)

        });

        it(' should return the correct array size - 3 Boards', async () => {

            await proxy.connect(admin).addOtherBoard(board3.address)
            await board1.connect(admin).addQuestIdForGaugePerPeriod(period, gauge.address, [1,2,3])
            await board2.connect(admin).addQuestIdForGaugePerPeriod(period, gauge.address, [1,4])
            await board3.connect(admin).addQuestIdForGaugePerPeriod(period, gauge.address, [5,7,8])

            const all_quests = await proxy.getQuestIdsForPeriodForGauge(gauge.address, period)

            expect(all_quests.length).to.be.eq(8)

        });

        it(' should an empty array if nothing in this period', async () => {

            const all_quests = await proxy.getQuestIdsForPeriodForGauge(gauge.address, period)

            expect(all_quests.length).to.be.eq(0)

        });

        it(' should skip if a board has no Quest for this period', async () => {

            await proxy.connect(admin).addOtherBoard(board3.address)
            await board1.connect(admin).addQuestIdForGaugePerPeriod(period, gauge.address, [1,2,3])
            await board3.connect(admin).addQuestIdForGaugePerPeriod(period, gauge.address, [5,7,8])

            const all_quests = await proxy.getQuestIdsForPeriodForGauge(gauge.address, period)

            expect(all_quests.length).to.be.eq(6)

        });

        it(' should not account for a board not listed', async () => {

            await board1.connect(admin).addQuestIdForGaugePerPeriod(period, gauge.address, [1,2,3])
            await board2.connect(admin).addQuestIdForGaugePerPeriod(period, gauge.address, [1,4])
            await board3.connect(admin).addQuestIdForGaugePerPeriod(period, gauge.address, [5,7,8])

            const all_quests = await proxy.getQuestIdsForPeriodForGauge(gauge.address, period)

            expect(all_quests.length).to.be.eq(5)

        });

    });

});