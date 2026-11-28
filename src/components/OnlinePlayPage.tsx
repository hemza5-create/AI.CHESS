import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  ArrowLeft,
  Check,
  Clock,
  Cloud,
  Copy,
  Crown,
  Eye,
  Flag,
  Globe2,
  Handshake,
  Laptop,
  Loader2,
  LogIn,
  LogOut,
  MessageSquare,
  Monitor,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Smartphone,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { TacticalBoard } from './TacticalBoard.tsx';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import type { SupportedLanguage } from '../i18n/translations.ts';
import { COUNTRY_OPTIONS, getCountryByCode } from '../data/countries.ts';
import {
  ONLINE_TIME_CONTROLS,
  type ClientPlatform,
  type OnlineGameEndReason,
  type OnlineLeaderboardSnapshot,
  type OnlineMatchmakingStatus,
  type OnlinePlayerProfile,
  type OnlineRoomSeat,
  type OnlineRoomState,
  type OnlineRoomSummary,
  type OnlineTimeControlId,
  type OnlineWsClientMessage,
  type OnlineWsServerMessage,
  type PlatformFilter,
} from '../types/onlineChess.ts';
import {
  buildApiUrl,
  buildWebSocketUrl,
  detectClientPlatform,
  getConfiguredApiRoutes,
  getServerIdHeaders,
  safeParseJsonBody,
} from '../utils/networkAndServer.ts';
import { useFirebase } from '../firebase/FirebaseContext.tsx';
import { FIREBASE_PROJECT_ID } from '../firebase/firebaseApp.ts';
import {
  cancelCloudQueueSearch,
  claimQueueCandidateAtomically,
  commitCloudMatchRating,
  createCloudRoom,
  deleteWaitingCloudMatch,
  ensureCloudRankingProfile,
  joinCloudRoomByIdOrCode,
  mapMatchDocToRoomState,
  offerOrRespondCloudDraw,
  resignCloudMatch,
  sendCloudMatchChat,
  startCloudQueueSearch,
  submitCloudMove,
  subscribeCloudLeaderboard,
  subscribeCloudMatch,
  subscribeCloudMatchChat,
  subscribeCloudPublicMatches,
  subscribeCloudQueue,
  type CloudQueueTicket,
  type FirestoreMatchDoc,
} from '../firebase/cloudMatchmakingService.ts';
import type { OnlineRoomChatMessage } from '../types/onlineChess.ts';

interface OnlinePlayPageProps {
  externalServerUrl: string;
  externalServerId: string;
  onBackToMain: () => void;
}

const PLAYER_ID_KEY = 'cvsu_online_player_id_v1';
const PLAYER_NAME_KEY = 'cvsu_online_player_name_v1';
const PLAYER_COUNTRY_KEY = 'cvsu_online_player_country_v1';

const PLATFORM_LABELS: Record<ClientPlatform, Record<SupportedLanguage, string>> = {
  web: { ar: 'ويب', en: 'Web', fr: 'Web', ru: 'Веб', zh: '网页端' },
  android: { ar: 'أندرويد', en: 'Android', fr: 'Android', ru: 'Android', zh: 'Android' },
  ios: { ar: 'آيفون / iOS', en: 'iOS', fr: 'iOS', ru: 'iOS', zh: 'iOS' },
  desktop: { ar: 'كمبيوتر', en: 'Desktop', fr: 'Bureau', ru: 'ПК', zh: '桌面端' },
  pwa: { ar: 'تطبيق ويب PWA', en: 'PWA', fr: 'PWA', ru: 'PWA', zh: 'PWA' },
};

interface OnlineCopy {
  pageTitle: string;
  pageSubtitle: string;
  backToWorkspace: string;
  tabArena: string;
  tabRankings: string;
  connectedLabel: string;
  connectingLabel: string;
  reconnectingLabel: string;
  autoMatchTitle: string;
  autoMatchSubtitle: string;
  startAutoSearch: string;
  cancelAutoSearch: string;
  searchingStatus: string;
  searchTargetPlatform: string;
  searchTargetCountry: string;
  allPlatforms: string;
  allCountries: string;
  activePlatformsNow: string;
  queuedSeekersLabel: string;
  warmupTitle: string;
  warmupSubtitle: string;
  flipBoard: string;
  resetBoard: string;
  yourPlatformLabel: string;
  displayNameLabel: string;
  displayNamePlaceholder: string;
  countryLabel: string;
  saveProfile: string;
  profileSaved: string;
  yourElo: string;
  recordLabel: string;
  streakLabel: string;
  createRoomTitle: string;
  roomTitleLabel: string;
  roomTitlePlaceholder: string;
  timeControlLabel: string;
  preferredSideLabel: string;
  sideRandom: string;
  sideWhite: string;
  sideBlack: string;
  privateRoomLabel: string;
  createRoomBtn: string;
  joinByCodeTitle: string;
  roomCodePlaceholder: string;
  joinBtn: string;
  watchBtn: string;
  openRoomsTitle: string;
  filterCountryAll: string;
  filterTimeAll: string;
  noRoomsYet: string;
  noRoomsHint: string;
  waitingOpponent: string;
  playingNow: string;
  finishedMatch: string;
  spectatorsCount: string;
  roomCodeLabel: string;
  leaveRoom: string;
  waitingBannerTitle: string;
  waitingBannerDesc: string;
  offerDraw: string;
  drawOfferedByYou: string;
  incomingDrawOffer: string;
  acceptDraw: string;
  declineDraw: string;
  resign: string;
  confirmResign: string;
  cancel: string;
  rematch: string;
  rematchVoted: string;
  movesHistory: string;
  roomChat: string;
  chatPlaceholder: string;
  sendChat: string;
  noChatMessages: string;
  rankingsTitle: string;
  rankingsSubtitle: string;
  onlineNowStat: string;
  countriesStat: string;
  gamesStat: string;
  rankCol: string;
  playerCol: string;
  platformCol: string;
  countryCol: string;
  eloCol: string;
  bestEloCol: string;
  wdlCol: string;
  streakCol: string;
  noRankingsYet: string;
  youBadge: string;
  whiteWon: string;
  blackWon: string;
  drawResult: string;
  offlineNotice: string;
  emptySeat: string;
  reconnectBtn: string;
  cloudConnectedLabel: string;
  cloudSignInBtn: string;
  cloudSigningIn: string;
  cloudSignOutBtn: string;
  cloudModeActiveDesc: string;
  cloudModePromptDesc: string;
  cloudQuotaError: string;
  cloudRoomNotFound: string;
  endReasons: Record<OnlineGameEndReason, string>;
}

