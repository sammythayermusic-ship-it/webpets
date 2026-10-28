#!/usr/bin/env node
// Drives a WebPets build made with `npm run build:harness` (docs/HARNESS.md). No dependencies.
//
//   node tools/harness.mjs <op> [json-args] [--app-data DIR] [--no-wait] [--timeout SECONDS]
//   node tools/harness.mjs script path/to/steps.json [...]
//
// Writes inbox/<id>.json, waits for out/<id>.result.json, prints it, exits 1 on ok:false or timeout.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_ID = 'com.sammythayer.webpets';
const DEFAULT_APP_DATA = join(homedir(), 'Library', 'Application Support', APP_ID);
const POLL_MS = 100;
const DEFAULT_TIMEOUT_S = 60;
/** Ops whose duration the script can predict get `seconds + 10` instead of the flat default. */
const GRACE_S = 10;

function usage(code) {
  const out = code === 0 ? console.log : console.error;
  out('usage: node tools/harness.mjs <op> [json-args] [--app-data DIR] [--no-wait] [--timeout S]');
  out('       node tools/harness.mjs script path/to/steps.json');
  out('ops: state feed skip setHunger setPantry setBalance force night scale species hide show devPanel');
  out('     resetClock pointer snapshot stats record sleep script   (arguments in docs/HARNESS.md)');
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { appData: DEFAULT_APP_DATA, wait: true, timeoutS: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--app-data') opts.appData = argv[++i] ?? usage(2);
    else if (a.startsWith('--app-data=')) opts.appData = a.slice('--app-data='.length);
    else if (a === '--no-wait') opts.wait = false;
    else if (a === '--timeout') opts.timeoutS = timeoutArg(argv[++i]);
    else if (a.startsWith('--timeout=')) opts.timeoutS = timeoutArg(a.slice('--timeout='.length));
    else if (a === '-h' || a === '--help') usage(0);
    else positional.push(a);
  }
  return { opts, positional };
}

/** `--timeout` must be a positive number of seconds; anything else is a usage error, not a 0 s wait. */
function timeoutArg(raw) {
  const n = Number(raw);
  if (raw === undefined || raw === '' || !Number.isFinite(n) || n <= 0) {
    console.error(`--timeout needs a positive number of seconds, got ${JSON.stringify(raw ?? null)}`);
    process.exit(2);
  }
  return n;
}

/** Seconds a command is expected to occupy the app, for the wait timeout. */
function expectedSeconds(cmd, insideScript = false) {
  switch (cmd.op) {
    case 'record':
      // Inside a script the record step is detached: the script's result does not wait for the clip.
      return insideScript ? 0 : Number(cmd.seconds) || 0;
    case 'stats':
      return Number(cmd.seconds) || 0;
    case 'sleep':
      return (Number(cmd.ms) || 0) / 1000;
    case 'script':
      return (Array.isArray(cmd.steps) ? cmd.steps : []).reduce(
        (sum, step) => sum + (step && typeof step === 'object' ? expectedSeconds(step, true) : 0),
        0,
      );
    default:
      return 0;
  }
}

function buildCommand(op, rawArgs) {
  let args = {};
  if (rawArgs !== undefined) {
    if (op === 'script' && !rawArgs.trimStart().startsWith('{') && !rawArgs.trimStart().startsWith('[')) {
      const text = readFileSync(rawArgs, 'utf8');
      const parsed = JSON.parse(text);
      args = Array.isArray(parsed) ? { steps: parsed } : parsed;
    } else {
      const parsed = JSON.parse(rawArgs);
      args = op === 'script' && Array.isArray(parsed) ? { steps: parsed } : parsed;
    }
  }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error('json-args must be an object');
  }
  // Time-ordered so the inbox's name sort is arrival order; the random tail keeps two drivers apart.
  const id = `${Date.now()}-${op}-${randomBytes(4).toString('hex')}`;
  return { id, op, ...args };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  const [op, rawArgs] = positional;
  if (!op) usage(2);
  const cmd = buildCommand(op, rawArgs);
  const inbox = join(opts.appData, 'harness', 'inbox');
  const outDir = join(opts.appData, 'harness', 'out');
  mkdirSync(inbox, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  // Write-then-rename so the app never reads a half-written command; the poller only looks at *.json.
  const tmp = join(inbox, `.${cmd.id}.tmp`);
  const final = join(inbox, `${cmd.id}.json`);
  writeFileSync(tmp, JSON.stringify(cmd, null, 2));
  renameSync(tmp, final);

  if (!opts.wait) {
    console.log(JSON.stringify({ id: cmd.id, op, queued: final }));
    return;
  }

  const timeoutS = opts.timeoutS ?? (expectedSeconds(cmd) > 0 ? expectedSeconds(cmd) + GRACE_S : DEFAULT_TIMEOUT_S);
  const resultPath = join(outDir, `${cmd.id}.result.json`);
  const deadline = Date.now() + timeoutS * 1000;
  while (Date.now() < deadline) {
    if (existsSync(resultPath)) {
      let result;
      try {
        result = JSON.parse(readFileSync(resultPath, 'utf8'));
      } catch {
        await sleep(POLL_MS); // renamed into place, but let a slow disk settle
        continue;
      }
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    }
    await sleep(POLL_MS);
  }
  // A command nobody picked up must not fire whenever a harness build next starts: take it back.
  let stillQueued = false;
  try {
    unlinkSync(final);
    stillQueued = true;
  } catch {
    stillQueued = existsSync(final);
  }
  console.error(
    JSON.stringify({
      id: cmd.id,
      op,
      ok: false,
      error: stillQueued
        ? `timeout after ${timeoutS}s: the command was never picked up and has been withdrawn (is a harness build running?)`
        : `timeout after ${timeoutS}s waiting for ${resultPath}`,
    }),
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
