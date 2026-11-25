import type { TtsVoiceName } from '../types/chess.ts';

export type SupportedLanguage = 'ar' | 'en' | 'ru' | 'zh' | 'fr';

export interface LanguageMeta {
  code: SupportedLanguage;
  nativeName: string;
  shortCode: string;
  dir: 'rtl' | 'ltr';
  locale: string;
  aiLanguageName: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  {
    code: 'ar',
    nativeName: 'العربية',
    shortCode: 'AR',
    dir: 'rtl',
    locale: 'ar-EG',
    aiLanguageName: 'Arabic',
  },
  {
    code: 'en',
    nativeName: 'English',
    shortCode: 'EN',
    dir: 'ltr',
    locale: 'en-US',
    aiLanguageName: 'English',
  },
  {
    code: 'ru',
    nativeName: 'Русский',
    shortCode: 'RU',
    dir: 'ltr',
    locale: 'ru-RU',
    aiLanguageName: 'Russian',
  },
  {
    code: 'zh',
    nativeName: '中文',
    shortCode: 'ZH',
    dir: 'ltr',
    locale: 'zh-CN',
    aiLanguageName: 'Simplified Chinese',
  },
  {
    code: 'fr',
    nativeName: 'Français',
    shortCode: 'FR',
    dir: 'ltr',
    locale: 'fr-FR',
    aiLanguageName: 'French',
  },
];

export function getLanguageMeta(code: SupportedLanguage): LanguageMeta {
  return SUPPORTED_LANGUAGES.find((item) => item.code === code) ?? SUPPORTED_LANGUAGES[0];
}

export interface TranslationDictionary {
  appTitle: string;
  brandName: string;
  brandLogoAlt: string;
  navVision: string;
  navBoard: string;
  navProfiler: string;
  navReference: string;
  startMonitoring: string;
  stopMonitoring: string;
  heroTitle: string;
  heroSubtitleBefore: string;
  heroSubtitleAfter: string;
  streamStatusLabel: string;
  streamActive: string;
  streamPaused: string;
  depthLabel: string;
  clearCache: string;
  clearingCache: string;
  clearCacheTooltip: string;
  cacheClearedCount: (count: number) => string;
  cacheClearedSuccess: string;
  offlineBanner: string;

  // Language switcher
  languageLabel: string;
  switchLanguageAria: string;

  // PWA install
  pwaInstallButton: string;
  pwaIosTitle: string;
  pwaAndroidTitle: string;
  pwaClose: string;
  pwaIosSteps: [string, string, string];
  pwaAndroidSteps: [string, string, string];
  pwaCopyLink: string;
  pwaCopiedLink: string;

  // LiveVisionStage
  sourceVirtual: string;
  sourceCamera: string;
  sourceImage: string;
  startCapture: string;
  stopCapture: string;
  viewOriginal: string;
  viewGrayscale: string;
  viewCanny: string;
  viewHeatmap: string;
  scanAiBtn: string;
  scanningAiBtn: string;
  scanAiTooltip: string;
  detectionSoundBtn: string;
  detectionSoundTooltip: string;
  calibrateBaselineBtn: string;
  calibrateBaselineTooltip: string;
  resetRoiBtn: string;
  resetRoiTooltip: string;
  roiGuideBefore: string;
  roiGuideAfter: string;
  retryBtn: string;
  cameraPausedMsg: string;
  uploadedImageAlt: string;
  cornerHandlePrefix: string;
  cornerLabels: [string, string, string, string];
  waitingForFrame: string;
  activeDetection: string;
  pausedLabel: string;
  capturePreviewBestMoveBtn: string;
  capturingPreviewBestMoveBtn: string;
  autoPlacePiecesBtn: string;
  autoPlacePiecesTooltip: string;
  autoPlaceActiveStatus: string;
  visionApiEndpointBtn: string;
  visionApiEndpointLabel: string;
  visionApiPlaceholder: string;
  saveEndpointBtn: string;
  activeEndpointLabel: string;
  opponentMoveOnlyBtn: string;
  opponentMoveOnlyTooltip: string;
  yourZoneLabel: string;
  whiteSideBtn: string;
  blackFlippedBtn: string;
  blackPerspectiveHint: string;
  whitePerspectiveHint: string;
  capturedPreviewAlt: string;
  capturedPreviewTitle: (time: string) => string;
  closePreviewAria: string;
  previewBlackFlipped: string;
  previewWhiteBottom: string;
  opponentMoveLabel: string;
  generatingUciReply: string;
  bestReplyUciLabel: string;
  applyMoveBtn: string;
  positionReadyLabel: string;
  virtualScenarioLabel: string;
  presetNames: Record<string, string>;
  lightingNoiseBtn: string;
  resetStreamBtn: string;
  stepVirtualMoveBtn: (step: number, total: number) => string;

  // DigitalBoard
  syncBoardTitle: string;
  turnPrefix: string;
  toggleTurnTooltip: string;
  whiteName: string;
  blackName: string;
  arrowBtn: string;
  arrowTooltip: string;
  flipBtn: string;
  flipTooltip: string;
  undoBtn: string;
  undoTooltip: string;
  resetBtn: string;
  resetTooltip: string;
  evalBarAria: (label: string) => string;
  squareAria: (sq: string) => string;
  analyzingStockfish: string;
  stockfishRecommendation: string;
  activeFenMatrix: string;
  editFenTooltip: string;
  fenPlaceholder: string;
  applyFenBtn: string;
  invalidFenError: string;

  // AnalysisAndVoicePanel
  engineTitle: string;
  depthShort: string;
  autoEloBtn: string;
  depthSliderLabel: string;
  engineRemoteConnected: string;
  engineOfflineLocal: string;
  engineLocalAsm: string;
  engineLocalWasm: string;
  stockfishWebsiteBtn: string;
  verifyLocalEngineBtn: string;
  verifyingLocalEngineBtn: string;
  localEngineVerifiedOk: (backend: string, bestMove: string, latencyMs: number) => string;
  localEngineVerifyFailed: (error: string) => string;
  externalVisionConnectedBadge: string;
  checkingServer: string;
  checkServer: string;
  checkServerTooltip: string;
  hideUrl: string;
  externalServerBtn: string;
  serverUrlPlaceholder: string;
  saveAndConnect: string;
  defaultServerBtn: string;
  serverHelpText: string;
  evaluationLabel: string;
  bestMoveLabel: string;
  applyBestMoveTooltip: string;
  searchSpeedLabel: string;
  topLinesTitle: string;
  applyLineBtn: string;
  emptyAnalysisHint: string;
  uciLogTitle: string;
  voiceCoachTitle: string;
  voiceCoachStoppedHint: string;
  autoSpeakBtn: string;
  voiceSelectAria: string;
  voiceLabels: Record<TtsVoiceName, string>;
  powerOff: string;
  powerOn: string;
  generatingExplanation: string;
  voiceCoachEmptyText: string;
  explainAndSpeakBtn: string;
  synthesizingAudioBtn: string;
  stopAudioBtn: string;
  replayAudioBtn: string;
  moveLogTitle: string;
  moveCount: (count: number) => string;
  emptyMoveLog: string;
  sourceTagVision: string;
  sourceTagVirtual: string;
  sourceTagManual: string;

  // ResourceTradeoffConsole
  profilerTitle: string;
  pressureOverBudget: string;
  pressureMedium: string;
  pressureStable: string;
  scanResolutionLabel: string;
  targetFpsLabel: string;
  cannyThresholdLabel: string;
  motionSensitivityLabel: string;
  gaussianBlurLabel: string;
  playerEloLabel: string;
  eloSliderAria: string;
  eloPresets: { elo: number; label: string }[];
  autoDepthByEloLabel: string;
  frameTimeVsBudgetLabel: string;
  budgetSvgText: (ms: string) => string;
  stageCapture: string;
  stageBlur: string;
  stageCanny: string;
  stageMatrix: string;
  matrixDiffTitle: string;

  // Architecture & Python Reference
  archTitle: string;
  downloadZipBtn: string;
  copyPythonBtn: string;
  copiedBtn: string;
  archStep1Title: string;
  archStep1DescBefore: string;
  archStep1DescMid: string;
  archStep1DescAfter: string;
  archStep2Title: string;
  archStep2DescBefore: string;
  archStep2DescAfter: string;
  archStep3Title: string;
  archStep3DescBefore: string;
  archStep3DescMid1: string;
  archStep3DescMid2: string;
  archStep3DescAfter: string;
  pythonSnippet: string;

  // Runtime messages & errors
  emptyServerResponse: (fallback: string, status: number) => string;
  cloudFeatureRequiresServer: string;
  invalidServerJson: (status: number) => string;
  audioPlayError: string;
  voiceCloudRequired: string;
  voiceExplainFailed: string;
  voiceTtsFailed: string;
  voiceGenericError: string;
  stockfishAnalyzeFailed: string;
  stockfishStartFailed: string;
  cameraUnsupported: string;
  cameraDenied: string;
  cameraNotFound: string;
  cameraInUse: string;
  cameraAccessFailed: string;
  detectedMoveStatus: (san: string, uci: string, confidence: number) => string;
  noActiveFrameError: string;
  roiCaptureError: string;
  aiScanCloudRequired: string;
  aiScanReadFailed: string;
  illegalBoardPosition: string;
  perspectiveBlackFlipped: string;
  perspectiveWhiteBottom: string;
  scanReadSummary: (
    perspective: string,
    opponentSan: string | null,
    turnName: string
  ) => string;
  aiScanGenericFailed: string;
  baselineCalibratedStatus: string;

  // Workspace Tabs
  tabAnalyzer: string;
  tabCoach: string;
  tabPuzzles: string;

  // Interactive Coach
  coachTitle: string;
  coachSubtitle: string;
  coachAllTactics: string;
  coachTactics: Record<'fork' | 'pin' | 'discovered' | 'mateIn1' | 'backRank', string>;
  coachHintBtn: string;
  coachPlayBestBtn: string;
  coachResetBtn: string;
  coachFlipBtn: string;
  coachGoalLabel: string;
  coachFeedbackTitle: string;
  coachEvalTitle: string;
  coachStatusReady: string;
  coachStatusCorrect: string;
  coachStatusWrong: string;
  coachStatusSolvedByCoach: string;
  coachPlayedMoveLabel: (san: string) => string;
  coachBetterMoveLabel: (san: string) => string;
  coachNextDrillBtn: string;
  coachDrillProgress: (index: number, total: number) => string;
  coachAnalyzingEval: string;
  coachStockfishBestLabel: string;
  coachWrongEvalNote: (playedSan: string, bestSan: string, evalAfter: string) => string;

  // 1,000 Chess Puzzles
  puzzlesTitle: string;
  puzzlesSubtitle: string;
  puzzlesSolvedCountLabel: (solved: number, total: number) => string;
  puzzlesSolvedBadge: string;
  puzzlesDifficultyAll: string;
  puzzlesDifficultyLabels: Record<'beginner' | 'intermediate' | 'advanced', string>;
  puzzlesThemeLabels: Record<
    'mateIn1' | 'backRank' | 'fork' | 'pin' | 'discovered' | 'skewer' | 'sacrifice' | 'mateIn2' | 'deflection',
    string
  >;
  puzzlesPrevBtn: string;
  puzzlesNextBtn: string;
  puzzlesRandomBtn: string;
  puzzlesJumpPlaceholder: string;
  puzzlesJumpBtn: string;
  puzzlesHintBtn: string;
  puzzlesResetBtn: string;
  puzzlesFlipBtn: string;
  puzzlesNumberLabel: (id: number, total: number) => string;
  puzzlesRatingLabel: (rating: number) => string;
  puzzlesTurnWhite: string;
  puzzlesTurnBlack: string;
  puzzlesStatusPrompt: string;
  puzzlesStatusOpponentReply: string;
  puzzlesStatusCorrectContinue: string;
  puzzlesStatusSolved: string;
  puzzlesStatusWrong: string;
  puzzlesHintActiveLabel: (from: string, to: string) => string;

  // Coach Play vs Stockfish
  coachModeTactics: string;
  coachModePlayAi: string;
  playAiTitle: string;
  playAiSubtitle: string;
  playAiDifficultyLabel: string;
  playAiLevels: Record<'weak' | 'beginner' | 'intermediate' | 'advanced' | 'master', string>;
  playAiLevelSubtitles: Record<'weak' | 'beginner' | 'intermediate' | 'advanced' | 'master', string>;
  playAiSideLabel: string;
  playAiNewBoardBtn: string;
  playAiUndoBtn: string;
  coachBestArrowBtn: string;
  playAiYourTurn: (sideName: string) => string;
  playAiThinking: string;
  playAiGameOverLabel: string;
  playAiPlayAgainBtn: string;
  playAiMovesTitle: string;
  playAiEmptyMoves: string;
  playAiCoachTipTitle: string;
  playAiHintMessage: (san: string, from: string, to: string) => string;
  playAiDefaultTip: string;
  playAiLastAiMove: (san: string) => string;
}

