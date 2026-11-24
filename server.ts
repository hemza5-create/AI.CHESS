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

const PORT = Number(process.env.PORT) || 3000;
const STOCKFISH_BIN = path.resolve(
  process.cwd(),
  'node_modules/stockfish/bin/stockfish-19-lite-single.js'
);

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
  private initPromise: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private lineListeners: Set<(line: string) => void> = new Set();
  private buffer = '';

  private async ensureReady(): Promise<void> {
    if (this.proc && this.ready) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      const proc = spawn(process.execPath, [STOCKFISH_BIN], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.proc = proc;
      this.ready = false;
      this.buffer = '';

      let gotUciOk = false;
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Stockfish UCI initialization timed out'));
      }, 10000);

      const onLine = (line: string) => {
        if (line === 'uciok' && !gotUciOk) {
          gotUciOk = true;
          proc.stdin.write('setoption name MultiPV value 3\n');
          proc.stdin.write('isready\n');
        } else if (line === 'readyok') {
          this.ready = true;
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.lineListeners.delete(onLine);
      };

      this.lineListeners.add(onLine);

      proc.stdout.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString('utf8');
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() ?? '';
        for (const raw of lines) {
          const trimmed = raw.trim();
          if (!trimmed) continue;
          for (const listener of this.lineListeners) {
            listener(trimmed);
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString('utf8').trim();
        if (msg) console.error('[Stockfish stderr]', msg);
      });

      proc.on('exit', () => {
        this.proc = null;
        this.ready = false;
        this.initPromise = null;
      });

      proc.stdin.write('uci\n');
    });

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
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
      if (chess.isCheckmate()) {
        gameOverReason = turn === 'w' ? 'كش مات لصالح الأسود' : 'كش مات لصالح الأبيض';
      } else if (chess.isStalemate()) {
        gameOverReason = 'تعادل بالردب (Stalemate)';
      } else if (chess.isThreefoldRepetition()) {
        gameOverReason = 'تعادل بتكرار الوضعية ثلاث مرات';
      } else if (chess.isInsufficientMaterial()) {
        gameOverReason = 'تعادل لعدم كفاية القطع';
      } else if (chess.isDraw()) {
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

      const resolvedDepth =
        autoDepthByElo && typeof playerElo === 'number' && !Number.isNaN(playerElo)
          ? eloToSearchDepth(playerElo)
          : depth;
      const clampedDepth = Math.max(4, Math.min(20, Math.round(resolvedDepth)));
      const clampedMultiPv = Math.max(1, Math.min(3, Math.round(multiPv)));
      const uciLog: string[] = [];
      if (autoDepthByElo && typeof playerElo === 'number') {
        uciLog.push(`> info string Elo ${Math.round(playerElo)} -> Auto Search Depth ${clampedDepth}`);
      }
      const pvMap = new Map<number, UciLineInfo>();
      const startTime = Date.now();

      return new Promise<StockfishAnalysisResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.proc?.stdin.write('stop\n');
          this.lineListeners.delete(onLine);
          reject(new Error('Stockfish search timed out'));
        }, 15000);

        const onLine = (line: string) => {
          if (line.startsWith('info ')) {
            if (!line.includes(' pv ')) return;
            uciLog.push(`< ${line}`);

            const depthMatch = /\bdepth (\d+)/.exec(line);
            const multipvMatch = /\bmultipv (\d+)/.exec(line);
            const cpMatch = /\bscore cp (-?\d+)/.exec(line);
            const mateMatch = /\bscore mate (-?\d+)/.exec(line);
            const nodesMatch = /\bnodes (\d+)/.exec(line);
            const npsMatch = /\bnps (\d+)/.exec(line);
            const timeMatch = /\btime (\d+)/.exec(line);
            const pvMatch = /\bpv (.+)$/.exec(line);

            const parsedDepth = depthMatch ? Number(depthMatch[1]) : 0;
            const parsedMultiPv = multipvMatch ? Number(multipvMatch[1]) : 1;
            const pvUci = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

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
            clearTimeout(timeout);
            this.lineListeners.delete(onLine);
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

        const cmds = [
          `setoption name MultiPV value ${clampedMultiPv}`,
          `position fen ${fen}`,
          `go depth ${clampedDepth}`,
        ];
        for (const cmd of cmds) {
          uciLog.push(`> ${cmd}`);
          this.proc!.stdin.write(`${cmd}\n`);
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
  app.use(express.json({ limit: '4mb' }));

  // Stockfish UCI Analysis Endpoint
  app.post('/api/stockfish/analyze', async (req: Request, res: Response) => {
    try {
      const {
        fen,
        depth = 13,
        multiPv = 3,
        playerElo,
        autoDepthByElo = false,
      } = req.body as {
        fen?: string;
        depth?: number;
        multiPv?: number;
        playerElo?: number;
        autoDepthByElo?: boolean;
      };

      if (!fen || typeof fen !== 'string') {
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

      const parsedElo =
        typeof playerElo === 'number' && !Number.isNaN(playerElo) ? playerElo : undefined;
      const result = await stockfishEngine.analyze(
        fen,
        Number(depth),
        Number(multiPv),
        parsedElo,
        Boolean(autoDepthByElo)
      );
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل تحليل Stockfish';
      console.error('[/api/stockfish/analyze]', message);
      res.status(500).json({ error: message });
    }
  });

  // Gemini Grandmaster Arabic Commentary Endpoint
  app.post('/api/gemini/explain', async (req: Request, res: Response) => {
    try {
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
      } = req.body as {
        fen?: string;
        lastMoveSan?: string;
        lastMoveUci?: string;
        bestMoveSan?: string;
        bestMoveUci?: string;
        evaluationLabel?: string;
        turn?: 'w' | 'b';
        topLineSan?: string[];
        playerElo?: number;
      };

      if (!fen) {
        res.status(400).json({ error: 'الوضعية FEN مطلوبة للشرح.' });
        return;
      }

      const ai = getGeminiClient();
      const turnArabic = turn === 'w' ? 'الأبيض' : 'الأسود';
      const eloContext =
        typeof playerElo === 'number'
          ? `مستوى اللاعب المستهدف: ${Math.round(playerElo)} Elo (كيّف عمق المصطلحات التكتيكية ليناسب هذا التقييم).`
          : '';
      const prompt = [
        `الوضعية الحالية (FEN): ${fen}`,
        eloContext,
        lastMoveSan
          ? `النقلة المرصودة للتو: ${lastMoveSan} (${lastMoveUci ?? ''})`
          : 'الوضعية الابتدائية أو وضعية مخصصة.',
        `الدور الآن على: ${turnArabic}`,
        `تقييم محرك Stockfish (من منظور الأبيض): ${evaluationLabel ?? '0.00'}`,
        bestMoveSan
          ? `أفضل نقلة مقترحة من Stockfish: ${bestMoveSan} (${bestMoveUci ?? ''})`
          : 'لا توجد نقلة متاحة (نهاية الدور).',
        topLineSan && topLineSan.length > 0
          ? `التفريع الرئيسي المتوقع: ${topLineSan.join(' ')}`
          : '',
        'اشرح بإيجاز ووضوح باللغة العربية الفصحى في جملتين إلى ثلاث جمل: أثر النقلة المرصودة على التوازن التكتيكي أو السيطرة على الوسط، ولماذا تعد نقلة Stockfish المقترحة هي الرد الأمثل الآن. اكتب نصاً متصلاً قابلاً للقراءة الصوتية المباشرة بدون رموز أو قوائم أو إنجليزية زائدة.',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'أنت أستاذ كبير ومدرب شطرنج محترف تشرح تحليلات محرك Stockfish باللغة العربية الفصحى بأسلوب موجز وواضح ومناسب للإلقاء الصوتي المباشر دون علامات تنسيق أو نجوم.',
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

  // Gemini TTS Arabic Voice Synthesis Endpoint
  app.post('/api/gemini/tts', async (req: Request, res: Response) => {
    try {
      const { text, voiceName = 'Kore' } = req.body as {
        text?: string;
        voiceName?: string;
      };

      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'النص مطلوب للتحويل الصوتي.' });
        return;
      }

      const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
      const safeVoice = allowedVoices.includes(voiceName) ? voiceName : 'Kore';

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
                  style: 'معلق ومدرب شطرنج عربي رصين وواضح المخارج',
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
      const { imageBase64, mimeType = 'image/jpeg' } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };

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
                'Analyze this chessboard image carefully square by square (8 rows x 8 columns).',
                'The image has already been oriented so that Rank 8 (a8..h8) is the TOP row of the 8x8 board, Rank 1 (a1..h1) is the BOTTOM row, file a is on the LEFT, and file h is on the RIGHT.',
                'Even if there is small UI margin or phone border around the grid, locate the exact 8x8 chessboard squares and read every square accurately.',
                'Use standard FEN piece letters: uppercase PNBRQK for White pieces (lighter color), lowercase pnbrqk for Black pieces (darker color), and digits 1-8 for consecutive empty squares in each rank.',
                'Return "ranks" as an array of exactly 8 strings (rank 8 first down to rank 1), where each rank string sums to exactly 8 squares.',
                'Also determine whose turn it is ("w" or "b") if visible from move highlights or active clock; default to "w" if uncertain.',
              ].join('\n'),
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          systemInstruction:
            'You are a precision chess board computer-vision parser. Always inspect all 64 squares carefully and return strictly valid FEN rank strings summing to 8.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ranks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Exactly 8 FEN rank strings from rank 8 (top) to rank 1 (bottom).',
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

      const parsed = JSON.parse(rawText) as {
        ranks?: string[];
        turn?: string;
        notes?: string;
      };

      if (!Array.isArray(parsed.ranks) || parsed.ranks.length !== 8) {
        res.status(422).json({
          error: 'تعذر استخراج صفوف الرقعة الثمانية بدقة. قرّب الإطار الأزرق حول المربعات الـ 64 وحاول مجدداً.',
        });
        return;
      }

      // Normalize and validate each rank sums to 8
      const normalizedRanks: string[] = [];
      let whiteKings = 0;
      let blackKings = 0;
      const expandedGrid: string[][] = [];

      for (const rawRank of parsed.ranks) {
        const cleanRank = String(rawRank).trim();
        const expanded: string[] = [];
        for (const ch of cleanRank) {
          if (ch >= '1' && ch <= '8') {
            const empties = Number(ch);
            for (let k = 0; k < empties; k++) expanded.push('');
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
        expandedGrid.push(expanded);
        // Re-encode canonical rank string
        let encoded = '';
        let emptyCount = 0;
        for (const sq of expanded) {
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
        normalizedRanks.push(encoded);
      }

      if (whiteKings !== 1 || blackKings !== 1) {
        res.status(422).json({
          error: 'لم يتم التعرف على الملكين بشكل صحيح. تأكد من شمول كامل الرقعة داخل الإطار السماوي.',
        });
        return;
      }

      const placement = normalizedRanks.join('/');

      // Infer plausible castling rights from actual king/rook positions
      let castling = '';
      if (expandedGrid[7]?.[4] === 'K') {
        if (expandedGrid[7]?.[7] === 'R') castling += 'K';
        if (expandedGrid[7]?.[0] === 'R') castling += 'Q';
      }
      if (expandedGrid[0]?.[4] === 'k') {
        if (expandedGrid[0]?.[7] === 'r') castling += 'k';
        if (expandedGrid[0]?.[0] === 'r') castling += 'q';
      }
      if (!castling) castling = '-';

      const preferredTurn: 'w' | 'b' = parsed.turn === 'b' ? 'b' : 'w';
      const candidateA = `${placement} ${preferredTurn} ${castling} - 0 1`;
      const altTurn: 'w' | 'b' = preferredTurn === 'w' ? 'b' : 'w';
      const candidateB = `${placement} ${altTurn} ${castling} - 0 1`;

      let validFen: string | null = null;
      let resolvedTurn: 'w' | 'b' = preferredTurn;

      try {
        new Chess(candidateA);
        validFen = candidateA;
        resolvedTurn = preferredTurn;
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
        '.git',
        '.env',
        '.env.local',
        '.DS_Store',
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

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
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
