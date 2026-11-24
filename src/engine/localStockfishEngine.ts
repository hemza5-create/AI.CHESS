import { Chess } from 'chess.js';
import type { StockfishAnalysisResult, UciLineInfo } from '../types/chess.ts';

export interface LocalEngineVerificationResult {
  ok: boolean;
  backend: 'wasm' | 'asm' | null;
  engineName: string | null;
  latencyMs: number;
  bestMove: string | null;
  nps: number;
  checkedAt: string;
  error?: string;
}

function eloToSearchDepth(elo: number): number {
  const clamped = Math.max(800, Math.min(2800, Math.round(elo)));
  return Math.max(5, Math.min(18, Math.round(5 + ((clamped - 800) / 2000) * 13)));
}

function uciListToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen);
  const sanMoves: string[] = [];
  for (const uci of uciMoves) {
    if (!uci || uci.length < 4) break;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    try {
      const move = chess.move({ from, to, promotion });
      if (!move) break;
      sanMoves.push(move.san);
    } catch {
      break;
    }
  }
  return sanMoves;
}

function cpToWinProbabilityWhite(scoreType: 'cp' | 'mate', whiteVal: number): number {
  if (scoreType === 'mate') {
    if (whiteVal > 0) return 99.5;
    if (whiteVal < 0) return 0.5;
    return 50;
  }
  const prob = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * whiteVal)) - 1);
  return Math.max(0.5, Math.min(99.5, Number(prob.toFixed(1))));
}

function formatEvaluationLabel(scoreType: 'cp' | 'mate', whiteVal: number): string {
  if (scoreType === 'mate') {
    const abs = Math.abs(whiteVal);
    return whiteVal > 0 ? `+M${abs}` : `-M${abs}`;
  }
  const pawns = whiteVal / 100;
  const sign = pawns > 0 ? '+' : '';
  return `${sign}${pawns.toFixed(2)}`;
}

const WORKER_CANDIDATES: { url: string; backend: 'wasm' | 'asm' }[] = [
  { url: '/stockfish/stockfish-19-lite-single.js', backend: 'wasm' },
  { url: '/stockfish/stockfish-19-asm.js', backend: 'asm' },
];

const VERIFICATION_TEST_FEN =
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

class LocalStockfishEngine {
  private worker: Worker | null = null;
  private ready = false;
  private needsFlush = false;
  private activeBackend: 'wasm' | 'asm' | null = null;
  private engineName: string | null = null;
  private initPromise: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private lineListeners: Set<(line: string) => void> = new Set();
  private errorListeners: Set<(err: Error) => void> = new Set();

  public getActiveBackend(): 'wasm' | 'asm' | null {
    return this.activeBackend;
  }

  public getEngineName(): string | null {
    return this.engineName;
  }

  public isEngineReady(): boolean {
    return Boolean(this.worker && this.ready);
  }

