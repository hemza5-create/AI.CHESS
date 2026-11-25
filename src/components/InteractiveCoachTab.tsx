import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  CheckCircle2,
  ChevronRight,
  FlipVertical2,
  Lightbulb,
  Navigation,
  Play,
  RotateCcw,
  Sparkles,
  Swords,
  XCircle,
} from 'lucide-react';
import { COACH_DRILLS, type CoachDrill, type CoachTacticId } from '../data/coachDrills.ts';
import { TacticalBoard } from './TacticalBoard.tsx';
import { PlayVsStockfishPanel } from './PlayVsStockfishPanel.tsx';
import { localStockfishEngine } from '../engine/localStockfishEngine.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { playMoveTapSound, unlockAudioContext } from '../utils/soundEffects.ts';
import type { BoardOrientation, StockfishAnalysisResult } from '../types/chess.ts';

type CoachMode = 'tactics' | 'playAi';
type TacticFilter = 'all' | CoachTacticId;
type DrillOutcome = 'ready' | 'correct' | 'wrong' | 'coachSolved';

const TACTIC_KEYS: CoachTacticId[] = ['fork', 'pin', 'discovered', 'mateIn1', 'backRank'];

export const InteractiveCoachTab: React.FC = () => {
  const { language, t } = useLanguage();
  const [coachMode, setCoachMode] = useState<CoachMode>('playAi');

  const [tacticFilter, setTacticFilter] = useState<TacticFilter>('all');
  const filteredDrills = useMemo(() => {
    if (tacticFilter === 'all') return COACH_DRILLS;
    return COACH_DRILLS.filter((d) => d.tactic === tacticFilter);
  }, [tacticFilter]);

  const [selectedDrillId, setSelectedDrillId] = useState<string>(COACH_DRILLS[0].id);
  const activeDrill: CoachDrill = useMemo(() => {
    return (
      filteredDrills.find((d) => d.id === selectedDrillId) ??
      filteredDrills[0] ??
      COACH_DRILLS[0]
    );
  }, [filteredDrills, selectedDrillId]);

  const activeIndex = useMemo(() => {
    const idx = filteredDrills.findIndex((d) => d.id === activeDrill.id);
    return idx >= 0 ? idx : 0;
  }, [filteredDrills, activeDrill.id]);

  const [boardFen, setBoardFen] = useState<string>(activeDrill.fen);
  const [orientation, setOrientation] = useState<BoardOrientation>(
    activeDrill.targetSideLabel === 'b' ? 'black' : 'white'
  );
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [showBestArrow, setShowBestArrow] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<DrillOutcome>('ready');
  const [playedMoveInfo, setPlayedMoveInfo] = useState<{
    san: string;
    evalAfter: string;
  } | null>(null);
  const [evalResult, setEvalResult] = useState<StockfishAnalysisResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [completedDrillIds, setCompletedDrillIds] = useState<Set<string>>(() => new Set());
  const evalSeqRef = useRef<number>(0);

  const runEval = useCallback(async (targetFen: string): Promise<StockfishAnalysisResult | null> => {
    const seq = ++evalSeqRef.current;
    setIsEvaluating(true);
    try {
      const res = await localStockfishEngine.analyze(targetFen, 10, 2, 1800, false);
      if (evalSeqRef.current !== seq) return null;
      setEvalResult(res);
      return res;
    } catch {
      return null;
    } finally {
      if (evalSeqRef.current === seq) {
        setIsEvaluating(false);
      }
    }
  }, []);

  const loadDrillState = useCallback(
    (drill: CoachDrill) => {
      setBoardFen(drill.fen);
      setOrientation(drill.targetSideLabel === 'b' ? 'black' : 'white');
      setLastMove(null);
      setShowHint(false);
      setShowBestArrow(false);
      setOutcome('ready');
      setPlayedMoveInfo(null);
      void runEval(drill.fen);
    },
    [runEval]
  );

  useEffect(() => {
    if (coachMode !== 'tactics') return;
    loadDrillState(activeDrill);
  }, [activeDrill, coachMode, loadDrillState]);

  const copy = activeDrill.localized[language] ?? activeDrill.localized.ar;

  const hintSquares = useMemo(() => {
    if (!showHint || outcome === 'correct' || outcome === 'coachSolved') return null;
    return {
      from: activeDrill.solutionUci.slice(0, 2),
      to: activeDrill.solutionUci.slice(2, 4),
    };
  }, [activeDrill.solutionUci, outcome, showHint]);

  const bestMoveArrow = useMemo(() => {
    if (!showBestArrow) return null;
    if (outcome === 'correct' || outcome === 'coachSolved') {
      if (evalResult?.bestMove && evalResult.bestMove !== '(none)' && evalResult.bestMove.length >= 4) {
        return {
          from: evalResult.bestMove.slice(0, 2),
          to: evalResult.bestMove.slice(2, 4),
          color: '#10B981',
        };
      }
      return null;
    }
    return {
      from: activeDrill.solutionUci.slice(0, 2),
      to: activeDrill.solutionUci.slice(2, 4),
      color: '#10B981',
    };
  }, [activeDrill.solutionUci, evalResult?.bestMove, outcome, showBestArrow]);

  const handleMoveAttempt = async (from: string, to: string, promotion?: string) => {
    if (outcome === 'correct' || outcome === 'coachSolved') return false;
    unlockAudioContext();

    const chess = new Chess(boardFen);
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

    if (uci === activeDrill.solutionUci || chess.isCheckmate()) {
      setOutcome('correct');
      setShowHint(false);
      setPlayedMoveInfo({ san: move.san, evalAfter: evalResult?.evaluationLabel ?? '+M' });
      setCompletedDrillIds((prev) => {
        const next = new Set(prev);
        next.add(activeDrill.id);
        return next;
      });
      void runEval(nextFen);
      return true;
    }

    // Wrong or suboptimal move: evaluate resulting position locally to explain why
    setOutcome('wrong');
    setPlayedMoveInfo({ san: move.san, evalAfter: '...' });
    const afterRes = await runEval(nextFen);
    if (afterRes) {
      setPlayedMoveInfo({ san: move.san, evalAfter: afterRes.evaluationLabel });
    }
    // Snap back after a brief glance or let user retry immediately? Let's keep it on board if they hit reset, OR even smoother: auto-reset back to drill FEN after 700ms while preserving the wrong move feedback!
    globalThis.setTimeout(() => {
      setBoardFen((curr) => {
        if (curr === nextFen) {
          setLastMove(null);
          void runEval(activeDrill.fen);
          return activeDrill.fen;
        }
        return curr;
      });
    }, 850);

    return true;
  };

  const handlePlayBestMove = () => {
    unlockAudioContext();
    const chess = new Chess(activeDrill.fen);
    const from = activeDrill.solutionUci.slice(0, 2);
    const to = activeDrill.solutionUci.slice(2, 4);
    const promo = activeDrill.solutionUci.length > 4 ? activeDrill.solutionUci[4] : undefined;
    try {
      const move = chess.move({ from, to, promotion: promo });
      if (!move) return;
      const nextFen = chess.fen();
      setBoardFen(nextFen);
      setLastMove({ from: move.from, to: move.to });
      setShowHint(false);
      setOutcome('coachSolved');
      setPlayedMoveInfo({ san: move.san, evalAfter: evalResult?.evaluationLabel ?? '+Win' });
      playMoveTapSound(Boolean(move.captured));
      void runEval(nextFen);
    } catch {
      // Ignore
    }
  };

  const handleResetDrill = () => {
    loadDrillState(activeDrill);
  };

  const handleFlipBoard = () => {
    setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  };

  const handleNextDrill = () => {
    if (filteredDrills.length === 0) return;
    const nextIdx = (activeIndex + 1) % filteredDrills.length;
    setSelectedDrillId(filteredDrills[nextIdx].id);
  };

  return (
    <section className="space-y-3.5 sm:space-y-5">
      {/* Coach Sub-Mode Switcher: Play vs Stockfish AI | Tactics Drills */}
      <div className="inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl border border-slate-400/40 bg-[#0F1522]/30 backdrop-blur-sm shadow-md">
        <button
          type="button"
          onClick={() => setCoachMode('playAi')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
            coachMode === 'playAi'
              ? 'bg-cyan-400 text-slate-950 shadow-sm'
              : 'text-slate-100 hover:bg-slate-800/80'
          }`}
        >
          <Swords className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>{t.coachModePlayAi}</span>
        </button>

        <button
          type="button"
          onClick={() => setCoachMode('tactics')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
            coachMode === 'tactics'
              ? 'bg-cyan-400 text-slate-950 shadow-sm'
              : 'text-slate-100 hover:bg-slate-800/80'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>{t.coachModeTactics}</span>
        </button>
      </div>

      {coachMode === 'playAi' ? (
        <PlayVsStockfishPanel />
      ) : (
        <>
      {/* Header & Tactic Category Filter */}
      <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-5 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300 shrink-0" />
              <span>{t.coachTitle}</span>
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-100">{t.coachSubtitle}</p>
          </div>
          <span className="text-[11px] sm:text-xs font-mono font-bold text-cyan-200 bg-cyan-500/20 border border-cyan-400/50 px-2.5 py-1 rounded-md">
            {t.coachDrillProgress(activeIndex + 1, filteredDrills.length)}
          </span>
        </div>

        {/* 5 Core Tactics Filter Bar */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setTacticFilter('all');
              setSelectedDrillId(COACH_DRILLS[0].id);
            }}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
              tacticFilter === 'all'
                ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
            }`}
          >
            {t.coachAllTactics} ({COACH_DRILLS.length})
          </button>
          {TACTIC_KEYS.map((key) => {
            const count = COACH_DRILLS.filter((d) => d.tactic === key).length;
            const active = tacticFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTacticFilter(key);
                  const firstMatch = COACH_DRILLS.find((d) => d.tactic === key);
                  if (firstMatch) setSelectedDrillId(firstMatch.id);
                }}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
                  active
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
                }`}
              >
                {t.coachTactics[key]} ({count})
              </button>
            );
          })}
        </div>

        {/* Drill Quick Selector */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-400/35">
          {filteredDrills.map((drill, idx) => {
            const isSelected = drill.id === activeDrill.id;
            const isDone = completedDrillIds.has(drill.id);
            const drillCopy = drill.localized[language] ?? drill.localized.ar;
            return (
              <button
                key={drill.id}
                type="button"
                onClick={() => setSelectedDrillId(drill.id)}
                className={`inline-flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-md border transition-colors ${
                  isSelected
                    ? 'bg-emerald-500/25 text-emerald-100 border-emerald-400'
                    : isDone
                    ? 'bg-slate-900/35 text-emerald-300 border-emerald-500/50 hover:bg-slate-800/65'
                    : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
                }`}
              >
                <span className="font-mono font-bold">#{idx + 1}</span>
                <span>{drillCopy.title}</span>
                {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main 2-Column Coach Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-5 items-start">
        {/* Left: Interactive Board + Required Controls */}
        <div className="lg:col-span-6 border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-2.5 sm:p-4 shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-500/40">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] sm:text-xs font-bold rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/50">
                {t.coachTactics[activeDrill.tactic]}
              </span>
              <span className="text-xs sm:text-sm font-bold text-white">{copy.title}</span>
            </div>
            <span className="text-[11px] sm:text-xs font-semibold text-slate-200">
              {t.turnPrefix}{' '}
              <strong className="text-white">
                {activeDrill.targetSideLabel === 'w' ? t.whiteName : t.blackName}
              </strong>
            </span>
          </div>

          <TacticalBoard
            fen={boardFen}
            orientation={orientation}
            lastMove={lastMove}
            hintSquares={hintSquares}
            showHintArrow={false}
            bestMoveArrow={bestMoveArrow}
            evaluationLabel={evalResult?.evaluationLabel ?? '0.00'}
            winProbabilityWhite={evalResult?.winProbabilityWhite ?? 50}
            showEvalBar={true}
            disabled={outcome === 'correct' || outcome === 'coachSolved'}
            onMoveAttempt={(f, to, promo) => {
              void handleMoveAttempt(f, to, promo);
              return true;
            }}
          />

          {/* Coach Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              disabled={outcome === 'correct' || outcome === 'coachSolved'}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md border transition-colors disabled:opacity-50 ${
                showHint
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/60'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5 shrink-0" />
              <span>{t.coachHintBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowBestArrow((v) => !v)}
              aria-pressed={showBestArrow}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
                showBestArrow
                  ? 'bg-emerald-400 text-slate-950 border-emerald-300 shadow-sm'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 border-emerald-400/55'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <span>{t.coachBestArrowBtn}</span>
            </button>

            <button
              type="button"
              onClick={handlePlayBestMove}
              disabled={outcome === 'correct' || outcome === 'coachSolved'}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-100 border border-emerald-400/65 transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 shrink-0" />
              <span>{t.coachPlayBestBtn}</span>
            </button>

            <button
              type="button"
              onClick={handleResetDrill}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>{t.coachResetBtn}</span>
            </button>

            <button
              type="button"
              onClick={handleFlipBoard}
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/50 transition-colors"
            >
              <FlipVertical2 className="w-3.5 h-3.5 shrink-0" />
              <span>{t.coachFlipBtn}</span>
            </button>
          </div>
        </div>

        {/* Right: Coach Explanation, Verdict & Live Position Evaluation */}
        <div className="lg:col-span-6 space-y-3.5 sm:space-y-4">
          {/* Drill Goal Card */}
          <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-2">
            <h3 className="text-xs sm:text-sm font-bold text-cyan-200">{t.coachGoalLabel}</h3>
            <p className="text-sm sm:text-base font-semibold text-white leading-relaxed">
              {copy.prompt}
            </p>
            {showHint && outcome !== 'correct' && outcome !== 'coachSolved' && (
              <div className="mt-2 p-2.5 rounded-lg bg-amber-500/15 border border-amber-400/55 text-xs sm:text-sm text-amber-100 leading-relaxed">
                <strong className="text-amber-300">{t.coachHintBtn}: </strong>
                {copy.hintText}
              </div>
            )}
          </div>

          {/* Simplified Explanation of Right/Wrong Move */}
          <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
              <h3 className="text-xs sm:text-sm font-bold text-white">{t.coachFeedbackTitle}</h3>
              {(outcome === 'correct' || outcome === 'coachSolved') && (
                <button
                  type="button"
                  onClick={handleNextDrill}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] sm:text-xs font-bold rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors"
                >
                  <span>{t.coachNextDrillBtn}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {outcome === 'ready' && (
              <div className="p-3 rounded-lg bg-slate-900/35 border border-slate-400/40 text-xs sm:text-sm text-white">
                {t.coachStatusReady}
              </div>
            )}

            {(outcome === 'correct' || outcome === 'coachSolved') && (
              <div className="p-3 sm:p-3.5 rounded-lg bg-emerald-500/15 border border-emerald-400/65 space-y-2">
                <div className="flex items-center gap-2 text-emerald-200 font-bold text-xs sm:text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    {outcome === 'correct' ? t.coachStatusCorrect : t.coachStatusSolvedByCoach}
                  </span>
                  <span className="font-mono px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-200 border border-emerald-400/40" dir="ltr">
                    {activeDrill.solutionSan}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
                  {copy.correctExplanation}
                </p>
              </div>
            )}

            {outcome === 'wrong' && (
              <div className="p-3 sm:p-3.5 rounded-lg bg-rose-500/15 border border-rose-400/65 space-y-2">
                <div className="flex items-center gap-2 text-rose-200 font-bold text-xs sm:text-sm">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{t.coachStatusWrong}</span>
                  {playedMoveInfo && (
                    <span className="font-mono px-1.5 py-0.5 rounded bg-rose-950/70 text-rose-100 border border-rose-400/40" dir="ltr">
                      {playedMoveInfo.san}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
                  {copy.wrongHint}
                </p>
                {playedMoveInfo && (
                  <p className="text-[11px] sm:text-xs text-rose-100/90 bg-slate-950/50 rounded p-2 border border-rose-400/35">
                    {t.coachWrongEvalNote(
                      playedMoveInfo.san,
                      activeDrill.solutionSan,
                      playedMoveInfo.evalAfter
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Stockfish Position Evaluation Summary */}
            <div className="pt-2 border-t border-slate-500/35 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                <span className="font-bold text-slate-200">{t.coachEvalTitle}</span>
                <span className="font-mono font-bold text-cyan-200 tabular-nums" dir="ltr">
                  {isEvaluating ? t.coachAnalyzingEval : evalResult?.evaluationLabel ?? '0.00'}
                </span>
              </div>
              {evalResult && (
                <div className="grid grid-cols-2 gap-2 text-[11px] sm:text-xs">
                  <div className="p-2 rounded bg-slate-900/35 border border-slate-400/40 flex items-center justify-between">
                    <span className="text-slate-100">{t.coachStockfishBestLabel}</span>
                    <span className="font-mono font-bold text-emerald-300" dir="ltr">
                      {evalResult.bestMoveSan || evalResult.bestMove}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-slate-900/35 border border-slate-400/40 flex items-center justify-between">
                    <span className="text-slate-100">{t.depthLabel}</span>
                    <span className="font-mono font-bold text-white" dir="ltr">
                      {evalResult.depthReached}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </section>
  );
};
