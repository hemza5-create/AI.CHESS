import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { motion, useReducedMotion } from 'motion/react';
import { RotateCcw, ArrowUpDown, Undo2, Navigation, RefreshCw, Edit3 } from 'lucide-react';
import { ChessPieceSvg, type PieceCode } from './ChessPieces.tsx';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import type { BoardOrientation, StockfishAnalysisResult } from '../types/chess.ts';

interface DigitalBoardProps {
  fen: string;
  orientation: BoardOrientation;
  lastMove: {
    from: string;
    to: string;
    source?: 'vision' | 'manual' | 'virtual';
    detectedAt?: number;
  } | null;
  analysis: StockfishAnalysisResult | null;
  isAnalyzing: boolean;
  onManualMove: (from: string, to: string, promotion?: string) => void;
  onFlipOrientation: () => void;
  onUndoMove: () => void;
  onResetBoard: () => void;
  onToggleTurn: () => void;
  onApplyFen: (nextFen: string) => boolean;
  canUndo: boolean;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

function squareCenterPercent(
  sq: string,
  orientation: BoardOrientation
): { x: number; y: number } | null {
  if (!sq || sq.length < 2) return null;
  const f = FILES.indexOf(sq[0]);
  const r = RANKS.indexOf(sq[1]);
  if (f < 0 || r < 0) return null;
  const col = orientation === 'white' ? f : 7 - f;
  const row = orientation === 'white' ? r : 7 - r;
  return {
    x: (col + 0.5) * 12.5,
    y: (row + 0.5) * 12.5,
  };
}

function buildArrowPolygon(
  from: { x: number; y: number },
  to: { x: number; y: number },
  shaftHalfWidth = 1.25,
  headHalfWidth = 3.1,
  headLength = 4.4,
  startTrim = 2.2,
  endTrim = 1.6
): { points: string; tip: { x: number; y: number } } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return null;

  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy;
  const ny = ux;

  const sx = from.x + ux * startTrim;
  const sy = from.y + uy * startTrim;
  const tipX = to.x - ux * endTrim;
  const tipY = to.y - uy * endTrim;
  const baseX = tipX - ux * headLength;
  const baseY = tipY - uy * headLength;

  const p1 = `${(sx + nx * shaftHalfWidth).toFixed(2)},${(sy + ny * shaftHalfWidth).toFixed(2)}`;
  const p2 = `${(baseX + nx * shaftHalfWidth).toFixed(2)},${(baseY + ny * shaftHalfWidth).toFixed(2)}`;
  const p3 = `${(baseX + nx * headHalfWidth).toFixed(2)},${(baseY + ny * headHalfWidth).toFixed(2)}`;
  const p4 = `${tipX.toFixed(2)},${tipY.toFixed(2)}`;
  const p5 = `${(baseX - nx * headHalfWidth).toFixed(2)},${(baseY - ny * headHalfWidth).toFixed(2)}`;
  const p6 = `${(baseX - nx * shaftHalfWidth).toFixed(2)},${(baseY - ny * shaftHalfWidth).toFixed(2)}`;
  const p7 = `${(sx - nx * shaftHalfWidth).toFixed(2)},${(sy - ny * shaftHalfWidth).toFixed(2)}`;

  return {
    points: `${p1} ${p2} ${p3} ${p4} ${p5} ${p6} ${p7}`,
    tip: { x: tipX, y: tipY },
  };
}