export const TRANSLATIONS: Record<SupportedLanguage, TranslationDictionary> = {
  ar: {
    appTitle: 'رَصْد الشطرنج — الرؤية الحاسوبية ومحرك Stockfish',
    brandName: 'رَصْد الشطرنج',
    brandLogoAlt: 'شعار رَصْد الشطرنج',
    navVision: 'البث والرصد البصري',
    navBoard: 'الرقعة وتحليل UCI',
    navProfiler: 'مقايضة الموارد',
    navReference: 'مرجع OpenCV و Python',
    startMonitoring: 'تشغيل المراقبة الحية',
    stopMonitoring: 'إيقاف المراقبة الحية',
    heroTitle: 'رصد رقعة الشطرنج بالرؤية الحاسوبية ومحرك Stockfish عبر UCI',
    heroSubtitleBefore:
      'التقط الرقعة من الكاميرا أو البث التفاعلي أو ارفع صورة، وعاين معالجة الحواف واستخراج مصفوفة ',
    heroSubtitleAfter: '، مع تحليل Stockfish 19 الفوري والشرح الصوتي بالذكاء الاصطناعي.',
    streamStatusLabel: 'حالة البث:',
    streamActive: '● رصد نشط',
    streamPaused: 'متوقف',
    depthLabel: 'Depth',
    clearCache: 'مسح الذاكرة المؤقتة',
    clearingCache: 'جاري المسح...',
    clearCacheTooltip: 'مسح ذاكرة التخزين المؤقتة للتطبيق وبيانات Service Worker والمحرك',
    cacheClearedCount: (count) => `تم مسح الذاكرة المؤقتة (${count})`,
    cacheClearedSuccess: 'تم مسح الذاكرة المؤقتة بنجاح',
    offlineBanner: 'وضع عدم الاتصال — يعمل محرك Stockfish محلياً عبر WebAssembly',

    languageLabel: 'اللغة',
    switchLanguageAria: 'تغيير لغة الواجهة',

    pwaInstallButton: 'تثبيت كتطبيق أندرويد',
    pwaIosTitle: 'تثبيت التطبيق على iPhone / iPad',
    pwaAndroidTitle: 'تثبيت التطبيق مباشرة على أندرويد (PWA)',
    pwaClose: 'إغلاق',
    pwaIosSteps: [
      'افتح الرابط في متصفح Safari على جهازك.',
      'اضغط على زر المشاركة (Share) في شريط المتصفح.',
      'اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).',
    ],
    pwaAndroidSteps: [
      'افتح الرابط المباشر للتطبيق في متصفح Chrome على هاتف أندرويد.',
      'اضغط على قائمة المتصفح (⋮) في الأعلى ثم اختر «تثبيت التطبيق» (Install app).',
      'سيُثبّت «رَصْد الشطرنج» كتطبيق مستقل بأيقونة على الشاشة الرئيسية مع وصول كامل للكاميرا.',
    ],
    pwaCopyLink: 'نسخ الرابط',
    pwaCopiedLink: 'تم النسخ',

    sourceVirtual: 'بث تفاعلي',
    sourceCamera: 'الكاميرا',
    sourceImage: 'رفع صورة',
    startCapture: 'بدء الالتقاط',
    stopCapture: 'إيقاف الالتقاط',
    viewOriginal: 'البث الأصلي + ROI',
    viewGrayscale: 'تدرج رمادي (Blur)',
    viewCanny: 'حواف Canny',
    viewHeatmap: 'فروقات المربعات 8×8',
    scanAiBtn: 'مسح الوضعية (AI)',
    scanningAiBtn: 'جاري القراءة...',
    scanAiTooltip: 'قراءة وضعية القطع الحالية من الإطار المحدد ومزامنة الرقعة الرقمية فوراً',
    detectionSoundBtn: 'صوت الرصد',
    detectionSoundTooltip: 'تفعيل أو كتم صوت التكة عند اكتشاف حركة قطعة',
    calibrateBaselineBtn: 'معايرة المرجع',
    calibrateBaselineTooltip: 'حفظ الإطار الحالي كمرجع لرصد النقلات القادمة',
    resetRoiBtn: 'ضبط ROI',
    resetRoiTooltip: 'إعادة ضبط زوايا الرقعة الأربع',
    roiGuideBefore: 'اسحب النقاط السماوية الأربع على حدود مربعات الرقعة الـ 8×8، وإذا كانت المباراة جارية بالفعل اضغط',
    roiGuideAfter: 'لقراءة القطع ومزامنة أفضل نقلة فوراً.',
    retryBtn: 'إعادة المحاولة',
    cameraPausedMsg: 'بث الكاميرا متوقف حالياً',
    uploadedImageAlt: 'صورة الرقعة المرفوعة',
    cornerHandlePrefix: 'مقبض زاوية',
    cornerLabels: ['أعلى يسار', 'أعلى يمين', 'أسفل يمين', 'أسفل يسار'],
    waitingForFrame: 'بانتظار الإطار',
    activeDetection: 'رصد نشط',
    pausedLabel: 'متوقف',
    capturePreviewBestMoveBtn: 'التقاط صورة للمعاينة واستخراج أفضل نقلة',
    capturingPreviewBestMoveBtn: 'جاري التقاط المصفوفة واستخراج أفضل نقلة...',
    autoPlacePiecesBtn: 'تعيين القطع تلقائياً',
    autoPlacePiecesTooltip:
      'إرسال لقطات الرقعة تلقائياً إلى نقطة نهاية API الخارجية لتحليلها وتعيين القطع على الرقعة المتزامنة',
    autoPlaceActiveStatus: 'المزامنة التلقائية عبر API نشطة',
    visionApiEndpointBtn: 'رابط API اللقطات',
    visionApiEndpointLabel: 'نقطة نهاية API لتحليل لقطات الرقعة:',
    visionApiPlaceholder: 'https://your-server.com/api/board-fen',
    saveEndpointBtn: 'حفظ المسار',
    activeEndpointLabel: 'المسار النشط:',
    opponentMoveOnlyBtn: 'نقلة الخصم حصراً',
    opponentMoveOnlyTooltip:
      'تجاهل الحركات العشوائية وحصر التحليل بنقلة الخصم لتوليد الرد الأمثل عبر UCI',
    yourZoneLabel: 'منطقتك (النصف السفلي):',
    whiteSideBtn: 'الأبيض',
    blackFlippedBtn: 'الأسود (قلب المصفوفة)',
    blackPerspectiveHint: 'تُقلب مصفوفة 8×8 برمجياً لتحليل الموقف من منظور الأسود',
    whitePerspectiveHint: 'النصف السفلي للأبيض · تحليل مباشر عبر UCI',
    capturedPreviewAlt: 'معاينة الصورة الملتقطة للرقعة',
    capturedPreviewTitle: (time) => `معاينة الصورة الملتقطة (${time})`,
    closePreviewAria: 'إغلاق المعاينة',
    previewBlackFlipped: 'الأسود (النصف السفلي · مَقلوب 180°)',
    previewWhiteBottom: 'الأبيض (النصف السفلي)',
    opponentMoveLabel: 'نقلة الخصم:',
    generatingUciReply: 'جاري توليد الرد الأمثل عبر UCI...',
    bestReplyUciLabel: 'أفضل رد (UCI):',
    applyMoveBtn: 'تطبيق النقلة',
    positionReadyLabel: 'الموقف جاهز على الرقعة الرقمية',
    virtualScenarioLabel: 'سيناريو البث:',
    presetNames: {
      italian: 'الافتتاح الإيطالي (Giuoco Piano)',
      sicilian: 'الدفاع الصقلي (نايدورف)',
      queens_gambit: 'مناورة الوزير (Queen’s Gambit)',
    },
    lightingNoiseBtn: 'تشويش إضاءة الكاميرا',
    resetStreamBtn: 'تصفير البث',
    stepVirtualMoveBtn: (step, total) => `تنفيذ نقلة في البث (${step}/${total})`,

    syncBoardTitle: 'الرقعة المتزامنة',
    turnPrefix: 'الدور:',
    toggleTurnTooltip: 'اضغط لتبديل الدور الحالي بين الأبيض والأسود',
    whiteName: 'الأبيض',
    blackName: 'الأسود',
    arrowBtn: 'السهم',
    arrowTooltip: 'إظهار أو إخفاء سهم أفضل نقلة من Stockfish',
    flipBtn: 'عكس',
    flipTooltip: 'عكس اتجاه الرقعة',
    undoBtn: 'تراجع',
    undoTooltip: 'تراجع عن آخر نقلة',
    resetBtn: 'إعادة',
    resetTooltip: 'إعادة ضبط الوضعية الابتدائية',
    evalBarAria: (label) => `شريط تقييم Stockfish: ${label}`,
    squareAria: (sq) => `مربع ${sq}`,
    analyzingStockfish: 'جاري تحليل Stockfish...',
    stockfishRecommendation: 'توصية Stockfish:',
    activeFenMatrix: 'مصفوفة FEN النشطة',
    editFenTooltip: 'تعديل أو لصق وضعية FEN يدوياً',
    fenPlaceholder: 'ألصق نص FEN هنا...',
    applyFenBtn: 'تطبيق FEN',
    invalidFenError: 'تنسيق FEN غير صالح أو غير قانوني.',

    engineTitle: 'محرك Stockfish 19 UCI',
    depthShort: 'Depth',
    autoEloBtn: 'تلقائي (Elo)',
    depthSliderLabel: 'العمق:',
    engineRemoteConnected: 'خادم API الخارجي متصل (Stockfish محلي)',
    engineOfflineLocal: 'وضع عدم الاتصال · محرك WebAssembly محلي',
    engineLocalAsm: 'محرك Stockfish محلي (JS · يعمل بدون إنترنت)',
    engineLocalWasm: 'محرك Stockfish WebAssembly محلي (يعمل محلياً)',
    stockfishWebsiteBtn: 'موقع Stockfish',
    verifyLocalEngineBtn: 'فحص المحرك محلياً',
    verifyingLocalEngineBtn: 'جاري التحقق...',
    localEngineVerifiedOk: (backend, bestMove, latencyMs) =>
      `تم التحقق محلياً (${backend}) · نقلة اختبار: ${bestMove} (${latencyMs}ms)`,
    localEngineVerifyFailed: (error) => `فشل التحقق المحلي: ${error}`,
    externalVisionConnectedBadge: 'خادم API متصل للقطات الرقعة والصوت',
    checkingServer: 'جاري الفحص...',
    checkServer: 'فحص الخادم',
    checkServerTooltip: 'فحص الاتصال بالخادم الخارجي للقطات الرقعة والشرح الصوتي',
    hideUrl: 'إخفاء الرابط',
    externalServerBtn: 'خادم API الخارجي',
    serverUrlPlaceholder: 'https://your-server.example.com (اختياري)',
    saveAndConnect: 'حفظ واتصال',
    defaultServerBtn: 'افتراضي',
    serverHelpText:
      'يعمل محرك Stockfish محلياً دائماً عبر WebAssembly لتحليل النقلات دون اتصال، بينما يتصل التطبيق بالخادم الخارجي أعلاه لإرسال لقطات الرقعة وتعيين القطع والشرح الصوتي.',
    evaluationLabel: 'التقييم',
    bestMoveLabel: 'أفضل نقلة',
    applyBestMoveTooltip: 'تطبيق هذه النقلة على الرقعة',
    searchSpeedLabel: 'سرعة البحث',
    topLinesTitle: 'أفضل التفريعات المرشحة (MultiPV)',
    applyLineBtn: 'تطبيق',
    emptyAnalysisHint: 'قم بتحريك قطعة أو تشغيل البث لتقييم الوضعية.',
    uciLogTitle: 'سجل بروتوكول UCI الخام',
    voiceCoachTitle: 'الشرح الصوتي بالذكاء الاصطناعي',
    voiceCoachStoppedHint: 'متوقف حالياً · شغّله عند الحاجة للشرح الصوتي',
    autoSpeakBtn: 'نطق تلقائي',
    voiceSelectAria: 'اختيار نبرة الصوت',
    voiceLabels: {
      Kore: 'Kore (متزن)',
      Charon: 'Charon (عميق)',
      Fenrir: 'Fenrir (حازم)',
      Zephyr: 'Zephyr (واضح)',
      Puck: 'Puck (حيوي)',
    },
    powerOff: 'إيقاف',
    powerOn: 'تشغيل',
    generatingExplanation: 'جاري صياغة التحليل الاستراتيجي للنقلات...',
    voiceCoachEmptyText:
      'اضغط على «شرح ونطق القرار الآن» أو فعّل «نطق تلقائي» ليقوم النموذج اللغوي بتفسير قرار Stockfish وقراءته صوتياً.',
    explainAndSpeakBtn: 'شرح ونطق القرار الآن',
    synthesizingAudioBtn: 'جاري توليد الصوت...',
    stopAudioBtn: 'إيقاف الصوت',
    replayAudioBtn: 'إعادة الاستماع',
    moveLogTitle: 'سجل النقلات المرصودة',
    moveCount: (count) => `${count} نقلة`,
    emptyMoveLog: 'لم يتم تسجيل أي نقلة بعد. حرّك قطعة في البث أو على الرقعة.',
    sourceTagVision: 'رصد OpenCV',
    sourceTagVirtual: 'بث تفاعلي',
    sourceTagManual: 'يدوي',

    profilerTitle: 'مقايضة استهلاك الموارد ودقة الرصد (OpenCV Resource Profiler)',
    pressureOverBudget: 'تجاوز ميزانية الإطار (تأخر محتمل)',
    pressureMedium: 'ضغط معالجة متوسط',
    pressureStable: 'أداء مستقر دون تأخر',
    scanResolutionLabel: 'دقة المسح (Scan Resolution)',
    targetFpsLabel: 'معدل تكرار الإطارات (Target FPS)',
    cannyThresholdLabel: 'عتبة حواف Canny',
    motionSensitivityLabel: 'حساسية تغير المربع',
    gaussianBlurLabel: 'تفعيل مرشح GaussianBlur (5×5) لتقليل ضوضاء الكاميرا',
    playerEloLabel: 'مستوى اللاعب / التقييم (Elo)',
    eloSliderAria: 'شريط تقييم اللاعب Elo',
    eloPresets: [
      { elo: 1000, label: 'مبتدئ 1000' },
      { elo: 1500, label: 'متوسط 1500' },
      { elo: 2000, label: 'متقدم 2000' },
      { elo: 2500, label: 'أستاذ 2500' },
    ],
    autoDepthByEloLabel: 'ضبط عمق بحث Stockfish تلقائياً حسب تقييم اللاعب',
    frameTimeVsBudgetLabel: 'زمن المعالجة الفعلي مقابل ميزانية الإطار',
    budgetSvgText: (ms) => `الميزانية ${ms}ms`,
    stageCapture: 'الالتقاط',
    stageBlur: 'Blur 5×5',
    stageCanny: 'Canny',
    stageMatrix: 'مصفوفة 8×8',
    matrixDiffTitle: 'مصفوفة الفروقات 8×8',

    archTitle: 'هيكلة النظام والمرجع البرمجي (Python OpenCV + Stockfish UCI)',
    downloadZipBtn: 'تنزيل التطبيق (.zip)',
    copyPythonBtn: 'نسخ كود Python',
    copiedBtn: 'تم النسخ',
    archStep1Title: '01. التقاط الإطارات والمعالجة الأولية',
    archStep1DescBefore: 'تُحوّل الإطارات الملتقطة إلى التدرج الرمادي ثم يُطبّق مرشح ',
    archStep1DescMid: ' لتقليل تشويش الحساس قبل استخراج الحواف عبر ',
    archStep1DescAfter: '.',
    archStep2Title: '02. مطابقة المصفوفة 8×8 مع النقلات القانونية',
    archStep2DescBefore: 'تُقسّم منطقة الاهتمام (ROI) إلى 64 مربعاً لقياس تغيّر السطوع بين الإطارين وربطه بمصفوفة ',
    archStep2DescAfter: '.',
    archStep3Title: '03. مقايضة استهلاك الموارد وزمن الاستجابة',
    archStep3DescBefore: 'مضاعفة دقة المسح من ',
    archStep3DescMid1: ' إلى ',
    archStep3DescMid2: ' يزيد عدد البكسلات نحو 10 أضعاف، ما يضغط على ميزانية الإطار عند الترددات العالية إذا تجاوز زمن المعالجة حد ',
    archStep3DescAfter: ' ملي ثانية.',
    pythonSnippet: `import cv2
import numpy as np
import mss
import chess
import chess.engine

engine = chess.engine.SimpleEngine.from_uci("stockfish_path")
board = chess.Board()

def detect_move_from_frame(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    # استخراج مصفوفة 8x8 ومقارنة الإطار السابق بالحالي لتحديد النقلة
    return "e2e4"

def analyze_and_explain(uci_move):
    move = chess.Move.from_uci(uci_move)
    if move in board.legal_moves:
        board.push(move)
        info = engine.analyse(board, chess.engine.Limit(depth=15))
        print(f"النقلة: {uci_move} | أفضل رد: {info['pv'][0]} | التقييم: {info['score'].white()}")`,

    emptyServerResponse: (fallback, status) => `${fallback} (استجابة فارغة من الخادم: ${status})`,
    cloudFeatureRequiresServer:
      'هذه الميزة السحابية تتطلب اتصالاً بخادم التطبيق، بينما يعمل محرك Stockfish والرؤية الحاسوبية محلياً دون خادم.',
    invalidServerJson: (status) =>
      `استجاب الخادم بصيغة غير صالحة (ليست JSON). تأكد من تشغيل خادم التطبيق (${status}).`,
    audioPlayError: 'تعذر تشغيل ملف الصوت في المتصفح.',
    voiceCloudRequired:
      'الشرح الصوتي السحابي يتطلب الاتصال بالخادم، بينما يعمل محرك Stockfish عبر WebAssembly محلياً دون إنترنت.',
    voiceExplainFailed: 'فشل توليد الشرح التحليلي.',
    voiceTtsFailed: 'فشل تحويل الشرح إلى صوت.',
    voiceGenericError: 'حدث خطأ أثناء الشرح الصوتي.',
    stockfishAnalyzeFailed: 'فشل تحليل Stockfish.',
    stockfishStartFailed: 'تعذر تشغيل محرك Stockfish.',
    cameraUnsupported: 'المتصفح أو التطبيق لا يدعم واجهات التقاط الوسائط في هذا السياق.',
    cameraDenied:
      'تم رفض إذن الكاميرا. اسمح للتطبيق بالوصول إلى الكاميرا من إعدادات الهاتف ثم اضغط «إعادة المحاولة».',
    cameraNotFound: 'لم يتم العثور على كاميرا متصلة على هذا الجهاز.',
    cameraInUse: 'الكاميرا قيد الاستخدام حالياً بواسطة تطبيق آخر.',
    cameraAccessFailed: 'تعذر الوصول إلى الكاميرا.',
    detectedMoveStatus: (san, uci, confidence) => `تم رصد: ${san} (${uci}) · ثقة ${confidence}%`,
    noActiveFrameError: 'لا يوجد إطار نشط حالياً. شغّل الكاميرا أو ارفع صورة أولاً.',
    roiCaptureError: 'تعذر التقاط منطقة الرقعة (ROI).',
    aiScanCloudRequired:
      'التعرف التلقائي على القطع بالذكاء الاصطناعي يتطلب اتصالاً بالخادم، بينما يعمل محرك Stockfish عبر WebAssembly محلياً دون إنترنت.',
    aiScanReadFailed: 'تعذر قراءة وضعية الرقعة.',
    illegalBoardPosition: 'تمت قراءة الوضعية لكنها لم تجتز التحقق القانوني للشطرنج.',
    perspectiveBlackFlipped: 'الأسود (مصفوفة مقلوبة)',
    perspectiveWhiteBottom: 'الأبيض (النصف السفلي)',
    scanReadSummary: (perspective, opponentSan, turnName) =>
      `تمت القراءة · ${perspective}${opponentSan ? ` · نقلة الخصم: ${opponentSan}` : ''} · الدور: ${turnName}`,
    aiScanGenericFailed: 'فشلت قراءة الوضعية بالذكاء الاصطناعي.',
    baselineCalibratedStatus: 'تمت معايرة الإطار المرجعي',

    tabAnalyzer: 'الرقعة والرصد',
    tabCoach: 'المدرب',
    tabPuzzles: 'حل الألغاز',

    coachTitle: 'المدرب التفاعلي للتكتيكات',
    coachSubtitle: 'تدرّب على الشوكة والربط وكشف الهجوم ومات في نقلة ومات الصف الأخير مع تقييم Stockfish الفوري.',
    coachAllTactics: 'الكل',
    coachTactics: {
      fork: 'شوكة',
      pin: 'ربط',
      discovered: 'كشف هجوم',
      mateIn1: 'مات في نقلة واحدة',
      backRank: 'مات الصف الأخير',
    },
    coachHintBtn: 'تلميح المدرب',
    coachPlayBestBtn: 'نفّذ أفضل نقلة',
    coachResetBtn: 'إعادة الوضع',
    coachFlipBtn: 'قلب الرقعة',
    coachGoalLabel: 'المطلوب في هذا التمرين:',
    coachFeedbackTitle: 'شرح المدرب والتقييم',
    coachEvalTitle: 'تقييم Stockfish للموقف',
    coachStatusReady: 'اختر القطعة وحرّكها لتنفيذ التكتيك المطلوب.',
    coachStatusCorrect: 'نقلة صحيحة وموفقة!',
    coachStatusWrong: 'نقلة غير دقيقة — جرب مرة أخرى أو اطلب تلميح المدرب.',
    coachStatusSolvedByCoach: 'تم تنفيذ أفضل نقلة بواسطة المدرب',
    coachPlayedMoveLabel: (san) => `نقلتك: ${san}`,
    coachBetterMoveLabel: (san) => `أفضل نقلة: ${san}`,
    coachNextDrillBtn: 'التمرين التالي',
    coachDrillProgress: (index, total) => `تمرين ${index} / ${total}`,
    coachAnalyzingEval: 'جاري تقييم الموقف محلياً...',
    coachStockfishBestLabel: 'ترشيح Stockfish:',
    coachWrongEvalNote: (playedSan, bestSan, evalAfter) =>
      `لعبتَ ${playedSan} (التقييم بعد النقلة: ${evalAfter})، بينما النقلة الحاسمة هي ${bestSan} لأنها تحقق التفوق المباشر للتكتيك.`,

    puzzlesTitle: 'قسم حل الألغاز (1,000 لغز شطرنج)',
    puzzlesSubtitle: 'ألغاز متدرجة الصعوبة (مبتدئ، متوسط، متقدم) مع حفظ تلقائي لعدد الألغاز المحلولة.',
    puzzlesSolvedCountLabel: (solved, total) => `المحلولة: ${solved} / ${total}`,
    puzzlesSolvedBadge: 'تم الحل',
    puzzlesDifficultyAll: 'الكل (1000)',
    puzzlesDifficultyLabels: {
      beginner: 'مبتدئ',
      intermediate: 'متوسط',
      advanced: 'متقدم',
    },
    puzzlesThemeLabels: {
      mateIn1: 'مات في نقلة',
      backRank: 'مات الصف الأخير',
      fork: 'شوكة',
      pin: 'ربط',
      discovered: 'كشف هجوم',
      skewer: 'سيخ تكتيكي',
      sacrifice: 'تضحية حاسمة',
      mateIn2: 'مات في نقلتين',
      deflection: 'تشتيت المدافع',
    },
    puzzlesPrevBtn: 'السابق',
    puzzlesNextBtn: 'التالي',
    puzzlesRandomBtn: 'لغز عشوائي',
    puzzlesJumpPlaceholder: '1 - 1000',
    puzzlesJumpBtn: 'انتقال',
    puzzlesHintBtn: 'تلميح',
    puzzlesResetBtn: 'إعادة',
    puzzlesFlipBtn: 'قلب الرقعة',
    puzzlesNumberLabel: (id, total) => `لغز #${id} من ${total}`,
    puzzlesRatingLabel: (rating) => `تصنيف ${rating}`,
    puzzlesTurnWhite: 'الدور للأبيض — جد النقلة الأفضل',
    puzzlesTurnBlack: 'الدور للأسود — جد النقلة الأفضل',
    puzzlesStatusPrompt: 'حرّك القطعة لإيجاد الحل الأمثل.',
    puzzlesStatusOpponentReply: 'جاري تنفيذ رد الخصم...',
    puzzlesStatusCorrectContinue: 'ممتاز! أكمل النقلة التالية لإنهاء اللغز.',
    puzzlesStatusSolved: 'أحسنت! تم حل اللغز وتسجيله بنجاح.',
    puzzlesStatusWrong: 'ليست أفضل نقلة — حاول مجدداً أو استخدم زر «تلميح».',
    puzzlesHintActiveLabel: (from, to) => `تلميح: حرّك من ${from} إلى ${to}`,

    coachModeTactics: 'تدريب التكتيكات',
    coachModePlayAi: 'اللعب ضد Stockfish',
    playAiTitle: 'رقعة الشطرنج — اللعب ضد ذكاء Stockfish',
    playAiSubtitle: 'أنشئ رقعة لعب كاملة واختر مستوى الخصم من مبتدئ حتى أستاذ مع تحليل التقييم الفوري.',
    playAiDifficultyLabel: 'مستوى الذكاء الاصطناعي:',
    playAiLevels: {
      weak: 'ضعيف جداً',
      beginner: 'مبتدئ',
      intermediate: 'متوسط',
      advanced: 'متقدم',
      master: 'أستاذ',
    },
    playAiLevelSubtitles: {
      weak: '500 Elo · عمق 1',
      beginner: '1000 Elo · عمق 4',
      intermediate: '1500 Elo · عمق 7',
      advanced: '2000 Elo · عمق 11',
      master: '2500 Elo · عمق 15',
    },
    playAiSideLabel: 'اللون الخاص بك:',
    playAiNewBoardBtn: 'إنشاء رقعة جديدة',
    playAiUndoBtn: 'تراجع',
    coachBestArrowBtn: 'سهم أفضل نقلة',
    playAiYourTurn: (sideName) => `دورك الآن (${sideName})`,
    playAiThinking: 'Stockfish يفكّر في النقلة...',
    playAiGameOverLabel: 'انتهت المباراة',
    playAiPlayAgainBtn: 'العب مجدداً',
    playAiMovesTitle: 'سجل نقلات المباراة',
    playAiEmptyMoves: 'ابدأ بتحريك أي قطعة على الرقعة لبدء المباراة ضد Stockfish.',
    playAiCoachTipTitle: 'تحليل المدرب أثناء اللعب',
    playAiHintMessage: (san, from, to) =>
      `تلميح المدرب: النقلة المقترحة هي ${san} (من ${from} إلى ${to}).`,
    playAiDefaultTip: 'راقب شريط التقييم على جانب الرقعة أو اطلب «تلميح المدرب» في أي لحظة.',
    playAiLastAiMove: (san) => `لعب Stockfish نقلة ${san}.`,
  },

  en: {
    appTitle: 'Chess Vision — Computer Vision & Stockfish UCI',
    brandName: 'Chess Vision',
    brandLogoAlt: 'Chess Vision Logo',
    navVision: 'Live Vision',
    navBoard: 'Board & UCI',
    navProfiler: 'Resource Profiler',
    navReference: 'OpenCV & Python',
    startMonitoring: 'Start Live Monitor',
    stopMonitoring: 'Stop Live Monitor',
    heroTitle: 'Chessboard Computer Vision & Stockfish UCI Engine',
    heroSubtitleBefore:
      'Capture the board via camera, interactive stream, or image upload, inspect edge processing and ',
    heroSubtitleAfter: ' matrix extraction, with instant Stockfish 19 analysis and AI voice coaching.',
    streamStatusLabel: 'Stream:',
    streamActive: '● Active',
    streamPaused: 'Paused',
    depthLabel: 'Depth',
    clearCache: 'Clear Cache',
    clearingCache: 'Clearing...',
    clearCacheTooltip: 'Clear app cache, Service Worker storage, and engine worker memory',
    cacheClearedCount: (count) => `Cache cleared (${count})`,
    cacheClearedSuccess: 'App cache cleared successfully',
    offlineBanner: 'Offline Mode — Stockfish runs locally via WebAssembly',

    languageLabel: 'Language',
    switchLanguageAria: 'Change interface language',

    pwaInstallButton: 'Install Android App',
    pwaIosTitle: 'Install App on iPhone / iPad',
    pwaAndroidTitle: 'Install App Directly on Android (PWA)',
    pwaClose: 'Close',
    pwaIosSteps: [
      'Open this URL in Safari on your device.',
      'Tap the Share button in the browser toolbar.',
      'Select "Add to Home Screen".',
    ],
    pwaAndroidSteps: [
      'Open this app URL in Chrome on your Android device.',
      'Tap the browser menu (⋮) at the top and choose "Install app".',
      'Chess Vision will install as a standalone app on your home screen with full camera access.',
    ],
    pwaCopyLink: 'Copy Link',
    pwaCopiedLink: 'Copied',

    sourceVirtual: 'Interactive Stream',
    sourceCamera: 'Camera',
    sourceImage: 'Upload Image',
    startCapture: 'Start Capture',
    stopCapture: 'Stop Capture',
    viewOriginal: 'Original + ROI',
    viewGrayscale: 'Grayscale (Blur)',
    viewCanny: 'Canny Edges',
    viewHeatmap: '8×8 Square Delta',
    scanAiBtn: 'Scan Position (AI)',
    scanningAiBtn: 'Scanning...',
    scanAiTooltip: 'Read current piece placement from the selected ROI and sync the digital board',
    detectionSoundBtn: 'Move Sound',
    detectionSoundTooltip: 'Enable or mute tap audio when a piece move is detected',
    calibrateBaselineBtn: 'Calibrate Baseline',
    calibrateBaselineTooltip: 'Save the current frame as baseline for detecting upcoming moves',
    resetRoiBtn: 'Reset ROI',
    resetRoiTooltip: 'Reset the four board corner handles',
    roiGuideBefore:
      'Drag the four cyan handles onto the corners of the 8×8 board. If a game is already in progress, press',
    roiGuideAfter: 'to scan pieces and compute the best move immediately.',
    retryBtn: 'Retry',
    cameraPausedMsg: 'Camera stream is currently paused',
    uploadedImageAlt: 'Uploaded chessboard image',
    cornerHandlePrefix: 'Corner handle',
    cornerLabels: ['Top-Left', 'Top-Right', 'Bottom-Right', 'Bottom-Left'],
    waitingForFrame: 'Waiting for frame',
    activeDetection: 'Active detection',
    pausedLabel: 'Paused',
    capturePreviewBestMoveBtn: 'Capture Preview & Extract Best Move',
    capturingPreviewBestMoveBtn: 'Capturing matrix & computing best move...',
    autoPlacePiecesBtn: 'Auto-Place Pieces',
    autoPlacePiecesTooltip:
      'Automatically send board snapshots to the external API endpoint to analyze and set pieces on the synchronized board',
    autoPlaceActiveStatus: 'Auto API piece sync active',
    visionApiEndpointBtn: 'Snapshot API URL',
    visionApiEndpointLabel: 'External Snapshot Analysis API Endpoint:',
    visionApiPlaceholder: 'https://your-server.com/api/board-fen',
    saveEndpointBtn: 'Save Endpoint',
    activeEndpointLabel: 'Active endpoint:',
    opponentMoveOnlyBtn: 'Opponent Move Only',
    opponentMoveOnlyTooltip:
      'Ignore random movements and focus exclusively on opponent moves for UCI reply',
    yourZoneLabel: 'Your Side (Bottom Half):',
    whiteSideBtn: 'White',
    blackFlippedBtn: 'Black (Flip Matrix)',
    blackPerspectiveHint: '8×8 matrix is flipped programmatically for Black perspective',
    whitePerspectiveHint: 'Bottom half is White · direct UCI analysis',
    capturedPreviewAlt: 'Captured chessboard preview',
    capturedPreviewTitle: (time) => `Captured Preview (${time})`,
    closePreviewAria: 'Close preview',
    previewBlackFlipped: 'Black (Bottom Half · Flipped 180°)',
    previewWhiteBottom: 'White (Bottom Half)',
    opponentMoveLabel: 'Opponent Move:',
    generatingUciReply: 'Generating best UCI reply...',
    bestReplyUciLabel: 'Best Reply (UCI):',
    applyMoveBtn: 'Apply Move',
    positionReadyLabel: 'Position ready on the digital board',
    virtualScenarioLabel: 'Stream Scenario:',
    presetNames: {
      italian: 'Italian Game (Giuoco Piano)',
      sicilian: 'Sicilian Defense (Najdorf)',
      queens_gambit: "Queen's Gambit",
    },
    lightingNoiseBtn: 'Camera Lighting Noise',
    resetStreamBtn: 'Reset Stream',
    stepVirtualMoveBtn: (step, total) => `Play Stream Move (${step}/${total})`,

    syncBoardTitle: 'Synchronized Board',
    turnPrefix: 'Turn:',
    toggleTurnTooltip: 'Click to switch side to move between White and Black',
    whiteName: 'White',
    blackName: 'Black',
    arrowBtn: 'Arrow',
    arrowTooltip: 'Show or hide Stockfish best move arrow',
    flipBtn: 'Flip',
    flipTooltip: 'Flip board orientation',
    undoBtn: 'Undo',
    undoTooltip: 'Undo last move',
    resetBtn: 'Reset',
    resetTooltip: 'Reset to starting position',
    evalBarAria: (label) => `Stockfish evaluation bar: ${label}`,
    squareAria: (sq) => `Square ${sq}`,
    analyzingStockfish: 'Analyzing with Stockfish...',
    stockfishRecommendation: 'Stockfish Best:',
    activeFenMatrix: 'Active FEN Matrix',
    editFenTooltip: 'Edit or paste FEN string manually',
    fenPlaceholder: 'Paste FEN string...',
    applyFenBtn: 'Apply FEN',
    invalidFenError: 'Invalid or illegal FEN notation.',

    engineTitle: 'Stockfish 19 UCI Engine',
    depthShort: 'Depth',
    autoEloBtn: 'Auto (Elo)',
    depthSliderLabel: 'Depth:',
    engineRemoteConnected: 'External API Connected (Local Stockfish)',
    engineOfflineLocal: 'Offline Mode · Local WebAssembly Engine',
    engineLocalAsm: 'Local Stockfish Engine (JS · Running Locally)',
    engineLocalWasm: 'Local Stockfish WebAssembly (Running Locally)',
    stockfishWebsiteBtn: 'Stockfish Website',
    verifyLocalEngineBtn: 'Verify Local Engine',
    verifyingLocalEngineBtn: 'Verifying...',
    localEngineVerifiedOk: (backend, bestMove, latencyMs) =>
      `Local verified (${backend}) · test move: ${bestMove} (${latencyMs}ms)`,
    localEngineVerifyFailed: (error) => `Local verification failed: ${error}`,
    externalVisionConnectedBadge: 'External API ready for board snapshots & voice',
    checkingServer: 'Checking...',
    checkServer: 'Check Server',
    checkServerTooltip: 'Check connection to the external server for snapshots and AI voice',
    hideUrl: 'Hide URL',
    externalServerBtn: 'External API Server',
    serverUrlPlaceholder: 'https://your-server.example.com (optional)',
    saveAndConnect: 'Save & Connect',
    defaultServerBtn: 'Default',
    serverHelpText:
      'Stockfish always runs locally via WebAssembly in both browser and app, while snapshots and optional voice commentary are sent to the external server/API endpoint above.',
    evaluationLabel: 'Evaluation',
    bestMoveLabel: 'Best Move',
    applyBestMoveTooltip: 'Apply this move to the board',
    searchSpeedLabel: 'Search Speed',
    topLinesTitle: 'Top Candidate Lines (MultiPV)',
    applyLineBtn: 'Apply',
    emptyAnalysisHint: 'Move a piece or start the stream to evaluate the position.',
    uciLogTitle: 'Raw UCI Protocol Log',
    voiceCoachTitle: 'AI Voice Coach',
    voiceCoachStoppedHint: 'Currently off · Enable when voice coaching is needed',
    autoSpeakBtn: 'Auto Speak',
    voiceSelectAria: 'Select voice tone',
    voiceLabels: {
      Kore: 'Kore (Balanced)',
      Charon: 'Charon (Deep)',
      Fenrir: 'Fenrir (Firm)',
      Zephyr: 'Zephyr (Clear)',
      Puck: 'Puck (Lively)',
    },
    powerOff: 'Turn Off',
    powerOn: 'Turn On',
    generatingExplanation: 'Composing strategic move analysis...',
    voiceCoachEmptyText:
      'Click "Explain & Speak Now" or enable "Auto Speak" to get spoken grandmaster commentary on Stockfish’s choice.',
    explainAndSpeakBtn: 'Explain & Speak Now',
    synthesizingAudioBtn: 'Synthesizing Audio...',
    stopAudioBtn: 'Stop Audio',
    replayAudioBtn: 'Replay',
    moveLogTitle: 'Detected Move Log',
    moveCount: (count) => `${count} ${count === 1 ? 'move' : 'moves'}`,
    emptyMoveLog: 'No moves recorded yet. Move a piece in the stream or on the board.',
    sourceTagVision: 'OpenCV Vision',
    sourceTagVirtual: 'Interactive Stream',
    sourceTagManual: 'Manual',

    profilerTitle: 'Resource Trade-off & Detection Accuracy (OpenCV Profiler)',
    pressureOverBudget: 'Over frame budget (possible lag)',
    pressureMedium: 'Moderate processing load',
    pressureStable: 'Stable performance, zero lag',
    scanResolutionLabel: 'Scan Resolution',
    targetFpsLabel: 'Target FPS',
    cannyThresholdLabel: 'Canny Threshold',
    motionSensitivityLabel: 'Square Motion Sensitivity',
    gaussianBlurLabel: 'Enable GaussianBlur (5×5) to reduce camera sensor noise',
    playerEloLabel: 'Player Level / Rating (Elo)',
    eloSliderAria: 'Player Elo Rating Slider',
    eloPresets: [
      { elo: 1000, label: 'Beginner 1000' },
      { elo: 1500, label: 'Intermediate 1500' },
      { elo: 2000, label: 'Advanced 2000' },
      { elo: 2500, label: 'Master 2500' },
    ],
    autoDepthByEloLabel: 'Automatically map Stockfish search depth from player Elo',
    frameTimeVsBudgetLabel: 'Actual Frame Processing Time vs Budget',
    budgetSvgText: (ms) => `Budget ${ms}ms`,
    stageCapture: 'Capture',
    stageBlur: 'Blur 5×5',
    stageCanny: 'Canny',
    stageMatrix: '8×8 Matrix',
    matrixDiffTitle: '8×8 Delta Matrix',

    archTitle: 'System Architecture & Code Reference (Python OpenCV + Stockfish UCI)',
    downloadZipBtn: 'Download App (.zip)',
    copyPythonBtn: 'Copy Python Code',
    copiedBtn: 'Copied',
    archStep1Title: '01. Frame Capture & Preprocessing',
    archStep1DescBefore: 'Captured frames are converted to grayscale, then smoothed with ',
    archStep1DescMid: ' to suppress sensor noise before edge extraction via ',
    archStep1DescAfter: '.',
    archStep2Title: '02. Matching the 8×8 Matrix with Legal Moves',
    archStep2DescBefore:
      'The Region of Interest (ROI) is subdivided into 64 squares to measure inter-frame luminance delta and match it against ',
    archStep2DescAfter: '.',
    archStep3Title: '03. Resource vs. Latency Trade-off',
    archStep3DescBefore: 'Scaling resolution from ',
    archStep3DescMid1: ' to ',
    archStep3DescMid2:
      ' increases pixel count nearly 10×, pressuring the frame budget at high FPS if processing exceeds ',
    archStep3DescAfter: ' ms.',
    pythonSnippet: `import cv2
import numpy as np
import mss
import chess
import chess.engine

engine = chess.engine.SimpleEngine.from_uci("stockfish_path")
board = chess.Board()

def detect_move_from_frame(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    # Extract 8x8 matrix and compare previous vs current frame to detect move
    return "e2e4"

def analyze_and_explain(uci_move):
    move = chess.Move.from_uci(uci_move)
    if move in board.legal_moves:
        board.push(move)
        info = engine.analyse(board, chess.engine.Limit(depth=15))
        print(f"Move: {uci_move} | Best: {info['pv'][0]} | Eval: {info['score'].white()}")`,

    emptyServerResponse: (fallback, status) => `${fallback} (empty server response: ${status})`,
    cloudFeatureRequiresServer:
      'This cloud AI feature requires a server connection, while Stockfish and Computer Vision work locally offline.',
    invalidServerJson: (status) =>
      `Server returned invalid format (not JSON). Ensure the app server is running (${status}).`,
    audioPlayError: 'Unable to play audio in this browser.',
    voiceCloudRequired:
      'Cloud AI voice commentary requires a server connection, while Stockfish WebAssembly runs offline.',
    voiceExplainFailed: 'Failed to generate tactical explanation.',
    voiceTtsFailed: 'Failed to synthesize voice audio.',
    voiceGenericError: 'An error occurred during voice commentary.',
    stockfishAnalyzeFailed: 'Stockfish analysis failed.',
    stockfishStartFailed: 'Unable to start Stockfish engine.',
    cameraUnsupported: 'Media capture APIs are not supported in this browser or context.',
    cameraDenied:
      'Camera permission denied. Allow camera access in device settings, then click Retry.',
    cameraNotFound: 'No camera device found on this device.',
    cameraInUse: 'Camera is currently in use by another application.',
    cameraAccessFailed: 'Unable to access the camera.',
    detectedMoveStatus: (san, uci, confidence) => `Detected: ${san} (${uci}) · ${confidence}% conf`,
    noActiveFrameError: 'No active frame available. Start the camera or upload an image first.',
    roiCaptureError: 'Failed to capture board Region of Interest (ROI).',
    aiScanCloudRequired:
      'AI piece recognition requires a server connection, while Stockfish WebAssembly works locally offline.',
    aiScanReadFailed: 'Failed to read board position.',
    illegalBoardPosition: 'Detected position failed legal chess validation.',
    perspectiveBlackFlipped: 'Black (Flipped Matrix)',
    perspectiveWhiteBottom: 'White (Bottom Half)',
    scanReadSummary: (perspective, opponentSan, turnName) =>
      `Scanned · ${perspective}${opponentSan ? ` · Opponent: ${opponentSan}` : ''} · Turn: ${turnName}`,
    aiScanGenericFailed: 'AI board scan failed.',
    baselineCalibratedStatus: 'Baseline reference frame calibrated',

    tabAnalyzer: 'Board & Vision',
    tabCoach: 'Coach',
    tabPuzzles: 'Solve Puzzles',

    coachTitle: 'Interactive Tactics Coach',
    coachSubtitle: 'Practice forks, pins, discovered attacks, mate in 1, and back-rank mates with instant Stockfish feedback.',
    coachAllTactics: 'All',
    coachTactics: {
      fork: 'Fork',
      pin: 'Pin',
      discovered: 'Discovered Attack',
      mateIn1: 'Mate in 1',
      backRank: 'Back Rank Mate',
    },
    coachHintBtn: 'Coach Hint',
    coachPlayBestBtn: 'Play Best Move',
    coachResetBtn: 'Reset Position',
    coachFlipBtn: 'Flip Board',
    coachGoalLabel: 'Drill Objective:',
    coachFeedbackTitle: 'Coach Explanation & Evaluation',
    coachEvalTitle: 'Stockfish Position Evaluation',
    coachStatusReady: 'Select and move a piece to execute the tactic.',
    coachStatusCorrect: 'Correct tactical strike!',
    coachStatusWrong: 'Suboptimal move — try again or ask for a Coach Hint.',
    coachStatusSolvedByCoach: 'Best move demonstrated by Coach',
    coachPlayedMoveLabel: (san) => `Your move: ${san}`,
    coachBetterMoveLabel: (san) => `Best move: ${san}`,
    coachNextDrillBtn: 'Next Drill',
    coachDrillProgress: (index, total) => `Drill ${index} / ${total}`,
    coachAnalyzingEval: 'Evaluating position locally...',
    coachStockfishBestLabel: 'Stockfish Top:',
    coachWrongEvalNote: (playedSan, bestSan, evalAfter) =>
      `You played ${playedSan} (eval: ${evalAfter}), whereas ${bestSan} wins cleanly by executing the tactical motif immediately.`,

    puzzlesTitle: 'Chess Puzzles Arena (1,000 Puzzles)',
    puzzlesSubtitle: 'Graded puzzles (Beginner, Intermediate, Advanced) with automatic localStorage progress tracking.',
    puzzlesSolvedCountLabel: (solved, total) => `Solved: ${solved} / ${total}`,
    puzzlesSolvedBadge: 'Solved',
    puzzlesDifficultyAll: 'All (1000)',
    puzzlesDifficultyLabels: {
      beginner: 'Beginner',
      intermediate: 'Intermediate',
      advanced: 'Advanced',
    },
    puzzlesThemeLabels: {
      mateIn1: 'Mate in 1',
      backRank: 'Back Rank Mate',
      fork: 'Fork',
      pin: 'Pin',
      discovered: 'Discovered Attack',
      skewer: 'Skewer',
      sacrifice: 'Tactical Sacrifice',
      mateIn2: 'Mate in 2',
      deflection: 'Deflection',
    },
    puzzlesPrevBtn: 'Previous',
    puzzlesNextBtn: 'Next',
    puzzlesRandomBtn: 'Random Puzzle',
    puzzlesJumpPlaceholder: '1 - 1000',
    puzzlesJumpBtn: 'Go',
    puzzlesHintBtn: 'Hint',
    puzzlesResetBtn: 'Reset',
    puzzlesFlipBtn: 'Flip Board',
    puzzlesNumberLabel: (id, total) => `Puzzle #${id} of ${total}`,
    puzzlesRatingLabel: (rating) => `Rating ${rating}`,
    puzzlesTurnWhite: 'White to move — Find the best move',
    puzzlesTurnBlack: 'Black to move — Find the best move',
    puzzlesStatusPrompt: 'Move a piece on the board to solve the puzzle.',
    puzzlesStatusOpponentReply: 'Playing opponent reply...',
    puzzlesStatusCorrectContinue: 'Nice! Find the follow-up move to finish.',
    puzzlesStatusSolved: 'Well done! Puzzle solved and saved.',
    puzzlesStatusWrong: 'Not the best move — try again or tap Hint.',
    puzzlesHintActiveLabel: (from, to) => `Hint: move ${from} → ${to}`,

    coachModeTactics: 'Tactics Drills',
    coachModePlayAi: 'Play vs Stockfish',
    playAiTitle: 'Chessboard — Play vs Stockfish AI',
    playAiSubtitle: 'Start a full chessboard match and select Beginner, Intermediate, Advanced, or Master strength.',
    playAiDifficultyLabel: 'Stockfish AI Level:',
    playAiLevels: {
      weak: 'Novice',
      beginner: 'Beginner',
      intermediate: 'Intermediate',
      advanced: 'Advanced',
      master: 'Master',
    },
    playAiLevelSubtitles: {
      weak: '500 Elo · Depth 1',
      beginner: '1000 Elo · Depth 4',
      intermediate: '1500 Elo · Depth 7',
      advanced: '2000 Elo · Depth 11',
      master: '2500 Elo · Depth 15',
    },
    playAiSideLabel: 'Your Color:',
    playAiNewBoardBtn: 'New Chessboard',
    playAiUndoBtn: 'Undo',
    coachBestArrowBtn: 'Best Move Arrow',
    playAiYourTurn: (sideName) => `Your turn (${sideName})`,
    playAiThinking: 'Stockfish is thinking...',
    playAiGameOverLabel: 'Game Over',
    playAiPlayAgainBtn: 'Play Again',
    playAiMovesTitle: 'Match Move History',
    playAiEmptyMoves: 'Move any piece on the chessboard to begin playing against Stockfish.',
    playAiCoachTipTitle: 'Live Coach Evaluation',
    playAiHintMessage: (san, from, to) =>
      `Coach Hint: Recommended move is ${san} (${from} → ${to}).`,
    playAiDefaultTip: 'Watch the evaluation bar alongside the board or tap Coach Hint anytime.',
    playAiLastAiMove: (san) => `Stockfish played ${san}.`,
  },

  ru: {
    appTitle: 'Chess Vision — Компьютерное зрение и Stockfish UCI',
    brandName: 'Chess Vision',
    brandLogoAlt: 'Логотип Chess Vision',
    navVision: 'Видео и зрение',
    navBoard: 'Доска и UCI',
    navProfiler: 'Ресурсы OpenCV',
    navReference: 'Справка Python',
    startMonitoring: 'Запустить мониторинг',
    stopMonitoring: 'Остановить мониторинг',
    heroTitle: 'Распознавание шахматной доски и движок Stockfish UCI',
    heroSubtitleBefore:
      'Захватывайте доску с камеры, интерактивного потока или изображения, отслеживайте границы и матрицу ',
    heroSubtitleAfter: ' с мгновенным анализом Stockfish 19 и голосовыми комментариями ИИ.',
    streamStatusLabel: 'Поток:',
    streamActive: '● Активен',
    streamPaused: 'Остановлен',
    depthLabel: 'Глубина',
    clearCache: 'Очистить кэш',
    clearingCache: 'Очистка...',
    clearCacheTooltip: 'Очистить кэш приложения, Service Worker и память движка',
    cacheClearedCount: (count) => `Кэш очищен (${count})`,
    cacheClearedSuccess: 'Кэш приложения успешно очищен',
    offlineBanner: 'Автономный режим — Stockfish работает локально через WebAssembly',

    languageLabel: 'Язык',
    switchLanguageAria: 'Изменить язык интерфейса',

    pwaInstallButton: 'Установить на Android',
    pwaIosTitle: 'Установка на iPhone / iPad',
    pwaAndroidTitle: 'Прямая установка на Android (PWA)',
    pwaClose: 'Закрыть',
    pwaIosSteps: [
      'Откройте эту ссылку в браузере Safari на вашем устройстве.',
      'Нажмите кнопку «Поделиться» (Share) на панели браузера.',
      'Выберите «На экран „Домой“» (Add to Home Screen).',
    ],
    pwaAndroidSteps: [
      'Откройте эту ссылку в браузере Chrome на смартфоне Android.',
      'Нажмите меню браузера (⋮) вверху и выберите «Установить приложение».',
      'Приложение установится на главный экран с полным доступом к камере.',
    ],
    pwaCopyLink: 'Копировать ссылку',
    pwaCopiedLink: 'Скопировано',

    sourceVirtual: 'Вирт. поток',
    sourceCamera: 'Камера',
    sourceImage: 'Загрузить фото',
    startCapture: 'Начать захват',
    stopCapture: 'Стоп',
    viewOriginal: 'Оригинал + ROI',
    viewGrayscale: 'Ч/Б (Blur)',
    viewCanny: 'Границы Canny',
    viewHeatmap: 'Дельта 8×8',
    scanAiBtn: 'Сканировать (ИИ)',
    scanningAiBtn: 'Сканирование...',
    scanAiTooltip: 'Распознать текущую позицию из выделенной области и синхронизировать доску',
    detectionSoundBtn: 'Звук хода',
    detectionSoundTooltip: 'Включить или отключить звук при распознавании хода',
    calibrateBaselineBtn: 'Калибровка',
    calibrateBaselineTooltip: 'Сохранить текущий кадр как эталон для отслеживания ходов',
    resetRoiBtn: 'Сброс ROI',
    resetRoiTooltip: 'Сбросить четыре угла области доски',
    roiGuideBefore:
      'Перетащите четыре голубые точки на углы доски 8×8. Если партия уже идёт, нажмите',
    roiGuideAfter: 'для мгновенного распознавания фигур и расчёта лучшего хода.',
    retryBtn: 'Повторить',
    cameraPausedMsg: 'Поток с камеры приостановлен',
    uploadedImageAlt: 'Загруженное изображение доски',
    cornerHandlePrefix: 'Угол',
    cornerLabels: ['Верхний левый', 'Верхний правый', 'Нижний правый', 'Нижний левый'],
    waitingForFrame: 'Ожидание кадра',
    activeDetection: 'Идёт распознавание',
    pausedLabel: 'Пауза',
    capturePreviewBestMoveBtn: 'Сделать снимок и найти лучший ход',
    capturingPreviewBestMoveBtn: 'Считывание матрицы и поиск лучшего хода...',
    autoPlacePiecesBtn: 'Авто-расстановка',
    autoPlacePiecesTooltip:
      'Автоматически отправлять снимки доски на внешний API для распознавания и расстановки фигур',
    autoPlaceActiveStatus: 'Автосинхронизация API активна',
    visionApiEndpointBtn: 'URL API снимков',
    visionApiEndpointLabel: 'Конечная точка API для анализа снимков доски:',
    visionApiPlaceholder: 'https://your-server.com/api/board-fen',
    saveEndpointBtn: 'Сохранить URL',
    activeEndpointLabel: 'Активный путь:',
    opponentMoveOnlyBtn: 'Только ход соперника',
    opponentMoveOnlyTooltip:
      'Игнорировать случайные движения и анализировать только ход соперника для ответа UCI',
    yourZoneLabel: 'Ваша сторона (нижняя часть):',
    whiteSideBtn: 'Белые',
    blackFlippedBtn: 'Чёрные (переворот)',
    blackPerspectiveHint: 'Матрица 8×8 программно переворачивается для анализа за чёрных',
    whitePerspectiveHint: 'Нижняя половина за белых · прямой анализ UCI',
    capturedPreviewAlt: 'Снимок распознанной доски',
    capturedPreviewTitle: (time) => `Предпросмотр снимка (${time})`,
    closePreviewAria: 'Закрыть предпросмотр',
    previewBlackFlipped: 'Чёрные (нижняя часть · поворот 180°)',
    previewWhiteBottom: 'Белые (нижняя часть)',
    opponentMoveLabel: 'Ход соперника:',
    generatingUciReply: 'Поиск лучшего ответа по UCI...',
    bestReplyUciLabel: 'Лучший ответ (UCI):',
    applyMoveBtn: 'Применить ход',
    positionReadyLabel: 'Позиция готова на цифровой доске',
    virtualScenarioLabel: 'Сценарий:',
    presetNames: {
      italian: 'Итальянская партия (Giuoco Piano)',
      sicilian: 'Сицилианская защита (Найдорф)',
      queens_gambit: 'Ферзевый гамбит',
    },
    lightingNoiseBtn: 'Шум освещения',
    resetStreamBtn: 'Сбросить поток',
    stepVirtualMoveBtn: (step, total) => `Ход в потоке (${step}/${total})`,

    syncBoardTitle: 'Синхронная доска',
    turnPrefix: 'Ход:',
    toggleTurnTooltip: 'Нажмите, чтобы переключить очередь хода (белые/чёрные)',
    whiteName: 'Белые',
    blackName: 'Чёрные',
    arrowBtn: 'Стрелка',
    arrowTooltip: 'Показать или скрыть стрелку лучшего хода Stockfish',
    flipBtn: 'Перевернуть',
    flipTooltip: 'Перевернуть доску',
    undoBtn: 'Назад',
    undoTooltip: 'Отменить последний ход',
    resetBtn: 'Сброс',
    resetTooltip: 'Сбросить в начальную позицию',
    evalBarAria: (label) => `Шкала оценки Stockfish: ${label}`,
    squareAria: (sq) => `Поле ${sq}`,
    analyzingStockfish: 'Анализ Stockfish...',
    stockfishRecommendation: 'Совет Stockfish:',
    activeFenMatrix: 'Активная матрица FEN',
    editFenTooltip: 'Редактировать или вставить FEN вручную',
    fenPlaceholder: 'Вставьте строку FEN...',
    applyFenBtn: 'Применить FEN',
    invalidFenError: 'Неверный или некорректный формат FEN.',

    engineTitle: 'Движок Stockfish 19 UCI',
    depthShort: 'Depth',
    autoEloBtn: 'Авто (Elo)',
    depthSliderLabel: 'Глубина:',
    engineRemoteConnected: 'Внешний API подключён (Stockfish локально)',
    engineOfflineLocal: 'Офлайн · Локальный движок WebAssembly',
    engineLocalAsm: 'Локальный движок Stockfish (JS · локально)',
    engineLocalWasm: 'Локальный Stockfish WebAssembly (работает локально)',
    stockfishWebsiteBtn: 'Сайт Stockfish',
    verifyLocalEngineBtn: 'Проверить локально',
    verifyingLocalEngineBtn: 'Проверка...',
    localEngineVerifiedOk: (backend, bestMove, latencyMs) =>
      `Проверено локально (${backend}) · тест: ${bestMove} (${latencyMs}мс)`,
    localEngineVerifyFailed: (error) => `Ошибка локальной проверки: ${error}`,
    externalVisionConnectedBadge: 'Внешний API готов для снимков и озвучки',
    checkingServer: 'Проверка...',
    checkServer: 'Проверить сервер',
    checkServerTooltip: 'Проверить подключение к внешнему серверу для снимков и озвучки ИИ',
    hideUrl: 'Скрыть URL',
    externalServerBtn: 'Внешний API сервер',
    serverUrlPlaceholder: 'https://your-server.example.com (необязательно)',
    saveAndConnect: 'Сохранить',
    defaultServerBtn: 'По умолч.',
    serverHelpText:
      'Stockfish всегда работает локально через WebAssembly, а внешний сервер/API используется для отправки снимков доски и голосовой озвучки.',
    evaluationLabel: 'Оценка',
    bestMoveLabel: 'Лучший ход',
    applyBestMoveTooltip: 'Применить этот ход на доске',
    searchSpeedLabel: 'Скорость',
    topLinesTitle: 'Лучшие варианты (MultiPV)',
    applyLineBtn: 'Применить',
    emptyAnalysisHint: 'Сделайте ход или запустите поток для оценки позиции.',
    uciLogTitle: 'Журнал протокола UCI',
    voiceCoachTitle: 'Голосовой ИИ-тренер',
    voiceCoachStoppedHint: 'Отключён · Включите при необходимости озвучки',
    autoSpeakBtn: 'Автоозвучка',
    voiceSelectAria: 'Выбор голоса',
    voiceLabels: {
      Kore: 'Kore (ровный)',
      Charon: 'Charon (глубокий)',
      Fenrir: 'Fenrir (уверенный)',
      Zephyr: 'Zephyr (чистый)',
      Puck: 'Puck (живой)',
    },
    powerOff: 'Выключить',
    powerOn: 'Включить',
    generatingExplanation: 'Формирование стратегического объяснения...',
    voiceCoachEmptyText:
      'Нажмите «Объяснить и озвучить» или включите «Автоозвучка» для голосового комментария хода Stockfish.',
    explainAndSpeakBtn: 'Объяснить и озвучить',
    synthesizingAudioBtn: 'Синтез речи...',
    stopAudioBtn: 'Остановить',
    replayAudioBtn: 'Повторить',
    moveLogTitle: 'Журнал ходов',
    moveCount: (count) => `${count} ход.`,
    emptyMoveLog: 'Ходы ещё не записаны. Передвиньте фигуру в потоке или на доске.',
    sourceTagVision: 'OpenCV',
    sourceTagVirtual: 'Вирт. поток',
    sourceTagManual: 'Вручную',

    profilerTitle: 'Баланс ресурсов и точности (OpenCV Profiler)',
    pressureOverBudget: 'Превышение бюджета кадра (возможна задержка)',
    pressureMedium: 'Средняя нагрузка',
    pressureStable: 'Стабильная работа без задержек',
    scanResolutionLabel: 'Разрешение сканирования',
    targetFpsLabel: 'Целевой FPS',
    cannyThresholdLabel: 'Порог Canny',
    motionSensitivityLabel: 'Чувствительность клетки',
    gaussianBlurLabel: 'Фильтр GaussianBlur (5×5) для снижения шума камеры',
    playerEloLabel: 'Рейтинг игрока (Elo)',
    eloSliderAria: 'Ползунок рейтинга Elo',
    eloPresets: [
      { elo: 1000, label: 'Новичок 1000' },
      { elo: 1500, label: 'Средний 1500' },
      { elo: 2000, label: 'Продвин. 2000' },
      { elo: 2500, label: 'Мастер 2500' },
    ],
    autoDepthByEloLabel: 'Автоматически подбирать глубину Stockfish по рейтингу Elo',
    frameTimeVsBudgetLabel: 'Время обработки кадра и бюджет',
    budgetSvgText: (ms) => `Бюджет ${ms}мс`,
    stageCapture: 'Захват',
    stageBlur: 'Blur 5×5',
    stageCanny: 'Canny',
    stageMatrix: 'Матрица 8×8',
    matrixDiffTitle: 'Матрица изменений 8×8',

    archTitle: 'Архитектура системы и эталонный код (Python OpenCV + Stockfish UCI)',
    downloadZipBtn: 'Скачать проект (.zip)',
    copyPythonBtn: 'Копировать Python',
    copiedBtn: 'Скопировано',
    archStep1Title: '01. Захват кадров и предобработка',
    archStep1DescBefore: 'Кадры переводятся в оттенки серого, затем сглаживаются фильтром ',
    archStep1DescMid: ' для подавления шума перед выделением контуров ',
    archStep1DescAfter: '.',
    archStep2Title: '02. Сопоставление матрицы 8×8 с легальными ходами',
    archStep2DescBefore:
      'Область интереса (ROI) делится на 64 клетки для измерения разницы яркости и сверки с ',
    archStep2DescAfter: '.',
    archStep3Title: '03. Компромисс ресурсов и задержки',
    archStep3DescBefore: 'Увеличение разрешения с ',
    archStep3DescMid1: ' до ',
    archStep3DescMid2:
      ' повышает число пикселей почти в 10 раз, нагружая бюджет кадра при высоком FPS свыше порога ',
    archStep3DescAfter: ' мс.',
    pythonSnippet: `import cv2
import numpy as np
import mss
import chess
import chess.engine

engine = chess.engine.SimpleEngine.from_uci("stockfish_path")
board = chess.Board()

def detect_move_from_frame(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    # Извлечение матрицы 8x8 и сравнение кадров для определения хода
    return "e2e4"

def analyze_and_explain(uci_move):
    move = chess.Move.from_uci(uci_move)
    if move in board.legal_moves:
        board.push(move)
        info = engine.analyse(board, chess.engine.Limit(depth=15))
        print(f"Ход: {uci_move} | Лучший: {info['pv'][0]} | Оценка: {info['score'].white()}")`,

    emptyServerResponse: (fallback, status) => `${fallback} (пустой ответ сервера: ${status})`,
    cloudFeatureRequiresServer:
      'Эта облачная функция ИИ требует подключения к серверу, но Stockfish и компьютерное зрение работают локально офлайн.',
    invalidServerJson: (status) =>
      `Сервер вернул некорректный ответ (не JSON). Проверьте запуск сервера (${status}).`,
    audioPlayError: 'Не удалось воспроизвести аудиофайл в браузере.',
    voiceCloudRequired:
      'Голосовые комментарии ИИ требуют подключения к серверу, а движок Stockfish WebAssembly работает офлайн.',
    voiceExplainFailed: 'Не удалось создать объяснение позиции.',
    voiceTtsFailed: 'Не удалось преобразовать текст в речь.',
    voiceGenericError: 'Произошла ошибка при озвучивании анализа.',
    stockfishAnalyzeFailed: 'Ошибка анализа Stockfish.',
    stockfishStartFailed: 'Не удалось запустить движок Stockfish.',
    cameraUnsupported: 'Захват медиапотока не поддерживается в данном браузере или контексте.',
    cameraDenied:
      'Доступ к камере отклонён. Разрешите доступ в настройках устройства и нажмите «Повторить».',
    cameraNotFound: 'Камера на устройстве не найдена.',
    cameraInUse: 'Камера занята другим приложением.',
    cameraAccessFailed: 'Не удалось получить доступ к камере.',
    detectedMoveStatus: (san, uci, confidence) => `Ход: ${san} (${uci}) · точность ${confidence}%`,
    noActiveFrameError: 'Нет активного кадра. Сначала включите камеру или загрузите фото.',
    roiCaptureError: 'Не удалось захватить область доски (ROI).',
    aiScanCloudRequired:
      'ИИ-распознавание фигур требует подключения к серверу, но Stockfish WebAssembly работает локально офлайн.',
    aiScanReadFailed: 'Не удалось распознать позицию на доске.',
    illegalBoardPosition: 'Распознанная позиция не прошла проверку правил шахмат.',
    perspectiveBlackFlipped: 'Чёрные (перевёрнутая матрица)',
    perspectiveWhiteBottom: 'Белые (нижняя часть)',
    scanReadSummary: (perspective, opponentSan, turnName) =>
      `Считано · ${perspective}${opponentSan ? ` · Соперник: ${opponentSan}` : ''} · Ход: ${turnName}`,
    aiScanGenericFailed: 'Ошибка ИИ-распознавания доски.',
    baselineCalibratedStatus: 'Эталонный кадр откалиброван',

    tabAnalyzer: 'Доска и зрение',
    tabCoach: 'Тренер',
    tabPuzzles: 'Задачи',

    coachTitle: 'Интерактивный тактический тренер',
    coachSubtitle: 'Тренируйте вилки, связки, вскрытые нападения, мат в 1 ход и мат по последней горизонтали с оценкой Stockfish.',
    coachAllTactics: 'Все',
    coachTactics: {
      fork: 'Вилка',
      pin: 'Связка',
      discovered: 'Вскрытое нападение',
      mateIn1: 'Мат в 1 ход',
      backRank: 'Мат по 8-й линии',
    },
    coachHintBtn: 'Подсказка тренера',
    coachPlayBestBtn: 'Сыграть лучший ход',
    coachResetBtn: 'Сбросить позицию',
    coachFlipBtn: 'Перевернуть доску',
    coachGoalLabel: 'Цель упражнения:',
    coachFeedbackTitle: 'Разбор и оценка тренера',
    coachEvalTitle: 'Оценка позиции Stockfish',
    coachStatusReady: 'Выберите фигуру и выполните нужный тактический приём.',
    coachStatusCorrect: 'Точный тактический удар!',
    coachStatusWrong: 'Неточный ход — попробуйте ещё раз или возьмите подсказку.',
    coachStatusSolvedByCoach: 'Лучший ход показан тренером',
    coachPlayedMoveLabel: (san) => `Ваш ход: ${san}`,
    coachBetterMoveLabel: (san) => `Лучший ход: ${san}`,
    coachNextDrillBtn: 'Следующее задание',
    coachDrillProgress: (index, total) => `Задание ${index} / ${total}`,
    coachAnalyzingEval: 'Локальная оценка позиции...',
    coachStockfishBestLabel: 'Выбор Stockfish:',
    coachWrongEvalNote: (playedSan, bestSan, evalAfter) =>
      `Вы сыграли ${playedSan} (оценка: ${evalAfter}), тогда как ${bestSan} немедленно решает задачу с решающим преимуществом.`,

    puzzlesTitle: 'Раздел шахматных задач (1 000 задач)',
    puzzlesSubtitle: 'Задачи по уровням (Новичок, Средний, Продвинутый) с автосохранением прогресса в localStorage.',
    puzzlesSolvedCountLabel: (solved, total) => `Решено: ${solved} / ${total}`,
    puzzlesSolvedBadge: 'Решено',
    puzzlesDifficultyAll: 'Все (1000)',
    puzzlesDifficultyLabels: {
      beginner: 'Новичок',
      intermediate: 'Средний',
      advanced: 'Продвинутый',
    },
    puzzlesThemeLabels: {
      mateIn1: 'Мат в 1 ход',
      backRank: 'Мат по последней линии',
      fork: 'Вилка',
      pin: 'Связка',
      discovered: 'Вскрытое нападение',
      skewer: 'Сквозной удар',
      sacrifice: 'Жертва',
      mateIn2: 'Мат в 2 хода',
      deflection: 'Отвлечение',
    },
    puzzlesPrevBtn: 'Назад',
    puzzlesNextBtn: 'Вперёд',
    puzzlesRandomBtn: 'Случайная задача',
    puzzlesJumpPlaceholder: '1 - 1000',
    puzzlesJumpBtn: 'Перейти',
    puzzlesHintBtn: 'Подсказка',
    puzzlesResetBtn: 'Сброс',
    puzzlesFlipBtn: 'Перевернуть',
    puzzlesNumberLabel: (id, total) => `Задача #${id} из ${total}`,
    puzzlesRatingLabel: (rating) => `Рейтинг ${rating}`,
    puzzlesTurnWhite: 'Ход белых — найдите лучший ход',
    puzzlesTurnBlack: 'Ход чёрных — найдите лучший ход',
    puzzlesStatusPrompt: 'Сделайте ход на доске, чтобы решить задачу.',
    puzzlesStatusOpponentReply: 'Ответ соперника...',
    puzzlesStatusCorrectContinue: 'Отлично! Найдите следующий ход.',
    puzzlesStatusSolved: 'Браво! Задача решена и сохранена.',
    puzzlesStatusWrong: 'Не лучший ход — попробуйте снова или нажмите «Подсказка».',
    puzzlesHintActiveLabel: (from, to) => `Подсказка: ${from} → ${to}`,

    coachModeTactics: 'Тактические задания',
    coachModePlayAi: 'Игра с Stockfish',
    playAiTitle: 'Шахматная доска — Игра против ИИ Stockfish',
    playAiSubtitle: 'Создайте полноценную доску и выберите уровень: Новичок, Средний, Продвинутый или Мастер.',
    playAiDifficultyLabel: 'Уровень ИИ Stockfish:',
    playAiLevels: {
      weak: 'Слабый',
      beginner: 'Новичок',
      intermediate: 'Средний',
      advanced: 'Продвинутый',
      master: 'Мастер',
    },
    playAiLevelSubtitles: {
      weak: '500 Elo · Глуб. 1',
      beginner: '1000 Elo · Глуб. 4',
      intermediate: '1500 Elo · Глуб. 7',
      advanced: '2000 Elo · Глуб. 11',
      master: '2500 Elo · Глуб. 15',
    },
    playAiSideLabel: 'Ваш цвет:',
    playAiNewBoardBtn: 'Новая доска',
    playAiUndoBtn: 'Назад',
    coachBestArrowBtn: 'Стрелка лучшего хода',
    playAiYourTurn: (sideName) => `Ваш ход (${sideName})`,
    playAiThinking: 'Stockfish думает...',
    playAiGameOverLabel: 'Партия завершена',
    playAiPlayAgainBtn: 'Сыграть снова',
    playAiMovesTitle: 'История ходов партии',
    playAiEmptyMoves: 'Сделайте ход любой фигурой на доске, чтобы начать партию против Stockfish.',
    playAiCoachTipTitle: 'Подсказка и оценка тренера',
    playAiHintMessage: (san, from, to) =>
      `Подсказка тренера: лучший ход ${san} (${from} → ${to}).`,
    playAiDefaultTip: 'Следите за шкалой оценки у края доски или нажмите «Подсказка тренера».',
    playAiLastAiMove: (san) => `Stockfish сыграл ${san}.`,
  },

  zh: {
    appTitle: '棋盘视觉 — 计算机视觉与 Stockfish UCI 引擎',
    brandName: '棋盘视觉',
    brandLogoAlt: '棋盘视觉徽标',
    navVision: '实时视觉',
    navBoard: '同步棋盘与 UCI',
    navProfiler: '资源分析',
    navReference: 'OpenCV 与 Python',
    startMonitoring: '开启实时监控',
    stopMonitoring: '停止实时监控',
    heroTitle: '计算机视觉棋盘识别与 Stockfish UCI 引擎',
    heroSubtitleBefore: '通过摄像头、交互式演示流或上传图片捕捉棋盘，实时查看边缘处理与 ',
    heroSubtitleAfter: ' 矩阵提取，结合 Stockfish 19 即时分析与 AI 语音讲解。',
    streamStatusLabel: '视频流:',
    streamActive: '● 检测中',
    streamPaused: '已暂停',
    depthLabel: '深度',
    clearCache: '清除缓存',
    clearingCache: '清除中...',
    clearCacheTooltip: '清除应用缓存、Service Worker 数据和引擎内存',
    cacheClearedCount: (count) => `已清除缓存 (${count})`,
    cacheClearedSuccess: '应用缓存已成功清除',
    offlineBanner: '离线模式 — Stockfish 正在本地通过 WebAssembly 运行',

    languageLabel: '语言',
    switchLanguageAria: '切换界面语言',

    pwaInstallButton: '安装安卓应用',
    pwaIosTitle: '在 iPhone / iPad 上安装应用',
    pwaAndroidTitle: '在安卓设备上直接安装 (PWA)',
    pwaClose: '关闭',
    pwaIosSteps: [
      '在设备上的 Safari 浏览器中打开此链接。',
      '点击浏览器工具栏上的“分享 (Share)”按钮。',
      '选择“添加到主屏幕 (Add to Home Screen)”。',
    ],
    pwaAndroidSteps: [
      '在安卓手机的 Chrome 浏览器中打开本应用链接。',
      '点击右上角浏览器菜单 (⋮)，然后选择“安装应用 (Install app)”。',
      '应用将作为独立程序安装到主屏幕，并拥有完整摄像头权限。',
    ],
    pwaCopyLink: '复制链接',
    pwaCopiedLink: '已复制',

    sourceVirtual: '交互流',
    sourceCamera: '摄像头',
    sourceImage: '上传图片',
    startCapture: '开始捕捉',
    stopCapture: '停止捕捉',
    viewOriginal: '原画面 + ROI',
    viewGrayscale: '灰度 (Blur)',
    viewCanny: 'Canny 边缘',
    viewHeatmap: '8×8 格差热力图',
    scanAiBtn: 'AI 识别局面',
    scanningAiBtn: '识别中...',
    scanAiTooltip: '从选定区域读取当前棋子布局并立即同步数字棋盘',
    detectionSoundBtn: '落子音效',
    detectionSoundTooltip: '开启或静音棋子移动检测提示音',
    calibrateBaselineBtn: '校准基准帧',
    calibrateBaselineTooltip: '保存当前帧作为后续检测走法的基准',
    resetRoiBtn: '重置 ROI',
    resetRoiTooltip: '重置棋盘四个角点',
    roiGuideBefore: '将四个青色控制点拖到 8×8 棋盘四角。若对局已在进行中，请点击',
    roiGuideAfter: '立即识别棋子并计算最佳着法。',
    retryBtn: '重试',
    cameraPausedMsg: '摄像头画面当前已暂停',
    uploadedImageAlt: '已上传的棋盘图片',
    cornerHandlePrefix: '角点控制',
    cornerLabels: ['左上', '右上', '右下', '左下'],
    waitingForFrame: '等待画面帧',
    activeDetection: '实时识别中',
    pausedLabel: '已暂停',
    capturePreviewBestMoveBtn: '抓拍预览并提取最佳着法',
    capturingPreviewBestMoveBtn: '正在抓取矩阵并计算最佳着法...',
    autoPlacePiecesBtn: '自动放置棋子',
    autoPlacePiecesTooltip:
      '自动将棋盘截图发送到外部 API 端点进行识别，并自动同步棋子到数字棋盘',
    autoPlaceActiveStatus: 'API 自动摆棋同步中',
    visionApiEndpointBtn: '截图 API 端点',
    visionApiEndpointLabel: '棋盘截图识别外部 API 端点：',
    visionApiPlaceholder: 'https://your-server.com/api/board-fen',
    saveEndpointBtn: '保存接口',
    activeEndpointLabel: '当前接口:',
    opponentMoveOnlyBtn: '仅限对手走法',
    opponentMoveOnlyTooltip: '忽略杂乱动作，仅分析对手走法以通过 UCI 生成最佳应对',
    yourZoneLabel: '己方区域（下半部分）：',
    whiteSideBtn: '白方',
    blackFlippedBtn: '黑方（翻转矩阵）',
    blackPerspectiveHint: '系统会自动翻转 8×8 矩阵以从黑方视角分析局面',
    whitePerspectiveHint: '下半部分为白方 · 通过 UCI 直接分析',
    capturedPreviewAlt: '已抓拍的棋盘预览图',
    capturedPreviewTitle: (time) => `抓拍预览 (${time})`,
    closePreviewAria: '关闭预览',
    previewBlackFlipped: '黑方（下半部分 · 旋转 180°）',
    previewWhiteBottom: '白方（下半部分）',
    opponentMoveLabel: '对手着法:',
    generatingUciReply: '正在通过 UCI 计算最佳应对...',
    bestReplyUciLabel: '最佳应对 (UCI):',
    applyMoveBtn: '应用此着法',
    positionReadyLabel: '局面已在数字棋盘上就绪',
    virtualScenarioLabel: '演示开局:',
    presetNames: {
      italian: '意大利开局 (Giuoco Piano)',
      sicilian: '西西里防御 (纳道夫)',
      queens_gambit: '后翼弃兵 (Queen’s Gambit)',
    },
    lightingNoiseBtn: '模拟光照噪点',
    resetStreamBtn: '重置演示流',
    stepVirtualMoveBtn: (step, total) => `推进演示着法 (${step}/${total})`,

    syncBoardTitle: '同步数字棋盘',
    turnPrefix: '轮到:',
    toggleTurnTooltip: '点击切换当前行棋方（白方/黑方）',
    whiteName: '白方',
    blackName: '黑方',
    arrowBtn: '箭头',
    arrowTooltip: '显示或隐藏 Stockfish 最佳着法箭头',
    flipBtn: '翻转',
    flipTooltip: '翻转棋盘视角',
    undoBtn: '悔棋',
    undoTooltip: '撤销上一步',
    resetBtn: '重置',
    resetTooltip: '恢复初始开局局面',
    evalBarAria: (label) => `Stockfish 评估条: ${label}`,
    squareAria: (sq) => `棋格 ${sq}`,
    analyzingStockfish: 'Stockfish 正在分析...',
    stockfishRecommendation: 'Stockfish 推荐:',
    activeFenMatrix: '当前 FEN 矩阵',
    editFenTooltip: '手动编辑或粘贴 FEN 字符串',
    fenPlaceholder: '在此粘贴 FEN...',
    applyFenBtn: '应用 FEN',
    invalidFenError: '无效或不合法的 FEN 格式。',

    engineTitle: 'Stockfish 19 UCI 引擎',
    depthShort: 'Depth',
    autoEloBtn: '自动 (Elo)',
    depthSliderLabel: '深度:',
    engineRemoteConnected: '外部 API 已连接（Stockfish 本地运行）',
    engineOfflineLocal: '离线模式 · 本地 WebAssembly 引擎',
    engineLocalAsm: '本地 Stockfish 引擎 (JS · 本地运行)',
    engineLocalWasm: '本地 Stockfish WebAssembly (本地运行)',
    stockfishWebsiteBtn: 'Stockfish 官网',
    verifyLocalEngineBtn: '验证本地引擎',
    verifyingLocalEngineBtn: '验证中...',
    localEngineVerifiedOk: (backend, bestMove, latencyMs) =>
      `本地验证通过 (${backend}) · 测试着法: ${bestMove} (${latencyMs}ms)`,
    localEngineVerifyFailed: (error) => `本地验证失败: ${error}`,
    externalVisionConnectedBadge: '外部 API 已就绪，可用于棋盘识别与语音',
    checkingServer: '检测中...',
    checkServer: '检测服务器',
    checkServerTooltip: '检测用于棋盘截图识别与 AI 语音的外部服务器连接',
    hideUrl: '隐藏地址',
    externalServerBtn: '外部 API 服务器',
    serverUrlPlaceholder: 'https://your-server.example.com (可选)',
    saveAndConnect: '保存并连接',
    defaultServerBtn: '默认',
    serverHelpText:
      'Stockfish 始终在浏览器和应用内通过 WebAssembly 本地运行；棋盘截图识别与可选语音讲解将发送到上方配置的外部服务器/API 端点。',
    evaluationLabel: '局面评估',
    bestMoveLabel: '最佳着法',
    applyBestMoveTooltip: '在棋盘上走这一步',
    searchSpeedLabel: '搜索速度',
    topLinesTitle: '候选变化 (MultiPV)',
    applyLineBtn: '走此步',
    emptyAnalysisHint: '移动棋子或开启视频流以评估当前局面。',
    uciLogTitle: '原始 UCI 协议日志',
    voiceCoachTitle: 'AI 语音教练',
    voiceCoachStoppedHint: '当前已关闭 · 需要语音讲解时开启',
    autoSpeakBtn: '自动播报',
    voiceSelectAria: '选择语音音色',
    voiceLabels: {
      Kore: 'Kore（稳重）',
      Charon: 'Charon（低沉）',
      Fenrir: 'Fenrir（果断）',
      Zephyr: 'Zephyr（清晰）',
      Puck: 'Puck（活泼）',
    },
    powerOff: '关闭',
    powerOn: '开启',
    generatingExplanation: '正在生成战术局势分析...',
    voiceCoachEmptyText: '点击“立即讲解并播报”或开启“自动播报”，由大语言模型解析 Stockfish 决策并语音朗读。',
    explainAndSpeakBtn: '立即讲解并播报',
    synthesizingAudioBtn: '正在合成语音...',
    stopAudioBtn: '停止播放',
    replayAudioBtn: '重新播放',
    moveLogTitle: '已识别着法记录',
    moveCount: (count) => `${count} 步`,
    emptyMoveLog: '暂无着法记录。请在视频流或棋盘上移动棋子。',
    sourceTagVision: 'OpenCV 视觉',
    sourceTagVirtual: '交互流',
    sourceTagManual: '手动',

    profilerTitle: '资源消耗与识别精度权衡 (OpenCV Profiler)',
    pressureOverBudget: '超出帧预算（可能延迟）',
    pressureMedium: '中等处理负载',
    pressureStable: '性能稳定无延迟',
    scanResolutionLabel: '扫描分辨率 (Scan Resolution)',
    targetFpsLabel: '目标帧率 (Target FPS)',
    cannyThresholdLabel: 'Canny 边缘阈值',
    motionSensitivityLabel: '格区变化灵敏度',
    gaussianBlurLabel: '启用 GaussianBlur (5×5) 降低摄像头噪点',
    playerEloLabel: '棋手等级分 (Elo)',
    eloSliderAria: '棋手 Elo 等级分滑块',
    eloPresets: [
      { elo: 1000, label: '入门 1000' },
      { elo: 1500, label: '中级 1500' },
      { elo: 2000, label: '高级 2000' },
      { elo: 2500, label: '大师 2500' },
    ],
    autoDepthByEloLabel: '根据棋手等级分自动映射 Stockfish 搜索深度',
    frameTimeVsBudgetLabel: '实际帧处理耗时 vs 帧预算',
    budgetSvgText: (ms) => `预算 ${ms}ms`,
    stageCapture: '采集',
    stageBlur: 'Blur 5×5',
    stageCanny: 'Canny',
    stageMatrix: '8×8 矩阵',
    matrixDiffTitle: '8×8 差值矩阵',

    archTitle: '系统架构与代码参考 (Python OpenCV + Stockfish UCI)',
    downloadZipBtn: '下载源码 (.zip)',
    copyPythonBtn: '复制 Python 代码',
    copiedBtn: '已复制',
    archStep1Title: '01. 帧捕捉与预处理',
    archStep1DescBefore: '捕捉到的图像转为灰度图后，使用 ',
    archStep1DescMid: ' 平滑传感器噪点，再通过 ',
    archStep1DescAfter: ' 提取棋盘边缘。',
    archStep2Title: '02. 8×8 矩阵与合法着法匹配',
    archStep2DescBefore: '将兴趣区域 (ROI) 划分为 64 个方格，计算相邻帧亮度差并与 ',
    archStep2DescAfter: ' 合法着法匹配。',
    archStep3Title: '03. 资源消耗与延迟权衡',
    archStep3DescBefore: '将扫描分辨率从 ',
    archStep3DescMid1: ' 提高到 ',
    archStep3DescMid2: ' 会使像素数量增加近 10 倍；在高帧率下若处理耗时超过 ',
    archStep3DescAfter: ' 毫秒，将超出每帧预算。',
    pythonSnippet: `import cv2
import numpy as np
import mss
import chess
import chess.engine

engine = chess.engine.SimpleEngine.from_uci("stockfish_path")
board = chess.Board()

def detect_move_from_frame(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    # 提取 8x8 矩阵并对比前后帧以检测走法
    return "e2e4"

def analyze_and_explain(uci_move):
    move = chess.Move.from_uci(uci_move)
    if move in board.legal_moves:
        board.push(move)
        info = engine.analyse(board, chess.engine.Limit(depth=15))
        print(f"走法: {uci_move} | 最佳应对: {info['pv'][0]} | 评估: {info['score'].white()}")`,

    emptyServerResponse: (fallback, status) => `${fallback} (服务器响应为空: ${status})`,
    cloudFeatureRequiresServer:
      '此云端 AI 功能需要连接服务器，而 Stockfish 与计算机视觉可在本地完全离线运行。',
    invalidServerJson: (status) => `服务器返回格式无效（非 JSON），请检查服务器状态 (${status})。`,
    audioPlayError: '浏览器无法播放此音频。',
    voiceCloudRequired:
      '云端 AI 语音讲解需要连接服务器，Stockfish WebAssembly 引擎可在无网络下本地运行。',
    voiceExplainFailed: '生成战术解析失败。',
    voiceTtsFailed: '语音合成失败。',
    voiceGenericError: '语音讲解过程中发生错误。',
    stockfishAnalyzeFailed: 'Stockfish 分析失败。',
    stockfishStartFailed: '无法启动 Stockfish 引擎。',
    cameraUnsupported: '当前浏览器或环境不支持媒体捕捉接口。',
    cameraDenied: '摄像头权限被拒绝。请在设备设置中允许访问摄像头，然后点击“重试”。',
    cameraNotFound: '未在此设备上检测到可用摄像头。',
    cameraInUse: '摄像头正被其他应用占用。',
    cameraAccessFailed: '无法访问摄像头。',
    detectedMoveStatus: (san, uci, confidence) => `已识别: ${san} (${uci}) · 置信度 ${confidence}%`,
    noActiveFrameError: '当前没有活动画面。请先开启摄像头或上传图片。',
    roiCaptureError: '无法截取棋盘选定区域 (ROI)。',
    aiScanCloudRequired:
      'AI 棋子识别需要连接服务器，Stockfish WebAssembly 可在本地离线运行。',
    aiScanReadFailed: '无法读取棋盘局面。',
    illegalBoardPosition: '识别出的局面未通过国际象棋规则合法性校验。',
    perspectiveBlackFlipped: '黑方（翻转矩阵）',
    perspectiveWhiteBottom: '白方（下半区）',
    scanReadSummary: (perspective, opponentSan, turnName) =>
      `已识别 · ${perspective}${opponentSan ? ` · 对手着法: ${opponentSan}` : ''} · 轮到: ${turnName}`,
    aiScanGenericFailed: 'AI 识别棋盘失败。',
    baselineCalibratedStatus: '基准参考帧已校准',

    tabAnalyzer: '棋盘与识别',
    tabCoach: '战术教练',
    tabPuzzles: '谜题训练',

    coachTitle: '交互式战术教练',
    coachSubtitle: '专项训练捉双、牵制、闪击、一步杀与底线杀，实时结合 Stockfish 局面评估。',
    coachAllTactics: '全部',
    coachTactics: {
      fork: '捉双',
      pin: '牵制',
      discovered: '闪击',
      mateIn1: '一步杀',
      backRank: '底线杀',
    },
    coachHintBtn: '教练提示',
    coachPlayBestBtn: '走出最佳着法',
    coachResetBtn: '重置局面',
    coachFlipBtn: '翻转棋盘',
    coachGoalLabel: '训练目标：',
    coachFeedbackTitle: '教练解析与评估',
    coachEvalTitle: 'Stockfish 局面评估',
    coachStatusReady: '点击棋子并走子以完成本局战术。',
    coachStatusCorrect: '战术着法精准！',
    coachStatusWrong: '这步不够精确 — 请重试或点击“教练提示”。',
    coachStatusSolvedByCoach: '教练已演示最佳着法',
    coachPlayedMoveLabel: (san) => `你的着法：${san}`,
    coachBetterMoveLabel: (san) => `最佳着法：${san}`,
    coachNextDrillBtn: '下一题',
    coachDrillProgress: (index, total) => `第 ${index} / ${total} 题`,
    coachAnalyzingEval: '正在本地评估局面...',
    coachStockfishBestLabel: 'Stockfish 推荐：',
    coachWrongEvalNote: (playedSan, bestSan, evalAfter) =>
      `你走了 ${playedSan}（局势评估：${evalAfter}），而最佳着法 ${bestSan} 能直接兑现战术优势。`,

    puzzlesTitle: '千题战术训练（1,000 道棋局谜题）',
    puzzlesSubtitle: '分级谜题（初级、中级、高级），自动保存已解题数量到本地存储。',
    puzzlesSolvedCountLabel: (solved, total) => `已完成：${solved} / ${total}`,
    puzzlesSolvedBadge: '已解决',
    puzzlesDifficultyAll: '全部 (1000)',
    puzzlesDifficultyLabels: {
      beginner: '初级',
      intermediate: '中级',
      advanced: '高级',
    },
    puzzlesThemeLabels: {
      mateIn1: '一步杀',
      backRank: '底线杀',
      fork: '捉双',
      pin: '牵制',
      discovered: '闪击',
      skewer: '串击',
      sacrifice: '弃子战术',
      mateIn2: '两步杀',
      deflection: '引离战术',
    },
    puzzlesPrevBtn: '上一题',
    puzzlesNextBtn: '下一题',
    puzzlesRandomBtn: '随机一题',
    puzzlesJumpPlaceholder: '1 - 1000',
    puzzlesJumpBtn: '跳转',
    puzzlesHintBtn: '提示',
    puzzlesResetBtn: '重置',
    puzzlesFlipBtn: '翻转棋盘',
    puzzlesNumberLabel: (id, total) => `第 #${id} 题 / 共 ${total} 题`,
    puzzlesRatingLabel: (rating) => `等级分 ${rating}`,
    puzzlesTurnWhite: '轮到白方 — 寻找最佳着法',
    puzzlesTurnBlack: '轮到黑方 — 寻找最佳着法',
    puzzlesStatusPrompt: '在棋盘上走子完成解谜。',
    puzzlesStatusOpponentReply: '对手正在应着...',
    puzzlesStatusCorrectContinue: '走得好！继续完成后续着法。',
    puzzlesStatusSolved: '太棒了！已成功解决并保存进度。',
    puzzlesStatusWrong: '不是最佳选择 — 请再试一次或点击“提示”。',
    puzzlesHintActiveLabel: (from, to) => `提示：从 ${from} 走到 ${to}`,

    coachModeTactics: '战术训练',
    coachModePlayAi: '对战 Stockfish',
    playAiTitle: '对弈棋盘 — 与 Stockfish AI 对战',
    playAiSubtitle: '创建完整棋盘，自由选择初级、中级、高级或大师难度与 Stockfish 实时对弈。',
    playAiDifficultyLabel: 'Stockfish AI 难度：',
    playAiLevels: {
      weak: '入门',
      beginner: '初级',
      intermediate: '中级',
      advanced: '高级',
      master: '大师',
    },
    playAiLevelSubtitles: {
      weak: '500 Elo · 深度 1',
      beginner: '1000 Elo · 深度 4',
      intermediate: '1500 Elo · 深度 7',
      advanced: '2000 Elo · 深度 11',
      master: '2500 Elo · 深度 15',
    },
    playAiSideLabel: '执子颜色：',
    playAiNewBoardBtn: '新建棋盘',
    playAiUndoBtn: '悔棋',
    coachBestArrowBtn: '最佳着法箭头',
    playAiYourTurn: (sideName) => `轮到你走（${sideName}）`,
    playAiThinking: 'Stockfish 正在思考...',
    playAiGameOverLabel: '对局结束',
    playAiPlayAgainBtn: '再来一局',
    playAiMovesTitle: '对局着法记录',
    playAiEmptyMoves: '在棋盘上移动任意棋子即可开始与 Stockfish 对弈。',
    playAiCoachTipTitle: '教练实时评估',
    playAiHintMessage: (san, from, to) => `教练提示：推荐着法为 ${san}（${from} → ${to}）。`,
    playAiDefaultTip: '关注棋盘侧面的局势评估条，或随时点击“教练提示”。',
    playAiLastAiMove: (san) => `Stockfish 走了 ${san}。`,
  },

  fr: {
    appTitle: 'Chess Vision — Vision par Ordinateur & Stockfish UCI',
    brandName: 'Chess Vision',
    brandLogoAlt: 'Logo Chess Vision',
    navVision: 'Flux & Vision',
    navBoard: 'Échiquier & UCI',
    navProfiler: 'Ressources OpenCV',
    navReference: 'Référence Python',
    startMonitoring: 'Démarrer la surveillance',
    stopMonitoring: 'Arrêter la surveillance',
    heroTitle: 'Détection d’échiquier par vision et moteur Stockfish UCI',
    heroSubtitleBefore:
      'Capturez l’échiquier via caméra, flux interactif ou image, inspectez les contours et la matrice ',
    heroSubtitleAfter: ' avec analyse Stockfish 19 instantanée et coach vocal IA.',
    streamStatusLabel: 'Flux :',
    streamActive: '● Actif',
    streamPaused: 'En pause',
    depthLabel: 'Profondeur',
    clearCache: 'Vider le cache',
    clearingCache: 'Nettoyage...',
    clearCacheTooltip: 'Vider le cache de l’application, du Service Worker et du moteur',
    cacheClearedCount: (count) => `Cache vidé (${count})`,
    cacheClearedSuccess: 'Cache vidé avec succès',
    offlineBanner: 'Mode hors ligne — Stockfish fonctionne localement via WebAssembly',

    languageLabel: 'Langue',
    switchLanguageAria: 'Changer la langue de l’interface',

    pwaInstallButton: 'Installer sur Android',
    pwaIosTitle: 'Installer sur iPhone / iPad',
    pwaAndroidTitle: 'Installer directement sur Android (PWA)',
    pwaClose: 'Fermer',
    pwaIosSteps: [
      'Ouvrez ce lien dans Safari sur votre appareil.',
      'Appuyez sur le bouton Partager dans la barre du navigateur.',
      'Sélectionnez « Sur l’écran d’accueil ».',
    ],
    pwaAndroidSteps: [
      'Ouvrez ce lien dans Chrome sur votre téléphone Android.',
      'Ouvrez le menu du navigateur (⋮) puis choisissez « Installer l’application ».',
      'L’application s’installera sur votre écran d’accueil avec accès complet à la caméra.',
    ],
    pwaCopyLink: 'Copier le lien',
    pwaCopiedLink: 'Copié',

    sourceVirtual: 'Flux interactif',
    sourceCamera: 'Caméra',
    sourceImage: 'Importer image',
    startCapture: 'Démarrer',
    stopCapture: 'Arrêter',
    viewOriginal: 'Original + ROI',
    viewGrayscale: 'Niveaux de gris',
    viewCanny: 'Contours Canny',
    viewHeatmap: 'Différences 8×8',
    scanAiBtn: 'Scanner (IA)',
    scanningAiBtn: 'Analyse...',
    scanAiTooltip: 'Lire la position des pièces depuis la zone sélectionnée et synchroniser',
    detectionSoundBtn: 'Son de détection',
    detectionSoundTooltip: 'Activer ou couper le son lors de la détection d’un coup',
    calibrateBaselineBtn: 'Calibrer référence',
    calibrateBaselineTooltip: 'Enregistrer l’image actuelle comme référence pour les coups suivants',
    resetRoiBtn: 'Réinit. ROI',
    resetRoiTooltip: 'Réinitialiser les quatre coins de l’échiquier',
    roiGuideBefore:
      'Glissez les quatre points cyan sur les coins de l’échiquier 8×8. Si une partie est en cours, cliquez sur',
    roiGuideAfter: 'pour lire les pièces et obtenir le meilleur coup immédiatement.',
    retryBtn: 'Réessayer',
    cameraPausedMsg: 'Le flux caméra est actuellement en pause',
    uploadedImageAlt: 'Image de l’échiquier importée',
    cornerHandlePrefix: 'Poignée de coin',
    cornerLabels: ['Haut-Gauche', 'Haut-Droit', 'Bas-Droit', 'Bas-Gauche'],
    waitingForFrame: 'En attente d’image',
    activeDetection: 'Détection active',
    pausedLabel: 'En pause',
    capturePreviewBestMoveBtn: 'Capturer pour aperçu et trouver le meilleur coup',
    capturingPreviewBestMoveBtn: 'Capture de la matrice et calcul du meilleur coup...',
    autoPlacePiecesBtn: 'Placement auto',
    autoPlacePiecesTooltip:
      'Envoyer automatiquement les captures d’échiquier à l’API externe pour analyser et placer les pièces',
    autoPlaceActiveStatus: 'Synchro auto par API active',
    visionApiEndpointBtn: 'URL API captures',
    visionApiEndpointLabel: 'Point de terminaison API pour les captures :',
    visionApiPlaceholder: 'https://your-server.com/api/board-fen',
    saveEndpointBtn: 'Enregistrer',
    activeEndpointLabel: 'URL active :',
    opponentMoveOnlyBtn: 'Coup adverse seul',
    opponentMoveOnlyTooltip:
      'Ignorer les mouvements aléatoires et analyser uniquement le coup adverse via UCI',
    yourZoneLabel: 'Votre camp (moitié basse) :',
    whiteSideBtn: 'Blancs',
    blackFlippedBtn: 'Noirs (Inverser)',
    blackPerspectiveHint: 'La matrice 8×8 est inversée par code pour le point de vue des Noirs',
    whitePerspectiveHint: 'Moitié basse pour les Blancs · analyse UCI directe',
    capturedPreviewAlt: 'Aperçu de l’échiquier capturé',
    capturedPreviewTitle: (time) => `Aperçu capturé (${time})`,
    closePreviewAria: 'Fermer l’aperçu',
    previewBlackFlipped: 'Noirs (Moitié basse · Rotation 180°)',
    previewWhiteBottom: 'Blancs (Moitié basse)',
    opponentMoveLabel: 'Coup adverse :',
    generatingUciReply: 'Calcul de la meilleure réponse UCI...',
    bestReplyUciLabel: 'Meilleure réponse (UCI) :',
    applyMoveBtn: 'Jouer le coup',
    positionReadyLabel: 'Position prête sur l’échiquier numérique',
    virtualScenarioLabel: 'Scénario :',
    presetNames: {
      italian: 'Partie Italienne (Giuoco Piano)',
      sicilian: 'Défense Sicilienne (Najdorf)',
      queens_gambit: 'Gambit Dame',
    },
    lightingNoiseBtn: 'Bruit d’éclairage',
    resetStreamBtn: 'Réinitialiser flux',
    stepVirtualMoveBtn: (step, total) => `Jouer coup du flux (${step}/${total})`,

    syncBoardTitle: 'Échiquier synchronisé',
    turnPrefix: 'Trait :',
    toggleTurnTooltip: 'Cliquer pour inverser le trait entre Blancs et Noirs',
    whiteName: 'Blancs',
    blackName: 'Noirs',
    arrowBtn: 'Flèche',
    arrowTooltip: 'Afficher ou masquer la flèche du meilleur coup Stockfish',
    flipBtn: 'Inverser',
    flipTooltip: 'Inverser l’orientation de l’échiquier',
    undoBtn: 'Annuler',
    undoTooltip: 'Annuler le dernier coup',
    resetBtn: 'Réinit.',
    resetTooltip: 'Réinitialiser la position de départ',
    evalBarAria: (label) => `Barre d’évaluation Stockfish : ${label}`,
    squareAria: (sq) => `Case ${sq}`,
    analyzingStockfish: 'Analyse Stockfish...',
    stockfishRecommendation: 'Conseil Stockfish :',
    activeFenMatrix: 'Matrice FEN active',
    editFenTooltip: 'Modifier ou coller une chaîne FEN manuellement',
    fenPlaceholder: 'Coller la chaîne FEN...',
    applyFenBtn: 'Appliquer FEN',
    invalidFenError: 'Format FEN invalide ou illégal.',

    engineTitle: 'Moteur Stockfish 19 UCI',
    depthShort: 'Depth',
    autoEloBtn: 'Auto (Elo)',
    depthSliderLabel: 'Prof. :',
    engineRemoteConnected: 'API externe connectée (Stockfish local)',
    engineOfflineLocal: 'Hors ligne · Moteur WebAssembly local',
    engineLocalAsm: 'Moteur Stockfish local (JS · local)',
    engineLocalWasm: 'Stockfish WebAssembly local (exécution locale)',
    stockfishWebsiteBtn: 'Site Stockfish',
    verifyLocalEngineBtn: 'Vérifier moteur local',
    verifyingLocalEngineBtn: 'Vérification...',
    localEngineVerifiedOk: (backend, bestMove, latencyMs) =>
      `Vérifié localement (${backend}) · coup test : ${bestMove} (${latencyMs}ms)`,
    localEngineVerifyFailed: (error) => `Échec de vérification locale : ${error}`,
    externalVisionConnectedBadge: 'API externe prête pour captures et voix IA',
    checkingServer: 'Vérification...',
    checkServer: 'Tester serveur',
    checkServerTooltip: 'Tester la connexion au serveur externe pour captures et voix IA',
    hideUrl: 'Masquer URL',
    externalServerBtn: 'Serveur API externe',
    serverUrlPlaceholder: 'https://votre-serveur.exemple.com (optionnel)',
    saveAndConnect: 'Enregistrer',
    defaultServerBtn: 'Par défaut',
    serverHelpText:
      'Stockfish s’exécute toujours localement via WebAssembly dans le navigateur et l’application, tandis que le serveur/API externe ci-dessus reçoit les captures pour placer les pièces.',
    evaluationLabel: 'Évaluation',
    bestMoveLabel: 'Meilleur coup',
    applyBestMoveTooltip: 'Appliquer ce coup sur l’échiquier',
    searchSpeedLabel: 'Vitesse',
    topLinesTitle: 'Meilleures variantes (MultiPV)',
    applyLineBtn: 'Jouer',
    emptyAnalysisHint: 'Déplacez une pièce ou démarrez le flux pour évaluer la position.',
    uciLogTitle: 'Journal brut du protocole UCI',
    voiceCoachTitle: 'Coach vocal IA',
    voiceCoachStoppedHint: 'Désactivé · Activez-le pour les commentaires vocaux',
    autoSpeakBtn: 'Lecture auto',
    voiceSelectAria: 'Choisir la voix',
    voiceLabels: {
      Kore: 'Kore (Équilibrée)',
      Charon: 'Charon (Grave)',
      Fenrir: 'Fenrir (Ferme)',
      Zephyr: 'Zephyr (Claire)',
      Puck: 'Puck (Dynamique)',
    },
    powerOff: 'Désactiver',
    powerOn: 'Activer',
    generatingExplanation: 'Rédaction de l’analyse stratégique...',
    voiceCoachEmptyText:
      'Cliquez sur « Expliquer et lire » ou activez « Lecture auto » pour obtenir un commentaire vocal sur le coup Stockfish.',
    explainAndSpeakBtn: 'Expliquer et lire',
    synthesizingAudioBtn: 'Synthèse vocale...',
    stopAudioBtn: 'Arrêter l’audio',
    replayAudioBtn: 'Réécouter',
    moveLogTitle: 'Historique des coups',
    moveCount: (count) => `${count} ${count <= 1 ? 'coup' : 'coups'}`,
    emptyMoveLog: 'Aucun coup enregistré. Déplacez une pièce dans le flux ou sur l’échiquier.',
    sourceTagVision: 'Vision OpenCV',
    sourceTagVirtual: 'Flux interactif',
    sourceTagManual: 'Manuel',

    profilerTitle: 'Compromis ressources et précision (OpenCV Profiler)',
    pressureOverBudget: 'Budget d’image dépassé (latence possible)',
    pressureMedium: 'Charge de traitement modérée',
    pressureStable: 'Performances stables sans latence',
    scanResolutionLabel: 'Résolution d’analyse',
    targetFpsLabel: 'FPS cible',
    cannyThresholdLabel: 'Seuil Canny',
    motionSensitivityLabel: 'Sensibilité de case',
    gaussianBlurLabel: 'Activer GaussianBlur (5×5) pour réduire le bruit caméra',
    playerEloLabel: 'Niveau du joueur (Elo)',
    eloSliderAria: 'Curseur de classement Elo',
    eloPresets: [
      { elo: 1000, label: 'Débutant 1000' },
      { elo: 1500, label: 'Interm. 1500' },
      { elo: 2000, label: 'Avancé 2000' },
      { elo: 2500, label: 'Maître 2500' },
    ],
    autoDepthByEloLabel: 'Ajuster automatiquement la profondeur Stockfish selon l’Elo',
    frameTimeVsBudgetLabel: 'Temps de traitement réel vs budget',
    budgetSvgText: (ms) => `Budget ${ms}ms`,
    stageCapture: 'Capture',
    stageBlur: 'Blur 5×5',
    stageCanny: 'Canny',
    stageMatrix: 'Matrice 8×8',
    matrixDiffTitle: 'Matrice des écarts 8×8',

    archTitle: 'Architecture système & référence (Python OpenCV + Stockfish UCI)',
    downloadZipBtn: 'Télécharger (.zip)',
    copyPythonBtn: 'Copier code Python',
    copiedBtn: 'Copié',
    archStep1Title: '01. Capture d’images et prétraitement',
    archStep1DescBefore: 'Les images capturées sont converties en niveaux de gris puis filtrées via ',
    archStep1DescMid: ' pour réduire le bruit avant la détection des contours ',
    archStep1DescAfter: '.',
    archStep2Title: '02. Correspondance matrice 8×8 et coups légaux',
    archStep2DescBefore:
      'La zone d’intérêt (ROI) est divisée en 64 cases pour mesurer la variation de luminance et la relier à ',
    archStep2DescAfter: '.',
    archStep3Title: '03. Compromis ressources et latence',
    archStep3DescBefore: 'Passer la résolution de ',
    archStep3DescMid1: ' à ',
    archStep3DescMid2:
      ' multiplie le nombre de pixels par près de 10, sollicitant le budget par image au-delà de ',
    archStep3DescAfter: ' ms à haute fréquence.',
    pythonSnippet: `import cv2
import numpy as np
import mss
import chess
import chess.engine

engine = chess.engine.SimpleEngine.from_uci("stockfish_path")
board = chess.Board()

def detect_move_from_frame(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    # Extraction de la matrice 8x8 et comparaison des images pour détecter le coup
    return "e2e4"

def analyze_and_explain(uci_move):
    move = chess.Move.from_uci(uci_move)
    if move in board.legal_moves:
        board.push(move)
        info = engine.analyse(board, chess.engine.Limit(depth=15))
        print(f"Coup : {uci_move} | Meilleur : {info['pv'][0]} | Éval : {info['score'].white()}")`,

    emptyServerResponse: (fallback, status) => `${fallback} (réponse vide du serveur : ${status})`,
    cloudFeatureRequiresServer:
      'Cette fonctionnalité cloud nécessite un serveur connecté, tandis que Stockfish et la vision fonctionnent hors ligne.',
    invalidServerJson: (status) =>
      `Réponse serveur invalide (non JSON). Vérifiez que le serveur est actif (${status}).`,
    audioPlayError: 'Impossible de lire l’audio dans ce navigateur.',
    voiceCloudRequired:
      'Le commentaire vocal cloud nécessite le serveur, alors que Stockfish WebAssembly fonctionne hors ligne.',
    voiceExplainFailed: 'Échec de génération de l’explication tactique.',
    voiceTtsFailed: 'Échec de synthèse vocale.',
    voiceGenericError: 'Une erreur est survenue lors du commentaire vocal.',
    stockfishAnalyzeFailed: 'Échec de l’analyse Stockfish.',
    stockfishStartFailed: 'Impossible de démarrer le moteur Stockfish.',
    cameraUnsupported: 'La capture média n’est pas prise en charge dans ce contexte.',
    cameraDenied:
      'Autorisation caméra refusée. Autorisez la caméra dans les paramètres puis cliquez sur Réessayer.',
    cameraNotFound: 'Aucune caméra détectée sur cet appareil.',
    cameraInUse: 'La caméra est actuellement utilisée par une autre application.',
    cameraAccessFailed: 'Impossible d’accéder à la caméra.',
    detectedMoveStatus: (san, uci, confidence) =>
      `Détecté : ${san} (${uci}) · conf. ${confidence}%`,
    noActiveFrameError: 'Aucune image active. Démarrez la caméra ou importez une image.',
    roiCaptureError: 'Impossible de capturer la zone de l’échiquier (ROI).',
    aiScanCloudRequired:
      'La reconnaissance IA nécessite une connexion au serveur, tandis que Stockfish WebAssembly fonctionne hors ligne.',
    aiScanReadFailed: 'Impossible de lire la position de l’échiquier.',
    illegalBoardPosition: 'La position détectée n’est pas légale selon les règles des échecs.',
    perspectiveBlackFlipped: 'Noirs (Matrice inversée)',
    perspectiveWhiteBottom: 'Blancs (Moitié basse)',
    scanReadSummary: (perspective, opponentSan, turnName) =>
      `Scanné · ${perspective}${opponentSan ? ` · Adversaire : ${opponentSan}` : ''} · Trait : ${turnName}`,
    aiScanGenericFailed: 'Échec de la lecture IA de l’échiquier.',
    baselineCalibratedStatus: 'Image de référence calibrée',

    tabAnalyzer: 'Échiquier & Vision',
    tabCoach: 'Coach',
    tabPuzzles: 'Problèmes',

    coachTitle: 'Coach Tactique Interactif',
    coachSubtitle: 'Entraînez-vous aux fourchettes, clouages, découvertes, mats en 1 coup et mats du couloir avec Stockfish.',
    coachAllTactics: 'Tout',
    coachTactics: {
      fork: 'Fourchette',
      pin: 'Clouage',
      discovered: 'Attaque à la découverte',
      mateIn1: 'Mat en 1 coup',
      backRank: 'Mat du couloir',
    },
    coachHintBtn: 'Indice du coach',
    coachPlayBestBtn: 'Jouer le meilleur coup',
    coachResetBtn: 'Réinitialiser',
    coachFlipBtn: 'Inverser l’échiquier',
    coachGoalLabel: 'Objectif de l’exercice :',
    coachFeedbackTitle: 'Explication du coach & évaluation',
    coachEvalTitle: 'Évaluation Stockfish',
    coachStatusReady: 'Sélectionnez une pièce et jouez le coup tactique.',
    coachStatusCorrect: 'Coup tactique exact !',
    coachStatusWrong: 'Coup imprécis — réessayez ou demandez un indice.',
    coachStatusSolvedByCoach: 'Meilleur coup exécuté par le coach',
    coachPlayedMoveLabel: (san) => `Votre coup : ${san}`,
    coachBetterMoveLabel: (san) => `Meilleur coup : ${san}`,
    coachNextDrillBtn: 'Exercice suivant',
    coachDrillProgress: (index, total) => `Exercice ${index} / ${total}`,
    coachAnalyzingEval: 'Évaluation locale en cours...',
    coachStockfishBestLabel: 'Choix Stockfish :',
    coachWrongEvalNote: (playedSan, bestSan, evalAfter) =>
      `Vous avez joué ${playedSan} (éval : ${evalAfter}), alors que ${bestSan} concrétise immédiatement le motif tactique.`,

    puzzlesTitle: 'Section Problèmes (1 000 problèmes d’échecs)',
    puzzlesSubtitle: 'Niveaux progressifs (Débutant, Intermédiaire, Avancé) avec sauvegarde automatique dans localStorage.',
    puzzlesSolvedCountLabel: (solved, total) => `Résolus : ${solved} / ${total}`,
    puzzlesSolvedBadge: 'Résolu',
    puzzlesDifficultyAll: 'Tous (1000)',
    puzzlesDifficultyLabels: {
      beginner: 'Débutant',
      intermediate: 'Intermédiaire',
      advanced: 'Avancé',
    },
    puzzlesThemeLabels: {
      mateIn1: 'Mat en 1 coup',
      backRank: 'Mat du couloir',
      fork: 'Fourchette',
      pin: 'Clouage',
      discovered: 'Découverte',
      skewer: 'Enfilade',
      sacrifice: 'Sacrifice décisif',
      mateIn2: 'Mat en 2 coups',
      deflection: 'Déviation',
    },
    puzzlesPrevBtn: 'Précédent',
    puzzlesNextBtn: 'Suivant',
    puzzlesRandomBtn: 'Aléatoire',
    puzzlesJumpPlaceholder: '1 - 1000',
    puzzlesJumpBtn: 'Aller',
    puzzlesHintBtn: 'Indice',
    puzzlesResetBtn: 'Réinit.',
    puzzlesFlipBtn: 'Inverser',
    puzzlesNumberLabel: (id, total) => `Problème #${id} sur ${total}`,
    puzzlesRatingLabel: (rating) => `Elo ${rating}`,
    puzzlesTurnWhite: 'Trait aux Blancs — Trouvez le meilleur coup',
    puzzlesTurnBlack: 'Trait aux Noirs — Trouvez le meilleur coup',
    puzzlesStatusPrompt: 'Déplacez une pièce pour résoudre le problème.',
    puzzlesStatusOpponentReply: 'Réponse adverse...',
    puzzlesStatusCorrectContinue: 'Bien joué ! Trouvez la suite pour conclure.',
    puzzlesStatusSolved: 'Bravo ! Problème résolu et enregistré.',
    puzzlesStatusWrong: 'Ce n’est pas le meilleur coup — réessayez ou utilisez Indice.',
    puzzlesHintActiveLabel: (from, to) => `Indice : ${from} → ${to}`,

    coachModeTactics: 'Exercices tactiques',
    coachModePlayAi: 'Jouer contre Stockfish',
    playAiTitle: 'Échiquier — Jouer contre l’IA Stockfish',
    playAiSubtitle: 'Créez un échiquier complet et choisissez le niveau Débutant, Intermédiaire, Avancé ou Maître.',
    playAiDifficultyLabel: 'Niveau de Stockfish :',
    playAiLevels: {
      weak: 'Faible',
      beginner: 'Débutant',
      intermediate: 'Intermédiaire',
      advanced: 'Avancé',
      master: 'Maître',
    },
    playAiLevelSubtitles: {
      weak: '500 Elo · Prof. 1',
      beginner: '1000 Elo · Prof. 4',
      intermediate: '1500 Elo · Prof. 7',
      advanced: '2000 Elo · Prof. 11',
      master: '2500 Elo · Prof. 15',
    },
    playAiSideLabel: 'Votre camp :',
    playAiNewBoardBtn: 'Nouvel échiquier',
    playAiUndoBtn: 'Annuler',
    coachBestArrowBtn: 'Flèche meilleur coup',
    playAiYourTurn: (sideName) => `À vous de jouer (${sideName})`,
    playAiThinking: 'Stockfish réfléchit...',
    playAiGameOverLabel: 'Partie terminée',
    playAiPlayAgainBtn: 'Rejouer',
    playAiMovesTitle: 'Historique de la partie',
    playAiEmptyMoves: 'Déplacez une pièce sur l’échiquier pour commencer la partie contre Stockfish.',
    playAiCoachTipTitle: 'Évaluation en direct du coach',
    playAiHintMessage: (san, from, to) =>
      `Indice du coach : coup recommandé ${san} (${from} → ${to}).`,
    playAiDefaultTip: 'Observez la barre d’évaluation ou demandez un indice à tout moment.',
    playAiLastAiMove: (san) => `Stockfish a joué ${san}.`,
  },
};

