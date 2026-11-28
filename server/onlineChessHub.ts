/**
 * @author Hemza Harigui
 * @fingerprint HH-CVSU-2026
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type http from 'node:http';
import { Chess } from 'chess.js';
import { WebSocket, WebSocketServer } from 'ws';
import { COUNTRY_OPTIONS } from '../src/data/countries.ts';
import {
  ONLINE_TIME_CONTROLS,
  type ClientPlatform,
  type OnlineGameEndReason,
  type OnlineLeaderboardSnapshot,
  type OnlineMatchmakingStatus,
  type OnlineMoveRecord,
  type OnlinePlayerProfile,
  type OnlineRoomChatMessage,
  type OnlineRoomSeat,
  type OnlineRoomState,
  type OnlineRoomSummary,
  type OnlineTimeControlId,
  type OnlineWsClientMessage,
  type OnlineWsServerMessage,
  type PlatformFilter,
} from '../src/types/onlineChess.ts';

const RANKINGS_STORE_FILE = path.resolve(process.cwd(), '.online-chess-rankings.json');
const VALID_COUNTRY_CODES = new Set(COUNTRY_OPTIONS.map((c) => c.code));
const VALID_PLATFORMS = new Set<ClientPlatform>(['web', 'android', 'ios', 'desktop', 'pwa']);
const PLAYER_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

interface MatchQueueEntry {
  playerId: string;
  elo: number;
  country: string;
  platform: ClientPlatform;
  timeControlId: OnlineTimeControlId;
  targetPlatform: PlatformFilter;
  targetCountry: string;
  joinedAt: number;
}

interface PersistedRankingsStore {
  version: number;
  totalCompletedGames: number;
  profiles: Record<string, OnlinePlayerProfile>;
}

interface InternalRoom {
  roomId: string;
  code: string;
  title: string;
  timeControlId: OnlineTimeControlId;
  isPrivate: boolean;
  status: 'waiting' | 'playing' | 'finished';
  chess: Chess;
  white: OnlineRoomSeat | null;
  black: OnlineRoomSeat | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastClockSyncAt: number;
  lastMove: { from: string; to: string; san: string; uci: string } | null;
  moves: OnlineMoveRecord[];
  winner: 'w' | 'b' | 'draw' | null;
  endReason: OnlineGameEndReason | null;
  drawOfferBy: 'w' | 'b' | null;
  rematchVotes: { w: boolean; b: boolean };
  spectators: Set<string>;
  chat: OnlineRoomChatMessage[];
  processedMoveIds: Set<string>;
  eloDelta: { w: number; b: number } | null;
  createdAt: number;
  finishedAt: number | null;
}

interface ClientSession {
  ws: WebSocket;
  authenticated: boolean;
  playerId: string | null;
  activeRoomId: string | null;
  isAlive: boolean;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Player';
  const cleaned = raw.replace(/[\r\n\t<>]/g, ' ').trim().slice(0, 24);
  return cleaned.length >= 2 ? cleaned : 'Player';
}

function sanitizeRoomTitle(raw: unknown, fallbackName: string): string {
  if (typeof raw !== 'string') return fallbackName;
  const cleaned = raw.replace(/[\r\n\t<>]/g, ' ').trim().slice(0, 36);
  return cleaned.length >= 2 ? cleaned : fallbackName;
}

function sanitizeCountryCode(raw: unknown): string {
  if (typeof raw !== 'string') return 'INTL';
  const upper = raw.trim().toUpperCase();
  return VALID_COUNTRY_CODES.has(upper) ? upper : 'INTL';
}

function sanitizePlatform(raw: unknown): ClientPlatform {
  if (typeof raw !== 'string') return 'web';
  const lower = raw.trim().toLowerCase() as ClientPlatform;
  return VALID_PLATFORMS.has(lower) ? lower : 'web';
}

function sanitizePlatformFilter(raw: unknown): PlatformFilter {
  if (typeof raw !== 'string') return 'all';
  const lower = raw.trim().toLowerCase();
  if (lower === 'all') return 'all';
  return VALID_PLATFORMS.has(lower as ClientPlatform) ? (lower as ClientPlatform) : 'all';
}

function sanitizeTargetCountry(raw: unknown): string {
  if (typeof raw !== 'string') return 'ALL';
  const upper = raw.trim().toUpperCase();
  if (upper === 'ALL' || upper === '') return 'ALL';
  return VALID_COUNTRY_CODES.has(upper) ? upper : 'ALL';
}

function sanitizeChatText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\r\n\t]/g, ' ').trim().slice(0, 180);
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

function computeEloUpdates(
  whiteElo: number,
  blackElo: number,
  winner: 'w' | 'b' | 'draw'
): { nextWhite: number; nextBlack: number; deltaWhite: number; deltaBlack: number } {
  const k = 32;
  const expectedWhite = 1 / (1 + 10 ** ((blackElo - whiteElo) / 400));
  const expectedBlack = 1 - expectedWhite;
  const scoreWhite = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
  const scoreBlack = 1 - scoreWhite;

  const deltaWhite = Math.round(k * (scoreWhite - expectedWhite));
  const deltaBlack = Math.round(k * (scoreBlack - expectedBlack));

  return {
    nextWhite: Math.max(400, whiteElo + deltaWhite),
    nextBlack: Math.max(400, blackElo + deltaBlack),
    deltaWhite,
    deltaBlack,
  };
}

export class OnlineChessHub {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<WebSocket, ClientSession>();
  private playerSockets = new Map<string, Set<WebSocket>>();
  private rooms = new Map<string, InternalRoom>();
  private matchmakingQueue = new Map<string, MatchQueueEntry>();
  private disconnectTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  private store: PersistedRankingsStore;
  private sweepInterval: ReturnType<typeof globalThis.setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof globalThis.setInterval> | null = null;
  private getExpectedServerId: () => string;

  constructor(getExpectedServerId: () => string) {
    this.getExpectedServerId = getExpectedServerId;
    this.store = this.loadStore();
  }

  private loadStore(): PersistedRankingsStore {
    try {
      if (fs.existsSync(RANKINGS_STORE_FILE)) {
        const raw = fs.readFileSync(RANKINGS_STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedRankingsStore>;
        if (parsed && typeof parsed === 'object' && parsed.profiles && typeof parsed.profiles === 'object') {
          for (const p of Object.values(parsed.profiles)) {
            if (p && typeof p === 'object') {
              p.platform = sanitizePlatform((p as Partial<OnlinePlayerProfile>).platform);
            }
          }
          return {
            version: 1,
            totalCompletedGames:
              typeof parsed.totalCompletedGames === 'number' ? parsed.totalCompletedGames : 0,
            profiles: parsed.profiles,
          };
        }
      }
    } catch {
      // Fallback to clean empty rankings store if corrupted
    }
    return { version: 1, totalCompletedGames: 0, profiles: {} };
  }

  private saveStore(): void {
    try {
      const tmpPath = `${RANKINGS_STORE_FILE}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.store, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmpPath, RANKINGS_STORE_FILE);
    } catch {
      // Ignore transient disk write failures
    }
  }

  private upsertProfile(
    playerId: string,
    name: string,
    country: string,
    platform?: ClientPlatform
  ): OnlinePlayerProfile {
    const existing = this.store.profiles[playerId];
    const now = Date.now();
    if (existing) {
      existing.name = name;
      existing.country = country;
      if (platform) existing.platform = sanitizePlatform(platform);
      else if (!existing.platform) existing.platform = 'web';
      existing.updatedAt = now;
      this.saveStore();
      return existing;
    }

    const created: OnlinePlayerProfile = {
      playerId,
      name,
      country,
      platform: platform ? sanitizePlatform(platform) : 'web',
      elo: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      gamesPlayed: 0,
      streak: 0,
      bestElo: 1200,
      updatedAt: now,
    };
    this.store.profiles[playerId] = created;
    this.saveStore();
    return created;
  }

  public registerProfileHttp(
    playerIdRaw: string,
    nameRaw: string,
    countryRaw: string,
    platformRaw?: string
  ): OnlinePlayerProfile {
    const playerId = PLAYER_ID_REGEX.test(playerIdRaw)
      ? playerIdRaw
      : `plr_${crypto.randomBytes(8).toString('hex')}`;
    const name = sanitizeDisplayName(nameRaw);
    const country = sanitizeCountryCode(countryRaw);
    const platform = sanitizePlatform(platformRaw);
    const profile = this.upsertProfile(playerId, name, country, platform);
    this.broadcastLeaderboard();
    return profile;
  }

  public getOnlineByPlatform(): Record<ClientPlatform, number> {
    const counts: Record<ClientPlatform, number> = {
      web: 0,
      android: 0,
      ios: 0,
      desktop: 0,
      pwa: 0,
    };
    for (const pid of this.playerSockets.keys()) {
      const p = this.store.profiles[pid];
      const plat = p?.platform && VALID_PLATFORMS.has(p.platform) ? p.platform : 'web';
      counts[plat] += 1;
    }
    return counts;
  }

  public getMatchmakingStatusForPlayer(playerId: string): OnlineMatchmakingStatus {
    const entry = playerId ? this.matchmakingQueue.get(playerId) : undefined;
    return {
      searching: Boolean(entry),
      timeControlId: entry?.timeControlId ?? null,
      targetPlatform: entry?.targetPlatform ?? 'all',
      startedAt: entry?.joinedAt ?? null,
      queueCount: this.matchmakingQueue.size,
      onlineByPlatform: this.getOnlineByPlatform(),
    };
  }

  private broadcastMatchmakingStatus(): void {
    const onlineByPlatform = this.getOnlineByPlatform();
    const queueCount = this.matchmakingQueue.size;
    for (const [ws, session] of this.sessions.entries()) {
      if (!session.authenticated || !session.playerId) continue;
      const entry = this.matchmakingQueue.get(session.playerId);
      this.send(ws, {
        type: 'matchmaking:status',
        status: {
          searching: Boolean(entry),
          timeControlId: entry?.timeControlId ?? null,
          targetPlatform: entry?.targetPlatform ?? 'all',
          startedAt: entry?.joinedAt ?? null,
          queueCount,
          onlineByPlatform,
        },
      });
    }
  }

  public getPublicLobbyRooms(): OnlineRoomSummary[] {
    const list: OnlineRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.isPrivate) continue;
      list.push(this.toRoomSummary(room));
    }
    list.sort((a, b) => {
      const order = { waiting: 0, playing: 1, finished: 2 };
      const diff = order[a.status] - order[b.status];
      return diff !== 0 ? diff : b.createdAt - a.createdAt;
    });
    return list;
  }

  public getLeaderboardSnapshot(): OnlineLeaderboardSnapshot {
    const allProfiles = Object.values(this.store.profiles);
    allProfiles.sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.updatedAt - a.updatedAt;
    });

    const onlineIds = new Set<string>();
    const countries = new Set<string>();
    for (const pid of this.playerSockets.keys()) {
      onlineIds.add(pid);
    }
    for (const profile of allProfiles) {
      if (profile.country) countries.add(profile.country);
    }

    return {
      rankings: allProfiles.slice(0, 50),
      onlinePlayersCount: onlineIds.size,
      activeCountriesCount: countries.size,
      totalCompletedGames: this.store.totalCompletedGames,
      serverTime: Date.now(),
    };
  }

  public attachToServer(
    httpServer: http.Server,
    isTrustedUpgrade: (req: http.IncomingMessage) => boolean
  ): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });

    httpServer.on('upgrade', (req, socket, head) => {
      let pathname = '/';
      try {
        const parsed = new URL(req.url ?? '/', 'http://localhost');
        pathname = parsed.pathname;
      } catch {
        socket.destroy();
        return;
      }

      if (pathname !== '/ws/online-chess') {
        return;
      }

      if (!isTrustedUpgrade(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss?.handleUpgrade(req, socket, head, (ws) => {
        this.wss?.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws) => {
      const session: ClientSession = {
        ws,
        authenticated: false,
        playerId: null,
        activeRoomId: null,
        isAlive: true,
      };
      this.sessions.set(ws, session);

      ws.on('pong', () => {
        session.isAlive = true;
      });

      ws.on('message', (rawData) => {
        const rawStr = typeof rawData === 'string' ? rawData : rawData.toString('utf8');
        let msg: OnlineWsClientMessage;
        try {
          msg = JSON.parse(rawStr) as OnlineWsClientMessage;
        } catch {
          this.send(ws, { type: 'error', code: 'invalid_json', message: 'Invalid JSON frame.' });
          return;
        }
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
          return;
        }
        this.handleClientMessage(ws, session, msg);
      });

      ws.on('close', () => {
        this.handleDisconnect(ws, session);
      });

      ws.on('error', () => {
        this.handleDisconnect(ws, session);
      });
    });

    // Server-authoritative 1s sweep for clock timeouts & stale finished room cleanup
    this.sweepInterval = globalThis.setInterval(() => {
      this.sweepRooms();
    }, 1000);

    // WebSocket keepalive heartbeat
    this.heartbeatInterval = globalThis.setInterval(() => {
      for (const [ws, session] of this.sessions.entries()) {
        if (!session.isAlive) {
          ws.terminate();
          this.handleDisconnect(ws, session);
          continue;
        }
        session.isAlive = false;
        try {
          ws.ping();
        } catch {
          // ignore
        }
      }
    }, 25_000);
  }

  public shutdown(): void {
    if (this.sweepInterval) {
      globalThis.clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    if (this.heartbeatInterval) {
      globalThis.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const t of this.disconnectTimers.values()) {
      globalThis.clearTimeout(t);
    }
    this.disconnectTimers.clear();
    this.wss?.close();
    this.wss = null;
  }

  private send(ws: WebSocket, payload: OnlineWsServerMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignore send errors on closing sockets
    }
  }

  private sendToPlayer(playerId: string, payload: OnlineWsServerMessage): void {
    const sockets = this.playerSockets.get(playerId);
    if (!sockets) return;
    for (const ws of sockets) {
      this.send(ws, payload);
    }
  }

  private broadcastToRoom(room: InternalRoom, payload: OnlineWsServerMessage): void {
    const targets = new Set<string>();
    if (room.white) targets.add(room.white.playerId);
    if (room.black) targets.add(room.black.playerId);
    for (const specId of room.spectators) targets.add(specId);
    for (const pid of targets) {
      this.sendToPlayer(pid, payload);
    }
  }

  private broadcastLobby(): void {
    const payload: OnlineWsServerMessage = {
      type: 'lobby:update',
      rooms: this.getPublicLobbyRooms(),
    };
    for (const [ws, session] of this.sessions.entries()) {
      if (session.authenticated) {
        this.send(ws, payload);
      }
    }
  }

  private broadcastLeaderboard(): void {
    const payload: OnlineWsServerMessage = {
      type: 'leaderboard:update',
      leaderboard: this.getLeaderboardSnapshot(),
    };
    for (const [ws, session] of this.sessions.entries()) {
      if (session.authenticated) {
        this.send(ws, payload);
      }
    }
  }

  private toRoomSummary(room: InternalRoom): OnlineRoomSummary {
    return {
      roomId: room.roomId,
      code: room.code,
      title: room.title,
      timeControlId: room.timeControlId,
      isPrivate: room.isPrivate,
      status: room.status,
      white: room.white ? { ...room.white } : null,
      black: room.black ? { ...room.black } : null,
      spectatorCount: room.spectators.size,
      moveCount: room.moves.length,
      createdAt: room.createdAt,
    };
  }

  private toRoomState(room: InternalRoom): OnlineRoomState {
    return {
      roomId: room.roomId,
      code: room.code,
      title: room.title,
      timeControlId: room.timeControlId,
      isPrivate: room.isPrivate,
      status: room.status,
      fen: room.chess.fen(),
      turn: room.chess.turn(),
      white: room.white ? { ...room.white } : null,
      black: room.black ? { ...room.black } : null,
      whiteTimeMs: Math.max(0, Math.round(room.whiteTimeMs)),
      blackTimeMs: Math.max(0, Math.round(room.blackTimeMs)),
      lastClockSyncAt: room.lastClockSyncAt,
      lastMove: room.lastMove ? { ...room.lastMove } : null,
      moves: room.moves,
      winner: room.winner,
      endReason: room.endReason,
      drawOfferBy: room.drawOfferBy,
      rematchVotes: { ...room.rematchVotes },
      spectatorCount: room.spectators.size,
      chat: room.chat.slice(-40),
      eloDelta: room.eloDelta,
    };
  }

  private findActiveRoomForPlayer(playerId: string): InternalRoom | null {
    for (const room of this.rooms.values()) {
      if (room.white?.playerId === playerId || room.black?.playerId === playerId) {
        return room;
      }
      if (room.spectators.has(playerId)) {
        return room;
      }
    }
    return null;
  }

  private handleClientMessage(ws: WebSocket, session: ClientSession, msg: OnlineWsClientMessage): void {
    if (msg.type === 'hello') {
      const expectedId = this.getExpectedServerId();
      const providedId = typeof msg.serverId === 'string' ? msg.serverId.trim() : '';
      if (!providedId || !timingSafeEqualString(providedId, expectedId)) {
        this.send(ws, {
          type: 'error',
          code: 'unauthorized_server_id',
          message: 'Invalid server channel identifier.',
        });
        ws.close(4003, 'Forbidden server ID');
        return;
      }

      const playerId = PLAYER_ID_REGEX.test(msg.playerId)
        ? msg.playerId
        : `plr_${crypto.randomBytes(8).toString('hex')}`;
      const name = sanitizeDisplayName(msg.name);
      const country = sanitizeCountryCode(msg.country);
      const platform = sanitizePlatform(msg.platform);
      const profile = this.upsertProfile(playerId, name, country, platform);

      session.authenticated = true;
      session.playerId = playerId;

      let sockets = this.playerSockets.get(playerId);
      if (!sockets) {
        sockets = new Set();
        this.playerSockets.set(playerId, sockets);
      }
      sockets.add(ws);

      const pendingTimer = this.disconnectTimers.get(playerId);
      if (pendingTimer) {
        globalThis.clearTimeout(pendingTimer);
        this.disconnectTimers.delete(playerId);
      }

      let activeRoom: InternalRoom | null = null;
      if (typeof msg.roomId === 'string' && this.rooms.has(msg.roomId)) {
        activeRoom = this.rooms.get(msg.roomId) ?? null;
      }
      if (!activeRoom) {
        activeRoom = this.findActiveRoomForPlayer(playerId);
      }

      if (activeRoom) {
        session.activeRoomId = activeRoom.roomId;
        if (activeRoom.white?.playerId === playerId) {
          activeRoom.white.connected = true;
          activeRoom.white.name = profile.name;
          activeRoom.white.country = profile.country;
          activeRoom.white.platform = profile.platform;
          activeRoom.white.elo = profile.elo;
        }
        if (activeRoom.black?.playerId === playerId) {
          activeRoom.black.connected = true;
          activeRoom.black.name = profile.name;
          activeRoom.black.country = profile.country;
          activeRoom.black.platform = profile.platform;
          activeRoom.black.elo = profile.elo;
        }
        this.broadcastToRoom(activeRoom, {
          type: 'room:state',
          room: this.toRoomState(activeRoom),
        });
      }

      this.send(ws, {
        type: 'welcome',
        selfProfile: profile,
        rooms: this.getPublicLobbyRooms(),
        leaderboard: this.getLeaderboardSnapshot(),
        activeRoom: activeRoom ? this.toRoomState(activeRoom) : null,
        matchmaking: this.getMatchmakingStatusForPlayer(playerId),
      });

      this.broadcastLeaderboard();
      this.broadcastLobby();
      this.broadcastMatchmakingStatus();
      return;
    }

    if (!session.authenticated || !session.playerId) {
      this.send(ws, {
        type: 'error',
        code: 'not_authenticated',
        message: 'Handshake required before room actions.',
      });
      return;
    }

    const playerId = session.playerId;

    switch (msg.type) {
      case 'update_profile': {
        const name = sanitizeDisplayName(msg.name);
        const country = sanitizeCountryCode(msg.country);
        const platform = msg.platform ? sanitizePlatform(msg.platform) : undefined;
        const profile = this.upsertProfile(playerId, name, country, platform);
        this.sendToPlayer(playerId, { type: 'profile:updated', profile });

        const room = this.findActiveRoomForPlayer(playerId);
        if (room) {
          if (room.white?.playerId === playerId) {
            room.white.name = profile.name;
            room.white.country = profile.country;
            room.white.platform = profile.platform;
          }
          if (room.black?.playerId === playerId) {
            room.black.name = profile.name;
            room.black.country = profile.country;
            room.black.platform = profile.platform;
          }
          this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });
          this.broadcastLobby();
        }
        this.broadcastLeaderboard();
        this.broadcastMatchmakingStatus();
        break;
      }

      case 'find_match': {
        const currentRoom = this.findActiveRoomForPlayer(playerId);
        if (currentRoom && currentRoom.status === 'playing') {
          this.send(ws, {
            type: 'error',
            code: 'already_in_game',
            message: 'أنت في مباراة جارية حالياً.',
            roomId: currentRoom.roomId,
          });
          return;
        }
        if (currentRoom) {
          this.leaveCurrentRoom(playerId);
        }

        const profile = this.store.profiles[playerId] ?? this.upsertProfile(playerId, 'Player', 'INTL');
        const tcId: OnlineTimeControlId =
          msg.timeControlId && msg.timeControlId in ONLINE_TIME_CONTROLS
            ? msg.timeControlId
            : '5+0';
        const targetPlatform = sanitizePlatformFilter(msg.targetPlatform);
        const targetCountry = sanitizeTargetCountry(msg.targetCountry);

        const seeker: MatchQueueEntry = {
          playerId,
          elo: profile.elo,
          country: profile.country,
          platform: profile.platform,
          timeControlId: tcId,
          targetPlatform,
          targetCountry,
          joinedAt: Date.now(),
        };

        // 1 & 2. Attempt immediate match with queued seekers or open public waiting rooms
        if (this.tryPairSeeker(seeker)) {
          break;
        }

        // 3. No instant opponent yet — enqueue seeker for real cross-platform pairing
        this.matchmakingQueue.set(playerId, seeker);
        this.broadcastMatchmakingStatus();
        break;
      }

      case 'cancel_match': {
        this.matchmakingQueue.delete(playerId);
        this.broadcastMatchmakingStatus();
        break;
      }

      case 'create_room': {
        this.matchmakingQueue.delete(playerId);
        this.leaveCurrentRoom(playerId);
        const profile = this.store.profiles[playerId] ?? this.upsertProfile(playerId, 'Player', 'INTL');
        const tcId: OnlineTimeControlId =
          msg.timeControlId && msg.timeControlId in ONLINE_TIME_CONTROLS
            ? msg.timeControlId
            : '5+0';
        const tc = ONLINE_TIME_CONTROLS[tcId];
        const roomId = `room_${crypto.randomBytes(6).toString('hex')}`;
        const code = generateRoomCode();
        const title = sanitizeRoomTitle(msg.title, `${profile.name}`);
        const sideChoice =
          msg.preferredSide === 'w' || msg.preferredSide === 'b'
            ? msg.preferredSide
            : crypto.randomInt(0, 2) === 0
            ? 'w'
            : 'b';

        const seat: OnlineRoomSeat = {
          playerId: profile.playerId,
          name: profile.name,
          country: profile.country,
          platform: profile.platform,
          elo: profile.elo,
          connected: true,
        };

        const room: InternalRoom = {
          roomId,
          code,
          title,
          timeControlId: tcId,
          isPrivate: Boolean(msg.isPrivate),
          status: 'waiting',
          chess: new Chess(),
          white: sideChoice === 'w' ? seat : null,
          black: sideChoice === 'b' ? seat : null,
          whiteTimeMs: tc.initialMs,
          blackTimeMs: tc.initialMs,
          lastClockSyncAt: Date.now(),
          lastMove: null,
          moves: [],
          winner: null,
          endReason: null,
          drawOfferBy: null,
          rematchVotes: { w: false, b: false },
          spectators: new Set(),
          chat: [],
          processedMoveIds: new Set(),
          eloDelta: null,
          createdAt: Date.now(),
          finishedAt: null,
        };

        this.rooms.set(roomId, room);
        session.activeRoomId = roomId;

        if (!room.isPrivate && this.tryPairPublicRoomWithQueue(room)) {
          break;
        }

        this.sendToPlayer(playerId, { type: 'room:state', room: this.toRoomState(room) });
        this.broadcastLobby();
        this.broadcastMatchmakingStatus();
        break;
      }

      case 'join_room': {
        const lookup = typeof msg.roomIdOrCode === 'string' ? msg.roomIdOrCode.trim() : '';
        if (!lookup) return;

        let targetRoom: InternalRoom | null = this.rooms.get(lookup) ?? null;
        if (!targetRoom) {
          const upperLookup = lookup.toUpperCase();
          for (const candidate of this.rooms.values()) {
            if (candidate.code.toUpperCase() === upperLookup) {
              targetRoom = candidate;
              break;
            }
          }
        }

        if (!targetRoom) {
          this.send(ws, {
            type: 'error',
            code: 'room_not_found',
            message: 'الغرفة المطلوبة غير موجودة أو أُغلقت.',
          });
          return;
        }

        const alreadyInTarget =
          targetRoom.white?.playerId === playerId ||
          targetRoom.black?.playerId === playerId ||
          targetRoom.spectators.has(playerId);

        if (!alreadyInTarget) {
          this.leaveCurrentRoom(playerId);
        }
        this.matchmakingQueue.delete(playerId);

        const profile = this.store.profiles[playerId] ?? this.upsertProfile(playerId, 'Player', 'INTL');
        const seat: OnlineRoomSeat = {
          playerId: profile.playerId,
          name: profile.name,
          country: profile.country,
          platform: profile.platform,
          elo: profile.elo,
          connected: true,
        };

        if (targetRoom.white?.playerId === playerId) {
          targetRoom.white.connected = true;
        } else if (targetRoom.black?.playerId === playerId) {
          targetRoom.black.connected = true;
        } else if (!msg.asSpectator && targetRoom.status === 'waiting') {
          if (!targetRoom.white) {
            targetRoom.white = seat;
          } else if (!targetRoom.black) {
            targetRoom.black = seat;
          } else {
            targetRoom.spectators.add(playerId);
          }
        } else {
          targetRoom.spectators.add(playerId);
        }

        if (targetRoom.status === 'waiting' && targetRoom.white && targetRoom.black) {
          targetRoom.status = 'playing';
          targetRoom.lastClockSyncAt = Date.now();
        }

        session.activeRoomId = targetRoom.roomId;
        this.broadcastToRoom(targetRoom, {
          type: 'room:state',
          room: this.toRoomState(targetRoom),
        });
        this.broadcastLobby();
        this.broadcastMatchmakingStatus();
        break;
      }

      case 'leave_room': {
        this.leaveCurrentRoom(playerId);
        session.activeRoomId = null;
        this.broadcastLobby();
        break;
      }

      case 'make_move': {
        const room = this.rooms.get(msg.roomId);
        if (!room || room.status !== 'playing') {
          this.send(ws, {
            type: 'error',
            code: 'room_not_playing',
            message: 'المباراة ليست قيد اللعب حالياً.',
            roomId: msg.roomId,
          });
          return;
        }

        const clientMoveId = typeof msg.clientMoveId === 'string' ? msg.clientMoveId : '';
        if (clientMoveId && room.processedMoveIds.has(clientMoveId)) {
          return;
        }

        const turn = room.chess.turn();
        const activeSeat = turn === 'w' ? room.white : room.black;
        if (!activeSeat || activeSeat.playerId !== playerId) {
          this.send(ws, {
            type: 'error',
            code: 'not_your_turn',
            message: 'ليس دورك في هذه النقلة.',
            roomId: room.roomId,
          });
          this.send(ws, { type: 'room:state', room: this.toRoomState(room) });
          return;
        }

        const now = Date.now();
        const elapsed = Math.max(0, now - room.lastClockSyncAt);
        if (turn === 'w') {
          room.whiteTimeMs -= elapsed;
          if (room.whiteTimeMs <= 0) {
            room.whiteTimeMs = 0;
            this.finalizeMatch(room, 'b', 'timeout');
            return;
          }
        } else {
          room.blackTimeMs -= elapsed;
          if (room.blackTimeMs <= 0) {
            room.blackTimeMs = 0;
            this.finalizeMatch(room, 'w', 'timeout');
            return;
          }
        }

        let moveResult;
        try {
          moveResult = room.chess.move({
            from: msg.from,
            to: msg.to,
            promotion: typeof msg.promotion === 'string' ? msg.promotion : undefined,
          });
        } catch {
          moveResult = null;
        }

        if (!moveResult) {
          room.lastClockSyncAt = now;
          this.send(ws, {
            type: 'error',
            code: 'illegal_move',
            message: 'نقلة غير قانونية.',
            roomId: room.roomId,
          });
          this.send(ws, { type: 'room:state', room: this.toRoomState(room) });
          return;
        }

        if (clientMoveId) {
          room.processedMoveIds.add(clientMoveId);
        }

        const tc = ONLINE_TIME_CONTROLS[room.timeControlId];
        if (turn === 'w') {
          room.whiteTimeMs += tc.incrementMs;
        } else {
          room.blackTimeMs += tc.incrementMs;
        }
        room.lastClockSyncAt = now;
        room.drawOfferBy = null;

        const uci = `${moveResult.from}${moveResult.to}${moveResult.promotion ?? ''}`;
        room.lastMove = {
          from: moveResult.from,
          to: moveResult.to,
          san: moveResult.san,
          uci,
        };
        room.moves.push({
          ply: room.moves.length + 1,
          san: moveResult.san,
          uci,
          fen: room.chess.fen(),
          by: turn,
          timestamp: now,
        });

        if (room.chess.isCheckmate()) {
          this.finalizeMatch(room, turn, 'checkmate');
          return;
        }
        if (room.chess.isStalemate()) {
          this.finalizeMatch(room, 'draw', 'stalemate');
          return;
        }
        if (room.chess.isThreefoldRepetition()) {
          this.finalizeMatch(room, 'draw', 'threefold');
          return;
        }
        if (room.chess.isInsufficientMaterial()) {
          this.finalizeMatch(room, 'draw', 'insufficient');
          return;
        }
        if (room.chess.isDraw()) {
          this.finalizeMatch(room, 'draw', 'fivefold_or_fifty');
          return;
        }

        this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });
        this.broadcastLobby();
        break;
      }

      case 'resign': {
        const room = this.rooms.get(msg.roomId);
        if (!room || room.status !== 'playing') return;
        if (room.white?.playerId === playerId) {
          this.finalizeMatch(room, 'b', 'resignation');
        } else if (room.black?.playerId === playerId) {
          this.finalizeMatch(room, 'w', 'resignation');
        }
        break;
      }

      case 'offer_draw': {
        const room = this.rooms.get(msg.roomId);
        if (!room || room.status !== 'playing') return;
        const side =
          room.white?.playerId === playerId
            ? 'w'
            : room.black?.playerId === playerId
            ? 'b'
            : null;
        if (!side) return;
        room.drawOfferBy = side;
        this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });
        break;
      }

      case 'respond_draw': {
        const room = this.rooms.get(msg.roomId);
        if (!room || room.status !== 'playing' || !room.drawOfferBy) return;
        const responderSide =
          room.white?.playerId === playerId
            ? 'w'
            : room.black?.playerId === playerId
            ? 'b'
            : null;
        if (!responderSide || responderSide === room.drawOfferBy) return;

        if (msg.accept) {
          this.finalizeMatch(room, 'draw', 'draw_agreement');
        } else {
          room.drawOfferBy = null;
          this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });
        }
        break;
      }

      case 'rematch': {
        const room = this.rooms.get(msg.roomId);
        if (!room || room.status !== 'finished') return;
        if (room.white?.playerId === playerId) room.rematchVotes.w = true;
        if (room.black?.playerId === playerId) room.rematchVotes.b = true;

        if (room.rematchVotes.w && room.rematchVotes.b && room.white && room.black) {
          const prevWhite = room.white;
          const prevBlack = room.black;
          const tc = ONLINE_TIME_CONTROLS[room.timeControlId];
          room.white = prevBlack;
          room.black = prevWhite;
          room.chess = new Chess();
          room.status = 'playing';
          room.whiteTimeMs = tc.initialMs;
          room.blackTimeMs = tc.initialMs;
          room.lastClockSyncAt = Date.now();
          room.lastMove = null;
          room.moves = [];
          room.winner = null;
          room.endReason = null;
          room.drawOfferBy = null;
          room.rematchVotes = { w: false, b: false };
          room.processedMoveIds.clear();
          room.eloDelta = null;
          room.finishedAt = null;
          this.broadcastLobby();
        }
        this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });
        break;
      }

      case 'send_chat': {
        const room = this.rooms.get(msg.roomId);
        if (!room) return;
        const isMember =
          room.white?.playerId === playerId ||
          room.black?.playerId === playerId ||
          room.spectators.has(playerId);
        if (!isMember) return;

        const text = sanitizeChatText(msg.text);
        if (!text) return;

        const profile = this.store.profiles[playerId] ?? this.upsertProfile(playerId, 'Player', 'INTL');
        room.chat.push({
          id: `chat_${crypto.randomBytes(5).toString('hex')}`,
          playerId,
          name: profile.name,
          country: profile.country,
          text,
          timestamp: Date.now(),
        });
        if (room.chat.length > 60) {
          room.chat = room.chat.slice(-60);
        }
        this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });
        break;
      }

      case 'request_sync': {
        const profile = this.store.profiles[playerId] ?? this.upsertProfile(playerId, 'Player', 'INTL');
        const activeRoom =
          (msg.roomId && this.rooms.get(msg.roomId)) || this.findActiveRoomForPlayer(playerId);
        this.send(ws, {
          type: 'welcome',
          selfProfile: profile,
          rooms: this.getPublicLobbyRooms(),
          leaderboard: this.getLeaderboardSnapshot(),
          activeRoom: activeRoom ? this.toRoomState(activeRoom) : null,
          matchmaking: this.getMatchmakingStatusForPlayer(playerId),
        });
        break;
      }
    }
  }

  private finalizeMatch(
    room: InternalRoom,
    winner: 'w' | 'b' | 'draw',
    reason: OnlineGameEndReason
  ): void {
    if (room.status === 'finished') return;
    room.status = 'finished';
    room.winner = winner;
    room.endReason = reason;
    room.drawOfferBy = null;
    room.finishedAt = Date.now();

    if (room.white && room.black && room.white.playerId !== room.black.playerId) {
      const wProfile = this.store.profiles[room.white.playerId];
      const bProfile = this.store.profiles[room.black.playerId];
      if (wProfile && bProfile) {
        const eloUpdate = computeEloUpdates(wProfile.elo, bProfile.elo, winner);
        wProfile.elo = eloUpdate.nextWhite;
        bProfile.elo = eloUpdate.nextBlack;
        wProfile.bestElo = Math.max(wProfile.bestElo, wProfile.elo);
        bProfile.bestElo = Math.max(bProfile.bestElo, bProfile.elo);
        wProfile.gamesPlayed += 1;
        bProfile.gamesPlayed += 1;
        wProfile.updatedAt = Date.now();
        bProfile.updatedAt = Date.now();

        if (winner === 'w') {
          wProfile.wins += 1;
          bProfile.losses += 1;
          wProfile.streak = wProfile.streak >= 0 ? wProfile.streak + 1 : 1;
          bProfile.streak = bProfile.streak <= 0 ? bProfile.streak - 1 : -1;
        } else if (winner === 'b') {
          bProfile.wins += 1;
          wProfile.losses += 1;
          bProfile.streak = bProfile.streak >= 0 ? bProfile.streak + 1 : 1;
          wProfile.streak = wProfile.streak <= 0 ? wProfile.streak - 1 : -1;
        } else {
          wProfile.draws += 1;
          bProfile.draws += 1;
          wProfile.streak = 0;
          bProfile.streak = 0;
        }

        room.white.elo = wProfile.elo;
        room.black.elo = bProfile.elo;
        room.eloDelta = { w: eloUpdate.deltaWhite, b: eloUpdate.deltaBlack };
        this.store.totalCompletedGames += 1;
        this.saveStore();

        this.sendToPlayer(wProfile.playerId, { type: 'profile:updated', profile: wProfile });
        this.sendToPlayer(bProfile.playerId, { type: 'profile:updated', profile: bProfile });
      }
    }

    this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });
    this.broadcastLobby();
    this.broadcastLeaderboard();
  }

  private leaveCurrentRoom(playerId: string): void {
    const room = this.findActiveRoomForPlayer(playerId);
    if (!room) return;

    if (room.spectators.has(playerId)) {
      room.spectators.delete(playerId);
      this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });
      return;
    }

    const isWhite = room.white?.playerId === playerId;
    const isBlack = room.black?.playerId === playerId;
    if (!isWhite && !isBlack) return;

    if (room.status === 'playing') {
      this.finalizeMatch(room, isWhite ? 'b' : 'w', 'abandoned');
    }

    if (isWhite) room.white = null;
    if (isBlack) room.black = null;

    if (!room.white && !room.black) {
      this.rooms.delete(room.roomId);
      return;
    }

    this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });
  }

  private handleDisconnect(ws: WebSocket, session: ClientSession): void {
    if (!this.sessions.has(ws)) return;
    this.sessions.delete(ws);

    const playerId = session.playerId;
    if (!playerId) return;

    const sockets = this.playerSockets.get(playerId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size > 0) return;
      this.playerSockets.delete(playerId);
    }

    this.matchmakingQueue.delete(playerId);

    const room = this.findActiveRoomForPlayer(playerId);
    if (room) {
      if (room.spectators.has(playerId)) {
        room.spectators.delete(playerId);
        this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });
      } else {
        if (room.white?.playerId === playerId) room.white.connected = false;
        if (room.black?.playerId === playerId) room.black.connected = false;
        this.broadcastToRoom(room, { type: 'room:state', room: this.toRoomState(room) });

        const graceMs = room.status === 'playing' ? 35_000 : 12_000;
        const timer = globalThis.setTimeout(() => {
          this.disconnectTimers.delete(playerId);
          if (!this.playerSockets.has(playerId)) {
            this.leaveCurrentRoom(playerId);
            this.broadcastLobby();
            this.broadcastLeaderboard();
            this.broadcastMatchmakingStatus();
          }
        }, graceMs);
        this.disconnectTimers.set(playerId, timer);
      }
    }

    this.broadcastLeaderboard();
    this.broadcastMatchmakingStatus();
  }

  private areQueueEntriesCompatible(
    seeker: MatchQueueEntry,
    candidate: MatchQueueEntry,
    now: number
  ): boolean {
    const seekerWaitMs = Math.max(0, now - seeker.joinedAt);
    const candWaitMs = Math.max(0, now - candidate.joinedAt);
    const maxWaitMs = Math.max(seekerWaitMs, candWaitMs);

    const relaxTimeControl = maxWaitMs >= 30_000;
    if (!relaxTimeControl && candidate.timeControlId !== seeker.timeControlId) {
      return false;
    }

    const seekerRelaxFilters = seekerWaitMs >= 15_000;
    const candRelaxFilters = candWaitMs >= 15_000;

    const seekerAllowsCandPlat =
      seekerRelaxFilters || seeker.targetPlatform === 'all' || seeker.targetPlatform === candidate.platform;
    const candAllowsSeekerPlat =
      candRelaxFilters || candidate.targetPlatform === 'all' || candidate.targetPlatform === seeker.platform;
    if (!seekerAllowsCandPlat || !candAllowsSeekerPlat) return false;

    const seekerAllowsCandCountry =
      seekerRelaxFilters || seeker.targetCountry === 'ALL' || seeker.targetCountry === candidate.country;
    const candAllowsSeekerCountry =
      candRelaxFilters || candidate.targetCountry === 'ALL' || candidate.targetCountry === seeker.country;
    if (!seekerAllowsCandCountry || !candAllowsSeekerCountry) return false;

    return true;
  }

  private isRoomCompatibleWithSeeker(
    room: InternalRoom,
    seeker: MatchQueueEntry,
    now: number
  ): boolean {
    if (room.isPrivate || room.status !== 'waiting') return false;
    const hostSeat = room.white ?? room.black;
    if (!hostSeat || hostSeat.playerId === seeker.playerId || !hostSeat.connected) return false;

    const waitMs = Math.max(0, now - seeker.joinedAt, now - room.createdAt);
    if (waitMs < 30_000 && room.timeControlId !== seeker.timeControlId) return false;

    if (waitMs < 15_000) {
      if (seeker.targetPlatform !== 'all' && hostSeat.platform !== seeker.targetPlatform) return false;
      if (seeker.targetCountry !== 'ALL' && hostSeat.country !== seeker.targetCountry) return false;
    }
    return true;
  }

  private pairSeekerIntoWaitingRoom(seeker: MatchQueueEntry, matchedRoom: InternalRoom): void {
    const playerId = seeker.playerId;
    this.matchmakingQueue.delete(playerId);
    const profile =
      this.store.profiles[playerId] ??
      this.upsertProfile(playerId, 'Player', seeker.country, seeker.platform);

    const seat: OnlineRoomSeat = {
      playerId: profile.playerId,
      name: profile.name,
      country: profile.country,
      platform: profile.platform,
      elo: profile.elo,
      connected: true,
    };
    if (!matchedRoom.white) matchedRoom.white = seat;
    else if (!matchedRoom.black) matchedRoom.black = seat;
    matchedRoom.status = 'playing';
    matchedRoom.lastClockSyncAt = Date.now();

    for (const s of this.playerSockets.get(playerId) ?? []) {
      const sess = this.sessions.get(s);
      if (sess) sess.activeRoomId = matchedRoom.roomId;
    }

    const state = this.toRoomState(matchedRoom);
    this.sendToPlayer(playerId, { type: 'match:found', room: state });
    if (matchedRoom.white && matchedRoom.white.playerId !== playerId) {
      this.sendToPlayer(matchedRoom.white.playerId, { type: 'match:found', room: state });
    }
    if (matchedRoom.black && matchedRoom.black.playerId !== playerId) {
      this.sendToPlayer(matchedRoom.black.playerId, { type: 'match:found', room: state });
    }
    this.broadcastToRoom(matchedRoom, { type: 'room:state', room: state });
    this.broadcastLobby();
    this.broadcastMatchmakingStatus();
  }

  private tryPairSeeker(seeker: MatchQueueEntry): boolean {
    const now = Date.now();
    const playerId = seeker.playerId;
    const profile =
      this.store.profiles[playerId] ??
      this.upsertProfile(playerId, 'Player', seeker.country, seeker.platform);

    let bestCandidate: MatchQueueEntry | null = null;
    let bestEloDiff = Number.POSITIVE_INFINITY;

    for (const candidate of this.matchmakingQueue.values()) {
      if (candidate.playerId === playerId) continue;
      if (!this.playerSockets.has(candidate.playerId)) continue;
      if (!this.areQueueEntriesCompatible(seeker, candidate, now)) continue;

      const sameTcBonus = candidate.timeControlId === seeker.timeControlId ? 0 : 10_000;
      const eloDiff = sameTcBonus + Math.abs(candidate.elo - seeker.elo);
      if (eloDiff < bestEloDiff) {
        bestEloDiff = eloDiff;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate) {
      this.matchmakingQueue.delete(playerId);
      this.matchmakingQueue.delete(bestCandidate.playerId);

      const candProfile =
        this.store.profiles[bestCandidate.playerId] ??
        this.upsertProfile(bestCandidate.playerId, 'Player', bestCandidate.country, bestCandidate.platform);

      const tcId =
        seeker.joinedAt <= bestCandidate.joinedAt
          ? seeker.timeControlId
          : bestCandidate.timeControlId;
      const tc = ONLINE_TIME_CONTROLS[tcId];
      const roomId = `room_${crypto.randomBytes(6).toString('hex')}`;
      const code = generateRoomCode();
      const seekerIsWhite = crypto.randomInt(0, 2) === 0;

      const seekerSeat: OnlineRoomSeat = {
        playerId: profile.playerId,
        name: profile.name,
        country: profile.country,
        platform: profile.platform,
        elo: profile.elo,
        connected: true,
      };
      const candSeat: OnlineRoomSeat = {
        playerId: candProfile.playerId,
        name: candProfile.name,
        country: candProfile.country,
        platform: candProfile.platform,
        elo: candProfile.elo,
        connected: true,
      };

      const room: InternalRoom = {
        roomId,
        code,
        title: `${profile.name} vs ${candProfile.name}`,
        timeControlId: tcId,
        isPrivate: false,
        status: 'playing',
        chess: new Chess(),
        white: seekerIsWhite ? seekerSeat : candSeat,
        black: seekerIsWhite ? candSeat : seekerSeat,
        whiteTimeMs: tc.initialMs,
        blackTimeMs: tc.initialMs,
        lastClockSyncAt: Date.now(),
        lastMove: null,
        moves: [],
        winner: null,
        endReason: null,
        drawOfferBy: null,
        rematchVotes: { w: false, b: false },
        spectators: new Set(),
        chat: [],
        processedMoveIds: new Set(),
        eloDelta: null,
        createdAt: Date.now(),
        finishedAt: null,
      };

      this.rooms.set(roomId, room);
      for (const s of this.playerSockets.get(seeker.playerId) ?? []) {
        const sess = this.sessions.get(s);
        if (sess) sess.activeRoomId = roomId;
      }
      for (const s of this.playerSockets.get(candProfile.playerId) ?? []) {
        const sess = this.sessions.get(s);
        if (sess) sess.activeRoomId = roomId;
      }

      const state = this.toRoomState(room);
      this.sendToPlayer(seeker.playerId, { type: 'match:found', room: state });
      this.sendToPlayer(candProfile.playerId, { type: 'match:found', room: state });
      this.broadcastToRoom(room, { type: 'room:state', room: state });
      this.broadcastLobby();
      this.broadcastMatchmakingStatus();
      return true;
    }

    for (const room of this.rooms.values()) {
      if (this.isRoomCompatibleWithSeeker(room, seeker, now)) {
        this.pairSeekerIntoWaitingRoom(seeker, room);
        return true;
      }
    }

    return false;
  }

  private tryPairPublicRoomWithQueue(room: InternalRoom): boolean {
    if (room.isPrivate || room.status !== 'waiting') return false;
    const now = Date.now();
    for (const seeker of this.matchmakingQueue.values()) {
      if (!this.playerSockets.has(seeker.playerId)) continue;
      if (this.isRoomCompatibleWithSeeker(room, seeker, now)) {
        this.pairSeekerIntoWaitingRoom(seeker, room);
        return true;
      }
    }
    return false;
  }

  private sweepMatchmakingQueue(): void {
    if (this.matchmakingQueue.size === 0) return;
    let pruned = false;
    for (const [pid] of this.matchmakingQueue.entries()) {
      if (!this.playerSockets.has(pid)) {
        this.matchmakingQueue.delete(pid);
        pruned = true;
      }
    }
    if (pruned) {
      this.broadcastMatchmakingStatus();
    }
    for (const seeker of Array.from(this.matchmakingQueue.values())) {
      if (!this.matchmakingQueue.has(seeker.playerId)) continue;
      this.tryPairSeeker(seeker);
    }
  }

  private sweepRooms(): void {
    this.sweepMatchmakingQueue();
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.status === 'playing') {
        const turn = room.chess.turn();
        const elapsed = Math.max(0, now - room.lastClockSyncAt);
        const remaining = (turn === 'w' ? room.whiteTimeMs : room.blackTimeMs) - elapsed;
        if (remaining <= 0) {
          if (turn === 'w') room.whiteTimeMs = 0;
          else room.blackTimeMs = 0;
          this.finalizeMatch(room, turn === 'w' ? 'b' : 'w', 'timeout');
        }
      } else if (room.status === 'finished' && room.finishedAt && now - room.finishedAt > 20 * 60_000) {
        this.rooms.delete(room.roomId);
        this.broadcastLobby();
      }
    }
  }
}
