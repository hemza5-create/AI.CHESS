import { Chess } from 'chess.js';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { COUNTRY_OPTIONS } from '../data/countries.ts';
import {
  ONLINE_TIME_CONTROLS,
  type ClientPlatform,
  type OnlineGameEndReason,
  type OnlinePlayerProfile,
  type OnlineRoomChatMessage,
  type OnlineRoomState,
  type OnlineRoomSummary,
  type OnlineTimeControlId,
  type PlatformFilter,
} from '../types/onlineChess.ts';
import { db, handleFirestoreError, OperationType } from './firebaseApp.ts';

const VALID_PLATFORMS = new Set<ClientPlatform>(['web', 'android', 'ios', 'desktop', 'pwa']);
const VALID_COUNTRY_CODES = new Set(COUNTRY_OPTIONS.map((c) => c.code));

export interface CloudQueueTicket {
  uid: string;
  displayName: string;
  country: string;
  platform: ClientPlatform;
  elo: number;
  timeControlId: OnlineTimeControlId;
  targetPlatform: PlatformFilter;
  targetCountry: string;
  status: 'searching' | 'matched';
  matchedMatchId: string;
  matchedByUid: string;
  updatedAtMs: number;
}

export interface FirestoreMatchDoc {
  matchId: string;
  code: string;
  title: string;
  timeControlId: OnlineTimeControlId;
  isPrivate: boolean;
  status: 'waiting' | 'playing' | 'finished';
  createdByUid: string;
  whiteUid: string;
  whiteName: string;
  whiteCountry: string;
  whitePlatform: ClientPlatform;
  whiteElo: number;
  blackUid: string;
  blackName: string;
  blackCountry: string;
  blackPlatform: ClientPlatform;
  blackElo: number;
  fen: string;
  turn: 'w' | 'b';
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveFrom: string;
  lastMoveTo: string;
  lastMoveSan: string;
  moveCount: number;
  movesSan: string[];
  winner: '' | 'w' | 'b' | 'draw';
  endReason: string;
  drawOfferBy: '' | 'w' | 'b';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

function sanitizeDisplayName(raw: string): string {
  const cleaned = raw.replace(/[\r\n\t<>]/g, ' ').trim().slice(0, 32);
  return cleaned.length >= 2 ? cleaned : 'Player';
}

function sanitizeCountry(raw: string): string {
  const upper = raw.trim().toUpperCase();
  return VALID_COUNTRY_CODES.has(upper) ? upper : 'INTL';
}

function sanitizeTargetCountry(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (upper === 'ALL' || !upper) return 'ALL';
  return VALID_COUNTRY_CODES.has(upper) ? upper : 'ALL';
}

function sanitizePlatform(raw: string): ClientPlatform {
  const lower = raw.trim().toLowerCase() as ClientPlatform;
  return VALID_PLATFORMS.has(lower) ? lower : 'web';
}

function sanitizeRoomTitle(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[\r\n\t<>]/g, ' ').trim().slice(0, 40);
  return cleaned.length >= 1 ? cleaned : fallback.slice(0, 40);
}

