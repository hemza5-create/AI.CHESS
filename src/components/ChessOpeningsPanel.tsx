import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FlipVertical2,
  Navigation,
  Pause,
  Play,
  SkipBack,
} from 'lucide-react';
import {
  CHESS_OPENINGS,
  buildOpeningTimeline,
  type ChessOpeningDefinition,
  type OpeningCategory,
} from '../data/chessOpenings.ts';
import { TacticalBoard } from './TacticalBoard.tsx';
import { localStockfishEngine } from '../engine/localStockfishEngine.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { playMoveTapSound, unlockAudioContext } from '../utils/soundEffects.ts';
import type { BoardOrientation, StockfishAnalysisResult } from '../types/chess.ts';

type CategoryFilter = 'all' | OpeningCategory;

const OPENING_CATEGORIES: OpeningCategory[] = ['open', 'semiOpen', 'closed', 'indian', 'flank'];

export const ChessOpeningsPanel: React.FC = () => {
  const { language, t } = useLanguage();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const filteredOpenings = useMemo(() => {
    if (categoryFilter === 'all') return CHESS_OPENINGS;
    return CHESS_OPENINGS.filter((op) => op.category === categoryFilter);
  }, [categoryFilter]);

  const [selectedOpeningId, setSelectedOpeningId] = useState<string>(CHESS_OPENINGS[0].id);

  const activeOpening: ChessOpeningDefinition = useMemo(() => {
    return (
      filteredOpenings.find((op) => op.id === selectedOpeningId) ??
      filteredOpenings[0] ??
      CHESS_OPENINGS[0]
    );
  }, [filteredOpenings, selectedOpeningId]);

  const timeline = useMemo(() => buildOpeningTimeline(activeOpening.moves), [activeOpening.moves]);

  const [stepIndex, setStepIndex] = useState<number>(0);
  const [orientation, setOrientation] = useState<BoardOrientation>(
    activeOpening.preferredSide === 'b' ? 'black' : 'white'
  );
  const [showNextArrow, setShowNextArrow] = useState<boolean>(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [interactiveWarning, setInteractiveWarning] = useState<{
    playedSan: string;
    expectedSan: string;
  } | null>(null);

  const [evalResult, setEvalResult] = useState<StockfishAnalysisResult | null>(null);
  const evalSeqRef = useRef<number>(0);

  const selectOpening = useCallback((opening: ChessOpeningDefinition) => {
    setSelectedOpeningId(opening.id);
    setStepIndex(0);
    setOrientation(opening.preferredSide === 'b' ? 'black' : 'white');
    setIsAutoPlaying(false);
    setInteractiveWarning(null);
  }, []);

  const currentStep = timeline[Math.min(stepIndex, timeline.length - 1)] ?? timeline[0];
  const openingCopy = activeOpening.localized[language] ?? activeOpening.localized.ar;

  // Lightweight local Stockfish eval for the current opening position
  useEffect(() => {
    if (isAutoPlaying) return;
    const seq = ++evalSeqRef.current;
    const timer = globalThis.setTimeout(async () => {
      try {
        const res = await localStockfishEngine.analyze(currentStep.fen, 9, 1, 1800, false);
        if (evalSeqRef.current === seq) {
          setEvalResult(res);
        }
      } catch {
        // Ignore transient evaluation errors
      }
    }, 120);
    return () => globalThis.clearTimeout(timer);
  }, [currentStep.fen, isAutoPlaying]);

  // Auto-play progression through the opening moves
  useEffect(() => {
    if (!isAutoPlaying) return;
    if (stepIndex >= timeline.length - 1) {
      setIsAutoPlaying(false);
      return;
    }
    const timer = globalThis.setTimeout(() => {
      setInteractiveWarning(null);
      setStepIndex((prev) => Math.min(timeline.length - 1, prev + 1));
      playMoveTapSound(false);
    }, 1350);
    return () => globalThis.clearTimeout(timer);
  }, [isAutoPlaying, stepIndex, timeline.length]);

  const handleReset = () => {
    setIsAutoPlaying(false);
    setInteractiveWarning(null);
    setStepIndex(0);
  };

  const handlePrev = () => {
    setIsAutoPlaying(false);
    setInteractiveWarning(null);
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    unlockAudioContext();
    setIsAutoPlaying(false);
    setInteractiveWarning(null);
    if (stepIndex < timeline.length - 1) {
      setStepIndex((prev) => prev + 1);
      playMoveTapSound(false);
    }
  };

  const handleMoveAttempt = (from: string, to: string, promotion?: string): boolean => {
    if (stepIndex >= timeline.length - 1 || !currentStep.nextExpected) return false;
    unlockAudioContext();
    setIsAutoPlaying(false);

    const chess = new Chess(currentStep.fen);
    let move;
    try {
      move = chess.move({ from, to, promotion });
    } catch {
      return false;
    }
    if (!move) return false;

    const expected = currentStep.nextExpected;
    if (
      move.san === expected.san ||
      (move.from === expected.from && move.to === expected.to)
    ) {
      setInteractiveWarning(null);
      setStepIndex((prev) => Math.min(timeline.length - 1, prev + 1));
      playMoveTapSound(Boolean(move.captured));
      return true;
    }

    setInteractiveWarning({
      playedSan: move.san,
      expectedSan: expected.san,
    });
    return false;
  };

  const nextArrow = useMemo(() => {
    if (!showNextArrow || !currentStep.nextExpected) return null;
    return {
      from: currentStep.nextExpected.from,
      to: currentStep.nextExpected.to,
      color: '#06B6D4',
    };
  }, [currentStep.nextExpected, showNextArrow]);

  const activeMoveLabel = useMemo(() => {
    if (stepIndex === 0 || !currentStep.san) return null;
    const moveNumber = Math.ceil(stepIndex / 2);
    const isWhiteMove = stepIndex % 2 === 1;
    return `${moveNumber}${isWhiteMove ? '.' : '...'} ${currentStep.san}`;
  }, [currentStep.san, stepIndex]);

  const currentNote = stepIndex > 0 ? openingCopy.moveNotes[stepIndex - 1] ?? '' : '';

  return (
    <div className="space-y-3.5 sm:space-y-5 pt-2 border-t border-slate-400/35">
      {/* Header + Category Filter + Opening Dropdown & Selector */}
      <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-5 shadow-lg space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300 shrink-0" />
              <span>{t.openingsTitle}</span>
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-100">{t.openingsSubtitle}</p>
          </div>
          <span className="text-[11px] sm:text-xs font-mono font-bold text-cyan-200 bg-cyan-500/20 border border-cyan-400/50 px-2.5 py-1 rounded-md">
            {t.openingsCountLabel(filteredOpenings.length)}
          </span>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('all');
              setInteractiveWarning(null);
            }}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
              categoryFilter === 'all'
                ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
            }`}
          >
            {t.openingsCategoryAll} ({CHESS_OPENINGS.length})
          </button>

          {OPENING_CATEGORIES.map((cat) => {
            const count = CHESS_OPENINGS.filter((op) => op.category === cat).length;
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat);
                  const firstMatch = CHESS_OPENINGS.find((op) => op.category === cat);
                  if (firstMatch && activeOpening.category !== cat) {
                    selectOpening(firstMatch);
                  }
                }}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
                  active
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
                }`}
              >
                {t.openingsCategories[cat]} ({count})
              </button>
            );
          })}
        </div>

        {/* Opening Dropdown Selector + Quick Select Cards */}
        <div className="space-y-2.5 pt-2 border-t border-slate-400/35">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label
              htmlFor="chess-opening-select"
              className="text-xs sm:text-sm font-bold text-slate-100 shrink-0"
            >
              {t.openingsSelectLabel}
            </label>
            <select
              id="chess-opening-select"
              value={activeOpening.id}
              onChange={(e) => {
                const chosen = CHESS_OPENINGS.find((op) => op.id === e.target.value);
                if (chosen) selectOpening(chosen);
              }}
              className="w-full sm:max-w-md px-3 py-2 text-xs sm:text-sm font-bold rounded-lg bg-slate-950/70 text-white border border-slate-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              {filteredOpenings.map((op) => {
                const copy = op.localized[language] ?? op.localized.ar;
                return (
                  <option key={op.id} value={op.id} className="bg-slate-900 text-white">
                    [{op.eco}] {copy.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto pr-0.5">
            {filteredOpenings.map((op) => {
              const copy = op.localized[language] ?? op.localized.ar;
              const isSelected = op.id === activeOpening.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => selectOpening(op)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-md border transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/30 text-emerald-100 border-emerald-400 shadow-sm'
                      : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
                  }`}
                >
                  <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-slate-950/60 text-cyan-200 border border-slate-500/40" dir="ltr">
                    {op.eco}
                  </span>
                  <span>{copy.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main 2-Column Learning Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-5 items-start">
        {/* Left: Interactive Board + Step Controls */}
        <div className="lg:col-span-6 border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-2.5 sm:p-4 shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="px-2 py-0.5 text-[10px] sm:text-xs font-mono font-bold rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shrink-0"
                dir="ltr"
              >
                {activeOpening.eco}
              </span>
              <span className="text-xs sm:text-sm font-bold text-white truncate">
                {openingCopy.name}
              </span>
            </div>
            <span className="text-[11px] sm:text-xs font-mono font-semibold text-cyan-200">
              {t.openingsStepCounter(stepIndex, activeOpening.moves.length)}
            </span>
          </div>

          <TacticalBoard
            fen={currentStep.fen}
            orientation={orientation}
            lastMove={
              currentStep.from && currentStep.to
                ? { from: currentStep.from, to: currentStep.to }
                : null
            }
            showHintArrow={false}
            bestMoveArrow={nextArrow}
            evaluationLabel={evalResult?.evaluationLabel ?? '0.00'}
            winProbabilityWhite={evalResult?.winProbabilityWhite ?? 50}
            showEvalBar={true}
            disabled={false}
            onMoveAttempt={(f, to, promo) => handleMoveAttempt(f, to, promo)}
          />

          {/* Stepper & Control Buttons */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 pt-1">
            <button
              type="button"
              onClick={handleReset}
              disabled={stepIndex === 0}
              className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/45 transition-colors disabled:opacity-45"
            >
              <SkipBack className="w-3.5 h-3.5 shrink-0" />
              <span>{t.openingsResetBtn}</span>
            </button>

            <button
              type="button"
              onClick={handlePrev}
              disabled={stepIndex === 0}
              className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/45 transition-colors disabled:opacity-45"
            >
              <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
              <span>{t.openingsPrevBtn}</span>
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={stepIndex >= timeline.length - 1}
              className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 border border-cyan-300 transition-colors disabled:opacity-45"
            >
              <span>{t.openingsNextBtn}</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => {
                unlockAudioContext();
                if (!isAutoPlaying && stepIndex >= timeline.length - 1) {
                  setStepIndex(0);
                }
                setIsAutoPlaying((v) => !v);
              }}
              aria-pressed={isAutoPlaying}
              className={`inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
                isAutoPlaying
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-slate-900/35 hover:bg-slate-800/65 text-white border-slate-400/45'
              }`}
            >
              {isAutoPlaying ? (
                <Pause className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isAutoPlaying ? t.openingsPauseBtn : t.openingsAutoPlayBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNextArrow((v) => !v)}
              aria-pressed={showNextArrow}
              className={`inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
                showNextArrow
                  ? 'bg-emerald-400 text-slate-950 border-emerald-300 shadow-sm'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 border-emerald-400/55'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <span>{t.openingsArrowBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => setOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}
              className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/45 transition-colors"
            >
              <FlipVertical2 className="w-3.5 h-3.5 shrink-0" />
              <span>{t.openingsFlipBtn}</span>
            </button>
          </div>
        </div>

        {/* Right: Written Move Explanation + Strategic Overview + Move Chips */}
        <div className="lg:col-span-6 space-y-3.5 sm:space-y-4">
          {/* Current Move Written Explanation */}
          <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
              <h3 className="text-xs sm:text-sm font-bold text-cyan-200">
                {t.openingsMoveExplanationTitle}
              </h3>
              <span className="text-[11px] sm:text-xs font-semibold text-slate-200">
                {t.turnPrefix}{' '}
                <strong className="text-white">
                  {currentStep.turnAfter === 'w' ? t.whiteName : t.blackName}
                </strong>
              </span>
            </div>

            {stepIndex === 0 ? (
              <div className="p-3 rounded-lg bg-slate-900/35 border border-slate-400/40 text-xs sm:text-sm text-white leading-relaxed">
                {t.openingsStartHint}
              </div>
            ) : (
              <div className="p-3 sm:p-3.5 rounded-lg bg-emerald-500/15 border border-emerald-400/60 space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-xs sm:text-sm font-bold px-2 py-0.5 rounded bg-emerald-950/75 text-emerald-200 border border-emerald-400/45"
                    dir="ltr"
                  >
                    {activeMoveLabel}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">{currentNote}</p>
              </div>
            )}

            {interactiveWarning && (
              <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-400/60 text-xs sm:text-sm text-amber-100 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <span>
                  {t.openingsWrongInteractiveMove(
                    interactiveWarning.playedSan,
                    interactiveWarning.expectedSan
                  )}
                </span>
              </div>
            )}

            {currentStep.nextExpected ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900/35 border border-slate-400/40 text-xs sm:text-sm">
                <span className="text-cyan-200 font-semibold">
                  {t.openingsExpectedNextLabel(currentStep.nextExpected.san)}
                </span>
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-2.5 py-1 text-[11px] font-bold rounded bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors"
                >
                  {t.openingsNextBtn}
                </button>
              </div>
            ) : (
              <div className="p-2.5 rounded-lg bg-cyan-500/15 border border-cyan-400/55 text-xs sm:text-sm text-cyan-100 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
                <span>{t.openingsCompletedNote}</span>
              </div>
            )}
          </div>

          {/* Written Strategic Idea + White & Black Plans */}
          <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-white">{t.openingsSummaryTitle}</h3>
            <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
              {openingCopy.summary}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-slate-900/35 border border-slate-400/40 space-y-1">
                <div className="text-[11px] sm:text-xs font-bold text-cyan-200">
                  {t.openingsWhitePlanLabel}
                </div>
                <p className="text-xs text-slate-100 leading-relaxed">{openingCopy.whitePlan}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/35 border border-slate-400/40 space-y-1">
                <div className="text-[11px] sm:text-xs font-bold text-emerald-200">
                  {t.openingsBlackPlanLabel}
                </div>
                <p className="text-xs text-slate-100 leading-relaxed">{openingCopy.blackPlan}</p>
              </div>
            </div>
          </div>

          {/* Interactive Move Sequence Chips */}
          <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-2.5">
            <h3 className="text-xs sm:text-sm font-bold text-slate-100">
              {t.openingsMovesTimelineTitle}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
              <button
                type="button"
                onClick={handleReset}
                className={`px-2 py-1 text-[11px] sm:text-xs font-bold rounded border transition-colors ${
                  stepIndex === 0
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900/35 text-slate-200 border-slate-400/45 hover:bg-slate-800/65'
                }`}
              >
                0.
              </button>
              {activeOpening.moves.map((san, idx) => {
                const ply = idx + 1;
                const moveNumber = Math.ceil(ply / 2);
                const isWhiteMove = ply % 2 === 1;
                const isActive = stepIndex === ply;
                return (
                  <button
                    key={`${activeOpening.id}-${ply}`}
                    type="button"
                    onClick={() => {
                      setIsAutoPlaying(false);
                      setInteractiveWarning(null);
                      setStepIndex(ply);
                    }}
                    className={`px-2 py-1 text-[11px] sm:text-xs font-mono font-bold rounded border transition-colors ${
                      isActive
                        ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm'
                        : ply < stepIndex
                        ? 'bg-emerald-500/20 text-emerald-100 border-emerald-400/45 hover:bg-emerald-500/30'
                        : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
                    }`}
                  >
                    {isWhiteMove ? `${moveNumber}. ` : `${moveNumber}... `}
                    {san}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
