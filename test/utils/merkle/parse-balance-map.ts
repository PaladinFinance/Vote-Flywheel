import { BigNumber, utils, constants } from "ethers";
import BalanceTree from "./balance-tree";

const { isAddress, getAddress } = utils;

export interface Balance{
  [adress:string]:{
      questID:BigNumber,
      period:BigNumber,
      earning:string,
      bias:BigNumber,
      rewardPerVote:BigNumber
  }
}

// This is the blob that gets distributed and pinned to IPFS.
// It is completely sufficient for recreating the entire merkle tree.
// Anyone can verify that all air drops are included in the tree,
// and the tree has no additional distributions.
interface MerkleDistributorInfo {
  merkleRoot: string;
  tokenTotal: string;
  claims: {
    [account: string]: {
      index: number;
      amount: string;
      proof: string[];
      flags?: {
        [flag: string]: boolean;
      };
    };
  };
}

type NewFormat = {
  address: string;
  questID: BigNumber;
  period: BigNumber;
  earnings: string;
  reasons: string;
};

export function parseBalanceMap(balances: Balance): MerkleDistributorInfo {
  // if balances are in an old format, process them
  const balancesInNewFormat: NewFormat[] = Array.isArray(balances)
    ? balances
    : Object.keys(balances).map(
        (account): NewFormat => ({
          address: account,
          questID: balances[account].questID,
          period: balances[account].period,
          earnings: balances[account].earning,
          reasons: "",
        })
      );

  const dataByAddress = balancesInNewFormat.reduce<{
    [address: string]: {
      questID: BigNumber;
      period: BigNumber;
      amount: BigNumber;
      flags?: { [flag: string]: boolean };
    };
  }>((memo, { address: account, questID, period, earnings, reasons }) => {
    if (!isAddress(account)) {
      throw new Error(`Found invalid address: ${account}`);
    }
    const parsed = getAddress(account);
    if (memo[parsed]) throw new Error(`Duplicate address: ${parsed}`);
    const parsedNum = BigNumber.from(earnings);
    if (parsedNum.lte(0))
      throw new Error(`Invalid amount for account: ${account}`);

    const flags = {
      isSOCKS: reasons.includes("socks"),
      isLP: reasons.includes("lp"),
      isUser: reasons.includes("user"),
    };

    memo[parsed] = {
      questID: questID,
      period: period,
      amount: parsedNum,
      ...(reasons === "" ? {} : { flags }),
    };
    return memo;
  }, {});

  const sortedAddresses = Object.keys(dataByAddress).sort();

  // construct a tree
  const tree = new BalanceTree(
    sortedAddresses.map((address) => ({
      questID: dataByAddress[address].questID,
      period: dataByAddress[address].period,
      account: address,
      amount: dataByAddress[address].amount,
    }))
  );

  // generate claims
  const claims = sortedAddresses.reduce<{
    [address: string]: {
      amount: string;
      index: number;
      proof: string[];
      flags?: { [flag: string]: boolean };
    };
  }>((memo, address, index) => {
    const { amount, flags } = dataByAddress[address];
    memo[address] = {
      index,
      amount: amount.toString(),
      proof: tree.getProof(
        dataByAddress[address].questID,
        dataByAddress[address].period,
        index,
        address,
        amount
      ),
      ...(flags ? { flags } : {}),
    };
    return memo;
  }, {});

  const tokenTotal: BigNumber = Object.keys(balances).reduce<BigNumber>(
    (memo, key) => {
      return memo.add(balances[key].bias.mul(balances[key].rewardPerVote))},
    BigNumber.from(0)
  );

  return {
    merkleRoot: tree.getHexRoot(),
    tokenTotal: tokenTotal.div(constants.WeiPerEther).toString(),
    claims,
  };
}