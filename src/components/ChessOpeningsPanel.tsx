import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crown,
  FlipVertical2,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  Swords,
  Undo2,
} from 'lucide-react';
import {
  CHESS_OPENINGS,
  buildOpeningTimeline,
  type ChessOpeningDefinition,
  type OpeningCategory,
} from '../data/chessOpenings.ts';
import { TacticalBoard } from './TacticalBoard.tsx';
import { localStockfishEngine } from '../engine/localStockfishEngine.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import {
  getLocalizedGameOverReason,
  type GameOverKey,
  type SupportedLanguage,
} from '../i18n/translations.ts';
import {
  buildWrittenMoveExplanation,
  evaluateMoveGrade,
  type MoveQualityGrade,
  type OpeningGameMoveLogEntry,
} from '../utils/openingCoachExplainer.ts';
import { playMoveTapSound, unlockAudioContext } from '../utils/soundEffects.ts';
import type { BoardOrientation, StockfishAnalysisResult } from '../types/chess.ts';

type CategoryFilter = 'all' | OpeningCategory;
type PanelPracticeMode = 'theory' | 'continueGame';

const OPENING_CATEGORIES: OpeningCategory[] = ['open', 'semiOpen', 'closed', 'indian', 'flank'];
const COACH_ELO_LEVELS = [1000, 1400, 1800, 2200] as const;

interface ContinuationUiCopy {
  completeFromHereBtn: string;
  completeAfterTheoryBtn: string;
  backToTheoryBtn: string;
  restartGameBtn: string;
  undoMoveBtn: string;
  hintExplainBtn: string;
  switchSideBtn: string;
  modeBadge: string;
  coachThinking: string;
  yourTurn: string;
  coachLevelLabel: string;
  playingAsWhite: string;
  playingAsBlack: string;
  liveCommentaryTitle: string;
  emptyCommentaryHint: string;
  hintCommentaryTitle: string;
  hintCommentaryBody: (san: string, line: string, evalStr: string) => string;
  gameHistoryTitle: string;
  emptyHistoryNote: string;
  gameOverTitle: string;
  playAgainBtn: string;
  gradeLabels: Record<MoveQualityGrade, string>;
}