export const DigitalBoard: React.FC<DigitalBoardProps> = ({
  fen,
  orientation,
  lastMove,
  analysis,
  isAnalyzing,
  onManualMove,
  onFlipOrientation,
  onUndoMove,
  onResetBoard,
  onToggleTurn,
  onApplyFen,
  canUndo,
}) => {
  const { t } = useLanguage();
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [showBestArrow, setShowBestArrow] = useState<boolean>(true);
  const [editingFen, setEditingFen] = useState<boolean>(false);
  const [fenDraft, setFenDraft] = useState<string>(fen);
  const [fenError, setFenError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  React.useEffect(() => {
    setSelectedSquare(null);
    setFenDraft(fen);
    setFenError(null);
  }, [fen]);

  const { boardGrid, legalTargets, turn, checkSquare, promotionMoves } = useMemo(() => {
    const chess = new Chess(fen);
    const grid = chess.board();
    const targets = new Set<string>();
    const promos = new Set<string>();
    if (selectedSquare) {
      try {
        const moves = chess.moves({ square: selectedSquare as Square, verbose: true });
        for (const m of moves) {
          targets.add(m.to);
          if (m.promotion) promos.add(m.to);
        }
      } catch {
        // Ignore invalid square selection after FEN changes
      }
    }

    let kingCheckSq: string | null = null;
    if (chess.inCheck()) {
      const t = chess.turn();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const cell = grid[r][c];
          if (cell && cell.type === 'k' && cell.color === t) {
            kingCheckSq = `${FILES[c]}${RANKS[r]}`;
          }
        }
      }
    }

    return {
      boardGrid: grid,
      legalTargets: targets,
      turn: chess.turn(),
      checkSquare: kingCheckSq,
      promotionMoves: promos,
    };
  }, [fen, selectedSquare]);

  const handleSquareClick = (sqName: string, hasOwnPiece: boolean) => {
    if (selectedSquare && legalTargets.has(sqName)) {
      const promo = promotionMoves.has(sqName) ? 'q' : undefined;
      onManualMove(selectedSquare, sqName, promo);
      setSelectedSquare(null);
      return;
    }
    if (selectedSquare === sqName) {
      setSelectedSquare(null);
      return;
    }
    if (hasOwnPiece) {
      setSelectedSquare(sqName);
    } else {
      setSelectedSquare(null);
    }
  };

  const whiteBarPct = analysis ? analysis.winProbabilityWhite : 50;
  const bestArrow = useMemo(() => {
    if (!showBestArrow || !analysis?.bestMove || analysis.bestMove.length < 4) return null;
    const from = squareCenterPercent(analysis.bestMove.slice(0, 2), orientation);
    const to = squareCenterPercent(analysis.bestMove.slice(2, 4), orientation);
    if (!from || !to) return null;
    const poly = buildArrowPolygon(from, to, 1.25, 3.1, 4.4, 2.0, 1.5);
    if (!poly) return null;
    return { from, to, ...poly, moveKey: analysis.bestMove, san: analysis.bestMoveSan };
  }, [showBestArrow, analysis?.bestMove, analysis?.bestMoveSan, orientation]);

  const ponderArrow = useMemo(() => {
    if (!showBestArrow || !analysis?.ponder || analysis.ponder.length < 4) return null;
    const from = squareCenterPercent(analysis.ponder.slice(0, 2), orientation);
    const to = squareCenterPercent(analysis.ponder.slice(2, 4), orientation);
    if (!from || !to) return null;
    const poly = buildArrowPolygon(from, to, 0.7, 2.0, 3.2, 2.4, 2.0);
    if (!poly) return null;
    return { from, to, ...poly };
  }, [showBestArrow, analysis?.ponder, orientation]);

  return (
    <section className="flex flex-col border border-slate-500/45 bg-[#0F1522]/55 backdrop-blur-md rounded-xl overflow-hidden shadow-lg">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 border-b border-slate-500/45 bg-[#0B0E14]/45">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-white whitespace-nowrap">
            {t.syncBoardTitle}
          </h2>
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            onClick={onToggleTurn}
            title={t.toggleTurnTooltip}
            className="inline-flex items-center gap-1 text-[11px] sm:text-sm font-semibold text-cyan-200 hover:text-white truncate rounded-md px-2 py-1 sm:px-2.5 bg-cyan-500/20 border border-cyan-400/50 transition-colors"
          >
            <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span>
              {t.turnPrefix} {turn === 'w' ? t.whiteName : t.blackName}
            </span>
          </button>
          {analysis && (
            <span className="text-xs sm:text-sm font-mono font-bold text-slate-100 truncate" dir="ltr">
              {analysis.evaluationLabel}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowBestArrow((v) => !v)}
            title={t.arrowTooltip}
            className={`inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              showBestArrow
                ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/60'
                : 'text-slate-100 hover:text-white bg-slate-900/55 hover:bg-slate-800 border border-slate-600/60'
            }`}
          >
            <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t.arrowBtn}</span>
          </button>
          <button
            type="button"
            onClick={onFlipOrientation}
            title={t.flipTooltip}
            className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-sm font-semibold text-slate-100 hover:text-white bg-slate-900/55 hover:bg-slate-800 border border-slate-600/60 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowUpDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t.flipBtn}</span>
          </button>
          <button
            type="button"
            onClick={onUndoMove}
            disabled={!canUndo}
            title={t.undoTooltip}
            className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-sm font-semibold text-slate-100 hover:text-white bg-slate-900/55 hover:bg-slate-800 border border-slate-600/60 disabled:opacity-40 disabled:pointer-events-none rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t.undoBtn}</span>
          </button>
          <button
            type="button"
            onClick={onResetBoard}
            title={t.resetTooltip}
            className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-sm font-semibold text-slate-100 hover:text-white bg-slate-900/55 hover:bg-slate-800 border border-slate-600/60 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t.resetBtn}</span>
          </button>
        </div>
      </div>

      {/* Board + Evaluation Bar (LTR container so chess coordinates stay standard) */}
      <div className="p-2.5 sm:p-4 flex items-stretch justify-center gap-2 sm:gap-3" dir="ltr">
        {/* Stockfish Evaluation Bar */}
        <div
          className="w-5 sm:w-8 rounded-md bg-slate-950/65 border border-slate-500/60 relative overflow-hidden flex flex-col justify-between shrink-0"
          aria-label={t.evalBarAria(analysis?.evaluationLabel ?? '0.00')}
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-slate-100/85 transition-transform duration-300 ease-out origin-bottom"
            style={{
              height: '100%',
              transform: `scaleY(${whiteBarPct / 100})`,
            }}
          />
          <span className="relative z-10 text-[9px] sm:text-[11px] font-mono font-bold text-center pt-1 text-slate-100 mix-blend-difference">
            {analysis && analysis.scoreValue < 0 ? analysis.evaluationLabel : ''}
          </span>
          <span className="relative z-10 text-[9px] sm:text-[11px] font-mono font-bold text-center pb-1 text-slate-100 mix-blend-difference">
            {analysis && analysis.scoreValue >= 0 ? analysis.evaluationLabel : '0.0'}
          </span>
        </div>

        {/* 8x8 Chessboard */}
        <div className="relative flex-1 aspect-square max-w-[310px] sm:max-w-[520px] border border-slate-700 rounded-md overflow-hidden select-none">
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
            {Array.from({ length: 64 }).map((_, idx) => {
              const r = Math.floor(idx / 8);
              const c = idx % 8;
              const boardRow = orientation === 'white' ? r : 7 - r;
              const boardCol = orientation === 'white' ? c : 7 - c;
              const sqName = `${FILES[boardCol]}${RANKS[boardRow]}`;
              const isLight = (boardRow + boardCol) % 2 === 0;
              const cell = boardGrid[boardRow][boardCol];
              const isLast =
                lastMove && (lastMove.from === sqName || lastMove.to === sqName);
              const isSelected = selectedSquare === sqName;
              const isLegalTarget = legalTargets.has(sqName);
              const isCheckedKing = checkSquare === sqName;
              const hasOwnPiece = Boolean(cell && cell.color === turn);

              let bgClass = isLight ? 'bg-[#F0F4EE]/60' : 'bg-[#4D8B55]/65';
              if (isLast) {
                bgClass = isLight ? 'bg-amber-200/70' : 'bg-amber-500/65';
              }
              if (isSelected) {
                bgClass = 'bg-cyan-400/65';
              }
              if (isCheckedKing) {
                bgClass = 'bg-rose-600/75';
              }

              const pieceCode = cell
                ? (`${cell.color}${cell.type.toUpperCase()}` as PieceCode)
                : null;

              return (
                <button
                  key={sqName}
                  type="button"
                  onClick={() => handleSquareClick(sqName, hasOwnPiece)}
                  aria-label={t.squareAria(sqName)}
                  className={`relative flex items-center justify-center p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${bgClass} ${
                    hasOwnPiece || isLegalTarget ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  {/* Rank label on left edge */}
                  {c === 0 && (
                    <span
                      className={`absolute top-0.5 left-0.5 sm:left-1 text-[9px] sm:text-[11px] font-mono font-bold leading-none drop-shadow ${
                        isLight ? 'text-[#1F4724]' : 'text-white'
                      }`}
                    >
                      {RANKS[boardRow]}
                    </span>
                  )}
                  {/* File label on bottom edge */}
                  {r === 7 && (
                    <span
                      className={`absolute bottom-0.5 right-0.5 sm:right-1 text-[9px] sm:text-[11px] font-mono font-bold leading-none drop-shadow ${
                        isLight ? 'text-[#1F4724]' : 'text-white'
                      }`}
                    >
                      {FILES[boardCol]}
                    </span>
                  )}

                  {pieceCode && (
                    <ChessPieceSvg
                      piece={pieceCode}
                      className="w-[84%] h-[84%] drop-shadow-sm pointer-events-none relative z-10"
                    />
                  )}

                  {isLast &&
                    lastMove?.source === 'vision' &&
                    lastMove.detectedAt &&
                    !prefersReducedMotion && (
                      <>
                        <motion.span
                          key={`pulse-${lastMove.detectedAt}-${sqName}`}
                          initial={{ opacity: 0.9, scale: 0.72 }}
                          animate={{ opacity: 0, scale: 1.08 }}
                          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                          className={`absolute inset-0.5 rounded-sm border-2 pointer-events-none z-20 ${
                            lastMove.to === sqName
                              ? 'border-emerald-400 bg-emerald-400/25'
                              : 'border-cyan-400 bg-cyan-400/20'
                          }`}
                        />
                        <motion.span
                          key={`glow-${lastMove.detectedAt}-${sqName}`}
                          initial={{ opacity: 0.85 }}
                          animate={{ opacity: 0.25 }}
                          transition={{ duration: 0.9, ease: 'easeOut' }}
                          className={`absolute inset-0 pointer-events-none ${
                            lastMove.to === sqName
                              ? 'ring-2 ring-inset ring-emerald-400/75'
                              : 'ring-2 ring-inset ring-cyan-400/70'
                          }`}
                        />
                      </>
                    )}

                  {isLegalTarget && !pieceCode && (
                    <span className="w-3 h-3 rounded-full bg-cyan-900/45 pointer-events-none" />
                  )}
                  {isLegalTarget && pieceCode && (
                    <span className="absolute inset-1 rounded-full border-[3px] border-cyan-500/75 pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Best Move & Ponder Vector Arrow Overlay (above pieces z-30) */}
          {(bestArrow || ponderArrow) && (
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 w-full h-full pointer-events-none z-30"
              aria-hidden="true"
            >
              {ponderArrow && (
                <polygon
                  points={ponderArrow.points}
                  fill="#06B6D4"
                  fillOpacity="0.45"
                  stroke="#083344"
                  strokeWidth="0.35"
                />
              )}

              {bestArrow && (
                <motion.g
                  key={bestArrow.moveKey}
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: `${bestArrow.from.x}% ${bestArrow.from.y}%` }}
                >
                  {/* Subtle destination ring for precision targeting */}
                  <circle
                    cx={bestArrow.to.x}
                    cy={bestArrow.to.y}
                    r="4.8"
                    fill="none"
                    stroke="#10B981"
                    strokeOpacity="0.45"
                    strokeWidth="0.7"
                  />
                  {/* Primary Stockfish Best Move Polygon Arrow */}
                  <polygon
                    points={bestArrow.points}
                    fill="#10B981"
                    fillOpacity="0.88"
                    stroke="#022C22"
                    strokeWidth="0.45"
                    strokeLinejoin="round"
                  />
                </motion.g>
              )}
            </svg>
          )}
        </div>
      </div>

      {/* Footer Recommendation & FEN bar */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-slate-500/45 bg-[#0A0F1A]/60 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <span className="text-[11px] sm:text-sm font-medium text-slate-100 whitespace-nowrap shrink-0">
            {isAnalyzing ? (
              t.analyzingStockfish
            ) : analysis?.bestMoveSan ? (
              <>
                {t.stockfishRecommendation}{' '}
                <strong className="font-mono text-xs sm:text-base font-bold text-emerald-300" dir="ltr">
                  {analysis.bestMoveSan} ({analysis.bestMove})
                </strong>
              </>
            ) : (
              t.activeFenMatrix
            )}
          </span>
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <code
              dir="ltr"
              className="text-[11px] sm:text-sm font-mono font-medium text-slate-100 truncate select-all"
              title={fen}
            >
              {fen}
            </code>
            <button
              type="button"
              onClick={() => setEditingFen((v) => !v)}
              title={t.editFenTooltip}
              className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 text-[11px] sm:text-sm font-semibold text-white bg-slate-900/75 hover:bg-slate-800 border border-slate-600/70 rounded transition-colors shrink-0"
            >
              <Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-300" />
              <span>FEN</span>
            </button>
          </div>
        </div>

        {editingFen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const ok = onApplyFen(fenDraft.trim());
              if (ok) {
                setEditingFen(false);
                setFenError(null);
              } else {
                setFenError(t.invalidFenError);
              }
            }}
            className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-600/60"
          >
            <input
              type="text"
              dir="ltr"
              value={fenDraft}
              onChange={(e) => {
                setFenDraft(e.target.value);
                setFenError(null);
              }}
              placeholder={t.fenPlaceholder}
              className="flex-1 min-w-[180px] bg-[#070A10] border border-slate-500/70 rounded px-3 py-1.5 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs sm:text-sm font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded transition-colors shrink-0"
            >
              {t.applyFenBtn}
            </button>
            {fenError && <span className="text-xs sm:text-sm font-medium text-rose-300">{fenError}</span>}
          </form>
        )}
      </div>
    </section>
  );
};
