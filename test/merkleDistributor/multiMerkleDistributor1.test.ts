const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { MultiMerkleDistributorV2 } from "../../typechain/contracts/MultiMerkleDistributorV2";
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

let tree: BalanceTree;

const WEEK = BigNumber.from(86400 * 7)

describe('MultiMerkleDistributorV2 contract tests - without Loot', () => {
    let admin: SignerWithAddress
    let mockQuestBoard: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress
    let user4: SignerWithAddress

    let signers: SignerWithAddress[]

    let distributor: MultiMerkleDistributorV2

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

        const crv_amount = ethers.utils.parseEther('50000');
        const dai_amount = ethers.utils.parseEther('100000');

        CRV = IERC20__factory.connect(TOKEN1_ADDRESS, provider);
        DAI = IERC20__factory.connect(TOKEN2_ADDRESS, provider);

        await getERC20(admin, BIG_HOLDER1, CRV, admin.address, crv_amount);

        await getERC20(admin, BIG_HOLDER2, DAI, admin.address, dai_amount);

    })

    beforeEach(async () => {

        distributor = (await distributorFactory.connect(admin).deploy(mockQuestBoard.address)) as MultiMerkleDistributorV2;
        await distributor.deployed();

    });

    it(' should be deployed & have correct parameters', async () => {
        expect(distributor.address).to.properAddress

        expect(await distributor.owner()).to.be.eq(admin.address)

        expect(await distributor.questBoard()).to.be.eq(mockQuestBoard.address)

    });

    describe('addQuest', async () => {

        const quest_id1 = BigNumber.from(1011)
        const quest_id2 = BigNumber.from(1012)

        it(' should add a new Quest with correct parameters (& emit correct event)', async () => {

            expect(await distributor.rewardTokens(CRV.address)).to.be.false

            await expect(
                distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)
            ).to.emit(distributor, "NewQuest")
            .withArgs(quest_id1, CRV.address);

            expect(await distributor.questRewardToken(quest_id1)).to.be.eq(CRV.address)

            expect(await distributor.rewardTokens(CRV.address)).to.be.true

        });

        it(' should allow to add other Quests', async () => {

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            expect(await distributor.rewardTokens(CRV.address)).to.be.true
            expect(await distributor.rewardTokens(DAI.address)).to.be.false

            await distributor.connect(mockQuestBoard).addQuest(quest_id2, DAI.address)

            expect(await distributor.questRewardToken(quest_id1)).to.be.eq(CRV.address)
            expect(await distributor.questRewardToken(quest_id2)).to.be.eq(DAI.address)

            expect(await distributor.rewardTokens(CRV.address)).to.be.true
            expect(await distributor.rewardTokens(DAI.address)).to.be.true

        });

        it(' should not allow to add the same Quest twice', async () => {

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            await expect(
                distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)
            ).to.be.revertedWith('QuestAlreadyListed')

        });

        it(' should fail is reward token is incorrect', async () => {

            await expect(
                distributor.connect(mockQuestBoard).addQuest(quest_id1, ethers.constants.AddressZero)
            ).to.be.revertedWith('TokenNotWhitelisted')

        });

        it(' should only be callable by the QuestBoard', async () => {

            await expect(
                distributor.connect(admin).addQuest(quest_id1, CRV.address)
            ).to.be.revertedWith('CallerNotAllowed')

            await expect(
                distributor.connect(user1).addQuest(quest_id1, CRV.address)
            ).to.be.revertedWith('CallerNotAllowed')

            await expect(
                distributor.connect(user2).addQuest(quest_id1, CRV.address)
            ).to.be.revertedWith('CallerNotAllowed')

        });

    });

    describe('addQuestPeriod', async () => {

        const quest_id1 = BigNumber.from(1011)
        const quest_id2 = BigNumber.from(1012)

        const period = BigNumber.from(1639612800)
        const period2 = BigNumber.from(1640217600)

        // totalRewards for quest 1 is distrib_amount
        const totalRewards2 = ethers.utils.parseEther('350')

        it(' should add a new period with correct parameters', async () => {

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(distrib_amount)

        });

        it(' should allow to add other period for the same Quest', async () => {

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(distrib_amount)
            expect(await distributor.questRewardsPerPeriod(quest_id1, period2)).to.be.eq(0)

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period2, totalRewards2)

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(distrib_amount)
            expect(await distributor.questRewardsPerPeriod(quest_id1, period2)).to.be.eq(totalRewards2)

        });

        it(' should allow to add period for other Quests', async () => {

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            await distributor.connect(mockQuestBoard).addQuest(quest_id2, DAI.address)

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(distrib_amount)
            expect(await distributor.questRewardsPerPeriod(quest_id2, period)).to.be.eq(0)

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id2, period, totalRewards2)

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(distrib_amount)
            expect(await distributor.questRewardsPerPeriod(quest_id2, period)).to.be.eq(totalRewards2)

        });

        it(' should not allow to add the same period twice', async () => {

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)

            await expect(
                distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)
            ).to.be.revertedWith('PeriodAlreadyUpdated')

        });

        it(' should fail if Quest not listed', async () => {

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            await expect(
                distributor.connect(mockQuestBoard).addQuestPeriod(quest_id2, period, totalRewards2)
            ).to.be.revertedWith('QuestNotListed')

        });

        it(' should fail if reward amount is 0', async () => {

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            await expect(
                distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, 0)
            ).to.be.revertedWith('NullAmount')

        });

        it(' should only be callable by the QuestBoard', async () => {

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            await expect(
                distributor.connect(admin).addQuestPeriod(quest_id1, period, distrib_amount)
            ).to.be.revertedWith('CallerNotAllowed')

            await expect(
                distributor.connect(user1).addQuestPeriod(quest_id1, period, distrib_amount)
            ).to.be.revertedWith('CallerNotAllowed')

            await expect(
                distributor.connect(user2).addQuestPeriod(quest_id1, period, distrib_amount)
            ).to.be.revertedWith('CallerNotAllowed')

        });

    });

    describe('updateQuestPeriod', async () => {

        const quest_id1 = BigNumber.from(1011)
        const quest_id2 = BigNumber.from(1012)

        const period = BigNumber.from(1639612800)
        const period2 = BigNumber.from(1640217600)

        let tree_root: string

        const totalRewards2 = ethers.utils.parseEther('350')

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

        it(' should update the given period and set the Merkle Root (& emit the correct Event)', async () => {

            await expect(
                distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)
            ).to.emit(distributor, "QuestPeriodUpdated")
            .withArgs(quest_id1, period, tree_root);

            expect(await distributor.questMerkleRootPerPeriod(quest_id1, period)).to.be.eq(tree_root)

            expect(await distributor.questClosedPeriods(quest_id1, 0)).to.be.eq(period)

        });

        it(' should not allow to update the same period twice', async () => {

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)

            await expect(
                distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)
            ).to.be.revertedWith('PeriodAlreadyUpdated')

        });

        it(' should fail if Quest is not listed', async () => {

            await expect(
                distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id2, period, distrib_amount, tree_root)
            ).to.be.revertedWith('QuestNotListed')

        });

        it(' should fail if period is not added', async () => {

            await expect(
                distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period2, distrib_amount, tree_root)
            ).to.be.revertedWith('PeriodNotListed')

        });

        it(' should fail if incorrect totalRewardAmount', async () => {

            await expect(
                distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, totalRewards2, tree_root)
            ).to.be.revertedWith('IncorrectRewardAmount')

        });

        it(' should fail if empty MerkleRoot', async () => {

            await expect(
                distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, "0x0000000000000000000000000000000000000000000000000000000000000000")
            ).to.be.revertedWith('EmptyMerkleRoot')

        });

        it(' should fail if an incorrect period is given', async () => {

            await expect(
                distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, 0, distrib_amount, tree_root)
            ).to.be.revertedWith('IncorrectPeriod')

        });

        it(' should allow to update multiple periods for the same Quest', async () => {

            let next_period = period.add(WEEK).div(WEEK).mul(WEEK)

            let tree2 = new BalanceTree([
                { account: user1.address, amount: user1_claim_amount, questID: quest_id1, period: next_period },
                { account: user2.address, amount: user2_claim_amount, questID: quest_id1, period: next_period },
                { account: user3.address, amount: user3_claim_amount, questID: quest_id1, period: next_period },
            ]);

            let tree3 = new BalanceTree([
                { account: user1.address, amount: user1_claim_amount, questID: quest_id1, period: next_period },
                { account: user3.address, amount: user3_claim_amount, questID: quest_id1, period: next_period },
                { account: user4.address, amount: user4_claim_amount, questID: quest_id1, period: next_period },
            ]);

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, next_period, distrib_amount)

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)

            expect(await distributor.questMerkleRootPerPeriod(quest_id1, period)).to.be.eq(tree_root)

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, next_period, distrib_amount, tree2.getHexRoot())

            expect(await distributor.questMerkleRootPerPeriod(quest_id1, next_period)).to.be.eq(tree2.getHexRoot())

            next_period = next_period.add(WEEK).div(WEEK).mul(WEEK)

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, next_period, distrib_amount)

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, next_period, distrib_amount, tree3.getHexRoot())

            expect(await distributor.questMerkleRootPerPeriod(quest_id1, next_period)).to.be.eq(tree3.getHexRoot())

            const closed_periods = await distributor.getClosedPeriodsByQuests(quest_id1)

            expect(closed_periods[0]).to.be.eq(period)
            expect(closed_periods[2]).to.be.eq(next_period)

        });

        it(' should only be callable by allowed managers', async () => {

            await expect(
                distributor.connect(user1).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)
            ).to.be.revertedWith('CallerNotAllowed')

            await expect(
                distributor.connect(user2).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)
            ).to.be.revertedWith('CallerNotAllowed')

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

            it(' should claim correctly', async () => {
    
                expect(await distributor.isClaimed(quest_id, period, 0)).to.be.false
    
                let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                let old_balance = await CRV.balanceOf(user1.address)
    
                await expect(
                    distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof)
                ).to.emit(distributor, "Claimed")
                    .withArgs(quest_id, period, 0, user1_claim_amount, CRV.address, user1.address);
    
                let new_balance = await CRV.balanceOf(user1.address)
    
                expect(new_balance.sub(old_balance)).to.be.eq(user1_claim_amount)
    
                expect(await distributor.isClaimed(quest_id, period, 0)).to.be.true

                expect(await distributor.questRewardsPerPeriod(quest_id, period)).to.be.eq(distrib_amount.sub(user1_claim_amount))
    
            });
    
            it(' should not allow double claim', async () => {
    
                expect(await distributor.isClaimed(quest_id, period, 0)).to.be.false
    
                let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                await distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof)
    
                await expect(
                    distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof)
                ).to.be.revertedWith('AlreadyClaimed')
    
            });
    
            it(' should not allow to claim on non updated period', async () => {
    
                let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                let next_period = period.add(WEEK).div(WEEK).mul(WEEK)
    
                await expect(
                    distributor.connect(user1).claim(quest_id, next_period, 0, user1.address, user1_claim_amount, proof)
                ).to.be.revertedWith('MerkleRootNotUpdated')
    
            });
    
            it(' should fail if proof is incorrect', async () => {
    
                let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                //empty proof
                await expect(
                    distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, [])
                ).to.be.revertedWith('InvalidProof')
    
                //wrong proof
                await expect(
                    distributor.connect(user1).claim(
                        quest_id,
                        period,
                        0,
                        user1.address,
                        user1_claim_amount,
                        tree.getProof(quest_id, period, 2, user3.address, user3_claim_amount)
                    )
                ).to.be.revertedWith('InvalidProof')
    
                //incorrect index
                await expect(
                    distributor.connect(user1).claim(quest_id, period, 1, user1.address, user1_claim_amount, proof)
                ).to.be.revertedWith('InvalidProof')
    
            });
    
            it(' should fail if amount is incorrect', async () => {
    
                let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                await expect(
                    distributor.connect(user1).claim(quest_id, period, 0, user1.address, user3_claim_amount, proof)
                ).to.be.revertedWith('InvalidProof')
    
            });
    
            it(' should fail if claimer address is incorrect', async () => {
    
                let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                await expect(
                    distributor.connect(user2).claim(quest_id, period, 0, user2.address, user1_claim_amount, proof)
                ).to.be.revertedWith('InvalidProof')
    
            });
    
            it(' should fail if giving address 0', async () => {
    
                let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                await expect(
                    distributor.connect(user2).claim(quest_id, period, 0, ethers.constants.AddressZero, user1_claim_amount, proof)
                ).to.be.revertedWith('AddressZero')
    
            });
    
            it(' should fail if questID is incorrect', async () => {
    
                let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                await expect(
                    distributor.connect(user1).claim(quest_id2, period2, 0, user1.address, user1_claim_amount, proof)
                ).to.be.revertedWith('InvalidProof')
    
            });
    
            it(' should fail if period is incorrect', async () => {
    
                let proof = tree.getProof(quest_id, period, 0, user1.address, user1_claim_amount);
    
                await expect(
                    distributor.connect(user1).claim(quest_id2, period2, 0, user1.address, user1_claim_amount, proof)
                ).to.be.revertedWith('InvalidProof')
    
            });
    
            it(' should not allow double claims: 0 then 1', async () => {
    
                let proof_1 = tree.getProof(quest_id, period,0, user1.address, user1_claim_amount);
                let proof_2 = tree.getProof(quest_id, period,1, user2.address, user2_claim_amount);
    
                await distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof_1)
    
                await distributor.connect(user2).claim(quest_id, period, 1, user2.address, user2_claim_amount, proof_2)

                expect(await distributor.questRewardsPerPeriod(quest_id, period)).to.be.eq(distrib_amount.sub(user1_claim_amount.add(user2_claim_amount)))
    
                await expect(
                    distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof_1)
                ).to.be.revertedWith('AlreadyClaimed')
    
            });
    
            it(' should not allow double claims: 1 then 0', async () => {
    
                let proof_1 = tree.getProof(quest_id, period,0, user1.address, user1_claim_amount);
                let proof_2 = tree.getProof(quest_id, period,1, user2.address, user2_claim_amount);
    
                await distributor.connect(user2).claim(quest_id, period, 1, user2.address, user2_claim_amount, proof_2)
    
                await distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof_1)

                expect(await distributor.questRewardsPerPeriod(quest_id, period)).to.be.eq(distrib_amount.sub(user1_claim_amount.add(user2_claim_amount)))
    
                await expect(
                    distributor.connect(user2).claim(quest_id, period, 1, user2.address, user2_claim_amount, proof_2)
                ).to.be.revertedWith('AlreadyClaimed')
    
            });
    
            it(' should not allow double claims: 0 then 2', async () => {
    
                let proof_1 = tree.getProof(quest_id, period,0, user1.address, user1_claim_amount);
                let proof_3 = tree.getProof(quest_id, period,2, user3.address, user3_claim_amount);
    
                await distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof_1)
    
                await distributor.connect(user3).claim(quest_id, period, 2, user3.address, user3_claim_amount, proof_3)
    
                await expect(
                    distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof_1)
                ).to.be.revertedWith('AlreadyClaimed')
    
            });
    
            it(' should not allow double claims: 2 then 0', async () => {
    
                let proof_1 = tree.getProof(quest_id, period,0, user1.address, user1_claim_amount);
                let proof_3 = tree.getProof(quest_id, period,2, user3.address, user3_claim_amount);
    
                await distributor.connect(user3).claim(quest_id, period, 2, user3.address, user3_claim_amount, proof_3)
    
                await distributor.connect(user1).claim(quest_id, period, 0, user1.address, user1_claim_amount, proof_1)
    
                await expect(
                    distributor.connect(user3).claim(quest_id, period, 2, user3.address, user3_claim_amount, proof_3)
                ).to.be.revertedWith('AlreadyClaimed')
    
            });
    
        });


        describe('claim - larger tree', async () => {
    
            let new_tree: BalanceTree;
    
            let total_claim = 0;

            const quest_id = BigNumber.from(1011)

            const period = BigNumber.from(1639612800)
    
            beforeEach(async () => {
    
                new_tree = new BalanceTree(
                    signers.map((s, i) => {
                        total_claim += i + 1
    
                        return { account: s.address, amount: BigNumber.from(i + 1), questID: quest_id, period: period };
                    })
                );

                await distributor.connect(mockQuestBoard).addQuest(quest_id, CRV.address)

                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, period, total_claim)

                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, period, total_claim, new_tree.getHexRoot())

                await CRV.connect(admin).transfer(distributor.address, total_claim)
    
            });
    
            it(' claim index 0', async () => {
    
                const index = 0
    
                const claim_amount = BigNumber.from(index + 1)
    
                let proof = new_tree.getProof(quest_id, period, index, signers[index].address, claim_amount);
    
                let old_balance = await CRV.balanceOf(signers[index].address)
    
                await expect(
                    distributor.connect(signers[index]).claim(quest_id, period, index, signers[index].address, claim_amount, proof)
                ).to.emit(distributor, "Claimed")
                    .withArgs(quest_id, period, index, claim_amount, CRV.address, signers[index].address);
    
                let new_balance = await CRV.balanceOf(signers[index].address)
    
                expect(new_balance.sub(old_balance)).to.be.eq(claim_amount)
    
                expect(await distributor.isClaimed(quest_id, period, index)).to.be.true

                expect(await distributor.questRewardsPerPeriod(quest_id, period)).to.be.eq(total_claim - claim_amount.toNumber())
    
                await expect(
                    distributor.connect(signers[index]).claim(quest_id, period, index, signers[index].address, claim_amount, proof)
                ).to.be.revertedWith('AlreadyClaimed')
    
            });
    
            it(' claim index 5', async () => {
    
                const index = 5
    
                const claim_amount = BigNumber.from(index + 1)
    
                let proof = new_tree.getProof(quest_id, period, index, signers[index].address, claim_amount);
    
                let old_balance = await CRV.balanceOf(signers[index].address)
    
                await expect(
                    distributor.connect(signers[index]).claim(quest_id, period, index, signers[index].address, claim_amount, proof)
                ).to.emit(distributor, "Claimed")
                    .withArgs(quest_id, period, index, claim_amount, CRV.address, signers[index].address);
    
                let new_balance = await CRV.balanceOf(signers[index].address)
    
                expect(new_balance.sub(old_balance)).to.be.eq(claim_amount)
    
                expect(await distributor.isClaimed(quest_id, period, index)).to.be.true

                expect(await distributor.questRewardsPerPeriod(quest_id, period)).to.be.eq(total_claim - claim_amount.toNumber())
    
                await expect(
                    distributor.connect(signers[index]).claim(quest_id, period, index, signers[index].address, claim_amount, proof)
                ).to.be.revertedWith('AlreadyClaimed')
    
            });
    
            it(' claim index 15', async () => {
    
                const index = 15
    
                const claim_amount = BigNumber.from(index + 1)
    
                let proof = new_tree.getProof(quest_id, period, index, signers[index].address, claim_amount);
    
                let old_balance = await CRV.balanceOf(signers[index].address)
    
                await expect(
                    distributor.connect(signers[index]).claim(quest_id, period, index, signers[index].address, claim_amount, proof)
                ).to.emit(distributor, "Claimed")
                    .withArgs(quest_id, period, index, claim_amount, CRV.address, signers[index].address);
    
                let new_balance = await CRV.balanceOf(signers[index].address)
    
                expect(new_balance.sub(old_balance)).to.be.eq(claim_amount)
    
                expect(await distributor.isClaimed(quest_id, period, index)).to.be.true

                expect(await distributor.questRewardsPerPeriod(quest_id, period)).to.be.eq(total_claim - claim_amount.toNumber())
    
                await expect(
                    distributor.connect(signers[index]).claim(quest_id, period, index, signers[index].address, claim_amount, proof)
                ).to.be.revertedWith('AlreadyClaimed')
    
            });
    
        });
    
    
        describe('claim - tree 10 000 users', async () => {

            const quest_id = BigNumber.from(1011)

            const period = BigNumber.from(1639612800)
    
            let new_tree: BalanceTree;
            const nb_leaves = 10000;
            const nb_tests = 25;
            const user_claims: { account: string, amount: BigNumber, questID: BigNumber, period: BigNumber }[] = [];
    
            const claim_amount = BigNumber.from(50)
    
            const getRandomIndex = (nb_leaves: number, nb_tests: number) => {
                return Math.floor(Math.random() * (nb_leaves / nb_tests))
            }
    
            beforeEach(async () => {
    
                for (let i = 0; i < nb_leaves; i++) {
                    const n = { account: user1.address, amount: claim_amount, questID: quest_id, period: period };
                    user_claims.push(n);
                }
    
                new_tree = new BalanceTree(user_claims);

                await distributor.connect(mockQuestBoard).addQuest(quest_id, CRV.address)

                let total_claim = claim_amount.mul(nb_leaves)

                await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, period, total_claim)

                await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, period, total_claim, new_tree.getHexRoot())

                await CRV.connect(admin).transfer(distributor.address, claim_amount.mul(nb_leaves))
    
            });
    
            it(' check proof verification works', async () => {
    
                const root = Buffer.from(new_tree.getHexRoot().slice(2), "hex");
    
                for (let index = 0; index < nb_leaves; index += nb_leaves / nb_tests) {
    
                    let proof = new_tree
                        .getProof(quest_id, period, index, user1.address, claim_amount)
                        .map((el) => Buffer.from(el.slice(2), "hex"));
    
                    let validProof = BalanceTree.verifyProof(
                        quest_id,
                        period, 
                        index,
                        user1.address,
                        claim_amount,
                        proof,
                        root
                    );
    
                    expect(validProof).to.be.true;
                }
    
            });
    
            it(' should not allow double claims', async () => {
    
                for (let index = 0; index < nb_tests; index += getRandomIndex(nb_leaves, nb_tests)) {
                    let proof = new_tree.getProof(quest_id, period, index, user1.address, claim_amount);
    
                    let old_balance = await CRV.balanceOf(user1.address)

                    const claim_tx = await distributor.connect(user1).claim(quest_id, period, index, user1.address, claim_amount, proof)
    
                    await expect(
                        claim_tx
                    ).to.emit(distributor, "Claimed")
                        .withArgs(quest_id, period, index, claim_amount, CRV.address, user1.address);
    
                    let new_balance = await CRV.balanceOf(user1.address)
    
                    expect(new_balance.sub(old_balance)).to.be.eq(claim_amount)
    
                    await expect(
                        distributor.connect(user1).claim(quest_id, period, index, user1.address, claim_amount, proof)
                    ).to.be.revertedWith('AlreadyClaimed')
                }
    
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

        it(' should claim for 2 different Quests', async () => {

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

            expect(await distributor.isClaimed(quest_id1, period, 0)).to.be.true
            expect(await distributor.isClaimed(quest_id2, period, 0)).to.be.true

            expect(await distributor.isClaimed(quest_id3, next_period, 0)).to.be.false
            expect(await distributor.isClaimed(quest_id1, period, 1)).to.be.false

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(distrib_amount.sub(user_claims[0][0]))
            expect(await distributor.questRewardsPerPeriod(quest_id2, period)).to.be.eq(total2.sub(user_claims[0][1]))

        });

        it(' should claim from different periods from same Quest', async () => {

            let tree4 = new BalanceTree([
                { account: user1.address, amount: ethers.utils.parseEther('20'), questID: quest_id2, period: next_period },
                { account: user2.address, amount: ethers.utils.parseEther('4'), questID: quest_id2, period: next_period },
                { account: user4.address, amount: ethers.utils.parseEther('15'), questID: quest_id2, period: next_period },
            ]);

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id2, next_period, ethers.utils.parseEther('39'))

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id2, next_period, ethers.utils.parseEther('39'), tree4.getHexRoot())

            let claim_params = [
                { 
                    questID: quest_id2,
                    period: period,
                    index: 2,
                    amount: user_claims[3][1],
                    merkleProof: tree2.getProof(quest_id2, period, 2, user4.address, user_claims[3][1])
                },
                { 
                    questID: quest_id2,
                    period: next_period,
                    index: 2,
                    amount: ethers.utils.parseEther('15'),
                    merkleProof: tree4.getProof(quest_id2, next_period, 2, user4.address, ethers.utils.parseEther('15'))
                }
            ]


            await distributor.connect(user4).multiClaim(user4.address, claim_params)

            expect(await distributor.isClaimed(quest_id2, period, 2)).to.be.true
            expect(await distributor.isClaimed(quest_id2, next_period, 2)).to.be.true

            expect(await distributor.isClaimed(quest_id1, period, 1)).to.be.false
            expect(await distributor.isClaimed(quest_id1, period, 0)).to.be.false

            expect(await distributor.questRewardsPerPeriod(quest_id2, period)).to.be.eq(total2.sub(user_claims[3][1]))
            expect(await distributor.questRewardsPerPeriod(quest_id2, next_period)).to.be.eq(ethers.utils.parseEther('24'))

        });

        it(' should claim from different periods from different Quests', async () => {

            let claim_params = [
                { 
                    questID: quest_id2,
                    period: period,
                    index: 1,
                    amount: user_claims[1][1],
                    merkleProof: tree2.getProof(quest_id2, period, 1, user2.address, user_claims[1][1])
                },
                { 
                    questID: quest_id3,
                    period: next_period,
                    index: 1,
                    amount: user_claims[1][2],
                    merkleProof: tree3.getProof(quest_id3, next_period, 1, user2.address, user_claims[1][2])
                }
            ]


            await distributor.connect(user2).multiClaim(user2.address, claim_params)

            expect(await distributor.isClaimed(quest_id2, period, 1)).to.be.true
            expect(await distributor.isClaimed(quest_id3, next_period, 1)).to.be.true

            expect(await distributor.isClaimed(quest_id1, period, 1)).to.be.false
            expect(await distributor.isClaimed(quest_id1, period, 0)).to.be.false

            expect(await distributor.questRewardsPerPeriod(quest_id2, period)).to.be.eq(total2.sub(user_claims[1][1]))
            expect(await distributor.questRewardsPerPeriod(quest_id3, next_period)).to.be.eq(total3.sub(user_claims[1][2]))

        });

        it(' should fail if empty claimParams', async () => {

            await expect(
                distributor.connect(user1).multiClaim(user1.address, [])
            ).to.be.revertedWith("EmptyParameters")

        });
    
        it(' should fail if giving address 0', async () => {

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

            await expect(
                distributor.connect(user1).multiClaim(ethers.constants.AddressZero, claim_params)
            ).to.be.revertedWith('AddressZero')

        });

    });

    describe('claimQuest', async () => {

        const quest_id = BigNumber.from(1011)
        const quest_id2 = BigNumber.from(1022)
    
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
            await distributor.connect(mockQuestBoard).addQuest(quest_id2, DAI.address)

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
            
            tree4 = new BalanceTree([
                { account: user1.address, amount: user1_claim_amount, questID: quest_id2, period: period },
                { account: user2.address, amount: user2_claim_amount, questID: quest_id2, period: period },
                { account: user3.address, amount: user3_claim_amount, questID: quest_id2, period: period },
                { account: user4.address, amount: user4_claim_amount, questID: quest_id2, period: period },
            ]); 

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, period, distrib_amount)
            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, next_period, total2)
            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id, next_period2, total3)

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, period, distrib_amount, tree.getHexRoot())
            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, next_period, total2, tree2.getHexRoot())
            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id, next_period2, total3, tree3.getHexRoot())

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id2, period, distrib_amount)

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id2, period, distrib_amount, tree4.getHexRoot())

            await CRV.connect(admin).transfer(distributor.address, distrib_amount.mul(3))
            await DAI.connect(admin).transfer(distributor.address, distrib_amount)

        });

        it(' should claim for all periods of the Quest', async () => {

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

            const claim_tx = await distributor.connect(user1).claimQuest(user1.address, quest_id, claim_params)

            expect(await distributor.isClaimed(quest_id, period, 0)).to.be.true
            expect(await distributor.isClaimed(quest_id, next_period, 0)).to.be.true
            expect(await distributor.isClaimed(quest_id, next_period2, 0)).to.be.true

            expect(await distributor.isClaimed(quest_id2, period, 0)).to.be.false

            expect(await distributor.questRewardsPerPeriod(quest_id, period)).to.be.eq(distrib_amount.sub(user_claims[0][0]))
            expect(await distributor.questRewardsPerPeriod(quest_id, next_period)).to.be.eq(total2.sub(user_claims[0][1]))
            expect(await distributor.questRewardsPerPeriod(quest_id, next_period2)).to.be.eq(total3.sub(user_claims[0][2]))

            // Check that the tx only has 1 transfer with the total claim amount
            const total_claim_amount = user_claims[0][0].add(user_claims[0][1]).add(user_claims[0][2])
            await expect(
                claim_tx
            ).to.emit(CRV, "Transfer")
            .withArgs(distributor.address, user1.address, total_claim_amount);

        });

        it(' should skip the 2nd period and claim for other periods', async () => {

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
                    period: next_period2,
                    index: 0,
                    amount: user_claims[0][2],
                    merkleProof: tree3.getProof(quest_id, next_period2, 0, user1.address, user_claims[0][2])
                },
            ]

            const previous_remaining_rewards2 = await distributor.questRewardsPerPeriod(quest_id, next_period)

            const claim_tx = await distributor.connect(user1).claimQuest(user1.address, quest_id, claim_params)

            expect(await distributor.isClaimed(quest_id, period, 0)).to.be.true
            expect(await distributor.isClaimed(quest_id, next_period2, 0)).to.be.true

            expect(await distributor.isClaimed(quest_id, next_period, 0)).to.be.false
            expect(await distributor.isClaimed(quest_id2, period, 0)).to.be.false

            expect(await distributor.questRewardsPerPeriod(quest_id, period)).to.be.eq(distrib_amount.sub(user_claims[0][0]))
            expect(await distributor.questRewardsPerPeriod(quest_id, next_period)).to.be.eq(previous_remaining_rewards2)
            expect(await distributor.questRewardsPerPeriod(quest_id, next_period2)).to.be.eq(total3.sub(user_claims[0][2]))

            // Check that the tx only has 1 transfer with the total claim amount
            const total_claim_amount = user_claims[0][0].add(user_claims[0][2])
            await expect(
                claim_tx
            ).to.emit(CRV, "Transfer")
            .withArgs(distributor.address, user1.address, total_claim_amount);

        });

        it(' should fail if the questId is not the same', async () => {

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

            await expect(
                distributor.connect(user1).claimQuest(user1.address, quest_id2, claim_params)
            ).to.be.revertedWith("IncorrectQuestID")

        });

        it(' should fail if a given period is not updated yet', async () => {

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
                    period: next_period.add(WEEK.mul(2)).div(WEEK).mul(WEEK),
                    index: 0,
                    amount: user_claims[0][2],
                    merkleProof: tree3.getProof(quest_id, next_period2, 0, user1.address, user_claims[0][2])
                },
            ]

            await expect(
                distributor.connect(user1).claimQuest(user1.address, quest_id, claim_params)
            ).to.be.revertedWith("MerkleRootNotUpdated")

        });

        it(' should fail if one of the period was already claimed', async () => {

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

            await distributor.connect(user1).claim(quest_id, next_period, 0, user1.address, user_claims[0][1], tree2.getProof(quest_id, next_period, 0, user1.address, user_claims[0][1]))

            await expect(
                distributor.connect(user1).claimQuest(user1.address, quest_id, claim_params)
            ).to.be.revertedWith("AlreadyClaimed")

        });

        it(' should fail if empty claimParams', async () => {

            await expect(
                distributor.connect(user1).claimQuest(user1.address, quest_id, [])
            ).to.be.revertedWith("EmptyParameters")

        });
    
        it(' should fail if giving address 0', async () => {

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
                    period: next_period2,
                    index: 0,
                    amount: user_claims[0][2],
                    merkleProof: tree3.getProof(quest_id, next_period2, 0, user1.address, user_claims[0][2])
                },
            ]

            await expect(
                distributor.connect(user1).claimQuest(ethers.constants.AddressZero, quest_id, claim_params)
            ).to.be.revertedWith('AddressZero')

        });

        it(' should fail if invalid proof is given', async () => {

            let wrong_claim_params1 = [
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
                    merkleProof: tree2.getProof(quest_id, next_period, 1, user2.address, user_claims[1][1])
                },
                { 
                    questID: quest_id,
                    period: next_period2,
                    index: 0,
                    amount: user_claims[0][2],
                    merkleProof: tree3.getProof(quest_id, next_period2, 0, user1.address, user_claims[0][2])
                },
            ]

            let wrong_claim_params2 = [
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
                    index: 1,
                    amount: user_claims[1][1],
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

            await expect(
                distributor.connect(user1).claimQuest(user1.address, quest_id, wrong_claim_params1)
            ).to.be.revertedWith("InvalidProof")

            await expect(
                distributor.connect(user1).claimQuest(user1.address, quest_id, wrong_claim_params2)
            ).to.be.revertedWith("InvalidProof")

        });

    });

    describe('fixQuestPeriod', async () => {

        const quest_id1 = BigNumber.from(1011)
        const quest_id2 = BigNumber.from(1012)

        const period = BigNumber.from(1639612800)

        let tree_root: string

        const new_totalRewards = ethers.utils.parseEther('150')
        const new_totalRewards2 = ethers.utils.parseEther('75')

        beforeEach(async () => {

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)

            await CRV.connect(admin).transfer(distributor.address, distrib_amount)

        });

        it(' should update the total reward amount correctly', async () => {

            await distributor.connect(mockQuestBoard).fixQuestPeriod(quest_id1, period, new_totalRewards)

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(new_totalRewards)

        });

        it(' should return the reward tokens if previous totalRewards were higher', async () => {

            const fix_tx = await distributor.connect(mockQuestBoard).fixQuestPeriod(quest_id1, period, new_totalRewards2)

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(new_totalRewards2)

            const reward_diff = distrib_amount.sub(new_totalRewards2)

            await expect(
                fix_tx
            ).to.emit(CRV, "Transfer")
                .withArgs(distributor.address, mockQuestBoard.address, reward_diff);

        });

        it(' should return all rewards if given 0', async () => {

            const fix_tx = await distributor.connect(mockQuestBoard).fixQuestPeriod(quest_id1, period, 0)

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(0)

            await expect(
                fix_tx
            ).to.emit(CRV, "Transfer")
                .withArgs(distributor.address, mockQuestBoard.address, distrib_amount);

        });

        it(' should fail if given incorrect QuestID or Period', async () => {

            await expect(
                distributor.connect(mockQuestBoard).fixQuestPeriod(quest_id2, period, new_totalRewards)
            ).to.be.revertedWith('QuestNotListed')

            await expect(
                distributor.connect(mockQuestBoard).fixQuestPeriod(quest_id1, 0, new_totalRewards)
            ).to.be.revertedWith('IncorrectPeriod')

        });

        it(' should fail if period is not listed yet', async () => {

            await expect(
                distributor.connect(mockQuestBoard).fixQuestPeriod(quest_id1, period.add(WEEK), new_totalRewards)
            ).to.be.revertedWith('PeriodNotListed')

        });

        it(' should only be callable by the QuestBoard', async () => {

            await expect(
                distributor.connect(admin).fixQuestPeriod(quest_id1, period, new_totalRewards)
            ).to.be.revertedWith('CallerNotAllowed')

            await expect(
                distributor.connect(user2).fixQuestPeriod(quest_id1, period, new_totalRewards)
            ).to.be.revertedWith('CallerNotAllowed')

        });

    });

    describe('emergencyUpdateQuestPeriod', async () => {

        let new_tree: BalanceTree;

        const quest_id1 = BigNumber.from(1011)
        const quest_id2 = BigNumber.from(1012)

        const period = BigNumber.from(1639612800)

        let tree_root: string
        let new_tree_root: string

        beforeEach(async () => {

            tree = new BalanceTree([
                { account: user1.address, amount: user1_claim_amount, questID: quest_id1, period: period },
                { account: user2.address, amount: user2_claim_amount, questID: quest_id1, period: period },
                { account: user3.address, amount: user3_claim_amount, questID: quest_id1, period: period },
                { account: user4.address, amount: user4_claim_amount, questID: quest_id1, period: period },
            ]); 

            await distributor.connect(mockQuestBoard).addQuest(quest_id1, CRV.address)

            new_tree = new BalanceTree([
                { account: user1.address, amount: user1_claim_amount, questID: quest_id1, period: period },
                { account: user2.address, amount: user2_claim_amount, questID: quest_id1, period: period },
                { account: user3.address, amount: user3_claim_amount, questID: quest_id1, period: period }
            ]);

            tree_root = tree.getHexRoot()   
            new_tree_root = new_tree.getHexRoot()

            await distributor.connect(mockQuestBoard).addQuestPeriod(quest_id1, period, distrib_amount)

        });

        it(' should replace the root for the given QuestID & period', async () => {

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)

            expect(await distributor.questMerkleRootPerPeriod(quest_id1, period)).to.be.eq(tree_root)

            expect(await distributor.questClosedPeriods(quest_id1, 0)).to.be.eq(period)

            const previous_rewardAmount = await distributor.questRewardsPerPeriod(quest_id1, period)

            await expect(
                distributor.connect(admin).emergencyUpdateQuestPeriod(quest_id1, period, 0, new_tree_root)
            ).to.emit(distributor, "QuestPeriodUpdated")
            .withArgs(quest_id1, period, new_tree_root);

            expect(await distributor.questMerkleRootPerPeriod(quest_id1, period)).to.be.eq(new_tree_root)

            expect(await distributor.questClosedPeriods(quest_id1, 0)).to.be.eq(period)

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(previous_rewardAmount)

        });


        it(' should add new reward amount for the period', async () => {

            const addedRewardAmount = ethers.utils.parseEther('7')

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)

            const previous_rewardAmount = await distributor.questRewardsPerPeriod(quest_id1, period)

            await distributor.connect(admin).emergencyUpdateQuestPeriod(quest_id1, period, addedRewardAmount, new_tree_root)

            expect(await distributor.questMerkleRootPerPeriod(quest_id1, period)).to.be.eq(new_tree_root)

            expect(await distributor.questRewardsPerPeriod(quest_id1, period)).to.be.eq(previous_rewardAmount.add(addedRewardAmount))

        });


        it(' should fail if Quest not listed', async () => {

            await expect(
                distributor.connect(admin).emergencyUpdateQuestPeriod(quest_id2, period, 0, new_tree_root)
            ).to.be.revertedWith('QuestNotListed')

        });


        it(' should fail if Quest period was not closed', async () => {

            await expect(
                distributor.connect(admin).emergencyUpdateQuestPeriod(quest_id1, period, 0, new_tree_root)
            ).to.be.revertedWith('PeriodNotClosed')

        });


        it(' should fail if given an incorrect period', async () => {

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)

            await expect(
                distributor.connect(admin).emergencyUpdateQuestPeriod(quest_id1, 0, 0, new_tree_root)
            ).to.be.revertedWith('IncorrectPeriod')

        });


        it(' should fail if given an empty root', async () => {

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)

            await expect(
                distributor.connect(admin).emergencyUpdateQuestPeriod(quest_id1, period, 0, "0x0000000000000000000000000000000000000000000000000000000000000000")
            ).to.be.revertedWith('EmptyMerkleRoot')

        });


        it(' should block non-admin caller', async () => {

            await distributor.connect(mockQuestBoard).updateQuestPeriod(quest_id1, period, distrib_amount, tree_root)

            await expect(
                distributor.connect(user2).emergencyUpdateQuestPeriod(quest_id1, period, 0, new_tree_root)
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + user2.address + '")')

        });

    });

    describe('recoverERC20', async () => {

        const lost_amount = ethers.utils.parseEther('1000');

        beforeEach(async () => {


            await DAI.connect(admin).transfer(distributor.address, lost_amount)

        });


        it(' should retrieve the lost tokens and send it to the admin', async () => {

            const oldBalance = await DAI.balanceOf(admin.address);

            await distributor.connect(admin).recoverERC20(DAI.address)

            const newBalance = await DAI.balanceOf(admin.address);

            expect(newBalance.sub(oldBalance)).to.be.eq(lost_amount)

        });

        it(' should fail if trying to recover a reward token', async () => {

            await distributor.connect(mockQuestBoard).addQuest(12, DAI.address)

            await expect(
                distributor.connect(admin).recoverERC20(DAI.address)
            ).to.be.revertedWith('CannotRecoverToken')

        });

        it(' should block non-admin caller', async () => {

            await expect(
                distributor.connect(user2).recoverERC20(DAI.address)
            ).to.be.revertedWith('OwnableUnauthorizedAccount("' + user2.address + '")')

        });

    });

});