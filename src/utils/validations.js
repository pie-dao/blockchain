import {
  isFunction,
  isNetworkId,
  isNumber,
  isString,
  isSupportedNetworkId,
} from './typeChecks';

const buildError = ({ message, prefix }) => {
  if (prefix) {
    return `${prefix} ${message}`;
  }

  return message;
};

const validate = (result, options) => {
  const {
    level = 'error',
    message,
    prefix,
    throwError = true,
  } = options;

  if (result) {
    return true;
  }

  const error = buildError({ message, prefix });

  if (throwError) {
    throw new TypeError(error);
  }

  console[level](error);
  return false;
};

// Core

export const validateIsFunction = (thing, options = {}) => {
  const defaultMessage = 'not a function';
  return validate(isFunction(thing), { ...options, message: options.message || defaultMessage });
};

export const validateIsNumber = (thing, options = {}) => {
  const defaultMessage = 'not a number';
  return validate(isNumber(thing), { ...options, message: options.message || defaultMessage });
};

export const validateIsString = (thing, options = {}) => {
  const defaultMessage = 'not a string';
  return validate(isString(thing), { ...options, message: options.message || defaultMessage });
};

// Blockchain

export const validateIsNetworkId = (thing, options = {}) => {
  const result = validateIsNumber(thing, options);
  if (!result) {
    return false;
  }
  const defaultMessage = 'not an Ethereum network id';
  return validate(isNetworkId(thing), { ...options, message: options.message || defaultMessage });
};

export const validateIsSupportedNetworkId = (thing, options = {}) => {
  const result = validateIsNetworkId(thing, options);
  if (!result) {
    return false;
  }
  const defaultMessage = `network ${thing} is not supported`;
  return validate(isSupportedNetworkId(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};
