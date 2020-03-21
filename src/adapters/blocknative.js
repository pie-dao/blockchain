import blocknativeSdk from 'bnc-sdk';

import {
  validateIsFunction,
  validateIsString,
  validateIsSupportedNetworkId,
} from '../utils/validations';

// TODO: Update this to our documentation
const docs = 'https://docs.blocknative.com/notify-sdk#quickstart';

const logPrefix = (functionName) => `@pie-dao/blockchain - Blocknative#${functionName}:`;

const internal = {
  connected: false,
  sdk: undefined,
};

const handlers = [];

class BlocknativeAdapter {
  constructor() {
    this.debug = false;
  }

  get transactionHandlers() {
    return handlers + [this.debugHandler];
  }

  addHandler(func) {
    validateIsFunction(func, {
      message: 'First argument must be a function',
      prefix: logPrefix('addHandler'),
    });

    handlers.push(func);

    if (this.connected) {
      console.warn(
        logPrefix('addHandler'),
        'Already connected. New handlers will only apply to future subscriptions. More info:',
        docs,
      );

      this.start();
    }
  }

  debugHandler(evt) {
    if (this.debug) {
      console.info(logPrefix('debugHandler'), 'blockchain event received', evt);
    }
  }

  initialize({ dappId, networkId, debug = false }) {
    const prefix = logPrefix('initialize');

    validateIsString(dappId, {
      prefix,
      message: `dappId is must be specified. See: ${docs}`,
    });
    validateIsSupportedNetworkId(networkId, { prefix });

    this.stop();
    this.dappId = dappId;
    this.debug = debug;
    this.networkId = networkId;
  }

  start() {
    const { dappId, networkId, transactionHandlers } = this;
    const prefix = logPrefix('start');

    validateIsString(dappId, {
      prefix,
      message: 'dappId is required. Did you call #initialize?',
    });
    validateIsSupportedNetworkId(networkId, { prefix });

    internal.sdk = blocknativeSdk({ dappId, networkId, transactionHandlers });
    internal.connected = true;
  }
}

export default new BlocknativeAdapter();
