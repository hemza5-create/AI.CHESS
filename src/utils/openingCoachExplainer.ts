import type { Move } from 'chess.js';
import type { SupportedLanguage } from '../i18n/translations.ts';
import type { StockfishAnalysisResult } from '../types/chess.ts';

export type MoveQualityGrade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'coach';

export interface OpeningGameMoveLogEntry {
  id: string;
  ply: number;
  moveLabel: string;
  san: string;
  uci: string;
  side: 'w' | 'b';
  isCoachMove: boolean;
  grade: MoveQualityGrade;
  evalLabel: string;
  explanation: string;
  recommendedLine: string[];
}

const PIECE_NAMES: Record<SupportedLanguage, Record<'p' | 'n' | 'b' | 'r' | 'q' | 'k', string>> = {
  ar: {
    p: 'البيدق',
    n: 'الحصان',
    b: 'الفيل',
    r: 'القلعة',
    q: 'الوزير',
    k: 'الملك',
  },
  en: {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  },
  ru: {
    p: 'пешку',
    n: 'коня',
    b: 'слона',
    r: 'ладью',
    q: 'ферзя',
    k: 'короля',
  },
  zh: {
    p: '兵',
    n: '马',
    b: '象',
    r: '车',
    q: '后',
    k: '王',
  },
  fr: {
    p: 'pion',
    n: 'cavalier',
    b: 'fou',
    r: 'tour',
    q: 'dame',
    k: 'roi',
  },
};

function scoreToWhiteCp(
  evalRes: StockfishAnalysisResult | null | undefined
): number | null {
  if (!evalRes) return null;
  if (evalRes.scoreType === 'mate') {
    if (evalRes.scoreValue > 0) return 10000 - Math.min(90, Math.abs(evalRes.scoreValue)) * 10;
    if (evalRes.scoreValue < 0) return -10000 + Math.min(90, Math.abs(evalRes.scoreValue)) * 10;
    return 0;
  }
  return evalRes.scoreValue;
}

export function evaluateMoveGrade(
  moverSide: 'w' | 'b',
  playedUci: string,
  preEval: StockfishAnalysisResult | null,
  postEval: StockfishAnalysisResult | null,
  isCoachMove: boolean
): MoveQualityGrade {
  if (isCoachMove) return 'coach';
  if (preEval?.bestMove && playedUci === preEval.bestMove) {
    return 'best';
  }
  const preWhite = scoreToWhiteCp(preEval);
  const postWhite = scoreToWhiteCp(postEval);
  if (preWhite === null || postWhite === null) return 'good';

  const preMover = moverSide === 'w' ? preWhite : -preWhite;
  const postMover = moverSide === 'w' ? postWhite : -postWhite;
  const cpLoss = preMover - postMover;

  if (cpLoss <= 22) return 'best';
  if (cpLoss <= 75) return 'good';
  if (cpLoss <= 165) return 'inaccuracy';
  return 'mistake';
}

export interface BuildExplanationParams {
  language: SupportedLanguage;
  move: Move;
  isCoachMove: boolean;
  grade: MoveQualityGrade;
  preEval: StockfishAnalysisResult | null;
  postEval: StockfishAnalysisResult | null;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
}

