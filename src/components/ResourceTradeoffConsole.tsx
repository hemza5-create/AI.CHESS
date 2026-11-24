import React, { useEffect, useState } from 'react';
import { Gauge, Cpu, Grid3X3 } from 'lucide-react';
import type {
  FrameTelemetry,
  ScanResolution,
  SquareMetric,
  VisionConfig,
} from '../types/chess.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';

interface ResourceTradeoffConsoleProps {
  config: VisionConfig;
  telemetry: FrameTelemetry | null;
  telemetryHistory: FrameTelemetry[];
  squareMetrics: SquareMetric[][] | null;
  maxDelta: number;
  playerElo: number;
  autoDepthByElo: boolean;
  effectiveDepth: number;
  onChangeConfig: (patch: Partial<VisionConfig>) => void;
  onChangePlayerElo: (elo: number) => void;
  onToggleAutoDepthByElo: () => void;
}

const RESOLUTIONS: ScanResolution[] = [256, 512, 800];

export const ResourceTradeoffConsole: React.FC<ResourceTradeoffConsoleProps> = ({
  config,
  telemetry,
  telemetryHistory,
  squareMetrics,
  maxDelta,
  playerElo,
  autoDepthByElo,
  effectiveDepth,
  onChangeConfig,
  onChangePlayerElo,
  onToggleAutoDepthByElo,
}) => {
  const { t } = useLanguage();
  const [eloDraft, setEloDraft] = useState<string>(String(playerElo));

  useEffect(() => {
    setEloDraft(String(playerElo));
  }, [playerElo]);

  const commitEloDraft = () => {
    const parsed = Number(eloDraft);
    if (Number.isNaN(parsed) || !eloDraft.trim()) {
      setEloDraft(String(playerElo));
      return;
    }
    const clamped = Math.max(800, Math.min(2800, Math.round(parsed)));
    setEloDraft(String(clamped));
    onChangePlayerElo(clamped);
  };

  const budgetMs = 1000 / config.targetFps;
  const maxChartMs = Math.max(budgetMs * 1.4, 50);
  const usagePct = telemetry ? telemetry.budgetUsagePct : 0;

  const pressureTone =
    usagePct >= 95
      ? 'text-rose-300'
      : usagePct >= 70
      ? 'text-amber-300'
      : 'text-emerald-300';

  const pressureLabel =
    usagePct >= 95
      ? t.pressureOverBudget
      : usagePct >= 70
      ? t.pressureMedium
      : t.pressureStable;

  // Build SVG polyline points for actual totalMs latency
  const chartW = 460;
  const chartH = 92;
  const pts = telemetryHistory.slice(-40);
  const polylinePoints =
    pts.length > 1
      ? pts
          .map((item, idx) => {
            const x = (idx / (pts.length - 1)) * chartW;
            const y = chartH - Math.min(1, item.totalMs / maxChartMs) * (chartH - 10) - 4;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ')
      : '';

  const budgetLineY =
    chartH - Math.min(1, budgetMs / maxChartMs) * (chartH - 10) - 4;

  return (
    <section className="border border-slate-500/45 bg-[#0F1522]/55 backdrop-blur-md rounded-xl overflow-hidden shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3.5 border-b border-slate-500/45 bg-[#0B0E14]/45">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300" />
          <h2 className="text-sm sm:text-base font-bold text-white">
            {t.profilerTitle}
          </h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-sm">
          <span className={`font-semibold ${pressureTone}`}>● {pressureLabel}</span>
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="font-mono font-semibold text-slate-100 tabular-nums" dir="ltr">
            {telemetry ? `${telemetry.totalMs.toFixed(1)} ms / ${budgetMs.toFixed(1)} ms` : '—'}
          </span>
        </div>
      </div>

      <div className="p-3 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Left: Interactive Trade-off Controls */}
        <div className="lg:col-span-5 space-y-3 sm:space-y-4">
          {/* Scan Resolution Selector */}
          <div>
            <div className="flex items-center justify-between text-[11px] sm:text-sm mb-1.5 sm:mb-2">
              <span className="text-slate-100 font-semibold">{t.scanResolutionLabel}</span>
              <span className="font-mono font-bold text-cyan-200" dir="ltr">
                {config.resolution}×{config.resolution} px
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 sm:gap-1.5 p-1 bg-[#070B12]/65 rounded-lg border border-slate-500/50">
              {RESOLUTIONS.map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => onChangeConfig({ resolution: res })}
                  className={`py-1.5 sm:py-2 text-[11px] sm:text-sm font-mono rounded-md transition-colors ${
                    config.resolution === res
                      ? 'bg-cyan-400 text-slate-950 font-bold'
                      : 'text-slate-100 hover:text-white hover:bg-slate-800/75'
                  }`}
                >
                  {res}×{res}
                </button>
              ))}
            </div>
          </div>

          {/* Target FPS Slider (up to 60 FPS) */}
          <div>
            <div className="flex items-center justify-between text-[11px] sm:text-sm mb-1.5">
              <label htmlFor="fps-slider" className="text-slate-100 font-semibold">
                {t.targetFpsLabel}
              </label>
              <span className="font-mono font-bold text-cyan-200 tabular-nums" dir="ltr">
                {config.targetFps} FPS ({budgetMs.toFixed(1)} ms)
              </span>
            </div>
            <input
              id="fps-slider"
              type="range"
              min={1}
              max={60}
              step={1}
              value={config.targetFps}
              onChange={(e) => onChangeConfig({ targetFps: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
            <div className="mt-1.5 sm:mt-2 grid grid-cols-4 gap-1 sm:gap-1.5" dir="ltr">
              {[15, 30, 45, 60].map((fpsPreset) => (
                <button
                  key={fpsPreset}
                  type="button"
                  onClick={() => onChangeConfig({ targetFps: fpsPreset })}
                  className={`py-1 sm:py-1.5 text-[11px] sm:text-xs font-mono font-semibold rounded border transition-colors ${
                    config.targetFps === fpsPreset
                      ? 'bg-cyan-500/25 border-cyan-400/70 text-cyan-200 font-bold'
                      : 'bg-[#070B12]/65 border-slate-500/60 text-slate-100 hover:text-white'
                  }`}
                >
                  {fpsPreset} FPS
                </button>
              ))}
            </div>
          </div>

          {/* Canny Edge Threshold & Motion Delta Threshold */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between text-xs sm:text-sm mb-1.5">
                <label htmlFor="canny-slider" className="text-slate-100 font-medium">
                  {t.cannyThresholdLabel}
                </label>
                <span className="font-mono font-bold text-white tabular-nums">
                  {config.cannyThreshold}
                </span>
              </div>
              <input
                id="canny-slider"
                type="range"
                min={20}
                max={160}
                step={5}
                value={config.cannyThreshold}
                onChange={(e) => onChangeConfig({ cannyThreshold: Number(e.target.value) })}
                className="w-full cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs sm:text-sm mb-1.5">
                <label htmlFor="motion-slider" className="text-slate-100 font-medium">
                  {t.motionSensitivityLabel}
                </label>
                <span className="font-mono font-bold text-white tabular-nums">
                  {config.motionThreshold}
                </span>
              </div>
              <input
                id="motion-slider"
                type="range"
                min={6}
                max={45}
                step={1}
                value={config.motionThreshold}
                onChange={(e) => onChangeConfig({ motionThreshold: Number(e.target.value) })}
                className="w-full cursor-pointer"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-100 cursor-pointer">
              <input
                type="checkbox"
                checked={config.blurEnabled}
                onChange={(e) => onChangeConfig({ blurEnabled: e.target.checked })}
                className="rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-400"
              />
              <span>{t.gaussianBlurLabel}</span>
            </label>
            <span className="text-xs sm:text-sm font-mono font-semibold text-slate-200" dir="ltr">
              Δmax: {maxDelta.toFixed(1)}
            </span>
          </div>

          {/* Player Rating (Elo) & Automatic Stockfish Depth Mapping */}
          <div className="pt-3.5 border-t border-slate-600/60 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
              <label htmlFor="elo-number" className="text-white font-semibold">
                {t.playerEloLabel}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="elo-number"
                  type="number"
                  min={800}
                  max={2800}
                  step={50}
                  value={eloDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setEloDraft(raw);
                    const val = Number(raw);
                    if (!Number.isNaN(val) && val >= 800 && val <= 2800) {
                      onChangePlayerElo(Math.round(val));
                    }
                  }}
                  onBlur={commitEloDraft}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitEloDraft();
                    }
                  }}
                  dir="ltr"
                  className="w-24 bg-[#070B12] border border-slate-500/70 rounded px-2.5 py-1.5 text-sm font-mono font-bold text-cyan-200 text-center focus:outline-none focus:border-cyan-400"
                />
                <span className="text-xs sm:text-sm font-mono font-bold text-emerald-300 tabular-nums" dir="ltr">
                  → {t.depthShort} {effectiveDepth}
                </span>
              </div>
            </div>

            <input
              aria-label={t.eloSliderAria}
              type="range"
              min={800}
              max={2800}
              step={50}
              value={playerElo}
              onChange={(e) => onChangePlayerElo(Number(e.target.value))}
              className="w-full cursor-pointer"
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-1.5">
              {t.eloPresets.map((preset) => (
                <button
                  key={preset.elo}
                  type="button"
                  onClick={() => onChangePlayerElo(preset.elo)}
                  className={`py-1 sm:py-1.5 px-1.5 sm:px-2 text-[11px] sm:text-xs font-semibold rounded border transition-colors whitespace-nowrap ${
                    Math.abs(playerElo - preset.elo) < 25
                      ? 'bg-cyan-500/25 border-cyan-400/70 text-cyan-200 font-bold'
                      : 'bg-[#070B12]/65 border-slate-500/60 text-slate-100 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-100 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={autoDepthByElo}
                onChange={onToggleAutoDepthByElo}
                className="rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-400"
              />
              <span>{t.autoDepthByEloLabel}</span>
            </label>
          </div>
        </div>

        {/* Middle: Real-time Frame Budget SVG Chart & Pipeline Breakdown */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-100 font-semibold">
              <Cpu className="w-4 h-4 text-cyan-300" />
              <span>{t.frameTimeVsBudgetLabel}</span>
            </span>
            <span className={`font-mono font-bold tabular-nums ${pressureTone}`} dir="ltr">
              {usagePct.toFixed(0)}%
            </span>
          </div>

          <div className="bg-[#070B12]/65 border border-slate-500/55 rounded-lg p-3">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-24 overflow-visible">
              {/* Budget limit dashed line */}
              <line
                x1={0}
                y1={budgetLineY}
                x2={chartW}
                y2={budgetLineY}
                stroke="#FBBF24"
                strokeWidth="1.2"
                strokeDasharray="4 3"
              />
              <text
                x={4}
                y={Math.max(12, budgetLineY - 5)}
                fill="#FDE68A"
                fontSize="11"
                fontWeight="600"
                fontFamily="IBM Plex Mono, monospace"
              >
                {t.budgetSvgText(budgetMs.toFixed(1))}
              </text>

              {/* Latency trace */}
              {polylinePoints && (
                <polyline
                  fill="none"
                  stroke="#22D3EE"
                  strokeWidth="2"
                  points={polylinePoints}
                />
              )}
            </svg>
          </div>

          {/* Pipeline stage timings */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center bg-[#070B12]/65 border border-slate-500/55 rounded-lg p-2 sm:p-3">
            <div>
              <div className="text-[10px] sm:text-xs font-medium text-slate-200">{t.stageCapture}</div>
              <div className="text-xs sm:text-sm font-mono font-bold text-white tabular-nums" dir="ltr">
                {telemetry ? `${telemetry.captureMs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] sm:text-xs font-medium text-slate-200">{t.stageBlur}</div>
              <div className="text-xs sm:text-sm font-mono font-bold text-white tabular-nums" dir="ltr">
                {telemetry ? `${telemetry.blurMs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] sm:text-xs font-medium text-slate-200">{t.stageCanny}</div>
              <div className="text-xs sm:text-sm font-mono font-bold text-white tabular-nums" dir="ltr">
                {telemetry ? `${telemetry.cannyMs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] sm:text-xs font-medium text-slate-200">{t.stageMatrix}</div>
              <div className="text-xs sm:text-sm font-mono font-bold text-white tabular-nums" dir="ltr">
                {telemetry ? `${telemetry.matrixMs.toFixed(1)}ms` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live 8x8 Extracted Matrix Snapshot */}
        <div className="lg:col-span-3 flex flex-col">
          <div className="flex items-center justify-between text-[11px] sm:text-sm mb-2">
            <span className="inline-flex items-center gap-1.5 text-slate-100 font-semibold">
              <Grid3X3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300" />
              <span>{t.matrixDiffTitle}</span>
            </span>
            <span className="text-[11px] sm:text-xs font-mono font-semibold text-slate-200">Δ Luma</span>
          </div>

          <div
            dir="ltr"
            className="grid grid-cols-8 gap-0.5 p-1 sm:p-1.5 bg-[#070B12]/65 border border-slate-500/55 rounded-lg aspect-square max-w-[176px] sm:max-w-[220px] mx-auto w-full"
          >
            {squareMetrics
              ? squareMetrics.flat().map((sq) => {
                  const active = sq.delta >= config.motionThreshold;
                  const norm = Math.min(1, sq.delta / Math.max(12, config.motionThreshold * 1.5));
                  return (
                    <div
                      key={sq.square}
                      title={`${sq.square}: Δ=${sq.delta.toFixed(1)}, Edge=${sq.edgeDensity.toFixed(0)}%`}
                      style={{
                        backgroundColor: active
                          ? `rgba(16, 185, 129, ${(0.3 + norm * 0.55).toFixed(2)})`
                          : `rgba(6, 182, 212, ${(norm * 0.35).toFixed(2)})`,
                      }}
                      className="flex items-center justify-center rounded-[2px] border border-slate-600/60 text-[8px] sm:text-[10px] font-mono font-bold text-white tabular-nums"
                    >
                      {sq.delta >= 1 ? sq.delta.toFixed(0) : ''}
                    </div>
                  );
                })
              : Array.from({ length: 64 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-[2px] border border-slate-600/50 bg-slate-900/35"
                  />
                ))}
          </div>
        </div>
      </div>
    </section>
  );
};