const COPY_BY_LANG: Record<SupportedLanguage, OnlineCopy> = {
  ar: {
    pageTitle: 'ساحة اللعب العالمية عبر الإنترنت',
    pageSubtitle: 'رقعة تفاعلية مباشرة مع بحث تلقائي عن لاعبين حقيقيين من مختلف المنصات والدول.',
    backToWorkspace: 'العودة للتطبيق الرئيسي',
    tabArena: 'الغرف والمباريات',
    tabRankings: 'تصنيفات أفضل اللاعبين',
    connectedLabel: 'متصل بالخادم',
    connectingLabel: 'جاري الاتصال...',
    reconnectingLabel: 'إعادة الاتصال...',
    autoMatchTitle: 'البحث التلقائي عن لاعبين حقيقيين',
    autoMatchSubtitle: 'مطابقة فورية عبر الخادم مع لاعبين حقيقيين متصلين من الويب والأندرويد والكمبيوتر وiOS.',
    startAutoSearch: 'بدء البحث التلقائي عن خصم حقيقي',
    cancelAutoSearch: 'إلغاء البحث',
    searchingStatus: 'جاري البحث التلقائي عن لاعب حقيقي...',
    searchTargetPlatform: 'منصة المنافس',
    searchTargetCountry: 'دولة المنافس',
    allPlatforms: 'جميع المنصات',
    allCountries: 'جميع الدول',
    activePlatformsNow: 'المتصلون الآن حسب المنصة',
    queuedSeekersLabel: 'في طابور البحث',
    warmupTitle: 'رقعة تفاعلية جاهزة للعب',
    warmupSubtitle: 'حرّك القطع بحرية أو اضغط «بدء البحث التلقائي» للانتقال فوراً لمباراة مع لاعب حقيقي.',
    flipBoard: 'عكس الرقعة',
    resetBoard: 'تصفير الرقعة',
    yourPlatformLabel: 'منصتك',
    displayNameLabel: 'اسم اللاعب',
    displayNamePlaceholder: 'أدخل اسمك...',
    countryLabel: 'الدولة',
    saveProfile: 'حفظ الملف',
    profileSaved: 'تم الحفظ',
    yourElo: 'تصنيفك Elo',
    recordLabel: 'ف / ت / خ',
    streakLabel: 'السلسلة',
    createRoomTitle: 'إنشاء غرفة لعب جديدة',
    roomTitleLabel: 'اسم الغرفة (اختياري)',
    roomTitlePlaceholder: 'مثلاً: تحدي السريع الدولي',
    timeControlLabel: 'نظام الوقت',
    preferredSideLabel: 'اللون المفضل',
    sideRandom: 'عشوائي',
    sideWhite: 'الأبيض',
    sideBlack: 'الأسود',
    privateRoomLabel: 'غرفة خاصة (بالرمز فقط)',
    createRoomBtn: 'إنشاء الغرفة',
    joinByCodeTitle: 'الانضمام برمز الغرفة',
    roomCodePlaceholder: 'رمز 6 أحرف',
    joinBtn: 'انضمام للعب',
    watchBtn: 'مشاهدة',
    openRoomsTitle: 'الغرف المفتوحة حول العالم',
    filterCountryAll: 'كل الدول',
    filterTimeAll: 'كل الأزمنة',
    noRoomsYet: 'لا توجد غرف عامة مطابقة حالياً.',
    noRoomsHint: 'استخدم البحث التلقائي أعلاه أو أنشئ غرفة جديدة للعب فوراً مع لاعب من أي منصة.',
    waitingOpponent: 'بانتظار خصم',
    playingNow: 'جارية الآن',
    finishedMatch: 'انتهت',
    spectatorsCount: 'مشاهدين',
    roomCodeLabel: 'رمز الغرفة',
    leaveRoom: 'مغادرة الغرفة',
    waitingBannerTitle: 'الغرفة جاهزة — بانتظار دخول المنافس',
    waitingBannerDesc: 'شارك رمز الغرفة مع أي لاعب أو انتظر انضمام لاعب تلقائياً.',
    offerDraw: 'عرض تعادل',
    drawOfferedByYou: 'تم إرسال عرض التعادل',
    incomingDrawOffer: 'المنافس يعرض التعادل',
    acceptDraw: 'قبول',
    declineDraw: 'رفض',
    resign: 'استسلام',
    confirmResign: 'تأكيد الاستسلام',
    cancel: 'إلغاء',
    rematch: 'مباراة إعادة',
    rematchVoted: 'بانتظار موافقة المنافس على الإعادة...',
    movesHistory: 'سجل النقلات',
    roomChat: 'دردشة الغرفة',
    chatPlaceholder: 'اكتب رسالة قصيرة للغرفة...',
    sendChat: 'إرسال',
    noChatMessages: 'لا توجد رسائل بعد.',
    rankingsTitle: 'لوحة تصنيف أفضل اللاعبين عالمياً',
    rankingsSubtitle: 'التصنيف محدث لحظياً وفق نظام Elo الرسمي (K=32) لكل مباراة مكتملة.',
    onlineNowStat: 'متصلون الآن',
    countriesStat: 'الدول المشاركة',
    gamesStat: 'مباريات مكتملة',
    rankCol: 'الترتيب',
    playerCol: 'اللاعب',
    platformCol: 'المنصة',
    countryCol: 'الدولة',
    eloCol: 'التصنيف Elo',
    bestEloCol: 'أعلى Elo',
    wdlCol: 'ف / ت / خ',
    streakCol: 'سلسلة الفوز',
    noRankingsYet: 'لا توجد مباريات مصنفة مكتملة بعد — كن أول من يتصدر القائمة!',
    youBadge: 'أنت',
    whiteWon: 'فوز الأبيض (1-0)',
    blackWon: 'فوز الأسود (0-1)',
    drawResult: 'تعادل (½-½)',
    offlineNotice: 'الخادم غير متاح للعب الفوري حالياً. تأكد من عنوان الخادم ومعرّفه.',
    emptySeat: 'بانتظار لاعب...',
    reconnectBtn: 'إعادة الاتصال',
    cloudConnectedLabel: 'سحابة Firebase متصلة',
    cloudSignInBtn: 'ربط بحساب Google للسحابة العالمية (Firebase)',
    cloudSigningIn: 'جاري الربط السحابي...',
    cloudSignOutBtn: 'فصل الحساب',
    cloudModeActiveDesc: 'طوابير الانتظار والغرف وتصنيفات Elo متزامنة عالمياً عبر Firebase عبر الويب والأندرويد والكمبيوتر وiOS.',
    cloudModePromptDesc: 'سجّل بحساب Google للانتقال إلى طوابير البحث العالمية على خادم Firebase واللعب عبر مختلف الأجهزة والمنصات.',
    cloudQuotaError: 'تم الوصول للحد اليومي لقاعدة البيانات السحابية مؤقتاً. يرجى المحاولة لاحقاً.',
    cloudRoomNotFound: 'لم يتم العثور على الغرفة السحابية أو أنها لم تعد متاحة.',
    endReasons: {
      checkmate: 'كش مات',
      stalemate: 'طريق مسدود (تعادل)',
      threefold: 'تكرار ثلاثي',
      insufficient: 'مواد غير كافية',
      draw_agreement: 'اتفاق على التعادل',
      fivefold_or_fifty: 'قاعدة الخمسين نقلة',
      resignation: 'بالاستسلام',
      timeout: 'انتهاء الوقت',
      abandoned: 'انقطاع المنافس',
    },
  },
  en: {
    pageTitle: 'Global Online Multiplayer Arena',
    pageSubtitle: 'Large interactive board with automatic matchmaking across real players on Web, Android, Desktop, and iOS.',
    backToWorkspace: 'Back to Main Workspace',
    tabArena: 'Rooms & Matches',
    tabRankings: 'Top Players Rankings',
    connectedLabel: 'Server Connected',
    connectingLabel: 'Connecting...',
    reconnectingLabel: 'Reconnecting...',
    autoMatchTitle: 'Auto-Search Real Cross-Platform Players',
    autoMatchSubtitle: 'Live server matchmaking pairing real human players across Web, Android, Desktop, iOS, and PWA.',
    startAutoSearch: 'Start Auto Search for Real Player',
    cancelAutoSearch: 'Cancel Search',
    searchingStatus: 'Searching for real opponent across platforms...',
    searchTargetPlatform: 'Target Platform',
    searchTargetCountry: 'Target Country',
    allPlatforms: 'All Platforms',
    allCountries: 'All Countries',
    activePlatformsNow: 'Connected Now by Platform',
    queuedSeekersLabel: 'In Search Queue',
    warmupTitle: 'Live Interactive Board Ready',
    warmupSubtitle: 'Move pieces freely now or press Auto Search to pair immediately with a real player.',
    flipBoard: 'Flip Board',
    resetBoard: 'Reset Board',
    yourPlatformLabel: 'Your Platform',
    displayNameLabel: 'Display Name',
    displayNamePlaceholder: 'Enter your name...',
    countryLabel: 'Country',
    saveProfile: 'Save Profile',
    profileSaved: 'Saved',
    yourElo: 'Your Elo',
    recordLabel: 'W / D / L',
    streakLabel: 'Streak',
    createRoomTitle: 'Create Match Room',
    roomTitleLabel: 'Room Title (Optional)',
    roomTitlePlaceholder: 'e.g. International Blitz Duel',
    timeControlLabel: 'Time Control',
    preferredSideLabel: 'Preferred Side',
    sideRandom: 'Random',
    sideWhite: 'White',
    sideBlack: 'Black',
    privateRoomLabel: 'Private Room (Code Only)',
    createRoomBtn: 'Create Room',
    joinByCodeTitle: 'Join by Room Code',
    roomCodePlaceholder: '6-char code',
    joinBtn: 'Join Match',
    watchBtn: 'Watch',
    openRoomsTitle: 'Live Global Rooms',
    filterCountryAll: 'All Countries',
    filterTimeAll: 'All Time Controls',
    noRoomsYet: 'No matching public rooms right now.',
    noRoomsHint: 'Use Auto Search above or create a room to play with someone worldwide.',
    waitingOpponent: 'Waiting',
    playingNow: 'Playing',
    finishedMatch: 'Finished',
    spectatorsCount: 'Spectators',
    roomCodeLabel: 'Room Code',
    leaveRoom: 'Leave Room',
    waitingBannerTitle: 'Room Ready — Waiting for Challenger',
    waitingBannerDesc: 'Share the room code or wait for a real challenger from the lobby.',
    offerDraw: 'Offer Draw',
    drawOfferedByYou: 'Draw offer sent',
    incomingDrawOffer: 'Opponent offers a draw',
    acceptDraw: 'Accept',
    declineDraw: 'Decline',
    resign: 'Resign',
    confirmResign: 'Confirm Resign',
    cancel: 'Cancel',
    rematch: 'Rematch',
    rematchVoted: 'Waiting for opponent rematch...',
    movesHistory: 'Move List',
    roomChat: 'Room Chat',
    chatPlaceholder: 'Send a quick message...',
    sendChat: 'Send',
    noChatMessages: 'No messages yet.',
    rankingsTitle: 'Global Top Players Leaderboard',
    rankingsSubtitle: 'Official live Elo ratings (K=32) updated after every completed match.',
    onlineNowStat: 'Online Now',
    countriesStat: 'Countries',
    gamesStat: 'Completed Games',
    rankCol: 'Rank',
    playerCol: 'Player',
    platformCol: 'Platform',
    countryCol: 'Country',
    eloCol: 'Elo',
    bestEloCol: 'Peak Elo',
    wdlCol: 'W / D / L',
    streakCol: 'Streak',
    noRankingsYet: 'No ranked games finished yet — be the first to claim #1!',
    youBadge: 'You',
    whiteWon: 'White Wins (1-0)',
    blackWon: 'Black Wins (0-1)',
    drawResult: 'Draw (½-½)',
    offlineNotice: 'Multiplayer server connection unavailable. Check your server URL and ID.',
    emptySeat: 'Open seat...',
    reconnectBtn: 'Reconnect',
    cloudConnectedLabel: 'Firebase Cloud Live',
    cloudSignInBtn: 'Connect Google for Global Firebase Cloud',
    cloudSigningIn: 'Connecting Cloud...',
    cloudSignOutBtn: 'Sign Out',
    cloudModeActiveDesc: 'Global queues, rooms, chat, and Elo rankings synced via Firebase across Web, Android, Desktop, and iOS.',
    cloudModePromptDesc: 'Sign in with Google to switch to global Firebase Cloud matchmaking across devices and platforms.',
    cloudQuotaError: 'Cloud database quota temporarily exceeded. Please try again later.',
    cloudRoomNotFound: 'Cloud room not found or no longer available.',
    endReasons: {
      checkmate: 'Checkmate',
      stalemate: 'Stalemate',
      threefold: 'Threefold Repetition',
      insufficient: 'Insufficient Material',
      draw_agreement: 'Draw by Agreement',
      fivefold_or_fifty: '50-Move Rule',
      resignation: 'Resignation',
      timeout: 'Time Expired',
      abandoned: 'Opponent Disconnected',
    },
  },
  fr: {
    pageTitle: 'Arène Multijoueur Mondiale en Ligne',
    pageSubtitle: 'Grand échiquier interactif avec recherche automatique de vrais joueurs multiplateformes.',
    backToWorkspace: 'Retour à l’accueil',
    tabArena: 'Salons & Parties',
    tabRankings: 'Classement des Meilleurs Joueurs',
    connectedLabel: 'Serveur Connecté',
    connectingLabel: 'Connexion...',
    reconnectingLabel: 'Reconnexion...',
    autoMatchTitle: 'Recherche Auto de Vrais Joueurs Multiplateformes',
    autoMatchSubtitle: 'Appariement en direct entre vrais joueurs sur Web, Android, Bureau, iOS et PWA.',
    startAutoSearch: 'Lancer la Recherche Auto',
    cancelAutoSearch: 'Annuler la Recherche',
    searchingStatus: 'Recherche d’un adversaire réel...',
    searchTargetPlatform: 'Plateforme cible',
    searchTargetCountry: 'Pays cible',
    allPlatforms: 'Toutes plateformes',
    allCountries: 'Tous les pays',
    activePlatformsNow: 'Connectés par plateforme',
    queuedSeekersLabel: 'En file d’attente',
    warmupTitle: 'Échiquier Interactif Prêt',
    warmupSubtitle: 'Déplacez les pièces librement ou lancez la recherche auto pour affronter un vrai joueur.',
    flipBoard: 'Inverser',
    resetBoard: 'Réinitialiser',
    yourPlatformLabel: 'Plateforme',
    displayNameLabel: 'Nom du joueur',
    displayNamePlaceholder: 'Votre nom...',
    countryLabel: 'Pays',
    saveProfile: 'Enregistrer',
    profileSaved: 'Enregistré',
    yourElo: 'Votre Elo',
    recordLabel: 'V / N / D',
    streakLabel: 'Série',
    createRoomTitle: 'Créer un Salon',
    roomTitleLabel: 'Nom du salon (Optionnel)',
    roomTitlePlaceholder: 'ex: Duel Blitz International',
    timeControlLabel: 'Cadence',
    preferredSideLabel: 'Couleur',
    sideRandom: 'Aléatoire',
    sideWhite: 'Blancs',
    sideBlack: 'Noirs',
    privateRoomLabel: 'Salon privé (Code uniquement)',
    createRoomBtn: 'Créer le Salon',
    joinByCodeTitle: 'Rejoindre par Code',
    roomCodePlaceholder: 'Code 6 car.',
    joinBtn: 'Jouer',
    watchBtn: 'Observer',
    openRoomsTitle: 'Salons Mondiaux en Direct',
    filterCountryAll: 'Tous les pays',
    filterTimeAll: 'Toutes cadences',
    noRoomsYet: 'Aucun salon public correspondant.',
    noRoomsHint: 'Utilisez la recherche auto ou créez un salon.',
    waitingOpponent: 'En attente',
    playingNow: 'En cours',
    finishedMatch: 'Terminée',
    spectatorsCount: 'Spectateurs',
    roomCodeLabel: 'Code du Salon',
    leaveRoom: 'Quitter le Salon',
    waitingBannerTitle: 'Salon prêt — En attente d’un adversaire',
    waitingBannerDesc: 'Partagez le code du salon ou attendez un joueur depuis le lobby.',
    offerDraw: 'Proposer Nulle',
    drawOfferedByYou: 'Offre de nulle envoyée',
    incomingDrawOffer: 'L’adversaire propose la nulle',
    acceptDraw: 'Accepter',
    declineDraw: 'Refuser',
    resign: 'Abandonner',
    confirmResign: 'Confirmer l’abandon',
    cancel: 'Annuler',
    rematch: 'Revanche',
    rematchVoted: 'En attente de l’adversaire...',
    movesHistory: 'Coups joués',
    roomChat: 'Chat du Salon',
    chatPlaceholder: 'Écrire un message...',
    sendChat: 'Envoyer',
    noChatMessages: 'Aucun message.',
    rankingsTitle: 'Classement Mondial des Meilleurs Joueurs',
    rankingsSubtitle: 'Classement Elo officiel (K=32) mis à jour après chaque partie.',
    onlineNowStat: 'En ligne',
    countriesStat: 'Pays',
    gamesStat: 'Parties jouées',
    rankCol: 'Rang',
    playerCol: 'Joueur',
    platformCol: 'Plateforme',
    countryCol: 'Pays',
    eloCol: 'Elo',
    bestEloCol: 'Record Elo',
    wdlCol: 'V / N / D',
    streakCol: 'Série',
    noRankingsYet: 'Aucune partie classée terminée pour le moment.',
    youBadge: 'Vous',
    whiteWon: 'Victoire Blancs (1-0)',
    blackWon: 'Victoire Noirs (0-1)',
    drawResult: 'Nulle (½-½)',
    offlineNotice: 'Connexion au serveur multijoueur indisponible.',
    emptySeat: 'Place libre...',
    reconnectBtn: 'Reconnecter',
    cloudConnectedLabel: 'Cloud Firebase Actif',
    cloudSignInBtn: 'Connexion Google (Cloud Firebase Mondial)',
    cloudSigningIn: 'Connexion Cloud...',
    cloudSignOutBtn: 'Déconnexion',
    cloudModeActiveDesc: 'Files d’attente, salons et classements Elo synchronisés via Firebase sur tous les appareils.',
    cloudModePromptDesc: 'Connectez-vous avec Google pour activer le matchmaking mondial Firebase multiplateforme.',
    cloudQuotaError: 'Quota cloud temporairement dépassé. Réessayez plus tard.',
    cloudRoomNotFound: 'Salon cloud introuvable ou indisponible.',
    endReasons: {
      checkmate: 'Échec et mat',
      stalemate: 'Pat',
      threefold: 'Triple répétition',
      insufficient: 'Matériel insuffisant',
      draw_agreement: 'Nulle par accord',
      fivefold_or_fifty: 'Règle des 50 coups',
      resignation: 'Abandon',
      timeout: 'Temps écoulé',
      abandoned: 'Déconnexion adverse',
    },
  },
  ru: {
    pageTitle: 'Мировая Онлайн-Арена Шахмат',
    pageSubtitle: 'Большая интерактивная доска с автопоиском реальных игроков с разных платформ.',
    backToWorkspace: 'Вернуться в главное окно',
    tabArena: 'Комнаты и Матчи',
    tabRankings: 'Рейтинг Лучших Игроков',
    connectedLabel: 'Сервер Подключён',
    connectingLabel: 'Подключение...',
    reconnectingLabel: 'Переподключение...',
    autoMatchTitle: 'Автопоиск Реальных Игроков с Разных Платформ',
    autoMatchSubtitle: 'Мгновенный подбор реальных соперников с Web, Android, Desktop, iOS и PWA.',
    startAutoSearch: 'Начать Автопоиск Соперника',
    cancelAutoSearch: 'Отменить Поиск',
    searchingStatus: 'Поиск реального игрока на всех платформах...',
    searchTargetPlatform: 'Платформа соперника',
    searchTargetCountry: 'Страна соперника',
    allPlatforms: 'Все платформы',
    allCountries: 'Все страны',
    activePlatformsNow: 'Онлайн по платформам',
    queuedSeekersLabel: 'В очереди поиска',
    warmupTitle: 'Интерактивная доска готова',
    warmupSubtitle: 'Делайте ходы свободно или нажмите «Начать автопоиск» для игры с реальным соперником.',
    flipBoard: 'Перевернуть',
    resetBoard: 'Сбросить доску',
    yourPlatformLabel: 'Платформа',
    displayNameLabel: 'Имя игрока',
    displayNamePlaceholder: 'Введите имя...',
    countryLabel: 'Страна',
    saveProfile: 'Сохранить',
    profileSaved: 'Сохранено',
    yourElo: 'Ваш Эло',
    recordLabel: 'В / Н / П',
    streakLabel: 'Серия',
    createRoomTitle: 'Создать Комнату',
    roomTitleLabel: 'Название (необяз.)',
    roomTitlePlaceholder: 'Например: Международный блиц',
    timeControlLabel: 'Контроль времени',
    preferredSideLabel: 'Цвет фигур',
    sideRandom: 'Случайно',
    sideWhite: 'Белые',
    sideBlack: 'Чёрные',
    privateRoomLabel: 'Приватная комната (по коду)',
    createRoomBtn: 'Создать Комнату',
    joinByCodeTitle: 'Войти по Коду',
    roomCodePlaceholder: 'Код из 6 симв.',
    joinBtn: 'Играть',
    watchBtn: 'Смотреть',
    openRoomsTitle: 'Открытые Комнаты Мира',
    filterCountryAll: 'Все страны',
    filterTimeAll: 'Любой контроль',
    noRoomsYet: 'Нет подходящих открытых комнат.',
    noRoomsHint: 'Используйте автопоиск выше или создайте новую комнату.',
    waitingOpponent: 'Ожидание',
    playingNow: 'Идёт игра',
    finishedMatch: 'Завершена',
    spectatorsCount: 'Зрители',
    roomCodeLabel: 'Код комнаты',
    leaveRoom: 'Покинуть комнату',
    waitingBannerTitle: 'Комната готова — ожидание соперника',
    waitingBannerDesc: 'Поделитесь кодом или дождитесь игрока из общего списка.',
    offerDraw: 'Ничья',
    drawOfferedByYou: 'Предложена ничья',
    incomingDrawOffer: 'Соперник предлагает ничью',
    acceptDraw: 'Принять',
    declineDraw: 'Отклонить',
    resign: 'Сдаться',
    confirmResign: 'Подтвердить сдачу',
    cancel: 'Отмена',
    rematch: 'Реванш',
    rematchVoted: 'Ожидание ответа соперника...',
    movesHistory: 'История ходов',
    roomChat: 'Чат комнаты',
    chatPlaceholder: 'Напишите сообщение...',
    sendChat: 'Отправить',
    noChatMessages: 'Сообщений пока нет.',
    rankingsTitle: 'Мировой Рейтинг Игроков',
    rankingsSubtitle: 'Официальный рейтинг Эло (K=32), обновляется после каждой партии.',
    onlineNowStat: 'Онлайн',
    countriesStat: 'Страны',
    gamesStat: 'Сыграно партий',
    rankCol: 'Место',
    playerCol: 'Игрок',
    platformCol: 'Платформа',
    countryCol: 'Страна',
    eloCol: 'Эло',
    bestEloCol: 'Макс. Эло',
    wdlCol: 'В / Н / П',
    streakCol: 'Серия',
    noRankingsYet: 'Пока нет завершённых рейтинговых партий.',
    youBadge: 'Вы',
    whiteWon: 'Победа белых (1-0)',
    blackWon: 'Победа чёрных (0-1)',
    drawResult: 'Ничья (½-½)',
    offlineNotice: 'Мультиплеер-сервер недоступен. Проверьте настройки сервера.',
    emptySeat: 'Свободное место...',
    reconnectBtn: 'Переподключить',
    cloudConnectedLabel: 'Облако Firebase Подключено',
    cloudSignInBtn: 'Войти через Google (Облако Firebase)',
    cloudSigningIn: 'Подключение...',
    cloudSignOutBtn: 'Выйти',
    cloudModeActiveDesc: 'Очереди поиска, комнаты и рейтинг Эло синхронизируются через Firebase на всех платформах.',
    cloudModePromptDesc: 'Войдите через Google, чтобы подключиться к глобальной очереди Firebase на разных устройствах.',
    cloudQuotaError: 'Временно превышена квота облачной базы данных.',
    cloudRoomNotFound: 'Облачная комната не найдена.',
    endReasons: {
      checkmate: 'Мат',
      stalemate: 'Пат',
      threefold: 'Троекратное повторение',
      insufficient: 'Недостаточно материала',
      draw_agreement: 'Согласие на ничью',
      fivefold_or_fifty: 'Правило 50 ходов',
      resignation: 'Сдача партии',
      timeout: 'Время вышло',
      abandoned: 'Соперник отключился',
    },
  },
  zh: {
    pageTitle: '全球在线国际象棋对战大厅',
    pageSubtitle: '大尺寸互动棋盘，支持自动匹配来自不同平台与国家的真实棋手。',
    backToWorkspace: '返回主界面',
    tabArena: '对战房间',
    tabRankings: '顶尖棋手排行榜',
    connectedLabel: '已连接服务器',
    connectingLabel: '连接中...',
    reconnectingLabel: '重新连接中...',
    autoMatchTitle: '跨平台真实玩家自动匹配',
    autoMatchSubtitle: '实时服务器匹配来自网页端、Android、桌面端、iOS 和 PWA 的真实玩家。',
    startAutoSearch: '开始自动搜索真实对手',
    cancelAutoSearch: '取消搜索',
    searchingStatus: '正在跨平台搜索真实对手...',
    searchTargetPlatform: '目标平台',
    searchTargetCountry: '目标国家',
    allPlatforms: '所有平台',
    allCountries: '所有国家',
    activePlatformsNow: '各平台当前在线人数',
    queuedSeekersLabel: '正在队列中',
    warmupTitle: '互动棋盘已就绪',
    warmupSubtitle: '可立即自由走棋，或点击“开始自动搜索”与真实棋手对局。',
    flipBoard: '翻转棋盘',
    resetBoard: '重置棋盘',
    yourPlatformLabel: '当前平台',
    displayNameLabel: '棋手昵称',
    displayNamePlaceholder: '输入昵称...',
    countryLabel: '国家/地区',
    saveProfile: '保存资料',
    profileSaved: '已保存',
    yourElo: '当前等级分',
    recordLabel: '胜 / 和 / 负',
    streakLabel: '连胜',
    createRoomTitle: '创建对局房间',
    roomTitleLabel: '房间名称（可选）',
    roomTitlePlaceholder: '例如：国际快棋挑战',
    timeControlLabel: '用时规则',
    preferredSideLabel: '执子偏好',
    sideRandom: '随机',
    sideWhite: '白方',
    sideBlack: '黑方',
    privateRoomLabel: '私密房间（仅凭房间码加入）',
    createRoomBtn: '创建房间',
    joinByCodeTitle: '通过房间码加入',
    roomCodePlaceholder: '6位房间码',
    joinBtn: '加入对局',
    watchBtn: '观战',
    openRoomsTitle: '全球在线房间',
    filterCountryAll: '所有国家',
    filterTimeAll: '所有赛制',
    noRoomsYet: '暂无符合条件的公开房间。',
    noRoomsHint: '使用上方自动搜索或创建房间，与全球棋手立即对弈。',
    waitingOpponent: '等待对手',
    playingNow: '对弈中',
    finishedMatch: '已结束',
    spectatorsCount: '观战',
    roomCodeLabel: '房间码',
    leaveRoom: '离开房间',
    waitingBannerTitle: '房间已就绪 — 等待对手加入',
    waitingBannerDesc: '分享房间码或等待其他真实玩家自动匹配加入。',
    offerDraw: '提和',
    drawOfferedByYou: '已发送提和请求',
    incomingDrawOffer: '对手提出和棋',
    acceptDraw: '同意',
    declineDraw: '拒绝',
    resign: '认输',
    confirmResign: '确认认输',
    cancel: '取消',
    rematch: '再来一局',
    rematchVoted: '等待对手确认重赛...',
    movesHistory: '招法记录',
    roomChat: '房间聊天',
    chatPlaceholder: '输入简短消息...',
    sendChat: '发送',
    noChatMessages: '暂无消息。',
    rankingsTitle: '全球顶尖棋手排行榜',
    rankingsSubtitle: '每场对局结束后自动按官方 Elo 算法 (K=32) 更新。',
    onlineNowStat: '当前在线',
    countriesStat: '参与国家',
    gamesStat: '已完成对局',
    rankCol: '排名',
    playerCol: '棋手',
    platformCol: '平台',
    countryCol: '国家',
    eloCol: 'Elo 等级分',
    bestEloCol: '最高 Elo',
    wdlCol: '胜 / 和 / 负',
    streakCol: '连胜',
    noRankingsYet: '暂无已完成的排位对局，快去赢下第一局！',
    youBadge: '我',
    whiteWon: '白方胜 (1-0)',
    blackWon: '黑方胜 (0-1)',
    drawResult: '和棋 (½-½)',
    offlineNotice: '暂时无法连接多人服务器，请检查服务器地址和标识。',
    emptySeat: '等待加入...',
    reconnectBtn: '重新连接',
    cloudConnectedLabel: 'Firebase 云端已连接',
    cloudSignInBtn: '使用 Google 登录连接全球 Firebase 云',
    cloudSigningIn: '正在连接云端...',
    cloudSignOutBtn: '退出登录',
    cloudModeActiveDesc: '全球等待队列、房间与 Elo 排行榜已通过 Firebase 在多平台与多设备实时同步。',
    cloudModePromptDesc: '登录 Google 账号以连接全球 Firebase 云匹配服务，实现跨设备跨平台实时对战。',
    cloudQuotaError: '云端数据库配额暂时超出，请稍后再试。',
    cloudRoomNotFound: '未找到该云端房间或已关闭。',
    endReasons: {
      checkmate: '将杀',
      stalemate: '逼和',
      threefold: '三次重复',
      insufficient: '子力不足',
      draw_agreement: '协议和棋',
      fivefold_or_fifty: '50回合规则',
      resignation: '认输',
      timeout: '超时判负',
      abandoned: '对手断线',
    },
  },
};

