import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Chess } from 'chess.js';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { cryptoKeyVault } from './server/cryptoKeyVault.ts';
import {
  checkStockfishOfficialVersion,
  getActiveEngineDescriptors,
  performStockfishAutoUpdate,
  resolveStockfishAssetPath,
} from './server/stockfishUpdater.ts';

const PORT = Number(process.env.PORT) || 3000;

interface UciLineInfo {
  multipv: number;
  depth: number;
  scoreType: 'cp' | 'mate';
  scoreValue: number;
  pvUci: string[];
  pvSan: string[];
  nodes: number;
  nps: number;
  timeMs: number;
}

interface StockfishAnalysisResult {
  fen: string;
  turn: 'w' | 'b';
  isGameOver: boolean;
  isCheck: boolean;
  gameOverReason: string | null;
  gameOverKey?:
    | 'checkmate_black'
    | 'checkmate_white'
    | 'stalemate'
    | 'threefold'
    | 'insufficient'
    | 'draw'
    | null;
  bestMove: string | null;
  ponder: string | null;
  bestMoveSan: string | null;
  scoreType: 'cp' | 'mate';
  scoreValue: number;
  evaluationLabel: string;
  winProbabilityWhite: number;
  depthReached: number;
  appliedDepth: number;
  playerElo?: number;
  autoDepthByElo?: boolean;
  nodes: number;
  nps: number;
  timeMs: number;
  lines: UciLineInfo[];
  uciLog: string[];
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
  // Standard Lichess / logistic centipawn win probability curve
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

class StockfishUciEngine {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private needsFlush = false;
  private initPromise: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private lineListeners: Set<(line: string) => void> = new Set();
  private exitListeners: Set<(err: Error) => void> = new Set();
  private buffer = '';

  private resetProcessState(err?: Error): void {
    this.proc = null;
    this.ready = false;
    this.needsFlush = false;
    this.initPromise = null;
    this.buffer = '';
    const exitErr = err ?? new Error('توقفت عملية محرك Stockfish بشكل غير متوقع.');
    for (const listener of this.exitListeners) {
      listener(exitErr);
    }
    this.exitListeners.clear();
  }

  public reloadEngine(): void {
    const proc = this.proc;
    if (proc) {
      try {
        proc.kill();
      } catch {
        // ignore kill error
      }
    }
    this.resetProcessState(new Error('تم تحديث محرك Stockfish وإعادة تهيئته.'));
  }

