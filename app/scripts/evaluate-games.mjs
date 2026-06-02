// Stage 2 of the pipeline
// Reads extracted games, takes a deterministic SAMPLE_SIZE subset, scores every
// position with the SAME Stockfish build the browser app uses, and writes the
// eval-filled CSV consumed by create_features.
//
// Runs a pool of child-process workers (one engine each). Each game is appended to
// the output CSV the moment it finishes, so progress survives a crash or Ctrl-C.
// Resumable: on restart, games already written (with evals) are skipped, a row
// left half-written by a hard kill is trimmed and re-evaluated, so the CSV always
// picks up cleanly from the last fully written game. Usage:
//   node scripts/evaluate-games.mjs [--limit N] [--workers N]

import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { createReadStream, existsSync, createWriteStream, readFileSync, statSync, openSync, readSync, ftruncateSync, closeSync } from 'fs';
import { dirname, resolve } from 'path';
import os from 'os';
import { parse } from 'csv-parse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const INPUT_PATH = resolve(REPO_ROOT, 'data', 'lichess_games_raw.csv');
const OUTPUT_PATH = resolve(REPO_ROOT, 'data', 'lichess_games.csv');
const WORKER_PATH = resolve(__dirname, 'eval-worker.mjs');

const LOG_EVERY = 200; // progress-log cadence; every game is written to disk as it finishes, independent of this
const SAMPLE_SIZE = 140_000; // match the row count input to create_features.py

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { limit: null, workers: Math.max(1, (os.cpus().length || 2) - 1) };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') out.limit = parseInt(args[++i], 10);
    else if (args[i] === '--workers') out.workers = parseInt(args[++i], 10);
  }
  return out;
}

function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const csvLine = (row, cols) => cols.map((c) => csvField(row[c])).join(',') + '\n';

// Deterministic 32-bit hash of a string (xmur3 finalizer) for stable sampling.
function hashId(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// Deterministic uniform subset of 140_000 rows: keep those with the smallest game_id hashes.
// Stable across runs (so resume re-selects the same games) and independent of input order.
function sampleRows(rows, n) {
  if (rows.length <= n) return rows;
  return rows
    .map((r) => ({ r, h: hashId(String(r.game_id)) }))
    .sort((a, b) => a.h - b.h || (a.r.game_id < b.r.game_id ? -1 : 1))
    .slice(0, n)
    .map((x) => x.r);
}

function readRows(path) {
  return new Promise((res, rej) => {
    const rows = [];
    createReadStream(path)
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (r) => rows.push(r))
      .on('end', () => res(rows))
      .on('error', rej);
  });
}

function readDoneIds(path) {
  const ids = new Set();
  if (!existsSync(path)) return ids;
  const records = parse(readFileSync(path, 'utf8'), { columns: true, skip_empty_lines: true, relax_column_count: true });
  // Require evals: a row truncated by a hard interrupt has none, so it's re-evaluated rather than skipped with bad data.
  for (const r of records) if (r.game_id && r.evals) ids.add(r.game_id);
  return ids;
}

// A hard kill (SIGKILL / power loss) can leave a half-written final line in the
// output CSV. Every complete row is written with a trailing '\n', so any bytes
// after the last newline are an orphaned fragment. Drop them before we resume
// appending — otherwise the fragment sits mid-file and corrupts the row count
// for create_features.py (the affected game is re-evaluated and re-appended).
function trimPartialTail(path) {
  if (!existsSync(path)) return;
  const size = statSync(path).size;
  if (size === 0) return;
  const fd = openSync(path, 'r+');
  try {
    const tailLen = Math.min(size, 1 << 16);
    const buf = Buffer.alloc(tailLen);
    readSync(fd, buf, 0, tailLen, size - tailLen);
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl === -1) return; // no newline in tail (line longer than the window) — leave untouched
    const keep = size - tailLen + lastNl + 1;
    if (keep < size) {
      ftruncateSync(fd, keep);
      console.log(`Trimmed ${size - keep} bytes of a half-written row left by a hard interrupt.`);
    }
  } finally {
    closeSync(fd);
  }
}

async function main() {
  const { limit, workers } = parseArgs();

  if (!existsSync(INPUT_PATH)) {
    console.error(`${INPUT_PATH} not found. Run extract_games first.`);
    process.exit(1);
  }

  const allRows = await readRows(INPUT_PATH);
  if (allRows.length === 0) {
    console.log('No rows in input.');
    return;
  }

  const sampledRows = sampleRows(allRows, SAMPLE_SIZE);
  const columns = Object.keys(sampledRows[0]);

  trimPartialTail(OUTPUT_PATH);
  const doneIds = readDoneIds(OUTPUT_PATH);
  if (doneIds.size) console.log(`Resuming: ${doneIds.size} games already evaluated.`);

  let todo = sampledRows.filter((r) => !doneIds.has(r.game_id));
  if (limit != null) todo = todo.slice(0, limit);
  if (todo.length === 0) {
    console.log('Nothing to evaluate.');
    return;
  }

  const nWorkers = Math.min(workers, todo.length);
  console.log(`Evaluating ${todo.length} games at depth 12, 1 thread, ${nWorkers} workers...`);

  const newFile = !existsSync(OUTPUT_PATH) || statSync(OUTPUT_PATH).size === 0; // write header for a missing or empty file
  const sink = createWriteStream(OUTPUT_PATH, { flags: 'a' });
  if (newFile) sink.write(columns.join(',') + '\n');

  const start = Date.now();
  let nextIdx = 0;
  let completed = 0;
  let errors = 0;
  let stopping = false;
  const pending = new Map();
  const children = [];

  // Graceful interrupt: stop dispatching new games but let each worker finish (and
  // write) the game in flight, then shut workers down over IPC and exit cleanly so
  // a rerun resumes from exactly here. A second signal force-quits.
  const onSignal = (sig) => {
    if (stopping) { for (const w of children) w.kill('SIGKILL'); process.exit(130); }
    stopping = true;
    console.log(`\n${sig} received - finishing in-flight games, then stopping. Rerun to resume.`);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  await new Promise((done) => {
    let live = nWorkers;

    const dispatch = (worker) => {
      if (stopping || nextIdx >= todo.length) {
        worker.send({ type: 'shutdown' });
        return;
      }
      const id = nextIdx++;
      const row = todo[id];
      pending.set(id, row);
      worker.send({ type: 'game', id, moves: row.moves || '' });
    };

    for (let i = 0; i < nWorkers; i++) {
      const worker = fork(WORKER_PATH, [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      children.push(worker);
      worker.on('message', (msg) => {
        if (msg.type === 'ready') {
          dispatch(worker);
          return;
        }
        const row = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.type === 'result') {
          row.evals = msg.evals;
          sink.write(csvLine(row, columns));
          completed++;
          if (completed % LOG_EVERY === 0) {
            const rate = completed / ((Date.now() - start) / 1000);
            const eta = rate ? Math.round((todo.length - completed) / rate) : 0;
            const now = new Date().toTimeString().slice(0, 8);
            console.log(`${now} - ${completed}/${todo.length} games | ${rate.toFixed(1)} games/s | ETA ${eta}s`);
          }
        } else if (msg.type === 'error') {
          errors++;
          console.error(`  skipped ${row && row.game_id}: ${msg.error}`);
        }
        dispatch(worker);
      });
      worker.on('exit', () => {
        if (--live === 0) done();
      });
    }
  });

  await new Promise((res) => sink.end(res));
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`Done. Evaluated ${completed} games (${errors} skipped) in ${elapsed}s -> ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