export function buildWrittenMoveExplanation({
  language,
  move,
  isCoachMove,
  grade,
  preEval,
  postEval,
  isCheck,
  isCheckmate,
  isStalemate,
  isDraw,
}: BuildExplanationParams): string {
  const pieces = PIECE_NAMES[language] ?? PIECE_NAMES.ar;
  const pieceName = pieces[move.piece];
  const capturedName = move.captured ? pieces[move.captured] : null;
  const isKingsideCastle = move.flags.includes('k');
  const isQueensideCastle = move.flags.includes('q');
  const isCentralSquare = ['d4', 'd5', 'e4', 'e5'].includes(move.to);
  const isExtendedCenter = ['c4', 'c5', 'f4', 'f5', 'c3', 'c6', 'f3', 'f6'].includes(move.to);
  const isDevelopment =
    (move.piece === 'n' || move.piece === 'b') &&
    (move.from.endsWith('1') || move.from.endsWith('8'));
  const isRookActivation =
    move.piece === 'r' && ['c', 'd', 'e', 'f'].includes(move.to[0] ?? '');

  const betterAlt =
    !isCoachMove &&
    (grade === 'inaccuracy' || grade === 'mistake') &&
    preEval?.bestMoveSan &&
    preEval.bestMoveSan !== move.san
      ? preEval.bestMoveSan
      : null;

  const nextPlan = postEval?.bestMoveSan ?? postEval?.lines?.[0]?.pvSan?.[0] ?? null;
  const evalStr = postEval?.evaluationLabel ?? '0.00';

  if (language === 'ar') {
    const parts: string[] = [];

    if (isCheckmate) {
      parts.push(`كش مات حاسمة بالنقلة ${move.san} تنهي المباراة فوراً.`);
      return parts.join(' ');
    }

    if (isStalemate || isDraw) {
      parts.push(`النقلة ${move.san} تقود الوضعية إلى التعادل وانتهاء المباراة.`);
      return parts.join(' ');
    }

    if (isCoachMove) {
      parts.push(`يردّ المدرب بنقلة ${move.san}`);
    } else if (grade === 'best') {
      parts.push(`نقلة ممتازة ومطابقة لأقوى خيار لدى المحرك (${move.san})`);
    } else if (grade === 'good') {
      parts.push(`نقلة جيدة ومتماسكة (${move.san})`);
    } else if (grade === 'inaccuracy') {
      parts.push(`عدم دقة طفيف (${move.san})`);
    } else {
      parts.push(`خطأ تكتيكي يفقد جزءاً من الأفضلية (${move.san})`);
    }

    if (isKingsideCastle) {
      parts.push('لتأمين الملك بالتبييت القصير وإدخال القلعة نحو الوسط.');
    } else if (isQueensideCastle) {
      parts.push('للتبييت الطويل ووضع القلعة مباشرة على عمود الوسط d.');
    } else if (capturedName) {
      parts.push(`مع أخذ ${capturedName} على مربع ${move.to} وتغيير التوازن المادي.`);
    } else if (move.promotion) {
      parts.push(`مع ترقية البيدق على ${move.to} لتعزيز القوة الهجومية.`);
    } else if (isDevelopment) {
      parts.push(`لتطوير ${pieceName} إلى مربع ${move.to} والرفع من نشاط القطع.`);
    } else if (isRookActivation) {
      parts.push(`لتفعيل القلعة على عمود ${move.to[0]} المفتوح أو شبه المفتوح.`);
    } else if (isCentralSquare) {
      parts.push(`للسيطرة المباشرة على قلب الرقعة في مربع ${move.to}.`);
    } else if (isExtendedCenter) {
      parts.push(`لدعم المربعات المركزية وتضييق مساحة الخصم عبر ${move.to}.`);
    } else {
      parts.push(`بتحريك ${pieceName} نحو مربع ${move.to}.`);
    }

    if (isCheck) {
      parts.push('النقلة تفرض كشاً مباشراً على ملك الخصم وتكسب سرعة إضافية (Tempo).');
    }

    if (betterAlt) {
      parts.push(`كان الخيار الأدق في هذا الموقف هو ${betterAlt}.`);
    }

    if (nextPlan) {
      parts.push(`التكملة المقترحة تالياً: ${nextPlan} (التقييم الحالي: ${evalStr}).`);
    } else {
      parts.push(`(التقييم الحالي: ${evalStr}).`);
    }

    return parts.join(' ');
  }

  if (language === 'fr') {
    const parts: string[] = [];
    if (isCheckmate) return `Échec et mat décisif avec ${move.san} !`;
    if (isStalemate || isDraw) return `${move.san} mène à la nulle et clôt la partie.`;

    if (isCoachMove) parts.push(`Le coach répond par ${move.san}`);
    else if (grade === 'best') parts.push(`Excellent coup (${move.san}), choix optimal`);
    else if (grade === 'good') parts.push(`Bon coup solide (${move.san})`);
    else if (grade === 'inaccuracy') parts.push(`Légère imprécision (${move.san})`);
    else parts.push(`Erreur tactique (${move.san})`);

    if (isKingsideCastle) parts.push('pour mettre le roi à l’abri et activer la tour.');
    else if (isQueensideCastle) parts.push('avec grand roque et pression sur la colonne d.');
    else if (capturedName) parts.push(`en capturant ${capturedName} sur ${move.to}.`);
    else if (isDevelopment) parts.push(`en développant ${pieceName} vers ${move.to}.`);
    else if (isCentralSquare) parts.push(`pour contrôler le centre sur ${move.to}.`);
    else parts.push(`en jouant ${pieceName} en ${move.to}.`);

    if (isCheck) parts.push('Cela donne échec et gagne un temps.');
    if (betterAlt) parts.push(`Le coup le plus précis était ${betterAlt}.`);
    if (nextPlan) parts.push(`Suite conseillée : ${nextPlan} (Éval : ${evalStr}).`);
    return parts.join(' ');
  }

  if (language === 'ru') {
    const parts: string[] = [];
    if (isCheckmate) return `Решающий мат ходом ${move.san}!`;
    if (isStalemate || isDraw) return `Ход ${move.san} приводит к ничьей.`;

    if (isCoachMove) parts.push(`Тренер отвечает ходом ${move.san}`);
    else if (grade === 'best') parts.push(`Отличный ход (${move.san}) — лучший выбор`);
    else if (grade === 'good') parts.push(`Хороший, крепкий ход (${move.san})`);
    else if (grade === 'inaccuracy') parts.push(`Небольшая неточность (${move.san})`);
    else parts.push(`Ошибка (${move.san}), теряющая преимущество`);

    if (isKingsideCastle) parts.push('для безопасности короля и ввода ладьи.');
    else if (isQueensideCastle) parts.push('с длинной рокировкой и давлением по линии d.');
    else if (capturedName) parts.push(`со взятием фигуры (${capturedName}) на ${move.to}.`);
    else if (isDevelopment) parts.push(`с развитием фигуры на ${move.to}.`);
    else if (isCentralSquare) parts.push(`с захватом центра на ${move.to}.`);
    else parts.push(`с переводом фигуры на ${move.to}.`);

    if (isCheck) parts.push('Объявлен шах королю соперника.');
    if (betterAlt) parts.push(`Сильнее было сыграть ${betterAlt}.`);
    if (nextPlan) parts.push(`Рекомендуемое продолжение: ${nextPlan} (Оценка: ${evalStr}).`);
    return parts.join(' ');
  }

  if (language === 'zh') {
    const parts: string[] = [];
    if (isCheckmate) return `决定性将杀！${move.san} 结束对局。`;
    if (isStalemate || isDraw) return `${move.san} 导致和棋结束。`;

    if (isCoachMove) parts.push(`教练回应 ${move.san}`);
    else if (grade === 'best') parts.push(`绝佳着法 ${move.san}（引擎首选）`);
    else if (grade === 'good') parts.push(`稳健着法 ${move.san}`);
    else if (grade === 'inaccuracy') parts.push(`略显不精确 ${move.san}`);
    else parts.push(`失误着法 ${move.san}`);

    if (isKingsideCastle) parts.push('完成短易位保护王并激活车。');
    else if (isQueensideCastle) parts.push('完成长易位并将车置于中心d线。');
    else if (capturedName) parts.push(`在 ${move.to} 吃掉对方${capturedName}。`);
    else if (isDevelopment) parts.push(`将${pieceName}出动至 ${move.to}。`);
    else if (isCentralSquare) parts.push(`巩固对中心格 ${move.to} 的控制。`);
    else parts.push(`将${pieceName}调往 ${move.to}。`);

    if (isCheck) parts.push('同时将军对手以争取先手。');
    if (betterAlt) parts.push(`更精确的选择是 ${betterAlt}。`);
    if (nextPlan) parts.push(`建议后续：${nextPlan}（当前评估：${evalStr}）。`);
    return parts.join(' ');
  }

  // English fallback
  const parts: string[] = [];
  if (isCheckmate) return `Decisive checkmate with ${move.san}! Game over.`;
  if (isStalemate || isDraw) return `${move.san} ends the game in a draw.`;

  if (isCoachMove) parts.push(`Coach plays ${move.san}`);
  else if (grade === 'best') parts.push(`Excellent move (${move.san}), matching the top engine choice`);
  else if (grade === 'good') parts.push(`Solid move (${move.san})`);
  else if (grade === 'inaccuracy') parts.push(`Slight inaccuracy (${move.san})`);
  else parts.push(`Tactical mistake (${move.san})`);

  if (isKingsideCastle) parts.push('to safeguard the king with kingside castling and activate the rook.');
  else if (isQueensideCastle) parts.push('to castle queenside and place the rook on the d-file.');
  else if (capturedName) parts.push(`capturing the ${capturedName} on ${move.to}.`);
  else if (move.promotion) parts.push(`promoting on ${move.to}.`);
  else if (isDevelopment) parts.push(`developing the ${pieceName} toward ${move.to}.`);
  else if (isRookActivation) parts.push(`activating the rook along the ${move.to[0]}-file.`);
  else if (isCentralSquare) parts.push(`fighting directly for central square ${move.to}.`);
  else parts.push(`repositioning the ${pieceName} to ${move.to}.`);

  if (isCheck) parts.push('This delivers check and gains a tempo.');
  if (betterAlt) parts.push(`More accurate was ${betterAlt}.`);
  if (nextPlan) parts.push(`Suggested continuation: ${nextPlan} (Eval: ${evalStr}).`);
  else parts.push(`(Eval: ${evalStr}).`);

  return parts.join(' ');
}