  private resetWorker(err?: Error): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore termination error
      }
    }
    this.worker = null;
    this.ready = false;
    this.needsFlush = false;
    this.activeBackend = null;
    this.engineName = null;
    this.initPromise = null;
    const reason = err ?? new Error('توقف محرك Stockfish المحلي بشكل غير متوقع.');
    for (const listener of this.errorListeners) {
      listener(reason);
    }
    this.errorListeners.clear();
  }

  public clearCache(): void {
    this.resetWorker(new Error('تمت إعادة تهيئة ذاكرة محرك Stockfish.'));
  }

  public async warmup(): Promise<'wasm' | 'asm' | null> {
    try {
      await this.ensureReady();
      return this.activeBackend;
    } catch {
      return null;
    }
  }

  public async verifyLocalEngine(locale = 'en-US'): Promise<LocalEngineVerificationResult> {
    const startMs = Date.now();
    const checkedAt = new Date().toLocaleTimeString(locale, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    try {
      const result = await this.analyze(VERIFICATION_TEST_FEN, 7, 1);
      const latencyMs = Math.max(1, Date.now() - startMs);
      const ok = Boolean(this.worker && this.ready && result.bestMove);
      return {
        ok,
        backend: this.activeBackend,
        engineName: this.engineName ?? 'Stockfish 19',
        latencyMs,
        bestMove: result.bestMoveSan ?? result.bestMove,
        nps: result.nps,
        checkedAt,
      };
    } catch (err) {
      return {
        ok: false,
        backend: this.activeBackend,
        engineName: this.engineName,
        latencyMs: Math.max(1, Date.now() - startMs),
        bestMove: null,
        nps: 0,
        checkedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async startWorkerScript(scriptUrl: string): Promise<void> {
    if (typeof globalThis.Worker === 'undefined') {
      throw new Error('المتصفح أو WebView لا يدعم Web Workers لتشغيل Stockfish محلياً.');
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let gotUciOk = false;

      const worker = new globalThis.Worker(scriptUrl);
      this.worker = worker;
      this.ready = false;
      this.needsFlush = false;
      this.engineName = null;

      const cleanup = () => {
        clearTimeout(timeout);
        this.lineListeners.delete(onLine);
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          worker.terminate();
        } catch {
          // ignore
        }
        if (this.worker === worker) {
          this.worker = null;
          this.ready = false;
        }
        reject(err);
      };

      const timeout = setTimeout(() => {
        fail(new Error(`انتهت مهلة تهيئة محرك Stockfish المحلي (${scriptUrl}).`));
      }, 12000);

      const onLine = (line: string) => {
        if (line.startsWith('id name ')) {
          this.engineName = line.slice('id name '.length).trim() || null;
        } else if (line === 'uciok' && !gotUciOk) {
          gotUciOk = true;
          worker.postMessage('setoption name MultiPV value 3');
          worker.postMessage('isready');
        } else if (line === 'readyok') {
          this.ready = true;
          if (!settled) {
            settled = true;
            cleanup();
            resolve();
          }
        }
      };

      this.lineListeners.add(onLine);

      worker.onmessage = (event: MessageEvent<unknown>) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
        const lines = raw.split(/\r?\n/);
        for (const item of lines) {
          const trimmed = item.trim();
          if (!trimmed) continue;
          for (const listener of Array.from(this.lineListeners)) {
            listener(trimmed);
          }
        }
      };

      worker.onerror = (event: ErrorEvent) => {
        const err = new Error(event.message || 'تعذر تشغيل عامل محرك Stockfish المحلي.');
        if (!settled) {
          fail(err);
        } else {
          this.resetWorker(err);
        }
      };

      worker.postMessage('uci');
    });
  }

  private async ensureReady(): Promise<void> {
    if (this.worker && this.ready) {
      if (this.needsFlush) {
        await this.flushUci();
      }
      return;
    }
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      let lastError: Error | null = null;
      for (const candidate of WORKER_CANDIDATES) {
        try {
          await this.startWorkerScript(candidate.url);
          this.activeBackend = candidate.backend;
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
      throw lastError ?? new Error('تعذر تشغيل محرك Stockfish المحلي.');
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async flushUci(): Promise<void> {
    if (!this.worker) return;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        this.lineListeners.delete(onLine);
        this.errorListeners.delete(onErr);
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.needsFlush = false;
        cleanup();
        reject(new Error('انتهت مهلة مزامنة محرك Stockfish المحلي.'));
      }, 6000);
      const onErr = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };
      const onLine = (line: string) => {
        if (line === 'readyok') {
          if (settled) return;
          settled = true;
          this.needsFlush = false;
          cleanup();
          resolve();
        }
      };
      this.lineListeners.add(onLine);
      this.errorListeners.add(onErr);
      this.worker!.postMessage('isready');
    });
  }

  public analyze(
    fen: string,
    depth: number,
    multiPv = 3,
    playerElo?: number,
    autoDepthByElo = false
  ): Promise<StockfishAnalysisResult> {
    const runTask = async (): Promise<StockfishAnalysisResult> => {
      const chess = new Chess(fen);
      const turn = chess.turn();
      const isGameOver = chess.isGameOver();
      let gameOverReason: string | null = null;
      let gameOverKey:
        | 'checkmate_black'
        | 'checkmate_white'
        | 'stalemate'
        | 'threefold'
        | 'insufficient'
        | 'draw'
        | null = null;

      if (chess.isCheckmate()) {
        gameOverKey = turn === 'w' ? 'checkmate_black' : 'checkmate_white';
        gameOverReason = turn === 'w' ? 'كش مات لصالح الأسود' : 'كش مات لصالح الأبيض';
      } else if (chess.isStalemate()) {
        gameOverKey = 'stalemate';
        gameOverReason = 'تعادل بالردب (Stalemate)';
      } else if (chess.isThreefoldRepetition()) {
        gameOverKey = 'threefold';
        gameOverReason = 'تعادل بتكرار الوضعية ثلاث مرات';
      } else if (chess.isInsufficientMaterial()) {
        gameOverKey = 'insufficient';
        gameOverReason = 'تعادل لعدم كفاية القطع';
      } else if (chess.isDraw()) {
        gameOverKey = 'draw';
        gameOverReason = 'تعادل';
      }

      if (isGameOver) {
        const scoreVal = chess.isCheckmate() ? (turn === 'w' ? -1 : 1) : 0;
        const scoreType: 'cp' | 'mate' = chess.isCheckmate() ? 'mate' : 'cp';
        return {
          fen,
          turn,
          isGameOver: true,
          isCheck: chess.inCheck(),
          gameOverReason,
          gameOverKey,
          bestMove: null,
          ponder: null,
          bestMoveSan: null,
          scoreType,
          scoreValue: scoreVal,
          evaluationLabel: chess.isCheckmate()
            ? turn === 'w'
              ? '-M0'
              : '+M0'
            : '0.00',
          winProbabilityWhite: chess.isCheckmate() ? (turn === 'w' ? 0 : 100) : 50,
          depthReached: 0,
          appliedDepth: 0,
          playerElo,
          autoDepthByElo,
          nodes: 0,
          nps: 0,
          timeMs: 0,
          lines: [],
          uciLog: [`> position fen ${fen}`, '< game over'],
        };
      }

      await this.ensureReady();
      if (!this.worker) {
        throw new Error('محرك Stockfish المحلي غير متاح حالياً.');
      }

      const safeDepth = Number.isFinite(depth) ? depth : 13;
      const safeMultiPv = Number.isFinite(multiPv) ? multiPv : 3;
      const resolvedDepth =
        autoDepthByElo && typeof playerElo === 'number' && Number.isFinite(playerElo)
          ? eloToSearchDepth(playerElo)
          : safeDepth;
      // Cap local WebView worker depth at 15 for responsive mobile performance
      const clampedDepth = Math.max(4, Math.min(15, Math.round(resolvedDepth)));
      const clampedMultiPv = Math.max(1, Math.min(3, Math.round(safeMultiPv)));
      const uciLog: string[] = [
        this.activeBackend === 'asm'
          ? '> info string Local Stockfish 19 JS Fallback (Offline-Ready)'
          : '> info string Local Stockfish 19 WebAssembly (Offline-Ready)',
      ];
      if (autoDepthByElo && typeof playerElo === 'number' && Number.isFinite(playerElo)) {
        uciLog.push(`> info string Elo ${Math.round(playerElo)} -> Auto Search Depth ${clampedDepth}`);
      }

      const pvMap = new Map<number, UciLineInfo>();
      const startTime = Date.now();

      return new Promise<StockfishAnalysisResult>((resolve, reject) => {
        let settled = false;

        const cleanup = () => {
          clearTimeout(timeout);
          this.lineListeners.delete(onLine);
          this.errorListeners.delete(onWorkerError);
        };

        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          this.needsFlush = true;
          try {
            this.worker?.postMessage('stop');
          } catch {
            // ignore
          }
          cleanup();
          reject(new Error('انتهت مهلة تحليل محرك Stockfish المحلي.'));
        }, 15000);

        const onWorkerError = (err: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        };

        const onLine = (line: string) => {
          if (line.startsWith('info ')) {
            if (!line.includes(' pv ')) return;
            uciLog.push(`< ${line}`);

            const depthMatch = /\bdepth (\d+)/.exec(line);
            const multipvMatch = /\bmultipv (\d+)/.exec(line);
            const cpMatch = /\bscore cp (-?\d+)/.exec(line);
            const mateMatch = /\bscore mate (-?\d+)/.exec(line);
            const isBound = /\b(?:upperbound|lowerbound)\b/.test(line);
            const nodesMatch = /\bnodes (\d+)/.exec(line);
            const npsMatch = /\bnps (\d+)/.exec(line);
            const timeMatch = /\btime (\d+)/.exec(line);
            const pvMatch = /\bpv (.+)$/.exec(line);

            const parsedDepth = depthMatch ? Number(depthMatch[1]) : 0;
            const parsedMultiPv = multipvMatch ? Number(multipvMatch[1]) : 1;
            const pvUci = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

            const existing = pvMap.get(parsedMultiPv);
            if (isBound && existing && existing.depth >= parsedDepth) {
              return;
            }

            let scoreType: 'cp' | 'mate' = 'cp';
            let rawScore = 0;
            if (mateMatch) {
              scoreType = 'mate';
              rawScore = Number(mateMatch[1]);
            } else if (cpMatch) {
              scoreType = 'cp';
              rawScore = Number(cpMatch[1]);
            }

            const whiteScore = turn === 'b' ? -rawScore : rawScore;

            pvMap.set(parsedMultiPv, {
              multipv: parsedMultiPv,
              depth: parsedDepth,
              scoreType,
              scoreValue: whiteScore,
              pvUci,
              pvSan: uciListToSan(fen, pvUci.slice(0, 6)),
              nodes: nodesMatch ? Number(nodesMatch[1]) : 0,
              nps: npsMatch ? Number(npsMatch[1]) : 0,
              timeMs: timeMatch ? Number(timeMatch[1]) : Date.now() - startTime,
            });
          } else if (line.startsWith('bestmove ')) {
            if (settled) return;
            settled = true;
            cleanup();
            uciLog.push(`< ${line}`);

            const parts = line.split(/\s+/);
            const bestMove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
            const ponderIdx = parts.indexOf('ponder');
            const ponder =
              ponderIdx !== -1 && parts[ponderIdx + 1] ? parts[ponderIdx + 1] : null;

            const sortedLines = Array.from(pvMap.values())
              .sort((a, b) => a.multipv - b.multipv)
              .slice(0, clampedMultiPv);

            const primary = sortedLines[0];
            const bestMoveSan = bestMove ? uciListToSan(fen, [bestMove])[0] ?? bestMove : null;
            const scoreType = primary?.scoreType ?? 'cp';
            const scoreValue = primary?.scoreValue ?? 0;

            resolve({
              fen,
              turn,
              isGameOver: false,
              isCheck: chess.inCheck(),
              gameOverReason: null,
              bestMove,
              ponder,
              bestMoveSan,
              scoreType,
              scoreValue,
              evaluationLabel: formatEvaluationLabel(scoreType, scoreValue),
              winProbabilityWhite: cpToWinProbabilityWhite(scoreType, scoreValue),
              depthReached: primary?.depth ?? clampedDepth,
              appliedDepth: clampedDepth,
              playerElo,
              autoDepthByElo,
              nodes: primary?.nodes ?? 0,
              nps: primary?.nps ?? 0,
              timeMs: primary?.timeMs ?? Date.now() - startTime,
              lines: sortedLines,
              uciLog: uciLog.slice(-18),
            });
          }
        };

        this.lineListeners.add(onLine);
        this.errorListeners.add(onWorkerError);

        const cmds = [
          `setoption name MultiPV value ${clampedMultiPv}`,
          `position fen ${fen}`,
          `go depth ${clampedDepth}`,
        ];
        for (const cmd of cmds) {
          uciLog.push(`> ${cmd}`);
          this.worker!.postMessage(cmd);
        }
      });
    };

    const next = this.queue.then(runTask, runTask);
    this.queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}

export const localStockfishEngine = new LocalStockfishEngine();
