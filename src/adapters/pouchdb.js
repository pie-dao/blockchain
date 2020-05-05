/* eslint no-new-func: 0 */

import BigNumber from 'bignumber.js';
import PouchDB from 'pouchdb';
import PubSub from 'pubsub-js';

import {
  isArray,
  isBigNumber,
  isDate,
  isNumber,
  isPOJO,
  isSet,
  isString,
  validateIsString,
} from '@pie-dao/utils';

const logPrefix = (functionName) => `@pie-dao/blockchain - PouchDB#${functionName}:`;

const addKeyToPath = (path, key) => {
  if (path.length === 0) {
    return key;
  }

  return `${path}.${key}`;
};

const deserialize = (data) => {
  if (isPOJO(data)) {
    if (data._class === 'BigNumber') {
      return BigNumber(data.value);
    }

    if (data._class === 'Date') {
      return new Date(data.value);
    }

    if (data._class === 'Set') {
      return new Set(data.value);
    }

    const deserialized = {};
    const keys = Object.keys(data);
    let i;

    for (i = 0; i < keys.length; i += 1) {
      deserialized[keys[i]] = deserialize(data[keys[i]], addKeyToPath(keys[i]));
    }

    return deserialized;
  }

  if (isArray(data)) {
    return data.map((datum) => deserialize(datum));
  }

  return data;
};

const serialize = (data, path = '') => {
  let i;

  if (isPOJO(data)) {
    const serialized = {};
    const keys = Object.keys(data);

    for (i = 0; i < keys.length; i += 1) {
      serialized[keys[i]] = serialize(data[keys[i]], addKeyToPath(keys[i]));
    }

    return serialized;
  }

  if (isArray(data)) {
    if (path.length === 0) {
      throw new Error(
        'Cannot serialize an array at the root level. Please wrap it in an object.',
      );
    }

    const serialized = [];
    for (i = 0; i < data.length; i += 1) {
      serialized.push(serialize(data[i], `${path}[i]`));
    }

    return serialized;
  }

  if (isBigNumber(data)) {
    return { _class: 'BigNumber', value: data.toString() };
  }

  if (isDate(data)) {
    return { _class: 'Date', value: data.valueOf() };
  }

  if (isSet(data)) {
    return { _class: 'Set', value: Array.from(data) };
  }

  if (isNumber(data) || isString(data)) {
    return data;
  }

  // TODO: an array of tests & ways to serialize and deserialize
  throw new Error(
    `Unable to serialize value ${data}. Limit input to strings, numbers, dates, and BigNumbers.`,
  );
};

const isBrowser = new Function('try { return this === window; } catch (e) { return false; }');

class PouchDBAdapter {
  constructor() {
    if (isBrowser()) {
      this._db = new PouchDB('@piedao/blockchain');
    } else {
      this._db = new PouchDB(`${__dirname}/${process.env.POUCH_DB_PATH || 'database.json'}`);
    }
  }

  async bulk(docs) {
    const payload = await Promise.all(docs.map((doc) => (
      this.fetch(doc.uuid).then(
        (current) => ({ ...current, data: serialize(doc) }),
      )
    )));

    const results = await this._db.bulkDocs(payload);

    results.forEach(async ({ id }) => {
      if (id) {
        PubSub.publish(id, (await this.get(id)));
      }
    });
  }

  async fetch(uuid) {
    const prefix = logPrefix('fetch');

    try {
      validateIsString(uuid, { prefix, message: `Expected uuid to be a string. Got: ${uuid}` });
      const doc = await this._db.get(uuid.toLowerCase());
      return doc;
    } catch (e) {
      if (e.message === 'missing') {
        return { _id: uuid.toLowerCase(), data: { uuid } };
      }

      console.error(prefix, e);

      return {
        uuid,
        error: e.message,
      };
    }
  }

  async get(uuid) {
    const prefix = logPrefix('get');

    try {
      validateIsString(uuid, { prefix, message: `Expected uuid to be a string. Got: ${uuid}` });
      const { data } = await this.fetch(uuid.toLowerCase());
      return deserialize(data);
    } catch (e) {
      console.error(prefix, e);

      return {
        uuid,
        error: e.message,
      };
    }
  }

  // NOTE: object must have an uuid field
  async put(data) {
    const { uuid } = data;

    if (!validateIsString(uuid, {
      message: `Objects being saved must have a uuid. Got: ${JSON.stringify(data)}`,
      prefix: logPrefix('put'),
      throwError: false,
    })) {
      return false;
    }

    const id = uuid.toLowerCase();

    try {
      const payload = {
        _id: id,
        data: serialize(data),
      };

      const rev = (await this.fetch(id))._rev;
      if (rev) {
        payload._rev = rev;
      } else {
        PubSub.publish('blockchain.newrecord', data);
      }

      await this._db.put(payload);
      PubSub.publish(id, data);

      return true;
    } catch (e) {
      console.error(logPrefix('put'), e);
      return false;
    }
  }
}

export default new PouchDBAdapter();