  private async ensureReady(): Promise<void> {
    if (this.proc && this.ready) {
      if (this.needsFlush) {
        await this.flushUci();
      }
      return;
    }
    if (this.initPromise) return this.initPromise;

    const activeEngine = getActiveEngineDescriptors();
    const stockfishBinPath = activeEngine.nodeEnginePath;
    if (!fs.existsSync(stockfishBinPath)) {
      throw new Error('ملف محرك Stockfish غير موجود في المسار المحدد.');
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      const proc = spawn(process.execPath, [stockfishBinPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.proc = proc;
      this.ready = false;
      this.needsFlush = false;
      this.buffer = '';

      let gotUciOk = false;
      let settled = false;

      const cleanup = () => {
        clearTimeout(timeout);
        this.lineListeners.delete(onLine);
        this.exitListeners.delete(onEarlyExit);
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const timeout = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore kill error
        }
        fail(new Error('انتهت مهلة تهيئة محرك Stockfish UCI.'));
      }, 10000);

      const onEarlyExit = (err: Error) => {
        fail(err);
      };

      const onLine = (line: string) => {
        if (line === 'uciok' && !gotUciOk) {
          gotUciOk = true;
          proc.stdin.write('setoption name MultiPV value 3\n');
          proc.stdin.write('isready\n');
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
      this.exitListeners.add(onEarlyExit);

      proc.stdin.on('error', (err) => {
        console.error('[Stockfish stdin error]', err.message);
      });

      proc.on('error', (err) => {
        console.error('[Stockfish spawn error]', err.message);
        this.resetProcessState(new Error(`تعذر تشغيل محرك Stockfish: ${err.message}`));
        fail(new Error(`تعذر تشغيل محرك Stockfish: ${err.message}`));
      });

      proc.stdout.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString('utf8');
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() ?? '';
        for (const raw of lines) {
          const trimmed = raw.trim();
          if (!trimmed) continue;
          for (const listener of Array.from(this.lineListeners)) {
            listener(trimmed);
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString('utf8').trim();
        if (msg) console.error('[Stockfish stderr]', msg);
      });

      proc.on('exit', (code, signal) => {
        const reason = new Error(
          `أُغلقت عملية محرك Stockfish (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`
        );
        this.resetProcessState(reason);
        fail(reason);
      });

      proc.stdin.write('uci\n');
    });

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async flushUci(): Promise<void> {
    if (!this.proc) return;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        this.lineListeners.delete(onLine);
        this.exitListeners.delete(onExit);
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        this.needsFlush = false;
        reject(new Error('انتهت مهلة مزامنة محرك Stockfish.'));
      }, 5000);
      const onExit = (err: Error) => {
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
      this.exitListeners.add(onExit);
      this.proc!.stdin.write('isready\n');
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
      if (!this.proc) throw new Error('Stockfish process unavailable');

      const safeDepth = Number.isFinite(depth) ? depth : 13;
      const safeMultiPv = Number.isFinite(multiPv) ? multiPv : 3;
      const resolvedDepth =
        autoDepthByElo && typeof playerElo === 'number' && Number.isFinite(playerElo)
          ? eloToSearchDepth(playerElo)
          : safeDepth;
      const clampedDepth = Math.max(4, Math.min(20, Math.round(resolvedDepth)));
      const clampedMultiPv = Math.max(1, Math.min(3, Math.round(safeMultiPv)));
      const uciLog: string[] = [];
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
          this.exitListeners.delete(onProcessExit);
        };

        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          this.needsFlush = true;
          try {
            this.proc?.stdin.write('stop\n');
          } catch {
            // ignore write error on timeout
          }
          cleanup();
          reject(new Error('انتهت مهلة تحليل محرك Stockfish.'));
        }, 15000);

        const onProcessExit = (err: Error) => {
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

            // Normalize score to White's perspective
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
        this.exitListeners.add(onProcessExit);

        const cmds = [
          `setoption name MultiPV value ${clampedMultiPv}`,
          `position fen ${fen}`,
          `go depth ${clampedDepth}`,
        ];
        try {
          for (const cmd of cmds) {
            uciLog.push(`> ${cmd}`);
            this.proc!.stdin.write(`${cmd}\n`);
          }
        } catch (err) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(err instanceof Error ? err : new Error('تعذر إرسال الأوامر إلى محرك Stockfish.'));
          }
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

const stockfishEngine = new StockfishUciEngine();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح GEMINI_API_KEY غير مضبوط في إعدادات الخادم.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use((req: Request, res: Response, next: express.NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=*, microphone=*, display-capture=*');
    if (req.path.startsWith('/api/security') || req.path === '/api/stockfish/auto-update') {
      const origin = req.headers.origin;
      const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, '');
      const rawHost = req.headers['x-forwarded-host'] || req.headers.host;
      const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
      if (origin && ((appUrl && origin === appUrl) || (host && origin.endsWith(`://${host}`)))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    } else if (req.path.startsWith('/api')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: '4mb' }));

  const extractBearerToken = (req: Request): string => {
    const auth = req.headers.authorization;
    if (!auth || typeof auth !== 'string') return '';
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    return match ? match[1].trim() : '';
  };

