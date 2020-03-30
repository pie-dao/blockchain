/* eslint no-param-reassign: 0 */
/* eslint no-control-regex: 0 */
/* eslint no-async-promise-executor: 0 */

import { chain, validateIsAddress, validateIsArray } from '@pie-dao/utils';
import { erc20 as erc20ABI } from '@pie-dao/abis';
import { ethers } from 'ethers';

import pouchdb from '../adapters/pouchdb';

const logPrefix = (functionName) => `@pie-dao/blockchain - fetchers/erc20 - ${functionName}`;

const addNaT = (address) => {
  const func = async (callback) => {
    const NaTs = await pouchdb.get('NaT');
    NaTs.addresses = (NaTs.addresses || new Set()).add(address);
    await pouchdb.set('NaT', NaTs);
    callback();
  };

  chain('NaT', func, logPrefix('addNaT'));
};

const isNaT = async (address) => {
  const NaTs = await pouchdb.get('NaT');
  if (NaTs.addresses && NaTs.addresses.has(address)) {
    return true;
  }

  return false;
};

const trimSymbol = (symbol) => symbol.trim().replace(/\u0000/g, '');

const fetchErc20 = (address, provider) => new Promise(async (resolve, reject) => {
  const prefix = logPrefix('fetchErc20');
  const NaTError = new TypeError(`${prefix}: Address ${address} is not a contract address.`);

  validateIsAddress(address, { prefix, message: 'address requested is not an Ethereum address.' });

  try {
    if (await isNaT(address)) {
      reject(NaTError);
    }
  } catch (e) {
    console.error(prefix, 'CRITICAL WARNING: caught error checking isNaT');
    reject(NaTError);
  }

  const ident = `${prefix}('${address}', provider)`;

  const func = async (callback) => {
    const token = await pouchdb.get(address);
    const contract = new ethers.Contract(address, erc20ABI, provider);

    if (!token.address) {
      if ((await provider.getCode(address)) === '0x') {
        addNaT(address);
        reject(NaTError);
        callback();
        return;
      }

      const [
        decimals,
        name,
        symbol,
      ] = await Promise.all([
        contract.decimals(),
        contract.name(),
        trimSymbol(contract.symbol()),
      ]);

      const data = {
        address,
        decimals,
        name,
        symbol,
      };

      await pouchdb.put({ ...data, ...token });

      resolve({ ...data, ...token, contract });
      callback();
      return;
    }

    resolve({ ...token, contract });
  };

  chain(
    address,
    func,
    ident,
    reject,
  );
});

export const erc20 = async (address, provider) => {
  const prefix = logPrefix('erc20');
  validateIsAddress(address, { prefix, message: 'address requested is not an Ethereum address.' });
  return fetchErc20(address, provider);
};

export const erc20s = async (addresses, provider) => {
  const prefix = logPrefix('erc20s');
  validateIsArray(addresses, { prefix, message: '\'addresses\' argument must be an array' });

  const results = await Promise.allSettled(
    addresses.map((address) => fetchErc20(address, provider)),
  );

  return results.filter(({ status }) => status === 'resolved').map(({ value }) => value);
};