function generateId(prefix: string): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto?.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex || Date.now().toString(36)}`;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  globalThis.crypto?.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function toMs(ts: unknown): number {
  if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as Timestamp).toMillis === 'function') {
    return (ts as Timestamp).toMillis();
  }
  return Date.now();
}

function mapMatchDocToSummary(d: FirestoreMatchDoc): OnlineRoomSummary {
  return {
    roomId: d.matchId,
    code: d.code,
    title: d.title,
    timeControlId: d.timeControlId,
    isPrivate: d.isPrivate,
    status: d.status,
    white: d.whiteUid
      ? {
          playerId: d.whiteUid,
          name: d.whiteName,
          country: d.whiteCountry,
          platform: d.whitePlatform,
          elo: d.whiteElo,
          connected: true,
        }
      : null,
    black: d.blackUid
      ? {
          playerId: d.blackUid,
          name: d.blackName,
          country: d.blackCountry,
          platform: d.blackPlatform,
          elo: d.blackElo,
          connected: true,
        }
      : null,
    spectatorCount: 0,
    moveCount: d.moveCount,
    createdAt: toMs(d.createdAt),
  };
}

export function mapMatchDocToRoomState(
  d: FirestoreMatchDoc,
  chat: OnlineRoomChatMessage[] = []
): OnlineRoomState {
  return {
    roomId: d.matchId,
    code: d.code,
    title: d.title,
    timeControlId: d.timeControlId,
    isPrivate: d.isPrivate,
    status: d.status,
    fen: d.fen,
    turn: d.turn,
    white: d.whiteUid
      ? {
          playerId: d.whiteUid,
          name: d.whiteName,
          country: d.whiteCountry,
          platform: d.whitePlatform,
          elo: d.whiteElo,
          connected: true,
        }
      : null,
    black: d.blackUid
      ? {
          playerId: d.blackUid,
          name: d.blackName,
          country: d.blackCountry,
          platform: d.blackPlatform,
          elo: d.blackElo,
          connected: true,
        }
      : null,
    whiteTimeMs: d.whiteTimeMs,
    blackTimeMs: d.blackTimeMs,
    lastClockSyncAt: toMs(d.updatedAt),
    lastMove:
      d.lastMoveFrom && d.lastMoveTo
        ? {
            from: d.lastMoveFrom,
            to: d.lastMoveTo,
            san: d.lastMoveSan,
            uci: `${d.lastMoveFrom}${d.lastMoveTo}`,
          }
        : null,
    moves: (d.movesSan ?? []).map((san, idx) => ({
      ply: idx + 1,
      san,
      uci: san,
      fen: d.fen,
      by: idx % 2 === 0 ? 'w' : 'b',
      timestamp: toMs(d.updatedAt),
    })),
    winner: d.winner === '' ? null : d.winner,
    endReason: (d.endReason || null) as OnlineGameEndReason | null,
    drawOfferBy: d.drawOfferBy === '' ? null : d.drawOfferBy,
    rematchVotes: { w: false, b: false },
    spectatorCount: 0,
    chat,
    eloDelta: null,
  };
}

export async function ensureCloudRankingProfile(
  user: User,
  displayNameRaw: string,
  countryRaw: string,
  platformRaw: ClientPlatform
): Promise<OnlinePlayerProfile> {
  const path = `rankings/${user.uid}`;
  const ref = doc(db, 'rankings', user.uid);
  const displayName = sanitizeDisplayName(displayNameRaw || user.displayName || 'Player');
  const country = sanitizeCountry(countryRaw);
  const platform = sanitizePlatform(platformRaw);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        country,
        platform,
        elo: 1200,
        bestElo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        streak: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {
        playerId: user.uid,
        name: displayName,
        country,
        platform,
        elo: 1200,
        bestElo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        streak: 0,
        updatedAt: Date.now(),
      };
    }

    const data = snap.data() as Record<string, unknown>;
    if (
      data.displayName !== displayName ||
      data.country !== country ||
      data.platform !== platform
    ) {
      await updateDoc(ref, {
        displayName,
        country,
        platform,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      playerId: user.uid,
      name: displayName,
      country,
      platform,
      elo: Number(data.elo ?? 1200),
      bestElo: Number(data.bestElo ?? 1200),
      wins: Number(data.wins ?? 0),
      losses: Number(data.losses ?? 0),
      draws: Number(data.draws ?? 0),
      gamesPlayed: Number(data.gamesPlayed ?? 0),
      streak: Number(data.streak ?? 0),
      updatedAt: toMs(data.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeCloudLeaderboard(
  onData: (profiles: OnlinePlayerProfile[]) => void
): Unsubscribe {
  const path = 'rankings';
  const q = query(
    collection(db, path),
    where('elo', '>=', 400),
    orderBy('elo', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: OnlinePlayerProfile[] = snapshot.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          playerId: String(raw.uid ?? d.id),
          name: String(raw.displayName ?? 'Player'),
          country: String(raw.country ?? 'INTL'),
          platform: sanitizePlatform(String(raw.platform ?? 'web')),
          elo: Number(raw.elo ?? 1200),
          bestElo: Number(raw.bestElo ?? 1200),
          wins: Number(raw.wins ?? 0),
          losses: Number(raw.losses ?? 0),
          draws: Number(raw.draws ?? 0),
          gamesPlayed: Number(raw.gamesPlayed ?? 0),
          streak: Number(raw.streak ?? 0),
          updatedAt: toMs(raw.updatedAt),
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeCloudQueue(
  onData: (tickets: CloudQueueTicket[]) => void
): Unsubscribe {
  const path = 'matchmakingQueue';
  const q = query(
    collection(db, path),
    where('status', 'in', ['searching', 'matched']),
    limit(80)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const tickets: CloudQueueTicket[] = snapshot.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          uid: String(raw.uid ?? d.id),
          displayName: String(raw.displayName ?? 'Player'),
          country: String(raw.country ?? 'INTL'),
          platform: sanitizePlatform(String(raw.platform ?? 'web')),
          elo: Number(raw.elo ?? 1200),
          timeControlId: (raw.timeControlId as OnlineTimeControlId) ?? '5+0',
          targetPlatform: (raw.targetPlatform as PlatformFilter) ?? 'all',
          targetCountry: String(raw.targetCountry ?? 'ALL'),
          status: raw.status === 'matched' ? 'matched' : 'searching',
          matchedMatchId: String(raw.matchedMatchId ?? ''),
          matchedByUid: String(raw.matchedByUid ?? ''),
          updatedAtMs: toMs(raw.updatedAt),
        };
      });
      onData(tickets);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeCloudPublicMatches(
  onData: (rooms: OnlineRoomSummary[]) => void
): Unsubscribe {
  const path = 'matches';
  const q = query(
    collection(db, path),
    where('isPrivate', '==', false),
    limit(50)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapMatchDocToSummary(d.data() as FirestoreMatchDoc))
        .filter((r) => r.status !== 'finished')
        .sort((a, b) => b.createdAt - a.createdAt);
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeCloudMatch(
  matchId: string,
  onData: (match: FirestoreMatchDoc | null) => void
): Unsubscribe {
  const path = `matches/${matchId}`;
  return onSnapshot(
    doc(db, 'matches', matchId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as FirestoreMatchDoc);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeCloudMatchChat(
  matchId: string,
  onData: (messages: OnlineRoomChatMessage[]) => void
): Unsubscribe {
  const path = `matches/${matchId}/chat`;
  const q = query(collection(db, 'matches', matchId, 'chat'), orderBy('createdAt', 'asc'), limit(60));
  return onSnapshot(
    q,
    (snap) => {
      const msgs: OnlineRoomChatMessage[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          playerId: String(raw.uid ?? ''),
          name: String(raw.name ?? 'Player'),
          country: String(raw.country ?? 'INTL'),
          text: String(raw.text ?? ''),
          timestamp: toMs(raw.createdAt),
        };
      });
      onData(msgs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function claimQueueCandidateAtomically(
  selfProfile: OnlinePlayerProfile,
  candidate: CloudQueueTicket
): Promise<string> {
  const matchId = generateId('match');
  const tc = ONLINE_TIME_CONTROLS[candidate.timeControlId] ?? ONLINE_TIME_CONTROLS['5+0'];
  const initialFen = new Chess().fen();
  const selfIsWhite = Math.random() < 0.5;

  const white = selfIsWhite
    ? {
        uid: selfProfile.playerId,
        name: sanitizeDisplayName(selfProfile.name),
        country: sanitizeCountry(selfProfile.country),
        platform: sanitizePlatform(selfProfile.platform),
        elo: selfProfile.elo,
      }
    : {
        uid: candidate.uid,
        name: sanitizeDisplayName(candidate.displayName),
        country: sanitizeCountry(candidate.country),
        platform: sanitizePlatform(candidate.platform),
        elo: candidate.elo,
      };

  const black = selfIsWhite
    ? {
        uid: candidate.uid,
        name: sanitizeDisplayName(candidate.displayName),
        country: sanitizeCountry(candidate.country),
        platform: sanitizePlatform(candidate.platform),
        elo: candidate.elo,
      }
    : {
        uid: selfProfile.playerId,
        name: sanitizeDisplayName(selfProfile.name),
        country: sanitizeCountry(selfProfile.country),
        platform: sanitizePlatform(selfProfile.platform),
        elo: selfProfile.elo,
      };

  const batch = writeBatch(db);
  batch.set(doc(db, 'matches', matchId), {
    matchId,
    code: generateRoomCode(),
    title: sanitizeRoomTitle(`${white.name} vs ${black.name}`, 'Cloud Match'),
    timeControlId: candidate.timeControlId,
    isPrivate: false,
    status: 'playing',
    createdByUid: selfProfile.playerId,
    whiteUid: white.uid,
    whiteName: white.name,
    whiteCountry: white.country,
    whitePlatform: white.platform,
    whiteElo: white.elo,
    blackUid: black.uid,
    blackName: black.name,
    blackCountry: black.country,
    blackPlatform: black.platform,
    blackElo: black.elo,
    fen: initialFen,
    turn: 'w',
    whiteTimeMs: tc.initialMs,
    blackTimeMs: tc.initialMs,
    lastMoveFrom: '',
    lastMoveTo: '',
    lastMoveSan: '',
    moveCount: 0,
    movesSan: [],
    winner: '',
    endReason: '',
    drawOfferBy: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'matchmakingQueue', candidate.uid), {
    status: 'matched',
    matchedMatchId: matchId,
    matchedByUid: selfProfile.playerId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    await deleteDoc(doc(db, 'matchmakingQueue', selfProfile.playerId)).catch(() => undefined);
    return matchId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `matches/${matchId}`);
  }
}

export async function startCloudQueueSearch(
  selfProfile: OnlinePlayerProfile,
  timeControlId: OnlineTimeControlId,
  targetPlatform: PlatformFilter,
  targetCountryRaw: string
): Promise<{ matchedMatchId: string | null }> {
  const targetCountry = sanitizeTargetCountry(targetCountryRaw);
  const myCountry = sanitizeCountry(selfProfile.country);
  const myPlatform = sanitizePlatform(selfProfile.platform);
  const myName = sanitizeDisplayName(selfProfile.name);

  // 1. Check active queue entries for compatible cross-platform players
  try {
    const queueSnap = await getDocs(
      query(collection(db, 'matchmakingQueue'), where('status', '==', 'searching'), limit(50))
    );
    const now = Date.now();
    for (const d of queueSnap.docs) {
      const raw = d.data() as Record<string, unknown>;
      const cand: CloudQueueTicket = {
        uid: String(raw.uid ?? d.id),
        displayName: String(raw.displayName ?? 'Player'),
        country: sanitizeCountry(String(raw.country ?? 'INTL')),
        platform: sanitizePlatform(String(raw.platform ?? 'web')),
        elo: Number(raw.elo ?? 1200),
        timeControlId: (raw.timeControlId as OnlineTimeControlId) ?? '5+0',
        targetPlatform: (raw.targetPlatform as PlatformFilter) ?? 'all',
        targetCountry: sanitizeTargetCountry(String(raw.targetCountry ?? 'ALL')),
        status: 'searching',
        matchedMatchId: '',
        matchedByUid: '',
        updatedAtMs: toMs(raw.updatedAt),
      };

      if (cand.uid === selfProfile.playerId) continue;
      if (now - cand.updatedAtMs > 10 * 60_000) continue; // skip stale abandoned entries
      if (cand.timeControlId !== timeControlId) continue;

      const selfAllowsCandPlat = targetPlatform === 'all' || targetPlatform === cand.platform;
      const candAllowsSelfPlat = cand.targetPlatform === 'all' || cand.targetPlatform === myPlatform;
      if (!selfAllowsCandPlat || !candAllowsSelfPlat) continue;

      const selfAllowsCandCountry = targetCountry === 'ALL' || targetCountry === cand.country;
      const candAllowsSelfCountry = cand.targetCountry === 'ALL' || cand.targetCountry === myCountry;
      if (!selfAllowsCandCountry || !candAllowsSelfCountry) continue;

      const matchId = await claimQueueCandidateAtomically(selfProfile, cand);
      return { matchedMatchId: matchId };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'matchmakingQueue');
  }

  // 2. Check open public waiting matches
  try {
    const openSnap = await getDocs(
      query(collection(db, 'matches'), where('isPrivate', '==', false), limit(40))
    );
    for (const d of openSnap.docs) {
      const m = d.data() as FirestoreMatchDoc;
      if (m.status !== 'waiting' || m.timeControlId !== timeControlId) continue;
      if (m.whiteUid === selfProfile.playerId || m.blackUid === selfProfile.playerId) continue;
      const hostPlatform = m.whiteUid ? m.whitePlatform : m.blackPlatform;
      const hostCountry = m.whiteUid ? m.whiteCountry : m.blackCountry;
      if (targetPlatform !== 'all' && hostPlatform !== targetPlatform) continue;
      if (targetCountry !== 'ALL' && hostCountry !== targetCountry) continue;

      const joinedId = await joinCloudMatchDocument(m, selfProfile);
      return { matchedMatchId: joinedId };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'matches');
  }

  // 3. Register or reset self ticket in global waiting queue
  const ticketRef = doc(db, 'matchmakingQueue', selfProfile.playerId);
  try {
    const existingSnap = await getDoc(ticketRef);
    if (existingSnap.exists()) {
      await updateDoc(ticketRef, {
        displayName: myName,
        country: myCountry,
        platform: myPlatform,
        elo: selfProfile.elo,
        timeControlId,
        targetPlatform,
        targetCountry,
        status: 'searching',
        matchedMatchId: '',
        matchedByUid: '',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ticketRef, {
        uid: selfProfile.playerId,
        displayName: myName,
        country: myCountry,
        platform: myPlatform,
        elo: selfProfile.elo,
        timeControlId,
        targetPlatform,
        targetCountry,
        status: 'searching',
        matchedMatchId: '',
        matchedByUid: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return { matchedMatchId: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `matchmakingQueue/${selfProfile.playerId}`);
  }
}

export async function cancelCloudQueueSearch(uid: string): Promise<void> {
  const path = `matchmakingQueue/${uid}`;
  try {
    await deleteDoc(doc(db, 'matchmakingQueue', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createCloudRoom(
  selfProfile: OnlinePlayerProfile,
  titleRaw: string,
  timeControlId: OnlineTimeControlId,
  preferredSide: 'random' | 'w' | 'b',
  isPrivate: boolean
): Promise<string> {
  const matchId = generateId('match');
  const tc = ONLINE_TIME_CONTROLS[timeControlId] ?? ONLINE_TIME_CONTROLS['5+0'];
  const side: 'w' | 'b' =
    preferredSide === 'w' || preferredSide === 'b'
      ? preferredSide
      : Math.random() < 0.5
      ? 'w'
      : 'b';
  const myName = sanitizeDisplayName(selfProfile.name);
  const myCountry = sanitizeCountry(selfProfile.country);
  const myPlatform = sanitizePlatform(selfProfile.platform);

  try {
    await setDoc(doc(db, 'matches', matchId), {
      matchId,
      code: generateRoomCode(),
      title: sanitizeRoomTitle(titleRaw, myName),
      timeControlId,
      isPrivate,
      status: 'waiting',
      createdByUid: selfProfile.playerId,
      whiteUid: side === 'w' ? selfProfile.playerId : '',
      whiteName: side === 'w' ? myName : '',
      whiteCountry: side === 'w' ? myCountry : '',
      whitePlatform: side === 'w' ? myPlatform : 'web',
      whiteElo: side === 'w' ? selfProfile.elo : 0,
      blackUid: side === 'b' ? selfProfile.playerId : '',
      blackName: side === 'b' ? myName : '',
      blackCountry: side === 'b' ? myCountry : '',
      blackPlatform: side === 'b' ? myPlatform : 'web',
      blackElo: side === 'b' ? selfProfile.elo : 0,
      fen: new Chess().fen(),
      turn: 'w',
      whiteTimeMs: tc.initialMs,
      blackTimeMs: tc.initialMs,
      lastMoveFrom: '',
      lastMoveTo: '',
      lastMoveSan: '',
      moveCount: 0,
      movesSan: [],
      winner: '',
      endReason: '',
      drawOfferBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await deleteDoc(doc(db, 'matchmakingQueue', selfProfile.playerId)).catch(() => undefined);
    return matchId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `matches/${matchId}`);
  }
}

async function joinCloudMatchDocument(
  m: FirestoreMatchDoc,
  selfProfile: OnlinePlayerProfile
): Promise<string> {
  const path = `matches/${m.matchId}`;
  const myName = sanitizeDisplayName(selfProfile.name);
  const myCountry = sanitizeCountry(selfProfile.country);
  const myPlatform = sanitizePlatform(selfProfile.platform);

  try {
    if (m.whiteUid === selfProfile.playerId || m.blackUid === selfProfile.playerId) {
      return m.matchId;
    }
    if (m.status === 'waiting' && m.whiteUid === '') {
      await updateDoc(doc(db, 'matches', m.matchId), {
        whiteUid: selfProfile.playerId,
        whiteName: myName,
        whiteCountry: myCountry,
        whitePlatform: myPlatform,
        whiteElo: selfProfile.elo,
        status: 'playing',
        updatedAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, 'matchmakingQueue', selfProfile.playerId)).catch(() => undefined);
      return m.matchId;
    }
    if (m.status === 'waiting' && m.blackUid === '') {
      await updateDoc(doc(db, 'matches', m.matchId), {
        blackUid: selfProfile.playerId,
        blackName: myName,
        blackCountry: myCountry,
        blackPlatform: myPlatform,
        blackElo: selfProfile.elo,
        status: 'playing',
        updatedAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, 'matchmakingQueue', selfProfile.playerId)).catch(() => undefined);
      return m.matchId;
    }
    return m.matchId;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function joinCloudRoomByIdOrCode(
  roomIdOrCode: string,
  selfProfile: OnlinePlayerProfile,
  asSpectator = false
): Promise<string | null> {
  const cleaned = roomIdOrCode.trim();
  if (!cleaned) return null;

  try {
    if (cleaned.startsWith('match_')) {
      const snap = await getDoc(doc(db, 'matches', cleaned));
      if (!snap.exists()) return null;
      const m = snap.data() as FirestoreMatchDoc;
      return asSpectator ? m.matchId : await joinCloudMatchDocument(m, selfProfile);
    }

    const codeSnap = await getDocs(
      query(collection(db, 'matches'), where('code', '==', cleaned.toUpperCase()), limit(5))
    );
    if (codeSnap.empty) return null;
    const m = codeSnap.docs[0].data() as FirestoreMatchDoc;
    return asSpectator ? m.matchId : await joinCloudMatchDocument(m, selfProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `matches/${cleaned}`);
  }
}

export async function submitCloudMove(
  match: FirestoreMatchDoc,
  from: string,
  to: string,
  promotion?: string,
  elapsedMs = 0
): Promise<boolean> {
  const chess = new Chess(match.fen);
  let moveResult;
  try {
    moveResult = chess.move({ from, to, promotion: promotion || 'q' });
  } catch {
    return false;
  }
  if (!moveResult) return false;

  const tc = ONLINE_TIME_CONTROLS[match.timeControlId] ?? ONLINE_TIME_CONTROLS['5+0'];
  const nextWhiteTimeMs =
    match.turn === 'w'
      ? Math.max(0, match.whiteTimeMs - elapsedMs) + tc.incrementMs
      : match.whiteTimeMs;
  const nextBlackTimeMs =
    match.turn === 'b'
      ? Math.max(0, match.blackTimeMs - elapsedMs) + tc.incrementMs
      : match.blackTimeMs;

  let nextStatus: 'playing' | 'finished' = 'playing';
  let nextWinner: '' | 'w' | 'b' | 'draw' = '';
  let nextReason = '';

  if (chess.isCheckmate()) {
    nextStatus = 'finished';
    nextWinner = match.turn;
    nextReason = 'checkmate';
  } else if (chess.isStalemate()) {
    nextStatus = 'finished';
    nextWinner = 'draw';
    nextReason = 'stalemate';
  } else if (chess.isThreefoldRepetition()) {
    nextStatus = 'finished';
    nextWinner = 'draw';
    nextReason = 'threefold';
  } else if (chess.isInsufficientMaterial()) {
    nextStatus = 'finished';
    nextWinner = 'draw';
    nextReason = 'insufficient';
  } else if (chess.isDraw()) {
    nextStatus = 'finished';
    nextWinner = 'draw';
    nextReason = 'fivefold_or_fifty';
  }

  const nextMovesSan = [...(match.movesSan ?? []), moveResult.san].slice(-300);

  try {
    await updateDoc(doc(db, 'matches', match.matchId), {
      fen: chess.fen(),
      turn: chess.turn(),
      whiteTimeMs: Math.round(nextWhiteTimeMs),
      blackTimeMs: Math.round(nextBlackTimeMs),
      lastMoveFrom: moveResult.from,
      lastMoveTo: moveResult.to,
      lastMoveSan: moveResult.san,
      moveCount: match.moveCount + 1,
      movesSan: nextMovesSan,
      drawOfferBy: '',
      status: nextStatus,
      winner: nextWinner,
      endReason: nextReason,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.matchId}`);
  }
}

