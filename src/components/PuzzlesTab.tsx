import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FlipVertical2,
  Lightbulb,
  Puzzle,
  RotateCcw,
  Shuffle,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  PUZZLES_1000,
  type ChessPuzzle,
  type PuzzleDifficulty,
} from '../data/puzzles1000.ts';
import { TacticalBoard } from './TacticalBoard.tsx';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { playMoveTapSound, unlockAudioContext } from '../utils/soundEffects.ts';
import type { BoardOrientation } from '../types/chess.ts';

export const SOLVED_PUZZLES_STORAGE_KEY = 'chess_vision_solved_puzzles_v1';
export const CURRENT_PUZZLE_STORAGE_KEY = 'chess_vision_current_puzzle_v1';

type DifficultyFilter = 'all' | PuzzleDifficulty;
type PuzzleStatus = 'prompt' | 'opponentReply' | 'continue' | 'solved' | 'wrong';

function readSolvedIdsFromStorage(): number[] {
  try {
    const raw = globalThis.localStorage?.getItem(SOLVED_PUZZLES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 1000);
  } catch {
    return [];
  }
}

function writeSolvedIdsToStorage(ids: number[]): void {
  try {
    globalThis.localStorage?.setItem(SOLVED_PUZZLES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage errors
  }
}

function readCurrentPuzzleId(): number {
  try {
    const raw = globalThis.localStorage?.getItem(CURRENT_PUZZLE_STORAGE_KEY);
    const num = Number(raw);
    if (Number.isInteger(num) && num >= 1 && num <= PUZZLES_1000.length) {
      return num;
    }
  } catch {
    // ignore
  }
  return 1;
}

export const PuzzlesTab: React.FC = () => {
  const { meta, t } = useLanguage();
  const isRtl = meta.dir === 'rtl';

  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [currentPuzzleId, setCurrentPuzzleId] = useState<number>(() => readCurrentPuzzleId());
  const [solvedIds, setSolvedIds] = useState<Set<number>>(() => new Set(readSolvedIdsFromStorage()));
  const [jumpInput, setJumpInput] = useState<string>(() => String(readCurrentPuzzleId()));

  const filteredPuzzles = useMemo(() => {
    if (difficultyFilter === 'all') return PUZZLES_1000;
    return PUZZLES_1000.filter((p) => p.difficulty === difficultyFilter);
  }, [difficultyFilter]);

  const activePuzzle: ChessPuzzle = useMemo(() => {
    return (
      filteredPuzzles.find((p) => p.id === currentPuzzleId) ??
      filteredPuzzles[0] ??
      PUZZLES_1000[0]
    );
  }, [filteredPuzzles, currentPuzzleId]);

  const activeIndexInFilter = useMemo(() => {
    const idx = filteredPuzzles.findIndex((p) => p.id === activePuzzle.id);
    return idx >= 0 ? idx : 0;
  }, [filteredPuzzles, activePuzzle.id]);

  const [boardFen, setBoardFen] = useState<string>(activePuzzle.fen);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [orientation, setOrientation] = useState<BoardOrientation>(() =>
    activePuzzle.fen.split(' ')[1] === 'b' ? 'black' : 'white'
  );
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [status, setStatus] = useState<PuzzleStatus>('prompt');
  const timersRef = useRef<ReturnType<typeof globalThis.setTimeout>[]>([]);

  const clearPendingTimers = useCallback(() => {
    for (const id of timersRef.current) {
      globalThis.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearPendingTimers();
  }, [clearPendingTimers]);

  const loadPuzzle = useCallback(
    (puzzle: ChessPuzzle) => {
      clearPendingTimers();
      setBoardFen(puzzle.fen);
      setStepIndex(0);
      setOrientation(puzzle.fen.split(' ')[1] === 'b' ? 'black' : 'white');
      setLastMove(null);
      setShowHint(false);
      setStatus('prompt');
      setJumpInput(String(puzzle.id));
      try {
        globalThis.localStorage?.setItem(CURRENT_PUZZLE_STORAGE_KEY, String(puzzle.id));
      } catch {
        // ignore
      }
    },
    [clearPendingTimers]
  );

  useEffect(() => {
    loadPuzzle(activePuzzle);
  }, [activePuzzle, loadPuzzle]);

  const markPuzzleSolved = useCallback((puzzleId: number) => {
    setSolvedIds((prev) => {
      if (prev.has(puzzleId)) return prev;
      const next = new Set(prev);
      next.add(puzzleId);
      writeSolvedIdsToStorage(Array.from(next));
      return next;
    });
  }, []);

  const expectedUci = activePuzzle.moves[stepIndex] ?? null;

  const hintSquares = useMemo(() => {
    if (!showHint || !expectedUci || status === 'solved' || status === 'opponentReply') return null;
    return {
      from: expectedUci.slice(0, 2),
      to: expectedUci.slice(2, 4),
    };
  }, [expectedUci, showHint, status]);

  const handleMoveAttempt = (from: string, to: string, promotion?: string) => {
    if (status === 'solved' || status === 'opponentReply') return false;
    unlockAudioContext();

    const preMoveFen = boardFen;
    const chess = new Chess(preMoveFen);
    let move;
    try {
      move = chess.move({ from, to, promotion });
    } catch {
      return false;
    }
    if (!move) return false;

    const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
    const nextFen = chess.fen();
    setBoardFen(nextFen);
    setLastMove({ from: move.from, to: move.to });
    playMoveTapSound(Boolean(move.captured));

    const isExpected = expectedUci !== null && uci === expectedUci;
    const isDirectMate = chess.isCheckmate();

    if (!isExpected && !isDirectMate) {
      setStatus('wrong');
      const snapId = globalThis.setTimeout(() => {
        setBoardFen((curr) => {
          if (curr === nextFen) {
            setLastMove(null);
            return preMoveFen;
          }
          return curr;
        });
      }, 750);
      timersRef.current.push(snapId);
      return true;
    }

    setShowHint(false);
    const nextStep = stepIndex + 1;

    if (isDirectMate || nextStep >= activePuzzle.moves.length) {
      setStepIndex(activePuzzle.moves.length);
      setStatus('solved');
      markPuzzleSolved(activePuzzle.id);
      return true;
    }

    // Play opponent's forced reply automatically
    setStatus('opponentReply');
    const replyUci = activePuzzle.moves[nextStep];
    const replyTimer = globalThis.setTimeout(() => {
      const replyChess = new Chess(nextFen);
      try {
        const replyMove = replyChess.move({
          from: replyUci.slice(0, 2),
          to: replyUci.slice(2, 4),
          promotion: replyUci.length > 4 ? replyUci[4] : undefined,
        });
        if (replyMove) {
          setBoardFen(replyChess.fen());
          setLastMove({ from: replyMove.from, to: replyMove.to });
          setStepIndex(nextStep + 1);
          setStatus('continue');
          playMoveTapSound(Boolean(replyMove.captured));
        }
      } catch {
        setStatus('solved');
        markPuzzleSolved(activePuzzle.id);
      }
    }, 360);
    timersRef.current.push(replyTimer);
    return true;
  };

  const handleSelectDifficulty = (nextDiff: DifficultyFilter) => {
    setDifficultyFilter(nextDiff);
    if (nextDiff === 'all') return;
    if (activePuzzle.difficulty !== nextDiff) {
      const firstInTier = PUZZLES_1000.find((p) => p.difficulty === nextDiff);
      if (firstInTier) {
        setCurrentPuzzleId(firstInTier.id);
      }
    }
  };

  const handlePrevious = () => {
    if (filteredPuzzles.length === 0) return;
    const prevIdx =
      (activeIndexInFilter - 1 + filteredPuzzles.length) % filteredPuzzles.length;
    setCurrentPuzzleId(filteredPuzzles[prevIdx].id);
  };

  const handleNext = () => {
    if (filteredPuzzles.length === 0) return;
    const nextIdx = (activeIndexInFilter + 1) % filteredPuzzles.length;
    setCurrentPuzzleId(filteredPuzzles[nextIdx].id);
  };

  const handleRandom = () => {
    if (filteredPuzzles.length === 0) return;
    let pick = filteredPuzzles[Math.floor(Math.random() * filteredPuzzles.length)];
    if (filteredPuzzles.length > 1 && pick.id === activePuzzle.id) {
      pick =
        filteredPuzzles[(activeIndexInFilter + 1 + Math.floor(Math.random() * (filteredPuzzles.length - 1))) % filteredPuzzles.length];
    }
    setCurrentPuzzleId(pick.id);
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number.parseInt(jumpInput.trim(), 10);
    if (!Number.isFinite(num)) return;
    const clamped = Math.max(1, Math.min(PUZZLES_1000.length, num));
    const target = PUZZLES_1000[clamped - 1];
    if (!target) return;
    if (difficultyFilter !== 'all' && target.difficulty !== difficultyFilter) {
      setDifficultyFilter('all');
    }
    setCurrentPuzzleId(target.id);
  };

  const tierCounts = useMemo(() => {
    let beg = 0;
    let inter = 0;
    let adv = 0;
    for (const id of solvedIds) {
      const p = PUZZLES_1000[id - 1];
      if (!p) continue;
      if (p.difficulty === 'beginner') beg++;
      else if (p.difficulty === 'intermediate') inter++;
      else adv++;
    }
    return { beg, inter, adv };
  }, [solvedIds]);

  const solvedPercent = Math.round((solvedIds.size / PUZZLES_1000.length) * 100);
  const turnSide = boardFen.split(' ')[1] === 'b' ? 'b' : 'w';
  const isCurrentSolved = solvedIds.has(activePuzzle.id);

  const difficultyBadgeClass =
    activePuzzle.difficulty === 'beginner'
      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/55'
      : activePuzzle.difficulty === 'intermediate'
      ? 'bg-amber-500/20 text-amber-200 border-amber-400/55'
      : 'bg-rose-500/20 text-rose-200 border-rose-400/55';

  return (
    <section className="space-y-3.5 sm:space-y-5">
      {/* Header, Difficulty Filter & Solved Counter */}
      <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-5 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
              <Puzzle className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300 shrink-0" />
              <span>{t.puzzlesTitle}</span>
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-100">{t.puzzlesSubtitle}</p>
          </div>

          {/* Solved Progress Pill & Bar */}
          <div className="flex items-center gap-2.5 bg-slate-900/40 border border-emerald-400/55 rounded-lg px-3 py-1.5 sm:px-3.5 sm:py-2">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 shrink-0" />
            <div className="space-y-1">
              <div className="text-xs sm:text-sm font-bold text-white tabular-nums">
                {t.puzzlesSolvedCountLabel(solvedIds.size, PUZZLES_1000.length)}
              </div>
              <div className="w-28 sm:w-36 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${Math.max(solvedIds.size > 0 ? 2 : 0, solvedPercent)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Difficulty Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => handleSelectDifficulty('all')}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
              difficultyFilter === 'all'
                ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
            }`}
          >
            {t.puzzlesDifficultyAll}
          </button>

          {(['beginner', 'intermediate', 'advanced'] as PuzzleDifficulty[]).map((diff) => {
            const active = difficultyFilter === diff;
            const totalInTier = PUZZLES_1000.filter((p) => p.difficulty === diff).length;
            const doneInTier =
              diff === 'beginner'
                ? tierCounts.beg
                : diff === 'intermediate'
                ? tierCounts.inter
                : tierCounts.adv;
            return (
              <button
                key={diff}
                type="button"
                onClick={() => handleSelectDifficulty(diff)}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
                  active
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
                }`}
              >
                {t.puzzlesDifficultyLabels[diff]} ({doneInTier}/{totalInTier})
              </button>
            );
          })}
        </div>

        {/* Navigation Bar: Previous, Next, Random, Jump 1..1000 */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-400/35">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handlePrevious}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:px-3 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/50 transition-colors"
            >
              {isRtl ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronLeft className="w-3.5 h-3.5" />
              )}
              <span>{t.puzzlesPrevBtn}</span>
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:px-3 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/50 transition-colors"
            >
              <span>{t.puzzlesNextBtn}</span>
              {isRtl ? (
                <ChevronLeft className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleRandom}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 text-[11px] sm:text-xs font-bold rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 border border-cyan-400/60 transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5 shrink-0" />
              <span>{t.puzzlesRandomBtn}</span>
            </button>
          </div>

          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={PUZZLES_1000.length}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              placeholder={t.puzzlesJumpPlaceholder}
              dir="ltr"
              className="w-24 sm:w-28 px-2.5 py-1.5 text-xs font-mono font-bold text-white bg-slate-950/85 border border-slate-500/70 rounded-md focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors"
            >
              {t.puzzlesJumpBtn}
            </button>
          </form>
        </div>
      </div>

      {/* Main Puzzle Board + Status Info */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-5 items-start">
        <div className="lg:col-span-6 border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-2.5 sm:p-4 shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-500/40">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-xs sm:text-sm font-bold text-white font-mono">
                {t.puzzlesNumberLabel(activePuzzle.id, PUZZLES_1000.length)}
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] sm:text-xs font-bold rounded border ${difficultyBadgeClass}`}
              >
                {t.puzzlesDifficultyLabels[activePuzzle.difficulty]}
              </span>
              {isCurrentSolved && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] sm:text-xs font-bold rounded bg-emerald-500/25 text-emerald-200 border border-emerald-400/60">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{t.puzzlesSolvedBadge}</span>
                </span>
              )}
            </div>
            <span className="text-[11px] sm:text-xs font-mono font-semibold text-slate-200">
              {t.puzzlesRatingLabel(activePuzzle.rating)}
            </span>
          </div>

          <TacticalBoard
            fen={boardFen}
            orientation={orientation}
            lastMove={lastMove}
            hintSquares={hintSquares}
            showEvalBar={false}
            disabled={status === 'solved' || status === 'opponentReply'}
            onMoveAttempt={(f, to, promo) => {
              return handleMoveAttempt(f, to, promo);
            }}
          />

          {/* Puzzle Controls: Hint (from & to), Reset, Flip */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              disabled={status === 'solved' || status === 'opponentReply'}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md border transition-colors disabled:opacity-50 ${
                showHint
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/60'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5 shrink-0" />
              <span>{t.puzzlesHintBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => loadPuzzle(activePuzzle)}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>{t.puzzlesResetBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => setOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/50 transition-colors"
            >
              <FlipVertical2 className="w-3.5 h-3.5 shrink-0" />
              <span>{t.puzzlesFlipBtn}</span>
            </button>
          </div>
        </div>

        {/* Right Side: Metadata, Hint Banner, Live Status & Next Action */}
        <div className="lg:col-span-6 space-y-3.5 sm:space-y-4">
          <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full border ${
                    turnSide === 'w'
                      ? 'bg-white border-slate-300'
                      : 'bg-slate-900 border-slate-400'
                  }`}
                />
                <span className="text-xs sm:text-sm font-bold text-white">
                  {turnSide === 'w' ? t.puzzlesTurnWhite : t.puzzlesTurnBlack}
                </span>
              </div>
              <span className="px-2 py-0.5 text-[11px] sm:text-xs font-semibold rounded bg-slate-900/45 text-cyan-200 border border-slate-400/50">
                {t.puzzlesThemeLabels[activePuzzle.theme]}
              </span>
            </div>

            {status === 'prompt' && (
              <div className="p-3 rounded-lg bg-slate-900/35 border border-slate-400/40 text-xs sm:text-sm text-white">
                {t.puzzlesStatusPrompt}
              </div>
            )}

            {status === 'opponentReply' && (
              <div className="p-3 rounded-lg bg-cyan-500/15 border border-cyan-400/55 text-xs sm:text-sm font-semibold text-cyan-100">
                {t.puzzlesStatusOpponentReply}
              </div>
            )}

            {status === 'continue' && (
              <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-400/55 text-xs sm:text-sm font-semibold text-emerald-100">
                {t.puzzlesStatusCorrectContinue}
              </div>
            )}

            {status === 'wrong' && (
              <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-400/65 flex items-center gap-2 text-xs sm:text-sm font-semibold text-rose-100">
                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{t.puzzlesStatusWrong}</span>
              </div>
            )}

            {status === 'solved' && (
              <div className="p-3.5 rounded-lg bg-emerald-500/20 border border-emerald-400/70 space-y-2.5">
                <div className="flex items-center gap-2 text-emerald-100 font-bold text-xs sm:text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                  <span>{t.puzzlesStatusSolved}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleNext}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors"
                  >
                    <span>{t.puzzlesNextBtn}</span>
                    {isRtl ? (
                      <ChevronLeft className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleRandom}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-500/70 transition-colors"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>{t.puzzlesRandomBtn}</span>
                  </button>
                </div>
              </div>
            )}

            {hintSquares && (
              <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-400/60 flex items-center justify-between gap-2 text-xs sm:text-sm text-amber-100">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-300 shrink-0" />
                  <span className="font-semibold">
                    {t.puzzlesHintActiveLabel(hintSquares.from, hintSquares.to)}
                  </span>
                </div>
                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-950/70 border border-amber-400/40" dir="ltr">
                  {hintSquares.from} → {hintSquares.to}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
