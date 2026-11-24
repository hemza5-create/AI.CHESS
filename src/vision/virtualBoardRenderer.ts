import { Chess } from 'chess.js';
import type { BoardOrientation } from '../types/chess';

const PIECE_UNICODE: Record<string, string> = {
  wp: '♙',
  wn: '♘',
  wb: '♗',
  wr: '♖',
  wq: '♕',
  wk: '♔',
  bp: '♟',
  bn: '♞',
  bb: '♝',
  br: '♜',
  bq: '♛',
  bk: '♚',
};

let cachedBoardCanvas: HTMLCanvasElement | null = null;
let cachedBoardKey = '';

// High-contrast silhouette paths drawn cleanly on Canvas so OpenCV edges & deltas are crystal clear
export function renderVirtualBoardToCanvas(
  canvas: HTMLCanvasElement,
  fen: string,
  orientation: BoardOrientation,
  lastMove?: { from: string; to: string } | null,
  simulateNoise = false
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const size = canvas.width;
  const pad = Math.round(size * 0.08);
  const boardSize = size - pad * 2;
  const cacheKey = `${size}|${fen}|${orientation}|${lastMove?.from ?? ''}-${lastMove?.to ?? ''}`;

  if (!cachedBoardCanvas) {
    cachedBoardCanvas = document.createElement('canvas');
  }
  if (cachedBoardCanvas.width !== size || cachedBoardCanvas.height !== size) {
    cachedBoardCanvas.width = size;
    cachedBoardCanvas.height = size;
    cachedBoardKey = '';
  }

  if (cachedBoardKey !== cacheKey) {
    const cCtx = cachedBoardCanvas.getContext('2d');
    if (cCtx) {
      const sqSize = boardSize / 8;

      // Outer desk / bezel surface (simulates camera/screen border around the chessboard ROI)
      cCtx.fillStyle = '#0F141E';
      cCtx.fillRect(0, 0, size, size);

      // Subtle wooden/metallic frame around the board
      cCtx.fillStyle = '#1E293B';
      cCtx.fillRect(pad - 6, pad - 6, boardSize + 12, boardSize + 12);

      let chess: Chess;
      try {
        chess = new Chess(fen);
      } catch {
        chess = new Chess();
      }
      const board = chess.board();
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const boardRow = orientation === 'white' ? r : 7 - r;
          const boardCol = orientation === 'white' ? c : 7 - c;
          const sqName = `${files[boardCol]}${ranks[boardRow]}`;
          const isLight = (boardRow + boardCol) % 2 === 0;

          const x = pad + c * sqSize;
          const y = pad + r * sqSize;

          cCtx.fillStyle = isLight ? '#E2D5BE' : '#7B5E42';
          cCtx.fillRect(x, y, sqSize, sqSize);

          if (lastMove && (lastMove.from === sqName || lastMove.to === sqName)) {
            cCtx.fillStyle = 'rgba(250, 204, 21, 0.28)';
            cCtx.fillRect(x, y, sqSize, sqSize);
          }

          const cell = board[boardRow][boardCol];
          if (cell) {
            drawCanvasPiece(cCtx, cell.color, cell.type, x, y, sqSize);
          }
        }
      }

      // Coordinate labels on frame
      cCtx.fillStyle = '#94A3B8';
      cCtx.font = `600 ${Math.max(10, Math.round(pad * 0.34))}px "IBM Plex Mono", monospace`;
      cCtx.textAlign = 'center';
      cCtx.textBaseline = 'middle';
      for (let i = 0; i < 8; i++) {
        const fileLabel = orientation === 'white' ? files[i] : files[7 - i];
        const rankLabel = orientation === 'white' ? ranks[i] : ranks[7 - i];
        cCtx.fillText(fileLabel, pad + i * sqSize + sqSize / 2, size - pad / 2 + 2);
        cCtx.fillText(rankLabel, pad / 2 - 2, pad + i * sqSize + sqSize / 2);
      }

      cachedBoardKey = cacheKey;
    }
  }

  ctx.drawImage(cachedBoardCanvas, 0, 0);

  // Optional subtle realistic sensor grain when simulating camera lighting
  if (simulateNoise) {
    const t = Date.now() * 0.002;
    const lumShift = Math.sin(t) * 4;
    ctx.fillStyle =
      lumShift >= 0
        ? `rgba(255,255,255,${(lumShift / 255).toFixed(3)})`
        : `rgba(0,0,0,${(-lumShift / 255).toFixed(3)})`;
    ctx.fillRect(pad, pad, boardSize, boardSize);
  }
}

function drawCanvasPiece(
  ctx: CanvasRenderingContext2D,
  color: 'w' | 'b',
  type: string,
  x: number,
  y: number,
  sqSize: number
) {
  const cx = x + sqSize / 2;
  const cy = y + sqSize / 2;
  const radius = sqSize * 0.36;

  // High-contrast disc + crisp glyph so OpenCV edge + luminance detectors pick up piece presence reliably
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color === 'w' ? '#F8FAFC' : '#181C24';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, sqSize * 0.04);
  ctx.strokeStyle = color === 'w' ? '#1E293B' : '#CBD5E1';
  ctx.stroke();

  const glyph = PIECE_UNICODE[`${color}${type}`] ?? '';
  ctx.fillStyle = color === 'w' ? '#0F172A' : '#F8FAFC';
  ctx.font = `${Math.round(sqSize * 0.56)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, cx, cy + sqSize * 0.03);
  ctx.restore();
}

export interface SampleLinePreset {
  id: string;
  name: string;
  moves: string[]; // UCI moves
}

export const SAMPLE_GAMES: SampleLinePreset[] = [
  {
    id: 'italian',
    name: 'الافتتاح الإيطالي (Giuoco Piano)',
    moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d4', 'e5d4'],
  },
  {
    id: 'sicilian',
    name: 'الدفاع الصقلي (نايدورف)',
    moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6'],
  },
  {
    id: 'queens_gambit',
    name: 'مناورة الوزير (Queen’s Gambit)',
    moves: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'e8g8'],
  },
];