export async function offerOrRespondCloudDraw(
  matchId: string,
  action: { type: 'offer'; side: 'w' | 'b' } | { type: 'respond'; accept: boolean }
): Promise<void> {
  const path = `matches/${matchId}`;
  try {
    if (action.type === 'offer') {
      await updateDoc(doc(db, 'matches', matchId), {
        drawOfferBy: action.side,
        updatedAt: serverTimestamp(),
      });
    } else if (action.accept) {
      await updateDoc(doc(db, 'matches', matchId), {
        status: 'finished',
        winner: 'draw',
        endReason: 'draw_agreement',
        drawOfferBy: '',
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'matches', matchId), {
        drawOfferBy: '',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function resignCloudMatch(
  matchId: string,
  resigningSide: 'w' | 'b'
): Promise<void> {
  const path = `matches/${matchId}`;
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'finished',
      winner: resigningSide === 'w' ? 'b' : 'w',
      endReason: 'resignation',
      drawOfferBy: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function sendCloudMatchChat(
  matchId: string,
  selfProfile: OnlinePlayerProfile,
  textRaw: string
): Promise<void> {
  const text = textRaw.replace(/[\r\n\t]/g, ' ').trim().slice(0, 180);
  if (!text) return;
  const msgId = generateId('msg');
  const path = `matches/${matchId}/chat/${msgId}`;
  try {
    await setDoc(doc(db, 'matches', matchId, 'chat', msgId), {
      uid: selfProfile.playerId,
      name: sanitizeDisplayName(selfProfile.name),
      country: sanitizeCountry(selfProfile.country),
      text,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function commitCloudMatchRating(
  match: FirestoreMatchDoc,
  selfUid: string
): Promise<void> {
  if (match.status !== 'finished' || !match.winner) return;
  if (match.whiteUid !== selfUid && match.blackUid !== selfUid) return;

  const isWhite = match.whiteUid === selfUid;
  const oppElo = isWhite ? match.blackElo : match.whiteElo;
  const path = `rankings/${selfUid}`;

  try {
    const snap = await getDoc(doc(db, 'rankings', selfUid));
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    if (data.lastMatchId === match.matchId) return;

    const currentElo = Number(data.elo ?? 1200);
    const expected = 1 / (1 + 10 ** ((oppElo - currentElo) / 400));
    const score =
      match.winner === 'draw'
        ? 0.5
        : (match.winner === 'w' && isWhite) || (match.winner === 'b' && !isWhite)
        ? 1
        : 0;
    const delta = Math.round(32 * (score - expected));
    const nextElo = Math.max(400, currentElo + delta);
    const nextBestElo = Math.max(Number(data.bestElo ?? 1200), nextElo);

    const prevWins = Number(data.wins ?? 0);
    const prevLosses = Number(data.losses ?? 0);
    const prevDraws = Number(data.draws ?? 0);
    const prevGames = Number(data.gamesPlayed ?? 0);
    const prevStreak = Number(data.streak ?? 0);

    await updateDoc(doc(db, 'rankings', selfUid), {
      elo: nextElo,
      bestElo: nextBestElo,
      wins: score === 1 ? prevWins + 1 : prevWins,
      losses: score === 0 ? prevLosses + 1 : prevLosses,
      draws: score === 0.5 ? prevDraws + 1 : prevDraws,
      gamesPlayed: prevGames + 1,
      streak: score === 1 ? (prevStreak >= 0 ? prevStreak + 1 : 1) : score === 0 ? (prevStreak <= 0 ? prevStreak - 1 : -1) : 0,
      lastMatchId: match.matchId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteWaitingCloudMatch(matchId: string): Promise<void> {
  const path = `matches/${matchId}`;
  try {
    await deleteDoc(doc(db, 'matches', matchId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
