import React, { useEffect, useState } from 'react';
import { Gauge, Cpu, Grid3X3 } from 'lucide-react';
import type {
  FrameTelemetry,
  ScanResolution,
  SquareMetric,
  VisionConfig,
} from '../types/chess';

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
const ELO_PRESETS = [
  { elo: 1000, label: 'مبتدئ 1000' },
  { elo: 1500, label: 'متوسط 1500' },
  { elo: 2000, label: 'متقدم 2000' },
  { elo: 2500, label: 'أستاذ 2500' },
];

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
      ? 'text-rose-400'
      : usagePct >= 70
      ? 'text-amber-400'
      : 'text-emerald-400';

  const pressureLabel =
    usagePct >= 95
      ? 'تجاوز ميزانية الإطار (تأخر محتمل)'
      : usagePct >= 70
      ? 'ضغط معالجة متوسط'
      : 'أداء مستقر دون تأخر';

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
    <section className="border border-slate-800 bg-[#121722] rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            مقايضة استهلاك الموارد ودقة الرصد (OpenCV Resource Profiler)
          </h2>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className={`font-medium ${pressureTone}`}>● {pressureLabel}</span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-slate-300 tabular-nums" dir="ltr">
            {telemetry ? `${telemetry.totalMs.toFixed(1)} ms / ${budgetMs.toFixed(1)} ms` : '—'}
          </span>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Trade-off Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Scan Resolution Selector */}
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-300 font-medium">دقة المسح (Scan Resolution)</span>
              <span className="font-mono text-cyan-300" dir="ltr">
                {config.resolution}×{config.resolution} px
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0B0E14] rounded-lg border border-slate-800">
              {RESOLUTIONS.map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => onChangeConfig({ resolution: res })}
                  className={`py-1.5 text-xs font-mono rounded-md transition-colors ${
                    config.resolution === res
                      ? 'bg-cyan-600 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {res}×{res}
                </button>
              ))}
            </div>
          </div>

          {/* Target FPS Slider (up to 60 FPS) */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="fps-slider" className="text-slate-300 font-medium">
                معدل تكرار الإطارات (Target FPS)
              </label>
              <span className="font-mono text-cyan-300 tabular-nums" dir="ltr">
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
            <div className="mt-1.5 grid grid-cols-4 gap-1.5" dir="ltr">
              {[15, 30, 45, 60].map((fpsPreset) => (
                <button
                  key={fpsPreset}
                  type="button"
                  onClick={() => onChangeConfig({ targetFps: fpsPreset })}
                  className={`py-1 text-[11px] font-mono rounded border transition-colors ${
                    config.targetFps === fpsPreset
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-semibold'
                      : 'bg-[#0B0E14] border-slate-800 text-slate-400 hover:text-slate-200'
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
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="canny-slider" className="text-slate-400">
                  عتبة حواف Canny
                </label>
                <span className="font-mono text-slate-200 tabular-nums">
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
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="motion-slider" className="text-slate-400">
                  حساسية تغير المربع
                </label>
                <span className="font-mono text-slate-200 tabular-nums">
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

          <div className="flex items-center justify-between pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.blurEnabled}
                onChange={(e) => onChangeConfig({ blurEnabled: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
              />
              <span>تفعيل مرشح GaussianBlur (5×5) لتقليل ضوضاء الكاميرا</span>
            </label>
            <span className="text-[11px] font-mono text-slate-400" dir="ltr">
              Δmax: {maxDelta.toFixed(1)}
            </span>
          </div>

          {/* Player Rating (Elo) & Automatic Stockfish Depth Mapping */}
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <label htmlFor="elo-number" className="text-slate-200 font-medium">
                مستوى اللاعب / التقييم (Elo)
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
                  className="w-20 bg-[#0B0E14] border border-slate-700 rounded px-2 py-1 text-xs font-mono text-cyan-300 text-center focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[11px] font-mono text-emerald-400 tabular-nums" dir="ltr">
                  → Depth {effectiveDepth}
                </span>
              </div>
            </div>

            <input
              aria-label="شريط تقييم اللاعب Elo"
              type="range"
              min={800}
              max={2800}
              step={50}
              value={playerElo}
              onChange={(e) => onChangePlayerElo(Number(e.target.value))}
              className="w-full cursor-pointer"
            />

            <div className="grid grid-cols-4 gap-1.5">
              {ELO_PRESETS.map((preset) => (
                <button
                  key={preset.elo}
                  type="button"
                  onClick={() => onChangePlayerElo(preset.elo)}
                  className={`py-1 px-1.5 text-[11px] rounded border transition-colors whitespace-nowrap ${
                    Math.abs(playerElo - preset.elo) < 25
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-semibold'
                      : 'bg-[#0B0E14] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={autoDepthByElo}
                onChange={onToggleAutoDepthByElo}
                className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
              />
              <span>ضبط عمق بحث Stockfish تلقائياً حسب تقييم اللاعب</span>
            </label>
          </div>
        </div>

        {/* Middle: Real-time Frame Budget SVG Chart & Pipeline Breakdown */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>زمن المعالجة الفعلي مقابل ميزانية الإطار</span>
            </span>
            <span className={`font-mono font-semibold tabular-nums ${pressureTone}`} dir="ltr">
              {usagePct.toFixed(0)}%
            </span>
          </div>

          <div className="bg-[#0B0E14] border border-slate-800 rounded-lg p-2.5">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-24 overflow-visible">
              {/* Budget limit dashed line */}
              <line
                x1={0}
                y1={budgetLineY}
                x2={chartW}
                y2={budgetLineY}
                stroke="#F59E0B"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <text
                x={4}
                y={Math.max(10, budgetLineY - 4)}
                fill="#F59E0B"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
              >
                Budget {budgetMs.toFixed(1)}ms
              </text>

              {/* Latency trace */}
              {polylinePoints && (
                <polyline
                  fill="none"
                  stroke="#06B6D4"
                  strokeWidth="1.8"
                  points={polylinePoints}
                />
              )}
            </svg>
          </div>

          {/* Pipeline stage timings */}
          <div className="grid grid-cols-4 gap-2 text-center bg-[#0B0E14] border border-slate-800 rounded-lg p-2.5">
            <div>
              <div className="text-[10px] text-slate-500">Capture</div>
              <div className="text-xs font-mono text-slate-200 tabular-nums" dir="ltr">
                {telemetry ? `${telemetry.captureMs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Blur 5×5</div>
              <div className="text-xs font-mono text-slate-200 tabular-nums" dir="ltr">
                {telemetry ? `${telemetry.blurMs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Canny</div>
              <div className="text-xs font-mono text-slate-200 tabular-nums" dir="ltr">
                {telemetry ? `${telemetry.cannyMs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Matrix 8×8</div>
              <div className="text-xs font-mono text-slate-200 tabular-nums" dir="ltr">
                {telemetry ? `${telemetry.matrixMs.toFixed(1)}ms` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live 8x8 Extracted Matrix Snapshot */}
        <div className="lg:col-span-3 flex flex-col">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium">
              <Grid3X3 className="w-3.5 h-3.5 text-cyan-400" />
              <span>مصفوفة الفروقات 8×8</span>
            </span>
            <span className="text-[11px] font-mono text-slate-500">Δ Luma</span>
          </div>

          <div
            dir="ltr"
            className="grid grid-cols-8 gap-0.5 p-1.5 bg-[#0B0E14] border border-slate-800 rounded-lg aspect-square max-w-[200px] mx-auto w-full"
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
                          ? `rgba(16, 185, 129, ${(0.25 + norm * 0.65).toFixed(2)})`
                          : `rgba(6, 182, 212, ${(norm * 0.35).toFixed(2)})`,
                      }}
                      className="flex items-center justify-center rounded-[2px] border border-slate-800/80 text-[8px] font-mono text-slate-200 tabular-nums"
                    >
                      {sq.delta >= 1 ? sq.delta.toFixed(0) : ''}
                    </div>
                  );
                })
              : Array.from({ length: 64 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-[2px] border border-slate-800/60 bg-slate-900/40"
                  />
                ))}
          </div>
        </div>
      </div>
    </section>
  );
};
