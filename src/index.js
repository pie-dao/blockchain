import { defaultNetwork } from './config';
import { isAddress, shortenAddress, validateAddress } from './utils/address';

export const config = { defaultNetwork };
export const utils = {
  address: { isAddress, shortenAddress, validateAddress },
};
