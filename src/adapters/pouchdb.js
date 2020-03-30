import BigNumber from 'bignumber.js';
import PouchDB from 'pouchdb';

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

class PouchDBAdapter {
  constructor() {
    this._db = new PouchDB('@piedao/blockchain');
  }

  async fetch(uuid, revOnly = false) {
    try {
      const doc = await this._db.get(uuid);
      if (revOnly) {
        return doc._rev;
      }
      return doc;
    } catch (e) {
      if (e.message === 'missing') {
        return revOnly ? undefined : { _docId: uuid, data: { uuid } };
      }

      console.error(logPrefix('fetch'), e);

      return {
        uuid,
        error: e.message,
      };
    }
  }

  async get(uuid) {
    try {
      const { data } = await this.fetch(uuid);
      return deserialize(data);
    } catch (e) {
      console.error(logPrefix('get'), e);

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
      message: 'Objects being saved must have a uuid.',
      prefix: logPrefix('put'),
      throwError: false,
    })) {
      return false;
    }

    try {
      const payload = {
        _id: uuid,
        data: serialize(data),
      };

      const rev = await this.fetch(uuid, true);
      if (rev) {
        payload._rev = rev;
      }

      await this._db.put(payload);

      return true;
    } catch (e) {
      console.error(logPrefix('put'), e);
      return false;
    }
  }
}

export default new PouchDBAdapter();
