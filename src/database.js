/* eslint class-methods-use-this: 0 */
import BigNumber from 'bignumber.js';
import PubSub from 'pubsub-js';

import {
  chain,
  nullAddress,
  validateIsFunction,
  validateIsString,
  validateIsTransactionHash,
} from '@pie-dao/utils';
import { ethers } from 'ethers';

import blocknative from './adapters/blocknative';
import pouchdb from './adapters/pouchdb';

import { defaultNetwork, defaultNetworkId } from './config';
import { erc20 } from './fetchers/erc20';
import { fetchAccount, fetchBalances } from './fetchers/account';

const logPrefix = (functionName) => `@pie-dao/blockchain - Database#${functionName}`;

window.pouchdb = pouchdb;

const internal = {
  tracking: new Set(),
};

const trackAddress = (db, address) => new Promise((resolve, reject) => {
  const ident = logPrefix(`track({ address: '${address}' })`);

  const func = async (callback) => {
    const account = await fetchAccount(address);
    const { lastBlock } = account;
    let i;

    const transactions = await db.etherscan.getHistory(address, lastBlock);

    await Promise.all(transactions.map((transaction) => db.transactionUpdate(transaction)));

    for (i = 0; i < transactions.length; i += 1) {
      const { blockNumber, hash } = transactions[i];
      account.transactions.add(hash);

      if (account.lastBlock < blockNumber) {
        account.lastBlock = blockNumber;
      }
    }

    if (await pouchdb.put(account)) {
      resolve(account);
    } else {
      reject(new Error(`${ident}: failed to save`));
    }

    callback();
  };

  chain(
    address,
    func,
    ident,
    reject,
  );
});

class Database {
  constructor({
    blocknativeDappId,
    debug = false,
    network = defaultNetwork,
    networkId = defaultNetworkId,
  }) {
    blocknative.initialize({
      debug,
      networkId,
      dappId: blocknativeDappId,
    });

    blocknative.start();

    this.etherscan = new ethers.providers.EtherscanProvider(network);
    this.provider = new ethers.getDefaultProvider(network);
    this.transactionUpdate = this.transactionUpdate.bind(this);
  }

  async balance({ address, token = nullAddress }) {
    const { balance } = await pouchdb.get(`${address}.${token}.balance`);
    let bal = balance;

    if (!bal) {
      if (token === nullAddress) {
        const ethBalanceRaw = await this.provider.getBalance(address);
        bal = BigNumber(ethers.utils.formatEther(ethBalanceRaw));
      } else {
        const { contract, decimals } = await erc20(token);
        bal = BigNumber((await contract.balanceOf(address)).dividedBy(10 ** decimals).toString());
      }
    }

    if (!internal.tracking.has(address)) {
      this.track({ address });
    }

    return bal;
  }

  subscribe(uuid, subscriber) {
    const prefix = logPrefix('subscribe');
    validateIsString(uuid, { prefix, message: 'Invalid database uuid format. Must be a string.' });
    validateIsFunction(subscriber, { prefix, message: 'Subscriber is not a function.' });
    PubSub.subscribe(uuid, subscriber);
  }

  async track({ address, transactionHash }) {
    if (address && !internal.tracking.has(address)) {
      await trackAddress(this, address);
      await fetchBalances(address, this.provider);
      try {
        blocknative.address(address, this.transactionUpdate);
        internal.tracking.add(address);
      } catch (e) {
        const prefix = logPrefix(`track({ address: '${address}' })`);
        console.error(prefix, e);
      }
    }

    if (transactionHash) {
      const prefix = logPrefix(`track({ transactionHash: '${transactionHash}' })`);
      validateIsTransactionHash(transactionHash, { prefix });
      try {
        blocknative.transaction(transactionHash, this.transactionUpdate);
      } catch (e) {
        console.error(prefix, e);
      }
    }

    return true;
  }

  transactionUpdate(update) {
    const {
      creates,
      data,
      from,
      hash,
      to,
      value,
    } = update;

    pouchdb.put({
      creates,
      data,
      from,
      hash,
      to,
      value: BigNumber(value.toString()),
      uuid: hash,
    });

    // TODO: wait for the current provider to know that the transaction is settled
    if (internal.tracking.has(from)) {
      fetchBalances(from, this.provider);
    }

    if (internal.tracking.has(to)) {
      fetchBalances(to, this.provider);
    }
  }

  unsubscribe(subscriber) {
    const prefix = logPrefix('unsubscribe');
    validateIsFunction(subscriber, { prefix, message: 'Subscriber is not a function.' });
    PubSub.unsubscribe(subscriber);
  }
}

export default Database;
