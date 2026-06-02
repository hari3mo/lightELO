// Child-process worker: drives one Stockfish 18 "lite-single" WASM engine to
// score chess positions exactly the way the browser app does.
//
// Why this matches the app bit-for-bit:
//   - Same engine build/net: the npm `stockfish` lite wasm is byte-identical to
//     app/public/stockfish-18-lite.wasm, and lite-single carries the same net
//     (nn-9067e33176e8). lite-single @1 thread == lite @Threads=1 (verified).
//   - Same FENs: positions are replayed with chess.js (the app's exact lib), so
//     en-passant/halfmove encoding agrees with what the app feeds the engine.
//   - Same UCI sequence + parsing as app/src/utils/stockfish.ts (White's POV,
//     mates clamped to ±100, cold TT per position).

import { createRequire } from 'module';
import { Chess } from 'chess.js';

const require = createRequire(import.meta.url);
const initEngine = require('stockfish');

const DEPTH = 12;

let engine = null;

function configure() {
  return new Promise((resolve) => {
    engine.listener = (line) => { if (line === 'readyok') resolve(); };
    engine.sendCommand('setoption name Threads value 1');
    engine.sendCommand('setoption name Hash value 64');
    engine.sendCommand('isready');
  });
}

async function boot() {
  engine = await initEngine('lite-single');
  await new Promise((resolve) => {
    engine.listener = (line) => { if (line === 'uciok') resolve(); };
    engine.sendCommand('uci');
  });
  await configure();
}

// Mirror of stockfish.ts `analyse`: resolve the position eval in pawns, White's POV.
function analyse(fen) {
  return new Promise((resolve) => {
    const sideToMove = fen.split(' ')[1] === 'b' ? -1 : 1;
    let latest = 0;
    engine.listener = (line) => {
      if (line.startsWith('info ')) {
        const mateMatch = line.match(/score mate (-?\d+)/);
        if (mateMatch) {
          const m = parseInt(mateMatch[1], 10);
          const mate = m * sideToMove;
          const whiteIsMating = m === 0 ? sideToMove < 0 : mate > 0;
          latest = whiteIsMating ? 100 : -100;
          return;
        }
        const cpMatch = line.match(/score cp (-?\d+)/);
        if (cpMatch) {
          const cp = parseInt(cpMatch[1], 10);
          latest = (cp / 100) * sideToMove;
        }
      } else if (line.startsWith('bestmove')) {
        resolve(latest);
      }
    };
    // Cold transposition table per position — matches the app's strict determinism.
    engine.sendCommand('setoption name Clear Hash');
    engine.sendCommand('ucinewgame');
    engine.sendCommand(`position fen ${fen}`);
    engine.sendCommand(`go depth ${DEPTH}`);
  });
}

// Replay a game's UCI moves and score the position after each ply (the app evals
// every move's fenAfter, including terminal positions — engine returns mate 0 there).
async function evaluateGame(moves) {
  const board = new Chess();
  const evals = [];
  for (const uci of moves.split(' ')) {
    if (!uci) continue;
    board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
    const pawns = await analyse(board.fen());
    evals.push(String(pawns)); // matches app's String(ev.pawns)
  }
  return evals.join(';');
}

await boot();
process.send({ type: 'ready' });

process.on('message', async (msg) => {
  if (msg.type === 'game') {
    try {
      const evals = await evaluateGame(msg.moves);
      process.send({ type: 'result', id: msg.id, evals });
    } catch (e) {
      process.send({ type: 'error', id: msg.id, error: String(e && e.message ? e.message : e) });
    }
  } else if (msg.type === 'shutdown') {
    process.exit(0);
  }
});
