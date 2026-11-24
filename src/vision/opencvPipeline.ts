import { Chess } from 'chess.js';
import type {
  BoardOrientation,
  RoiQuad,
  SquareMetric,
  VisionConfig,
  VisionProcessResult,
  VisionViewMode,
} from '../types/chess';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export function getSquareName(
  row: number,
  col: number,
  orientation: BoardOrientation
): string {
  const fileIdx = orientation === 'white' ? col : 7 - col;
  const rankIdx = orientation === 'white' ? row : 7 - row;
  return `${FILES[fileIdx]}${RANKS[rankIdx]}`;
}

export function squareToGridCoords(
  square: string,
  orientation: BoardOrientation
): { row: number; col: number } {
  const fileIdx = FILES.indexOf(square[0]);
  const rankIdx = RANKS.indexOf(square[1]);
  const col = orientation === 'white' ? fileIdx : 7 - fileIdx;
  const row = orientation === 'white' ? rankIdx : 7 - rankIdx;
  return { row, col };
}

export function mapViewportRoiToSource(
  roi: RoiQuad,
  sourceWidth: number,
  sourceHeight: number,
  viewportAspect = 1
): RoiQuad {
  const srcAspect = sourceWidth / Math.max(1, sourceHeight);
  let scaleX = 1;
  let scaleY = 1;
  let offsetX = 0;
  let offsetY = 0;

  if (srcAspect > viewportAspect) {
    const renderedH = viewportAspect / srcAspect;
    offsetY = (1 - renderedH) / 2;
    scaleY = renderedH;
  } else if (srcAspect < viewportAspect) {
    const renderedW = srcAspect / viewportAspect;
    offsetX = (1 - renderedW) / 2;
    scaleX = renderedW;
  }

  return roi.map((pt) => ({
    x: Math.max(0, Math.min(1, (pt.x - offsetX) / scaleX)),
    y: Math.max(0, Math.min(1, (pt.y - offsetY) / scaleY)),
  })) as RoiQuad;
}

export function computeFitRoi(
  sourceWidth: number,
  sourceHeight: number,
  viewportAspect = 1
): RoiQuad {
  const srcAspect = sourceWidth / Math.max(1, sourceHeight);
  let renderedW = 1;
  let renderedH = 1;
  let offsetX = 0;
  let offsetY = 0;

  if (srcAspect > viewportAspect) {
    renderedH = viewportAspect / srcAspect;
    offsetY = (1 - renderedH) / 2;
  } else if (srcAspect < viewportAspect) {
    renderedW = srcAspect / viewportAspect;
    offsetX = (1 - renderedW) / 2;
  }

  const side = Math.min(renderedW, renderedH) * 0.78;
  const cx = offsetX + renderedW / 2;
  const cy = offsetY + renderedH / 2;
  const half = side / 2;

  return [
    { x: Number((cx - half).toFixed(3)), y: Number((cy - half).toFixed(3)) },
    { x: Number((cx + half).toFixed(3)), y: Number((cy - half).toFixed(3)) },
    { x: Number((cx + half).toFixed(3)), y: Number((cy + half).toFixed(3)) },
    { x: Number((cx - half).toFixed(3)), y: Number((cy + half).toFixed(3)) },
  ];
}

export class OpenCvChessPipeline {
  private workCanvas: HTMLCanvasElement;
  private workCtx: CanvasRenderingContext2D;
  private warpCanvas: HTMLCanvasElement;
  private warpCtx: CanvasRenderingContext2D | null;
  private baselineGray: Uint8Array | null = null;
  private prevBlurred: Uint8Array | null = null;
  private baselineResolution = 0;
  private lastFrameTimestamp = 0;
  private smoothedFps = 0;
  private settledDriftFrames = 0;

  // Pre-allocated typed buffers keyed by resolution to avoid GC pauses at 60 FPS
  private bufferResolution = 0;
  private grayBuf = new Uint8Array(0);
  private horizBuf = new Uint8Array(0);
  private blurredBuf = new Uint8Array(0);
  private edgesBuf = new Uint8Array(0);
  private outImgData: ImageData | null = null;

  // Stability filter: requires consecutive matches before committing a CV move
  private pendingMoveUci: string | null = null;
  private pendingMoveStreak = 0;

