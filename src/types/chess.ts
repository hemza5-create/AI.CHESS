export type CaptureSource = 'virtual' | 'camera' | 'screen' | 'image';

export type VisionViewMode = 'original' | 'grayscale' | 'canny' | 'heatmap';

export type BoardOrientation = 'white' | 'black';

export type ScanResolution = 256 | 512 | 800;

export interface Point2D {
  x: number; // Normalized 0..1 relative to canvas width
  y: number; // Normalized 0..1 relative to canvas height
}

export type RoiQuad = [Point2D, Point2D, Point2D, Point2D]; // TL, TR, BR, BL

export interface VisionConfig {
  resolution: ScanResolution;
  targetFps: number;
  cannyThreshold: number; // 20..160
  motionThreshold: number; // 6..45
  blurEnabled: boolean;
  orientation: BoardOrientation;
}

export interface FrameTelemetry {
  timestamp: number;
  resolution: ScanResolution;
  captureMs: number;
  blurMs: number;
  cannyMs: number;
  matrixMs: number;
  totalMs: number;
  actualFps: number;
  budgetMs: number;
  budgetUsagePct: number;
}

export interface SquareMetric {
  square: string; // e.g. "e4"
  meanLuma: number;
  edgeDensity: number;
  delta: number;
}

export interface VisionProcessResult {
  telemetry: FrameTelemetry;
  squareMetrics: SquareMetric[][]; // [8][8] top-to-bottom, left-to-right in current orientation
  candidateMove: {
    uci: string;
    san: string;
    confidence: number;
    fromSquare: string;
    toSquare: string;
  } | null;
  maxDelta: number;
}

export interface UciLineInfo {
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

export interface StockfishAnalysisResult {
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
  appliedDepth?: number;
  playerElo?: number;
  autoDepthByElo?: boolean;
  nodes: number;
  nps: number;
  timeMs: number;
  lines: UciLineInfo[];
  uciLog: string[];
}

export interface MoveRecord {
  ply: number;
  san: string;
  uci: string;
  fen: string;
  evaluationLabel?: string;
  source: 'vision' | 'manual' | 'virtual';
  timestamp: string;
}

export type TtsVoiceName = 'Kore' | 'Charon' | 'Fenrir' | 'Zephyr' | 'Puck';
