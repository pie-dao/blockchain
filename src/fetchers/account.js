import BigNumber from 'bignumber.js';

import { chain, nullAddress } from '@pie-dao/utils';
import { ethers } from 'ethers';

import pouchdb from '../adapters/pouchdb';

import { erc20s } from './erc20';

const logPrefix = (functionName) => `@pie-dao/blockchain - fetchers/account - ${functionName}`;

const fetchTransactions = async (address) => {
  const { transactions } = await pouchdb.get(address);
  return Promise.all(Array.from(transactions).map((transaction) => pouchdb.get(transaction)));
};

export const fetchAccount = async (address) => {
  const account = (await pouchdb.get(address)) || {
    lastBlock: 0,
    transactions: new Set(),
    uuid: address,
  };

  if (!account.lastBlock) {
    account.lastBlock = 0;
  }

  if (!account.transactions) {
    account.transactions = new Set();
  }

  if (!account.uuid) {
    account.address = address;
    account.uuid = address;
  }

  return account;
};

export const fetchContracts = (address, provider) => new Promise((resolve, reject) => {
  const ident = logPrefix('fetchContracts');

  const func = async (callback) => {
    const transactions = await fetchTransactions(address);
    const addresses = new Set([address]);

    transactions.forEach(({ from, to }) => {
      if (from) {
        addresses.add(from);
      }

      if (to) {
        addresses.add(to);
      }
    });

    resolve(await erc20s(Array.from(addresses), provider));
    callback();
  };

  chain(
    address,
    func,
    ident,
    reject,
  );
});

export const fetchBalances = async (walletAddress, provider) => {
  const contracts = await fetchContracts(walletAddress, provider);

  const ethBalanceRaw = await provider.getBalance(walletAddress);
  const ethBalance = BigNumber(ethers.utils.formatEther(ethBalanceRaw));

  pouchdb.put({ ethBalance, uuid: `${walletAddress}.${nullAddress}.balance` });

  const results = await Promise.allSettled(contracts.map(({ address, contract, decimals }) => (
    contract.balanceOf(walletAddress).then((balance) => (
      pouchdb.put({
        balance: BigNumber(balance.toString()).dividedBy(10 ** decimals),
        uuid: `${walletAddress}.${address}.balance`,
      })
    ))
  )));

  return results;
};