const CONTINUATION_COPY: Record<SupportedLanguage, ContinuationUiCopy> = {
  ar: {
    completeFromHereBtn: 'أكمل المباراة بالشرح',
    completeAfterTheoryBtn: 'أكمل المباراة الآن ضد المدرب مع شرح مكتوب',
    backToTheoryBtn: 'العودة لتسلسل الافتتاح',
    restartGameBtn: 'إعادة الإكمال',
    undoMoveBtn: 'تراجع',
    hintExplainBtn: 'اقترح نقلة بالشرح',
    switchSideBtn: 'تبديل اللون',
    modeBadge: 'إكمال المباراة بالشرح',
    coachThinking: 'المدرب Stockfish يفكر...',
    yourTurn: 'دورك لإكمال المباراة',
    coachLevelLabel: 'قوة المدرب',
    playingAsWhite: 'تلعب بالأبيض',
    playingAsBlack: 'تلعب بالأسود',
    liveCommentaryTitle: 'الشرح المكتوب للنقلة الحالية',
    emptyCommentaryHint:
      'العب نقلتك على الرقعة لإكمال المباراة؛ سيقوم المدرب بتقييم كل نقلة وشرحها بالكتابة فورياً.',
    hintCommentaryTitle: 'اقتراح المدرب المكتوب',
    hintCommentaryBody: (san, line, evalStr) =>
      `ينصح المدرب بالنقلة ${san} للحفاظ على المبادرة وبناء أفضل تكملة${line ? ` (${line})` : ''}. التقييم الحالي: ${evalStr}.`,
    gameHistoryTitle: 'سجل إكمال المباراة مع الشرح المكتوب',
    emptyHistoryNote: 'لم تُلعب نقلات إضافية بعد انتهاء الافتتاح حتى الآن.',
    gameOverTitle: 'انتهت المباراة المكتملة',
    playAgainBtn: 'إعادة إكمال نفس الافتتاح',
    gradeLabels: {
      best: 'نقلة ممتازة',
      good: 'نقلة جيدة',
      inaccuracy: 'عدم دقة',
      mistake: 'خطأ',
      coach: 'نقلة المدرب',
    },
  },
  en: {
    completeFromHereBtn: 'Complete Game + Notes',
    completeAfterTheoryBtn: 'Continue & Complete Game vs Coach',
    backToTheoryBtn: 'Back to Theory',
    restartGameBtn: 'Restart Match',
    undoMoveBtn: 'Undo',
    hintExplainBtn: 'Hint + Explain',
    switchSideBtn: 'Switch Side',
    modeBadge: 'Match Completion',
    coachThinking: 'Coach Stockfish thinking...',
    yourTurn: 'Your turn to continue',
    coachLevelLabel: 'Coach Elo',
    playingAsWhite: 'Playing White',
    playingAsBlack: 'Playing Black',
    liveCommentaryTitle: 'Written Move Commentary',
    emptyCommentaryHint:
      'Play a move on the board to complete the game after this opening — every move is graded and explained in writing.',
    hintCommentaryTitle: 'Written Coach Suggestion',
    hintCommentaryBody: (san, line, evalStr) =>
      `Recommended move is ${san}${line ? ` leading to (${line})` : ''}. Current evaluation: ${evalStr}.`,
    gameHistoryTitle: 'Completed Game Log & Written Explanations',
    emptyHistoryNote: 'No continuation moves played after the opening yet.',
    gameOverTitle: 'Completed Game Finished',
    playAgainBtn: 'Replay From This Opening',
    gradeLabels: {
      best: 'Best Move',
      good: 'Good Move',
      inaccuracy: 'Inaccuracy',
      mistake: 'Mistake',
      coach: 'Coach Move',
    },
  },
  ru: {
    completeFromHereBtn: 'Доиграть партию',
    completeAfterTheoryBtn: 'Доиграть партию с тренером и комментариями',
    backToTheoryBtn: 'К теории дебюта',
    restartGameBtn: 'Начать заново',
    undoMoveBtn: 'Назад',
    hintExplainBtn: 'Подсказка + разбор',
    switchSideBtn: 'Сменить цвет',
    modeBadge: 'Доигрывание партии',
    coachThinking: 'Тренер Stockfish думает...',
    yourTurn: 'Ваш ход',
    coachLevelLabel: 'Сила тренера',
    playingAsWhite: 'Вы играете белыми',
    playingAsBlack: 'Вы играете чёрными',
    liveCommentaryTitle: 'Письменный разбор текущего хода',
    emptyCommentaryHint:
      'Сделайте ход на доске, чтобы доиграть партию после дебюта — каждый ход оценивается и объясняется текстом.',
    hintCommentaryTitle: 'Рекомендация тренера',
    hintCommentaryBody: (san, line, evalStr) =>
      `Рекомендуется ход ${san}${line ? ` (вариант: ${line})` : ''}. Оценка: ${evalStr}.`,
    gameHistoryTitle: 'Журнал доигранной партии с объяснениями',
    emptyHistoryNote: 'После дебюта ещё не сделано ни одного хода.',
    gameOverTitle: 'Партия завершена',
    playAgainBtn: 'Сыграть снова из этого дебюта',
    gradeLabels: {
      best: 'Лучший ход',
      good: 'Хороший ход',
      inaccuracy: 'Неточность',
      mistake: 'Ошибка',
      coach: 'Ход тренера',
    },
  },
  zh: {
    completeFromHereBtn: '继续完成对局',
    completeAfterTheoryBtn: '继续与教练完成对局并附文字讲解',
    backToTheoryBtn: '返回开局讲解',
    restartGameBtn: '重新续弈',
    undoMoveBtn: '悔棋',
    hintExplainBtn: '着法提示与讲解',
    switchSideBtn: '交换黑白',
    modeBadge: '开局续弈讲解',
    coachThinking: 'Stockfish 教练思考中...',
    yourTurn: '轮到你继续下棋',
    coachLevelLabel: '教练等级分',
    playingAsWhite: '执白',
    playingAsBlack: '执黑',
    liveCommentaryTitle: '当前着法文字讲解',
    emptyCommentaryHint: '在棋盘上走子继续完成对局，每一步都会获得评分与详细文字讲解。',
    hintCommentaryTitle: '教练文字建议',
    hintCommentaryBody: (san, line, evalStr) =>
      `建议走 ${san}${line ? `（后续参考：${line}）` : ''}。当前评估：${evalStr}。`,
    gameHistoryTitle: '续弈着法与文字讲解记录',
    emptyHistoryNote: '开局主线之后尚未走子。',
    gameOverTitle: '对局已结束',
    playAgainBtn: '从当前开局重新续弈',
    gradeLabels: {
      best: '最佳着法',
      good: '稳健着法',
      inaccuracy: '不精确',
      mistake: '失误',
      coach: '教练着法',
    },
  },
  fr: {
    completeFromHereBtn: 'Terminer la partie',
    completeAfterTheoryBtn: 'Continuer et finir la partie avec explications écrites',
    backToTheoryBtn: 'Retour à l’ouverture',
    restartGameBtn: 'Recommencer',
    undoMoveBtn: 'Annuler',
    hintExplainBtn: 'Conseil + explication',
    switchSideBtn: 'Changer de camp',
    modeBadge: 'Fin de partie guidée',
    coachThinking: 'Le coach Stockfish réfléchit...',
    yourTurn: 'À vous de jouer',
    coachLevelLabel: 'Niveau Elo',
    playingAsWhite: 'Vous jouez les Blancs',
    playingAsBlack: 'Vous jouez les Noirs',
    liveCommentaryTitle: 'Explication écrite du coup actuel',
    emptyCommentaryHint:
      'Jouez un coup sur l’échiquier pour poursuivre la partie ; chaque coup est évalué et commenté par écrit.',
    hintCommentaryTitle: 'Suggestion écrite du coach',
    hintCommentaryBody: (san, line, evalStr) =>
      `Le coach conseille ${san}${line ? ` (suite : ${line})` : ''}. Évaluation actuelle : ${evalStr}.`,
    gameHistoryTitle: 'Journal de fin de partie et commentaires écrits',
    emptyHistoryNote: 'Aucun coup supplémentaire joué après l’ouverture pour le moment.',
    gameOverTitle: 'Partie terminée',
    playAgainBtn: 'Rejouer depuis cette ouverture',
    gradeLabels: {
      best: 'Meilleur coup',
      good: 'Bon coup',
      inaccuracy: 'Imprécision',
      mistake: 'Erreur',
      coach: 'Coup du coach',
    },
  },
};

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

function getDepthForElo(elo: number): number {
  if (elo <= 1000) return 5;
  if (elo <= 1400) return 8;
  if (elo <= 1800) return 11;
  return 14;
}

function gradeBadgeClasses(grade: MoveQualityGrade): string {
  switch (grade) {
    case 'best':
      return 'bg-emerald-500/20 text-emerald-200 border-emerald-400/60';
    case 'good':
      return 'bg-cyan-500/20 text-cyan-200 border-cyan-400/55';
    case 'inaccuracy':
      return 'bg-amber-500/20 text-amber-200 border-amber-400/60';
    case 'mistake':
      return 'bg-rose-500/20 text-rose-200 border-rose-400/60';
    case 'coach':
      return 'bg-indigo-500/20 text-indigo-200 border-indigo-400/55';
  }
}

