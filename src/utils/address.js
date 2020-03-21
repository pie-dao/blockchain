import { ethers } from 'ethers';

class InvalidAddress extends Error {}

export const validateAddress = (str) => {
  if (!ethers.utils.isHexString(str)) {
    throw new InvalidAddress(`Expected a valid address hexstring, got: ${str}`);
  }
};

export const isAddress = (str) => {
  try {
    validateAddress(str);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

export const shortenAddress = (address, digits = 4) => {
  validateAddress(address);

  const a = address.substring(0, digits + 2);
  const b = address.substring(42 - digits);

  return `${a}...${b}`;
};
