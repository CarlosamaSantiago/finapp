import { createStore, migrate, openDatabase, type Db } from '@finapp/db';
import { parseArgs } from 'node:util';
import { goldenCheck, type Check } from './golden.js';
import { importLegacy } from './importer.js';
import { readLegacy } from './legacy.js';

const USAGE = `Usage: pnpm import:legacy --source <legacy.db> [--target-dir <dir>]

Without --target-dir this is a dry run: data is imported into memory and only the report is printed.
With --target-dir a new encrypted store is created there (you are asked for its passphrase).
The report shows counts, ids and months only, never amounts or names.`;

/** Reads a line without echoing it. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new Error('A passphrase prompt needs an interactive terminal');
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          stdin.setRawMode(false);
          reject(new Error('Cancelled'));
          return;
        }
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char;
      }
    };
    stdin.on('data', onData);
  });
}

const line = (name: string, check: Check) =>
  `  ${name}: ${String(check.checked - check.mismatches.length)}/${String(check.checked)} match` +
  (check.mismatches.length ? `\n    differ: ${check.mismatches.join(', ')}` : '');

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv.filter((a) => a !== '--'),
    options: {
      source: { type: 'string' },
      'target-dir': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help || !values.source) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }

  const legacyDb = openDatabase({ path: values.source, readonly: true, fileMustExist: true });
  const legacy = readLegacy(legacyDb);
  legacyDb.close();

  const targetDir = values['target-dir'];
  let target: Db;
  if (targetDir) {
    const passphrase = await promptHidden('Passphrase for the new store: ');
    if (passphrase !== (await promptHidden('Repeat passphrase: '))) {
      console.error('Passphrases do not match.');
      return 2;
    }
    target = await createStore(targetDir, passphrase);
  } else {
    target = openDatabase({ path: ':memory:' });
    migrate(target);
  }

  const now = () => new Date().toISOString();
  const imported = importLegacy(legacy, target, now);
  if (!imported.ok) {
    console.error('Import stopped, nothing was written. Problems:');
    for (const [field, values] of imported.issues.unknownValues) {
      console.error(`  unknown ${field}: ${[...values].map((v) => JSON.stringify(v)).join(', ')}`);
    }
    for (const problem of imported.issues.rowProblems) console.error(`  ${problem}`);
    target.close();
    return 1;
  }

  const golden = goldenCheck(legacy, target, now);
  target.close();
  const c = imported.counts;
  console.log(`Imported${targetDir ? '' : ' (dry run, nothing saved)'}:`);
  console.log(
    `  accounts ${String(c.accounts)}, categories ${String(c.categories)}, liabilities ${String(c.liabilities)}, goals ${String(c.goals)}, entries ${String(c.entries)}`,
  );
  const skipped = Object.entries(legacy.skipped).filter(([, n]) => n > 0);
  if (skipped.length) {
    console.log(
      `  not imported (phase 2): ${skipped.map(([t, n]) => `${t} ${String(n)}`).join(', ')}`,
    );
  }
  console.log(`Golden check: ${golden.passed ? 'PASS' : 'FAIL'}`);
  console.log(line('account balances', golden.accounts));
  console.log(line('liability balances', golden.liabilities));
  console.log(line('monthly income/expense', golden.months));
  return golden.passed ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