export const ChessOpeningsPanel: React.FC = () => {
  const { language, t } = useLanguage();
  const cCopy = CONTINUATION_COPY[language] ?? CONTINUATION_COPY.ar;

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const filteredOpenings = useMemo(() => {
    if (categoryFilter === 'all') return CHESS_OPENINGS;
    return CHESS_OPENINGS.filter((op) => op.category === categoryFilter);
  }, [categoryFilter]);

  const [selectedOpeningId, setSelectedOpeningId] = useState<string>(CHESS_OPENINGS[0].id);

  const activeOpening: ChessOpeningDefinition = useMemo(() => {
    return (
      filteredOpenings.find((op) => op.id === selectedOpeningId) ??
      filteredOpenings[0] ??
      CHESS_OPENINGS[0]
    );
  }, [filteredOpenings, selectedOpeningId]);

  const timeline = useMemo(() => buildOpeningTimeline(activeOpening.moves), [activeOpening.moves]);

  // Theory mode state
  const [practiceMode, setPracticeMode] = useState<PanelPracticeMode>('theory');
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [orientation, setOrientation] = useState<BoardOrientation>(
    activeOpening.preferredSide === 'b' ? 'black' : 'white'
  );
  const [showNextArrow, setShowNextArrow] = useState<boolean>(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [interactiveWarning, setInteractiveWarning] = useState<{
    playedSan: string;
    expectedSan: string;
  } | null>(null);

  // Match continuation state (complete the game from the opening with written commentary)
  const contChessRef = useRef<Chess>(new Chess());
  const contSessionRef = useRef<number>(1);
  const contTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const [contFen, setContFen] = useState<string>(() => contChessRef.current.fen());
  const [contStartFen, setContStartFen] = useState<string>(() => contChessRef.current.fen());
  const [contStartPly, setContStartPly] = useState<number>(0);
  const [contLastMove, setContLastMove] = useState<{ from: string; to: string } | null>(null);
  const [playerSide, setPlayerSide] = useState<'w' | 'b'>(activeOpening.preferredSide);
  const [coachElo, setCoachElo] = useState<number>(1400);
  const [isCoachThinking, setIsCoachThinking] = useState<boolean>(false);
  const [contLog, setContLog] = useState<OpeningGameMoveLogEntry[]>([]);
  const [contGameOverKey, setContGameOverKey] = useState<GameOverKey | null>(null);
  const [showCoachHintNote, setShowCoachHintNote] = useState<boolean>(false);

  const [evalResult, setEvalResult] = useState<StockfishAnalysisResult | null>(null);
  const evalSeqRef = useRef<number>(0);

  const clearCoachTimer = useCallback(() => {
    if (contTimerRef.current !== null) {
      globalThis.clearTimeout(contTimerRef.current);
      contTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      contSessionRef.current += 1;
      clearCoachTimer();
    };
  }, [clearCoachTimer]);

  const currentStep = timeline[Math.min(stepIndex, timeline.length - 1)] ?? timeline[0];
  const openingCopy = activeOpening.localized[language] ?? activeOpening.localized.ar;

  const activeBoardFen = practiceMode === 'continueGame' ? contFen : currentStep.fen;

  const selectOpening = useCallback(
    (opening: ChessOpeningDefinition) => {
      contSessionRef.current += 1;
      clearCoachTimer();
      setIsCoachThinking(false);
      setPracticeMode('theory');
      setSelectedOpeningId(opening.id);
      setStepIndex(0);
      setOrientation(opening.preferredSide === 'b' ? 'black' : 'white');
      setPlayerSide(opening.preferredSide);
      setIsAutoPlaying(false);
      setInteractiveWarning(null);
      setContLog([]);
      setContGameOverKey(null);
      setShowCoachHintNote(false);
      setShowNextArrow(false);
    },
    [clearCoachTimer]
  );

  // Lightweight local Stockfish eval for the active position (theory or continuation)
  useEffect(() => {
    if (practiceMode === 'theory' && isAutoPlaying) return;
    if (practiceMode === 'continueGame' && isCoachThinking) return;
    const seq = ++evalSeqRef.current;
    const timer = globalThis.setTimeout(async () => {
      try {
        const res = await localStockfishEngine.analyze(
          activeBoardFen,
          9,
          2,
          coachElo,
          false
        );
        if (evalSeqRef.current === seq) {
          setEvalResult(res);
        }
      } catch {
        // Ignore transient evaluation errors
      }
    }, 100);
    return () => globalThis.clearTimeout(timer);
  }, [activeBoardFen, coachElo, isAutoPlaying, isCoachThinking, practiceMode]);

  // Auto-play progression through the opening theory moves
  useEffect(() => {
    if (practiceMode !== 'theory' || !isAutoPlaying) return;
    if (stepIndex >= timeline.length - 1) {
      setIsAutoPlaying(false);
      return;
    }
    const timer = globalThis.setTimeout(() => {
      setInteractiveWarning(null);
      setStepIndex((prev) => Math.min(timeline.length - 1, prev + 1));
      playMoveTapSound(false);
    }, 1350);
    return () => globalThis.clearTimeout(timer);
  }, [isAutoPlaying, practiceMode, stepIndex, timeline.length]);

  const formatMoveLabel = useCallback((ply: number, san: string): string => {
    const moveNumber = Math.ceil(ply / 2);
    const isWhite = ply % 2 === 1;
    return `${moveNumber}${isWhite ? '.' : '...'} ${san}`;
  }, []);

  const triggerCoachReply = useCallback(
    (targetFen: string, sessionId: number, currentPlyCount: number, eloTarget: number) => {
      clearCoachTimer();
      setIsCoachThinking(true);
      setShowCoachHintNote(false);

      contTimerRef.current = globalThis.setTimeout(async () => {
        if (contSessionRef.current !== sessionId) return;
        try {
          const depth = getDepthForElo(eloTarget);
          const preRes = await localStockfishEngine.analyze(
            targetFen,
            depth,
            3,
            eloTarget,
            false
          );
          if (contSessionRef.current !== sessionId) return;

          let chosenUci = preRes.bestMove;
          if (eloTarget <= 1000 && preRes.lines && preRes.lines.length >= 2) {
            if (Math.random() < 0.45 && preRes.lines[1]?.pvUci[0]) {
              chosenUci = preRes.lines[1].pvUci[0];
            }
          }

          if (!chosenUci || chosenUci === '(none)' || chosenUci.length < 4) {
            setContGameOverKey(resolveGameOverKey(contChessRef.current));
            setEvalResult(preRes);
            return;
          }

          const game = contChessRef.current;
          const from = chosenUci.slice(0, 2);
          const to = chosenUci.slice(2, 4);
          const promotion = chosenUci.length > 4 ? chosenUci[4] : undefined;
          const move = game.move({ from, to, promotion });
          if (!move) {
            setContGameOverKey(resolveGameOverKey(game));
            return;
          }

          const afterFen = game.fen();
          setContFen(afterFen);
          setContLastMove({ from: move.from, to: move.to });
          playMoveTapSound(Boolean(move.captured));

          const overKey = resolveGameOverKey(game);
          setContGameOverKey(overKey);

          let postRes: StockfishAnalysisResult | null = null;
          if (!overKey) {
            try {
              postRes = await localStockfishEngine.analyze(
                afterFen,
                Math.max(8, Math.min(11, depth)),
                2,
                eloTarget,
                false
              );
            } catch {
              postRes = null;
            }
          }
          if (contSessionRef.current !== sessionId) return;
          if (postRes) {
            setEvalResult(postRes);
          }

          const ply = currentPlyCount + 1;
          const explanation = buildWrittenMoveExplanation({
            language,
            move,
            isCoachMove: true,
            grade: 'coach',
            preEval: preRes,
            postEval: postRes ?? preRes,
            isCheck: game.isCheck(),
            isCheckmate: game.isCheckmate(),
            isStalemate: game.isStalemate(),
            isDraw: game.isDraw(),
          });

          const entry: OpeningGameMoveLogEntry = {
            id: `${sessionId}-${ply}-${move.san}`,
            ply,
            moveLabel: formatMoveLabel(ply, move.san),
            san: move.san,
            uci: `${move.from}${move.to}${move.promotion ?? ''}`,
            side: move.color,
            isCoachMove: true,
            grade: 'coach',
            evalLabel: (postRes ?? preRes).evaluationLabel,
            explanation,
            recommendedLine: (postRes ?? preRes).lines?.[0]?.pvSan?.slice(0, 4) ?? [],
          };
          setContLog((prev) => [entry, ...prev]);
        } catch {
          // keep playable on transient error
        } finally {
          if (contSessionRef.current === sessionId) {
            setIsCoachThinking(false);
          }
        }
      }, 260);
    },
    [clearCoachTimer, formatMoveLabel, language]
  );

  const startContinuationFromStep = useCallback(
    (startFen: string, startPly: number, preferred: 'w' | 'b', lastFrom?: string | null, lastTo?: string | null) => {
      unlockAudioContext();
      clearCoachTimer();
      const nextSession = ++contSessionRef.current;

      const freshGame = new Chess(startFen);
      contChessRef.current = freshGame;

      setIsAutoPlaying(false);
      setInteractiveWarning(null);
      setShowNextArrow(false);
      setShowCoachHintNote(false);
      setPracticeMode('continueGame');
      setContStartFen(startFen);
      setContStartPly(startPly);
      setContFen(startFen);
      setContLastMove(lastFrom && lastTo ? { from: lastFrom, to: lastTo } : null);
      setPlayerSide(preferred);
      setOrientation(preferred === 'b' ? 'black' : 'white');
      setContLog([]);
      setContGameOverKey(resolveGameOverKey(freshGame));
      setIsCoachThinking(false);

      if (!freshGame.isGameOver() && freshGame.turn() !== preferred) {
        triggerCoachReply(startFen, nextSession, startPly, coachElo);
      }
    },
    [clearCoachTimer, coachElo, triggerCoachReply]
  );

  const handleResetTheory = () => {
    setIsAutoPlaying(false);
    setInteractiveWarning(null);
    setStepIndex(0);
  };

  const handlePrevTheory = () => {
    setIsAutoPlaying(false);
    setInteractiveWarning(null);
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextTheory = () => {
    unlockAudioContext();
    setIsAutoPlaying(false);
    setInteractiveWarning(null);
    if (stepIndex < timeline.length - 1) {
      setStepIndex((prev) => prev + 1);
      playMoveTapSound(false);
    }
  };

  const handleTheoryMoveAttempt = (from: string, to: string, promotion?: string): boolean => {
    if (stepIndex >= timeline.length - 1 || !currentStep.nextExpected) return false;
    unlockAudioContext();
    setIsAutoPlaying(false);

    const chess = new Chess(currentStep.fen);
    let move;
    try {
      move = chess.move({ from, to, promotion });
    } catch {
      return false;
    }
    if (!move) return false;

    const expected = currentStep.nextExpected;
    if (
      move.san === expected.san ||
      (move.from === expected.from && move.to === expected.to)
    ) {
      setInteractiveWarning(null);
      setStepIndex((prev) => Math.min(timeline.length - 1, prev + 1));
      playMoveTapSound(Boolean(move.captured));
      return true;
    }

    setInteractiveWarning({
      playedSan: move.san,
      expectedSan: expected.san,
    });
    return false;
  };

  const handleContinuationMoveAttempt = (from: string, to: string, promotion?: string): boolean => {
    if (isCoachThinking || contGameOverKey) return false;
    const game = contChessRef.current;
    if (game.turn() !== playerSide) return false;

    unlockAudioContext();
    let move;
    try {
      move = game.move({ from, to, promotion });
    } catch {
      return false;
    }
    if (!move) return false;

    const sessionId = contSessionRef.current;
    const afterFen = game.fen();
    const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
    const moverSide = move.color;
    const ply = contStartPly + game.history().length;
    const isCheck = game.isCheck();
    const isCheckmate = game.isCheckmate();
    const isStalemate = game.isStalemate();
    const isDraw = game.isDraw();
    const overKey = resolveGameOverKey(game);
    const preEvalSnapshot = evalResult?.fen === contFen ? evalResult : null;

    setContFen(afterFen);
    setContLastMove({ from: move.from, to: move.to });
    setShowNextArrow(false);
    setShowCoachHintNote(false);
    playMoveTapSound(Boolean(move.captured));
    setContGameOverKey(overKey);

    void (async () => {
      let postEval: StockfishAnalysisResult | null = null;
      if (!overKey) {
        try {
          postEval = await localStockfishEngine.analyze(afterFen, 9, 2, coachElo, false);
        } catch {
          postEval = null;
        }
      }
      if (contSessionRef.current !== sessionId) return;
      if (postEval) {
        setEvalResult(postEval);
      }

      const grade = evaluateMoveGrade(moverSide, uci, preEvalSnapshot, postEval, false);
      const explanation = buildWrittenMoveExplanation({
        language,
        move,
        isCoachMove: false,
        grade,
        preEval: preEvalSnapshot,
        postEval: postEval ?? preEvalSnapshot,
        isCheck,
        isCheckmate,
        isStalemate,
        isDraw,
      });

      const entry: OpeningGameMoveLogEntry = {
        id: `${sessionId}-${ply}-${move.san}`,
        ply,
        moveLabel: formatMoveLabel(ply, move.san),
        san: move.san,
        uci,
        side: moverSide,
        isCoachMove: false,
        grade,
        evalLabel: (postEval ?? preEvalSnapshot)?.evaluationLabel ?? '0.00',
        explanation,
        recommendedLine: (postEval ?? preEvalSnapshot)?.lines?.[0]?.pvSan?.slice(0, 4) ?? [],
      };
      setContLog((prev) => [entry, ...prev]);

      if (!overKey) {
        triggerCoachReply(afterFen, sessionId, ply, coachElo);
      }
    })();

    return true;
  };

  const handleUndoContinuation = () => {
    clearCoachTimer();
    const nextSession = ++contSessionRef.current;
    void nextSession;
    setIsCoachThinking(false);
    setShowCoachHintNote(false);
    setShowNextArrow(false);

    const game = contChessRef.current;
    if (game.history().length === 0) return;

    let poppedCount = 0;
    const lastUndone = game.undo();
    if (lastUndone) poppedCount++;
    while (game.turn() !== playerSide && game.history().length > 0) {
      if (game.undo()) poppedCount++;
      else break;
    }

    setContFen(game.fen());
    setContLastMove(null);
    setContGameOverKey(resolveGameOverKey(game));
    if (poppedCount > 0) {
      setContLog((prev) => prev.slice(poppedCount));
    }
  };

  const handleSwitchPlayerSide = () => {
    const nextSide: 'w' | 'b' = playerSide === 'w' ? 'b' : 'w';
    setPlayerSide(nextSide);
    setOrientation(nextSide === 'b' ? 'black' : 'white');
    setShowCoachHintNote(false);
    setShowNextArrow(false);

    const game = contChessRef.current;
    if (!game.isGameOver() && game.turn() !== nextSide) {
      const nextSession = ++contSessionRef.current;
      const currentPly = contStartPly + game.history().length;
      triggerCoachReply(game.fen(), nextSession, currentPly, coachElo);
    }
  };

  const handleToggleHintInContinuation = () => {
    setShowNextArrow((v) => !v);
    setShowCoachHintNote((v) => !v);
  };

  const boardArrow = useMemo(() => {
    if (!showNextArrow) return null;
    if (practiceMode === 'theory') {
      if (!currentStep.nextExpected) return null;
      return {
        from: currentStep.nextExpected.from,
        to: currentStep.nextExpected.to,
        color: '#06B6D4',
      };
    }
    if (evalResult?.bestMove && evalResult.bestMove !== '(none)' && evalResult.bestMove.length >= 4) {
      return {
        from: evalResult.bestMove.slice(0, 2),
        to: evalResult.bestMove.slice(2, 4),
        color: '#10B981',
      };
    }
    return null;
  }, [currentStep.nextExpected, evalResult?.bestMove, practiceMode, showNextArrow]);

  const activeMoveLabel = useMemo(() => {
    if (stepIndex === 0 || !currentStep.san) return null;
    const moveNumber = Math.ceil(stepIndex / 2);
    const isWhiteMove = stepIndex % 2 === 1;
    return `${moveNumber}${isWhiteMove ? '.' : '...'} ${currentStep.san}`;
  }, [currentStep.san, stepIndex]);

  const currentNote = stepIndex > 0 ? openingCopy.moveNotes[stepIndex - 1] ?? '' : '';
  const latestContEntry = contLog[0] ?? null;
  const contTurn = contChessRef.current.turn();

  const resolvedContGameOverText = contGameOverKey
    ? getLocalizedGameOverReason(language, contGameOverKey)
    : null;

  return (
    <div className="space-y-3.5 sm:space-y-5 pt-2 border-t border-slate-400/35">
      {/* Header + Category Filter + Opening Dropdown & Selector */}
      <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-5 shadow-lg space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300 shrink-0" />
              <span>{t.openingsTitle}</span>
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-100">{t.openingsSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] sm:text-xs font-mono font-bold text-cyan-200 bg-cyan-500/20 border border-cyan-400/50 px-2.5 py-1 rounded-md">
              {t.openingsCountLabel(filteredOpenings.length)}
            </span>
            {practiceMode === 'theory' ? (
              <button
                type="button"
                onClick={() => {
                  const lastTheoryStep = timeline[timeline.length - 1] ?? currentStep;
                  const chosenStep = stepIndex > 0 ? currentStep : lastTheoryStep;
                  startContinuationFromStep(
                    chosenStep.fen,
                    chosenStep.ply,
                    activeOpening.preferredSide,
                    chosenStep.from,
                    chosenStep.to
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-sm transition-colors"
              >
                <Swords className="w-3.5 h-3.5 shrink-0" />
                <span>{cCopy.completeFromHereBtn}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  contSessionRef.current += 1;
                  clearCoachTimer();
                  setIsCoachThinking(false);
                  setPracticeMode('theory');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-cyan-400/50 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>{cCopy.backToTheoryBtn}</span>
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('all');
              setInteractiveWarning(null);
            }}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
              categoryFilter === 'all'
                ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
            }`}
          >
            {t.openingsCategoryAll} ({CHESS_OPENINGS.length})
          </button>

          {OPENING_CATEGORIES.map((cat) => {
            const count = CHESS_OPENINGS.filter((op) => op.category === cat).length;
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat);
                  const firstMatch = CHESS_OPENINGS.find((op) => op.category === cat);
                  if (firstMatch && activeOpening.category !== cat) {
                    selectOpening(firstMatch);
                  }
                }}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
                  active
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
                }`}
              >
                {t.openingsCategories[cat]} ({count})
              </button>
            );
          })}
        </div>

        {/* Opening Dropdown Selector + Quick Select Cards */}
        <div className="space-y-2.5 pt-2 border-t border-slate-400/35">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label
              htmlFor="chess-opening-select"
              className="text-xs sm:text-sm font-bold text-slate-100 shrink-0"
            >
              {t.openingsSelectLabel}
            </label>
            <select
              id="chess-opening-select"
              value={activeOpening.id}
              onChange={(e) => {
                const chosen = CHESS_OPENINGS.find((op) => op.id === e.target.value);
                if (chosen) selectOpening(chosen);
              }}
              className="w-full sm:max-w-md px-3 py-2 text-xs sm:text-sm font-bold rounded-lg bg-slate-950/70 text-white border border-slate-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              {filteredOpenings.map((op) => {
                const copy = op.localized[language] ?? op.localized.ar;
                return (
                  <option key={op.id} value={op.id} className="bg-slate-900 text-white">
                    [{op.eco}] {copy.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto pr-0.5">
            {filteredOpenings.map((op) => {
              const copy = op.localized[language] ?? op.localized.ar;
              const isSelected = op.id === activeOpening.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => selectOpening(op)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-md border transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/30 text-emerald-100 border-emerald-400 shadow-sm'
                      : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
                  }`}
                >
                  <span
                    className="font-mono text-[10px] px-1 py-0.5 rounded bg-slate-950/60 text-cyan-200 border border-slate-500/40"
                    dir="ltr"
                  >
                    {op.eco}
                  </span>
                  <span>{copy.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main 2-Column Learning & Game Completion Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-5 items-start">
        {/* Left: Second Interactive Board at the Bottom of Coach Section */}
        <div className="lg:col-span-6 border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-2.5 sm:p-4 shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="px-2 py-0.5 text-[10px] sm:text-xs font-mono font-bold rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shrink-0"
                dir="ltr"
              >
                {activeOpening.eco}
              </span>
              <span className="text-xs sm:text-sm font-bold text-white truncate">
                {openingCopy.name}
              </span>
            </div>

            {practiceMode === 'theory' ? (
              <span className="text-[11px] sm:text-xs font-mono font-semibold text-cyan-200">
                {t.openingsStepCounter(stepIndex, activeOpening.moves.length)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-emerald-200 bg-emerald-500/20 border border-emerald-400/50 px-2 py-0.5 rounded-md">
                {isCoachThinking ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>{cCopy.coachThinking}</span>
                  </>
                ) : (
                  <>
                    <Bot className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {cCopy.modeBadge} · {playerSide === 'w' ? cCopy.playingAsWhite : cCopy.playingAsBlack}
                    </span>
                  </>
                )}
              </span>
            )}
          </div>

          <TacticalBoard
            fen={activeBoardFen}
            orientation={orientation}
            lastMove={
              practiceMode === 'continueGame'
                ? contLastMove
                : currentStep.from && currentStep.to
                ? { from: currentStep.from, to: currentStep.to }
                : null
            }
            showHintArrow={false}
            bestMoveArrow={boardArrow}
            evaluationLabel={evalResult?.evaluationLabel ?? '0.00'}
            winProbabilityWhite={evalResult?.winProbabilityWhite ?? 50}
            showEvalBar={true}
            disabled={
              practiceMode === 'continueGame' &&
              (isCoachThinking || Boolean(contGameOverKey) || contTurn !== playerSide)
            }
            onMoveAttempt={(f, to, promo) =>
              practiceMode === 'continueGame'
                ? handleContinuationMoveAttempt(f, to, promo)
                : handleTheoryMoveAttempt(f, to, promo)
            }
          />

          {practiceMode === 'theory' ? (
            /* Theory Stepper Controls */
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={handleResetTheory}
                  disabled={stepIndex === 0}
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/45 transition-colors disabled:opacity-45"
                >
                  <SkipBack className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.openingsResetBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrevTheory}
                  disabled={stepIndex === 0}
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/45 transition-colors disabled:opacity-45"
                >
                  <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.openingsPrevBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={handleNextTheory}
                  disabled={stepIndex >= timeline.length - 1}
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 border border-cyan-300 transition-colors disabled:opacity-45"
                >
                  <span>{t.openingsNextBtn}</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    unlockAudioContext();
                    if (!isAutoPlaying && stepIndex >= timeline.length - 1) {
                      setStepIndex(0);
                    }
                    setIsAutoPlaying((v) => !v);
                  }}
                  aria-pressed={isAutoPlaying}
                  className={`inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
                    isAutoPlaying
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-900/35 hover:bg-slate-800/65 text-white border-slate-400/45'
                  }`}
                >
                  {isAutoPlaying ? (
                    <Pause className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Play className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{isAutoPlaying ? t.openingsPauseBtn : t.openingsAutoPlayBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowNextArrow((v) => !v)}
                  aria-pressed={showNextArrow}
                  className={`inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md border transition-colors ${
                    showNextArrow
                      ? 'bg-emerald-400 text-slate-950 border-emerald-300 shadow-sm'
                      : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 border-emerald-400/55'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.openingsArrowBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/35 hover:bg-slate-800/65 text-white border border-slate-400/45 transition-colors"
                >
                  <FlipVertical2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.openingsFlipBtn}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Continuation Mode Controls (Complete the Match vs Coach + Written Notes) */
            <div className="space-y-2.5 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-200">{cCopy.coachLevelLabel}:</span>
                <div className="flex flex-wrap items-center gap-1">
                  {COACH_ELO_LEVELS.map((eloVal) => (
                    <button
                      key={eloVal}
                      type="button"
                      onClick={() => setCoachElo(eloVal)}
                      className={`px-2 py-1 text-[11px] font-mono font-bold rounded border transition-colors ${
                        coachElo === eloVal
                          ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                          : 'bg-slate-900/50 text-slate-200 border-slate-500/50 hover:bg-slate-800'
                      }`}
                    >
                      {eloVal}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={handleUndoContinuation}
                  disabled={contLog.length === 0 || isCoachThinking}
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/45 hover:bg-slate-800 text-white border border-slate-400/50 transition-colors disabled:opacity-45"
                >
                  <Undo2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{cCopy.undoMoveBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleHintInContinuation}
                  disabled={Boolean(contGameOverKey) || isCoachThinking}
                  className={`inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md border transition-colors disabled:opacity-45 ${
                    showCoachHintNote
                      ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border-emerald-400/60'
                  }`}
                >
                  <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                  <span>{cCopy.hintExplainBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSwitchPlayerSide}
                  disabled={isCoachThinking || Boolean(contGameOverKey)}
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/45 hover:bg-slate-800 text-cyan-200 border border-slate-400/50 transition-colors disabled:opacity-45"
                >
                  <Swords className="w-3.5 h-3.5 shrink-0" />
                  <span>{cCopy.switchSideBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    startContinuationFromStep(
                      contStartFen,
                      contStartPly,
                      playerSide,
                      null,
                      null
                    )
                  }
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/45 hover:bg-slate-800 text-white border border-slate-400/50 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>{cCopy.restartGameBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}
                  className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-bold rounded-md bg-slate-900/45 hover:bg-slate-800 text-white border border-slate-400/50 transition-colors"
                >
                  <FlipVertical2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.openingsFlipBtn}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Written Move Explanation + Continuation Story + Strategic Plans */}
        <div className="lg:col-span-6 space-y-3.5 sm:space-y-4">
          {practiceMode === 'theory' ? (
            /* THEORY MODE WRITTEN EXPLANATION */
            <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
                <h3 className="text-xs sm:text-sm font-bold text-cyan-200">
                  {t.openingsMoveExplanationTitle}
                </h3>
                <span className="text-[11px] sm:text-xs font-semibold text-slate-200">
                  {t.turnPrefix}{' '}
                  <strong className="text-white">
                    {currentStep.turnAfter === 'w' ? t.whiteName : t.blackName}
                  </strong>
                </span>
              </div>

              {stepIndex === 0 ? (
                <div className="p-3 rounded-lg bg-slate-900/35 border border-slate-400/40 text-xs sm:text-sm text-white leading-relaxed">
                  {t.openingsStartHint}
                </div>
              ) : (
                <div className="p-3 sm:p-3.5 rounded-lg bg-emerald-500/15 border border-emerald-400/60 space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono text-xs sm:text-sm font-bold px-2 py-0.5 rounded bg-emerald-950/75 text-emerald-200 border border-emerald-400/45"
                      dir="ltr"
                    >
                      {activeMoveLabel}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">{currentNote}</p>
                </div>
              )}

              {interactiveWarning && (
                <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-400/60 text-xs sm:text-sm text-amber-100 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <span>
                    {t.openingsWrongInteractiveMove(
                      interactiveWarning.playedSan,
                      interactiveWarning.expectedSan
                    )}
                  </span>
                </div>
              )}

              {currentStep.nextExpected ? (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900/35 border border-slate-400/40 text-xs sm:text-sm">
                  <span className="text-cyan-200 font-semibold">
                    {t.openingsExpectedNextLabel(currentStep.nextExpected.san)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleNextTheory}
                      className="px-2.5 py-1 text-[11px] font-bold rounded bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors"
                    >
                      {t.openingsNextBtn}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-400/60 space-y-2.5">
                  <div className="text-xs sm:text-sm text-emerald-100 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                    <span>{t.openingsCompletedNote}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      startContinuationFromStep(
                        currentStep.fen,
                        currentStep.ply,
                        activeOpening.preferredSide,
                        currentStep.from,
                        currentStep.to
                      )
                    }
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs sm:text-sm font-bold rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-sm transition-colors"
                  >
                    <Swords className="w-4 h-4 shrink-0" />
                    <span>{cCopy.completeAfterTheoryBtn}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* CONTINUATION GAME WRITTEN EXPLANATION & LOG */
            <>
              <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
                  <h3 className="text-xs sm:text-sm font-bold text-cyan-200 flex items-center gap-1.5">
                    <MessageSquareText className="w-4 h-4 text-cyan-300 shrink-0" />
                    <span>{cCopy.liveCommentaryTitle}</span>
                  </h3>
                  <span className="text-[11px] sm:text-xs font-semibold text-slate-200">
                    {contGameOverKey ? cCopy.gameOverTitle : cCopy.yourTurn} ·{' '}
                    <strong className="text-white">
                      {contTurn === 'w' ? t.whiteName : t.blackName}
                    </strong>
                  </span>
                </div>

                {resolvedContGameOverText && (
                  <div className="p-3 rounded-lg bg-amber-500/20 border border-amber-400/65 space-y-2">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-amber-200">
                      <Crown className="w-4 h-4 text-amber-300 shrink-0" />
                      <span>{resolvedContGameOverText}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        startContinuationFromStep(
                          contStartFen,
                          contStartPly,
                          playerSide,
                          null,
                          null
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                      <span>{cCopy.playAgainBtn}</span>
                    </button>
                  </div>
                )}

                {showCoachHintNote && evalResult?.bestMoveSan && !contGameOverKey && (
                  <div className="p-3 rounded-lg bg-cyan-500/15 border border-cyan-400/55 space-y-1">
                    <div className="text-[11px] sm:text-xs font-bold text-cyan-200">
                      {cCopy.hintCommentaryTitle}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
                      {cCopy.hintCommentaryBody(
                        evalResult.bestMoveSan,
                        evalResult.lines?.[0]?.pvSan?.slice(0, 4).join(' ') ?? '',
                        evalResult.evaluationLabel
                      )}
                    </p>
                  </div>
                )}

                {latestContEntry ? (
                  <div className="p-3 sm:p-3.5 rounded-lg bg-slate-900/55 border border-slate-500/55 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono text-xs sm:text-sm font-bold px-2 py-0.5 rounded bg-slate-950 text-white border border-slate-500/60"
                          dir="ltr"
                        >
                          {latestContEntry.moveLabel}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded border ${gradeBadgeClasses(
                            latestContEntry.grade
                          )}`}
                        >
                          {cCopy.gradeLabels[latestContEntry.grade]}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-cyan-200" dir="ltr">
                        {latestContEntry.evalLabel}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
                      {latestContEntry.explanation}
                    </p>
                    {latestContEntry.recommendedLine.length > 0 && (
                      <div className="text-[11px] font-mono text-slate-300 pt-1 border-t border-slate-700/60" dir="ltr">
                        PV: {latestContEntry.recommendedLine.join(' ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-slate-900/35 border border-slate-400/40 text-xs sm:text-sm text-slate-100 leading-relaxed">
                    {cCopy.emptyCommentaryHint}
                  </div>
                )}
              </div>

              {/* Full Move-by-Move Written Continuation History */}
              <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white">
                  {cCopy.gameHistoryTitle}
                </h3>
                {contLog.length === 0 ? (
                  <p className="text-xs text-slate-300">{cCopy.emptyHistoryNote}</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-0.5">
                    {contLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-600/55 space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono text-xs font-bold text-white"
                              dir="ltr"
                            >
                              {entry.moveLabel}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${gradeBadgeClasses(
                                entry.grade
                              )}`}
                            >
                              {cCopy.gradeLabels[entry.grade]}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-cyan-200" dir="ltr">
                            {entry.evalLabel}
                          </span>
                        </div>
                        <p className="text-[11px] sm:text-xs text-slate-200 leading-relaxed">
                          {entry.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Written Strategic Idea + White & Black Plans */}
          <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-white">{t.openingsSummaryTitle}</h3>
            <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
              {openingCopy.summary}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-slate-900/35 border border-slate-400/40 space-y-1">
                <div className="text-[11px] sm:text-xs font-bold text-cyan-200">
                  {t.openingsWhitePlanLabel}
                </div>
                <p className="text-xs text-slate-100 leading-relaxed">{openingCopy.whitePlan}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/35 border border-slate-400/40 space-y-1">
                <div className="text-[11px] sm:text-xs font-bold text-emerald-200">
                  {t.openingsBlackPlanLabel}
                </div>
                <p className="text-xs text-slate-100 leading-relaxed">{openingCopy.blackPlan}</p>
              </div>
            </div>
          </div>

          {/* Interactive Move Sequence Chips (Theory Opening Sequence) */}
          <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-2.5">
            <h3 className="text-xs sm:text-sm font-bold text-slate-100">
              {t.openingsMovesTimelineTitle}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
              <button
                type="button"
                onClick={() => {
                  contSessionRef.current += 1;
                  clearCoachTimer();
                  setIsCoachThinking(false);
                  setPracticeMode('theory');
                  handleResetTheory();
                }}
                className={`px-2 py-1 text-[11px] sm:text-xs font-bold rounded border transition-colors ${
                  practiceMode === 'theory' && stepIndex === 0
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900/35 text-slate-200 border-slate-400/45 hover:bg-slate-800/65'
                }`}
              >
                0.
              </button>
              {activeOpening.moves.map((san, idx) => {
                const ply = idx + 1;
                const moveNumber = Math.ceil(ply / 2);
                const isWhiteMove = ply % 2 === 1;
                const isActive = practiceMode === 'theory' && stepIndex === ply;
                return (
                  <button
                    key={`${activeOpening.id}-${ply}`}
                    type="button"
                    onClick={() => {
                      contSessionRef.current += 1;
                      clearCoachTimer();
                      setIsCoachThinking(false);
                      setPracticeMode('theory');
                      setIsAutoPlaying(false);
                      setInteractiveWarning(null);
                      setStepIndex(ply);
                    }}
                    className={`px-2 py-1 text-[11px] sm:text-xs font-mono font-bold rounded border transition-colors ${
                      isActive
                        ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm'
                        : ply < stepIndex || practiceMode === 'continueGame'
                        ? 'bg-emerald-500/20 text-emerald-100 border-emerald-400/45 hover:bg-emerald-500/30'
                        : 'bg-slate-900/35 text-white border-slate-400/45 hover:bg-slate-800/65'
                    }`}
                  >
                    {isWhiteMove ? `${moveNumber}. ` : `${moveNumber}... `}
                    {san}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