  constructor() {
    this.workCanvas = document.createElement('canvas');
    const ctx = this.workCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Could not initialize 2D canvas context for vision pipeline');
    }
    this.workCtx = ctx;
    this.warpCanvas = document.createElement('canvas');
    this.warpCtx = this.warpCanvas.getContext('2d', { willReadFrequently: true });
  }

  private ensureBuffers(res: number): void {
    if (this.bufferResolution === res) return;
    const pixelCount = res * res;
    this.grayBuf = new Uint8Array(pixelCount);
    this.horizBuf = new Uint8Array(pixelCount);
    this.blurredBuf = new Uint8Array(pixelCount);
    this.edgesBuf = new Uint8Array(pixelCount);
    this.prevBlurred = null;
    this.outImgData = null;
    this.bufferResolution = res;
  }

  public resetBaseline(): void {
    this.baselineGray = null;
    this.prevBlurred = null;
    this.baselineResolution = 0;
    this.pendingMoveUci = null;
    this.pendingMoveStreak = 0;
    this.settledDriftFrames = 0;
    this.lastFrameTimestamp = 0;
    this.smoothedFps = 0;
  }

  public captureBaselineNextFrame(): void {
    this.baselineGray = null;
    this.prevBlurred = null;
    this.pendingMoveUci = null;
    this.pendingMoveStreak = 0;
    this.settledDriftFrames = 0;
  }

  private drawRoiToCanvas(
    targetCtx: CanvasRenderingContext2D,
    res: number,
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    sourceWidth: number,
    sourceHeight: number,
    viewportRoi: RoiQuad
  ): void {
    const srcRoi = mapViewportRoiToSource(viewportRoi, sourceWidth, sourceHeight, 1);

    const isAxisAligned =
      Math.abs(srcRoi[0].y - srcRoi[1].y) < 0.005 &&
      Math.abs(srcRoi[3].y - srcRoi[2].y) < 0.005 &&
      Math.abs(srcRoi[0].x - srcRoi[3].x) < 0.005 &&
      Math.abs(srcRoi[1].x - srcRoi[2].x) < 0.005;

    if (isAxisAligned) {
      const sx = Math.max(0, srcRoi[0].x * sourceWidth);
      const sy = Math.max(0, srcRoi[0].y * sourceHeight);
      const sw = Math.max(8, (srcRoi[1].x - srcRoi[0].x) * sourceWidth);
      const sh = Math.max(8, (srcRoi[3].y - srcRoi[0].y) * sourceHeight);
      targetCtx.drawImage(source, sx, sy, sw, sh, 0, 0, res, res);
    } else if (this.warpCtx) {
      const sampleW = Math.min(sourceWidth, 640);
      const sampleH = Math.min(sourceHeight, 640);
      if (this.warpCanvas.width !== sampleW || this.warpCanvas.height !== sampleH) {
        this.warpCanvas.width = sampleW;
        this.warpCanvas.height = sampleH;
      }
      this.warpCtx.drawImage(source, 0, 0, sampleW, sampleH);
      const srcData = this.warpCtx.getImageData(0, 0, sampleW, sampleH).data;
      const dstImg = targetCtx.createImageData(res, res);
      const dstData = dstImg.data;

      const [tl, tr, br, bl] = srcRoi;
      for (let y = 0; y < res; y++) {
        const v = y / (res - 1);
        const leftX = tl.x + (bl.x - tl.x) * v;
        const leftY = tl.y + (bl.y - tl.y) * v;
        const rightX = tr.x + (br.x - tr.x) * v;
        const rightY = tr.y + (br.y - tr.y) * v;

        for (let x = 0; x < res; x++) {
          const u = x / (res - 1);
          const sx = Math.min(
            sampleW - 1,
            Math.max(0, Math.round((leftX + (rightX - leftX) * u) * (sampleW - 1)))
          );
          const sy = Math.min(
            sampleH - 1,
            Math.max(0, Math.round((leftY + (rightY - leftY) * u) * (sampleH - 1)))
          );
          const sIdx = (sy * sampleW + sx) * 4;
          const dIdx = (y * res + x) * 4;
          dstData[dIdx] = srcData[sIdx];
          dstData[dIdx + 1] = srcData[sIdx + 1];
          dstData[dIdx + 2] = srcData[sIdx + 2];
          dstData[dIdx + 3] = 255;
        }
      }
      targetCtx.putImageData(dstImg, 0, 0);
    }
  }

  /**
   * Captures a high-resolution, perspective-corrected JPEG of the ROI box
   * oriented so Rank 8 is always at top and Rank 1 at bottom for Gemini Vision FEN parsing.
   */
  public captureRoiDataUrl(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    sourceWidth: number,
    sourceHeight: number,
    roi: RoiQuad,
    orientation: BoardOrientation,
    outSize = 640
  ): string | null {
    if (sourceWidth <= 0 || sourceHeight <= 0) return null;
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = outSize;
    snapCanvas.height = outSize;
    const snapCtx = snapCanvas.getContext('2d');
    if (!snapCtx) return null;

    this.drawRoiToCanvas(snapCtx, outSize, source, sourceWidth, sourceHeight, roi);

    if (orientation === 'black') {
      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = outSize;
      rotCanvas.height = outSize;
      const rotCtx = rotCanvas.getContext('2d');
      if (rotCtx) {
        rotCtx.translate(outSize / 2, outSize / 2);
        rotCtx.rotate(Math.PI);
        rotCtx.drawImage(snapCanvas, -outSize / 2, -outSize / 2);
        return rotCanvas.toDataURL('image/jpeg', 0.92);
      }
    }

    return snapCanvas.toDataURL('image/jpeg', 0.92);
  }

  /**
   * Bilinear warp from arbitrary 4-corner ROI into an N x N square image,
   * then runs Grayscale -> 5x5 Gaussian Blur -> Sobel/Canny Edge Map -> 8x8 Matrix & Move Delta.
   */
  public processFrame(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    sourceWidth: number,
    sourceHeight: number,
    roi: RoiQuad,
    config: VisionConfig,
    viewMode: VisionViewMode,
    outputCanvas: HTMLCanvasElement | null,
    currentFen: string
  ): VisionProcessResult {
    const t0 = performance.now();
    const res = config.resolution;
    this.ensureBuffers(res);

    if (this.workCanvas.width !== res || this.workCanvas.height !== res) {
      this.workCanvas.width = res;
      this.workCanvas.height = res;
    }

    this.drawRoiToCanvas(this.workCtx, res, source, sourceWidth, sourceHeight, roi);

    const frameImg = this.workCtx.getImageData(0, 0, res, res);
    const rgba = frameImg.data;
    const tCapture = performance.now();

    // 1. Grayscale conversion (cv2.cvtColor BGR2GRAY)
    const pixelCount = res * res;
    const gray = this.grayBuf;
    for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
      gray[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
    }

    // 2. Separable 5x5 Gaussian Blur (cv2.GaussianBlur (5,5))
    let blurred: Uint8Array;
    if (config.blurEnabled) {
      const horiz = this.horizBuf;
      blurred = this.blurredBuf;
      for (let y = 0; y < res; y++) {
        const rowOffset = y * res;
        for (let x = 0; x < res; x++) {
          const x0 = x > 1 ? x - 2 : 0;
          const x1 = x > 0 ? x - 1 : 0;
          const x3 = x + 1 < res ? x + 1 : res - 1;
          const x4 = x + 2 < res ? x + 2 : res - 1;
          horiz[rowOffset + x] =
            (gray[rowOffset + x0] +
              gray[rowOffset + x1] * 4 +
              gray[rowOffset + x] * 6 +
              gray[rowOffset + x3] * 4 +
              gray[rowOffset + x4]) >>
            4;
        }
      }
      for (let y = 0; y < res; y++) {
        const y0 = (y > 1 ? y - 2 : 0) * res;
        const y1 = (y > 0 ? y - 1 : 0) * res;
        const y2 = y * res;
        const y3 = (y + 1 < res ? y + 1 : res - 1) * res;
        const y4 = (y + 2 < res ? y + 2 : res - 1) * res;
        for (let x = 0; x < res; x++) {
          blurred[y2 + x] =
            (horiz[y0 + x] +
              horiz[y1 + x] * 4 +
              horiz[y2 + x] * 6 +
              horiz[y3 + x] * 4 +
              horiz[y4 + x]) >>
            4;
        }
      }
    } else {
      blurred = gray;
    }
    const tBlur = performance.now();

    // 3. Sobel Gradient & Canny-style Dual-Threshold Edge Map (cv2.Canny)
    const edges = this.edgesBuf;
    edges.fill(0);
    const lowThresh = config.cannyThreshold * 0.5;
    const highThresh = config.cannyThreshold;

    for (let y = 1; y < res - 1; y++) {
      const rowPrev = (y - 1) * res;
      const rowCurr = y * res;
      const rowNext = (y + 1) * res;
      for (let x = 1; x < res - 1; x++) {
        const tl = blurred[rowPrev + x - 1];
        const tc = blurred[rowPrev + x];
        const tr = blurred[rowPrev + x + 1];
        const ml = blurred[rowCurr + x - 1];
        const mr = blurred[rowCurr + x + 1];
        const bl = blurred[rowNext + x - 1];
        const bc = blurred[rowNext + x];
        const br = blurred[rowNext + x + 1];

        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        const mag = Math.abs(gx) + Math.abs(gy);

        if (mag >= highThresh) {
          edges[rowCurr + x] = 255;
        } else if (mag >= lowThresh) {
          edges[rowCurr + x] = 110;
        }
      }
    }
    const tCanny = performance.now();

    // 4. Baseline calibration & 8x8 Grid Extraction
    if (!this.baselineGray || this.baselineResolution !== res) {
      this.baselineGray = new Uint8Array(blurred);
      this.baselineResolution = res;
    }

    const squareSize = res / 8;
    const margin = Math.max(2, Math.floor(squareSize * 0.16)); // Sample inner 68% of each square to ignore grid border noise
    const squareMetrics: SquareMetric[][] = [];
    let maxDelta = 0;

    for (let r = 0; r < 8; r++) {
      const rowMetrics: SquareMetric[] = [];
      const yStart = Math.floor(r * squareSize) + margin;
      const yEnd = Math.min(res - 1, Math.floor((r + 1) * squareSize) - margin);

      for (let c = 0; c < 8; c++) {
        const xStart = Math.floor(c * squareSize) + margin;
        const xEnd = Math.min(res - 1, Math.floor((c + 1) * squareSize) - margin);

        let sumLuma = 0;
        let sumEdges = 0;
        let sumDelta = 0;
        let count = 0;

        for (let y = yStart; y < yEnd; y++) {
          const offset = y * res;
          for (let x = xStart; x < xEnd; x++) {
            const idx = offset + x;
            sumLuma += blurred[idx];
            if (edges[idx] >= 110) sumEdges++;
            sumDelta += Math.abs(blurred[idx] - this.baselineGray[idx]);
            count++;
          }
        }

        const safeCount = Math.max(1, count);
        const meanLuma = sumLuma / safeCount;
        const edgeDensity = (sumEdges / safeCount) * 100;
        const delta = sumDelta / safeCount;
        if (delta > maxDelta) maxDelta = delta;

        rowMetrics.push({
          square: getSquareName(r, c, config.orientation),
          meanLuma,
          edgeDensity,
          delta,
        });
      }
      squareMetrics.push(rowMetrics);
    }

    // 5. Auto-recover baseline after handheld camera shake/exposure drift settles
    let changedCount = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (squareMetrics[r][c].delta >= config.motionThreshold) changedCount++;
      }
    }

    if (changedCount > 14 && this.prevBlurred && this.prevBlurred.length === pixelCount) {
      let frameDiffSum = 0;
      const step = 16;
      let sampled = 0;
      for (let i = 0; i < pixelCount; i += step) {
        frameDiffSum += Math.abs(blurred[i] - this.prevBlurred[i]);
        sampled++;
      }
      const avgFrameDiff = frameDiffSum / Math.max(1, sampled);
      if (avgFrameDiff < 4.5) {
        this.settledDriftFrames++;
        if (this.settledDriftFrames >= 14) {
          this.baselineGray = new Uint8Array(blurred);
          this.settledDriftFrames = 0;
        }
      } else {
        this.settledDriftFrames = 0;
      }
    } else {
      this.settledDriftFrames = 0;
    }

    if (!this.prevBlurred || this.prevBlurred.length !== pixelCount) {
      this.prevBlurred = new Uint8Array(blurred);
    } else {
      this.prevBlurred.set(blurred);
    }

    // 6. Detect Legal Chess Move from 8x8 Frame Deltas
    const candidateMove = this.matchLegalMoveFromDeltas(
      squareMetrics,
      config.motionThreshold,
      config.orientation,
      currentFen
    );

    if (candidateMove) {
      if (this.pendingMoveUci === candidateMove.uci) {
        this.pendingMoveStreak++;
      } else {
        this.pendingMoveUci = candidateMove.uci;
        this.pendingMoveStreak = 1;
      }
    } else {
      this.pendingMoveUci = null;
      this.pendingMoveStreak = 0;
    }

    // Require 3 frames at high FPS (45-60 FPS) or 2 frames at standard FPS before confirming
    const requiredStreak = config.targetFps >= 45 ? 3 : config.targetFps <= 4 ? 1 : 2;
    const confirmedMove =
      candidateMove && this.pendingMoveStreak >= requiredStreak ? candidateMove : null;

    if (confirmedMove) {
      // Update baseline to current frame after move is confirmed
      this.baselineGray = new Uint8Array(blurred);
      this.pendingMoveUci = null;
      this.pendingMoveStreak = 0;
      this.settledDriftFrames = 0;
    }

    const tMatrix = performance.now();

    // 6. Render selected OpenCV inspection layer onto outputCanvas
    if (outputCanvas && viewMode !== 'original') {
      if (outputCanvas.width !== res || outputCanvas.height !== res) {
        outputCanvas.width = res;
        outputCanvas.height = res;
        this.outImgData = null;
      }
      const outCtx = outputCanvas.getContext('2d');
      if (outCtx) {
        if (!this.outImgData || this.outImgData.width !== res) {
          this.outImgData = outCtx.createImageData(res, res);
        }
        const outImg = this.outImgData;
        const outData = outImg.data;

        if (viewMode === 'grayscale') {
          for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
            const v = blurred[i];
            outData[p] = v;
            outData[p + 1] = v;
            outData[p + 2] = v;
            outData[p + 3] = 255;
          }
          outCtx.putImageData(outImg, 0, 0);
        } else if (viewMode === 'canny') {
          for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
            const e = edges[i];
            if (e === 255) {
              outData[p] = 34;
              outData[p + 1] = 211;
              outData[p + 2] = 238;
            } else if (e === 110) {
              outData[p] = 14;
              outData[p + 1] = 116;
              outData[p + 2] = 144;
            } else {
              outData[p] = 9;
              outData[p + 1] = 12;
              outData[p + 2] = 18;
            }
            outData[p + 3] = 255;
          }
          outCtx.putImageData(outImg, 0, 0);
        } else if (viewMode === 'heatmap') {
          for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
            const v = blurred[i] * 0.35;
            outData[p] = v;
            outData[p + 1] = v;
            outData[p + 2] = v + 10;
            outData[p + 3] = 255;
          }
          outCtx.putImageData(outImg, 0, 0);

          const cellW = res / 8;
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const m = squareMetrics[r][c];
              const intensity = Math.min(1, m.delta / Math.max(10, config.motionThreshold * 1.8));
              if (intensity > 0.15) {
                outCtx.fillStyle =
                  m.delta >= config.motionThreshold
                    ? `rgba(16, 185, 129, ${(intensity * 0.55).toFixed(2)})`
                    : `rgba(6, 182, 212, ${(intensity * 0.35).toFixed(2)})`;
                outCtx.fillRect(c * cellW + 1, r * cellW + 1, cellW - 2, cellW - 2);
              }
              outCtx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
              outCtx.lineWidth = 1;
              outCtx.strokeRect(c * cellW, r * cellW, cellW, cellW);

              outCtx.fillStyle = 'rgba(241, 245, 249, 0.8)';
              outCtx.font = `${Math.max(9, Math.round(cellW * 0.18))}px "IBM Plex Mono", monospace`;
              outCtx.fillText(
                `${m.square}:${m.delta.toFixed(0)}`,
                c * cellW + 4,
                r * cellW + Math.max(12, Math.round(cellW * 0.25))
              );
            }
          }
        }
      }
    }

    const totalMs = Math.max(0.1, performance.now() - t0);
    const now = performance.now();
    const dt = this.lastFrameTimestamp > 0 ? now - this.lastFrameTimestamp : 1000 / config.targetFps;
    this.lastFrameTimestamp = now;

    const instantFps = Math.min(120, dt > 0 ? 1000 / dt : config.targetFps);
    this.smoothedFps =
      this.smoothedFps > 0 ? this.smoothedFps * 0.8 + instantFps * 0.2 : instantFps;
    const budgetMs = 1000 / config.targetFps;
    const budgetUsagePct = Math.min(200, (totalMs / budgetMs) * 100);

    return {
      telemetry: {
        timestamp: Date.now(),
        resolution: res,
        captureMs: Number((tCapture - t0).toFixed(2)),
        blurMs: Number((tBlur - tCapture).toFixed(2)),
        cannyMs: Number((tCanny - tBlur).toFixed(2)),
        matrixMs: Number((tMatrix - tCanny).toFixed(2)),
        totalMs: Number(totalMs.toFixed(2)),
        actualFps: Number(this.smoothedFps.toFixed(1)),
        budgetMs: Number(budgetMs.toFixed(1)),
        budgetUsagePct: Number(budgetUsagePct.toFixed(1)),
      },
      squareMetrics,
      candidateMove: confirmedMove,
      maxDelta: Number(maxDelta.toFixed(1)),
    };
  }

  private matchLegalMoveFromDeltas(
    squareMetrics: SquareMetric[][],
    threshold: number,
    orientation: BoardOrientation,
    currentFen: string
  ): VisionProcessResult['candidateMove'] {
    const deltaMap = new Map<string, number>();
    let changedCount = 0;
    let totalBackgroundDelta = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const m = squareMetrics[r][c];
        deltaMap.set(m.square, m.delta);
        if (m.delta >= threshold) changedCount++;
        totalBackgroundDelta += m.delta;
      }
    }

    // Must have at least 2 squares above threshold, and not global lighting flicker (>14 squares changed)
    if (changedCount < 2 || changedCount > 14) {
      return null;
    }

    let chess: Chess;
    try {
      chess = new Chess(currentFen);
    } catch {
      return null;
    }

    const legalMoves = chess.moves({ verbose: true });
    if (legalMoves.length === 0) return null;

    let bestScore = -1;
    let secondScore = -1;
    let bestMoveObj: (typeof legalMoves)[number] | null = null;

    for (const move of legalMoves) {
      const involved: string[] = [move.from, move.to];
      if (move.san === 'O-O' || move.san === 'O-O-O') {
        const rank = move.color === 'w' ? '1' : '8';
        if (move.san === 'O-O') {
          involved.push(`h${rank}`, `f${rank}`);
        } else {
          involved.push(`a${rank}`, `d${rank}`);
        }
      }
      // En passant
      if (move.flags.includes('e')) {
        const capRank = move.color === 'w' ? '5' : '4';
        involved.push(`${move.to[0]}${capRank}`);
      }

      const fromD = deltaMap.get(move.from) ?? 0;
      const toD = deltaMap.get(move.to) ?? 0;
      if (
        Math.min(fromD, toD) < threshold * 0.45 ||
        Math.max(fromD, toD) < threshold
      ) {
        continue;
      }

      let sumInvolved = 0;
      for (const sq of involved) {
        sumInvolved += deltaMap.get(sq) ?? 0;
      }

      const avgInvolved = sumInvolved / involved.length;
      const avgOther =
        Math.max(0.5, (totalBackgroundDelta - sumInvolved) / Math.max(1, 64 - involved.length));
      const score = avgInvolved / avgOther;

      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        bestMoveObj = move;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }

    if (!bestMoveObj || bestScore < 1.9) return null;

    // Avoid ambiguity if two moves tie closely
    if (secondScore > 0 && bestScore / secondScore < 1.1 && changedCount > 2) {
      return null;
    }

    // Also respect orientation sanity check (unused param guard)
    void squareToGridCoords(bestMoveObj.from, orientation);

    const uci = `${bestMoveObj.from}${bestMoveObj.to}${bestMoveObj.promotion ?? ''}`;
    const confidence = Math.min(99, Math.round((bestScore / (bestScore + 2)) * 100));

    return {
      uci,
      san: bestMoveObj.san,
      confidence,
      fromSquare: bestMoveObj.from,
      toSquare: bestMoveObj.to,
    };
  }
}
