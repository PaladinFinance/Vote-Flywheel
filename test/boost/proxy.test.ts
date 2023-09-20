const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { DelegationProxy } from "../../typechain/boost/DelegationProxy.vy/DelegationProxy";
import { MockBoost } from "../../typechain/test/MockBoost";
import { MockVotingEscrow } from "../../typechain/test/MockVotingEscrow";
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

let proxyFactory: ContractFactory
let boostFactory: ContractFactory
let escrowFactory: ContractFactory

describe('Delegation Proxy contract tests', () => {
    let admin: SignerWithAddress
    let emergencyAdmin: SignerWithAddress

    let proxy: DelegationProxy

    let user: SignerWithAddress
    let otherUser: SignerWithAddress
    
    let new_admin: SignerWithAddress
    let new_emergencyAdmin: SignerWithAddress

    let escrow: MockVotingEscrow

    let boost: MockBoost

    before(async () => {
        await resetFork();

        [admin, emergencyAdmin, user, otherUser, new_admin, new_emergencyAdmin] = await ethers.getSigners();

        proxyFactory = await ethers.getContractFactory("DelegationProxy");
        escrowFactory = await ethers.getContractFactory("MockVotingEscrow");
        boostFactory = await ethers.getContractFactory("MockBoost");

    })

    beforeEach(async () => {

        escrow = (await escrowFactory.connect(admin).deploy()) as MockVotingEscrow
        await escrow.deployed()

        boost = (await boostFactory.connect(admin).deploy()) as MockBoost
        await boost.deployed()

        proxy = (await proxyFactory.connect(admin).deploy(
            escrow.address,
            boost.address,
            admin.address,
            emergencyAdmin.address
        )) as DelegationProxy
        await proxy.deployed()

    });

    it(' should be deployed & have correct parameters & mint the correct initial supply', async () => {
        expect(proxy.address).to.properAddress

        expect(await proxy.delegation()).to.be.eq(boost.address)
        
        expect(await proxy.ownership_admin()).to.be.eq(admin.address)
        expect(await proxy.emergency_admin()).to.be.eq(emergencyAdmin.address)
        expect(await proxy.future_emergency_admin()).to.be.eq(ethers.constants.AddressZero)
        expect(await proxy.future_ownership_admin()).to.be.eq(ethers.constants.AddressZero)

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

    describe('kill_delegation', async () => {

        it(' should remove the delegation correctly', async () => {
            
            expect(await proxy.delegation()).to.be.eq(boost.address)

            const kill_tx = await proxy.connect(admin).kill_delegation()

            expect(await proxy.delegation()).to.be.eq(ethers.constants.AddressZero)

            expect(kill_tx).to.emit(proxy, "DelegationSet").withArgs(ethers.constants.AddressZero);

        });

        it(' should also be callable by the emergency admin', async () => {

            expect(await proxy.delegation()).to.be.eq(boost.address)

            const kill_tx = await proxy.connect(emergencyAdmin).kill_delegation()

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
                ethers.constants.AddressZero,
                admin.address,
                emergencyAdmin.address
            )) as DelegationProxy
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
                proxy.connect(emergencyAdmin).set_delegation(new_boost.address)
            ).to.be.reverted

            await expect(
                proxy.connect(otherUser).set_delegation(new_boost.address)
            ).to.be.reverted

        });

    });

    describe('commit_set_admins', async () => {

        it(' should set the future admins correctly', async () => {
            
            expect(await proxy.future_emergency_admin()).to.be.eq(ethers.constants.AddressZero)
            expect(await proxy.future_ownership_admin()).to.be.eq(ethers.constants.AddressZero)

            const update_tx = await proxy.connect(admin).commit_set_admins(new_admin.address, new_emergencyAdmin.address)
            
            expect(await proxy.future_emergency_admin()).to.be.eq(new_emergencyAdmin.address)
            expect(await proxy.future_ownership_admin()).to.be.eq(new_admin.address)

            expect(update_tx).to.emit(proxy, "CommitAdmins").withArgs(new_admin.address, new_emergencyAdmin.address);

        });

        it(' should only be allowed for ownership admin', async () => {

            await expect(
                proxy.connect(emergencyAdmin).commit_set_admins(new_admin.address, new_emergencyAdmin.address)
            ).to.be.reverted

            await expect(
                proxy.connect(otherUser).commit_set_admins(new_admin.address, new_emergencyAdmin.address)
            ).to.be.reverted

        });

    });

    describe('apply_set_admins', async () => {

        beforeEach(async () => {

            await proxy.connect(admin).commit_set_admins(new_admin.address, new_emergencyAdmin.address)

        });

        it(' should apply the new admins', async () => {

            expect(await proxy.ownership_admin()).to.be.eq(admin.address)
            expect(await proxy.emergency_admin()).to.be.eq(emergencyAdmin.address)

            const update_tx = await proxy.connect(admin).apply_set_admins()

            expect(await proxy.ownership_admin()).to.be.eq(new_admin.address)
            expect(await proxy.emergency_admin()).to.be.eq(new_emergencyAdmin.address)

            expect(update_tx).to.emit(proxy, "ApplyAdmins").withArgs(new_admin.address, new_emergencyAdmin.address);

        });

        it(' should only be allowed for ownership admin', async () => {

            await expect(
                proxy.connect(emergencyAdmin).apply_set_admins()
            ).to.be.reverted

            await expect(
                proxy.connect(otherUser).apply_set_admins()
            ).to.be.reverted

        });

    });

});