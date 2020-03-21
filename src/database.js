import PouchDB from 'pouchdb';

import blocknative from './adapters/blocknative';

import { defaultNetworkId } from './config';

const internal = {
  database: new PouchDB('@pie-dao/blockchain'),
};

class Database {
  constructor({ blocknativeDappId, networkId = defaultNetworkId }) {
    blocknative.initialize(blocknativeDappId, networkId);
  }
}

export default Database;
