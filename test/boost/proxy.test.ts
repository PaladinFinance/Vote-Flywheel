const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { DelegationProxy } from "../../typechain/contracts/boost/DelegationProxy.vy/DelegationProxy";
import { MockBoost } from "../../typechain/contracts/test/MockBoost";
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

    let escrow: MockPalPower

    let boost: MockBoost

    before(async () => {
        await resetFork();

        [admin, emergencyAdmin, user, otherUser, new_admin, new_emergencyAdmin] = await ethers.getSigners();

        proxyFactory = await ethers.getContractFactory("DelegationProxy");
        escrowFactory = await ethers.getContractFactory("MockPalPower");
        boostFactory = await ethers.getContractFactory("MockBoost");

    })

    beforeEach(async () => {

        escrow = (await escrowFactory.connect(admin).deploy()) as MockPalPower
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

    it(' should be deployed & have correct parameters', async () => {
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

    describe('adjusted_balance_of_at', async () => {

        const user_balance = ethers.utils.parseEther("1000")
        const user_boosted_balance = ethers.utils.parseEther("1250")

        const other_user_boosted_balance = ethers.utils.parseEther("5000")

        const ts = 12500

        beforeEach(async () => {

            await escrow.connect(admin).setBalanceAt(user.address, ts, user_balance)

            await boost.connect(admin).setAdjustedBalanceAt(user.address, ts, user_boosted_balance)
            await boost.connect(admin).setAdjustedBalanceAt(otherUser.address, ts, other_user_boosted_balance)

        });

        it(' should return the adjuted balance for users', async () => {

            expect(await proxy.adjusted_balance_of_at(user.address, ts)).to.be.eq(user_boosted_balance)

            expect(await proxy.adjusted_balance_of_at(otherUser.address, ts)).to.be.eq(other_user_boosted_balance)

        });

        it(' should return the normal balance if delegation is killed', async () => {

            await proxy.connect(admin).kill_delegation()

            expect(await proxy.adjusted_balance_of_at(user.address, ts)).to.be.eq(user_balance)

            expect(await proxy.adjusted_balance_of_at(otherUser.address, ts)).to.be.eq(0)

        });

    });

    describe('total_locked & total_locked_at', async () => {

        const total_locked = ethers.utils.parseEther("1000")
        const past_total_locked = ethers.utils.parseEther("1250")

        const past_block_number = 175250

        beforeEach(async () => {

            await escrow.connect(admin).setTotalLocked(total_locked)
            await escrow.connect(admin).setTotalLockedAt(past_block_number, past_total_locked)

            await boost.connect(admin).setTotalLocked(total_locked)
            await boost.connect(admin).setTotalLockedAt(past_block_number, past_total_locked)

        });

        it(' should return the correct data', async () => {

            expect(await proxy.total_locked()).to.be.eq(total_locked)

            expect(await proxy.total_locked_at(past_block_number)).to.be.eq(past_total_locked)

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

    describe('commit_ownership_admin', async () => {

        it(' should set the future admin correctly', async () => {
            
            expect(await proxy.future_ownership_admin()).to.be.eq(ethers.constants.AddressZero)

            const update_tx = await proxy.connect(admin).commit_ownership_admin(new_admin.address)
            
            expect(await proxy.future_ownership_admin()).to.be.eq(new_admin.address)

            expect(update_tx).to.emit(proxy, "CommitOwnershipAdmin").withArgs(new_admin.address);

        });

        it(' should only be allowed for ownership admin', async () => {

            await expect(
                proxy.connect(emergencyAdmin).commit_ownership_admin(new_admin.address)
            ).to.be.reverted

            await expect(
                proxy.connect(otherUser).commit_ownership_admin(new_admin.address)
            ).to.be.reverted

        });

    });

    describe('commit_emergency_admin', async () => {

        it(' should set the future admin correctly', async () => {
            
            expect(await proxy.future_emergency_admin()).to.be.eq(ethers.constants.AddressZero)

            const update_tx = await proxy.connect(admin).commit_emergency_admin(new_emergencyAdmin.address)
            
            expect(await proxy.future_emergency_admin()).to.be.eq(new_emergencyAdmin.address)

            expect(update_tx).to.emit(proxy, "CommitEmergencyAdmin").withArgs(new_emergencyAdmin.address);

        });

        it(' should only be allowed for ownership admin', async () => {

            await expect(
                proxy.connect(emergencyAdmin).commit_emergency_admin(new_emergencyAdmin.address)
            ).to.be.reverted

            await expect(
                proxy.connect(otherUser).commit_emergency_admin(new_emergencyAdmin.address)
            ).to.be.reverted

        });

    });

    describe('apply_ownership_admin', async () => {

        beforeEach(async () => {

            await proxy.connect(admin).commit_ownership_admin(new_admin.address)

        });

        it(' should apply the new admin', async () => {

            expect(await proxy.ownership_admin()).to.be.eq(admin.address)

            const update_tx = await proxy.connect(new_admin).apply_ownership_admin()

            expect(await proxy.ownership_admin()).to.be.eq(new_admin.address)

            expect(update_tx).to.emit(proxy, "ApplyOwnershipAdmin").withArgs(new_admin.address);

        });

        it(' should only be allowed for new ownership admin', async () => {

            await expect(
                proxy.connect(admin).apply_ownership_admin()
            ).to.be.reverted

            await expect(
                proxy.connect(emergencyAdmin).apply_ownership_admin()
            ).to.be.reverted

            await expect(
                proxy.connect(otherUser).apply_ownership_admin()
            ).to.be.reverted

        });

    });

    describe('apply_emergency_admin', async () => {

        beforeEach(async () => {

            await proxy.connect(admin).commit_emergency_admin(new_emergencyAdmin.address)

        });

        it(' should apply the new admin', async () => {

            expect(await proxy.emergency_admin()).to.be.eq(emergencyAdmin.address)

            const update_tx = await proxy.connect(new_emergencyAdmin).apply_emergency_admin()

            expect(await proxy.emergency_admin()).to.be.eq(new_emergencyAdmin.address)

            expect(update_tx).to.emit(proxy, "ApplyEmergencyAdmin").withArgs(new_emergencyAdmin.address);

        });

        it(' should only be allowed for new emergency admin', async () => {

            await expect(
                proxy.connect(admin).apply_emergency_admin()
            ).to.be.reverted

            await expect(
                proxy.connect(emergencyAdmin).apply_emergency_admin()
            ).to.be.reverted

            await expect(
                proxy.connect(otherUser).apply_emergency_admin()
            ).to.be.reverted

        });

    });

});