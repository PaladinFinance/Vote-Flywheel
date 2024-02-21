import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { LootVoteController } from "./../typechain/contracts/LootVoteController";
import { MockPowerDelegation } from "./../typechain/contracts/test/MockPowerDelegation";
import { MockFetcher } from "./../typechain/contracts/test/MockFetcher";
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

let controllerFactory: ContractFactory
let powerFactory: ContractFactory
let fetcherFactory: ContractFactory

const DEFAULT_CAP = ethers.utils.parseEther("0.1")
const UNIT = ethers.utils.parseEther("1")

describe('LootVoteController contract tests', () => {
    let admin: SignerWithAddress

    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress

    let manager: SignerWithAddress
    let proxyVoter1: SignerWithAddress
    let proxyVoter2: SignerWithAddress

    let board1: SignerWithAddress
    let board2: SignerWithAddress
    let board3: SignerWithAddress

    let distributor1: SignerWithAddress
    let distributor2: SignerWithAddress
    let distributor3: SignerWithAddress

    let gauge1: SignerWithAddress
    let gauge2: SignerWithAddress
    let gauge3: SignerWithAddress
    let gauge4: SignerWithAddress
    let gauge5: SignerWithAddress

    let controller: LootVoteController

    let power: MockPowerDelegation

    let newDistributor: SignerWithAddress

    let fetcher: MockFetcher


    before(async () => {
        await resetFork();

        [admin, user1, user2, user3, manager, proxyVoter1, proxyVoter2, board1, board2, board3, distributor1, distributor2, distributor3, newDistributor, gauge1, gauge2, gauge3, gauge4, gauge5] = await ethers.getSigners();

        controllerFactory = await ethers.getContractFactory("LootVoteController");
        powerFactory = await ethers.getContractFactory("MockPowerDelegation");
        fetcherFactory = await ethers.getContractFactory("MockFetcher");

    })

    beforeEach(async () => {

        power = (await powerFactory.connect(admin).deploy()) as MockPowerDelegation
        await power.deployed()

        controller = (await controllerFactory.connect(admin).deploy(
            power.address
        )) as LootVoteController
        await controller.deployed()

        fetcher = (await fetcherFactory.connect(admin).deploy()) as MockFetcher

    });

    it(' should be deployed correctly', async () => {
        expect(controller.address).to.properAddress

        expect(await controller.hPalPower()).to.be.eq(power.address)

        expect(await controller.nextBoardId()).to.be.eq(1)
        expect(await controller.defaultCap()).to.be.eq(ethers.utils.parseEther("0.1"))

    });

    describe('addNewBoard', async () => {

        it(' should add the Board correctly', async () => {

            const expected_board_id = await controller.nextBoardId()

            const tx = await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )

            expect(await controller.nextBoardId()).to.be.eq(expected_board_id.add(1))

            const id_data = await controller.questBoards(expected_board_id)
            expect(id_data.board).to.be.eq(board1.address)
            expect(id_data.distributor).to.be.eq(distributor1.address)

            expect(await controller.boardToId(board1.address)).to.be.eq(expected_board_id)
            expect(await controller.distributorToId(distributor1.address)).to.be.eq(expected_board_id)

            expect(tx).to.emit(controller, "NewBoardListed").withArgs(
                expected_board_id,
                board1.address,
                distributor1.address
            )

        });

        it(' should allow to add more Boards', async () => {

            const expected_board_id = await controller.nextBoardId()
            const expected_board_id2 = expected_board_id.add(1)

            const tx = await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )

            const id_data = await controller.questBoards(expected_board_id)
            expect(id_data.board).to.be.eq(board1.address)
            expect(id_data.distributor).to.be.eq(distributor1.address)

            expect(await controller.boardToId(board1.address)).to.be.eq(expected_board_id)
            expect(await controller.distributorToId(distributor1.address)).to.be.eq(expected_board_id)

            expect(tx).to.emit(controller, "NewBoardListed").withArgs(
                expected_board_id,
                board1.address,
                distributor1.address
            )

            const tx2 = await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            const id_data2 = await controller.questBoards(expected_board_id2)
            expect(id_data2.board).to.be.eq(board2.address)
            expect(id_data2.distributor).to.be.eq(distributor2.address)

            expect(await controller.boardToId(board2.address)).to.be.eq(expected_board_id2)
            expect(await controller.distributorToId(distributor2.address)).to.be.eq(expected_board_id2)

            expect(tx2).to.emit(controller, "NewBoardListed").withArgs(
                expected_board_id2,
                board2.address,
                distributor2.address
            )

            expect(await controller.nextBoardId()).to.be.eq(expected_board_id.add(2))

        });

        it(' should fail if given an incorrect parameter', async () => {

            await expect(
                controller.connect(admin).addNewBoard(
                    ethers.constants.AddressZero,
                    distributor1.address,
                )
            ).to.be.revertedWith('AddressZero')

            await expect(
                controller.connect(admin).addNewBoard(
                    board1.address,
                    ethers.constants.AddressZero,
                )
            ).to.be.revertedWith('AddressZero')

            await expect(
                controller.connect(admin).addNewBoard(
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                )
            ).to.be.revertedWith('AddressZero')

        });

        it(' should fail if Board is already listed', async () => {

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )

            await expect(
                controller.connect(admin).addNewBoard(
                    board1.address,
                    distributor2.address,
                )
            ).to.be.revertedWith('AlreadyListed')

            await expect(
                controller.connect(admin).addNewBoard(
                    board2.address,
                    distributor1.address,
                )
            ).to.be.revertedWith('AlreadyListed')

        });

        it(' should only be allowed for admin', async () => {

            await expect(
                controller.connect(user1).addNewBoard(
                    board1.address,
                    distributor1.address,
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + user1.address + '")')

            await expect(
                controller.connect(gauge1).addNewBoard(
                    board1.address,
                    distributor1.address,
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + gauge1.address + '")')

        });
    
    });

    describe('updateDistributor', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

        });

        it(' should update the Distributor for the correct Board', async () => {

            const tx = await controller.connect(admin).updateDistributor(
                board1.address,
                newDistributor.address,
            )

            const id_data = await controller.questBoards(board1_id)
            expect(id_data.board).to.be.eq(board1.address)
            expect(id_data.distributor).to.be.eq(newDistributor.address)

            expect(await controller.boardToId(board1.address)).to.be.eq(board1_id)
            expect(await controller.distributorToId(newDistributor.address)).to.be.eq(board1_id)

            const id_data2 = await controller.questBoards(board2_id)
            expect(id_data2.board).to.be.eq(board2.address)
            expect(id_data2.distributor).to.be.eq(distributor2.address)

            expect(await controller.boardToId(board2.address)).to.be.eq(board2_id)
            expect(await controller.distributorToId(distributor2.address)).to.be.eq(board2_id)

            expect(tx).to.emit(controller, "BoardUpdated").withArgs(
                board1_id,
                newDistributor.address
            )

        });

        it(' should fail if the Board is not listed', async () => {

            await expect(
                controller.connect(admin).updateDistributor(
                    board3.address,
                    newDistributor.address,
                )
            ).to.be.revertedWith('InvalidParameter')

        });

        it(' should fail if the Distributor is already listed with another Board', async () => {

            await expect(
                controller.connect(admin).updateDistributor(
                    board3.address,
                    distributor2.address,
                )
            ).to.be.revertedWith('AlreadyListed')

        });

        it(' should fail if given invalid parameters', async () => {

            await expect(
                controller.connect(admin).updateDistributor(
                    ethers.constants.AddressZero,
                    newDistributor.address,
                )
            ).to.be.revertedWith('AddressZero')

            await expect(
                controller.connect(admin).updateDistributor(
                    board1.address,
                    ethers.constants.AddressZero,
                )
            ).to.be.revertedWith('AddressZero')

            await expect(
                controller.connect(admin).updateDistributor(
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                )
            ).to.be.revertedWith('AddressZero')

        });

        it(' should only be allowed for admin', async () => {

            await expect(
                controller.connect(user1).updateDistributor(
                    board1.address,
                    newDistributor.address,
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + user1.address + '")')

            await expect(
                controller.connect(gauge1).updateDistributor(
                    board1.address,
                    newDistributor.address,
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + gauge1.address + '")')

        });
    
    });
    
    describe('updateDefaultGaugeCap', async () => {

        const new_default_cap = ethers.utils.parseEther("0.2")

        it(' should update the default gauge cap correctly', async () => {

            expect(await controller.defaultCap()).to.be.eq(DEFAULT_CAP)

            const tx = await controller.connect(admin).updateDefaultGaugeCap(
                new_default_cap
            )
            
            expect(await controller.defaultCap()).to.be.eq(new_default_cap)

            expect(tx).to.emit(controller, "DefaultCapUpdated").withArgs(new_default_cap)
            
        });

        it(' should fail if the new given cap is invalid', async () => {

            await expect(
                controller.connect(admin).updateDefaultGaugeCap(
                    ethers.utils.parseEther("0.0000001")
                )
            ).to.be.revertedWith('InvalidGaugeCap')

            await expect(
                controller.connect(admin).updateDefaultGaugeCap(
                    ethers.utils.parseEther("3")
                )
            ).to.be.revertedWith('InvalidGaugeCap')

            await expect(
                controller.connect(admin).updateDefaultGaugeCap(
                    0
                )
            ).to.be.revertedWith('InvalidGaugeCap')

        });

        it(' should only be allowed for admin', async () => {

            await expect(
                controller.connect(user1).updateDefaultGaugeCap(
                    new_default_cap
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + user1.address + '")')

            await expect(
                controller.connect(gauge1).updateDefaultGaugeCap(
                    new_default_cap
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + gauge1.address + '")')

        });
    
    });

    describe('addNewGauge', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

        });

        it(' should add the gauge correctly - no cap', async () => {

            expect(await controller.gaugeToBoardId(gauge1.address)).to.be.eq(0)
            expect(await controller.isListedGauge(gauge1.address)).to.be.false
            expect(await controller.getBoardForGauge(gauge1.address)).to.be.eq(ethers.constants.AddressZero)
            expect(await controller.getDistributorForGauge(gauge1.address)).to.be.eq(ethers.constants.AddressZero)

            const tx = await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            expect(await controller.gaugeToBoardId(gauge1.address)).to.be.eq(board1_id)
            
            expect(await controller.gaugeCaps(gauge1.address)).to.be.eq(0)
            expect(await controller.getGaugeCap(gauge1.address)).to.be.eq(DEFAULT_CAP)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(tx_ts.add(WEEK).div(WEEK).mul(WEEK))

            expect(await controller.isListedGauge(gauge1.address)).to.be.true
            expect(await controller.getBoardForGauge(gauge1.address)).to.be.eq(board1.address)
            expect(await controller.getDistributorForGauge(gauge1.address)).to.be.eq(distributor1.address)

            expect(tx).to.emit(controller, "NewGaugeAdded").withArgs(
                gauge1.address,
                board1_id,
                0
            )

        });

        it(' should add the gauge correctly - with cap', async () => {

            const gauge_cap = ethers.utils.parseEther("0.15")

            expect(await controller.gaugeToBoardId(gauge1.address)).to.be.eq(0)
            expect(await controller.isListedGauge(gauge1.address)).to.be.false
            expect(await controller.getBoardForGauge(gauge1.address)).to.be.eq(ethers.constants.AddressZero)
            expect(await controller.getDistributorForGauge(gauge1.address)).to.be.eq(ethers.constants.AddressZero)

            const tx = await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                gauge_cap
            )
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            expect(await controller.gaugeToBoardId(gauge1.address)).to.be.eq(board1_id)
            
            expect(await controller.gaugeCaps(gauge1.address)).to.be.eq(gauge_cap)
            expect(await controller.getGaugeCap(gauge1.address)).to.be.eq(gauge_cap)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(tx_ts.add(WEEK).div(WEEK).mul(WEEK))

            expect(await controller.isListedGauge(gauge1.address)).to.be.true
            expect(await controller.getBoardForGauge(gauge1.address)).to.be.eq(board1.address)
            expect(await controller.getDistributorForGauge(gauge1.address)).to.be.eq(distributor1.address)

            expect(tx).to.emit(controller, "NewGaugeAdded").withArgs(
                gauge1.address,
                board1_id,
                gauge_cap
            )

        });

        it(' should allow to add multiple gauges on the same Board', async () => {

            const gauge2_cap = ethers.utils.parseEther("0.15")

            expect(await controller.gaugeToBoardId(gauge1.address)).to.be.eq(0)
            expect(await controller.isListedGauge(gauge1.address)).to.be.false
            expect(await controller.getBoardForGauge(gauge1.address)).to.be.eq(ethers.constants.AddressZero)
            expect(await controller.getDistributorForGauge(gauge1.address)).to.be.eq(ethers.constants.AddressZero)

            expect(await controller.gaugeToBoardId(gauge2.address)).to.be.eq(0)
            expect(await controller.isListedGauge(gauge2.address)).to.be.false
            expect(await controller.getBoardForGauge(gauge2.address)).to.be.eq(ethers.constants.AddressZero)
            expect(await controller.getDistributorForGauge(gauge2.address)).to.be.eq(ethers.constants.AddressZero)

            expect(await controller.gaugeToBoardId(gauge3.address)).to.be.eq(0)
            expect(await controller.isListedGauge(gauge3.address)).to.be.false
            expect(await controller.getBoardForGauge(gauge3.address)).to.be.eq(ethers.constants.AddressZero)
            expect(await controller.getDistributorForGauge(gauge3.address)).to.be.eq(ethers.constants.AddressZero)

            const tx = await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const tx2 = await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            const tx_ts2 = BigNumber.from((await provider.getBlock(tx2.blockNumber || 0)).timestamp)

            const tx3 = await controller.connect(admin).addNewGauge(
                gauge3.address,
                board1_id,
                0
            )
            const tx_ts3 = BigNumber.from((await provider.getBlock(tx3.blockNumber || 0)).timestamp)

            expect(await controller.gaugeToBoardId(gauge1.address)).to.be.eq(board1_id)
            expect(await controller.gaugeToBoardId(gauge2.address)).to.be.eq(board1_id)
            expect(await controller.gaugeToBoardId(gauge3.address)).to.be.eq(board1_id)
            
            expect(await controller.gaugeCaps(gauge1.address)).to.be.eq(0)
            expect(await controller.getGaugeCap(gauge1.address)).to.be.eq(DEFAULT_CAP)
            expect(await controller.gaugeCaps(gauge2.address)).to.be.eq(gauge2_cap)
            expect(await controller.getGaugeCap(gauge2.address)).to.be.eq(gauge2_cap)
            expect(await controller.gaugeCaps(gauge3.address)).to.be.eq(0)
            expect(await controller.getGaugeCap(gauge3.address)).to.be.eq(DEFAULT_CAP)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(tx_ts.add(WEEK).div(WEEK).mul(WEEK))
            expect(await controller.timeWeight(gauge2.address)).to.be.eq(tx_ts2.add(WEEK).div(WEEK).mul(WEEK))
            expect(await controller.timeWeight(gauge3.address)).to.be.eq(tx_ts3.add(WEEK).div(WEEK).mul(WEEK))

            expect(await controller.isListedGauge(gauge1.address)).to.be.true
            expect(await controller.getBoardForGauge(gauge1.address)).to.be.eq(board1.address)
            expect(await controller.getDistributorForGauge(gauge1.address)).to.be.eq(distributor1.address)

            expect(await controller.isListedGauge(gauge2.address)).to.be.true
            expect(await controller.getBoardForGauge(gauge2.address)).to.be.eq(board1.address)
            expect(await controller.getDistributorForGauge(gauge2.address)).to.be.eq(distributor1.address)

            expect(await controller.isListedGauge(gauge3.address)).to.be.true
            expect(await controller.getBoardForGauge(gauge3.address)).to.be.eq(board1.address)
            expect(await controller.getDistributorForGauge(gauge3.address)).to.be.eq(distributor1.address)

            expect(tx).to.emit(controller, "NewGaugeAdded").withArgs(
                gauge1.address,
                board1_id,
                0
            )

            expect(tx2).to.emit(controller, "NewGaugeAdded").withArgs(
                gauge2.address,
                board1_id,
                gauge2_cap
            )

            expect(tx3).to.emit(controller, "NewGaugeAdded").withArgs(
                gauge3.address,
                board1_id,
                0
            )

        });

        it(' should allow to add multiple gauges on the different Boards', async () => {

            const gauge2_cap = ethers.utils.parseEther("0.15")

            expect(await controller.gaugeToBoardId(gauge1.address)).to.be.eq(0)
            expect(await controller.isListedGauge(gauge1.address)).to.be.false
            expect(await controller.getBoardForGauge(gauge1.address)).to.be.eq(ethers.constants.AddressZero)
            expect(await controller.getDistributorForGauge(gauge1.address)).to.be.eq(ethers.constants.AddressZero)

            expect(await controller.gaugeToBoardId(gauge2.address)).to.be.eq(0)
            expect(await controller.isListedGauge(gauge2.address)).to.be.false
            expect(await controller.getBoardForGauge(gauge2.address)).to.be.eq(ethers.constants.AddressZero)
            expect(await controller.getDistributorForGauge(gauge2.address)).to.be.eq(ethers.constants.AddressZero)

            expect(await controller.gaugeToBoardId(gauge3.address)).to.be.eq(0)
            expect(await controller.isListedGauge(gauge3.address)).to.be.false
            expect(await controller.getBoardForGauge(gauge3.address)).to.be.eq(ethers.constants.AddressZero)
            expect(await controller.getDistributorForGauge(gauge3.address)).to.be.eq(ethers.constants.AddressZero)

            const tx = await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const tx2 = await controller.connect(admin).addNewGauge(
                gauge2.address,
                board2_id,
                gauge2_cap
            )
            const tx_ts2 = BigNumber.from((await provider.getBlock(tx2.blockNumber || 0)).timestamp)

            const tx3 = await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            const tx_ts3 = BigNumber.from((await provider.getBlock(tx3.blockNumber || 0)).timestamp)

            expect(await controller.gaugeToBoardId(gauge1.address)).to.be.eq(board1_id)
            expect(await controller.gaugeToBoardId(gauge2.address)).to.be.eq(board2_id)
            expect(await controller.gaugeToBoardId(gauge3.address)).to.be.eq(board2_id)
            
            expect(await controller.gaugeCaps(gauge1.address)).to.be.eq(0)
            expect(await controller.getGaugeCap(gauge1.address)).to.be.eq(DEFAULT_CAP)
            expect(await controller.gaugeCaps(gauge2.address)).to.be.eq(gauge2_cap)
            expect(await controller.getGaugeCap(gauge2.address)).to.be.eq(gauge2_cap)
            expect(await controller.gaugeCaps(gauge3.address)).to.be.eq(0)
            expect(await controller.getGaugeCap(gauge3.address)).to.be.eq(DEFAULT_CAP)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(tx_ts.add(WEEK).div(WEEK).mul(WEEK))
            expect(await controller.timeWeight(gauge2.address)).to.be.eq(tx_ts2.add(WEEK).div(WEEK).mul(WEEK))
            expect(await controller.timeWeight(gauge3.address)).to.be.eq(tx_ts3.add(WEEK).div(WEEK).mul(WEEK))

            expect(await controller.isListedGauge(gauge1.address)).to.be.true
            expect(await controller.getBoardForGauge(gauge1.address)).to.be.eq(board1.address)
            expect(await controller.getDistributorForGauge(gauge1.address)).to.be.eq(distributor1.address)

            expect(await controller.isListedGauge(gauge2.address)).to.be.true
            expect(await controller.getBoardForGauge(gauge2.address)).to.be.eq(board2.address)
            expect(await controller.getDistributorForGauge(gauge2.address)).to.be.eq(distributor2.address)

            expect(await controller.isListedGauge(gauge3.address)).to.be.true
            expect(await controller.getBoardForGauge(gauge3.address)).to.be.eq(board2.address)
            expect(await controller.getDistributorForGauge(gauge3.address)).to.be.eq(distributor2.address)

            expect(tx).to.emit(controller, "NewGaugeAdded").withArgs(
                gauge1.address,
                board1_id,
                0
            )

            expect(tx2).to.emit(controller, "NewGaugeAdded").withArgs(
                gauge2.address,
                board2_id,
                gauge2_cap
            )

            expect(tx3).to.emit(controller, "NewGaugeAdded").withArgs(
                gauge3.address,
                board2_id,
                0
            )

        });

        it(' should fail if the gauge is already listed', async () => {

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )

            await expect(
                controller.connect(admin).addNewGauge(
                    gauge1.address,
                    board1_id,
                    0
                )
            ).to.be.revertedWith('AlreadyListed')

        });

        it(' should fail if the given parameters are invalid', async () => {

            await expect(
                controller.connect(admin).addNewGauge(
                    gauge1.address,
                    0,
                    0
                )
            ).to.be.revertedWith('InvalidParameter')

            await expect(
                controller.connect(admin).addNewGauge(
                    ethers.constants.AddressZero,
                    board1_id,
                    0
                )
            ).to.be.revertedWith('AddressZero')

        });

        it(' should fail if the given cap is invalid', async () => {

            await expect(
                controller.connect(admin).addNewGauge(
                    gauge1.address,
                    board1_id,
                    ethers.utils.parseEther("0.0000001")
                )
            ).to.be.revertedWith('InvalidGaugeCap')

            await expect(
                controller.connect(admin).addNewGauge(
                    gauge1.address,
                    board1_id,
                    ethers.utils.parseEther("3")
                )
            ).to.be.revertedWith('InvalidGaugeCap')

        });

        it(' should only be allowed for admin', async () => {

            await expect(
                controller.connect(user1).addNewGauge(
                    gauge1.address,
                    board1_id,
                    0
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + user1.address + '")')

            await expect(
                controller.connect(gauge1).addNewGauge(
                    board1.address,
                    board1_id,
                    0
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + gauge1.address + '")')

        });
    
    });

    describe('updateGaugeCap', async () => {

        let board1_id: BigNumber

        const prev_gauge2_cap = ethers.utils.parseEther("0.15")

        const new_gauge1_cap = ethers.utils.parseEther("0.2")
        const new_gauge2_cap = ethers.utils.parseEther("0.05")

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )

            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                prev_gauge2_cap
            )

        });

        it(' should update the gauge cap from the default correctly', async () => {

            expect(await controller.gaugeCaps(gauge1.address)).to.be.eq(0)
            expect(await controller.getGaugeCap(gauge1.address)).to.be.eq(DEFAULT_CAP)

            const tx = await controller.connect(admin).updateGaugeCap(
                gauge1.address,
                new_gauge1_cap
            )
            
            expect(await controller.gaugeCaps(gauge1.address)).to.be.eq(new_gauge1_cap)
            expect(await controller.getGaugeCap(gauge1.address)).to.be.eq(new_gauge1_cap)

            expect(tx).to.emit(controller, "GaugeCapUpdated").withArgs(
                gauge1.address,
                board1_id,
                new_gauge1_cap
            )
            
        });

        it(' should reduce an already established gauge cap correctly', async () => {

            expect(await controller.gaugeCaps(gauge2.address)).to.be.eq(prev_gauge2_cap)
            expect(await controller.getGaugeCap(gauge2.address)).to.be.eq(prev_gauge2_cap)

            const tx = await controller.connect(admin).updateGaugeCap(
                gauge2.address,
                new_gauge2_cap
            )
            
            expect(await controller.gaugeCaps(gauge2.address)).to.be.eq(new_gauge2_cap)
            expect(await controller.getGaugeCap(gauge2.address)).to.be.eq(new_gauge2_cap)

            expect(tx).to.emit(controller, "GaugeCapUpdated").withArgs(
                gauge2.address,
                board1_id,
                new_gauge2_cap
            )

        });

        it(' should fail if the gauge is not listed', async () => {

            await expect(
                controller.connect(admin).updateGaugeCap(
                    gauge5.address,
                    new_gauge1_cap
                )
            ).to.be.revertedWith('InvalidParameter')

        });

        it(' should fail if the gauge was killed', async () => {

            await controller.connect(admin).killGauge(gauge1.address)

            await expect(
                controller.connect(admin).updateGaugeCap(
                    gauge1.address,
                    new_gauge1_cap
                )
            ).to.be.revertedWith('KilledGauge')

        });

        it(' should fail if given an incorrect parameter', async () => {

            await expect(
                controller.connect(admin).updateGaugeCap(
                    ethers.constants.AddressZero,
                    new_gauge1_cap
                )
            ).to.be.revertedWith('AddressZero')

        });

        it(' should fail if the given cap is invalid', async () => {

            await expect(
                controller.connect(admin).updateGaugeCap(
                    gauge1.address,
                    ethers.utils.parseEther("0.0000001")
                )
            ).to.be.revertedWith('InvalidGaugeCap')

            await expect(
                controller.connect(admin).updateGaugeCap(
                    gauge1.address,
                    ethers.utils.parseEther("3")
                )
            ).to.be.revertedWith('InvalidGaugeCap')

        });

        it(' should only be allowed for admin', async () => {

            await expect(
                controller.connect(user1).updateGaugeCap(
                    gauge1.address,
                    new_gauge1_cap
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + user1.address + '")')

            await expect(
                controller.connect(gauge1).updateGaugeCap(
                    gauge1.address,
                    new_gauge1_cap
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + gauge1.address + '")')

        });
    
    });

    describe('killGauge', async () => {

        let board1_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )

            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )

        });

        it(' should kill the gauge correctly', async () => {

            expect(await controller.isGaugeKilled(gauge1.address)).to.be.false

            const tx = await controller.connect(admin).killGauge(gauge1.address)

            expect(await controller.isGaugeKilled(gauge1.address)).to.be.true

            expect(tx).to.emit(controller, "GaugeKilled").withArgs(gauge1.address, board1_id)

        });

        it(' should fail if the gauge is not listed', async () => {

            await expect(
                controller.connect(admin).killGauge(
                    gauge3.address
                )
            ).to.be.revertedWith('NotListed')

        });

        it(' should fail if the gauge is already killed', async () => {

            await controller.connect(admin).killGauge(gauge1.address)

            await expect(
                controller.connect(admin).killGauge(
                    gauge1.address
                )
            ).to.be.revertedWith('KilledGauge')

        });

        it(' should fail if given an invalid parameter', async () => {

            await expect(
                controller.connect(admin).killGauge(
                    ethers.constants.AddressZero
                )
            ).to.be.revertedWith('AddressZero')

        });

        it(' should only be allowed for admin', async () => {

            await expect(
                controller.connect(user1).killGauge(
                    gauge1.address
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + user1.address + '")')

            await expect(
                controller.connect(gauge1).killGauge(
                    gauge1.address
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + gauge1.address + '")')

        });
    
    });

    describe('unkillGauge', async () => {

        let board1_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )

            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )

            await controller.connect(admin).killGauge(gauge1.address)

        });

        it(' should unkill the gauge correctly', async () => {

            expect(await controller.isGaugeKilled(gauge1.address)).to.be.true

            const tx = await controller.connect(admin).unkillGauge(gauge1.address)

            expect(await controller.isGaugeKilled(gauge1.address)).to.be.false

            expect(tx).to.emit(controller, "GaugeUnkilled").withArgs(gauge1.address, board1_id)

        });

        it(' should fail if the gauge is not listed', async () => {

            await expect(
                controller.connect(admin).unkillGauge(
                    gauge3.address
                )
            ).to.be.revertedWith('NotKilledGauge')

        });

        it(' should fail if the gauge is not killed', async () => {

            await expect(
                controller.connect(admin).unkillGauge(
                    gauge2.address
                )
            ).to.be.revertedWith('NotKilledGauge')

        });

        it(' should fail if given incorrect parameters', async () => {

            await expect(
                controller.connect(admin).unkillGauge(
                    ethers.constants.AddressZero
                )
            ).to.be.revertedWith('AddressZero')

        });

        it(' should only be allowed for admin', async () => {

            await expect(
                controller.connect(user1).unkillGauge(
                    gauge1.address
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + user1.address + '")')

            await expect(
                controller.connect(gauge1).unkillGauge(
                    gauge1.address
                )
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + gauge1.address + '")')

        });
    
    });

    describe('voteForGaugeWeights', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge4.address,
                board2_id,
                0
            )

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user1_slope = ethers.utils.parseEther("2500").div(WEEK.mul(104))
            const user2_slope = ethers.utils.parseEther("4750").div(WEEK.mul(104))

            const user1_point = {
                bias: user1_slope.mul(WEEK.mul(104)),
                slope: user1_slope,
                endTimestamp: current_ts.add(WEEK.mul(85)),
                blockNumber: current_block - 500,
            }
            const user2_point = {
                bias: user2_slope.mul(WEEK.mul(104)),
                slope: user2_slope,
                endTimestamp: current_ts.add(WEEK.mul(96)),
                blockNumber: current_block - 355,
            }

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts,
                user1_point
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts,
                user2_point
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.add(WEEK.mul(85)))
            await power.connect(admin).setLockedEnd(user2.address, current_ts.add(WEEK.mul(96)))

        });

        it(' should vote for the gauge with the correct power', async () => {

            const vote_power = 4000

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const previous_gauge_change = await controller.changesWeight(gauge1.address, user_point.endTimestamp)
            const previous_total_change = await controller.changesWeightTotal(user_point.endTimestamp)

            const tx = await controller.connect(user1).voteForGaugeWeights(gauge1.address, vote_power)
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const expected_vote_slope = user_point.slope.mul(vote_power).div(10000)
            const expected_vote_bias = expected_vote_slope.mul(user_point.endTimestamp.sub(next_period))

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.add(vote_power))
            expect(await controller.usedFreePower(user1.address)).to.be.eq(user_prev_used_power.add(vote_power))

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias.add(expected_vote_bias))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope.add(expected_vote_slope))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.add(expected_vote_bias))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.add(expected_vote_slope))

            expect(await controller.changesWeight(gauge1.address, user_point.endTimestamp)).to.be.eq(previous_gauge_change.add(expected_vote_slope))
            expect(await controller.changesWeightTotal(user_point.endTimestamp)).to.be.eq(previous_total_change.add(expected_vote_slope))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(vote_power)
            expect(last_user_vote_slope.end).to.be.eq(user_point.endTimestamp)
            expect(last_user_vote_slope.caller).to.be.eq(user1.address)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                vote_power
            )

        });

        it(' should remove the vote correctly', async () => {

            const vote_power = 4000

            await controller.connect(user1).voteForGaugeWeights(gauge1.address, vote_power)

            await advanceTime(WEEK.mul(2).toNumber())

            await controller.connect(user1).updateGaugeWeight(gauge1.address)
            await controller.connect(user1).updateTotalWeight()

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const prev_user_voted_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const expected_prev_bias = prev_user_voted_slope.slope.mul(prev_user_voted_slope.end.sub(next_period))

            const previous_gauge_change = await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)
            const previous_total_change = await controller.changesWeightTotal(prev_user_voted_slope.end)

            const tx = await controller.connect(user1).voteForGaugeWeights(gauge1.address, 0)
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.sub(vote_power))
            expect(await controller.usedFreePower(user1.address)).to.be.eq(user_prev_used_power.sub(vote_power))

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias.sub(expected_prev_bias))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope.sub(prev_user_voted_slope.slope))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.sub(expected_prev_bias))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.sub(prev_user_voted_slope.slope))

            expect(await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change.sub(prev_user_voted_slope.slope))
            expect(await controller.changesWeightTotal(prev_user_voted_slope.end)).to.be.eq(previous_total_change.sub(prev_user_voted_slope.slope))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)

            expect(last_user_vote_slope.slope).to.be.eq(0)
            expect(last_user_vote_slope.power).to.be.eq(0)
            expect(last_user_vote_slope.end).to.be.eq(prev_user_voted_slope.end)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                0
            )

        });

        it(' should update the vote correctly using the correct new power - increase', async () => {

            const vote_power = 4000
            const new_vote_power = 5500

            await controller.connect(user1).voteForGaugeWeights(gauge1.address, vote_power)

            await advanceTime(WEEK.mul(2).toNumber())

            await controller.connect(user1).updateGaugeWeight(gauge1.address)
            await controller.connect(user1).updateTotalWeight()

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const prev_user_voted_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const expected_prev_bias = prev_user_voted_slope.slope.mul(prev_user_voted_slope.end.sub(next_period))

            const previous_gauge_change = await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)
            const previous_total_change = await controller.changesWeightTotal(prev_user_voted_slope.end)

            const tx = await controller.connect(user1).voteForGaugeWeights(gauge1.address, new_vote_power)
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const expected_vote_slope = user_point.slope.mul(new_vote_power).div(10000)
            const expected_vote_bias = expected_vote_slope.mul(user_point.endTimestamp.sub(next_period))

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.sub(vote_power).add(new_vote_power))

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias.sub(expected_prev_bias).add(expected_vote_bias))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope.sub(prev_user_voted_slope.slope).add(expected_vote_slope))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.sub(expected_prev_bias).add(expected_vote_bias))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.sub(prev_user_voted_slope.slope).add(expected_vote_slope))

            expect(await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change.sub(prev_user_voted_slope.slope).add(expected_vote_slope))
            expect(await controller.changesWeightTotal(prev_user_voted_slope.end)).to.be.eq(previous_total_change.sub(prev_user_voted_slope.slope).add(expected_vote_slope))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(new_vote_power)
            expect(last_user_vote_slope.end).to.be.eq(prev_user_voted_slope.end)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                new_vote_power
            )

        });

        it(' should update the vote correctly using the correct new power - decrease', async () => {

            const vote_power = 4000
            const new_vote_power = 2500

            await controller.connect(user1).voteForGaugeWeights(gauge1.address, vote_power)

            await advanceTime(WEEK.mul(2).toNumber())

            await controller.connect(user1).updateGaugeWeight(gauge1.address)
            await controller.connect(user1).updateTotalWeight()

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const prev_user_voted_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const expected_prev_bias = prev_user_voted_slope.slope.mul(prev_user_voted_slope.end.sub(next_period))

            const previous_gauge_change = await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)
            const previous_total_change = await controller.changesWeightTotal(prev_user_voted_slope.end)

            const tx = await controller.connect(user1).voteForGaugeWeights(gauge1.address, new_vote_power)
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const expected_vote_slope = user_point.slope.mul(new_vote_power).div(10000)
            const expected_vote_bias = expected_vote_slope.mul(user_point.endTimestamp.sub(next_period))

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.sub(vote_power).add(new_vote_power))

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias.sub(expected_prev_bias).add(expected_vote_bias))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope.sub(prev_user_voted_slope.slope).add(expected_vote_slope))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.sub(expected_prev_bias).add(expected_vote_bias))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.sub(prev_user_voted_slope.slope).add(expected_vote_slope))

            expect(await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change.sub(prev_user_voted_slope.slope).add(expected_vote_slope))
            expect(await controller.changesWeightTotal(prev_user_voted_slope.end)).to.be.eq(previous_total_change.sub(prev_user_voted_slope.slope).add(expected_vote_slope))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(new_vote_power)
            expect(last_user_vote_slope.end).to.be.eq(prev_user_voted_slope.end)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                new_vote_power
            )

        });

        it(' should have multiple people voting for the same gauge at the same period', async () => {

            const vote_power = 4000
            const vote_power2 = 5000

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)
            const user_prev_used_power2 = await controller.voteUserPower(user2.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)
            const user_point2 = await power.getUserPointAt(user2.address, current_ts)

            const previous_gauge_change = await controller.changesWeight(gauge1.address, user_point.endTimestamp)
            const previous_total_change = await controller.changesWeightTotal(user_point.endTimestamp)
            const previous_gauge_change2 = await controller.changesWeight(gauge1.address, user_point2.endTimestamp)
            const previous_total_change2 = await controller.changesWeightTotal(user_point2.endTimestamp)

            const tx = await controller.connect(user1).voteForGaugeWeights(gauge1.address, vote_power)
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const tx2 = await controller.connect(user2).voteForGaugeWeights(gauge1.address, vote_power2)
            const tx_ts2 = BigNumber.from((await provider.getBlock(tx2.blockNumber || 0)).timestamp)

            const expected_vote_slope = user_point.slope.mul(vote_power).div(10000)
            const expected_vote_bias = expected_vote_slope.mul(user_point.endTimestamp.sub(next_period))

            const expected_vote_slope2 = user_point2.slope.mul(vote_power2).div(10000)
            const expected_vote_bias2 = expected_vote_slope2.mul(user_point2.endTimestamp.sub(next_period))

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.add(vote_power))
            expect(await controller.voteUserPower(user2.address)).to.be.eq(user_prev_used_power2.add(vote_power2))

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias.add(expected_vote_bias).add(expected_vote_bias2))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope.add(expected_vote_slope).add(expected_vote_slope2))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.add(expected_vote_bias).add(expected_vote_bias2))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.add(expected_vote_slope).add(expected_vote_slope2))

            expect(await controller.changesWeight(gauge1.address, user_point.endTimestamp)).to.be.eq(previous_gauge_change.add(expected_vote_slope))
            expect(await controller.changesWeightTotal(user_point.endTimestamp)).to.be.eq(previous_total_change.add(expected_vote_slope))

            expect(await controller.changesWeight(gauge1.address, user_point2.endTimestamp)).to.be.eq(previous_gauge_change2.add(expected_vote_slope2))
            expect(await controller.changesWeightTotal(user_point2.endTimestamp)).to.be.eq(previous_total_change2.add(expected_vote_slope2))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user2.address, gauge1.address)).to.be.eq(tx_ts2)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(vote_power)
            expect(last_user_vote_slope.end).to.be.eq(user_point.endTimestamp)

            const last_user_vote_slope2 = await controller.voteUserSlopes(user2.address, gauge1.address)

            expect(last_user_vote_slope2.slope).to.be.eq(expected_vote_slope2)
            expect(last_user_vote_slope2.power).to.be.eq(vote_power2)
            expect(last_user_vote_slope2.end).to.be.eq(user_point2.endTimestamp)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                vote_power
            )
            
            expect(tx2).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts2,
                user2.address,
                gauge1.address,
                vote_power2
            )

        });

        it(' should fail if the gauge is not listed', async () => {

            await expect(
                controller.connect(user1).voteForGaugeWeights(
                    gauge5.address,
                    5000
                )
            ).to.be.revertedWith('NotListed')

        });

        it(' should fail if the user lock is already expired', async () => {

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user3_slope = ethers.utils.parseEther("4750").div(WEEK.mul(104))

            await power.connect(admin).setUserPointAt(
                user3.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user3_slope.mul(WEEK.mul(104)),
                    slope: user3_slope,
                    endTimestamp: current_ts.sub(WEEK.mul(2)),
                    blockNumber: current_block - 355,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.sub(WEEK.mul(2)))

            await expect(
                controller.connect(user3).voteForGaugeWeights(
                    gauge1.address,
                    5000
                )
            ).to.be.revertedWith('LockExpired')

        });

        it(' should fail if power given is over the maximum', async () => {

            await expect(
                controller.connect(user1).voteForGaugeWeights(
                    gauge2.address,
                    10010
                )
            ).to.be.revertedWith('VotingPowerInvalid')

        });

        it(' should not allow while in voting wooldown', async () => {

            const vote_power = 4000

            await controller.connect(user1).voteForGaugeWeights(gauge1.address, vote_power)

            await expect(
                controller.connect(user1).voteForGaugeWeights(
                    gauge1.address,
                    vote_power
                )
            ).to.be.revertedWith('VotingCooldown')

        });

        it(' should fail if trying to allocate more then the max voting power', async () => {

            const vote_power = 4000

            await controller.connect(user1).voteForGaugeWeights(gauge1.address, vote_power)

            await expect(
                controller.connect(user1).voteForGaugeWeights(
                    gauge2.address,
                    10000 - vote_power + 1
                )
            ).to.be.revertedWith('VotingPowerExceeded')

        });
    
    });

    describe('voteForManyGaugeWeights', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge4.address,
                board2_id,
                0
            )

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user1_slope = ethers.utils.parseEther("2500").div(WEEK.mul(104))
            const user2_slope = ethers.utils.parseEther("4750").div(WEEK.mul(104))

            const user1_point = {
                bias: user1_slope.mul(WEEK.mul(104)),
                slope: user1_slope,
                endTimestamp: current_ts.add(WEEK.mul(85)),
                blockNumber: current_block - 500,
            }
            const user2_point = {
                bias: user2_slope.mul(WEEK.mul(104)),
                slope: user2_slope,
                endTimestamp: current_ts.add(WEEK.mul(96)),
                blockNumber: current_block - 355,
            }

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts,
                user1_point
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts,
                user2_point
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.add(WEEK.mul(85)))
            await power.connect(admin).setLockedEnd(user2.address, current_ts.add(WEEK.mul(96)))

        });

        it(' should vote for the correct gauges with the correct powers', async () => {

            const vote_power = 4000
            const vote_power2 = 2500
            const vote_power3 = 3500

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)
            const previous_gauge_point3 = await controller.pointsWeight(gauge3.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const previous_gauge_change = await controller.changesWeight(gauge1.address, user_point.endTimestamp)
            const previous_gauge_change2 = await controller.changesWeight(gauge2.address, user_point.endTimestamp)
            const previous_gauge_change3 = await controller.changesWeight(gauge3.address, user_point.endTimestamp)
            const previous_total_change = await controller.changesWeightTotal(user_point.endTimestamp)

            const tx = await controller.connect(user1).voteForManyGaugeWeights(
                [gauge1.address, gauge2.address, gauge3.address],
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

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)
            const new_gauge_point3 = await controller.pointsWeight(gauge3.address, next_period)
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

            expect(await controller.changesWeight(gauge1.address, user_point.endTimestamp)).to.be.eq(previous_gauge_change.add(expected_vote_slope))
            expect(await controller.changesWeight(gauge2.address, user_point.endTimestamp)).to.be.eq(previous_gauge_change2.add(expected_vote_slope2))
            expect(await controller.changesWeight(gauge3.address, user_point.endTimestamp)).to.be.eq(previous_gauge_change3.add(expected_vote_slope3))
            expect(await controller.changesWeightTotal(user_point.endTimestamp)).to.be.eq(previous_total_change.add(
                expected_vote_slope.add(expected_vote_slope2).add(expected_vote_slope3)
            ))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const last_user_vote_slope2 = await controller.voteUserSlopes(user1.address, gauge2.address)
            const last_user_vote_slope3 = await controller.voteUserSlopes(user1.address, gauge3.address)

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
                gauge1.address,
                vote_power
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge2.address,
                vote_power2
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge3.address,
                vote_power3
            )

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
                [gauge1.address, gauge2.address, gauge3.address],
                [vote_power, vote_power2, vote_power3]
            )

            await advanceTime(WEEK.mul(2).toNumber())

            await controller.connect(user1).updateGaugeWeight(gauge1.address)
            await controller.connect(user1).updateGaugeWeight(gauge2.address)
            await controller.connect(user1).updateGaugeWeight(gauge3.address)
            await controller.connect(user1).updateGaugeWeight(gauge4.address)
            await controller.connect(user1).updateTotalWeight()

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)
            const previous_gauge_point3 = await controller.pointsWeight(gauge3.address, next_period)
            const previous_gauge_point4 = await controller.pointsWeight(gauge4.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const prev_user_voted_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const prev_user_voted_slope2 = await controller.voteUserSlopes(user1.address, gauge2.address)
            const prev_user_voted_slope3 = await controller.voteUserSlopes(user1.address, gauge3.address)
            const expected_prev_bias = prev_user_voted_slope.slope.mul(prev_user_voted_slope.end.sub(next_period))
            const expected_prev_bias2 = prev_user_voted_slope2.slope.mul(prev_user_voted_slope2.end.sub(next_period))
            const expected_prev_bias3 = prev_user_voted_slope3.slope.mul(prev_user_voted_slope3.end.sub(next_period))

            const previous_gauge_change = await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)
            const previous_gauge_change2 = await controller.changesWeight(gauge2.address, prev_user_voted_slope.end)
            const previous_gauge_change3 = await controller.changesWeight(gauge3.address, prev_user_voted_slope.end)
            const previous_gauge_change4 = await controller.changesWeight(gauge4.address, prev_user_voted_slope.end)
            const previous_total_change = await controller.changesWeightTotal(prev_user_voted_slope.end)

            const tx = await controller.connect(user1).voteForManyGaugeWeights(
                [gauge1.address, gauge2.address, gauge3.address, gauge4.address],
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

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)
            const new_gauge_point3 = await controller.pointsWeight(gauge3.address, next_period)
            const new_gauge_point4 = await controller.pointsWeight(gauge4.address, next_period)
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

            expect(await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change.sub(prev_user_voted_slope.slope).add(expected_vote_slope))
            expect(await controller.changesWeight(gauge2.address, prev_user_voted_slope2.end)).to.be.eq(previous_gauge_change2.sub(prev_user_voted_slope2.slope).add(expected_vote_slope2))
            expect(await controller.changesWeight(gauge3.address, prev_user_voted_slope3.end)).to.be.eq(previous_gauge_change3.sub(prev_user_voted_slope3.slope).add(expected_vote_slope3))
            expect(await controller.changesWeight(gauge4.address, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change4.add(expected_vote_slope4))
            expect(await controller.changesWeightTotal(prev_user_voted_slope.end)).to.be.eq(previous_total_change.sub(
                prev_user_voted_slope.slope.add(prev_user_voted_slope2.slope).add(prev_user_voted_slope3.slope)
            ).add(
                expected_vote_slope.add(expected_vote_slope2).add(expected_vote_slope3).add(expected_vote_slope4)
            ))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, gauge2.address)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, gauge3.address)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, gauge4.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(0)
            expect(last_user_vote_slope.end).to.be.eq(prev_user_voted_slope.end)

            const last_user_vote_slope2 = await controller.voteUserSlopes(user1.address, gauge2.address)

            expect(last_user_vote_slope2.slope).to.be.eq(expected_vote_slope2)
            expect(last_user_vote_slope2.power).to.be.eq(new_vote_power2)
            expect(last_user_vote_slope2.end).to.be.eq(prev_user_voted_slope2.end)

            const last_user_vote_slope3 = await controller.voteUserSlopes(user1.address, gauge3.address)

            expect(last_user_vote_slope3.slope).to.be.eq(expected_vote_slope3)
            expect(last_user_vote_slope3.power).to.be.eq(new_vote_power3)
            expect(last_user_vote_slope3.end).to.be.eq(prev_user_voted_slope3.end)

            const last_user_vote_slope4 = await controller.voteUserSlopes(user1.address, gauge4.address)

            expect(last_user_vote_slope4.slope).to.be.eq(expected_vote_slope4)
            expect(last_user_vote_slope4.power).to.be.eq(new_vote_power4)
            expect(last_user_vote_slope4.end).to.be.eq(prev_user_voted_slope.end)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                0
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge2.address,
                new_vote_power2
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge3.address,
                new_vote_power3
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge4.address,
                new_vote_power4
            )

        });

        it(' should fail if the given list do not match size', async () => {

            const vote_power = 4000
            const vote_power2 = 2500
            const vote_power3 = 3500

            await expect(
                controller.connect(user1).voteForManyGaugeWeights(
                    [gauge1.address, gauge2.address],
                    [vote_power, vote_power2, vote_power3]
                )
            ).to.be.revertedWith('ArraySizeMismatch')

            await expect(
                controller.connect(user1).voteForManyGaugeWeights(
                    [gauge1.address, gauge2.address, gauge3.address],
                    [vote_power, vote_power2]
                )
            ).to.be.revertedWith('ArraySizeMismatch')

        });

        it(' should fail if the given list exceeds the max length', async () => {

            const vote_power = 4000
            const vote_power2 = 2500
            const vote_power3 = 3500

            const gauges = [gauge1.address, gauge2.address, gauge3.address]
            const powers = [vote_power, vote_power2, vote_power3]
            
            const gauge_list = gauges.concat(gauges).concat(gauges).concat(gauges)
            const power_list = powers.concat(powers).concat(powers).concat(powers)

            await expect(
                controller.connect(user1).voteForManyGaugeWeights(
                    gauge_list,
                    power_list
                )
            ).to.be.revertedWith('MaxVoteListExceeded')

        });

    });

    describe('updateGaugeWeight', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge4.address,
                board2_id,
                0
            )

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user1_slope = ethers.utils.parseEther("2500").div(WEEK.mul(104))
            const user2_slope = ethers.utils.parseEther("4750").div(WEEK.mul(104))

            const user1_point = {
                bias: user1_slope.mul(WEEK.mul(104)),
                slope: user1_slope,
                endTimestamp: current_ts.add(WEEK.mul(85)),
                blockNumber: current_block - 500,
            }
            const user2_point = {
                bias: user2_slope.mul(WEEK.mul(104)),
                slope: user2_slope,
                endTimestamp: current_ts.add(WEEK.mul(96)),
                blockNumber: current_block - 355,
            }

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts,
                user1_point
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts,
                user2_point
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(14)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.add(WEEK.mul(85)))
            await power.connect(admin).setLockedEnd(user2.address, current_ts.add(WEEK.mul(96)))

            await controller.connect(user1).voteForGaugeWeights(gauge1.address, 4000)
            await controller.connect(user2).voteForGaugeWeights(gauge1.address, 5500)

        });

        it(' should update the weight correctly - 1 period', async () => {

            await advanceTime(WEEK.toNumber())

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)
            
            const previous_period_gauge_point = await controller.pointsWeight(gauge1.address, current_ts)

            await controller.connect(user1).updateGaugeWeight(gauge1.address)

            const next_period_gauge_point = await controller.pointsWeight(gauge1.address, next_period)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(next_period)

            const expected_new_bias = previous_period_gauge_point.bias.sub(
                previous_period_gauge_point.slope.mul(WEEK)
            )

            expect(next_period_gauge_point.bias).to.be.eq(expected_new_bias)
            expect(next_period_gauge_point.slope).to.be.eq(previous_period_gauge_point.slope)

        });

        it(' should update the weight correctly - multiple periods', async () => {

            let current_period = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_period = current_period.add(WEEK).div(WEEK).mul(WEEK)

            await advanceTime(WEEK.mul(3).toNumber())

            const next_period = current_period.add(WEEK)
            const next_period2 = current_period.add(WEEK.mul(2))
            const next_period3 = current_period.add(WEEK.mul(3))
            
            const previous_period_gauge_point = await controller.pointsWeight(gauge1.address, current_period)

            await controller.connect(user1).updateGaugeWeight(gauge1.address)

            const next_period_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const next_period_gauge_point2 = await controller.pointsWeight(gauge1.address, next_period2)
            const next_period_gauge_point3 = await controller.pointsWeight(gauge1.address, next_period3)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(next_period3)

            const bias_week_decrease = previous_period_gauge_point.slope.mul(WEEK)

            const expected_new_bias = previous_period_gauge_point.bias.sub(bias_week_decrease)
            const expected_new_bias2 = expected_new_bias.sub(bias_week_decrease)
            const expected_new_bias3 = expected_new_bias2.sub(bias_week_decrease)

            expect(next_period_gauge_point.bias).to.be.eq(expected_new_bias)
            expect(next_period_gauge_point.slope).to.be.eq(previous_period_gauge_point.slope)

            expect(next_period_gauge_point2.bias).to.be.eq(expected_new_bias2)
            expect(next_period_gauge_point2.slope).to.be.eq(previous_period_gauge_point.slope)

            expect(next_period_gauge_point3.bias).to.be.eq(expected_new_bias3)
            expect(next_period_gauge_point3.slope).to.be.eq(previous_period_gauge_point.slope)

        });

        it(' should account for slope changes', async () => {

            await advanceTime(WEEK.mul(10).toNumber())

            await controller.connect(user1).updateGaugeWeight(gauge1.address)

            await advanceTime(WEEK.toNumber())

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)
            
            const previous_period_gauge_point = await controller.pointsWeight(gauge1.address, current_ts)

            const next_period_slope_decrease = await controller.changesWeight(gauge1.address, next_period)

            await controller.connect(user1).updateGaugeWeight(gauge1.address)

            const next_period_gauge_point = await controller.pointsWeight(gauge1.address, next_period)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(next_period)

            const expected_new_bias = previous_period_gauge_point.bias.sub(
                previous_period_gauge_point.slope.mul(WEEK)
            )

            expect(next_period_gauge_point.bias).to.be.eq(expected_new_bias)
            expect(next_period_gauge_point.slope).to.be.eq(previous_period_gauge_point.slope.sub(next_period_slope_decrease))

            await advanceTime(WEEK.mul(27).toNumber())

            await controller.connect(user1).updateGaugeWeight(gauge1.address)

            await advanceTime(WEEK.toNumber())

            let current_ts2 = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts2 = current_ts2.div(WEEK).mul(WEEK)
            const next_period2 = current_ts2.add(WEEK)
            
            const previous_period_gauge_point2 = await controller.pointsWeight(gauge1.address, current_ts2)

            const next_period_slope_decrease2 = await controller.changesWeight(gauge1.address, next_period2)

            await controller.connect(user1).updateGaugeWeight(gauge1.address)

            const next_period_gauge_point2 = await controller.pointsWeight(gauge1.address, next_period2)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(next_period2)

            const expected_new_bias2 = previous_period_gauge_point2.bias.sub(
                previous_period_gauge_point2.slope.mul(WEEK)
            )

            expect(next_period_gauge_point2.bias).to.be.eq(expected_new_bias2)
            expect(next_period_gauge_point2.slope).to.be.eq(previous_period_gauge_point2.slope.sub(next_period_slope_decrease2))

        });

        it(' should put the point to 0 after all votes are expired', async () => {

            await advanceTime(WEEK.mul(100).toNumber())

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)
            
            await controller.connect(user1).updateGaugeWeight(gauge1.address)

            const next_period_gauge_point = await controller.pointsWeight(gauge1.address, next_period)

            expect(next_period_gauge_point.bias).to.be.eq(0)
            expect(next_period_gauge_point.slope).to.be.eq(0)

        });

        it(' should not update if the period was already updated', async () => {

            await advanceTime(WEEK.toNumber())

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            await controller.connect(user1).updateGaugeWeight(gauge1.address)
            
            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)

            await controller.connect(user1).updateGaugeWeight(gauge1.address)

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias)
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope)

        });
    
    });

    describe('updateTotalWeight', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge4.address,
                board2_id,
                0
            )

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user1_slope = ethers.utils.parseEther("2500").div(WEEK.mul(104))
            const user2_slope = ethers.utils.parseEther("4750").div(WEEK.mul(104))
            const user3_slope = ethers.utils.parseEther("1750").div(WEEK.mul(104))

            const user1_point = {
                bias: user1_slope.mul(WEEK.mul(104)),
                slope: user1_slope,
                endTimestamp: current_ts.add(WEEK.mul(85)),
                blockNumber: current_block - 500,
            }
            const user2_point = {
                bias: user2_slope.mul(WEEK.mul(104)),
                slope: user2_slope,
                endTimestamp: current_ts.add(WEEK.mul(96)),
                blockNumber: current_block - 355,
            }
            const user3_point = {
                bias: user3_slope.mul(WEEK.mul(104)),
                slope: user3_slope,
                endTimestamp: current_ts.add(WEEK.mul(92)),
                blockNumber: current_block - 470,
            }

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts,
                user1_point
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts,
                user2_point
            )
            await power.connect(admin).setUserPointAt(
                user3.address, 
                current_ts,
                user3_point
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(14)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )
            await power.connect(admin).setUserPointAt(
                user3.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user3_slope.mul(WEEK.mul(104)),
                    slope: user3_slope,
                    endTimestamp: current_ts.add(WEEK.mul(92)),
                    blockNumber: current_block - 500,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.add(WEEK.mul(85)))
            await power.connect(admin).setLockedEnd(user2.address, current_ts.add(WEEK.mul(96)))
            await power.connect(admin).setLockedEnd(user3.address, current_ts.add(WEEK.mul(92)))

            await controller.connect(user1).voteForManyGaugeWeights([gauge1.address, gauge2.address, gauge3.address], [4000, 2500, 3500])
            await controller.connect(user2).voteForManyGaugeWeights([gauge2.address, gauge3.address, gauge4.address], [3000, 3500, 3500])
            await controller.connect(user3).voteForManyGaugeWeights([gauge2.address, gauge4.address], [6000, 4000])

        });

        it(' should update the weight correctly - 1 period', async () => {

            await advanceTime(WEEK.toNumber())

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)
            
            const previous_period_point = await controller.pointsWeightTotal(current_ts)

            await controller.connect(user1).updateTotalWeight()

            const next_period_point = await controller.pointsWeightTotal(next_period)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const expected_new_bias = previous_period_point.bias.sub(
                previous_period_point.slope.mul(WEEK)
            )

            expect(next_period_point.bias).to.be.eq(expected_new_bias)
            expect(next_period_point.slope).to.be.eq(previous_period_point.slope)

        });

        it(' should update the weight correctly - multiple periods', async () => {

            let current_period = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_period = current_period.add(WEEK).div(WEEK).mul(WEEK)

            await advanceTime(WEEK.mul(3).toNumber())

            const next_period = current_period.add(WEEK)
            const next_period2 = current_period.add(WEEK.mul(2))
            const next_period3 = current_period.add(WEEK.mul(3))
            
            const previous_period_point = await controller.pointsWeightTotal(current_period)

            await controller.connect(user1).updateTotalWeight()

            const next_period_point = await controller.pointsWeightTotal(next_period)
            const next_period_point2 = await controller.pointsWeightTotal(next_period2)
            const next_period_point3 = await controller.pointsWeightTotal(next_period3)

            expect(await controller.timeTotal()).to.be.eq(next_period3)

            const bias_week_decrease = previous_period_point.slope.mul(WEEK)

            const expected_new_bias = previous_period_point.bias.sub(bias_week_decrease)
            const expected_new_bias2 = expected_new_bias.sub(bias_week_decrease)
            const expected_new_bias3 = expected_new_bias2.sub(bias_week_decrease)

            expect(next_period_point.bias).to.be.eq(expected_new_bias)
            expect(next_period_point.slope).to.be.eq(previous_period_point.slope)

            expect(next_period_point2.bias).to.be.eq(expected_new_bias2)
            expect(next_period_point2.slope).to.be.eq(previous_period_point.slope)

            expect(next_period_point3.bias).to.be.eq(expected_new_bias3)
            expect(next_period_point3.slope).to.be.eq(previous_period_point.slope)

        });

        it(' should account for slope changes', async () => {

            await advanceTime(WEEK.mul(10).toNumber())

            await controller.connect(user1).updateTotalWeight()

            await advanceTime(WEEK.toNumber())

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)
            
            const previous_period_point = await controller.pointsWeightTotal(current_ts)

            const next_period_slope_decrease = await controller.changesWeightTotal(next_period)

            await controller.connect(user1).updateTotalWeight()

            const next_period_point = await controller.pointsWeightTotal(next_period)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const expected_new_bias = previous_period_point.bias.sub(
                previous_period_point.slope.mul(WEEK)
            )

            expect(next_period_point.bias).to.be.eq(expected_new_bias)
            expect(next_period_point.slope).to.be.eq(previous_period_point.slope.sub(next_period_slope_decrease))

            await advanceTime(WEEK.mul(27).toNumber())

            await controller.connect(user1).updateTotalWeight()

            await advanceTime(WEEK.toNumber())

            let current_ts2 = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts2 = current_ts2.div(WEEK).mul(WEEK)
            const next_period2 = current_ts2.add(WEEK)
            
            const previous_period_point2 = await controller.pointsWeightTotal(current_ts2)

            const next_period_slope_decrease2 = await controller.changesWeightTotal(next_period2)

            await controller.connect(user1).updateTotalWeight()

            const next_period_point2 = await controller.pointsWeightTotal(next_period2)

            expect(await controller.timeTotal()).to.be.eq(next_period2)

            const expected_new_bias2 = previous_period_point2.bias.sub(
                previous_period_point2.slope.mul(WEEK)
            )

            expect(next_period_point2.bias).to.be.eq(expected_new_bias2)
            expect(next_period_point2.slope).to.be.eq(previous_period_point2.slope.sub(next_period_slope_decrease2))

        });

        it(' should put the point to 0 after all votes are expired', async () => {

            await advanceTime(WEEK.mul(100).toNumber())

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)
            
            await controller.connect(user1).updateTotalWeight()

            const next_period_point = await controller.pointsWeightTotal(next_period)

            expect(next_period_point.bias).to.be.eq(0)
            expect(next_period_point.slope).to.be.eq(0)

        });

        it(' should not update if the period was already updated', async () => {

            await advanceTime(WEEK.toNumber())

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            await controller.connect(user1).updateTotalWeight()
            
            const previous_point = await controller.pointsWeightTotal(next_period)

            await controller.connect(user1).updateTotalWeight()

            const new_point = await controller.pointsWeightTotal(next_period)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            expect(new_point.bias).to.be.eq(previous_point.bias)
            expect(new_point.slope).to.be.eq(previous_point.slope)

        });
    
    });

    describe('getGaugeRelativeWeightWrite', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge4.address,
                board2_id,
                0
            )

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user1_slope = ethers.utils.parseEther("2500").div(WEEK.mul(104))
            const user2_slope = ethers.utils.parseEther("4750").div(WEEK.mul(104))
            const user3_slope = ethers.utils.parseEther("1750").div(WEEK.mul(104))

            const user1_point = {
                bias: user1_slope.mul(WEEK.mul(104)),
                slope: user1_slope,
                endTimestamp: current_ts.add(WEEK.mul(85)),
                blockNumber: current_block - 500,
            }
            const user2_point = {
                bias: user2_slope.mul(WEEK.mul(104)),
                slope: user2_slope,
                endTimestamp: current_ts.add(WEEK.mul(96)),
                blockNumber: current_block - 355,
            }
            const user3_point = {
                bias: user3_slope.mul(WEEK.mul(104)),
                slope: user3_slope,
                endTimestamp: current_ts.add(WEEK.mul(92)),
                blockNumber: current_block - 470,
            }

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts,
                user1_point
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts,
                user2_point
            )
            await power.connect(admin).setUserPointAt(
                user3.address, 
                current_ts,
                user3_point
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(14)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )
            await power.connect(admin).setUserPointAt(
                user3.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user3_slope.mul(WEEK.mul(104)),
                    slope: user3_slope,
                    endTimestamp: current_ts.add(WEEK.mul(92)),
                    blockNumber: current_block - 500,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.add(WEEK.mul(85)))
            await power.connect(admin).setLockedEnd(user2.address, current_ts.add(WEEK.mul(96)))
            await power.connect(admin).setLockedEnd(user3.address, current_ts.add(WEEK.mul(92)))

            await controller.connect(user1).voteForManyGaugeWeights([gauge1.address, gauge2.address, gauge3.address], [4000, 2500, 3500])
            await controller.connect(user2).voteForManyGaugeWeights([gauge2.address, gauge3.address, gauge4.address], [3000, 3500, 3500])
            await controller.connect(user3).voteForManyGaugeWeights([gauge2.address, gauge4.address], [6000, 4000])

        });

        it(' should update & return the correct data - current period', async () => {

            let current_period = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_period = current_period.add(WEEK).div(WEEK).mul(WEEK)

            await advanceTime(WEEK.mul(2).toNumber())

            const next_period = current_period.add(WEEK)
            const next_period2 = current_period.add(WEEK.mul(2))
            
            const previous_period_gauge_point = await controller.pointsWeight(gauge1.address, current_period)
            const previous_period_point = await controller.pointsWeightTotal(current_period)

            await fetcher.connect(admin).fetchGetGaugeRelativeWeightWrite(controller.address, gauge1.address)

            const next_period_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const next_period_gauge_point2 = await controller.pointsWeight(gauge1.address, next_period2)

            const next_period_point = await controller.pointsWeightTotal(next_period)
            const next_period_point2 = await controller.pointsWeightTotal(next_period2)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(next_period2)

            expect(await controller.timeTotal()).to.be.eq(next_period2)

            const gauge_bias_week_decrease = previous_period_gauge_point.slope.mul(WEEK)

            const expected_new_gauge_bias = previous_period_gauge_point.bias.sub(gauge_bias_week_decrease)
            const expected_new_gauge_bias2 = expected_new_gauge_bias.sub(gauge_bias_week_decrease)

            expect(next_period_gauge_point.bias).to.be.eq(expected_new_gauge_bias)
            expect(next_period_gauge_point.slope).to.be.eq(previous_period_gauge_point.slope)

            expect(next_period_gauge_point2.bias).to.be.eq(expected_new_gauge_bias2)
            expect(next_period_gauge_point2.slope).to.be.eq(previous_period_gauge_point.slope)

            const bias_week_decrease = previous_period_point.slope.mul(WEEK)

            const expected_new_bias = previous_period_point.bias.sub(bias_week_decrease)
            const expected_new_bias2 = expected_new_bias.sub(bias_week_decrease)

            expect(next_period_point.bias).to.be.eq(expected_new_bias)
            expect(next_period_point.slope).to.be.eq(previous_period_point.slope)

            expect(next_period_point2.bias).to.be.eq(expected_new_bias2)
            expect(next_period_point2.slope).to.be.eq(previous_period_point.slope)

            const fetch_relative_weight = await fetcher.lastData()

            const expected_relative_weight = next_period_gauge_point.bias.mul(UNIT).div(next_period_point.bias)

            expect(fetch_relative_weight).to.be.eq(expected_relative_weight)

        });

        it(' should update & return the correct data - past period', async () => {

            let current_period = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_period = current_period.add(WEEK).div(WEEK).mul(WEEK)

            await advanceTime(WEEK.mul(2).toNumber())

            const next_period = current_period.add(WEEK)
            const next_period2 = current_period.add(WEEK.mul(2))
            
            const previous_period_gauge_point = await controller.pointsWeight(gauge1.address, current_period)
            const previous_period_point = await controller.pointsWeightTotal(current_period)

            await fetcher.connect(admin).fetchGetGaugeRelativeWeightWriteAt(controller.address, gauge1.address, current_period)

            const next_period_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const next_period_gauge_point2 = await controller.pointsWeight(gauge1.address, next_period2)

            const next_period_point = await controller.pointsWeightTotal(next_period)
            const next_period_point2 = await controller.pointsWeightTotal(next_period2)

            expect(await controller.timeWeight(gauge1.address)).to.be.eq(next_period2)

            expect(await controller.timeTotal()).to.be.eq(next_period2)

            const gauge_bias_week_decrease = previous_period_gauge_point.slope.mul(WEEK)

            const expected_new_gauge_bias = previous_period_gauge_point.bias.sub(gauge_bias_week_decrease)
            const expected_new_gauge_bias2 = expected_new_gauge_bias.sub(gauge_bias_week_decrease)

            expect(next_period_gauge_point.bias).to.be.eq(expected_new_gauge_bias)
            expect(next_period_gauge_point.slope).to.be.eq(previous_period_gauge_point.slope)

            expect(next_period_gauge_point2.bias).to.be.eq(expected_new_gauge_bias2)
            expect(next_period_gauge_point2.slope).to.be.eq(previous_period_gauge_point.slope)

            const bias_week_decrease = previous_period_point.slope.mul(WEEK)

            const expected_new_bias = previous_period_point.bias.sub(bias_week_decrease)
            const expected_new_bias2 = expected_new_bias.sub(bias_week_decrease)

            expect(next_period_point.bias).to.be.eq(expected_new_bias)
            expect(next_period_point.slope).to.be.eq(previous_period_point.slope)

            expect(next_period_point2.bias).to.be.eq(expected_new_bias2)
            expect(next_period_point2.slope).to.be.eq(previous_period_point.slope)

            const fetch_relative_weight = await fetcher.lastData()

            const expected_relative_weight = (await controller.pointsWeight(gauge1.address, current_period)).bias.mul(UNIT).div(
                (await controller.pointsWeightTotal(current_period)).bias
            )

            expect(fetch_relative_weight).to.be.eq(expected_relative_weight)

        });

        it(' should return 0 if the gauge is not listed', async () => {

            await advanceTime(WEEK.mul(2).toNumber())

            await fetcher.connect(admin).fetchGetGaugeRelativeWeightWrite(controller.address, gauge5.address)

            expect(await fetcher.lastData()).to.be.eq(0)

        });

        it(' should return 0 if the gauge is killed', async () => {

            await controller.connect(admin).killGauge(gauge1.address)

            await advanceTime(WEEK.mul(2).toNumber())

            await fetcher.connect(admin).fetchGetGaugeRelativeWeightWrite(controller.address, gauge1.address)

            expect(await fetcher.lastData()).to.be.eq(0)

        });
    
    });

    describe('data fetching methods', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        let fetch_period: BigNumber

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge4.address,
                board2_id,
                0
            )

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user1_slope = ethers.utils.parseEther("2500").div(WEEK.mul(104))
            const user2_slope = ethers.utils.parseEther("4750").div(WEEK.mul(104))
            const user3_slope = ethers.utils.parseEther("1750").div(WEEK.mul(104))

            const user1_point = {
                bias: user1_slope.mul(WEEK.mul(85)),
                slope: user1_slope,
                endTimestamp: current_ts.add(WEEK.mul(85)),
                blockNumber: current_block - 500,
            }
            const user2_point = {
                bias: user2_slope.mul(WEEK.mul(96)),
                slope: user2_slope,
                endTimestamp: current_ts.add(WEEK.mul(96)),
                blockNumber: current_block - 355,
            }
            const user3_point = {
                bias: user3_slope.mul(WEEK.mul(95)),
                slope: user3_slope,
                endTimestamp: current_ts.add(WEEK.mul(92)),
                blockNumber: current_block - 470,
            }

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts,
                user1_point
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts,
                user2_point
            )
            await power.connect(admin).setUserPointAt(
                user3.address, 
                current_ts,
                user3_point
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(14)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )
            await power.connect(admin).setUserPointAt(
                user3.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user3_slope.mul(WEEK.mul(104)),
                    slope: user3_slope,
                    endTimestamp: current_ts.add(WEEK.mul(92)),
                    blockNumber: current_block - 500,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.add(WEEK.mul(85)))
            await power.connect(admin).setLockedEnd(user2.address, current_ts.add(WEEK.mul(96)))
            await power.connect(admin).setLockedEnd(user3.address, current_ts.add(WEEK.mul(92)))

            await controller.connect(user1).voteForManyGaugeWeights([gauge1.address, gauge2.address, gauge3.address], [4000, 2500, 3500])
            await controller.connect(user2).voteForManyGaugeWeights([gauge2.address, gauge3.address, gauge4.address], [3000, 3500, 3500])
            await controller.connect(user3).voteForManyGaugeWeights([gauge2.address, gauge4.address], [6000, 4000])

            await advanceTime(WEEK.toNumber())

            fetch_period = BigNumber.from((await provider.getBlock('latest')).timestamp)
            fetch_period = fetch_period.add(WEEK).div(WEEK).mul(WEEK)

            await controller.connect(admin).updateTotalWeight()
            await controller.connect(admin).updateGaugeWeight(gauge1.address)
            await controller.connect(admin).updateGaugeWeight(gauge2.address)
            await controller.connect(admin).updateGaugeWeight(gauge3.address)
            await controller.connect(admin).updateGaugeWeight(gauge4.address)

        });

        it(' should get the current total weight', async () => {

            expect(await controller.getTotalWeight()).to.be.eq((await controller.pointsWeightTotal(fetch_period)).bias)

        });

        it(' should get the correct current weight for gauges', async () => {

            const gauge1_weight = (await controller.pointsWeight(gauge1.address, fetch_period)).bias
            const gauge2_weight = (await controller.pointsWeight(gauge2.address, fetch_period)).bias
            const gauge3_weight = (await controller.pointsWeight(gauge3.address, fetch_period)).bias
            const gauge4_weight = (await controller.pointsWeight(gauge4.address, fetch_period)).bias
            
            expect(await controller.getGaugeWeight(gauge1.address)).to.be.eq(gauge1_weight)
            expect(await controller.getGaugeWeight(gauge2.address)).to.be.eq(gauge2_weight)
            expect(await controller.getGaugeWeight(gauge3.address)).to.be.eq(gauge3_weight)
            expect(await controller.getGaugeWeight(gauge4.address)).to.be.eq(gauge4_weight)
        });

        it(' should get the correct current relative weight for gauges', async () => {

            const total_weight = (await controller.pointsWeightTotal(fetch_period.sub(WEEK))).bias

            const gauge1_weight = (await controller.pointsWeight(gauge1.address, fetch_period.sub(WEEK))).bias
            const gauge2_weight = (await controller.pointsWeight(gauge2.address, fetch_period.sub(WEEK))).bias
            const gauge3_weight = (await controller.pointsWeight(gauge3.address, fetch_period.sub(WEEK))).bias
            const gauge4_weight = (await controller.pointsWeight(gauge4.address, fetch_period.sub(WEEK))).bias

            expect(await controller['getGaugeRelativeWeight(address)'](gauge1.address)).to.be.eq(
                gauge1_weight.mul(UNIT).div(total_weight)
            )
            expect(await controller['getGaugeRelativeWeight(address)'](gauge2.address)).to.be.eq(
                gauge2_weight.mul(UNIT).div(total_weight)
            )
            expect(await controller['getGaugeRelativeWeight(address)'](gauge3.address)).to.be.eq(
                gauge3_weight.mul(UNIT).div(total_weight)
            )
            expect(await controller['getGaugeRelativeWeight(address)'](gauge4.address)).to.be.eq(
                gauge4_weight.mul(UNIT).div(total_weight)
            )

        });

        it(' should get the correct past weight for gauges', async () => {

            await advanceTime(WEEK.mul(5).toNumber())
            
            await controller.connect(admin).updateTotalWeight()
            await controller.connect(admin).updateGaugeWeight(gauge1.address)
            await controller.connect(admin).updateGaugeWeight(gauge2.address)
            await controller.connect(admin).updateGaugeWeight(gauge3.address)
            await controller.connect(admin).updateGaugeWeight(gauge4.address)

            const new_fetch_period = fetch_period.add(WEEK.mul(2))

            const gauge1_weight = (await controller.pointsWeight(gauge1.address, new_fetch_period)).bias
            const gauge2_weight = (await controller.pointsWeight(gauge2.address, new_fetch_period)).bias
            const gauge3_weight = (await controller.pointsWeight(gauge3.address, new_fetch_period)).bias
            const gauge4_weight = (await controller.pointsWeight(gauge4.address, new_fetch_period)).bias
            
            expect(await controller.getGaugeWeightAt(gauge1.address, new_fetch_period)).to.be.eq(gauge1_weight)
            expect(await controller.getGaugeWeightAt(gauge2.address, new_fetch_period)).to.be.eq(gauge2_weight)
            expect(await controller.getGaugeWeightAt(gauge3.address, new_fetch_period)).to.be.eq(gauge3_weight)
            expect(await controller.getGaugeWeightAt(gauge4.address, new_fetch_period)).to.be.eq(gauge4_weight)

        });

        it(' should get the correct past relative weight for gauges', async () => {

            await advanceTime(WEEK.mul(5).toNumber())
            
            await controller.connect(admin).updateTotalWeight()
            await controller.connect(admin).updateGaugeWeight(gauge1.address)
            await controller.connect(admin).updateGaugeWeight(gauge2.address)
            await controller.connect(admin).updateGaugeWeight(gauge3.address)
            await controller.connect(admin).updateGaugeWeight(gauge4.address)

            const new_fetch_period = fetch_period.add(WEEK.mul(2))

            const total_weight = (await controller.pointsWeightTotal(new_fetch_period)).bias

            const gauge1_weight = (await controller.pointsWeight(gauge1.address, new_fetch_period)).bias
            const gauge2_weight = (await controller.pointsWeight(gauge2.address, new_fetch_period)).bias
            const gauge3_weight = (await controller.pointsWeight(gauge3.address, new_fetch_period)).bias
            const gauge4_weight = (await controller.pointsWeight(gauge4.address, new_fetch_period)).bias

            expect(await controller['getGaugeRelativeWeight(address,uint256)'](gauge1.address, new_fetch_period)).to.be.eq(
                gauge1_weight.mul(UNIT).div(total_weight)
            )
            expect(await controller['getGaugeRelativeWeight(address,uint256)'](gauge2.address, new_fetch_period)).to.be.eq(
                gauge2_weight.mul(UNIT).div(total_weight)
            )
            expect(await controller['getGaugeRelativeWeight(address,uint256)'](gauge3.address, new_fetch_period)).to.be.eq(
                gauge3_weight.mul(UNIT).div(total_weight)
            )
            expect(await controller['getGaugeRelativeWeight(address,uint256)'](gauge4.address, new_fetch_period)).to.be.eq(
                gauge4_weight.mul(UNIT).div(total_weight)
            )

        });

        it(' should return 0 for non listed gauges', async () => {

            expect(await controller.getGaugeWeight(gauge5.address)).to.be.eq(0)

            expect(await controller['getGaugeRelativeWeight(address)'](gauge5.address)).to.be.eq(0)

        });

        it(' should return 0 after all votes are expired', async () => {

            advanceTime(WEEK.mul(95).toNumber())

            await controller.connect(admin).updateTotalWeight()
            await controller.connect(admin).updateGaugeWeight(gauge1.address)
            await controller.connect(admin).updateGaugeWeight(gauge2.address)
            await controller.connect(admin).updateGaugeWeight(gauge3.address)
            await controller.connect(admin).updateGaugeWeight(gauge4.address)

            expect(await controller.getTotalWeight()).to.be.eq(0)

            expect(await controller.getGaugeWeight(gauge1.address)).to.be.eq(0)
            expect(await controller.getGaugeWeight(gauge2.address)).to.be.eq(0)
            expect(await controller.getGaugeWeight(gauge3.address)).to.be.eq(0)
            expect(await controller.getGaugeWeight(gauge4.address)).to.be.eq(0)

            expect(await controller['getGaugeRelativeWeight(address)'](gauge1.address)).to.be.eq(0)
            expect(await controller['getGaugeRelativeWeight(address)'](gauge2.address)).to.be.eq(0)
            expect(await controller['getGaugeRelativeWeight(address)'](gauge3.address)).to.be.eq(0)
            expect(await controller['getGaugeRelativeWeight(address)'](gauge4.address)).to.be.eq(0)

        });
    
    });

    describe('approveProxyManager', async () => {

        it(' should approve the proxy manager correctly', async () => {

            expect(await controller.isProxyManager(user1.address, manager.address)).to.be.false

            const tx = await controller.connect(user1).approveProxyManager(manager.address, 0)

            expect(await controller.isProxyManager(user1.address, manager.address)).to.be.true

            expect(await controller.maxProxyDuration(user1.address, manager.address)).to.be.eq(0)

            await expect(tx).to.emit(controller, 'SetProxyManager').withArgs(user1.address, manager.address)

        });

        it(' should set the correct maxDuration if given', async () => {

            const maxDuration = WEEK.mul(4)

            expect(await controller.isProxyManager(user1.address, manager.address)).to.be.false

            const tx = await controller.connect(user1).approveProxyManager(manager.address, maxDuration)

            expect(await controller.isProxyManager(user1.address, manager.address)).to.be.true

            expect(await controller.maxProxyDuration(user1.address, manager.address)).to.be.eq(maxDuration)

            await expect(tx).to.emit(controller, 'SetProxyManager').withArgs(user1.address, manager.address)

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                controller.connect(user1).approveProxyManager(ethers.constants.AddressZero, 0)
            ).to.be.revertedWith('AddressZero')

        });
    
    });

    describe('updateProxyManagerDuration', async () => {

        const newMaxDuration = WEEK.mul(4)

        beforeEach(async () => {

            await controller.connect(user1).approveProxyManager(manager.address, 0)

        });

        it(' should update the max duration correctly', async () => {

            expect(await controller.maxProxyDuration(user1.address, manager.address)).to.be.eq(0)

            await controller.connect(user1).updateProxyManagerDuration(manager.address, newMaxDuration)

            expect(await controller.maxProxyDuration(user1.address, manager.address)).to.be.eq(newMaxDuration)

        });

        it(' should fail if maanger is not allowed', async () => {

            await expect(
                controller.connect(user1).updateProxyManagerDuration(user1.address, newMaxDuration)
            ).to.be.revertedWith('NotAllowedManager')

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                controller.connect(user1).updateProxyManagerDuration(ethers.constants.AddressZero, newMaxDuration)
            ).to.be.revertedWith('AddressZero')

        });
    
    });

    describe('removeProxyManager', async () => {

        beforeEach(async () => {

            await controller.connect(user1).approveProxyManager(manager.address, 0)

        });

        it(' should remove the proxy manager correctly', async () => {

            expect(await controller.isProxyManager(user1.address, manager.address)).to.be.true

            const tx = await controller.connect(user1).removeProxyManager(manager.address)

            expect(await controller.isProxyManager(user1.address, manager.address)).to.be.false

            await expect(tx).to.emit(controller, 'RemoveProxyManager').withArgs(user1.address, manager.address)

        });

        it(' should fail if given address 0x0', async () => {

            await expect(
                controller.connect(user1).removeProxyManager(ethers.constants.AddressZero)
            ).to.be.revertedWith('AddressZero')

        });
    
    });

    describe('setVoterProxy', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        const proxy_duration = WEEK.mul(4)

        const proxy_power = 3500

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge4.address,
                board2_id,
                0
            )

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user1_slope = ethers.utils.parseEther("2500").div(WEEK.mul(104))
            const user2_slope = ethers.utils.parseEther("4750").div(WEEK.mul(104))

            const user1_point = {
                bias: user1_slope.mul(WEEK.mul(104)),
                slope: user1_slope,
                endTimestamp: current_ts.add(WEEK.mul(85)),
                blockNumber: current_block - 500,
            }
            const user2_point = {
                bias: user2_slope.mul(WEEK.mul(104)),
                slope: user2_slope,
                endTimestamp: current_ts.add(WEEK.mul(96)),
                blockNumber: current_block - 355,
            }

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts,
                user1_point
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts,
                user2_point
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.add(WEEK.mul(85)))
            await power.connect(admin).setLockedEnd(user2.address, current_ts.add(WEEK.mul(96)))

            await controller.connect(user1).approveProxyManager(manager.address, 0)

        });

        it(' should set a new proxy correctly', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const end_ts = current_ts.add(proxy_duration)

            const prev_blocked_power = await controller.blockedProxyPower(user1.address)
            const old_proxy_list = await controller.getUserProxyVoters(user1.address)

            const tx = await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, end_ts)

            expect(await controller.blockedProxyPower(user1.address)).to.be.eq(prev_blocked_power.add(proxy_power))
            
            const new_proxy_list = await controller.getUserProxyVoters(user1.address)
            expect(new_proxy_list.length).to.be.eq(old_proxy_list.length + 1)
            expect(new_proxy_list[new_proxy_list.length - 1]).to.be.eq(proxyVoter1.address)

            const proxy_state = await controller.proxyVoterState(user1.address, proxyVoter1.address)

            expect(proxy_state.maxPower).to.be.eq(proxy_power)
            expect(proxy_state.usedPower).to.be.eq(0)
            expect(proxy_state.endTimestamp).to.be.eq(end_ts)

            await expect(tx).to.emit(controller, 'SetNewProxyVoter').withArgs(user1.address, proxyVoter1.address, proxy_power, end_ts)

        });

        it(' should allow to create multiple proxy from the same user', async () => {

            const proxy_duration2 = WEEK.mul(7)
    
            const proxy_power2 = 2000

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const end_ts = current_ts.add(proxy_duration)
            const end_ts2 = current_ts.add(proxy_duration2)

            const prev_blocked_power = await controller.blockedProxyPower(user1.address)
            const old_proxy_list = await controller.getUserProxyVoters(user1.address)

            const tx = await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, end_ts)
            const proxy_state = await controller.proxyVoterState(user1.address, proxyVoter1.address)

            expect(proxy_state.maxPower).to.be.eq(proxy_power)
            expect(proxy_state.usedPower).to.be.eq(0)
            expect(proxy_state.endTimestamp).to.be.eq(end_ts)

            await expect(tx).to.emit(controller, 'SetNewProxyVoter').withArgs(user1.address, proxyVoter1.address, proxy_power, end_ts)

            const tx2 = await controller.connect(user1).setVoterProxy(user1.address, proxyVoter2.address, proxy_power2, end_ts2)

            const proxy_state2 = await controller.proxyVoterState(user1.address, proxyVoter2.address)

            expect(proxy_state2.maxPower).to.be.eq(proxy_power2)
            expect(proxy_state2.usedPower).to.be.eq(0)
            expect(proxy_state2.endTimestamp).to.be.eq(end_ts2)

            await expect(tx2).to.emit(controller, 'SetNewProxyVoter').withArgs(user1.address, proxyVoter2.address, proxy_power2, end_ts2)

            expect(await controller.blockedProxyPower(user1.address)).to.be.eq(prev_blocked_power.add(proxy_power).add(proxy_power2))
            
            const new_proxy_list = await controller.getUserProxyVoters(user1.address)
            expect(new_proxy_list.length).to.be.eq(old_proxy_list.length + 2)
            expect(new_proxy_list[new_proxy_list.length - 2]).to.be.eq(proxyVoter1.address)
            expect(new_proxy_list[new_proxy_list.length - 1]).to.be.eq(proxyVoter2.address)

        });

        it(' should clear previous expired proxies', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 2000, current_ts.add(proxy_duration))

            await advanceTime(WEEK.mul(5).toNumber())

            current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            let end_ts = current_ts.add(proxy_duration)

            const old_proxy_list = await controller.getUserProxyVoters(user1.address)

            const tx = await controller.connect(user1).setVoterProxy(user1.address, proxyVoter2.address, proxy_power, end_ts)

            expect(await controller.blockedProxyPower(user1.address)).to.be.eq(proxy_power)
            
            const new_proxy_list = await controller.getUserProxyVoters(user1.address)
            expect(new_proxy_list.length).to.be.eq(old_proxy_list.length)
            expect(new_proxy_list[new_proxy_list.length - 1]).to.be.eq(proxyVoter2.address)

            const proxy_state = await controller.proxyVoterState(user1.address, proxyVoter2.address)

            expect(proxy_state.maxPower).to.be.eq(proxy_power)
            expect(proxy_state.usedPower).to.be.eq(0)
            expect(proxy_state.endTimestamp).to.be.eq(end_ts)

            const old_proxy_state = await controller.proxyVoterState(user1.address, proxyVoter1.address)

            expect(old_proxy_state.maxPower).to.be.eq(0)
            expect(old_proxy_state.usedPower).to.be.eq(0)
            expect(old_proxy_state.endTimestamp).to.be.eq(0)

            await expect(tx).to.emit(controller, 'SetNewProxyVoter').withArgs(user1.address, proxyVoter2.address, proxy_power, end_ts)

        });

        it(' should not allow to create the same proxy of not expired', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 2000, current_ts.add(proxy_duration))

            await expect(
                controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 4000, current_ts.add(proxy_duration.add(2)))
            ).to.be.revertedWith('ProxyAlreadyActive')

            await advanceTime(WEEK.mul(2).toNumber())

            await expect(
                controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 4000, current_ts.add(proxy_duration.add(2)))
            ).to.be.revertedWith('ProxyAlreadyActive')
            
        });

        it(' should allow the manager to create a proxy', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const end_ts = current_ts.add(proxy_duration)

            const prev_blocked_power = await controller.blockedProxyPower(user1.address)
            const old_proxy_list = await controller.getUserProxyVoters(user1.address)

            const tx = await controller.connect(manager).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, end_ts)

            expect(await controller.blockedProxyPower(user1.address)).to.be.eq(prev_blocked_power.add(proxy_power))
            
            const new_proxy_list = await controller.getUserProxyVoters(user1.address)
            expect(new_proxy_list.length).to.be.eq(old_proxy_list.length + 1)
            expect(new_proxy_list[new_proxy_list.length - 1]).to.be.eq(proxyVoter1.address)

            const proxy_state = await controller.proxyVoterState(user1.address, proxyVoter1.address)

            expect(proxy_state.maxPower).to.be.eq(proxy_power)
            expect(proxy_state.usedPower).to.be.eq(0)
            expect(proxy_state.endTimestamp).to.be.eq(end_ts)

            await expect(tx).to.emit(controller, 'SetNewProxyVoter').withArgs(user1.address, proxyVoter1.address, proxy_power, end_ts)

        });

        it(' should fail if the caller is not allowed to create a proxy', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await expect(
                controller.connect(user2).setVoterProxy(user1.address, proxyVoter1.address, 4000, current_ts.add(proxy_duration.add(2)))
            ).to.be.revertedWith('NotAllowedManager')

            await expect(
                controller.connect(proxyVoter1).setVoterProxy(user1.address, proxyVoter1.address, 4000, current_ts.add(proxy_duration.add(2)))
            ).to.be.revertedWith('NotAllowedManager')
        });

        it(' should fail if endTimestamp exceeds the allowed max duration for manager', async () => {

            const maxDuration = WEEK.mul(4)

            await controller.connect(user1).updateProxyManagerDuration(manager.address, maxDuration)

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await expect(
                controller.connect(manager).setVoterProxy(user1.address, proxyVoter1.address, 4000, current_ts.add(proxy_duration.add(WEEK)))
            ).to.be.revertedWith('ProxyDurationExceeded')
        });

        it(' should fail if given an invalid vote power', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await expect(
                controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 0, current_ts.add(proxy_duration.add(2)))
            ).to.be.revertedWith('VotingPowerInvalid')

            await expect(
                controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 11000, current_ts.add(proxy_duration.add(2)))
            ).to.be.revertedWith('VotingPowerInvalid')

        });

        it(' should fail if given an invalid timestamp', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await expect(
                controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 3500, current_ts.sub(WEEK.mul(2)))
            ).to.be.revertedWith('InvalidTimestamp')

            await expect(
                controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 3500, current_ts.add(WEEK.mul(150)))
            ).to.be.revertedWith('InvalidTimestamp')

        });

        it(' should not allow to go over the max voting power', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            controller.connect(user1).setVoterProxy(user1.address, proxyVoter2.address, 6500, current_ts.add(proxy_duration))

            await expect(
                controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 4000, current_ts.add(proxy_duration.add(2)))
            ).to.be.revertedWith('ProxyPowerExceeded')

        });
    
    });

    describe('clearUserExpiredProxies', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        const proxy_duration = WEEK.mul(4)
        const proxy_duration2 = WEEK.mul(8)

        const proxy_power = 3500
        const proxy_power2 = 2000

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge4.address,
                board2_id,
                0
            )

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user1_slope = ethers.utils.parseEther("2500").div(WEEK.mul(104))
            const user2_slope = ethers.utils.parseEther("4750").div(WEEK.mul(104))

            const user1_point = {
                bias: user1_slope.mul(WEEK.mul(104)),
                slope: user1_slope,
                endTimestamp: current_ts.add(WEEK.mul(85)),
                blockNumber: current_block - 500,
            }
            const user2_point = {
                bias: user2_slope.mul(WEEK.mul(104)),
                slope: user2_slope,
                endTimestamp: current_ts.add(WEEK.mul(96)),
                blockNumber: current_block - 355,
            }

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts,
                user1_point
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts,
                user2_point
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )
            await power.connect(admin).setUserPointAt(
                user2.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user2_slope.mul(WEEK.mul(104)),
                    slope: user2_slope,
                    endTimestamp: current_ts.add(WEEK.mul(96)),
                    blockNumber: current_block - 355,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.add(WEEK.mul(85)))
            await power.connect(admin).setLockedEnd(user2.address, current_ts.add(WEEK.mul(96)))

            await controller.connect(user1).approveProxyManager(manager.address, 0)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, current_ts.add(proxy_duration))
            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter2.address, proxy_power2, current_ts.add(proxy_duration2))

        });

        it(' should not clear anything if not expired', async () => {

            await advanceTime(WEEK.mul(1).toNumber())

            const prev_user_proxy_list = await controller.getUserProxyVoters(user1.address)
            const prev_blocked_power = await controller.blockedProxyPower(user1.address)

            await controller.connect(user1).clearUserExpiredProxies(user1.address)

            const new_user_proxy_list = await controller.getUserProxyVoters(user1.address)

            expect(new_user_proxy_list.length).to.be.eq(prev_user_proxy_list.length)
            expect(new_user_proxy_list).to.be.deep.eq(prev_user_proxy_list)
            expect(await controller.blockedProxyPower(user1.address)).to.be.eq(prev_blocked_power)

            const proxy_state1 = await controller.proxyVoterState(user1.address, proxyVoter1.address)
            const proxy_state2 = await controller.proxyVoterState(user1.address, proxyVoter2.address)
            
            expect(proxy_state1.maxPower).not.to.be.eq(0)
            expect(proxy_state2.maxPower).not.to.be.eq(0)

            expect(proxy_state1.endTimestamp).not.to.be.eq(0)
            expect(proxy_state2.endTimestamp).not.to.be.eq(0)

        });

        it(' should clear only the expired ones', async () => {

            await advanceTime(WEEK.mul(5).toNumber())

            const prev_user_proxy_list = await controller.getUserProxyVoters(user1.address)
            const prev_blocked_power = await controller.blockedProxyPower(user1.address)

            await controller.connect(user1).clearUserExpiredProxies(user1.address)

            const new_user_proxy_list = await controller.getUserProxyVoters(user1.address)

            expect(new_user_proxy_list.length).to.be.eq(prev_user_proxy_list.length - 1)
            expect(new_user_proxy_list).not.to.be.deep.eq(prev_user_proxy_list)
            expect(new_user_proxy_list.includes(proxyVoter1.address)).to.be.false
            expect(await controller.blockedProxyPower(user1.address)).to.be.eq(prev_blocked_power.sub(proxy_power))

            const proxy_state1 = await controller.proxyVoterState(user1.address, proxyVoter1.address)
            const proxy_state2 = await controller.proxyVoterState(user1.address, proxyVoter2.address)
            
            expect(proxy_state1.maxPower).to.be.eq(0)
            expect(proxy_state2.maxPower).not.to.be.eq(0)

            expect(proxy_state1.endTimestamp).to.be.eq(0)
            expect(proxy_state2.endTimestamp).not.to.be.eq(0)

        });

        it(' should clear everything if all is expired', async () => {

            await advanceTime(WEEK.mul(10).toNumber())

            await controller.connect(user1).clearUserExpiredProxies(user1.address)

            const new_user_proxy_list = await controller.getUserProxyVoters(user1.address)

            expect(new_user_proxy_list).to.be.deep.eq([])
            expect(new_user_proxy_list.length).to.be.eq(0)
            expect(new_user_proxy_list.includes(proxyVoter1.address)).to.be.false
            expect(new_user_proxy_list.includes(proxyVoter2.address)).to.be.false
            expect(await controller.blockedProxyPower(user1.address)).to.be.eq(0)

            const proxy_state1 = await controller.proxyVoterState(user1.address, proxyVoter1.address)
            const proxy_state2 = await controller.proxyVoterState(user1.address, proxyVoter2.address)
            
            expect(proxy_state1.maxPower).to.be.eq(0)
            expect(proxy_state2.maxPower).to.be.eq(0)

            expect(proxy_state1.endTimestamp).to.be.eq(0)
            expect(proxy_state2.endTimestamp).to.be.eq(0)

        });
    
    });

    describe('voteForGaugeWeightsFor', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        const proxy_duration = WEEK.mul(4)

        const proxy_power = 5500

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge4.address,
                board2_id,
                0
            )

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user1_slope = ethers.utils.parseEther("2500").div(WEEK.mul(104))

            const user1_point = {
                bias: user1_slope.mul(WEEK.mul(104)),
                slope: user1_slope,
                endTimestamp: current_ts.add(WEEK.mul(85)),
                blockNumber: current_block - 500,
            }

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts,
                user1_point
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(4)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.add(WEEK.mul(85)))

            await controller.connect(user1).approveProxyManager(manager.address, 0)

        });

        it(' should set the vote correctly for the user via proxy', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, current_ts.add(proxy_duration))

            const vote_power = 4000

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)
            const user_prev_free_power = await controller.usedFreePower(user1.address)
            const user_prev_used_proxy_power = (await controller.proxyVoterState(user1.address, proxyVoter1.address)).usedPower

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const previous_gauge_change = await controller.changesWeight(gauge1.address, user_point.endTimestamp)
            const previous_total_change = await controller.changesWeightTotal(user_point.endTimestamp)

            const tx = await controller.connect(proxyVoter1).voteForGaugeWeightsFor(user1.address, gauge1.address, vote_power)
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            const expected_vote_slope = user_point.slope.mul(vote_power).div(10000)
            const expected_vote_bias = expected_vote_slope.mul(user_point.endTimestamp.sub(next_period))

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.add(vote_power))
            expect(await controller.usedFreePower(user1.address)).to.be.eq(user_prev_free_power)
            expect((await controller.proxyVoterState(user1.address, proxyVoter1.address)).usedPower).to.be.eq(user_prev_used_proxy_power.add(vote_power))

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias.add(expected_vote_bias))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope.add(expected_vote_slope))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.add(expected_vote_bias))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.add(expected_vote_slope))

            expect(await controller.changesWeight(gauge1.address, user_point.endTimestamp)).to.be.eq(previous_gauge_change.add(expected_vote_slope))
            expect(await controller.changesWeightTotal(user_point.endTimestamp)).to.be.eq(previous_total_change.add(expected_vote_slope))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(vote_power)
            expect(last_user_vote_slope.end).to.be.eq(user_point.endTimestamp)
            expect(last_user_vote_slope.caller).to.be.eq(proxyVoter1.address)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                vote_power
            )

        });

        it(' should fail if trying to use more than allowed for the proxy', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, current_ts.add(proxy_duration))

            await expect(
                controller.connect(proxyVoter1).voteForGaugeWeightsFor(user1.address, gauge1.address, 7500)
            ).to.be.revertedWith('VotingPowerProxyExceeded')

        });

        it(' should fail if trying to allocate more than max proxy power', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, current_ts.add(proxy_duration))

            await controller.connect(proxyVoter1).voteForGaugeWeightsFor(user1.address, gauge1.address, 3500)
            
            await expect(
                controller.connect(proxyVoter1).voteForGaugeWeightsFor(user1.address, gauge2.address, 4000)
            ).to.be.revertedWith('VotingPowerProxyExceeded')

        });

        it(' should fail if trying to caller is not an allowed proxy', async () => {
            
            await expect(
                controller.connect(proxyVoter2).voteForGaugeWeightsFor(user1.address, gauge2.address, 4000)
            ).to.be.revertedWith('NotAllowedProxyVoter')

        });

        it(' should fail if the proxy is expired', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, current_ts.add(proxy_duration))

            await advanceTime(WEEK.mul(7).toNumber())
            
            await expect(
                controller.connect(proxyVoter1).voteForGaugeWeightsFor(user1.address, gauge2.address, 4000)
            ).to.be.revertedWith('NotAllowedProxyVoter')

        });

        it(' should override a past user over to use for proxy', async () => {

            let past_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            past_ts = past_ts.div(WEEK).mul(WEEK)

            const vote_power = 4000

            await controller.connect(user1).voteForManyGaugeWeights([gauge1.address, gauge3.address], [vote_power, 6000])

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, past_ts.add(proxy_duration))

            await advanceTime(WEEK.mul(2).toNumber())

            await controller.connect(user1).updateGaugeWeight(gauge1.address)
            await controller.connect(user1).updateTotalWeight()

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const previous_gauge_point1 = await controller.pointsWeight(gauge1.address, next_period)
            const previous_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)
            const user_prev_free_power = await controller.usedFreePower(user1.address)
            const user_prev_used_proxy_power = (await controller.proxyVoterState(user1.address, proxyVoter1.address)).usedPower

            const prev_user_voted_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const expected_prev_bias = prev_user_voted_slope.slope.mul(prev_user_voted_slope.end.sub(next_period))

            const tx1 = await controller.connect(proxyVoter1).voteForGaugeWeightsFor(user1.address, gauge1.address, 0)
            const tx_ts1 = BigNumber.from((await provider.getBlock(tx1.blockNumber || 0)).timestamp)

            const tx2 = await controller.connect(proxyVoter1).voteForGaugeWeightsFor(user1.address, gauge2.address, vote_power)
            const tx_ts2 = BigNumber.from((await provider.getBlock(tx2.blockNumber || 0)).timestamp)

            const expected_vote_slope = user_point.slope.mul(vote_power).div(10000)
            const expected_vote_bias = expected_vote_slope.mul(user_point.endTimestamp.sub(next_period))

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power)
            expect(await controller.usedFreePower(user1.address)).to.be.eq(user_prev_free_power.sub(vote_power))
            expect((await controller.proxyVoterState(user1.address, proxyVoter1.address)).usedPower).to.be.eq(user_prev_used_proxy_power.add(vote_power))

            const new_gauge_point1 = await controller.pointsWeight(gauge1.address, next_period)
            const new_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)

            expect(new_gauge_point1.bias).to.be.eq(previous_gauge_point1.bias.sub(expected_prev_bias))
            expect(new_gauge_point1.slope).to.be.eq(previous_gauge_point1.slope.sub(prev_user_voted_slope.slope))

            expect(new_gauge_point2.bias).to.be.eq(previous_gauge_point2.bias.add(expected_vote_bias))
            expect(new_gauge_point2.slope).to.be.eq(previous_gauge_point2.slope.add(expected_vote_slope))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts1)
            expect(await controller.lastUserVote(user1.address, gauge2.address)).to.be.eq(tx_ts2)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const last_user_vote_slope2 = await controller.voteUserSlopes(user1.address, gauge2.address)

            expect(last_user_vote_slope.slope).to.be.eq(0)
            expect(last_user_vote_slope.power).to.be.eq(0)
            expect(last_user_vote_slope.end).to.be.eq(prev_user_voted_slope.end)
            expect(last_user_vote_slope.caller).to.be.eq(proxyVoter1.address)

            expect(last_user_vote_slope2.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope2.power).to.be.eq(vote_power)
            expect(last_user_vote_slope2.end).to.be.eq(user_point.endTimestamp)
            expect(last_user_vote_slope2.caller).to.be.eq(proxyVoter1.address)
            
            expect(tx1).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts1,
                user1.address,
                gauge1.address,
                0
            )

            expect(tx2).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts2,
                user1.address,
                gauge2.address,
                vote_power
            )

        });

        it(' should allow the user to override the past proxy vote after the proxy expired', async () => {

            let past_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            past_ts = past_ts.div(WEEK).mul(WEEK)

            const vote_power = 4000

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, vote_power, past_ts.add(proxy_duration))

            await controller.connect(proxyVoter1).voteForGaugeWeightsFor(user1.address, gauge1.address, vote_power)

            await advanceTime(WEEK.mul(4).toNumber())

            await controller.connect(user1).updateGaugeWeight(gauge1.address)
            await controller.connect(user1).updateTotalWeight()

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const prev_user_voted_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const expected_prev_bias = prev_user_voted_slope.slope.mul(prev_user_voted_slope.end.sub(next_period))

            const previous_gauge_change = await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)
            const previous_total_change = await controller.changesWeightTotal(prev_user_voted_slope.end)

            const tx = await controller.connect(user1).voteForGaugeWeights(gauge1.address, 0)
            const tx_ts = BigNumber.from((await provider.getBlock(tx.blockNumber || 0)).timestamp)

            expect(await controller.voteUserPower(user1.address)).to.be.eq(user_prev_used_power.sub(vote_power))
            expect(await controller.usedFreePower(user1.address)).to.be.eq(user_prev_used_power.sub(vote_power))

            expect(await controller.blockedProxyPower(user1.address)).to.be.eq(0)

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_total_point = await controller.pointsWeightTotal(next_period)

            expect(new_gauge_point.bias).to.be.eq(previous_gauge_point.bias.sub(expected_prev_bias))
            expect(new_gauge_point.slope).to.be.eq(previous_gauge_point.slope.sub(prev_user_voted_slope.slope))

            expect(new_total_point.bias).to.be.eq(previous_total_point.bias.sub(expected_prev_bias))
            expect(new_total_point.slope).to.be.eq(previous_total_point.slope.sub(prev_user_voted_slope.slope))

            expect(await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change.sub(prev_user_voted_slope.slope))
            expect(await controller.changesWeightTotal(prev_user_voted_slope.end)).to.be.eq(previous_total_change.sub(prev_user_voted_slope.slope))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)

            expect(last_user_vote_slope.slope).to.be.eq(0)
            expect(last_user_vote_slope.power).to.be.eq(0)
            expect(last_user_vote_slope.end).to.be.eq(prev_user_voted_slope.end)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                0
            )

        });

        it(' should not allow a proxy or the user to override another proxy vote', async () => {

            let past_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            past_ts = past_ts.div(WEEK).mul(WEEK)

            const vote_power = 3000

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, vote_power, past_ts.add(proxy_duration))

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter2.address, 4000, past_ts.add(proxy_duration))

            await controller.connect(proxyVoter1).voteForGaugeWeightsFor(user1.address, gauge1.address, vote_power)

            await advanceTime(WEEK.mul(2).toNumber())

            await expect(
                controller.connect(user1).voteForGaugeWeights(gauge1.address, 0)
            ).to.be.revertedWith('NotAllowedVoteChange')

            await expect(
                controller.connect(proxyVoter2).voteForGaugeWeightsFor(user1.address, gauge1.address, 0)
            ).to.be.revertedWith('NotAllowedVoteChange')

        });

        it(' should not allow the user to vote with voting power allocated to a proxy', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, current_ts.add(proxy_duration))
            
            await expect(
                controller.connect(user1).voteForManyGaugeWeights([gauge1.address, gauge3.address], [4000, 6000])
            ).to.be.revertedWith('VotingPowerExceeded')

        });
    
    });

    describe('voteForManyGaugeWeightsFor', async () => {

        let board1_id: BigNumber
        let board2_id: BigNumber

        const gauge2_cap = ethers.utils.parseEther("0.15")

        const proxy_duration = WEEK.mul(4)

        const proxy_power = 5500

        beforeEach(async () => {

            board1_id = await controller.nextBoardId()
            board2_id = board1_id.add(1)

            await controller.connect(admin).addNewBoard(
                board1.address,
                distributor1.address,
            )
            await controller.connect(admin).addNewBoard(
                board2.address,
                distributor2.address,
            )

            await controller.connect(admin).addNewGauge(
                gauge1.address,
                board1_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge2.address,
                board1_id,
                gauge2_cap
            )
            await controller.connect(admin).addNewGauge(
                gauge3.address,
                board2_id,
                0
            )
            await controller.connect(admin).addNewGauge(
                gauge4.address,
                board2_id,
                0
            )

            const current_block = (await provider.getBlock('latest')).number
            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            const user1_slope = ethers.utils.parseEther("2500").div(WEEK.mul(104))

            const user1_point = {
                bias: user1_slope.mul(WEEK.mul(104)),
                slope: user1_slope,
                endTimestamp: current_ts.add(WEEK.mul(85)),
                blockNumber: current_block - 500,
            }

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts,
                user1_point
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(2)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )

            await power.connect(admin).setUserPointAt(
                user1.address, 
                current_ts.add(WEEK.mul(4)),
                {
                    bias: user1_slope.mul(WEEK.mul(104)),
                    slope: user1_slope,
                    endTimestamp: current_ts.add(WEEK.mul(85)),
                    blockNumber: current_block - 500,
                }
            )

            await power.connect(admin).setLockedEnd(user1.address, current_ts.add(WEEK.mul(85)))

            await controller.connect(user1).approveProxyManager(manager.address, 0)

        });

        it(' should allocate the proxy votes correctly', async () => {

            const vote_power = 3000
            const vote_power2 = 1500
            const vote_power3 = 2500

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 7000, current_ts.add(proxy_duration))

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)
            const previous_gauge_point3 = await controller.pointsWeight(gauge3.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const previous_gauge_change = await controller.changesWeight(gauge1.address, user_point.endTimestamp)
            const previous_gauge_change2 = await controller.changesWeight(gauge2.address, user_point.endTimestamp)
            const previous_gauge_change3 = await controller.changesWeight(gauge3.address, user_point.endTimestamp)
            const previous_total_change = await controller.changesWeightTotal(user_point.endTimestamp)

            const tx = await controller.connect(proxyVoter1).voteForManyGaugeWeightsFor(
                user1.address,
                [gauge1.address, gauge2.address, gauge3.address],
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

            expect((await controller.proxyVoterState(user1.address, proxyVoter1.address)).usedPower).to.be.eq(
                vote_power + vote_power2 + vote_power3
            )

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)
            const new_gauge_point3 = await controller.pointsWeight(gauge3.address, next_period)
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

            expect(await controller.changesWeight(gauge1.address, user_point.endTimestamp)).to.be.eq(previous_gauge_change.add(expected_vote_slope))
            expect(await controller.changesWeight(gauge2.address, user_point.endTimestamp)).to.be.eq(previous_gauge_change2.add(expected_vote_slope2))
            expect(await controller.changesWeight(gauge3.address, user_point.endTimestamp)).to.be.eq(previous_gauge_change3.add(expected_vote_slope3))
            expect(await controller.changesWeightTotal(user_point.endTimestamp)).to.be.eq(previous_total_change.add(
                expected_vote_slope.add(expected_vote_slope2).add(expected_vote_slope3)
            ))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const last_user_vote_slope2 = await controller.voteUserSlopes(user1.address, gauge2.address)
            const last_user_vote_slope3 = await controller.voteUserSlopes(user1.address, gauge3.address)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(vote_power)
            expect(last_user_vote_slope.end).to.be.eq(user_point.endTimestamp)
            expect(last_user_vote_slope.caller).to.be.eq(proxyVoter1.address)

            expect(last_user_vote_slope2.slope).to.be.eq(expected_vote_slope2)
            expect(last_user_vote_slope2.power).to.be.eq(vote_power2)
            expect(last_user_vote_slope2.end).to.be.eq(user_point.endTimestamp)
            expect(last_user_vote_slope2.caller).to.be.eq(proxyVoter1.address)

            expect(last_user_vote_slope3.slope).to.be.eq(expected_vote_slope3)
            expect(last_user_vote_slope3.power).to.be.eq(vote_power3)
            expect(last_user_vote_slope3.end).to.be.eq(user_point.endTimestamp)
            expect(last_user_vote_slope3.caller).to.be.eq(proxyVoter1.address)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                vote_power
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge2.address,
                vote_power2
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge3.address,
                vote_power3
            )

        });

        it(' should allow to override all past votes from the user for proxy', async () => {

            const vote_power = 4000
            const vote_power2 = 2500
            const vote_power3 = 3500

            const new_vote_power1 = 0
            const new_vote_power2 = 5500
            const new_vote_power3 = 1500
            const new_vote_power4 = 3000

            await controller.connect(user1).voteForManyGaugeWeights(
                [gauge1.address, gauge2.address, gauge3.address],
                [vote_power, vote_power2, vote_power3]
            )

            await advanceTime(WEEK.mul(2).toNumber())

            await controller.connect(user1).updateGaugeWeight(gauge1.address)
            await controller.connect(user1).updateGaugeWeight(gauge2.address)
            await controller.connect(user1).updateGaugeWeight(gauge3.address)
            await controller.connect(user1).updateGaugeWeight(gauge4.address)
            await controller.connect(user1).updateTotalWeight()

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 10000, current_ts.add(proxy_duration))

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)
            const previous_gauge_point3 = await controller.pointsWeight(gauge3.address, next_period)
            const previous_gauge_point4 = await controller.pointsWeight(gauge4.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const prev_user_voted_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const prev_user_voted_slope2 = await controller.voteUserSlopes(user1.address, gauge2.address)
            const prev_user_voted_slope3 = await controller.voteUserSlopes(user1.address, gauge3.address)
            const expected_prev_bias = prev_user_voted_slope.slope.mul(prev_user_voted_slope.end.sub(next_period))
            const expected_prev_bias2 = prev_user_voted_slope2.slope.mul(prev_user_voted_slope2.end.sub(next_period))
            const expected_prev_bias3 = prev_user_voted_slope3.slope.mul(prev_user_voted_slope3.end.sub(next_period))

            const previous_gauge_change = await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)
            const previous_gauge_change2 = await controller.changesWeight(gauge2.address, prev_user_voted_slope.end)
            const previous_gauge_change3 = await controller.changesWeight(gauge3.address, prev_user_voted_slope.end)
            const previous_gauge_change4 = await controller.changesWeight(gauge4.address, prev_user_voted_slope.end)
            const previous_total_change = await controller.changesWeightTotal(prev_user_voted_slope.end)

            const tx = await controller.connect(proxyVoter1).voteForManyGaugeWeightsFor(
                user1.address,
                [gauge1.address, gauge2.address, gauge3.address, gauge4.address],
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

            expect((await controller.proxyVoterState(user1.address, proxyVoter1.address)).usedPower).to.be.eq(new_vote_power2 + new_vote_power3 + new_vote_power4)

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)
            const new_gauge_point3 = await controller.pointsWeight(gauge3.address, next_period)
            const new_gauge_point4 = await controller.pointsWeight(gauge4.address, next_period)
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

            expect(await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change.sub(prev_user_voted_slope.slope).add(expected_vote_slope))
            expect(await controller.changesWeight(gauge2.address, prev_user_voted_slope2.end)).to.be.eq(previous_gauge_change2.sub(prev_user_voted_slope2.slope).add(expected_vote_slope2))
            expect(await controller.changesWeight(gauge3.address, prev_user_voted_slope3.end)).to.be.eq(previous_gauge_change3.sub(prev_user_voted_slope3.slope).add(expected_vote_slope3))
            expect(await controller.changesWeight(gauge4.address, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change4.add(expected_vote_slope4))
            expect(await controller.changesWeightTotal(prev_user_voted_slope.end)).to.be.eq(previous_total_change.sub(
                prev_user_voted_slope.slope.add(prev_user_voted_slope2.slope).add(prev_user_voted_slope3.slope)
            ).add(
                expected_vote_slope.add(expected_vote_slope2).add(expected_vote_slope3).add(expected_vote_slope4)
            ))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, gauge2.address)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, gauge3.address)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, gauge4.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(0)
            expect(last_user_vote_slope.end).to.be.eq(prev_user_voted_slope.end)
            expect(last_user_vote_slope.caller).to.be.eq(proxyVoter1.address)

            const last_user_vote_slope2 = await controller.voteUserSlopes(user1.address, gauge2.address)

            expect(last_user_vote_slope2.slope).to.be.eq(expected_vote_slope2)
            expect(last_user_vote_slope2.power).to.be.eq(new_vote_power2)
            expect(last_user_vote_slope2.end).to.be.eq(prev_user_voted_slope2.end)
            expect(last_user_vote_slope2.caller).to.be.eq(proxyVoter1.address)

            const last_user_vote_slope3 = await controller.voteUserSlopes(user1.address, gauge3.address)

            expect(last_user_vote_slope3.slope).to.be.eq(expected_vote_slope3)
            expect(last_user_vote_slope3.power).to.be.eq(new_vote_power3)
            expect(last_user_vote_slope3.end).to.be.eq(prev_user_voted_slope3.end)
            expect(last_user_vote_slope3.caller).to.be.eq(proxyVoter1.address)

            const last_user_vote_slope4 = await controller.voteUserSlopes(user1.address, gauge4.address)

            expect(last_user_vote_slope4.slope).to.be.eq(expected_vote_slope4)
            expect(last_user_vote_slope4.power).to.be.eq(new_vote_power4)
            expect(last_user_vote_slope4.end).to.be.eq(prev_user_voted_slope.end)
            expect(last_user_vote_slope4.caller).to.be.eq(proxyVoter1.address)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                0
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge2.address,
                new_vote_power2
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge3.address,
                new_vote_power3
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge4.address,
                new_vote_power4
            )

        });

        it(' should allow to override the votes from the proxy after it is expired', async () => {

            const vote_power = 4000
            const vote_power2 = 2500
            const vote_power3 = 3500

            const new_vote_power1 = 0
            const new_vote_power2 = 5500
            const new_vote_power3 = 1500
            const new_vote_power4 = 3000

            let past_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            past_ts = past_ts.div(WEEK).mul(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, 10000, past_ts.add(WEEK.mul(2)))

            await controller.connect(proxyVoter1).voteForManyGaugeWeightsFor(
                user1.address,
                [gauge1.address, gauge2.address, gauge3.address],
                [vote_power, vote_power2, vote_power3]
            )

            await advanceTime(WEEK.mul(2).toNumber())

            await controller.connect(user1).updateGaugeWeight(gauge1.address)
            await controller.connect(user1).updateGaugeWeight(gauge2.address)
            await controller.connect(user1).updateGaugeWeight(gauge3.address)
            await controller.connect(user1).updateGaugeWeight(gauge4.address)
            await controller.connect(user1).updateTotalWeight()

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)
            const next_period = current_ts.add(WEEK)

            const previous_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const previous_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)
            const previous_gauge_point3 = await controller.pointsWeight(gauge3.address, next_period)
            const previous_gauge_point4 = await controller.pointsWeight(gauge4.address, next_period)
            const previous_total_point = await controller.pointsWeightTotal(next_period)

            const user_prev_used_power = await controller.voteUserPower(user1.address)

            const user_point = await power.getUserPointAt(user1.address, current_ts)

            const prev_user_voted_slope = await controller.voteUserSlopes(user1.address, gauge1.address)
            const prev_user_voted_slope2 = await controller.voteUserSlopes(user1.address, gauge2.address)
            const prev_user_voted_slope3 = await controller.voteUserSlopes(user1.address, gauge3.address)
            const expected_prev_bias = prev_user_voted_slope.slope.mul(prev_user_voted_slope.end.sub(next_period))
            const expected_prev_bias2 = prev_user_voted_slope2.slope.mul(prev_user_voted_slope2.end.sub(next_period))
            const expected_prev_bias3 = prev_user_voted_slope3.slope.mul(prev_user_voted_slope3.end.sub(next_period))

            const previous_gauge_change = await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)
            const previous_gauge_change2 = await controller.changesWeight(gauge2.address, prev_user_voted_slope.end)
            const previous_gauge_change3 = await controller.changesWeight(gauge3.address, prev_user_voted_slope.end)
            const previous_gauge_change4 = await controller.changesWeight(gauge4.address, prev_user_voted_slope.end)
            const previous_total_change = await controller.changesWeightTotal(prev_user_voted_slope.end)

            const tx = await controller.connect(user1).voteForManyGaugeWeights(
                [gauge1.address, gauge2.address, gauge3.address, gauge4.address],
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

            expect((await controller.proxyVoterState(user1.address, proxyVoter1.address)).usedPower).to.be.eq(0)

            const new_gauge_point = await controller.pointsWeight(gauge1.address, next_period)
            const new_gauge_point2 = await controller.pointsWeight(gauge2.address, next_period)
            const new_gauge_point3 = await controller.pointsWeight(gauge3.address, next_period)
            const new_gauge_point4 = await controller.pointsWeight(gauge4.address, next_period)
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

            expect(await controller.changesWeight(gauge1.address, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change.sub(prev_user_voted_slope.slope).add(expected_vote_slope))
            expect(await controller.changesWeight(gauge2.address, prev_user_voted_slope2.end)).to.be.eq(previous_gauge_change2.sub(prev_user_voted_slope2.slope).add(expected_vote_slope2))
            expect(await controller.changesWeight(gauge3.address, prev_user_voted_slope3.end)).to.be.eq(previous_gauge_change3.sub(prev_user_voted_slope3.slope).add(expected_vote_slope3))
            expect(await controller.changesWeight(gauge4.address, prev_user_voted_slope.end)).to.be.eq(previous_gauge_change4.add(expected_vote_slope4))
            expect(await controller.changesWeightTotal(prev_user_voted_slope.end)).to.be.eq(previous_total_change.sub(
                prev_user_voted_slope.slope.add(prev_user_voted_slope2.slope).add(prev_user_voted_slope3.slope)
            ).add(
                expected_vote_slope.add(expected_vote_slope2).add(expected_vote_slope3).add(expected_vote_slope4)
            ))

            expect(await controller.lastUserVote(user1.address, gauge1.address)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, gauge2.address)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, gauge3.address)).to.be.eq(tx_ts)
            expect(await controller.lastUserVote(user1.address, gauge4.address)).to.be.eq(tx_ts)

            expect(await controller.timeTotal()).to.be.eq(next_period)

            const last_user_vote_slope = await controller.voteUserSlopes(user1.address, gauge1.address)

            expect(last_user_vote_slope.slope).to.be.eq(expected_vote_slope)
            expect(last_user_vote_slope.power).to.be.eq(0)
            expect(last_user_vote_slope.end).to.be.eq(prev_user_voted_slope.end)
            expect(last_user_vote_slope.caller).to.be.eq(user1.address)

            const last_user_vote_slope2 = await controller.voteUserSlopes(user1.address, gauge2.address)

            expect(last_user_vote_slope2.slope).to.be.eq(expected_vote_slope2)
            expect(last_user_vote_slope2.power).to.be.eq(new_vote_power2)
            expect(last_user_vote_slope2.end).to.be.eq(prev_user_voted_slope2.end)
            expect(last_user_vote_slope2.caller).to.be.eq(user1.address)

            const last_user_vote_slope3 = await controller.voteUserSlopes(user1.address, gauge3.address)

            expect(last_user_vote_slope3.slope).to.be.eq(expected_vote_slope3)
            expect(last_user_vote_slope3.power).to.be.eq(new_vote_power3)
            expect(last_user_vote_slope3.end).to.be.eq(prev_user_voted_slope3.end)
            expect(last_user_vote_slope3.caller).to.be.eq(user1.address)

            const last_user_vote_slope4 = await controller.voteUserSlopes(user1.address, gauge4.address)

            expect(last_user_vote_slope4.slope).to.be.eq(expected_vote_slope4)
            expect(last_user_vote_slope4.power).to.be.eq(new_vote_power4)
            expect(last_user_vote_slope4.end).to.be.eq(prev_user_voted_slope.end)
            expect(last_user_vote_slope4.caller).to.be.eq(user1.address)
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge1.address,
                0
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge2.address,
                new_vote_power2
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge3.address,
                new_vote_power3
            )
            
            expect(tx).to.emit(controller, "VoteForGauge").withArgs(
                tx_ts,
                user1.address,
                gauge4.address,
                new_vote_power4
            )

        });

        it(' should fail if trying to use more than allowed for the proxy', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, current_ts.add(proxy_duration))

            await expect(
                controller.connect(proxyVoter1).voteForManyGaugeWeightsFor(user1.address, [gauge1.address, gauge2.address], [5000, 4500])
            ).to.be.revertedWith('VotingPowerProxyExceeded')

        });

        it(' should fail if trying to caller is not an allowed proxy', async () => {
            
            await expect(
                controller.connect(proxyVoter2).voteForManyGaugeWeightsFor(user1.address, [gauge1.address, gauge2.address], [2000, 2500])
            ).to.be.revertedWith('NotAllowedProxyVoter')

        });

        it(' should fail if the proxy is expired', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, current_ts.add(proxy_duration))

            await advanceTime(WEEK.mul(7).toNumber())
            
            await expect(
                controller.connect(proxyVoter1).voteForManyGaugeWeightsFor(user1.address, [gauge1.address, gauge2.address], [2000, 2500])
            ).to.be.revertedWith('NotAllowedProxyVoter')

        });

        it(' should fail if the list are not the same length', async () => {

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, current_ts.add(proxy_duration))

            await expect(
                controller.connect(proxyVoter1).voteForManyGaugeWeightsFor(user1.address, [gauge1.address, gauge2.address], [2000])
            ).to.be.revertedWith('ArraySizeMismatch')

            await expect(
                controller.connect(proxyVoter1).voteForManyGaugeWeightsFor(user1.address, [gauge1.address], [2000, 2500])
            ).to.be.revertedWith('ArraySizeMismatch')

        });

        it(' should fail if the given list exceeds the max length', async () => {

            const vote_power = 4000
            const vote_power2 = 2500
            const vote_power3 = 3500

            const gauges = [gauge1.address, gauge2.address, gauge3.address]
            const powers = [vote_power, vote_power2, vote_power3]
            
            const gauge_list = gauges.concat(gauges).concat(gauges).concat(gauges)
            const power_list = powers.concat(powers).concat(powers).concat(powers)

            let current_ts = BigNumber.from((await provider.getBlock('latest')).timestamp)
            current_ts = current_ts.div(WEEK).mul(WEEK)

            await controller.connect(user1).setVoterProxy(user1.address, proxyVoter1.address, proxy_power, current_ts.add(proxy_duration))

            await expect(
                controller.connect(proxyVoter1).voteForManyGaugeWeightsFor(
                    user1.address,
                    gauge_list,
                    power_list
                )
            ).to.be.revertedWith('MaxVoteListExceeded')

        });
    
    });

});