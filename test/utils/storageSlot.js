const { ethers, BigNumber } = require("ethers");
const IERC20ABI = require('../../abi/IERC20.json');

require("dotenv").config();

//const provider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_URI);
const provider = new ethers.providers.JsonRpcProvider(process.env.GOERLI_URI);

async function findBalancesSlot(tokenAddress) {
    const encode = (types, values) =>
        ethers.utils.defaultAbiCoder.encode(types, values);

    const account = ethers.constants.AddressZero;
    const probeA = encode(['uint'], [1]);
    const probeB = encode(['uint'], [2]);

    const token = new ethers.Contract(tokenAddress, IERC20ABI, provider);

    for (let i = 0; i < 100; i++) {
        let probedSlot = ethers.utils.keccak256(
            encode(['address', 'uint'], [account, i])
        );

        // remove padding for JSON RPC
        while (probedSlot.startsWith('0x0'))
            probedSlot = '0x' + probedSlot.slice(3);

        const prev = await network.provider.send(
            'eth_getStorageAt',
            [tokenAddress, probedSlot, 'latest']
        );

        // make sure the probe will change the slot value
        const probe = prev === probeA ? probeB : probeA;

        await network.provider.send("hardhat_setStorageAt", [
            tokenAddress,
            probedSlot,
            probe
        ]);

        const balance = await token.balanceOf(account);

        // reset to previous value
        await network.provider.send("hardhat_setStorageAt", [
            tokenAddress,
            probedSlot,
            prev
        ]);

        if (balance.eq(ethers.BigNumber.from(probe)))
            return i;
    }

    throw 'Balances slot not found!';
}

(async () => {

    const token_address = "0x84ced17d95F3EC7230bAf4a369F1e624Ae60090d"

    const slot = await findBalancesSlot(token_address)

    console.log("Slot :", slot)

})();