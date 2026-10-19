/** True for SQLite UNIQUE / PRIMARY KEY constraint failures. */
export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY');
