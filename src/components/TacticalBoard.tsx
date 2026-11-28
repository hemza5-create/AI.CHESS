import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { motion, useReducedMotion } from 'motion/react';
import { ChessPieceSvg, type PieceCode } from './ChessPieces.tsx';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import type { BoardOrientation } from '../types/chess.ts';

interface TacticalBoardProps {
  fen: string;
  orientation: BoardOrientation;
  lastMove?: { from: string; to: string } | null;
  hintSquares?: { from: string; to: string } | null;
  bestMoveArrow?: { from: string; to: string; color?: string } | null;
  evaluationLabel?: string;
  winProbabilityWhite?: number;
  showEvalBar?: boolean;
  showHintArrow?: boolean;
  disabled?: boolean;
  boardSize?: 'default' | 'large';
  onMoveAttempt: (from: string, to: string, promotion?: string) => boolean | void;
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
  to: { x: number; y: number }
): { points: string; tip: { x: number; y: number } } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return null;

  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy;
  const ny = ux;

  const shaftHalfWidth = 1.25;
  const headHalfWidth = 3.1;
  const headLength = 4.4;
  const startTrim = 2.0;
  const endTrim = 1.5;

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

export const TacticalBoard: React.FC<TacticalBoardProps> = ({
  fen,
  orientation,
  lastMove = null,
  hintSquares = null,
  bestMoveArrow = null,
  evaluationLabel = '0.00',
  winProbabilityWhite = 50,
  showEvalBar = true,
  showHintArrow = true,
  disabled = false,
  boardSize = 'default',
  onMoveAttempt,
}) => {
  const { t } = useLanguage();
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  React.useEffect(() => {
    setSelectedSquare(null);
  }, [fen]);

  const { boardGrid, legalTargets, turn, checkSquare, promotionMoves } = useMemo(() => {
    const chess = new Chess(fen);
    const grid = chess.board();
    const targets = new Set<string>();
    const promos = new Set<string>();

    if (selectedSquare && !disabled) {
      try {
        const moves = chess.moves({ square: selectedSquare as Square, verbose: true });
        for (const m of moves) {
          targets.add(m.to);
          if (m.promotion) promos.add(m.to);
        }
      } catch {
        // Ignore invalid selection
      }
    }

    let kingCheckSq: string | null = null;
    if (chess.inCheck()) {
      const activeTurn = chess.turn();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const cell = grid[r][c];
          if (cell && cell.type === 'k' && cell.color === activeTurn) {
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
  }, [fen, selectedSquare, disabled]);

  const handleSquareClick = (sqName: string, hasOwnPiece: boolean) => {
    if (disabled) return;
    if (selectedSquare && legalTargets.has(sqName)) {
      const promo = promotionMoves.has(sqName) ? 'q' : undefined;
      onMoveAttempt(selectedSquare, sqName, promo);
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

  const arrowGeom = useMemo(() => {
    const target =
      bestMoveArrow ?? (showHintArrow && hintSquares ? { ...hintSquares, color: '#06B6D4' } : null);
    if (!target) return null;
    const from = squareCenterPercent(target.from, orientation);
    const to = squareCenterPercent(target.to, orientation);
    if (!from || !to) return null;
    const poly = buildArrowPolygon(from, to);
    if (!poly) return null;
    return {
      from,
      to,
      ...poly,
      color: target.color ?? '#10B981',
      key: `${target.from}-${target.to}-${target.color ?? 'default'}`,
    };
  }, [bestMoveArrow, hintSquares, orientation, showHintArrow]);

  const orderedFiles = useMemo(
    () => (orientation === 'white' ? FILES : [...FILES].reverse()),
    [orientation]
  );
  const orderedRanks = useMemo(
    () => (orientation === 'white' ? RANKS : [...RANKS].reverse()),
    [orientation]
  );

  return (
    <div className="flex items-stretch justify-center gap-2 sm:gap-3" dir="ltr">
      {showEvalBar && (
        <div
          className="w-5 sm:w-7 rounded-md bg-slate-950/35 border border-slate-400/45 relative overflow-hidden flex flex-col justify-between shrink-0"
          aria-label={t.evalBarAria(evaluationLabel)}
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-slate-100/85 transition-transform duration-300 ease-out origin-bottom"
            style={{
              height: '100%',
              transform: `scaleY(${Math.max(4, Math.min(96, winProbabilityWhite)) / 100})`,
            }}
          />
          <span className="relative z-10 text-[9px] sm:text-[10px] font-mono font-bold text-center pt-1 text-slate-100 mix-blend-difference">
            {evaluationLabel.startsWith('-') ? evaluationLabel : ''}
          </span>
          <span className="relative z-10 text-[9px] sm:text-[10px] font-mono font-bold text-center pb-1 text-slate-100 mix-blend-difference">
            {!evaluationLabel.startsWith('-') ? evaluationLabel : ''}
          </span>
        </div>
      )}

      <div
        className={`flex-1 select-none ${
          boardSize === 'large'
            ? 'max-w-[440px] sm:max-w-[640px] lg:max-w-[680px]'
            : 'max-w-[348px] sm:max-w-[504px]'
        }`}
      >
        <div className="grid grid-cols-[18px_1fr_18px] sm:grid-cols-[22px_1fr_22px] grid-rows-[18px_1fr_18px] sm:grid-rows-[22px_1fr_22px] bg-[#0B101B]/40 backdrop-blur-sm border border-slate-400/45 rounded-lg p-0.5 shadow-inner">
          <div aria-hidden="true" />
          <div className="grid grid-cols-8 items-center">
            {orderedFiles.map((file) => (
              <span
                key={`top-${file}`}
                className="text-center text-[10px] sm:text-xs font-mono font-bold text-white leading-none"
              >
                {file}
              </span>
            ))}
          </div>
          <div aria-hidden="true" />

          <div className="grid grid-rows-8 items-center">
            {orderedRanks.map((rank) => (
              <span
                key={`left-${rank}`}
                className="text-center text-[10px] sm:text-xs font-mono font-bold text-white leading-none"
              >
                {rank}
              </span>
            ))}
          </div>

          <div className="relative aspect-square w-full border border-slate-700 rounded-sm overflow-hidden">
            <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
              {Array.from({ length: 64 }).map((_, idx) => {
                const r = Math.floor(idx / 8);
                const c = idx % 8;
                const boardRow = orientation === 'white' ? r : 7 - r;
                const boardCol = orientation === 'white' ? c : 7 - c;
                const sqName = `${FILES[boardCol]}${RANKS[boardRow]}`;
                const isLight = (boardRow + boardCol) % 2 === 0;
                const cell = boardGrid[boardRow][boardCol];
                const isLast = lastMove && (lastMove.from === sqName || lastMove.to === sqName);
                const isHintFrom = hintSquares?.from === sqName;
                const isHintTo = hintSquares?.to === sqName;
                const isSelected = selectedSquare === sqName;
                const isLegalTarget = legalTargets.has(sqName);
                const isCheckedKing = checkSquare === sqName;
                const hasOwnPiece = Boolean(cell && cell.color === turn);

                let bgClass = isLight ? 'bg-[#F0F4EE]/60' : 'bg-[#4D8B55]/65';
                if (isLast) {
                  bgClass = isLight ? 'bg-amber-200/70' : 'bg-amber-500/65';
                }
                if (isHintFrom) {
                  bgClass = 'bg-cyan-500/55';
                }
                if (isHintTo) {
                  bgClass = 'bg-emerald-500/55';
                }
                if (isSelected) {
                  bgClass = 'bg-cyan-400/70';
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
                      !disabled && (hasOwnPiece || isLegalTarget) ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >

                  {pieceCode && (
                    <ChessPieceSvg
                      piece={pieceCode}
                      className="w-[84%] h-[84%] drop-shadow-sm pointer-events-none relative z-10"
                    />
                  )}

                  {(isHintFrom || isHintTo) && (
                    <span
                      className={`absolute inset-0.5 rounded-sm border-2 pointer-events-none z-20 ${
                        isHintFrom ? 'border-cyan-300' : 'border-emerald-300'
                      }`}
                    />
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

            {arrowGeom && (
              <svg
                viewBox="0 0 100 100"
                className="absolute inset-0 w-full h-full pointer-events-none z-30"
                aria-hidden="true"
              >
                <motion.g
                  key={arrowGeom.key}
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: `${arrowGeom.from.x}% ${arrowGeom.from.y}%` }}
                >
                  <circle
                    cx={arrowGeom.to.x}
                    cy={arrowGeom.to.y}
                    r="4.8"
                    fill="none"
                    stroke={arrowGeom.color}
                    strokeOpacity="0.55"
                    strokeWidth="0.7"
                  />
                  <polygon
                    points={arrowGeom.points}
                    fill={arrowGeom.color}
                    fillOpacity="0.88"
                    stroke="#022C22"
                    strokeWidth="0.45"
                    strokeLinejoin="round"
                  />
                </motion.g>
              </svg>
            )}
          </div>

          <div className="grid grid-rows-8 items-center">
            {orderedRanks.map((rank) => (
              <span
                key={`right-${rank}`}
                className="text-center text-[10px] sm:text-xs font-mono font-bold text-white leading-none"
              >
                {rank}
              </span>
            ))}
          </div>

          <div aria-hidden="true" />
          <div className="grid grid-cols-8 items-center">
            {orderedFiles.map((file) => (
              <span
                key={`bottom-${file}`}
                className="text-center text-[10px] sm:text-xs font-mono font-bold text-white leading-none"
              >
                {file}
              </span>
            ))}
          </div>
          <div aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};
