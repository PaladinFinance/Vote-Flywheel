const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { MultiMerkleDistributorV2 } from "../../typechain/contracts/MultiMerkleDistributorV2";
import { MockCreator } from "../../typechain/contracts/test/MockCreator";
import { IERC20 } from "../../typechain/@openzeppelin/contracts/token/ERC20/IERC20";
import { IERC20__factory } from "../../typechain/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import BalanceTree from "../utils/merkle/balance-tree";

import {
    advanceTime,
    getERC20,
} from "../utils/utils";

const TOKEN1_ADDRESS = "0xD533a949740bb3306d119CC777fa900bA034cd52"; //here : CRV
const TOKEN2_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; //here : DAI

const BIG_HOLDER1 = "0xF977814e90dA44bFA03b6295A0616a897441aceC"; //here : CRV holder
const BIG_HOLDER2 = "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8"; //here : DAI holder

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

let distributorFactory: ContractFactory
let creatorFactory: ContractFactory

let tree: BalanceTree;

const WEEK = BigNumber.from(86400 * 7)

describe('MultiMerkleDistributorV2 contract tests - with Loot', () => {
    let admin: SignerWithAddress
    let mockQuestBoard: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress
    let user4: SignerWithAddress

    let signers: SignerWithAddress[]

    let distributor: MultiMerkleDistributorV2

    let lootCreator: MockCreator

    let CRV: IERC20
    let DAI: IERC20

    const distrib_amount = ethers.utils.parseEther('122')

    const user1_claim_amount = ethers.utils.parseEther('25')
    const user2_claim_amount = ethers.utils.parseEther('50')
    const user3_claim_amount = ethers.utils.parseEther('15')
    const user4_claim_amount = ethers.utils.parseEther('32')

    before(async () => {
        [admin, mockQuestBoard, user1, user2, user3, user4] = await ethers.getSigners();

        signers = (await ethers.getSigners()).slice(2) || []; //all signers exepct the one used as admin & the mock quest address

        distributorFactory = await ethers.getContractFactory("MultiMerkleDistributorV2");
        creatorFactory = await ethers.getContractFactory("MockCreator");

        const crv_amount = ethers.utils.parseEther('50000');
        const dai_amount = ethers.utils.parseEther('100000');

        CRV = IERC20__factory.connect(TOKEN1_ADDRESS, provider);
        DAI = IERC20__factory.connect(TOKEN2_ADDRESS, provider);

        await getERC20(admin, BIG_HOLDER1, CRV, admin.address, crv_amount);

        await getERC20(admin, BIG_HOLDER2, DAI, admin.address, dai_amount);

    })

    beforeEach(async () => {

        lootCreator = (await creatorFactory.connect(admin).deploy(
            admin.address
        )) as MockCreator
        await lootCreator.deployed()

        distributor = (await distributorFactory.connect(admin).deploy(mockQuestBoard.address)) as MultiMerkleDistributorV2;
        await distributor.deployed();

    });

    it(' should be deployed & have correct parameters', async () => {
        expect(distributor.address).to.properAddress

        expect(await distributor.owner()).to.be.eq(admin.address)

        expect(await distributor.questBoard()).to.be.eq(mockQuestBoard.address)

        expect(await distributor.lootCreator()).to.be.eq(ethers.constants.AddressZero)

    });

    describe('setLootCreator', async () => {

        it(' should set the correct Loot Creator', async () => {

            expect(await distributor.lootCreator()).to.be.eq(ethers.constants.AddressZero)

            const tx = await distributor.connect(admin).setLootCreator(lootCreator.address)

            expect(await distributor.lootCreator()).to.be.eq(lootCreator.address)

            await expect(tx).to.emit(distributor, 'LootCreatorUpdated').withArgs(ethers.constants.AddressZero, lootCreator.address)

        });

        it(' should update the Loot Creator again', async () => {

            await distributor.connect(admin).setLootCreator(lootCreator.address)

            expect(await distributor.lootCreator()).to.be.eq(lootCreator.address)

            const tx = await distributor.connect(admin).setLootCreator(user1.address)

            expect(await distributor.lootCreator()).to.be.eq(user1.address)

            await expect(tx).to.emit(distributor, 'LootCreatorUpdated').withArgs(lootCreator.address, user1.address)

        });

        it(' should only be allowed for admin', async () => {

            await expect(
                distributor.connect(user1).setLootCreator(lootCreator.address)
            ).to.be.reverted

            await expect(
                distributor.connect(user2).setLootCreator(lootCreator.address)
            ).to.be.reverted

        });

    });

    describe('Loot Creator set', async () => {

        describe('updateQuestPeriod', async () => {

            const quest_id1 = BigNumber.from(1011)

            const period = BigNumber.from(1639612800)

            let tree_root: string

            beforeEach(async () => {

                await distributor.connect(admin).setLootCreator(lootCreator.address)
                
                tree = new BalanceTree([
                    { account: user1.address, amount: user1_claim_amount, questID: quest_id1, period: period },
                    { account: user2.address, amount: user2_claim_amount, questID: quest_id1, period: period },
                    { account: user3.address, amount: user3_claim_amount, questID: quest_id1, period: period },
                    { account: user4.address, amount: user4_claim_amount, questID: quest_id1, period: period },
                ]); 

                await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

                tree_root = tree.getHexRoot()

                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)

            });

            it(' should notify the Loot Creator correctly', async () => {

                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)

                expect(await lootCreator.totalQuestPeriodRewards(quest_id1, period,)).to.be.eq(distrib_amount)
                expect(await lootCreator.totalQuestPeriodSet(quest_id1, period,)).to.be.true

            });

        });

        describe('claim', async () => {

            const quest_id = BigNumber.from(1011)
            const quest_id2 = BigNumber.from(1012)
        
            const period = BigNumber.from(1639612800)
            const period2 = BigNumber.from(1640217600)

            let other_tree: BalanceTree

            describe('claim - small tree', async () => {
        
                beforeEach(async () => {

                    await distributor.connect(admin).setLootCreator(lootCreator.address)
                
                    tree = new BalanceTree([
                        { account: user1.address, amount: user1_claim_amount, questID: quest_id, period: period },
                        { account: user2.address, amount: user2_claim_amount, questID: quest_id, period: period },
                        { account: user3.address, amount: user3_claim_amount, questID: quest_id, period: period },
                        { account: user4.address, amount: user4_claim_amount, questID: quest_id, period: period },
                    ]);

                    other_tree = new BalanceTree([
                        { account: user1.address, amount: user1_claim_amount, questID: quest_id2, period: period2 },
                        { account: user2.address, amount: user2_claim_amount, questID: quest_id2, period: period2 },
                        { account: user3.address, amount: user3_claim_amount, questID: quest_id2, period: period2 },
                        { account: user4.address, amount: user4_claim_amount, questID: quest_id2, period: period2 },
                    ]);
        
                    await distributor.connect(mockQuestBoard).addQuest(quest_id, CRV.address)
                    await distributor.connect(mockQuestBoard).addQuest(quest_id2, DAI.address)

                    await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, period, distrib_amount)

                    await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id2, period2, distrib_amount)

                    await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, period, distrib_amount, tree.getHexRoot())

                    await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id2, period2, distrib_amount, other_tree.getHexRoot())

                    await CRV.connect(admin).transfer(distributor.address, distrib_amount)
        
                });

                it(' should notify the Loot Creator correctly', async () => {
    
                    let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                    await distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof)

                    expect(await lootCreator.userQuestPeriodRewards(quest_id, period, user1.address)).to.be.eq(user1_claim_amount)
    
                });
        
            });

        });

        describe('multiClaim', async () => {

            const quest_id1 = BigNumber.from(1011)
            const quest_id2 = BigNumber.from(1022)
            const quest_id3 = BigNumber.from(1033)
        
            const period = BigNumber.from(1639612800)
            const next_period = period.add(WEEK).div(WEEK).mul(WEEK)

            let tree2: BalanceTree;
            let tree3: BalanceTree;

            let total2 = ethers.utils.parseEther('72')
            let total3 = ethers.utils.parseEther('65')

            const user_claims = [
                [user1_claim_amount, ethers.utils.parseEther('15'), ethers.utils.parseEther('12')],
                [user2_claim_amount, ethers.utils.parseEther('20'), ethers.utils.parseEther('50')],
                [user3_claim_amount, ethers.utils.parseEther('0'), ethers.utils.parseEther('3')],
                [user4_claim_amount, ethers.utils.parseEther('37'), ethers.utils.parseEther('0')],
            ]
        
            beforeEach(async () => {

                await distributor.connect(admin).setLootCreator(lootCreator.address)
                
                tree = new BalanceTree([
                    { account: user1.address, amount: user1_claim_amount, questID: quest_id1, period: period },
                    { account: user2.address, amount: user2_claim_amount, questID: quest_id1, period: period },
                    { account: user3.address, amount: user3_claim_amount, questID: quest_id1, period: period },
                    { account: user4.address, amount: user4_claim_amount, questID: quest_id1, period: period },
                ]); 

                await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)
                await distributor.connect(mockQuestBoard).addQuest(quest_id2, CRV.address)
                await distributor.connect(mockQuestBoard).addQuest(quest_id3, DAI.address)

                tree2 = new BalanceTree([
                    { account: user1.address, amount: user_claims[0][1], questID: quest_id2, period: period },
                    { account: user2.address, amount: user_claims[1][1], questID: quest_id2, period: period },
                    { account: user4.address, amount: user_claims[3][1], questID: quest_id2, period: period },
                ]);

                tree3 = new BalanceTree([
                    { account: user1.address, amount: user_claims[0][2], questID: quest_id3, period: next_period },
                    { account: user2.address, amount: user_claims[1][2], questID: quest_id3, period: next_period },
                    { account: user3.address, amount: user_claims[2][2], questID: quest_id3, period: next_period },
                ]);

                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)
                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id2, period, total2)
                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id3, next_period, total3)

                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree.getHexRoot())
                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id2, period, total2, tree2.getHexRoot())
                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id3, next_period, total3, tree3.getHexRoot())

                await CRV.connect(admin).transfer(distributor.address, distrib_amount.mul(2))
                await DAI.connect(admin).transfer(distributor.address, distrib_amount)

            });

            it(' should notify the Loot Creator correctly', async () => {

                let claim_params = [
                    { 
                        questID: quest_id1,
                        period: period,
                        index: 0,
                        amount: user_claims[0][0],
                        merkleProof: tree.getProof(quest_id1, period, 0, user1.address, user_claims[0][0])
                    },
                    { 
                        questID: quest_id2,
                        period: period,
                        index: 0,
                        amount: user_claims[0][1],
                        merkleProof: tree2.getProof(quest_id2, period, 0, user1.address, user_claims[0][1])
                    }
                ]
    
                await distributor.connect(user1).multiClaim(user1.address, claim_params)

                expect(await lootCreator.userQuestPeriodRewards(quest_id1, period, user1.address)).to.be.eq(user_claims[0][0])

                expect(await lootCreator.userQuestPeriodRewards(quest_id2, period, user1.address)).to.be.eq(user_claims[0][1])

            });

        });

        describe('claimQuest', async () => {

            const quest_id = BigNumber.from(1011)
        
            const period = BigNumber.from(1639612800)
            const next_period = period.add(WEEK).div(WEEK).mul(WEEK)
            const next_period2 = next_period.add(WEEK).div(WEEK).mul(WEEK)

            let tree2: BalanceTree;
            let tree3: BalanceTree;
            let tree4: BalanceTree;

            const user_claims = [
                [user1_claim_amount, ethers.utils.parseEther('15'), ethers.utils.parseEther('12')],
                [user1_claim_amount, ethers.utils.parseEther('20'), ethers.utils.parseEther('50')],
                [user1_claim_amount, ethers.utils.parseEther('0'), ethers.utils.parseEther('3')],
                [user1_claim_amount, ethers.utils.parseEther('37'), ethers.utils.parseEther('0')],
            ]

            let total2 = ethers.utils.parseEther('72')
            let total3 = ethers.utils.parseEther('65')
        
            beforeEach(async () => {

                await distributor.connect(admin).setLootCreator(lootCreator.address)
                
                tree = new BalanceTree([
                    { account: user1.address, amount: user1_claim_amount, questID: quest_id, period: period },
                    { account: user2.address, amount: user2_claim_amount, questID: quest_id, period: period },
                    { account: user3.address, amount: user3_claim_amount, questID: quest_id, period: period },
                    { account: user4.address, amount: user4_claim_amount, questID: quest_id, period: period },
                ]); 

                await distributor.connect(mockQuestBoard).addQuest(quest_id, CRV.address)

                tree2 = new BalanceTree([
                    { account: user1.address, amount: user_claims[0][1], questID: quest_id, period: next_period },
                    { account: user2.address, amount: user_claims[1][1], questID: quest_id, period: next_period },
                    { account: user4.address, amount: user_claims[3][1], questID: quest_id, period: next_period },
                ]);

                tree3 = new BalanceTree([
                    { account: user1.address, amount: user_claims[0][2], questID: quest_id, period: next_period2 },
                    { account: user2.address, amount: user_claims[1][2], questID: quest_id, period: next_period2 },
                    { account: user3.address, amount: user_claims[2][2], questID: quest_id, period: next_period2 },
                ]);

                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, period, distrib_amount)
                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, next_period, total2)
                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, next_period2, total3)

                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, period, distrib_amount, tree.getHexRoot())
                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, next_period, total2, tree2.getHexRoot())
                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, next_period2, total3, tree3.getHexRoot())

                await CRV.connect(admin).transfer(distributor.address, distrib_amount.mul(3))

            });

            it(' should notify the Loot Creator correctly', async () => {

                let claim_params = [
                    { 
                        questID: quest_id,
                        period: period,
                        index: 0,
                        amount: user_claims[0][0],
                        merkleProof: tree.getProof(quest_id, period, 0, user1.address, user_claims[0][0])
                    },
                    { 
                        questID: quest_id,
                        period: next_period,
                        index: 0,
                        amount: user_claims[0][1],
                        merkleProof: tree2.getProof(quest_id, next_period, 0, user1.address, user_claims[0][1])
                    },
                    { 
                        questID: quest_id,
                        period: next_period2,
                        index: 0,
                        amount: user_claims[0][2],
                        merkleProof: tree3.getProof(quest_id, next_period2, 0, user1.address, user_claims[0][2])
                    },
                ]
    
                await distributor.connect(user1).claimQuest(user1.address, quest_id, claim_params)

                expect(await lootCreator.userQuestPeriodRewards(quest_id, period, user1.address)).to.be.eq(user_claims[0][0])

                expect(await lootCreator.userQuestPeriodRewards(quest_id, next_period, user1.address)).to.be.eq(user_claims[0][1])

                expect(await lootCreator.userQuestPeriodRewards(quest_id, next_period2, user1.address)).to.be.eq(user_claims[0][2])

            });

        });

    });

    describe('No Loot Creator set', async () => {

        describe('updateQuestPeriod', async () => {

            const quest_id1 = BigNumber.from(1011)

            const period = BigNumber.from(1639612800)

            let tree_root: string

            beforeEach(async () => {
                
                tree = new BalanceTree([
                    { account: user1.address, amount: user1_claim_amount, questID: quest_id1, period: period },
                    { account: user2.address, amount: user2_claim_amount, questID: quest_id1, period: period },
                    { account: user3.address, amount: user3_claim_amount, questID: quest_id1, period: period },
                    { account: user4.address, amount: user4_claim_amount, questID: quest_id1, period: period },
                ]); 

                await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

                tree_root = tree.getHexRoot()

                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)

            });

            it(' should not notify the Loot Creator', async () => {

                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)

                expect(await lootCreator.totalQuestPeriodRewards(quest_id1, period,)).to.be.eq(0)
                expect(await lootCreator.totalQuestPeriodSet(quest_id1, period,)).to.be.false

            });

        });

        describe('claim', async () => {

            const quest_id = BigNumber.from(1011)
            const quest_id2 = BigNumber.from(1012)
        
            const period = BigNumber.from(1639612800)
            const period2 = BigNumber.from(1640217600)

            let other_tree: BalanceTree

            describe('claim - small tree', async () => {
        
                beforeEach(async () => {
                
                    tree = new BalanceTree([
                        { account: user1.address, amount: user1_claim_amount, questID: quest_id, period: period },
                        { account: user2.address, amount: user2_claim_amount, questID: quest_id, period: period },
                        { account: user3.address, amount: user3_claim_amount, questID: quest_id, period: period },
                        { account: user4.address, amount: user4_claim_amount, questID: quest_id, period: period },
                    ]);

                    other_tree = new BalanceTree([
                        { account: user1.address, amount: user1_claim_amount, questID: quest_id2, period: period2 },
                        { account: user2.address, amount: user2_claim_amount, questID: quest_id2, period: period2 },
                        { account: user3.address, amount: user3_claim_amount, questID: quest_id2, period: period2 },
                        { account: user4.address, amount: user4_claim_amount, questID: quest_id2, period: period2 },
                    ]);
        
                    await distributor.connect(mockQuestBoard).addQuest(quest_id, CRV.address)
                    await distributor.connect(mockQuestBoard).addQuest(quest_id2, DAI.address)

                    await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, period, distrib_amount)

                    await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id2, period2, distrib_amount)

                    await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, period, distrib_amount, tree.getHexRoot())

                    await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id2, period2, distrib_amount, other_tree.getHexRoot())

                    await CRV.connect(admin).transfer(distributor.address, distrib_amount)
        
                });

                it(' should should not notify the Loot Creator', async () => {
    
                    let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                    await distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof)

                    expect(await lootCreator.userQuestPeriodRewards(quest_id, period, user1.address)).to.be.eq(0)
    
                });
        
            });

        });

        describe('multiClaim', async () => {

            const quest_id1 = BigNumber.from(1011)
            const quest_id2 = BigNumber.from(1022)
            const quest_id3 = BigNumber.from(1033)
        
            const period = BigNumber.from(1639612800)
            const next_period = period.add(WEEK).div(WEEK).mul(WEEK)

            let tree2: BalanceTree;
            let tree3: BalanceTree;

            let total2 = ethers.utils.parseEther('72')
            let total3 = ethers.utils.parseEther('65')

            const user_claims = [
                [user1_claim_amount, ethers.utils.parseEther('15'), ethers.utils.parseEther('12')],
                [user2_claim_amount, ethers.utils.parseEther('20'), ethers.utils.parseEther('50')],
                [user3_claim_amount, ethers.utils.parseEther('0'), ethers.utils.parseEther('3')],
                [user4_claim_amount, ethers.utils.parseEther('37'), ethers.utils.parseEther('0')],
            ]
        
            beforeEach(async () => {
                
                tree = new BalanceTree([
                    { account: user1.address, amount: user1_claim_amount, questID: quest_id1, period: period },
                    { account: user2.address, amount: user2_claim_amount, questID: quest_id1, period: period },
                    { account: user3.address, amount: user3_claim_amount, questID: quest_id1, period: period },
                    { account: user4.address, amount: user4_claim_amount, questID: quest_id1, period: period },
                ]); 

                await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)
                await distributor.connect(mockQuestBoard).addQuest(quest_id2, CRV.address)
                await distributor.connect(mockQuestBoard).addQuest(quest_id3, DAI.address)

                tree2 = new BalanceTree([
                    { account: user1.address, amount: user_claims[0][1], questID: quest_id2, period: period },
                    { account: user2.address, amount: user_claims[1][1], questID: quest_id2, period: period },
                    { account: user4.address, amount: user_claims[3][1], questID: quest_id2, period: period },
                ]);

                tree3 = new BalanceTree([
                    { account: user1.address, amount: user_claims[0][2], questID: quest_id3, period: next_period },
                    { account: user2.address, amount: user_claims[1][2], questID: quest_id3, period: next_period },
                    { account: user3.address, amount: user_claims[2][2], questID: quest_id3, period: next_period },
                ]);

                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)
                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id2, period, total2)
                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id3, next_period, total3)

                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree.getHexRoot())
                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id2, period, total2, tree2.getHexRoot())
                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id3, next_period, total3, tree3.getHexRoot())

                await CRV.connect(admin).transfer(distributor.address, distrib_amount.mul(2))
                await DAI.connect(admin).transfer(distributor.address, distrib_amount)

            });

            it(' should should not notify the Loot Creator', async () => {

                let claim_params = [
                    { 
                        questID: quest_id1,
                        period: period,
                        index: 0,
                        amount: user_claims[0][0],
                        merkleProof: tree.getProof(quest_id1, period, 0, user1.address, user_claims[0][0])
                    },
                    { 
                        questID: quest_id2,
                        period: period,
                        index: 0,
                        amount: user_claims[0][1],
                        merkleProof: tree2.getProof(quest_id2, period, 0, user1.address, user_claims[0][1])
                    }
                ]

                await distributor.connect(user1).multiClaim(user1.address, claim_params)

                expect(await lootCreator.userQuestPeriodRewards(quest_id1, period, user1.address)).to.be.eq(0)

                expect(await lootCreator.userQuestPeriodRewards(quest_id2, period, user1.address)).to.be.eq(0)

            });

        });

        describe('claimQuest', async () => {

            const quest_id = BigNumber.from(1011)
        
            const period = BigNumber.from(1639612800)
            const next_period = period.add(WEEK).div(WEEK).mul(WEEK)
            const next_period2 = next_period.add(WEEK).div(WEEK).mul(WEEK)

            let tree2: BalanceTree;
            let tree3: BalanceTree;
            let tree4: BalanceTree;

            const user_claims = [
                [user1_claim_amount, ethers.utils.parseEther('15'), ethers.utils.parseEther('12')],
                [user1_claim_amount, ethers.utils.parseEther('20'), ethers.utils.parseEther('50')],
                [user1_claim_amount, ethers.utils.parseEther('0'), ethers.utils.parseEther('3')],
                [user1_claim_amount, ethers.utils.parseEther('37'), ethers.utils.parseEther('0')],
            ]

            let total2 = ethers.utils.parseEther('72')
            let total3 = ethers.utils.parseEther('65')
        
            beforeEach(async () => {
                
                tree = new BalanceTree([
                    { account: user1.address, amount: user1_claim_amount, questID: quest_id, period: period },
                    { account: user2.address, amount: user2_claim_amount, questID: quest_id, period: period },
                    { account: user3.address, amount: user3_claim_amount, questID: quest_id, period: period },
                    { account: user4.address, amount: user4_claim_amount, questID: quest_id, period: period },
                ]); 

                await distributor.connect(mockQuestBoard).addQuest(quest_id, CRV.address)

                tree2 = new BalanceTree([
                    { account: user1.address, amount: user_claims[0][1], questID: quest_id, period: next_period },
                    { account: user2.address, amount: user_claims[1][1], questID: quest_id, period: next_period },
                    { account: user4.address, amount: user_claims[3][1], questID: quest_id, period: next_period },
                ]);

                tree3 = new BalanceTree([
                    { account: user1.address, amount: user_claims[0][2], questID: quest_id, period: next_period2 },
                    { account: user2.address, amount: user_claims[1][2], questID: quest_id, period: next_period2 },
                    { account: user3.address, amount: user_claims[2][2], questID: quest_id, period: next_period2 },
                ]);

                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, period, distrib_amount)
                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, next_period, total2)
                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, next_period2, total3)

                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, period, distrib_amount, tree.getHexRoot())
                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, next_period, total2, tree2.getHexRoot())
                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, next_period2, total3, tree3.getHexRoot())

                await CRV.connect(admin).transfer(distributor.address, distrib_amount.mul(3))

            });

            it(' should should not notify the Loot Creator', async () => {

                let claim_params = [
                    { 
                        questID: quest_id,
                        period: period,
                        index: 0,
                        amount: user_claims[0][0],
                        merkleProof: tree.getProof(quest_id, period, 0, user1.address, user_claims[0][0])
                    },
                    { 
                        questID: quest_id,
                        period: next_period,
                        index: 0,
                        amount: user_claims[0][1],
                        merkleProof: tree2.getProof(quest_id, next_period, 0, user1.address, user_claims[0][1])
                    },
                    { 
                        questID: quest_id,
                        period: next_period2,
                        index: 0,
                        amount: user_claims[0][2],
                        merkleProof: tree3.getProof(quest_id, next_period2, 0, user1.address, user_claims[0][2])
                    },
                ]
    
                await distributor.connect(user1).claimQuest(user1.address, quest_id, claim_params)

                expect(await lootCreator.userQuestPeriodRewards(quest_id, period, user1.address)).to.be.eq(0)

                expect(await lootCreator.userQuestPeriodRewards(quest_id, next_period, user1.address)).to.be.eq(0)

                expect(await lootCreator.userQuestPeriodRewards(quest_id, next_period2, user1.address)).to.be.eq(0)

            });

        });

    });

});