import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  Terminal,
  ChevronDown,
  ChevronUp,
  MessageSquareText,
  Play,
  Square,
  Loader2,
  Power,
} from 'lucide-react';
import type {
  MoveRecord,
  StockfishAnalysisResult,
  TtsVoiceName,
} from '../types/chess.ts';

interface AnalysisAndVoicePanelProps {
  analysis: StockfishAnalysisResult | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  searchDepth: number;
  playerElo: number;
  autoDepthByElo: boolean;
  onChangeSearchDepth: (depth: number) => void;
  onRestoreAutoDepth: () => void;
  voiceCoachEnabled: boolean;
  onToggleVoiceCoach: () => void;
  explanationText: string | null;
  isGeneratingExplanation: boolean;
  isSynthesizingAudio: boolean;
  isPlayingAudio: boolean;
  voiceError: string | null;
  autoSpeak: boolean;
  selectedVoice: TtsVoiceName;
  hasAudioReady: boolean;
  moveHistory: MoveRecord[];
  onToggleAutoSpeak: () => void;
  onSelectVoice: (voice: TtsVoiceName) => void;
  onGenerateAndSpeak: () => void;
  onReplayOrStopAudio: () => void;
  onApplyPvMove: (uci: string) => void;
}

const VOICE_OPTIONS: { value: TtsVoiceName; label: string }[] = [
  { value: 'Kore', label: 'Kore (متزن)' },
  { value: 'Charon', label: 'Charon (عميق)' },
  { value: 'Fenrir', label: 'Fenrir (حازم)' },
  { value: 'Zephyr', label: 'Zephyr (واضح)' },
  { value: 'Puck', label: 'Puck (حيوي)' },
];

