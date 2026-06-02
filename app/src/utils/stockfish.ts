// Thin wrapper around the Stockfish 18 WASM worker.
// Exposes a Promise-based eval API with a FEN cache and a sequential UCI queue
// (UCI is single-engine so only one `go` can run at a time per worker).

const WORKER_URL = '/stockfish-18-lite-single.js';
const DEFAULT_DEPTH = 12;

export interface Evaluation {
  /** Pawn units, White's POV. Mates are clamped to ±100 so existing bar/probability math still works. */
  pawns: number;
  /** Signed mate distance in moves, White's POV (+N = White mates in N, −N = Black mates in N). Undefined for normal cp scores. */
  mate?: number;
}

type EvalListener = (e: Evaluation) => void;

class StockfishEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private cache = new Map<string, Evaluation>();
  private chain: Promise<unknown> = Promise.resolve();

  private ensureWorker(): Promise<void> {
    if (this.ready) return this.ready;

    this.worker = new Worker(WORKER_URL);
    this.ready = new Promise<void>((resolve, reject) => {
      const onErr = (e: ErrorEvent) => reject(e.error ?? new Error(e.message));
      this.worker!.addEventListener('error', onErr, { once: true });

      let uciok = false;
      const onMsg = (e: MessageEvent) => {
        const line = String(e.data ?? '');
        if (!uciok && line === 'uciok') {
          uciok = true;

          // STRICT DETERMINISM: this is the single-threaded build (no Lazy SMP),
          // so search is inherently deterministic. Threads=1 is a harmless no-op
          // here but documents intent; Hash=64 matches the training-label config.
          this.worker!.postMessage('setoption name Threads value 1');
          this.worker!.postMessage('setoption name Hash value 64');
          this.worker!.postMessage('isready');
        } else if (line === 'readyok') {
          this.worker!.removeEventListener('message', onMsg);
          resolve();
        }
      };
      this.worker!.addEventListener('message', onMsg);
      this.worker!.postMessage('uci');
    });
    return this.ready;
  }

  /** Returns the position eval, White's POV. Cached by FEN. */
  eval(fen: string, depth = DEFAULT_DEPTH, signal?: AbortSignal): Promise<Evaluation> {
    const cached = this.cache.get(fen);
    if (cached !== undefined) return Promise.resolve(cached);

    const task = async (): Promise<Evaluation> => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      await this.ensureWorker();
      // Check cache again — a previous task may have populated it.
      const c = this.cache.get(fen);
      if (c !== undefined) return c;
      const score = await this.analyse(fen, depth, signal);
      this.cache.set(fen, score);
      return score;
    };

    // Serialize: every call waits for the previous one to settle.
    const next = this.chain.then(task, task);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Subscribe to live eval updates for a single FEN (for the eval bar). */
  streamEval(
    fen: string,
    onUpdate: EvalListener,
    depth = DEFAULT_DEPTH,
    signal?: AbortSignal,
  ): Promise<Evaluation> {
    const cached = this.cache.get(fen);
    if (cached !== undefined) {
      onUpdate(cached);
      return Promise.resolve(cached);
    }
    return this.eval(fen, depth, signal).then((final) => {
      onUpdate(final);
      return final;
    });
  }

  private analyse(fen: string, depth: number, signal?: AbortSignal): Promise<Evaluation> {
    return new Promise<Evaluation>((resolve, reject) => {
      const worker = this.worker!;
      const sideToMove = fen.split(' ')[1] === 'b' ? -1 : 1;
      let latest: Evaluation = { pawns: 0 };
      let aborted = false;
      let flushTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        worker.removeEventListener('message', onMsg);
        signal?.removeEventListener('abort', onAbort);
        if (flushTimer !== undefined) clearTimeout(flushTimer);
      };

      const onMsg = (e: MessageEvent) => {
        const line = String(e.data ?? '');
        if (line.startsWith('info ')) {
          const mateMatch = line.match(/score mate (-?\d+)/);
          if (mateMatch) {
            // UCI mate distance is from the side-to-move's POV; flip to White's POV.
            const m = parseInt(mateMatch[1], 10);
            const mate = m * sideToMove;
            // m === 0 is the degenerate "side to move is already mated" → a loss for the mover.
            const whiteIsMating = m === 0 ? sideToMove < 0 : mate > 0;
            latest = { pawns: whiteIsMating ? 100 : -100, mate };
            return;
          }
          const cpMatch = line.match(/score cp (-?\d+)/);
          if (cpMatch) {
            const cp = parseInt(cpMatch[1], 10);
            // A deeper iteration may have replaced an earlier mate with a cp score.
            latest = { pawns: (cp / 100) * sideToMove };
          }
        } else if (line.startsWith('bestmove')) {
          // Consume this search's own bestmove here — including the one the
          // engine emits in response to `stop`. Tearing the listener down before
          // this arrives would leak the bestmove to the next position's search,
          // which would then resolve with a bogus 0 and poison the FEN cache.
          cleanup();
          if (aborted) reject(new DOMException('Aborted', 'AbortError'));
          else resolve(latest);
        }
      };

      const onAbort = () => {
        aborted = true;
        worker.postMessage('stop');
        // Safety net: if the engine never emits the stop-induced bestmove, don't
        // wedge the serialized queue forever — force-settle after a grace period.
        flushTimer = setTimeout(() => {
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        }, 1000);
      };

      worker.addEventListener('message', onMsg);
      signal?.addEventListener('abort', onAbort, { once: true });

      // STRICT DETERMINISM: Wipe the engine's memory before analyzing the new position
      worker.postMessage('setoption name Clear Hash');
      worker.postMessage('ucinewgame');

      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    });
  }
}

export const stockfish = new StockfishEngine();