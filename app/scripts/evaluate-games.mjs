// Stage 2 of the pipeline
// Reads extracted games, takes a deterministic SAMPLE_SIZE subset, scores every
// position with the SAME Stockfish build the browser app uses, and writes the
// eval-filled CSV consumed by create_features.
//
// Runs a pool of child-process workers (one engine each). Resumable: rows whose
// game_id is already in the output are skipped. Usage:
//   node scripts/evaluate-games.mjs [--limit N] [--workers N]

import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { createReadStream, existsSync, createWriteStream, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import os from 'os';
import { parse } from 'csv-parse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const INPUT_PATH = resolve(REPO_ROOT, 'data', 'lichess_games_raw.csv');
const OUTPUT_PATH = resolve(REPO_ROOT, 'data', 'lichess_games.csv');
const WORKER_PATH = resolve(__dirname, 'eval-worker.mjs');

const FLUSH_EVERY = 200;
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
  for (const r of records) if (r.game_id) ids.add(r.game_id);
  return ids;
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

  const newFile = !existsSync(OUTPUT_PATH);
  const sink = createWriteStream(OUTPUT_PATH, { flags: 'a' });
  if (newFile) sink.write(columns.join(',') + '\n');

  const start = Date.now();
  let nextIdx = 0;
  let completed = 0;
  let errors = 0;
  const pending = new Map();

  await new Promise((done) => {
    let live = nWorkers;

    const dispatch = (worker) => {
      if (nextIdx >= todo.length) {
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
          if (completed % FLUSH_EVERY === 0) {
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
