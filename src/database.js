/* eslint class-methods-use-this: 0 */
import BigNumber from 'bignumber.js';
import PubSub from 'pubsub-js';

import {
  chain,
  isBigNumber,
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
// import { fetchAccount, fetchBalances } from './fetchers/account';
import { fetchAccount } from './fetchers/account';

const logPrefix = (functionName) => `@pie-dao/blockchain - Database#${functionName}`;

window.pouchdb = pouchdb;

const internal = {
  tracking: new Set(),
  waiting: {},
  waitingPid: {},
};

const trackAddress = (db, address) => new Promise((resolve, reject) => {
  const ident = logPrefix(`track({ address: '${address}' })`);

  const func = async (callback) => {
    const account = await fetchAccount(address);
    const { lastBlock } = account;
    let i;

    const transactions = await db.etherscan.getHistory(address, lastBlock);

    const docs = await Promise.all(
      transactions.map(
        (transaction) => db.transactionUpdate(transaction, true),
      ),
    );

    await pouchdb.bulk(docs);

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

  refreshBalances(address) {
    pouchdb.get(`${address}.balances`).then((balances) => Promise.all(
      Array.from(balances.tokens || new Set()).map(
        (token) => this.balance({ address, token, bulk: true }),
      ),
    )).then((docs) => pouchdb.bulk(docs));
  }

  async balance({ address, bulk = false, token = nullAddress }) {
    const uuid = `${address}.${token}.balance`.toLowerCase();
    let { balance } = await pouchdb.get(uuid);

    if (isBigNumber(balance)) {
      PubSub.publish(uuid, { balance });
    }

    if (token === nullAddress) {
      const rawBalance = await this.provider.getBalance(address);
      balance = BigNumber(ethers.utils.formatEther(rawBalance));
    } else {
      const { contract, decimals } = await erc20(token, this.provider);
      const rawBalance = await contract.balanceOf(address);
      balance = BigNumber(rawBalance.toString()).dividedBy(10 ** decimals);
    }

    const doc = { balance, uuid };

    if (bulk) {
      return doc;
    }

    await pouchdb.put(doc);

    setTimeout(async () => {
      const balances = await pouchdb.get(`${address}.balances`);
      const tokens = (balances.tokens || new Set());

      if (!tokens.has(token)) {
        tokens.add(token);
        balances.tokens = tokens;
        pouchdb.put(balances);
      }
    }, Math.floor(Math.random() * Math.floor(20) * 100));

    return balance;
  }

  async contract(address) {
    let contract = await pouchdb.get(address);

    if (!contract.symbol) {
      contract = await erc20(address, this.provider);
    }

    return contract;
  }

  subscribe(uuid, subscriber) {
    const prefix = logPrefix('subscribe');
    validateIsString(uuid, { prefix, message: 'Invalid database uuid format. Must be a string.' });
    validateIsFunction(subscriber, { prefix, message: 'Subscriber is not a function.' });
    return PubSub.subscribe(uuid.toLowerCase(), subscriber);
  }

  async track({ address, transactionHash }) {
    if (address && !internal.tracking.has(address)) {
      await trackAddress(this, address);
      // await fetchBalances(address, this.provider);
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

  async transactionUpdate(update, bulk = false) {
    const {
      creates,
      data,
      from,
      hash,
      to,
      value,
    } = update;

    const doc = {
      creates,
      data,
      from,
      hash,
      to,
      value: BigNumber(value.toString()),
      uuid: hash,
    };

    if (bulk === true) {
      return doc;
    }

    setTimeout(async () => {
      const wait = this.waitForTransaction(hash);

      if (wait.status === 'waiting') {
        await wait.promise;
        this.refreshBalances(from);
        this.refreshBalances(to);
      }
    }, 0);

    await pouchdb.put(doc);

    return doc;
  }

  waitForTransaction(hash, timeoutIn = 300000) {
    const prefix = logPrefix('waitForTransaction');
    validateIsTransactionHash(hash, {
      prefix,
      message: `'${hash}' is not a valid transaction hash`,
    });

    if (internal.waiting[hash]) {
      return { promise: internal.waiting[hash], status: 'alreadyInProgress' };
    }

    internal.waitingPid[hash] = setTimeout(() => {
      delete internal.waiting[hash];
      delete internal.waitingPid[hash];
    }, timeoutIn);

    const promise = new Promise((resolve) => {
      this.provider.on(hash, () => {
        clearTimeout(internal.waitingPid[hash]);
        delete internal.waiting[hash];
        delete internal.waitingPid[hash];
        resolve();
      });
    });

    internal.waiting[hash] = promise;

    return { promise, status: 'waiting' };
  }

  unsubscribe(subscription) {
    PubSub.unsubscribe(subscription);
  }
}

export default Database;
