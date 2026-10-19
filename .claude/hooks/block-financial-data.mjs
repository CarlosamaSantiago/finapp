// PreToolUse hook for Bash/PowerShell: refuse shell commands that touch real financial data or
// secrets (CLAUDE.md: never read the real database). Permission deny rules cover the file tools;
// shell commands need this check. False positives are acceptable: use the file tools instead.
import { readFileSync } from 'node:fs';

const SENSITIVE = [
  /(^|[\\/])data[\\/]/i, // anything under a data/ directory
  /\.(db|sqlite3?)(-[a-z]+)?$/i, // SQLite files and their -wal/-shm/-journal siblings
  /(^|[\\/])\.env(\..*)?$/i, // .env, .env.local, ...
];
const DB_TOOLS = /^(sqlite3|sqlitebrowser)(\.exe)?$/i;

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = String(input.tool_input?.command ?? '');
const words = command
  .split(/[\s;|&<>()`]+/)
  .map((word) => word.replace(/^['"]+|['"]+$/g, ''))
  .filter(Boolean);
const hit = words.find((word) => DB_TOOLS.test(word) || SENSITIVE.some((re) => re.test(word)));

if (hit) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Blocked "${hit}": it may be real financial data or a secret (see CLAUDE.md). Use the synthetic seed or the in-memory test DB.`,
      },
    }),
  );
}
