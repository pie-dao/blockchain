/* eslint class-methods-use-this: 0 */
import BigNumber from 'bignumber.js';

import { chain, validateIsTransactionHash } from '@pie-dao/utils';
import { ethers } from 'ethers';

import blocknative from './adapters/blocknative';
import pouchdb from './adapters/pouchdb';

import { defaultNetwork, defaultNetworkId } from './config';
import { erc20 } from './fetchers/erc20';
import { fetchAccount, fetchBalances } from './fetchers/account';

const logPrefix = (functionName) => `@pie-dao/blockchain - Database#${functionName}:`;

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

const transactionUpdate = (update) => {
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
};

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

    this.etherscan = new ethers.providers.EtherscanProvider(network);
    this.provider = new ethers.getDefaultProvider(network);
  }

  async balance({ address, token }) {
    const { balance } = await pouchdb.get(`${address}.${token}.balance`);
    let fetched = balance;

    if (!fetched) {
      const { contract } = await erc20(token);
      fetched = BigNumber((await contract.balanceOf(address)).toString());
    }

    if (!internal.tracking.has(address)) {
      this.track({ address });
    }

    return fetched;
  }

  async track({ address, transactionHash }) {
    if (address && !internal.tracking.has(address)) {
      internal.tracking.add(address);
      blocknative.address(address, this.transactionUpdate);
      await trackAddress(this, address);
      await fetchBalances(address, this.provider);
    }

    if (transactionHash) {
      const prefix = logPrefix(`track({ transactionHash: '${transactionHash}' })`);
      validateIsTransactionHash(transactionHash, { prefix });
      blocknative.transaction(transactionHash, transactionUpdate);
    }

    return true;
  }
}

export default Database;
