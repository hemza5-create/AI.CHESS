import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  Bot,
  Crown,
  FlipVertical2,
  Lightbulb,
  Loader2,
  Navigation,
  PlusSquare,
  RotateCcw,
  Swords,
  Undo2,
} from 'lucide-react';
import { TacticalBoard } from './TacticalBoard.tsx';
import { localStockfishEngine } from '../engine/localStockfishEngine.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { getLocalizedGameOverReason, type GameOverKey } from '../i18n/translations.ts';
import { playMoveTapSound, unlockAudioContext } from '../utils/soundEffects.ts';
import type { BoardOrientation, StockfishAnalysisResult } from '../types/chess.ts';

export type AiStrengthTier = 'weak' | 'beginner' | 'intermediate' | 'advanced' | 'master';

interface AiTierConfig {
  id: AiStrengthTier;
  elo: number;
  depth: number;
  multiPv: number;
}

const AI_TIERS: AiTierConfig[] = [
  { id: 'weak', elo: 500, depth: 1, multiPv: 3 },
  { id: 'beginner', elo: 1000, depth: 4, multiPv: 3 },
  { id: 'intermediate', elo: 1500, depth: 7, multiPv: 2 },
  { id: 'advanced', elo: 2000, depth: 11, multiPv: 2 },
  { id: 'master', elo: 2500, depth: 15, multiPv: 3 },
];

function resolveGameOverKey(chess: Chess): GameOverKey | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? 'checkmate_black' : 'checkmate_white';
  }
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isThreefoldRepetition()) return 'threefold';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  return 'draw';
}

function selectMoveForTier(
  fen: string,
  analysis: StockfishAnalysisResult,
  tier: AiStrengthTier,
  turn: 'w' | 'b'
): string | null {
  const best = analysis.bestMove;
  if (!best) return null;
  const lines = analysis.lines;

  if (tier === 'weak') {
    // 500 Elo: mix random legal moves with lower-ranked lines for true novice strength
    try {
      const temp = new Chess(fen);
      const legal = temp.moves({ verbose: true });
      if (legal.length > 0 && Math.random() < 0.62) {
        const pick = legal[Math.floor(Math.random() * legal.length)];
        return `${pick.from}${pick.to}${pick.promotion ?? ''}`;
      }
    } catch {
      // fallback to engine lines
    }
    if (lines && lines.length >= 3 && lines[2].pvUci[0]) return lines[2].pvUci[0];
    if (lines && lines.length >= 2 && lines[1].pvUci[0]) return lines[1].pvUci[0];
    return best;
  }

  if (!lines || lines.length <= 1) return best;

  const normalizeForMover = (scoreType: 'cp' | 'mate', val: number): number => {
    const absScore = scoreType === 'mate' ? (val > 0 ? 10000 : -10000) : val;
    return turn === 'w' ? absScore : -absScore;
  };

  if (tier === 'beginner') {
    const roll = Math.random();
    if (roll < 0.48 && lines.length >= 3 && lines[2].pvUci[0]) {
      return lines[2].pvUci[0];
    }
    if (roll < 0.78 && lines.length >= 2 && lines[1].pvUci[0]) {
      return lines[1].pvUci[0];
    }
    return best;
  }

  if (tier === 'intermediate') {
    const topLine = lines[0];
    const secondLine = lines[1];
    if (topLine && secondLine && secondLine.pvUci[0]) {
      const s1 = normalizeForMover(topLine.scoreType, topLine.scoreValue);
      const s2 = normalizeForMover(secondLine.scoreType, secondLine.scoreValue);
      if (s1 - s2 <= 130 && Math.random() < 0.25) {
        return secondLine.pvUci[0];
      }
    }
    return best;
  }

  return best;
}

