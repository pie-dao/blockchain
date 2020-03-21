// https://github.com/ethereum/grid/issues/201
const networkIds = [
  1,
  2,
  3,
  4,
  5,
  6,
  8,
  42,
  60,
  77,
  99,
  100,
  31337,
  401697,
  7762959,
  61717561,
];

// https://docs.blocknative.com/webhook-api#supported-ethereum-networks
const supportedNetworkIds = [
  1,
  3,
  4,
  5,
  42,
];

// Core

export const isFunction = (thing) => (thing && {}.toString.call(thing) === '[object Function]');

export const isNumber = (thing) => !Number.isNaN(thing);

export const isString = (thing) => (typeof thing === 'string' || thing instanceof String);

// Blockchain

export const isNetworkId = (thing) => (isNumber(thing) && networkIds.includes(thing));

export const isSupportedNetworkId = (thing) => (
  isNumber(thing) && supportedNetworkIds.includes(thing)
);