function getOrCreatePlayerId(): string {
  try {
    const existing = globalThis.localStorage?.getItem(PLAYER_ID_KEY);
    if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
      return existing;
    }
    const bytes = new Uint8Array(8);
    globalThis.crypto?.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const id = `plr_${hex || Date.now().toString(36)}`;
    globalThis.localStorage?.setItem(PLAYER_ID_KEY, id);
    return id;
  } catch {
    return `plr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function getInitialStoredName(fallbackPrefix: string): string {
  try {
    const stored = globalThis.localStorage?.getItem(PLAYER_NAME_KEY);
    if (stored && stored.trim().length >= 2) return stored.trim().slice(0, 24);
  } catch {
    // ignore
  }
  return fallbackPrefix;
}

function getInitialStoredCountry(): string {
  try {
    const stored = globalThis.localStorage?.getItem(PLAYER_COUNTRY_KEY);
    if (stored) return getCountryByCode(stored).code;
  } catch {
    // ignore
  }
  return 'DZ';
}

function formatClock(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.ceil(safeMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function PlatformIcon({ platform, className = 'w-3.5 h-3.5' }: { platform: ClientPlatform; className?: string }) {
  switch (platform) {
    case 'android':
    case 'ios':
      return <Smartphone className={className} />;
    case 'desktop':
      return <Monitor className={className} />;
    case 'pwa':
      return <Laptop className={className} />;
    default:
      return <Globe2 className={className} />;
  }
}

export const OnlinePlayPage: React.FC<OnlinePlayPageProps> = ({
  externalServerUrl,
  externalServerId,
  onBackToMain,
}) => {
  const { language, meta } = useLanguage();
  const copy = COPY_BY_LANG[language] ?? COPY_BY_LANG.en;
  const {
    user,
    authReady,
    cloudReachable,
    authBusy,
    authError,
    signInWithGoogle,
    signOut,
    clearAuthError,
  } = useFirebase();

  const isCloudMode = authReady && Boolean(user) && user?.emailVerified !== false;

  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [clientPlatform] = useState<ClientPlatform>(() => detectClientPlatform());
  const [displayName, setDisplayName] = useState<string>(() =>
    getInitialStoredName(language === 'ar' ? 'لاعب شطرنج' : 'GrandPlayer')
  );
  const [countryCode, setCountryCode] = useState<string>(() => getInitialStoredCountry());
  const [profileSavedToast, setProfileSavedToast] = useState(false);

  const [viewTab, setViewTab] = useState<'arena' | 'rankings'>('arena');
  const [connStatus, setConnStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [selfProfile, setSelfProfile] = useState<OnlinePlayerProfile | null>(null);
  const [rooms, setRooms] = useState<OnlineRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<OnlineRoomState | null>(null);
  const [leaderboard, setLeaderboard] = useState<OnlineLeaderboardSnapshot>({
    rankings: [],
    onlinePlayersCount: 0,
    activeCountriesCount: 0,
    totalCompletedGames: 0,
    serverTime: Date.now(),
  });
  const [matchmakingStatus, setMatchmakingStatus] = useState<OnlineMatchmakingStatus>({
    searching: false,
    timeControlId: null,
    targetPlatform: 'all',
    startedAt: null,
    queueCount: 0,
    onlineByPlatform: { web: 0, android: 0, ios: 0, desktop: 0, pwa: 0 },
  });

  // Firebase Cloud state (strictly gated on authReady && user)
  const [cloudSelfProfile, setCloudSelfProfile] = useState<OnlinePlayerProfile | null>(null);
  const [cloudRankings, setCloudRankings] = useState<OnlinePlayerProfile[]>([]);
  const [cloudQueueTickets, setCloudQueueTickets] = useState<CloudQueueTicket[]>([]);
  const [cloudRooms, setCloudRooms] = useState<OnlineRoomSummary[]>([]);
  const [activeCloudMatchId, setActiveCloudMatchId] = useState<string | null>(null);
  const [activeCloudMatchDoc, setActiveCloudMatchDoc] = useState<FirestoreMatchDoc | null>(null);
  const [cloudChat, setCloudChat] = useState<OnlineRoomChatMessage[]>([]);
  const [cloudSearchStartedAt, setCloudSearchStartedAt] = useState<number | null>(null);
  const claimingQueueRef = useRef<boolean>(false);
  const committedRatingMatchIdsRef = useRef<Set<string>>(new Set());

  // Large board warm-up interactive state (usable immediately before entering a room)
  const warmupChessRef = useRef<Chess>(new Chess());
  const [warmupFen, setWarmupFen] = useState<string>(() => new Chess().fen());
  const [warmupLastMove, setWarmupLastMove] = useState<{ from: string; to: string } | null>(null);
  const [warmupMoves, setWarmupMoves] = useState<string[]>([]);
  const [warmupOrientation, setWarmupOrientation] = useState<'white' | 'black'>('white');

  // Auto-matchmaking controls
  const [searchTimeControl, setSearchTimeControl] = useState<OnlineTimeControlId>('5+0');
  const [searchTargetPlatform, setSearchTargetPlatform] = useState<PlatformFilter>('all');
  const [searchTargetCountry, setSearchTargetCountry] = useState<string>('ALL');

  // Create room form state
  const [roomTitleInput, setRoomTitleInput] = useState('');
  const [selectedTimeControl, setSelectedTimeControl] = useState<OnlineTimeControlId>('5+0');
  const [preferredSide, setPreferredSide] = useState<'random' | 'w' | 'b'>('random');
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);

  // Join by code & filters
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [lobbyCountryFilter, setLobbyCountryFilter] = useState<string>('ALL');
  const [lobbyTimeFilter, setLobbyTimeFilter] = useState<string>('ALL');
  const [rankingsCountryFilter, setRankingsCountryFilter] = useState<string>('ALL');

  // Room interaction state
  const [copiedCode, setCopiedCode] = useState(false);
  const [confirmingResign, setConfirmingResign] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const profileDraftRef = useRef({
    name: displayName,
    country: countryCode,
    platform: clientPlatform,
  });

  const formatCloudError = useCallback(
    (err: unknown): string => {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes('Quota exceeded')) {
        return copy.cloudQuotaError;
      }
      if (raw.includes('permission-denied')) {
        return copy.offlineNotice;
      }
      return copy.offlineNotice;
    },
    [copy.cloudQuotaError, copy.offlineNotice]
  );

  useEffect(() => {
    if (authError) {
      setErrorBanner(authError);
    }
  }, [authError]);

  useEffect(() => {
    activeRoomIdRef.current = activeRoom?.roomId ?? null;
  }, [activeRoom?.roomId]);

  useEffect(() => {
    profileDraftRef.current = {
      name: displayName,
      country: countryCode,
      platform: clientPlatform,
    };
  }, [clientPlatform, countryCode, displayName]);

  // Seed default displayName from Google user once signed in if stored name is generic
  useEffect(() => {
    if (!isCloudMode || !user?.displayName) return;
    try {
      const stored = globalThis.localStorage?.getItem(PLAYER_NAME_KEY);
      if (!stored) {
        setDisplayName(user.displayName.trim().slice(0, 24) || displayName);
      }
    } catch {
      // ignore
    }
  }, [isCloudMode, user?.displayName, displayName]);

  // Real-time Firebase Cloud subscriptions (ONLY when authenticated & verified)
  useEffect(() => {
    if (!isCloudMode || !user) {
      setCloudSelfProfile(null);
      setCloudRankings([]);
      setCloudQueueTickets([]);
      setCloudRooms([]);
      setActiveCloudMatchId(null);
      setActiveCloudMatchDoc(null);
      setCloudChat([]);
      setCloudSearchStartedAt(null);
      return;
    }

    setConnStatus(cloudReachable ? 'connected' : 'reconnecting');
    setErrorBanner(null);

    let cancelled = false;
    void ensureCloudRankingProfile(
      user,
      profileDraftRef.current.name,
      profileDraftRef.current.country,
      profileDraftRef.current.platform
    )
      .then((profile) => {
        if (!cancelled) {
          setCloudSelfProfile(profile);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorBanner(formatCloudError(err));
        }
      });

    const unsubLeaderboard = subscribeCloudLeaderboard((profiles) => {
      setCloudRankings(profiles);
      const mine = profiles.find((p) => p.playerId === user.uid);
      if (mine) {
        setCloudSelfProfile(mine);
      }
    });
    const unsubQueue = subscribeCloudQueue((tickets) => {
      setCloudQueueTickets(tickets);
    });
    const unsubMatches = subscribeCloudPublicMatches((openRooms) => {
      setCloudRooms(openRooms);
    });

    return () => {
      cancelled = true;
      unsubLeaderboard();
      unsubQueue();
      unsubMatches();
    };
  }, [cloudReachable, formatCloudError, isCloudMode, user]);

  // React to Cloud matchmakingQueue snapshots: detect opponent match or pair compatible seekers
  useEffect(() => {
    if (!isCloudMode || !user || !cloudSelfProfile) return;

    const myTicket = cloudQueueTickets.find((t) => t.uid === user.uid);
    if (!myTicket) {
      setCloudSearchStartedAt(null);
      return;
    }

    if (myTicket.status === 'matched' && myTicket.matchedMatchId) {
      setActiveCloudMatchId(myTicket.matchedMatchId);
      setConfirmingResign(false);
      setViewTab('arena');
      setCloudSearchStartedAt(null);
      void cancelCloudQueueSearch(user.uid).catch(() => undefined);
      return;
    }

    if (myTicket.status === 'searching') {
      setCloudSearchStartedAt((prev) => prev ?? myTicket.updatedAtMs ?? Date.now());
      if (claimingQueueRef.current) return;

      const now = Date.now();
      const candidate = cloudQueueTickets.find((cand) => {
        if (cand.uid === user.uid || cand.status !== 'searching') return false;
        if (now - cand.updatedAtMs > 10 * 60_000) return false;
        if (cand.timeControlId !== myTicket.timeControlId) return false;
        const selfAllowsCandPlat =
          myTicket.targetPlatform === 'all' || myTicket.targetPlatform === cand.platform;
        const candAllowsSelfPlat =
          cand.targetPlatform === 'all' || cand.targetPlatform === myTicket.platform;
        if (!selfAllowsCandPlat || !candAllowsSelfPlat) return false;
        const selfAllowsCandCountry =
          myTicket.targetCountry === 'ALL' || myTicket.targetCountry === cand.country;
        const candAllowsSelfCountry =
          cand.targetCountry === 'ALL' || cand.targetCountry === myTicket.country;
        if (!selfAllowsCandCountry || !candAllowsSelfCountry) return false;
        // Deterministic tie-breaker so only one client executes batch write
        return user.uid > cand.uid;
      });

      if (candidate) {
        claimingQueueRef.current = true;
        void claimQueueCandidateAtomically(cloudSelfProfile, candidate)
          .then((matchId) => {
            setActiveCloudMatchId(matchId);
            setConfirmingResign(false);
            setViewTab('arena');
            setCloudSearchStartedAt(null);
          })
          .catch(() => {
            // Peer may have already claimed or left queue
          })
          .finally(() => {
            claimingQueueRef.current = false;
          });
      }
    }
  }, [cloudQueueTickets, cloudSelfProfile, isCloudMode, user]);

  // Active Cloud Match listener
  useEffect(() => {
    if (!isCloudMode || !user || !activeCloudMatchId) {
      setActiveCloudMatchDoc(null);
      return;
    }
    const unsubMatch = subscribeCloudMatch(activeCloudMatchId, (matchDoc) => {
      if (!matchDoc) {
        setActiveCloudMatchId(null);
        setActiveCloudMatchDoc(null);
        setCloudChat([]);
        return;
      }
      setActiveCloudMatchDoc(matchDoc);
      setConfirmingResign(false);
    });
    return () => {
      unsubMatch();
    };
  }, [activeCloudMatchId, isCloudMode, user]);

  // Active Cloud Match Chat listener (participants only per security rules)
  const isCloudMatchParticipant = Boolean(
    isCloudMode &&
      user &&
      activeCloudMatchDoc &&
      (activeCloudMatchDoc.whiteUid === user.uid || activeCloudMatchDoc.blackUid === user.uid)
  );

  useEffect(() => {
    if (!isCloudMode || !user || !activeCloudMatchId || !isCloudMatchParticipant) {
      setCloudChat([]);
      return;
    }
    const unsubChat = subscribeCloudMatchChat(activeCloudMatchId, (msgs) => {
      setCloudChat(msgs);
    });
    return () => {
      unsubChat();
    };
  }, [activeCloudMatchId, isCloudMatchParticipant, isCloudMode, user]);

  // Commit Cloud Elo update once a match finishes
  useEffect(() => {
    if (!isCloudMode || !user || !activeCloudMatchDoc) return;
    if (activeCloudMatchDoc.status !== 'finished') return;
    if (activeCloudMatchDoc.whiteUid !== user.uid && activeCloudMatchDoc.blackUid !== user.uid) return;
    if (committedRatingMatchIdsRef.current.has(activeCloudMatchDoc.matchId)) return;

    committedRatingMatchIdsRef.current.add(activeCloudMatchDoc.matchId);
    void commitCloudMatchRating(activeCloudMatchDoc, user.uid).catch((err) => {
      committedRatingMatchIdsRef.current.delete(activeCloudMatchDoc.matchId);
      setErrorBanner(formatCloudError(err));
    });
  }, [activeCloudMatchDoc, formatCloudError, isCloudMode, user]);

  // Initial HTTP bootstrap hydration (when not in Cloud mode)
  useEffect(() => {
    if (isCloudMode) return;
    let cancelled = false;
    const bootstrap = async () => {
      const url = buildApiUrl(getConfiguredApiRoutes().onlineBootstrap, externalServerUrl);
      if (!url) return;
      try {
        const res = await fetch(url, {
          method: 'GET',
          cache: 'no-store',
          headers: getServerIdHeaders(externalServerId),
        });
        const parsed = await safeParseJsonBody<{
          rooms?: OnlineRoomSummary[];
          leaderboard?: OnlineLeaderboardSnapshot;
          matchmaking?: OnlineMatchmakingStatus;
        }>(res);
        if (!cancelled && parsed.ok && parsed.data) {
          if (Array.isArray(parsed.data.rooms)) {
            setRooms((prev) => (prev.length === 0 ? parsed.data!.rooms! : prev));
          }
          if (parsed.data.leaderboard) {
            setLeaderboard((prev) =>
              prev.rankings.length === 0 ? parsed.data!.leaderboard! : prev
            );
          }
          if (parsed.data.matchmaking) {
            setMatchmakingStatus((prev) => (prev.searching ? prev : parsed.data!.matchmaking!));
          }
        }
      } catch {
        // WS hydrates on connect
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [externalServerId, externalServerUrl, isCloudMode]);

  // Real-time WebSocket lifecycle fallback when not signed into Firebase Cloud
  useEffect(() => {
    if (isCloudMode) return;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let backoffMs = 900;

    const connectSocket = () => {
      if (disposed) return;
      const wsUrl = buildWebSocketUrl('/ws/online-chess', externalServerUrl);
      if (!wsUrl) {
        setConnStatus('reconnecting');
        setErrorBanner(copy.offlineNotice);
        return;
      }

      setConnStatus((prev) => (prev === 'connected' ? 'connected' : 'connecting'));

      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl);
      } catch {
        setConnStatus('reconnecting');
        reconnectTimer = globalThis.setTimeout(connectSocket, backoffMs);
        return;
      }

      wsRef.current = socket;

      socket.onopen = () => {
        if (disposed) {
          socket.close();
          return;
        }
        backoffMs = 900;
        const helloMsg: OnlineWsClientMessage = {
          type: 'hello',
          serverId: externalServerId,
          playerId,
          name: profileDraftRef.current.name,
          country: profileDraftRef.current.country,
          platform: profileDraftRef.current.platform,
          roomId: activeRoomIdRef.current ?? undefined,
        };
        socket.send(JSON.stringify(helloMsg));
      };

      socket.onmessage = (event) => {
        if (disposed) return;
        let msg: OnlineWsServerMessage;
        try {
          msg = JSON.parse(String(event.data)) as OnlineWsServerMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'welcome':
            setConnStatus('connected');
            setErrorBanner(null);
            setSelfProfile(msg.selfProfile);
            setRooms(msg.rooms);
            setLeaderboard(msg.leaderboard);
            if (msg.matchmaking) {
              setMatchmakingStatus(msg.matchmaking);
            }
            if (msg.activeRoom) {
              setActiveRoom(msg.activeRoom);
            }
            break;

          case 'profile:updated':
            setSelfProfile(msg.profile);
            break;

          case 'lobby:update':
            setRooms(msg.rooms);
            break;

          case 'matchmaking:status':
            setMatchmakingStatus(msg.status);
            break;

          case 'match:found':
            setActiveRoom(msg.room);
            setConfirmingResign(false);
            setViewTab('arena');
            break;

          case 'room:state':
            setActiveRoom(msg.room);
            setConfirmingResign(false);
            break;

          case 'room:closed':
            setActiveRoom((prev) => (prev?.roomId === msg.roomId ? null : prev));
            break;

          case 'leaderboard:update':
            setLeaderboard(msg.leaderboard);
            break;

          case 'error':
            setErrorBanner(msg.message);
            break;
        }
      };

      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
        if (disposed) return;
        setConnStatus('reconnecting');
        const delay = backoffMs;
        backoffMs = Math.min(8000, Math.round(backoffMs * 1.6));
        reconnectTimer = globalThis.setTimeout(connectSocket, delay);
      };

      socket.onerror = () => {
        // Close handler handles reconnect
      };
    };

    connectSocket();

    return () => {
      disposed = true;
      if (reconnectTimer) globalThis.clearTimeout(reconnectTimer);
      const sock = wsRef.current;
      wsRef.current = null;
      if (sock && (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING)) {
        sock.close();
      }
    };
  }, [copy.offlineNotice, externalServerId, externalServerUrl, isCloudMode, playerId, reconnectAttempt]);

  // Unified effective state (Firebase Cloud vs WebSocket fallback)
  const activePlayerId = isCloudMode && user ? user.uid : playerId;

  const cloudActiveRoom = useMemo<OnlineRoomState | null>(() => {
    if (!isCloudMode || !activeCloudMatchDoc) return null;
    return mapMatchDocToRoomState(activeCloudMatchDoc, cloudChat);
  }, [activeCloudMatchDoc, cloudChat, isCloudMode]);

  const effectiveActiveRoom = isCloudMode ? cloudActiveRoom : activeRoom;
  const effectiveSelfProfile = isCloudMode ? cloudSelfProfile : selfProfile;
  const effectiveRooms = isCloudMode ? cloudRooms : rooms;

  const effectiveLeaderboard = useMemo<OnlineLeaderboardSnapshot>(() => {
    if (!isCloudMode) return leaderboard;
    const countries = new Set<string>();
    const totalGamesSum = cloudRankings.reduce((acc, p) => {
      if (p.country) countries.add(p.country);
      return acc + (p.gamesPlayed ?? 0);
    }, 0);
    const activeIds = new Set<string>(cloudQueueTickets.map((t) => t.uid));
    cloudRooms.forEach((r) => {
      if (r.white?.playerId) activeIds.add(r.white.playerId);
      if (r.black?.playerId) activeIds.add(r.black.playerId);
    });
    if (user) activeIds.add(user.uid);
    return {
      rankings: cloudRankings,
      onlinePlayersCount: Math.max(activeIds.size, cloudRankings.length > 0 ? 1 : 0),
      activeCountriesCount: countries.size,
      totalCompletedGames: Math.floor(totalGamesSum / 2),
      serverTime: Date.now(),
    };
  }, [cloudQueueTickets, cloudRankings, cloudRooms, isCloudMode, leaderboard, user]);

  const effectiveMatchmakingStatus = useMemo<OnlineMatchmakingStatus>(() => {
    if (!isCloudMode || !user) return matchmakingStatus;
    const searchingTickets = cloudQueueTickets.filter((t) => t.status === 'searching');
    const myTicket = searchingTickets.find((t) => t.uid === user.uid);
    const byPlatform: Record<ClientPlatform, number> = {
      web: 0,
      android: 0,
      ios: 0,
      desktop: 0,
      pwa: 0,
    };
    const countedUids = new Set<string>();
    searchingTickets.forEach((t) => {
      countedUids.add(t.uid);
      byPlatform[t.platform] = (byPlatform[t.platform] ?? 0) + 1;
    });
    cloudRooms.forEach((r) => {
      if (r.white && !countedUids.has(r.white.playerId)) {
        countedUids.add(r.white.playerId);
        byPlatform[r.white.platform] = (byPlatform[r.white.platform] ?? 0) + 1;
      }
      if (r.black && !countedUids.has(r.black.playerId)) {
        countedUids.add(r.black.playerId);
        byPlatform[r.black.platform] = (byPlatform[r.black.platform] ?? 0) + 1;
      }
    });
    if (!countedUids.has(user.uid)) {
      byPlatform[clientPlatform] = (byPlatform[clientPlatform] ?? 0) + 1;
    }

    return {
      searching: Boolean(myTicket),
      timeControlId: myTicket?.timeControlId ?? null,
      targetPlatform: myTicket?.targetPlatform ?? 'all',
      startedAt: myTicket ? cloudSearchStartedAt ?? myTicket.updatedAtMs : null,
      queueCount: searchingTickets.length,
      onlineByPlatform: byPlatform,
    };
  }, [
    clientPlatform,
    cloudQueueTickets,
    cloudRooms,
    cloudSearchStartedAt,
    isCloudMode,
    matchmakingStatus,
    user,
  ]);

  // Smooth client display timer while playing or searching
  useEffect(() => {
    if (
      (!effectiveActiveRoom || effectiveActiveRoom.status !== 'playing') &&
      !effectiveMatchmakingStatus.searching
    ) {
      return;
    }
    setNowMs(Date.now());
    const id = globalThis.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => globalThis.clearInterval(id);
  }, [effectiveActiveRoom, effectiveMatchmakingStatus.searching]);

  const sendWs = useCallback(
    (payload: OnlineWsClientMessage): boolean => {
      const sock = wsRef.current;
      if (!sock || sock.readyState !== WebSocket.OPEN) {
        setErrorBanner(copy.offlineNotice);
        return false;
      }
      sock.send(JSON.stringify(payload));
      return true;
    },
    [copy.offlineNotice]
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = displayName.trim().slice(0, 24) || 'Player';
    setDisplayName(cleanedName);
    try {
      globalThis.localStorage?.setItem(PLAYER_NAME_KEY, cleanedName);
      globalThis.localStorage?.setItem(PLAYER_COUNTRY_KEY, countryCode);
    } catch {
      // ignore
    }

    if (isCloudMode && user) {
      try {
        const updated = await ensureCloudRankingProfile(user, cleanedName, countryCode, clientPlatform);
        setCloudSelfProfile(updated);
      } catch (err) {
        setErrorBanner(formatCloudError(err));
      }
      setProfileSavedToast(true);
      globalThis.setTimeout(() => setProfileSavedToast(false), 1800);
      return;
    }

    if (
      !sendWs({
        type: 'update_profile',
        name: cleanedName,
        country: countryCode,
        platform: clientPlatform,
      })
    ) {
      const profileUrl = buildApiUrl(getConfiguredApiRoutes().onlineProfile, externalServerUrl);
      if (profileUrl) {
        try {
          const res = await fetch(profileUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getServerIdHeaders(externalServerId),
            },
            body: JSON.stringify({
              playerId,
              name: cleanedName,
              country: countryCode,
              platform: clientPlatform,
            }),
          });
          const parsed = await safeParseJsonBody<{ ok?: boolean; profile?: OnlinePlayerProfile }>(res);
          if (parsed.ok && parsed.data?.profile) {
            setSelfProfile(parsed.data.profile);
          }
        } catch {
          // ignore
        }
      }
    }

    setProfileSavedToast(true);
    globalThis.setTimeout(() => setProfileSavedToast(false), 1800);
  };

  const handleToggleAutoSearch = async () => {
    setErrorBanner(null);
    if (isCloudMode && user) {
      const profileForQueue: OnlinePlayerProfile = cloudSelfProfile ?? {
        playerId: user.uid,
        name: displayName.trim().slice(0, 24) || user.displayName || 'Player',
        country: countryCode,
        platform: clientPlatform,
        elo: 1200,
        bestElo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        streak: 0,
        updatedAt: Date.now(),
      };
      try {
        if (effectiveMatchmakingStatus.searching) {
          setCloudSearchStartedAt(null);
          await cancelCloudQueueSearch(user.uid);
        } else {
          setCloudSearchStartedAt(Date.now());
          const res = await startCloudQueueSearch(
            profileForQueue,
            searchTimeControl,
            searchTargetPlatform,
            searchTargetCountry
          );
          if (res.matchedMatchId) {
            setActiveCloudMatchId(res.matchedMatchId);
            setConfirmingResign(false);
            setViewTab('arena');
            setCloudSearchStartedAt(null);
          }
        }
      } catch (err) {
        setCloudSearchStartedAt(null);
        setErrorBanner(formatCloudError(err));
      }
      return;
    }

    if (effectiveMatchmakingStatus.searching) {
      sendWs({ type: 'cancel_match' });
    } else {
      sendWs({
        type: 'find_match',
        timeControlId: searchTimeControl,
        targetPlatform: searchTargetPlatform,
        targetCountry: searchTargetCountry,
      });
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    if (isCloudMode && user) {
      const profileForRoom: OnlinePlayerProfile = cloudSelfProfile ?? {
        playerId: user.uid,
        name: displayName.trim().slice(0, 24) || user.displayName || 'Player',
        country: countryCode,
        platform: clientPlatform,
        elo: 1200,
        bestElo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        streak: 0,
        updatedAt: Date.now(),
      };
      try {
        const matchId = await createCloudRoom(
          profileForRoom,
          roomTitleInput.trim(),
          selectedTimeControl,
          preferredSide,
          isPrivateRoom
        );
        setActiveCloudMatchId(matchId);
        setConfirmingResign(false);
        setViewTab('arena');
      } catch (err) {
        setErrorBanner(formatCloudError(err));
      }
      return;
    }

    sendWs({
      type: 'create_room',
      title: roomTitleInput.trim(),
      timeControlId: selectedTimeControl,
      preferredSide,
      isPrivate: isPrivateRoom,
    });
  };

  const handleJoinRoom = async (roomIdOrCode: string, asSpectator = false) => {
    const cleaned = roomIdOrCode.trim();
    if (!cleaned) return;
    setErrorBanner(null);
    if (isCloudMode && user) {
      const profileForJoin: OnlinePlayerProfile = cloudSelfProfile ?? {
        playerId: user.uid,
        name: displayName.trim().slice(0, 24) || user.displayName || 'Player',
        country: countryCode,
        platform: clientPlatform,
        elo: 1200,
        bestElo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        streak: 0,
        updatedAt: Date.now(),
      };
      try {
        const joinedId = await joinCloudRoomByIdOrCode(cleaned, profileForJoin, asSpectator);
        if (!joinedId) {
          setErrorBanner(copy.cloudRoomNotFound);
          return;
        }
        setActiveCloudMatchId(joinedId);
        setConfirmingResign(false);
        setViewTab('arena');
      } catch (err) {
        setErrorBanner(formatCloudError(err));
      }
      return;
    }

    sendWs({
      type: 'join_room',
      roomIdOrCode: cleaned,
      asSpectator,
    });
  };

  const handleLeaveRoom = async () => {
    if (!effectiveActiveRoom) return;
    if (isCloudMode && user) {
      if (
        activeCloudMatchDoc &&
        activeCloudMatchDoc.status === 'waiting' &&
        activeCloudMatchDoc.createdByUid === user.uid
      ) {
        await deleteWaitingCloudMatch(activeCloudMatchDoc.matchId).catch(() => undefined);
      }
      setActiveCloudMatchId(null);
      setActiveCloudMatchDoc(null);
      setCloudChat([]);
      setConfirmingResign(false);
      return;
    }

    sendWs({ type: 'leave_room', roomId: effectiveActiveRoom.roomId });
    setActiveRoom(null);
    setConfirmingResign(false);
  };

  const handleCopyRoomCode = async (code: string) => {
    try {
      await globalThis.navigator?.clipboard?.writeText(code);
      setCopiedCode(true);
      globalThis.setTimeout(() => setCopiedCode(false), 1600);
    } catch {
      // ignore
    }
  };

  const playerSide: 'w' | 'b' | 'spectator' | null = useMemo(() => {
    if (!effectiveActiveRoom) return null;
    if (effectiveActiveRoom.white?.playerId === activePlayerId) return 'w';
    if (effectiveActiveRoom.black?.playerId === activePlayerId) return 'b';
    return 'spectator';
  }, [activePlayerId, effectiveActiveRoom]);

  const canMoveOnline = Boolean(
    effectiveActiveRoom &&
      effectiveActiveRoom.status === 'playing' &&
      (playerSide === 'w' || playerSide === 'b') &&
      effectiveActiveRoom.turn === playerSide
  );

  const handleOnlineMoveAttempt = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      if (!effectiveActiveRoom || !canMoveOnline) return false;
      try {
        const probe = new Chess(effectiveActiveRoom.fen);
        const result = probe.move({
          from,
          to,
          promotion: promotion || 'q',
        });
        if (!result) return false;
      } catch {
        return false;
      }

      if (isCloudMode && activeCloudMatchDoc) {
        const elapsedMs =
          activeCloudMatchDoc.moveCount > 0
            ? Math.max(0, Date.now() - (effectiveActiveRoom.lastClockSyncAt || Date.now()))
            : 0;
        void submitCloudMove(activeCloudMatchDoc, from, to, promotion, elapsedMs).catch((err) => {
          setErrorBanner(formatCloudError(err));
        });
        return true;
      }

      const clientMoveId = `mv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      return sendWs({
        type: 'make_move',
        roomId: effectiveActiveRoom.roomId,
        from,
        to,
        promotion,
        clientMoveId,
      });
    },
    [activeCloudMatchDoc, canMoveOnline, effectiveActiveRoom, formatCloudError, isCloudMode, sendWs]
  );

  const handleWarmupMoveAttempt = useCallback((from: string, to: string, promotion?: string): boolean => {
    try {
      const result = warmupChessRef.current.move({
        from,
        to,
        promotion: promotion || 'q',
      });
      if (!result) return false;
      setWarmupFen(warmupChessRef.current.fen());
      setWarmupLastMove({ from: result.from, to: result.to });
      setWarmupMoves((prev) => [...prev, result.san]);
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleResetWarmupBoard = () => {
    warmupChessRef.current.reset();
    setWarmupFen(warmupChessRef.current.fen());
    setWarmupLastMove(null);
    setWarmupMoves([]);
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveActiveRoom) return;
    const text = chatInput.trim();
    if (!text) return;

    if (isCloudMode && user && isCloudMatchParticipant) {
      const profileForChat: OnlinePlayerProfile = cloudSelfProfile ?? {
        playerId: user.uid,
        name: displayName.trim().slice(0, 24) || user.displayName || 'Player',
        country: countryCode,
        platform: clientPlatform,
        elo: 1200,
        bestElo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        streak: 0,
        updatedAt: Date.now(),
      };
      try {
        await sendCloudMatchChat(effectiveActiveRoom.roomId, profileForChat, text);
        setChatInput('');
      } catch (err) {
        setErrorBanner(formatCloudError(err));
      }
      return;
    }

    if (sendWs({ type: 'send_chat', roomId: effectiveActiveRoom.roomId, text })) {
      setChatInput('');
    }
  };

  const handleOfferDraw = async () => {
    if (!effectiveActiveRoom || (playerSide !== 'w' && playerSide !== 'b')) return;
    if (isCloudMode) {
      try {
        await offerOrRespondCloudDraw(effectiveActiveRoom.roomId, { type: 'offer', side: playerSide });
      } catch (err) {
        setErrorBanner(formatCloudError(err));
      }
      return;
    }
    sendWs({ type: 'offer_draw', roomId: effectiveActiveRoom.roomId });
  };

  const handleRespondDraw = async (accept: boolean) => {
    if (!effectiveActiveRoom) return;
    if (isCloudMode) {
      try {
        await offerOrRespondCloudDraw(effectiveActiveRoom.roomId, { type: 'respond', accept });
      } catch (err) {
        setErrorBanner(formatCloudError(err));
      }
      return;
    }
    sendWs({ type: 'respond_draw', roomId: effectiveActiveRoom.roomId, accept });
  };

  const handleResign = async () => {
    if (!effectiveActiveRoom || (playerSide !== 'w' && playerSide !== 'b')) return;
    if (isCloudMode) {
      try {
        await resignCloudMatch(effectiveActiveRoom.roomId, playerSide);
        setConfirmingResign(false);
      } catch (err) {
        setErrorBanner(formatCloudError(err));
      }
      return;
    }
    sendWs({ type: 'resign', roomId: effectiveActiveRoom.roomId });
  };

  const handleRematch = async () => {
    if (!effectiveActiveRoom || (playerSide !== 'w' && playerSide !== 'b')) return;
    if (isCloudMode && user) {
      const profileForRematch: OnlinePlayerProfile = cloudSelfProfile ?? {
        playerId: user.uid,
        name: displayName.trim().slice(0, 24) || user.displayName || 'Player',
        country: countryCode,
        platform: clientPlatform,
        elo: 1200,
        bestElo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        streak: 0,
        updatedAt: Date.now(),
      };
      try {
        const swappedSide = playerSide === 'w' ? 'b' : 'w';
        const nextId = await createCloudRoom(
          profileForRematch,
          `${effectiveActiveRoom.title}`,
          effectiveActiveRoom.timeControlId,
          swappedSide,
          false
        );
        setActiveCloudMatchId(nextId);
        setConfirmingResign(false);
      } catch (err) {
        setErrorBanner(formatCloudError(err));
      }
      return;
    }
    sendWs({ type: 'rematch', roomId: effectiveActiveRoom.roomId });
  };

  const liveClocks = useMemo(() => {
    if (!effectiveActiveRoom) return { whiteMs: 0, blackMs: 0 };
    if (effectiveActiveRoom.status !== 'playing') {
      return { whiteMs: effectiveActiveRoom.whiteTimeMs, blackMs: effectiveActiveRoom.blackTimeMs };
    }
    const elapsed = Math.max(0, nowMs - effectiveActiveRoom.lastClockSyncAt);
    return {
      whiteMs:
        effectiveActiveRoom.turn === 'w'
          ? Math.max(0, effectiveActiveRoom.whiteTimeMs - elapsed)
          : effectiveActiveRoom.whiteTimeMs,
      blackMs:
        effectiveActiveRoom.turn === 'b'
          ? Math.max(0, effectiveActiveRoom.blackTimeMs - elapsed)
          : effectiveActiveRoom.blackTimeMs,
    };
  }, [effectiveActiveRoom, nowMs]);

  const searchElapsedMs = useMemo(() => {
    if (!effectiveMatchmakingStatus.searching || !effectiveMatchmakingStatus.startedAt) return 0;
    return Math.max(0, nowMs - effectiveMatchmakingStatus.startedAt);
  }, [effectiveMatchmakingStatus.searching, effectiveMatchmakingStatus.startedAt, nowMs]);

  const filteredRooms = useMemo(() => {
    return effectiveRooms.filter((room) => {
      if (lobbyTimeFilter !== 'ALL' && room.timeControlId !== lobbyTimeFilter) {
        return false;
      }
      if (lobbyCountryFilter !== 'ALL') {
        const matchWhite = room.white?.country === lobbyCountryFilter;
        const matchBlack = room.black?.country === lobbyCountryFilter;
        if (!matchWhite && !matchBlack) return false;
      }
      return true;
    });
  }, [effectiveRooms, lobbyCountryFilter, lobbyTimeFilter]);

  const filteredRankings = useMemo(() => {
    return effectiveLeaderboard.rankings.filter((p) => {
      if (rankingsCountryFilter !== 'ALL' && p.country !== rankingsCountryFilter) {
        return false;
      }
      return true;
    });
  }, [effectiveLeaderboard.rankings, rankingsCountryFilter]);

  const selfRankIndex = useMemo(() => {
    const idx = effectiveLeaderboard.rankings.findIndex((p) => p.playerId === activePlayerId);
    return idx >= 0 ? idx + 1 : null;
  }, [activePlayerId, effectiveLeaderboard.rankings]);

  const movePairs = useMemo(() => {
    const sourceMoves = effectiveActiveRoom
      ? effectiveActiveRoom.moves.map((m) => m.san)
      : warmupMoves;
    const pairs: { moveNumber: number; white?: string; black?: string }[] = [];
    for (let i = 0; i < sourceMoves.length; i += 2) {
      pairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: sourceMoves[i],
        black: sourceMoves[i + 1],
      });
    }
    return pairs;
  }, [effectiveActiveRoom, warmupMoves]);

  const renderSeatCard = (
    seat: OnlineRoomSeat | null,
    side: 'w' | 'b',
    clockMs: number,
    isTurn: boolean,
    eloDeltaValue?: number
  ) => {
    const country = seat ? getCountryByCode(seat.country) : null;
    const seatPlatform: ClientPlatform = seat?.platform ?? 'web';
    const isLowTime = effectiveActiveRoom?.status === 'playing' && clockMs <= 20_000;
    return (
      <div
        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border transition-colors ${
          isTurn
            ? 'border-cyan-400/70 bg-cyan-500/10'
            : 'border-slate-500/35 bg-[#0F1522]/65'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-3.5 h-3.5 rounded-sm border shrink-0 ${
              side === 'w'
                ? 'bg-slate-100 border-slate-300'
                : 'bg-slate-900 border-slate-400'
            }`}
          />
          {seat && country ? (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-base leading-none shrink-0" aria-hidden="true">
                  {country.flag}
                </span>
                <span className="font-bold text-sm sm:text-base text-white truncate">
                  {seat.name}
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-slate-800 text-cyan-200 border border-slate-600/60 rounded">
                  <PlatformIcon platform={seatPlatform} className="w-3 h-3" />
                  <span>{PLATFORM_LABELS[seatPlatform][language]}</span>
                </span>
                {seat.playerId === activePlayerId && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-cyan-400/20 text-cyan-200 border border-cyan-400/40 rounded">
                    {copy.youBadge}
                  </span>
                )}
                {typeof eloDeltaValue === 'number' && eloDeltaValue !== 0 && (
                  <span
                    dir="ltr"
                    className={`px-1.5 py-0.5 text-[11px] font-mono font-bold rounded ${
                      eloDeltaValue > 0
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {eloDeltaValue > 0 ? `+${eloDeltaValue}` : eloDeltaValue}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                <span>{country.names[language]}</span>
                <span>·</span>
                <span className="font-mono font-semibold text-amber-300" dir="ltr">
                  Elo {seat.elo}
                </span>
                {!seat.connected && (
                  <span className="text-rose-300 font-semibold">· Offline</span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-sm text-slate-400 italic">{copy.emptySeat}</span>
          )}
        </div>

        <div
          dir="ltr"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono font-bold text-base sm:text-lg tabular-nums border shrink-0 ${
            isLowTime
              ? 'bg-rose-500/20 border-rose-400/60 text-rose-200'
              : isTurn
              ? 'bg-cyan-400 text-slate-950 border-cyan-300'
              : 'bg-slate-900/90 border-slate-600/60 text-slate-100'
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>{formatClock(clockMs)}</span>
        </div>
      </div>
    );
  };

  const topSeatSide: 'w' | 'b' = playerSide === 'b' ? 'w' : 'b';
  const bottomSeatSide: 'w' | 'b' = playerSide === 'b' ? 'b' : 'w';
  const selfCountry = getCountryByCode(countryCode);

  return (
    <section dir={meta.dir} className="space-y-4 sm:space-y-6">
      {/* 1. Top Header Box containing "Back to Main Workspace" */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-5 rounded-xl border border-cyan-400/40 bg-[#0F1522]/75 backdrop-blur-md shadow-xl">
        <div className="flex items-start sm:items-center gap-3">
          <button
            type="button"
            onClick={onBackToMain}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold text-slate-100 bg-slate-800/90 hover:bg-slate-700 border border-slate-500/50 rounded-lg transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>{copy.backToWorkspace}</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-cyan-300 shrink-0" />
              <h2 className="text-base sm:text-xl font-bold text-white">{copy.pageTitle}</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">{copy.pageSubtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border ${
              isCloudMode
                ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                : connStatus === 'connected'
                ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                : 'bg-amber-500/15 border-amber-400/50 text-amber-200'
            }`}
          >
            {isCloudMode ? (
              <Cloud className="w-3.5 h-3.5 text-emerald-300" />
            ) : (
              <span
                className={`w-2 h-2 rounded-full ${
                  connStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                }`}
              />
            )}
            <span>
              {isCloudMode
                ? copy.cloudConnectedLabel
                : connStatus === 'connected'
                ? copy.connectedLabel
                : connStatus === 'connecting'
                ? copy.connectingLabel
                : copy.reconnectingLabel}
            </span>
          </span>
          {!isCloudMode && connStatus !== 'connected' && (
            <button
              type="button"
              onClick={() => setReconnectAttempt((n) => n + 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 rounded-md transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{copy.reconnectBtn}</span>
            </button>
          )}
        </div>
      </div>

      {/* Firebase Global Cloud Connection Bar (Cross-Platform Multi-Device Sync) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-cyan-400/35 bg-slate-900/75 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <Cloud className={`w-5 h-5 shrink-0 ${isCloudMode ? 'text-emerald-300' : 'text-cyan-300'}`} />
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 flex-wrap">
              <span>{isCloudMode ? copy.cloudConnectedLabel : copy.cloudSignInBtn}</span>
              <span
                dir="ltr"
                className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-cyan-200 border border-slate-600/60 rounded"
              >
                {FIREBASE_PROJECT_ID}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
              {isCloudMode ? copy.cloudModeActiveDesc : copy.cloudModePromptDesc}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCloudMode && user ? (
            <>
              <span className="px-2.5 py-1.5 text-xs font-semibold text-emerald-200 bg-emerald-500/15 border border-emerald-400/40 rounded-lg">
                {user.displayName || user.email}
              </span>
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void signOut()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-500/50 rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{copy.cloudSignOutBtn}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!authReady || authBusy}
              onClick={() => {
                clearAuthError();
                setErrorBanner(null);
                void signInWithGoogle();
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              <span>{authBusy ? copy.cloudSigningIn : copy.cloudSignInBtn}</span>
            </button>
          )}
        </div>
      </div>

      {errorBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-rose-400/60 bg-rose-950/60 text-rose-100 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-300 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              clearAuthError();
              setErrorBanner(null);
            }}
            className="text-xs font-bold text-rose-200 hover:text-white px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. LARGE INTERACTIVE CHESSBOARD + CROSS-PLATFORM AUTO-MATCHMAKING DIRECTLY BELOW HEADER BOX */}
      <div className="p-3.5 sm:p-5 rounded-2xl border border-cyan-400/45 bg-[#0F1522]/80 backdrop-blur-md shadow-2xl">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Primary Large Interactive Chessboard Column */}
          <div className="xl:col-span-7 space-y-3">
            {effectiveActiveRoom ? (
              <>
                {/* Room Top Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-slate-500/40 bg-slate-900/75">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm sm:text-base text-white">{effectiveActiveRoom.title}</span>
                    <span
                      dir="ltr"
                      className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/40"
                    >
                      {effectiveActiveRoom.timeControlId}
                    </span>
                    <span className="text-xs text-slate-300">
                      · {copy.spectatorsCount}: {effectiveActiveRoom.spectatorCount}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyRoomCode(effectiveActiveRoom.code)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono font-bold text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/50 rounded-md transition-colors"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>
                        {copy.roomCodeLabel}: {effectiveActiveRoom.code}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleLeaveRoom()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-200 bg-rose-500/15 hover:bg-rose-500/30 border border-rose-400/50 rounded-md transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{copy.leaveRoom}</span>
                    </button>
                  </div>
                </div>

                {effectiveActiveRoom.status === 'waiting' && (
                  <div className="p-3.5 rounded-xl border border-amber-400/50 bg-amber-500/10 text-amber-100 text-xs sm:text-sm">
                    <div className="font-bold">{copy.waitingBannerTitle}</div>
                    <div className="text-amber-200/90 mt-0.5">{copy.waitingBannerDesc}</div>
                  </div>
                )}

                {effectiveActiveRoom.status === 'finished' && (
                  <div className="p-3.5 rounded-xl border border-emerald-400/50 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-300" />
                        <span>
                          {effectiveActiveRoom.winner === 'w'
                            ? copy.whiteWon
                            : effectiveActiveRoom.winner === 'b'
                            ? copy.blackWon
                            : copy.drawResult}
                        </span>
                      </div>
                      {effectiveActiveRoom.endReason && (
                        <div className="text-xs text-slate-300 mt-0.5">
                          {copy.endReasons[effectiveActiveRoom.endReason]}
                        </div>
                      )}
                    </div>

                    {(playerSide === 'w' || playerSide === 'b') &&
                      effectiveActiveRoom.white &&
                      effectiveActiveRoom.black && (
                        <button
                          type="button"
                          onClick={() => void handleRematch()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>
                            {effectiveActiveRoom.rematchVotes[playerSide] ? copy.rematchVoted : copy.rematch}
                          </span>
                        </button>
                      )}
                  </div>
                )}

                {renderSeatCard(
                  topSeatSide === 'w' ? effectiveActiveRoom.white : effectiveActiveRoom.black,
                  topSeatSide,
                  topSeatSide === 'w' ? liveClocks.whiteMs : liveClocks.blackMs,
                  effectiveActiveRoom.status === 'playing' && effectiveActiveRoom.turn === topSeatSide,
                  effectiveActiveRoom.eloDelta?.[topSeatSide]
                )}

                {/* Large Synchronized Multiplayer Board */}
                <div className="w-full max-w-[680px] mx-auto">
                  <TacticalBoard
                    fen={effectiveActiveRoom.fen}
                    orientation={playerSide === 'b' ? 'black' : 'white'}
                    boardSize="large"
                    lastMove={
                      effectiveActiveRoom.lastMove
                        ? { from: effectiveActiveRoom.lastMove.from, to: effectiveActiveRoom.lastMove.to }
                        : null
                    }
                    showEvalBar={false}
                    showHintArrow={false}
                    disabled={!canMoveOnline}
                    onMoveAttempt={handleOnlineMoveAttempt}
                  />
                </div>

                {renderSeatCard(
                  bottomSeatSide === 'w' ? effectiveActiveRoom.white : effectiveActiveRoom.black,
                  bottomSeatSide,
                  bottomSeatSide === 'w' ? liveClocks.whiteMs : liveClocks.blackMs,
                  effectiveActiveRoom.status === 'playing' && effectiveActiveRoom.turn === bottomSeatSide,
                  effectiveActiveRoom.eloDelta?.[bottomSeatSide]
                )}

                {effectiveActiveRoom.status === 'playing' && (playerSide === 'w' || playerSide === 'b') && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-slate-500/40 bg-slate-900/75">
                    <div className="flex flex-wrap items-center gap-2">
                      {effectiveActiveRoom.drawOfferBy && effectiveActiveRoom.drawOfferBy !== playerSide ? (
                        <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-400/50 px-3 py-1.5 rounded-lg">
                          <span className="text-xs font-bold text-amber-200">{copy.incomingDrawOffer}</span>
                          <button
                            type="button"
                            onClick={() => void handleRespondDraw(true)}
                            className="px-2.5 py-1 text-xs font-bold bg-emerald-400 text-slate-950 rounded"
                          >
                            {copy.acceptDraw}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRespondDraw(false)}
                            className="px-2.5 py-1 text-xs font-bold bg-slate-700 text-slate-100 rounded"
                          >
                            {copy.declineDraw}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={effectiveActiveRoom.drawOfferBy === playerSide}
                          onClick={() => void handleOfferDraw()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-100 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-500/50 rounded-lg transition-colors"
                        >
                          <Handshake className="w-4 h-4" />
                          <span>
                            {effectiveActiveRoom.drawOfferBy === playerSide
                              ? copy.drawOfferedByYou
                              : copy.offerDraw}
                          </span>
                        </button>
                      )}
                    </div>

                    <div>
                      {confirmingResign ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleResign()}
                            className="px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg"
                          >
                            {copy.confirmResign}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingResign(false)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-slate-700 text-slate-200 rounded-lg"
                          >
                            {copy.cancel}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingResign(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/50 rounded-lg transition-colors"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span>{copy.resign}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Pre-Match Top Status Banner directly over the Large Board */}
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border ${
                    effectiveMatchmakingStatus.searching
                      ? 'border-cyan-400/70 bg-cyan-500/15'
                      : 'border-slate-500/40 bg-slate-900/75'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {effectiveMatchmakingStatus.searching ? (
                      <Radar className="w-5 h-5 text-cyan-300 animate-spin shrink-0" />
                    ) : (
                      <Swords className="w-5 h-5 text-cyan-300 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-white">
                        {effectiveMatchmakingStatus.searching ? copy.searchingStatus : copy.warmupTitle}
                      </div>
                      <div className="text-[11px] sm:text-xs text-slate-300 truncate">
                        {effectiveMatchmakingStatus.searching
                          ? `${effectiveMatchmakingStatus.timeControlId ?? searchTimeControl} · ${
                              effectiveMatchmakingStatus.targetPlatform === 'all'
                                ? copy.allPlatforms
                                : PLATFORM_LABELS[effectiveMatchmakingStatus.targetPlatform][language]
                            }`
                          : copy.warmupSubtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {effectiveMatchmakingStatus.searching && (
                      <span
                        dir="ltr"
                        className="px-2.5 py-1 text-xs font-mono font-bold text-cyan-200 bg-slate-950/70 border border-cyan-400/50 rounded-md"
                      >
                        {formatClock(searchElapsedMs)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setWarmupOrientation((o) => (o === 'white' ? 'black' : 'white'))
                      }
                      className="px-2.5 py-1.5 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-500/50 rounded-md transition-colors"
                    >
                      {copy.flipBoard}
                    </button>
                    <button
                      type="button"
                      onClick={handleResetWarmupBoard}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-500/50 rounded-md transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{copy.resetBoard}</span>
                    </button>
                  </div>
                </div>

                {/* Large Always-Interactive Chessboard */}
                <div className="w-full max-w-[680px] mx-auto">
                  <TacticalBoard
                    fen={warmupFen}
                    orientation={warmupOrientation}
                    boardSize="large"
                    lastMove={warmupLastMove}
                    showEvalBar={false}
                    showHintArrow={false}
                    onMoveAttempt={handleWarmupMoveAttempt}
                  />
                </div>

                {/* Self Platform + Country Bar under the Large Board */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-slate-500/35 bg-slate-900/70 text-xs sm:text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base leading-none">{selfCountry.flag}</span>
                    <span className="font-bold text-white">{displayName}</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-cyan-500/15 text-cyan-200 border border-cyan-400/40 rounded">
                      <PlatformIcon platform={clientPlatform} className="w-3.5 h-3.5" />
                      <span>
                        {copy.yourPlatformLabel}: {PLATFORM_LABELS[clientPlatform][language]}
                      </span>
                    </span>
                  </div>
                  <div className="font-mono font-bold text-amber-300" dir="ltr">
                    Elo {effectiveSelfProfile?.elo ?? 1200}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Column beside the Large Board: Auto-Matchmaking Panel OR Match Moves + Chat */}
          <div className="xl:col-span-5 space-y-4">
            {/* Cross-Platform Automatic Matchmaking Card */}
            {!effectiveActiveRoom && (
              <div className="p-4 rounded-xl border border-cyan-400/40 bg-slate-900/80 space-y-3.5">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <Radar className="w-4 h-4 text-cyan-300" />
                    <span>{copy.autoMatchTitle}</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">{copy.autoMatchSubtitle}</p>
                </div>

                {/* Time Control Selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    {copy.timeControlLabel}
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(Object.keys(ONLINE_TIME_CONTROLS) as OnlineTimeControlId[]).map((tcId) => (
                      <button
                        key={tcId}
                        type="button"
                        disabled={effectiveMatchmakingStatus.searching}
                        onClick={() => setSearchTimeControl(tcId)}
                        dir="ltr"
                        className={`py-2 text-xs sm:text-sm font-mono font-bold rounded-lg border transition-colors disabled:opacity-60 ${
                          searchTimeControl === tcId
                            ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                            : 'bg-slate-950/70 text-slate-200 border-slate-600/50 hover:bg-slate-800'
                        }`}
                      >
                        {tcId}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Platform + Country Filter */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      {copy.searchTargetPlatform}
                    </label>
                    <select
                      disabled={effectiveMatchmakingStatus.searching}
                      value={searchTargetPlatform}
                      onChange={(e) => setSearchTargetPlatform(e.target.value as PlatformFilter)}
                      className="w-full px-2.5 py-2 text-xs sm:text-sm text-white bg-slate-950/85 border border-slate-500/50 rounded-lg disabled:opacity-60"
                    >
                      <option value="all">{copy.allPlatforms}</option>
                      {(['android', 'web', 'desktop', 'ios', 'pwa'] as ClientPlatform[]).map((plat) => (
                        <option key={plat} value={plat}>
                          {PLATFORM_LABELS[plat][language]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      {copy.searchTargetCountry}
                    </label>
                    <select
                      disabled={effectiveMatchmakingStatus.searching}
                      value={searchTargetCountry}
                      onChange={(e) => setSearchTargetCountry(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs sm:text-sm text-white bg-slate-950/85 border border-slate-500/50 rounded-lg disabled:opacity-60"
                    >
                      <option value="ALL">{copy.allCountries}</option>
                      {COUNTRY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.names[language]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Auto-Search Button */}
                <button
                  type="button"
                  onClick={() => void handleToggleAutoSearch()}
                  className={`w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-xs sm:text-sm font-bold rounded-xl transition-colors shadow-md cursor-pointer ${
                    effectiveMatchmakingStatus.searching
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                  }`}
                >
                  {effectiveMatchmakingStatus.searching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>
                        {copy.cancelAutoSearch} ({formatClock(searchElapsedMs)})
                      </span>
                      <X className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <Radar className="w-4 h-4" />
                      <span>{copy.startAutoSearch}</span>
                    </>
                  )}
                </button>

                {/* Real Connected Players by Platform Breakdown */}
                <div className="pt-2 border-t border-slate-700/70 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>{copy.activePlatformsNow}</span>
                    <span className="font-mono text-cyan-300">
                      {copy.queuedSeekersLabel}: {effectiveMatchmakingStatus.queueCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 text-center">
                    {(['web', 'android', 'desktop', 'ios', 'pwa'] as ClientPlatform[]).map((plat) => (
                      <div
                        key={plat}
                        className="p-2 rounded-lg border border-slate-700/70 bg-slate-950/60"
                      >
                        <div className="flex justify-center text-cyan-300 mb-0.5">
                          <PlatformIcon platform={plat} className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-[10px] text-slate-300 truncate">
                          {PLATFORM_LABELS[plat][language]}
                        </div>
                        <div className="font-mono font-bold text-xs text-white" dir="ltr">
                          {effectiveMatchmakingStatus.onlineByPlatform[plat] ?? 0}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Move List (works for active match OR warm-up board) */}
            <div className="p-3.5 sm:p-4 rounded-xl border border-slate-400/35 bg-slate-900/75 space-y-2.5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Swords className="w-4 h-4 text-cyan-300" />
                <span>{copy.movesHistory}</span>
              </h3>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-600/40 bg-slate-950/60 p-2 space-y-1">
                {movePairs.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">—</p>
                ) : (
                  movePairs.map((pair) => (
                    <div
                      key={pair.moveNumber}
                      dir="ltr"
                      className="grid grid-cols-12 items-center text-xs font-mono py-1 px-2 rounded hover:bg-slate-800/60"
                    >
                      <span className="col-span-2 text-slate-400">{pair.moveNumber}.</span>
                      <span className="col-span-5 text-white font-semibold">{pair.white ?? ''}</span>
                      <span className="col-span-5 text-slate-200">{pair.black ?? ''}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Room Chat when inside a live room */}
            {effectiveActiveRoom && (!isCloudMode || isCloudMatchParticipant) && (
              <div className="p-3.5 sm:p-4 rounded-xl border border-slate-400/35 bg-slate-900/75 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-cyan-300" />
                  <span>{copy.roomChat}</span>
                </h3>
                <div className="h-48 overflow-y-auto rounded-lg border border-slate-600/40 bg-slate-950/60 p-2.5 space-y-2">
                  {effectiveActiveRoom.chat.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">{copy.noChatMessages}</p>
                  ) : (
                    effectiveActiveRoom.chat.map((msg) => {
                      const senderCountry = getCountryByCode(msg.country);
                      return (
                        <div key={msg.id} className="text-xs leading-relaxed">
                          <span className="me-1" aria-hidden="true">
                            {senderCountry.flag}
                          </span>
                          <strong className="text-cyan-200 me-1.5">{msg.name}:</strong>
                          <span className="text-slate-100">{msg.text}</span>
                        </div>
                      );
                    })
                  )}
                </div>
                <form onSubmit={(e) => void handleSendChat(e)} className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={180}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={copy.chatPlaceholder}
                    className="flex-1 px-3 py-2 text-xs sm:text-sm text-white bg-slate-950/90 border border-slate-500/50 rounded-lg focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    aria-label={copy.sendChat}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Sub-navigation between Rooms & Global Top Players Rankings */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 p-1 rounded-xl border border-slate-400/35 bg-[#0F1522]/60">
          <button
            type="button"
            onClick={() => setViewTab('arena')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors ${
              viewTab === 'arena'
                ? 'bg-cyan-400 text-slate-950'
                : 'text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <Swords className="w-4 h-4" />
            <span>{copy.tabArena}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewTab('rankings')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors ${
              viewTab === 'rankings'
                ? 'bg-amber-400 text-slate-950'
                : 'text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>{copy.tabRankings}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="px-3 py-1.5 rounded-lg border border-slate-500/40 bg-[#0F1522]/60 text-slate-200">
            <span className="text-slate-400">{copy.onlineNowStat}: </span>
            <strong className="font-mono text-emerald-300">{effectiveLeaderboard.onlinePlayersCount}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-lg border border-slate-500/40 bg-[#0F1522]/60 text-slate-200">
            <span className="text-slate-400">{copy.countriesStat}: </span>
            <strong className="font-mono text-cyan-300">{effectiveLeaderboard.activeCountriesCount}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-lg border border-slate-500/40 bg-[#0F1522]/60 text-slate-200">
            <span className="text-slate-400">{copy.gamesStat}: </span>
            <strong className="font-mono text-amber-300">{effectiveLeaderboard.totalCompletedGames}</strong>
          </div>
        </div>
      </div>

      {/* 4. Player Identity & Country Card */}
      <form
        onSubmit={(e) => void handleSaveProfile(e)}
        className="p-3.5 sm:p-4 rounded-xl border border-slate-400/35 bg-[#0F1522]/65 backdrop-blur-sm grid grid-cols-1 lg:grid-cols-12 gap-3 items-end"
      >
        <div className="lg:col-span-4 space-y-1">
          <label className="block text-xs font-semibold text-slate-300">
            {copy.displayNameLabel}
          </label>
          <input
            type="text"
            maxLength={24}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={copy.displayNamePlaceholder}
            className="w-full px-3 py-2 text-sm text-white bg-slate-900/90 border border-slate-500/50 rounded-lg focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="lg:col-span-3 space-y-1">
          <label className="block text-xs font-semibold text-slate-300">
            {copy.countryLabel}
          </label>
          <select
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="w-full px-3 py-2 text-sm text-white bg-slate-900/90 border border-slate-500/50 rounded-lg focus:outline-none focus:border-cyan-400"
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.names[language]}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
          >
            {profileSavedToast ? <Check className="w-4 h-4" /> : null}
            <span>{profileSavedToast ? copy.profileSaved : copy.saveProfile}</span>
          </button>
        </div>

        <div className="lg:col-span-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-600/50 bg-slate-900/70 text-xs">
          <div>
            <div className="text-slate-400">{copy.yourElo}</div>
            <div className="font-mono font-bold text-base text-amber-300" dir="ltr">
              {effectiveSelfProfile?.elo ?? 1200}
              {selfRankIndex ? <span className="text-xs text-slate-400 ms-1.5">#{selfRankIndex}</span> : null}
            </div>
          </div>
          <div className="text-center">
            <div className="text-slate-400">{copy.recordLabel}</div>
            <div className="font-mono font-semibold text-slate-100" dir="ltr">
              {effectiveSelfProfile?.wins ?? 0}/{effectiveSelfProfile?.draws ?? 0}/
              {effectiveSelfProfile?.losses ?? 0}
            </div>
          </div>
          <div className="text-end">
            <div className="text-slate-400">{copy.streakLabel}</div>
            <div className="font-mono font-semibold text-emerald-300" dir="ltr">
              {effectiveSelfProfile?.streak ?? 0}
            </div>
          </div>
        </div>
      </form>

      {/* 5. Rooms Browser OR Global Top Players Leaderboard */}
      {viewTab === 'arena' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* Left Column: Create Room + Join by Code */}
          <div className="lg:col-span-5 space-y-4">
            <form
              onSubmit={(e) => void handleCreateRoom(e)}
              className="p-4 sm:p-5 rounded-xl border border-cyan-400/35 bg-[#0F1522]/75 space-y-3.5"
            >
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-300" />
                <span>{copy.createRoomTitle}</span>
              </h3>

              <div className="space-y-1">
                <label className="block text-xs text-slate-300">{copy.roomTitleLabel}</label>
                <input
                  type="text"
                  maxLength={36}
                  value={roomTitleInput}
                  onChange={(e) => setRoomTitleInput(e.target.value)}
                  placeholder={copy.roomTitlePlaceholder}
                  className="w-full px-3 py-2 text-sm text-white bg-slate-900/90 border border-slate-500/50 rounded-lg focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-slate-300">{copy.timeControlLabel}</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.keys(ONLINE_TIME_CONTROLS) as OnlineTimeControlId[]).map((tcId) => (
                    <button
                      key={tcId}
                      type="button"
                      onClick={() => setSelectedTimeControl(tcId)}
                      dir="ltr"
                      className={`py-2 text-xs sm:text-sm font-mono font-bold rounded-lg border transition-colors ${
                        selectedTimeControl === tcId
                          ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                          : 'bg-slate-900/80 text-slate-200 border-slate-600/50 hover:bg-slate-800'
                      }`}
                    >
                      {tcId}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-slate-300">{copy.preferredSideLabel}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['random', copy.sideRandom],
                      ['w', copy.sideWhite],
                      ['b', copy.sideBlack],
                    ] as const
                  ).map(([sideVal, label]) => (
                    <button
                      key={sideVal}
                      type="button"
                      onClick={() => setPreferredSide(sideVal)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                        preferredSide === sideVal
                          ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                          : 'bg-slate-900/80 text-slate-200 border-slate-600/50 hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPrivateRoom}
                  onChange={(e) => setIsPrivateRoom(e.target.checked)}
                  className="rounded border-slate-500 bg-slate-900 text-cyan-400"
                />
                <span>{copy.privateRoomLabel}</span>
              </label>

              <button
                type="submit"
                className="w-full py-2.5 text-sm font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors shadow-sm"
              >
                {copy.createRoomBtn}
              </button>
            </form>

            {/* Join by 6-char Code */}
            <div className="p-4 sm:p-5 rounded-xl border border-slate-400/35 bg-[#0F1522]/75 space-y-3">
              <h3 className="text-sm sm:text-base font-bold text-white">{copy.joinByCodeTitle}</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={8}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder={copy.roomCodePlaceholder}
                  dir="ltr"
                  className="flex-1 px-3 py-2 text-sm font-mono uppercase text-white bg-slate-900/90 border border-slate-500/50 rounded-lg focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => void handleJoinRoom(joinCodeInput, false)}
                  className="px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap"
                >
                  {copy.joinBtn}
                </button>
                <button
                  type="button"
                  onClick={() => void handleJoinRoom(joinCodeInput, true)}
                  title={copy.watchBtn}
                  className="px-2.5 py-2 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-500/50 rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live International Rooms Browser */}
          <div className="lg:col-span-7 p-4 sm:p-5 rounded-xl border border-slate-400/35 bg-[#0F1522]/75 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-300" />
                <span>{copy.openRoomsTitle}</span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={lobbyCountryFilter}
                  onChange={(e) => setLobbyCountryFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs text-white bg-slate-900/90 border border-slate-500/50 rounded-lg"
                >
                  <option value="ALL">{copy.filterCountryAll}</option>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.names[language]}
                    </option>
                  ))}
                </select>

                <select
                  value={lobbyTimeFilter}
                  onChange={(e) => setLobbyTimeFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs text-white bg-slate-900/90 border border-slate-500/50 rounded-lg"
                >
                  <option value="ALL">{copy.filterTimeAll}</option>
                  {(Object.keys(ONLINE_TIME_CONTROLS) as OnlineTimeControlId[]).map((tcId) => (
                    <option key={tcId} value={tcId}>
                      {tcId}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredRooms.length === 0 ? (
              <div className="py-12 px-4 text-center rounded-xl border border-dashed border-slate-600/60 bg-slate-950/35 space-y-1.5">
                <Globe2 className="w-8 h-8 text-cyan-300/70 mx-auto" />
                <p className="text-sm font-semibold text-slate-200">{copy.noRoomsYet}</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">{copy.noRoomsHint}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRooms.map((room) => {
                  const whiteCountry = room.white ? getCountryByCode(room.white.country) : null;
                  const blackCountry = room.black ? getCountryByCode(room.black.country) : null;
                  const canJoinAsPlayer = room.status === 'waiting' && (!room.white || !room.black);

                  return (
                    <div
                      key={room.roomId}
                      className="p-3.5 rounded-xl border border-slate-500/40 bg-slate-900/75 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-white truncate">{room.title}</span>
                          <span
                            dir="ltr"
                            className="px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/40"
                          >
                            {room.timeControlId}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                              room.status === 'waiting'
                                ? 'bg-amber-500/20 text-amber-200'
                                : room.status === 'playing'
                                ? 'bg-emerald-500/20 text-emerald-200'
                                : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {room.status === 'waiting'
                              ? copy.waitingOpponent
                              : room.status === 'playing'
                              ? copy.playingNow
                              : copy.finishedMatch}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                          {room.white && whiteCountry ? (
                            <span className="inline-flex items-center gap-1">
                              <span>{whiteCountry.flag}</span>
                              <span className="text-white font-semibold">{room.white.name}</span>
                              <PlatformIcon platform={room.white.platform ?? 'web'} className="w-3 h-3 text-cyan-300" />
                              <span className="font-mono text-amber-300">({room.white.elo})</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">{copy.emptySeat}</span>
                          )}
                          <span className="text-slate-500 font-bold">vs</span>
                          {room.black && blackCountry ? (
                            <span className="inline-flex items-center gap-1">
                              <span>{blackCountry.flag}</span>
                              <span className="text-white font-semibold">{room.black.name}</span>
                              <PlatformIcon platform={room.black.platform ?? 'web'} className="w-3 h-3 text-cyan-300" />
                              <span className="font-mono text-amber-300">({room.black.elo})</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">{copy.emptySeat}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {canJoinAsPlayer ? (
                          <button
                            type="button"
                            onClick={() => void handleJoinRoom(room.roomId, false)}
                            className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors"
                          >
                            {copy.joinBtn}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleJoinRoom(room.roomId, true)}
                          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-500/50 rounded-lg transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{copy.watchBtn}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {viewTab === 'rankings' && (
        <div className="p-4 sm:p-5 rounded-xl border border-amber-400/35 bg-[#0F1522]/75 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-300" />
                <span>{copy.rankingsTitle}</span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">{copy.rankingsSubtitle}</p>
            </div>

            <select
              value={rankingsCountryFilter}
              onChange={(e) => setRankingsCountryFilter(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm text-white bg-slate-900/90 border border-slate-500/50 rounded-lg"
            >
              <option value="ALL">{copy.filterCountryAll}</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.names[language]}
                </option>
              ))}
            </select>
          </div>

          {filteredRankings.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-xl border border-dashed border-slate-600/60 bg-slate-950/35 space-y-2">
              <Trophy className="w-8 h-8 text-amber-300/70 mx-auto" />
              <p className="text-sm text-slate-300">{copy.noRankingsYet}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-600/40 bg-slate-950/50">
              <table className="w-full text-start border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-700/70 text-slate-300 bg-slate-900/70">
                    <th className="py-2.5 px-3 font-bold">{copy.rankCol}</th>
                    <th className="py-2.5 px-3 font-bold">{copy.playerCol}</th>
                    <th className="py-2.5 px-3 font-bold">{copy.platformCol}</th>
                    <th className="py-2.5 px-3 font-bold">{copy.countryCol}</th>
                    <th className="py-2.5 px-3 font-bold">{copy.eloCol}</th>
                    <th className="py-2.5 px-3 font-bold">{copy.bestEloCol}</th>
                    <th className="py-2.5 px-3 font-bold">{copy.wdlCol}</th>
                    <th className="py-2.5 px-3 font-bold">{copy.streakCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRankings.map((player, index) => {
                    const globalRank =
                      effectiveLeaderboard.rankings.findIndex((p) => p.playerId === player.playerId) + 1 ||
                      index + 1;
                    const country = getCountryByCode(player.country);
                    const plat: ClientPlatform = player.platform ?? 'web';
                    const isSelf = player.playerId === activePlayerId;

                    return (
                      <tr
                        key={player.playerId}
                        className={`border-b border-slate-800/70 transition-colors ${
                          isSelf ? 'bg-cyan-500/15' : 'hover:bg-slate-900/50'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-200" dir="ltr">
                          {globalRank === 1
                            ? '🥇 #1'
                            : globalRank === 2
                            ? '🥈 #2'
                            : globalRank === 3
                            ? '🥉 #3'
                            : `#${globalRank}`}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <span>{player.name}</span>
                            {isSelf && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-cyan-400/20 text-cyan-200 border border-cyan-400/40 rounded">
                                {copy.youBadge}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-cyan-200">
                          <span className="inline-flex items-center gap-1">
                            <PlatformIcon platform={plat} className="w-3.5 h-3.5" />
                            <span>{PLATFORM_LABELS[plat][language]}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-200">
                          <span className="inline-flex items-center gap-1.5">
                            <span>{country.flag}</span>
                            <span>{country.names[language]}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-300" dir="ltr">
                          {player.elo}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300" dir="ltr">
                          {player.bestElo}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-200" dir="ltr">
                          {player.wins}/{player.draws}/{player.losses}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-300" dir="ltr">
                          {player.streak > 0 ? `🔥 ${player.streak}` : '0'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