export const AnalysisAndVoicePanel: React.FC<AnalysisAndVoicePanelProps> = ({
  analysis,
  isAnalyzing,
  analysisError,
  searchDepth,
  playerElo,
  autoDepthByElo,
  onChangeSearchDepth,
  onRestoreAutoDepth,
  voiceCoachEnabled,
  onToggleVoiceCoach,
  explanationText,
  isGeneratingExplanation,
  isSynthesizingAudio,
  isPlayingAudio,
  voiceError,
  autoSpeak,
  selectedVoice,
  hasAudioReady,
  moveHistory,
  onToggleAutoSpeak,
  onSelectVoice,
  onGenerateAndSpeak,
  onReplayOrStopAudio,
  onApplyPvMove,
}) => {
  const [showUciLog, setShowUciLog] = useState(false);

  const scoreTone =
    !analysis
      ? 'text-slate-300'
      : analysis.scoreValue > 35
      ? 'text-emerald-400'
      : analysis.scoreValue < -35
      ? 'text-rose-400'
      : 'text-slate-100';

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Stockfish UCI Engine Card */}
      <section className="border border-slate-800 bg-[#121722] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100 whitespace-nowrap">
              محرك Stockfish 19 UCI
            </h2>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-mono text-slate-400" dir="ltr">
              Depth {analysis?.appliedDepth ?? analysis?.depthReached ?? searchDepth} · Elo {playerElo}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!autoDepthByElo && (
              <button
                type="button"
                onClick={onRestoreAutoDepth}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
              >
                تلقائي (Elo)
              </button>
            )}
            <label htmlFor="depth-range" className="text-xs text-slate-400 whitespace-nowrap">
              العمق:
            </label>
            <input
              id="depth-range"
              type="range"
              min={5}
              max={18}
              step={1}
              value={searchDepth}
              onChange={(e) => onChangeSearchDepth(Number(e.target.value))}
              className="w-20 cursor-pointer"
            />
            <span className="text-xs font-mono text-cyan-300 w-5 text-center">
              {searchDepth}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {analysisError && (
            <div className="px-3 py-2 rounded-md border border-rose-500/40 bg-rose-950/30 text-xs text-rose-200">
              {analysisError}
            </div>
          )}

          {/* Primary Evaluation Row */}
          <div className="grid grid-cols-3 gap-3 pb-3 border-b border-slate-800/80">
            <div>
              <div className="text-[11px] text-slate-400 mb-1">التقييم</div>
              <div className={`text-2xl font-mono font-semibold tabular-nums ${scoreTone}`} dir="ltr">
                {isAnalyzing && !analysis ? '...' : analysis?.evaluationLabel ?? '0.00'}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-400 mb-1">أفضل نقلة</div>
              <div className="text-lg font-mono font-semibold text-emerald-400" dir="ltr">
                {analysis?.bestMoveSan ? (
                  <button
                    type="button"
                    onClick={() => analysis.bestMove && onApplyPvMove(analysis.bestMove)}
                    title="تطبيق هذه النقلة على الرقعة"
                    className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 rounded"
                  >
                    {analysis.bestMoveSan}{' '}
                    <span className="text-xs text-slate-400 font-normal">
                      ({analysis.bestMove})
                    </span>
                  </button>
                ) : (
                  <span className="text-slate-500 text-sm">
                    {analysis?.gameOverReason ?? '—'}
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-400 mb-1">سرعة البحث</div>
              <div className="text-sm font-mono text-slate-200 tabular-nums" dir="ltr">
                {analysis
                  ? `${(analysis.nps / 1000).toFixed(0)}k n/s · ${analysis.timeMs}ms`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Top 3 MultiPV Lines */}
          <div>
            <div className="text-xs text-slate-400 mb-2">أفضل التفريعات المرشحة (MultiPV)</div>
            {analysis && analysis.lines.length > 0 ? (
              <div className="divide-y divide-slate-800/70 border border-slate-800/80 rounded-lg bg-[#0B0E14]">
                {analysis.lines.map((line) => {
                  const scoreStr =
                    line.scoreType === 'mate'
                      ? `${line.scoreValue > 0 ? '+' : '-'}M${Math.abs(line.scoreValue)}`
                      : `${line.scoreValue >= 0 ? '+' : ''}${(line.scoreValue / 100).toFixed(2)}`;
                  return (
                    <div
                      key={line.multipv}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0" dir="ltr">
                        <span className="font-mono text-slate-500 w-4">#{line.multipv}</span>
                        <span
                          className={`font-mono font-semibold w-14 text-right tabular-nums ${
                            line.scoreValue > 30
                              ? 'text-emerald-400'
                              : line.scoreValue < -30
                              ? 'text-rose-400'
                              : 'text-slate-200'
                          }`}
                        >
                          {scoreStr}
                        </span>
                        <span className="font-mono text-slate-300 truncate">
                          {line.pvSan.join(' ')}
                        </span>
                      </div>

                      {line.pvUci[0] && (
                        <button
                          type="button"
                          onClick={() => onApplyPvMove(line.pvUci[0])}
                          className="text-[11px] text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
                        >
                          تطبيق
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-2">
                {analysis?.isGameOver
                  ? analysis.gameOverReason
                  : 'قم بتحريك قطعة أو تشغيل البث لتقييم الوضعية.'}
              </div>
            )}
          </div>

          {/* Expandable UCI Protocol Terminal */}
          <div>
            <button
              type="button"
              onClick={() => setShowUciLog((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-[#0B0E14] border border-slate-800 rounded-lg transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>سجل بروتوكول UCI الخام</span>
              </span>
              {showUciLog ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showUciLog && (
              <pre
                dir="ltr"
                className="mt-2 p-3 rounded-lg bg-[#070A10] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-44 overflow-y-auto leading-relaxed"
              >
                {analysis?.uciLog?.length
                  ? analysis.uciLog.join('\n')
                  : '> uci\n< uciok\n< readyok'}
              </pre>
            )}
          </div>
        </div>
      </section>

      {/* 2. Gemini LLM Explanation & Spoken Arabic Commentary (On-Demand Toggle) */}
      <section className="border border-slate-800 bg-[#121722] rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquareText
              className={`w-4 h-4 shrink-0 ${voiceCoachEnabled ? 'text-cyan-400' : 'text-slate-400'}`}
            />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100 whitespace-nowrap">
                الشرح الصوتي بالذكاء الاصطناعي
              </h2>
              {!voiceCoachEnabled && (
                <p className="text-[11px] text-slate-400 truncate">
                  متوقف حالياً · شغّله عند الحاجة للشرح الصوتي
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {voiceCoachEnabled && (
              <>
                <button
                  type="button"
                  onClick={onToggleAutoSpeak}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    autoSpeak
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                      : 'border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {autoSpeak ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  <span>نطق تلقائي</span>
                </button>

                <select
                  aria-label="اختيار نبرة الصوت"
                  value={selectedVoice}
                  onChange={(e) => onSelectVoice(e.target.value as TtsVoiceName)}
                  className="bg-[#0B0E14] border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            <button
              type="button"
              onClick={onToggleVoiceCoach}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                voiceCoachEnabled
                  ? 'bg-slate-800 hover:bg-rose-600/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{voiceCoachEnabled ? 'إيقاف' : 'تشغيل'}</span>
            </button>
          </div>
        </div>

        {voiceCoachEnabled && (
          <div className="p-4 space-y-3">
            {voiceError && (
              <div className="px-3 py-2 rounded-md border border-rose-500/40 bg-rose-950/30 text-xs text-rose-200">
                {voiceError}
              </div>
            )}

            <div className="min-h-[84px] p-3 rounded-lg bg-[#0B0E14] border border-slate-800 text-sm leading-relaxed text-slate-200">
              {isGeneratingExplanation ? (
                <span className="inline-flex items-center gap-2 text-slate-400 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>جاري صياغة التحليل الاستراتيجي للنقلات...</span>
                </span>
              ) : explanationText ? (
                explanationText
              ) : (
                <span className="text-slate-500 text-xs">
                  اضغط على «شرح ونطق القرار الآن» أو فعّل «نطق تلقائي» ليقوم النموذج اللغوي بتفسير قرار
                  Stockfish وقراءته صوتياً بالعربية.
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onGenerateAndSpeak}
                disabled={isGeneratingExplanation || isSynthesizingAudio || !analysis}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:pointer-events-none text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {isGeneratingExplanation || isSynthesizingAudio ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {isSynthesizingAudio
                    ? 'جاري توليد الصوت...'
                    : 'شرح ونطق القرار الآن'}
                </span>
              </button>

              {hasAudioReady && (
                <button
                  type="button"
                  onClick={onReplayOrStopAudio}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  {isPlayingAudio ? (
                    <>
                      <Square className="w-3.5 h-3.5 text-rose-400" />
                      <span>إيقاف الصوت</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>إعادة الاستماع</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 3. Detected Move Log */}
      <section className="border border-slate-800 bg-[#121722] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
          <h3 className="text-xs font-semibold text-slate-200">سجل النقلات المرصودة</h3>
          <span className="text-[11px] font-mono text-slate-400">
            {moveHistory.length} نقلة
          </span>
        </div>

        <div className="max-h-40 overflow-y-auto divide-y divide-slate-800/60">
          {moveHistory.length === 0 ? (
            <div className="px-4 py-4 text-xs text-slate-500 text-center">
              لم يتم تسجيل أي نقلة بعد. حرّك قطعة في البث أو على الرقعة.
            </div>
          ) : (
            moveHistory.map((m) => (
              <div
                key={`${m.ply}-${m.uci}`}
                className="flex items-center justify-between px-4 py-2 text-xs hover:bg-slate-800/30"
              >
                <div className="flex items-center gap-3" dir="ltr">
                  <span className="font-mono text-slate-500 w-6">
                    {Math.ceil(m.ply / 2)}.{m.ply % 2 === 1 ? '' : '..'}
                  </span>
                  <span className="font-mono font-semibold text-slate-100">{m.san}</span>
                  <span className="font-mono text-slate-500">{m.uci}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>
                    {m.source === 'vision'
                      ? 'رصد OpenCV'
                      : m.source === 'virtual'
                      ? 'بث تفاعلي'
                      : 'يدوي'}
                  </span>
                  <span className="font-mono text-slate-300" dir="ltr">
                    {m.evaluationLabel ?? '—'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
