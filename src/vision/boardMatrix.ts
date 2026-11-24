import { Chess } from 'chess.js';
import type { BoardOrientation } from '../types/chess.ts';

export type PieceChar =
  | 'P'
  | 'N'
  | 'B'
  | 'R'
  | 'Q'
  | 'K'
  | 'p'
  | 'n'
  | 'b'
  | 'r'
  | 'q'
  | 'k'
  | '';

export type BoardMatrix8x8 = PieceChar[][];

export interface MatrixPerspectiveAnalysis {
  screenMatrix: BoardMatrix8x8;
  canonicalMatrix: BoardMatrix8x8;
  flippedForBlack: boolean;
  playerColor: 'w' | 'b';
  opponentColor: 'w' | 'b';
  fen: string;
  turn: 'w' | 'b';
  changedFromPrevious: boolean;
  detectedOpponentMove: {
    from: string;
    to: string;
    san: string;
    uci: string;
  } | null;
}

const VALID_PIECES = new Set<string>([
  'P',
  'N',
  'B',
  'R',
  'Q',
  'K',
  'p',
  'n',
  'b',
  'r',
  'q',
  'k',
]);

/**
 * Programmatically flips an 8x8 board matrix by 180 degrees.
 * Used when the player is playing Black and the bottom half of the camera view
 * represents Black's ranks (8 and 7, ordered h..a from left to right).
 */
export function flipBoardMatrix180(matrix: BoardMatrix8x8): BoardMatrix8x8 {
  const flipped: BoardMatrix8x8 = [];
  for (let r = 0; r < 8; r++) {
    const row: PieceChar[] = [];
    const srcRow = matrix[7 - r] ?? [];
    for (let c = 0; c < 8; c++) {
      row.push((srcRow[7 - c] ?? '') as PieceChar);
    }
    flipped.push(row);
  }
  return flipped;
}

/**
 * Expands 8 FEN-style or dot-padded row strings into a strict 8x8 PieceChar matrix.
 */
export function rowsToBoardMatrix(rows: string[]): BoardMatrix8x8 {
  if (!Array.isArray(rows) || rows.length !== 8) {
    throw new Error('مصفوفة الرقعة يجب أن تحتوي على 8 صفوف بالضبط.');
  }

  const matrix: BoardMatrix8x8 = [];
  for (const rawRow of rows) {
    const clean = String(rawRow).trim();
    const expanded: PieceChar[] = [];
    for (const ch of clean) {
      if (ch >= '1' && ch <= '8') {
        const empties = Number(ch);
        for (let k = 0; k < empties; k++) {
          expanded.push('');
        }
      } else if (ch === '.' || ch === '_' || ch === '-') {
        expanded.push('');
      } else if (VALID_PIECES.has(ch)) {
        expanded.push(ch as PieceChar);
      }
    }
    if (expanded.length !== 8) {
      throw new Error('أحد صفوف مصفوفة الرقعة لا يساوي 8 مربعات.');
    }
    matrix.push(expanded);
  }
  return matrix;
}

/**
 * Parses the piece placement portion of a FEN string into an 8x8 matrix (Rank 8 -> Rank 1).
 */
export function fenToBoardMatrix(fen: string): BoardMatrix8x8 {
  const placement = fen.trim().split(/\s+/)[0] ?? '';
  const ranks = placement.split('/');
  return rowsToBoardMatrix(ranks);
}

/**
 * Encodes a canonical 8x8 matrix (Rank 8 -> Rank 1, file a -> h) into FEN piece placement.
 */
export function boardMatrixToPlacement(matrix: BoardMatrix8x8): string {
  const rankStrings: string[] = [];
  for (let r = 0; r < 8; r++) {
    let encoded = '';
    let emptyCount = 0;
    for (let c = 0; c < 8; c++) {
      const sq = matrix[r]?.[c] ?? '';
      if (!sq) {
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
    rankStrings.push(encoded);
  }
  return rankStrings.join('/');
}

export function matricesEqual(a: BoardMatrix8x8, b: BoardMatrix8x8): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((a[r]?.[c] ?? '') !== (b[r]?.[c] ?? '')) {
        return false;
      }
    }
  }
  return true;
}

function validateCanonicalMatrix(matrix: BoardMatrix8x8): void {
  let whiteKings = 0;
  let blackKings = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const ch = matrix[r]?.[c] ?? '';
      if (ch === 'K') whiteKings++;
      if (ch === 'k') blackKings++;
      if ((r === 0 || r === 7) && (ch === 'P' || ch === 'p')) {
        throw new Error('وضعية غير قانونية: لا يمكن وجود بيدق في الصف الأول أو الأخير.');
      }
    }
  }
  if (whiteKings !== 1 || blackKings !== 1) {
    throw new Error('لم يتم التعرف على الملكين (الأبيض والأسود) بشكل صحيح في المصفوفة.');
  }
}

