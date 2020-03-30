import 'regenerator-runtime/runtime';

import Database from './database';

import { defaultNetwork } from './config';

export const BlockchainDatabase = Database;
export const config = { defaultNetwork };