export type GameOverKey =
  | 'checkmate_black'
  | 'checkmate_white'
  | 'stalemate'
  | 'threefold'
  | 'insufficient'
  | 'draw';

const GAME_OVER_LABELS: Record<SupportedLanguage, Record<GameOverKey, string>> = {
  ar: {
    checkmate_black: 'كش مات لصالح الأسود',
    checkmate_white: 'كش مات لصالح الأبيض',
    stalemate: 'تعادل بالردب (Stalemate)',
    threefold: 'تعادل بتكرار الوضعية ثلاث مرات',
    insufficient: 'تعادل لعدم كفاية القطع',
    draw: 'تعادل',
  },
  en: {
    checkmate_black: 'Checkmate — Black wins',
    checkmate_white: 'Checkmate — White wins',
    stalemate: 'Draw by Stalemate',
    threefold: 'Draw by Threefold Repetition',
    insufficient: 'Draw by Insufficient Material',
    draw: 'Draw',
  },
  ru: {
    checkmate_black: 'Мат — победа чёрных',
    checkmate_white: 'Мат — победа белых',
    stalemate: 'Ничья (Пат)',
    threefold: 'Ничья (троекратное повторение)',
    insufficient: 'Ничья (недостаточно материала)',
    draw: 'Ничья',
  },
  zh: {
    checkmate_black: '将杀 — 黑方胜',
    checkmate_white: '将杀 — 白方胜',
    stalemate: '逼和 (Stalemate)',
    threefold: '三次重复局面和棋',
    insufficient: '子力不足和棋',
    draw: '和棋',
  },
  fr: {
    checkmate_black: 'Échec et mat — Victoire des Noirs',
    checkmate_white: 'Échec et mat — Victoire des Blancs',
    stalemate: 'Nulle par Pat',
    threefold: 'Nulle par triple répétition',
    insufficient: 'Nulle par matériel insuffisant',
    draw: 'Partie nulle',
  },
};

export function getLocalizedGameOverReason(
  lang: SupportedLanguage,
  key: GameOverKey
): string {
  return GAME_OVER_LABELS[lang]?.[key] ?? GAME_OVER_LABELS.ar[key];
}