function inferCastlingRights(matrix: BoardMatrix8x8): string {
  let castling = '';
  if (matrix[7]?.[4] === 'K') {
    if (matrix[7]?.[7] === 'R') castling += 'K';
    if (matrix[7]?.[0] === 'R') castling += 'Q';
  }
  if (matrix[0]?.[4] === 'k') {
    if (matrix[0]?.[7] === 'r') castling += 'k';
    if (matrix[0]?.[0] === 'r') castling += 'q';
  }
  return castling || '-';
}

/**
 * Receives a raw screen-space 8x8 matrix (where the bottom half rows 4..7 are ALWAYS your area),
 * programmatically flips the matrix 180 degrees when playing Black,
 * ignores unchanged/random states, focuses on detecting the opponent's legal move if transitioning
 * from a previous position, and sets the turn to your color so Stockfish generates the best UCI reply.
 */
export function analyzeBoardMatrixPerspective(
  rawScreenMatrix: BoardMatrix8x8,
  orientation: BoardOrientation,
  previousFen?: string
): MatrixPerspectiveAnalysis {
  const flippedForBlack = orientation === 'black';
  const canonicalMatrix = flippedForBlack
    ? flipBoardMatrix180(rawScreenMatrix)
    : rawScreenMatrix;

  validateCanonicalMatrix(canonicalMatrix);

  const playerColor: 'w' | 'b' = orientation === 'white' ? 'w' : 'b';
  const opponentColor: 'w' | 'b' = playerColor === 'w' ? 'b' : 'w';

  let detectedOpponentMove: MatrixPerspectiveAnalysis['detectedOpponentMove'] = null;
  let changedFromPrevious = true;

  if (previousFen) {
    try {
      const prevMatrix = fenToBoardMatrix(previousFen);
      if (matricesEqual(prevMatrix, canonicalMatrix)) {
        changedFromPrevious = false;
      } else {
        // Test whether a single legal move by the OPPONENT transforms previous position into canonicalMatrix
        const prevParts = previousFen.trim().split(/\s+/);
        if (prevParts.length >= 4) {
          prevParts[1] = opponentColor;
          prevParts[3] = '-';
          const oppCandidateFen = prevParts.join(' ');
          try {
            const probe = new Chess(oppCandidateFen);
            const oppMoves = probe.moves({ verbose: true });
            for (const mv of oppMoves) {
              const sim = new Chess(oppCandidateFen);
              const applied = sim.move({
                from: mv.from,
                to: mv.to,
                promotion: mv.promotion,
              });
              if (!applied) continue;
              const simMatrix = fenToBoardMatrix(sim.fen());
              if (matricesEqual(simMatrix, canonicalMatrix)) {
                detectedOpponentMove = {
                  from: applied.from,
                  to: applied.to,
                  san: applied.san,
                  uci: `${applied.from}${applied.to}${applied.promotion ?? ''}`,
                };
                return {
                  screenMatrix: rawScreenMatrix,
                  canonicalMatrix,
                  flippedForBlack,
                  playerColor,
                  opponentColor,
                  fen: sim.fen(),
                  turn: sim.turn(),
                  changedFromPrevious: true,
                  detectedOpponentMove,
                };
              }
            }
          } catch {
            // Fall through to full board reconstruction when previous state was in check / diverged
          }
        }
      }
    } catch {
      // Ignore invalid previousFen
    }
  }

  const placement = boardMatrixToPlacement(canonicalMatrix);
  const castling = inferCastlingRights(canonicalMatrix);

  // Focus on generating YOUR optimal reply via UCI (turn = playerColor)
  const preferredFen = `${placement} ${playerColor} ${castling} - 0 1`;
  const fallbackFen = `${placement} ${opponentColor} ${castling} - 0 1`;

  let validFen: string | null = null;
  let resolvedTurn: 'w' | 'b' = playerColor;

  try {
    new Chess(preferredFen);
    validFen = preferredFen;
    resolvedTurn = playerColor;
  } catch {
    try {
      new Chess(fallbackFen);
      validFen = fallbackFen;
      resolvedTurn = opponentColor;
    } catch {
      validFen = null;
    }
  }

  if (!validFen) {
    throw new Error(
      'الوضعية المقروءة غير صالحة قانونياً للشطرنج. تأكد من محاذاة الزوايا الأربع بدقة ثم أعد المحاولة.'
    );
  }

  return {
    screenMatrix: rawScreenMatrix,
    canonicalMatrix,
    flippedForBlack,
    playerColor,
    opponentColor,
    fen: validFen,
    turn: resolvedTurn,
    changedFromPrevious,
    detectedOpponentMove,
  };
}
