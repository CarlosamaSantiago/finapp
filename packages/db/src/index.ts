export { openDatabase, WrongKeyError, type Db, type OpenOptions } from './connection.js';
export { deriveKey, newSalt } from './key.js';
export {
  idempotencyRepository,
  ledgerRepository,
  type LedgerAppendError,
  type NewEntry,
} from './ledger.js';
export {
  accountsRepository,
  categoriesRepository,
  goalsRepository,
  liabilitiesRepository,
  type CreateError,
  type NewAccount,
  type NewGoal,
  type NewLiability,
  type Now,
} from './master-data.js';
export { MIGRATIONS, migrate } from './migrations.js';
export { seedSynthetic } from './seed.js';
export { createStore, openStore, storeExists } from './store.js';