export const PlayVsStockfishPanel: React.FC = () => {
  const { language, t } = useLanguage();

  const [aiTier, setAiTier] = useState<AiStrengthTier>('intermediate');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [orientation, setOrientation] = useState<BoardOrientation>('white');

  const chessRef = useRef<Chess>(new Chess());
  const gameSessionRef = useRef<number>(1);
  const aiTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const [fen, setFen] = useState<string>(() => chessRef.current.fen());
  const [movesSan, setMovesSan] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [lastAiSan, setLastAiSan] = useState<string | null>(null);
  const [evalResult, setEvalResult] = useState<StockfishAnalysisResult | null>(null);
  const [hintMove, setHintMove] = useState<{
    from: string;
    to: string;
    san: string;
  } | null>(null);
  const [isRequestingHint, setIsRequestingHint] = useState<boolean>(false);
  const [showBestArrow, setShowBestArrow] = useState<boolean>(false);
  const [arrowMove, setArrowMove] = useState<{ from: string; to: string } | null>(null);
  const [gameOverKey, setGameOverKey] = useState<GameOverKey | null>(null);

  const tierConfig = useMemo(
    () => AI_TIERS.find((item) => item.id === aiTier) ?? AI_TIERS[2],
    [aiTier]
  );

  const clearAiTimer = useCallback(() => {
    if (aiTimerRef.current !== null) {
      globalThis.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      gameSessionRef.current += 1;
      clearAiTimer();
    };
  }, [clearAiTimer]);

  // Keep best-move arrow updated ONLY when user has toggled showBestArrow ON
  useEffect(() => {
    if (!showBestArrow || gameOverKey || isAiThinking) {
      if (!showBestArrow || gameOverKey) {
        setArrowMove(null);
      }
      return;
    }

    if (evalResult?.fen === fen && evalResult.bestMove && evalResult.bestMove.length >= 4) {
      setArrowMove({
        from: evalResult.bestMove.slice(0, 2),
        to: evalResult.bestMove.slice(2, 4),
      });
      return;
    }

    let cancelled = false;
    const sessionId = gameSessionRef.current;
    void localStockfishEngine
      .analyze(fen, 10, 1, 2000, false)
      .then((res) => {
        if (cancelled || gameSessionRef.current !== sessionId) return;
        setEvalResult(res);
        if (res.bestMove && res.bestMove.length >= 4) {
          setArrowMove({
            from: res.bestMove.slice(0, 2),
            to: res.bestMove.slice(2, 4),
          });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [evalResult, fen, gameOverKey, isAiThinking, showBestArrow]);

  const triggerAiTurn = useCallback(
    (targetFen: string, sessionId: number, activeTier: AiTierConfig) => {
      clearAiTimer();
      setIsAiThinking(true);
      setArrowMove(null);

      aiTimerRef.current = globalThis.setTimeout(async () => {
        if (gameSessionRef.current !== sessionId) return;
        try {
          const res = await localStockfishEngine.analyze(
            targetFen,
            activeTier.depth,
            activeTier.multiPv,
            activeTier.elo,
            false
          );
          if (gameSessionRef.current !== sessionId) return;

          setEvalResult(res);
          const game = chessRef.current;
          const aiColor = game.turn();
          const chosenUci = selectMoveForTier(targetFen, res, activeTier.id, aiColor);

          if (!chosenUci) {
            setGameOverKey(resolveGameOverKey(game));
            return;
          }

          const from = chosenUci.slice(0, 2);
          const to = chosenUci.slice(2, 4);
          const promo = chosenUci.length > 4 ? chosenUci[4] : undefined;
          const move = game.move({ from, to, promotion: promo });
          if (!move) {
            setGameOverKey(resolveGameOverKey(game));
            return;
          }

          const afterFen = game.fen();
          setFen(afterFen);
          setMovesSan(game.history());
          setLastMove({ from: move.from, to: move.to });
          setLastAiSan(move.san);
          setHintMove(null);
          playMoveTapSound(Boolean(move.captured));

          const overKey = resolveGameOverKey(game);
          setGameOverKey(overKey);

          if (!overKey) {
            const evalAfter = await localStockfishEngine.analyze(
              afterFen,
              Math.max(8, Math.min(11, activeTier.depth + 2)),
              1,
              activeTier.elo,
              false
            );
            if (gameSessionRef.current === sessionId) {
              setEvalResult(evalAfter);
            }
          }
        } catch {
          // Keep board playable if worker resets unexpectedly
        } finally {
          if (gameSessionRef.current === sessionId) {
            setIsAiThinking(false);
          }
        }
      }, 320);
    },
    [clearAiTimer]
  );

  const startNewBoard = useCallback(
    (nextColor: 'w' | 'b' = playerColor, nextTier: AiStrengthTier = aiTier) => {
      clearAiTimer();
      const nextSession = ++gameSessionRef.current;
      const fresh = new Chess();
      chessRef.current = fresh;
      const startFen = fresh.fen();

      setFen(startFen);
      setMovesSan([]);
      setLastMove(null);
      setLastAiSan(null);
      setHintMove(null);
      setArrowMove(null);
      setGameOverKey(null);
      setIsAiThinking(false);
      setEvalResult(null);
      setOrientation(nextColor === 'b' ? 'black' : 'white');

      if (nextColor === 'b') {
        const cfg = AI_TIERS.find((item) => item.id === nextTier) ?? AI_TIERS[2];
        triggerAiTurn(startFen, nextSession, cfg);
      }
    },
    [aiTier, clearAiTimer, playerColor, triggerAiTurn]
  );

  const handleSelectColor = (nextColor: 'w' | 'b') => {
    if (nextColor === playerColor) return;
    setPlayerColor(nextColor);
    startNewBoard(nextColor, aiTier);
  };

  const handleSelectTier = (nextTier: AiStrengthTier) => {
    setAiTier(nextTier);
  };

  const handleMoveAttempt = (from: string, to: string, promotion?: string) => {
    const game = chessRef.current;
    if (isAiThinking || gameOverKey || game.turn() !== playerColor) return false;
    unlockAudioContext();

    let move;
    try {
      move = game.move({ from, to, promotion });
    } catch {
      return false;
    }
    if (!move) return false;

    const nextFen = game.fen();
    setFen(nextFen);
    setMovesSan(game.history());
    setLastMove({ from: move.from, to: move.to });
    setHintMove(null);
    setArrowMove(null);
    playMoveTapSound(Boolean(move.captured));

    const overKey = resolveGameOverKey(game);
    if (overKey) {
      setGameOverKey(overKey);
      return true;
    }

    triggerAiTurn(nextFen, gameSessionRef.current, tierConfig);
    return true;
  };

  const handleUndoTurn = () => {
    const game = chessRef.current;
    if (isAiThinking || game.history().length === 0) return;

    clearAiTimer();
    const sessionId = ++gameSessionRef.current;

    if (game.turn() === playerColor && game.history().length >= 2) {
      game.undo();
      game.undo();
    } else {
      game.undo();
      if (game.turn() !== playerColor && game.history().length >= 1) {
        game.undo();
      }
    }

    const updatedFen = game.fen();
    setFen(updatedFen);
    setMovesSan(game.history());
    setLastMove(null);
    setLastAiSan(null);
    setHintMove(null);
    setArrowMove(null);
    setGameOverKey(resolveGameOverKey(game));

    void localStockfishEngine
      .analyze(updatedFen, 8, 1, tierConfig.elo, false)
      .then((res) => {
        if (gameSessionRef.current === sessionId) {
          setEvalResult(res);
        }
      })
      .catch(() => undefined);
  };

  const handleRequestHint = async () => {
    const game = chessRef.current;
    if (isAiThinking || isRequestingHint || gameOverKey || game.turn() !== playerColor) return;
    unlockAudioContext();

    const sessionId = gameSessionRef.current;
    setIsRequestingHint(true);
    try {
      const res = await localStockfishEngine.analyze(game.fen(), 11, 2, 2200, false);
      if (gameSessionRef.current !== sessionId) return;
      setEvalResult(res);
      if (res.bestMove && res.bestMove.length >= 4) {
        setHintMove({
          from: res.bestMove.slice(0, 2),
          to: res.bestMove.slice(2, 4),
          san: res.bestMoveSan ?? res.bestMove,
        });
      }
    } catch {
      // ignore
    } finally {
      if (gameSessionRef.current === sessionId) {
        setIsRequestingHint(false);
      }
    }
  };

  const movePairs = useMemo(() => {
    const pairs: { moveNum: number; white: string; black?: string }[] = [];
    for (let i = 0; i < movesSan.length; i += 2) {
      pairs.push({
        moveNum: Math.floor(i / 2) + 1,
        white: movesSan[i],
        black: movesSan[i + 1],
      });
    }
    return pairs;
  }, [movesSan]);

  const currentTurn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const playerSideName = playerColor === 'w' ? t.whiteName : t.blackName;
  const gameOverText = gameOverKey ? getLocalizedGameOverReason(language, gameOverKey) : null;

  return (
    <div className="space-y-3.5 sm:space-y-5">
      {/* Match Setup & 5 Stockfish Strength Levels (500..2500 Elo) */}
      <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-5 shadow-lg space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
              <Swords className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300 shrink-0" />
              <span>{t.playAiTitle}</span>
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-200">{t.playAiSubtitle}</p>
          </div>

          <button
            type="button"
            onClick={() => startNewBoard(playerColor, aiTier)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors whitespace-nowrap shrink-0"
          >
            <PlusSquare className="w-4 h-4 shrink-0" />
            <span>{t.playAiNewBoardBtn}</span>
          </button>
        </div>

        {/* 5 Stockfish Strength Levels: Weak (500), Beginner (1000), Intermediate (1500), Advanced (2000), Master (2500) */}
        <div className="space-y-1.5 pt-2 border-t border-slate-500/35">
          <div className="text-xs sm:text-sm font-bold text-slate-100">{t.playAiDifficultyLabel}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {AI_TIERS.map((tier) => {
              const active = aiTier === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => handleSelectTier(tier.id)}
                  className={`flex flex-col items-start justify-center px-3 py-2 rounded-lg border text-start transition-colors ${
                    active
                      ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm'
                      : 'bg-slate-900/35 hover:bg-slate-800/65 text-white border-slate-400/45'
                  }`}
                >
                  <span className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                    {tier.id === 'master' ? (
                      <Crown className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Bot className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{t.playAiLevels[tier.id]}</span>
                  </span>
                  <span
                    className={`text-[10px] sm:text-xs font-mono tabular-nums mt-0.5 ${
                      active ? 'text-slate-900 font-semibold' : 'text-slate-300'
                    }`}
                    dir="ltr"
                  >
                    {t.playAiLevelSubtitles[tier.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Side Selector (White vs Black) */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs sm:text-sm font-bold text-slate-200">{t.playAiSideLabel}</span>
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-950/35 border border-slate-400/45">
            <button
              type="button"
              onClick={() => handleSelectColor('w')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                playerColor === 'w'
                  ? 'bg-slate-100 text-slate-950'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t.whiteName}
            </button>
            <button
              type="button"
              onClick={() => handleSelectColor('b')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                playerColor === 'b'
                  ? 'bg-slate-700 text-white border border-slate-400/70'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t.blackName}
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Column Play Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-5 items-start">
        {/* Left: Interactive Chessboard + Action Buttons */}
        <div className="lg:col-span-6 border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-2.5 sm:p-4 shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-500/40">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white">
              {isAiThinking ? (
                <>
                  <Loader2 className="w-4 h-4 text-cyan-300 animate-spin shrink-0" />
                  <span className="text-cyan-200">{t.playAiThinking}</span>
                </>
              ) : gameOverText ? (
                <span className="text-amber-300">{gameOverText}</span>
              ) : (
                <span>
                  {currentTurn === playerColor
                    ? t.playAiYourTurn(playerSideName)
                    : t.playAiThinking}
                </span>
              )}
            </div>

            <span className="text-[11px] sm:text-xs font-mono font-semibold text-slate-200" dir="ltr">
              {t.playAiLevels[aiTier]} · {tierConfig.elo} Elo
            </span>
          </div>

          <TacticalBoard
            fen={fen}
            orientation={orientation}
            lastMove={lastMove}
            hintSquares={hintMove ? { from: hintMove.from, to: hintMove.to } : null}
            bestMoveArrow={
              showBestArrow && arrowMove
                ? { from: arrowMove.from, to: arrowMove.to, color: '#10B981' }
                : null
            }
            showHintArrow={false}
            evaluationLabel={evalResult?.evaluationLabel ?? '0.00'}
            winProbabilityWhite={evalResult?.winProbabilityWhite ?? 50}
            showEvalBar={true}
            disabled={isAiThinking || Boolean(gameOverKey) || currentTurn !== playerColor}
            onMoveAttempt={handleMoveAttempt}
          />

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowBestArrow((v) => !v)}
              disabled={Boolean(gameOverKey)}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md border transition-colors disabled:opacity-50 ${
                showBestArrow
                  ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border-emerald-400/60'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.coachBestArrowBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleRequestHint()}
              disabled={isAiThinking || isRequestingHint || Boolean(gameOverKey)}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md border transition-colors disabled:opacity-50 ${
                hintMove
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/60'
              }`}
            >
              {isRequestingHint ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Lightbulb className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{t.coachHintBtn}</span>
            </button>

            <button
              type="button"
              onClick={handleUndoTurn}
              disabled={isAiThinking || movesSan.length === 0}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/50 transition-colors disabled:opacity-45"
            >
              <Undo2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.playAiUndoBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => startNewBoard(playerColor, aiTier)}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.coachResetBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => setOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/50 transition-colors"
            >
              <FlipVertical2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.coachFlipBtn}</span>
            </button>
          </div>
        </div>

        {/* Right: Game Over Summary, Live Eval & Move List */}
        <div className="lg:col-span-6 space-y-3.5 sm:space-y-4">
          {gameOverText && (
            <div className="border border-amber-400/70 bg-amber-500/15 backdrop-blur-md rounded-xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-amber-200">{t.playAiGameOverLabel}</div>
                <div className="text-base sm:text-lg font-bold text-white mt-0.5">
                  {gameOverText}
                </div>
              </div>
              <button
                type="button"
                onClick={() => startNewBoard(playerColor, aiTier)}
                className="px-4 py-2 text-xs sm:text-sm font-bold rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors"
              >
                {t.playAiPlayAgainBtn}
              </button>
            </div>
          )}

          {/* Live Coach Evaluation Box */}
          <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
              <h3 className="text-xs sm:text-sm font-bold text-white">{t.playAiCoachTipTitle}</h3>
              <span className="font-mono font-bold text-xs sm:text-sm text-cyan-200 tabular-nums" dir="ltr">
                {evalResult?.evaluationLabel ?? '0.00'}
              </span>
            </div>

            {hintMove ? (
              <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-400/55 text-xs sm:text-sm text-amber-100">
                {t.playAiHintMessage(hintMove.san, hintMove.from, hintMove.to)}
              </div>
            ) : lastAiSan ? (
              <div className="p-2.5 rounded-lg bg-slate-900/35 border border-slate-400/40 text-xs sm:text-sm text-white">
                {t.playAiLastAiMove(lastAiSan)}
              </div>
            ) : (
              <div className="p-2.5 rounded-lg bg-slate-900/35 border border-slate-400/40 text-xs sm:text-sm text-slate-100">
                {t.playAiDefaultTip}
              </div>
            )}
          </div>

          {/* Match Move History */}
          <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
              <h3 className="text-xs sm:text-sm font-bold text-white">{t.playAiMovesTitle}</h3>
              <span className="text-xs font-mono text-slate-100 tabular-nums">
                {t.moveCount(movesSan.length)}
              </span>
            </div>

            {movePairs.length === 0 ? (
              <p className="text-xs sm:text-sm text-slate-100 py-2">{t.playAiEmptyMoves}</p>
            ) : (
              <div className="max-h-60 overflow-y-auto pr-1 space-y-1" dir="ltr">
                {movePairs.map((row) => (
                  <div
                    key={row.moveNum}
                    className="grid grid-cols-12 items-center px-2.5 py-1 rounded bg-slate-900/35 text-xs font-mono tabular-nums"
                  >
                    <span className="col-span-2 text-slate-200 font-bold">{row.moveNum}.</span>
                    <span className="col-span-5 text-white font-semibold">{row.white}</span>
                    <span className="col-span-5 text-cyan-200 font-semibold">
                      {row.black ?? ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