  // Serve updated or bundled Stockfish WASM/JS worker files dynamically
  app.get('/stockfish/:filename', (req: Request, res: Response, next: express.NextFunction) => {
    const requested = typeof req.params.filename === 'string' ? req.params.filename : '';
    const resolved = resolveStockfishAssetPath(requested);
    if (!resolved) {
      next();
      return;
    }
    res.setHeader(
      'Content-Type',
      resolved.cleanName.endsWith('.wasm')
        ? 'application/wasm'
        : 'application/javascript; charset=utf-8'
    );
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(resolved.filePath);
  });

  // Engine Health Check Endpoint
  app.get('/api/stockfish/health', (_req: Request, res: Response) => {
    const active = getActiveEngineDescriptors();
    res.json({
      ok: fs.existsSync(active.nodeEnginePath),
      engine: active.wasmScript.replace(/\.js$/i, ''),
      installedVersion: active.installedVersion,
      installedSource: active.installedSource,
      wasmScript: active.wasmScript,
      asmScript: active.asmScript,
      updatedAt: active.updatedAt,
    });
  });

  // Check Official Stockfish Release & Installed Version
  app.get('/api/stockfish/version', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const status = await checkStockfishOfficialVersion();
      res.json(status);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'تعذر فحص أحدث إصدار لمحرك Stockfish.';
      res.status(500).json({ error: message });
    }
  });

  // Authenticated Official Stockfish Auto-Update Endpoint
  app.post('/api/stockfish/auto-update', async (req: Request, res: Response) => {
    const bearer = extractBearerToken(req);
    if (!cryptoKeyVault.verifyAdminSession(bearer)) {
      res.status(401).json({
        error: 'Admin authorization required to auto-update Stockfish engine files.',
        requiresAdminAuth: true,
        authStatus: cryptoKeyVault.getAuthStatus(''),
      });
      return;
    }

    try {
      const result = await performStockfishAutoUpdate();
      stockfishEngine.reloadEngine();
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'فشل التحديث التلقائي لمحرك Stockfish.';
      console.error('[/api/stockfish/auto-update]', message);
      res.status(502).json({ error: message });
    }
  });

  // Stockfish UCI Analysis Endpoint
  app.post('/api/stockfish/analyze', async (req: Request, res: Response) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
        fen?: unknown;
        depth?: unknown;
        multiPv?: unknown;
        playerElo?: unknown;
        autoDepthByElo?: unknown;
      };

      const fen = typeof body.fen === 'string' ? body.fen.trim() : '';
      if (!fen) {
        res.status(400).json({ error: 'يجب إرسال وضعية FEN صالحة.' });
        return;
      }

      // Validate FEN with chess.js
      try {
        new Chess(fen);
      } catch {
        res.status(400).json({ error: 'تنسيق FEN غير صالح للتحليل.' });
        return;
      }

      const rawDepth = Number(body.depth ?? 13);
      const safeDepth = Number.isFinite(rawDepth) ? rawDepth : 13;
      const rawMultiPv = Number(body.multiPv ?? 3);
      const safeMultiPv = Number.isFinite(rawMultiPv) ? rawMultiPv : 3;
      const rawElo = body.playerElo !== undefined ? Number(body.playerElo) : undefined;
      const parsedElo =
        typeof rawElo === 'number' && Number.isFinite(rawElo) ? rawElo : undefined;

      const result = await stockfishEngine.analyze(
        fen,
        safeDepth,
        safeMultiPv,
        parsedElo,
        Boolean(body.autoDepthByElo)
      );
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل تحليل Stockfish';
      console.error('[/api/stockfish/analyze]', message);
      res.status(500).json({ error: message });
    }
  });

  // Gemini Grandmaster Multilingual Commentary Endpoint
  app.post('/api/gemini/explain', async (req: Request, res: Response) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
        fen?: string;
        lastMoveSan?: string;
        lastMoveUci?: string;
        bestMoveSan?: string;
        bestMoveUci?: string;
        evaluationLabel?: string;
        turn?: 'w' | 'b';
        topLineSan?: string[];
        playerElo?: number;
        language?: string;
      };
      const {
        fen,
        lastMoveSan,
        lastMoveUci,
        bestMoveSan,
        bestMoveUci,
        evaluationLabel,
        turn,
        topLineSan,
        playerElo,
        language = 'ar',
      } = body;

      if (!fen) {
        res.status(400).json({ error: 'الوضعية FEN مطلوبة للشرح.' });
        return;
      }

      const ai = getGeminiClient();
      const targetLangMap: Record<string, string> = {
        ar: 'Arabic',
        en: 'English',
        ru: 'Russian',
        zh: 'Simplified Chinese',
        fr: 'French',
      };
      const targetLangName = targetLangMap[language] ?? 'Arabic';
      const turnLabel = turn === 'w' ? 'White' : 'Black';
      const eloContext =
        typeof playerElo === 'number'
          ? `Target player rating: ${Math.round(playerElo)} Elo (adapt tactical depth accordingly).`
          : '';
      const prompt = [
        `Current FEN: ${fen}`,
        eloContext,
        lastMoveSan
          ? `Last detected move: ${lastMoveSan} (${lastMoveUci ?? ''})`
          : 'Starting or custom position.',
        `Side to move: ${turnLabel}`,
        `Stockfish evaluation (White perspective): ${evaluationLabel ?? '0.00'}`,
        bestMoveSan
          ? `Stockfish best move: ${bestMoveSan} (${bestMoveUci ?? ''})`
          : 'No legal move available (game over).',
        topLineSan && topLineSan.length > 0
          ? `Principal variation: ${topLineSan.join(' ')}`
          : '',
        `Explain concisely and clearly in ${targetLangName} in 2 to 3 natural sentences: how the recent move affects tactical balance or central control, and why Stockfish's recommended move is optimal right now. Write clean, continuous prose suitable for direct text-to-speech without markdown symbols, bullet lists, or asterisks.`,
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: `You are a chess Grandmaster and coach explaining Stockfish analysis concisely in ${targetLangName} for direct voice narration, without markdown formatting or bullet symbols.`,
        },
      });

      const explanation = (response.text ?? '').trim();
      if (!explanation) {
        res.status(502).json({ error: 'لم يتم استلام شرح من النموذج اللغوي.' });
        return;
      }

      res.json({ explanation });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل توليد الشرح التحليلي';
      console.error('[/api/gemini/explain]', message);
      res.status(500).json({ error: message });
    }
  });

  // Gemini TTS Multilingual Voice Synthesis Endpoint
  app.post('/api/gemini/tts', async (req: Request, res: Response) => {
    try {
      const { text, voiceName = 'Kore', language = 'ar' } = req.body as {
        text?: string;
        voiceName?: string;
        language?: string;
      };

      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'النص مطلوب للتحويل الصوتي.' });
        return;
      }

      const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
      const safeVoice = allowedVoices.includes(voiceName) ? voiceName : 'Kore';
      const ttsStyleMap: Record<string, string> = {
        ar: 'معلق ومدرب شطرنج عربي رصين وواضح المخارج',
        en: 'Clear, calm, and articulate English chess grandmaster commentator',
        ru: 'Чёткий, спокойный и выразительный русскоязычный шахматный комментатор',
        zh: '清晰、沉稳、专业的中文国际象棋特级大师解说员',
        fr: 'Commentateur et entraîneur d’échecs francophone clair, calme et articulé',
      };
      const speechStyle = ttsStyleMap[language] ?? ttsStyleMap.ar;

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.trim(),
                speechMetadata: {
                  style: speechStyle,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoice },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        res.status(502).json({ error: 'تعذر توليد الصوت من نموذج التحويل الصوتي.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل توليد الصوت';
      console.error('[/api/gemini/tts]', message);
      res.status(500).json({ error: message });
    }
  });

  // Gemini Vision Board-to-FEN Position Scanner Endpoint
  app.post('/api/gemini/board-fen', async (req: Request, res: Response) => {
    try {
      const {
        imageBase64,
        mimeType = 'image/jpeg',
        playerColor = 'white',
      } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        playerColor?: 'white' | 'black';
      };

      const isBlackPerspective = playerColor === 'black';

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'بيانات الصورة مطلوبة لقراءة وضعية الرقعة.' });
        return;
      }

      const cleanedBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      if (cleanedBase64.length < 100) {
        res.status(400).json({ error: 'الصورة المرسلة فارغة أو غير صالحة.' });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
                data: cleanedBase64,
              },
            },
            {
              text: [
                'Analyze this chessboard image carefully square by square as an 8x8 matrix in visual screen order.',
                'Read strictly from the TOP row of the image (index 0) down to the BOTTOM row of the image (index 7), and from LEFT column (index 0) to RIGHT column (index 7).',
                'Do NOT mentally rotate or flip the board even if Black pieces are at the bottom — report the exact pieces as they appear visually in the image.',
                'The bottom half of the image (rows 4..7) represents the user side, and the top half (rows 0..3) represents the opponent side.',
                'Use standard FEN piece letters: uppercase PNBRQK for White pieces (lighter color), lowercase pnbrqk for Black pieces (darker color), and digits 1-8 for consecutive empty squares in each row (or "." per empty square).',
                'Return "ranks" as an array of exactly 8 strings (top visual row down to bottom visual row), where each row sums to exactly 8 squares.',
                `The player is playing as ${isBlackPerspective ? 'Black ("b")' : 'White ("w")'} from the bottom half. Ignore random hand shadows or borders.`,
                'Set "turn" to whose move it appears to be ("w" or "b"), preferring the player side if the opponent just moved.',
              ].join('\n'),
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          systemInstruction:
            'You are a precision chess board computer-vision parser. Always read the 8x8 grid strictly in visual top-to-bottom, left-to-right order without rotating coordinates.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ranks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  'Exactly 8 row strings from visual top row (index 0) to visual bottom row (index 7), left to right.',
              },
              turn: {
                type: Type.STRING,
                description: 'Side to move: "w" or "b".',
              },
              notes: {
                type: Type.STRING,
                description: 'Brief Arabic note describing the detected board state.',
              },
            },
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'لم يتمكن النموذج من قراءة الصورة.' });
        return;
      }

      const cleanJsonText = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let parsed: {
        ranks?: string[];
        turn?: string;
        notes?: string;
      };
      try {
        parsed = JSON.parse(cleanJsonText) as {
          ranks?: string[];
          turn?: string;
          notes?: string;
        };
      } catch {
        res.status(502).json({
          error: 'أعاد نموذج الرؤية استجابة غير صالحة (ليست JSON). يرجى إعادة المحاولة.',
        });
        return;
      }

      if (!Array.isArray(parsed.ranks) || parsed.ranks.length !== 8) {
        res.status(422).json({
          error: 'تعذر استخراج صفوف الرقعة الثمانية بدقة. قرّب الإطار الأزرق حول المربعات الـ 64 وحاول مجدداً.',
        });
        return;
      }

      // Parse visual screen-space 8x8 matrix (top-to-bottom, left-to-right)
      const screenMatrix: string[][] = [];
      let whiteKings = 0;
      let blackKings = 0;

      for (const rawRank of parsed.ranks) {
        const cleanRank = String(rawRank).trim();
        const expanded: string[] = [];
        for (const ch of cleanRank) {
          if (ch >= '1' && ch <= '8') {
            const empties = Number(ch);
            for (let k = 0; k < empties; k++) expanded.push('');
          } else if (ch === '.' || ch === '_' || ch === '-') {
            expanded.push('');
          } else if ('pnbrqkPNBRQK'.includes(ch)) {
            if (ch === 'K') whiteKings++;
            if (ch === 'k') blackKings++;
            expanded.push(ch);
          }
        }
        if (expanded.length !== 8) {
          res.status(422).json({
            error: 'تعذر محاذاة جميع الصفوف (8×8). يرجى ضبط الزوايا الأربع بدقة على حدود المربعات ثم المحاولة.',
          });
          return;
        }
        screenMatrix.push(expanded);
      }

      if (whiteKings !== 1 || blackKings !== 1) {
        res.status(422).json({
          error: 'لم يتم التعرف على الملكين بشكل صحيح. تأكد من شمول كامل الرقعة داخل الإطار السماوي.',
        });
        return;
      }

      // Programmatically flip 180 degrees when playing Black (bottom half is always player's area)
      const canonicalGrid: string[][] = isBlackPerspective
        ? Array.from({ length: 8 }, (_, r) =>
            Array.from({ length: 8 }, (_, c) => screenMatrix[7 - r][7 - c])
          )
        : screenMatrix;

      const normalizedRanks: string[] = canonicalGrid.map((row) => {
        let encoded = '';
        let emptyCount = 0;
        for (const sq of row) {
          if (sq === '') {
            emptyCount++;
          } else {
            if (emptyCount > 0) {
              encoded += String(emptyCount);
              emptyCount = 0;
            }
            encoded += sq;
          }
        }
        if (emptyCount > 0) encoded += String(emptyCount);
        return encoded;
      });

      const placement = normalizedRanks.join('/');

      // Infer plausible castling rights from actual king/rook positions
      let castling = '';
      if (canonicalGrid[7]?.[4] === 'K') {
        if (canonicalGrid[7]?.[7] === 'R') castling += 'K';
        if (canonicalGrid[7]?.[0] === 'R') castling += 'Q';
      }
      if (canonicalGrid[0]?.[4] === 'k') {
        if (canonicalGrid[0]?.[7] === 'r') castling += 'k';
        if (canonicalGrid[0]?.[0] === 'r') castling += 'q';
      }
      if (!castling) castling = '-';

      // Prefer the player's turn to immediately generate the optimal UCI reply
      const playerTurn: 'w' | 'b' = isBlackPerspective ? 'b' : 'w';
      const preferredTurn: 'w' | 'b' =
        parsed.turn === 'w' || parsed.turn === 'b' ? parsed.turn : playerTurn;
      const candidateA = `${placement} ${playerTurn} ${castling} - 0 1`;
      const altTurn: 'w' | 'b' = playerTurn === 'w' ? 'b' : 'w';
      const candidateB = `${placement} ${altTurn} ${castling} - 0 1`;

      let validFen: string | null = null;
      let resolvedTurn: 'w' | 'b' = preferredTurn;

      try {
        new Chess(candidateA);
        validFen = candidateA;
        resolvedTurn = playerTurn;
      } catch {
        try {
          new Chess(candidateB);
          validFen = candidateB;
          resolvedTurn = altTurn;
        } catch {
          validFen = null;
        }
      }

      if (!validFen) {
        res.status(422).json({
          error: 'الوضعية المقروءة غير صالحة قانونياً (ربما يوجد كش مزدوج أو بيادق في الصف الأول/الأخير). حاول ضبط الزوايا وإعادة المسح.',
        });
        return;
      }

      res.json({
        fen: validFen,
        turn: resolvedTurn,
        screenMatrix,
        flippedForBlack: isBlackPerspective,
        notes: parsed.notes ?? 'تمت قراءة الوضعية بنجاح.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشلت قراءة الرقعة بالذكاء الاصطناعي.';
      console.error('[/api/gemini/board-fen]', message);
      res.status(500).json({ error: message });
    }
  });

  // Direct Project Source ZIP Download Endpoint
  app.get('/api/download/app.zip', (_req: Request, res: Response) => {
    try {
      const rootDir = process.cwd();
      const excludedNames = new Set([
        'node_modules',
        'dist',
        'dev-dist',
        'android',
        'build',
        '.git',
        '.env',
        '.env.local',
        '.DS_Store',
        '.stockfish-runtime',
      ]);

      const files: { relPath: string; data: Buffer }[] = [];
      const walk = (dir: string, prefix: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (excludedNames.has(entry.name) || entry.name.startsWith('.env.')) {
            continue;
          }
          const full = path.join(dir, entry.name);
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            walk(full, rel);
          } else if (entry.isFile()) {
            files.push({ relPath: rel, data: fs.readFileSync(full) });
          }
        }
      };
      walk(rootDir, '');

      const localChunks: Buffer[] = [];
      const centralChunks: Buffer[] = [];
      let offset = 0;

      for (const file of files) {
        const nameBuf = Buffer.from(file.relPath, 'utf8');
        const compressed = zlib.deflateRawSync(file.data);
        const crc = zlib.crc32(file.data) >>> 0;

        // Local file header (30 bytes + filename)
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4); // version needed
        localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
        localHeader.writeUInt16LE(8, 8); // deflate
        localHeader.writeUInt16LE(0, 10);
        localHeader.writeUInt16LE(0, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(compressed.length, 18);
        localHeader.writeUInt32LE(file.data.length, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);

        localChunks.push(localHeader, nameBuf, compressed);

        // Central directory header (46 bytes + filename)
        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(8, 10);
        centralHeader.writeUInt16LE(0, 12);
        centralHeader.writeUInt16LE(0, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(compressed.length, 20);
        centralHeader.writeUInt32LE(file.data.length, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(offset, 42);

        centralChunks.push(centralHeader, nameBuf);
        offset += localHeader.length + nameBuf.length + compressed.length;
      }

      const centralDir = Buffer.concat(centralChunks);
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(0, 4);
      eocd.writeUInt16LE(0, 6);
      eocd.writeUInt16LE(files.length, 8);
      eocd.writeUInt16LE(files.length, 10);
      eocd.writeUInt32LE(centralDir.length, 12);
      eocd.writeUInt32LE(offset, 16);
      eocd.writeUInt16LE(0, 20);

      const zipBuffer = Buffer.concat([...localChunks, centralDir, eocd]);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="chess-vision-uci-app.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل تجهيز ملف التنزيل';
      console.error('[/api/download/app.zip]', message);
      res.status(500).json({ error: message });
    }
  });

  // ==================== Cryptographic Key Vault & Rotation API ====================

  app.get('/api/security/public-keys', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(cryptoKeyVault.getPublicKeyBundle());
  });

  app.get('/api/security/auth-status', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(cryptoKeyVault.getAuthStatus(extractBearerToken(req)));
  });

  app.post('/api/security/admin/claim', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { passcode?: unknown };
    const passcode = typeof body.passcode === 'string' ? body.passcode : '';
    const result = cryptoKeyVault.claimAdminPasscode(passcode);
    if (!result.ok) {
      const status = result.error?.includes('already') ? 409 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, token: result.token });
  });

  app.post('/api/security/admin/login', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { passcode?: unknown };
    const passcode = typeof body.passcode === 'string' ? body.passcode : '';
    const result = cryptoKeyVault.loginWithPasscode(passcode);
    if (!result.ok) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json({ ok: true, token: result.token });
  });

  app.post('/api/security/admin/logout', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (token) {
      cryptoKeyVault.revokeAdminSession(token);
    }
    res.json({ ok: true });
  });

  app.post('/api/security/issue-token', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      subject?: unknown;
      scope?: unknown;
      ttlSeconds?: unknown;
      nonce?: unknown;
      timestamp?: unknown;
      clientPublicJwk?: unknown;
      clientProofB64Url?: unknown;
    };

    const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : '';
    const timestamp = Number(body.timestamp);
    const replayCheck = cryptoKeyVault.consumeAntiReplayNonce(nonce, timestamp);
    if (!replayCheck.ok) {
      res.status(400).json({ error: replayCheck.error });
      return;
    }

    const popCheck = cryptoKeyVault.verifyClientPopProof({
      clientPublicJwk: (body.clientPublicJwk ?? {}) as {
        kty?: string;
        crv?: string;
        x?: string;
        y?: string;
      },
      clientProofB64Url:
        typeof body.clientProofB64Url === 'string' ? body.clientProofB64Url : '',
      nonce,
      timestamp,
    });
    if (!popCheck.ok) {
      res.status(403).json({ error: popCheck.error });
      return;
    }

    const subject =
      typeof body.subject === 'string' && body.subject.trim()
        ? body.subject.trim()
        : 'chessvision-client';
    const scope =
      typeof body.scope === 'string' && body.scope.trim() ? body.scope.trim() : 'engine:verified';
    const ttlSeconds =
      typeof body.ttlSeconds === 'number' && Number.isFinite(body.ttlSeconds)
        ? body.ttlSeconds
        : 300;

    const issued = cryptoKeyVault.issueSignedToken({
      subject,
      scope,
      ttlSeconds,
      clientThumbprint: popCheck.thumbprint,
    });
    res.json({
      ...issued,
      clientThumbprint: popCheck.thumbprint,
    });
  });

  app.post('/api/security/verify', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    res.json(cryptoKeyVault.verifySignedToken(token));
  });

  app.post('/api/security/rotate', (req: Request, res: Response) => {
    const bearer = extractBearerToken(req);
    if (!cryptoKeyVault.verifyAdminSession(bearer)) {
      res.status(401).json({ error: 'Admin authorization required to rotate cryptographic keys.' });
      return;
    }
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { reason?: unknown };
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim()
        : 'manual-programmatic-rotation';
    const rotatedKey = cryptoKeyVault.rotateKeys(reason);
    res.json({
      ok: true,
      rotatedKey,
      bundle: cryptoKeyVault.getPublicKeyBundle(),
    });
  });

  app.post('/api/security/policy', (req: Request, res: Response) => {
    const bearer = extractBearerToken(req);
    if (!cryptoKeyVault.verifyAdminSession(bearer)) {
      res.status(401).json({ error: 'Admin authorization required to update rotation policy.' });
      return;
    }
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      autoRotateEnabled?: unknown;
      rotationIntervalSeconds?: unknown;
      graceWindowSeconds?: unknown;
    };
    const policy = cryptoKeyVault.updatePolicy({
      autoRotateEnabled:
        typeof body.autoRotateEnabled === 'boolean' ? body.autoRotateEnabled : undefined,
      rotationIntervalSeconds:
        typeof body.rotationIntervalSeconds === 'number'
          ? body.rotationIntervalSeconds
          : undefined,
      graceWindowSeconds:
        typeof body.graceWindowSeconds === 'number' ? body.graceWindowSeconds : undefined,
    });
    res.json({
      ok: true,
      policy,
      bundle: cryptoKeyVault.getPublicKeyBundle(),
    });
  });

  // Ensure unmatched /api/* routes always return valid JSON (never HTML fallback)
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'نقطة نهاية API غير موجودة.' });
  });

  // Global Express JSON Error Handler for /api/* (e.g., malformed JSON body or 413 payload errors)
  app.use(
    (
      err: unknown,
      req: Request,
      res: Response,
      next: express.NextFunction
    ) => {
      if (!req.originalUrl.startsWith('/api')) {
        next(err);
        return;
      }
      const typed = err as { status?: number; type?: string; message?: string };
      const status = typeof typed?.status === 'number' && typed.status >= 400 ? typed.status : 500;
      const errorMessage =
        typed?.type === 'entity.parse.failed'
          ? 'بيانات الطلب المرسلة ليست بصيغة JSON صالحة.'
          : typed?.type === 'entity.too.large'
          ? 'حجم البيانات المرسلة يتجاوز الحد المسموح.'
          : 'حدث خطأ غير متوقع في خادم المحرك.';
      res.status(status).json({ error: errorMessage });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
          }
        },
      })
    );
    app.get('/{*splat}', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ChessVision UCI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
