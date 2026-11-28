export type OnlineTimeControlId = '3+2' | '5+0' | '10+0' | '15+10';

export type ClientPlatform = 'web' | 'android' | 'ios' | 'desktop' | 'pwa';
export type PlatformFilter = 'all' | ClientPlatform;

export interface OnlineTimeControl {
  id: OnlineTimeControlId;
  initialMs: number;
  incrementMs: number;
  category: 'blitz' | 'rapid' | 'classical';
}

export const ONLINE_TIME_CONTROLS: Record<OnlineTimeControlId, OnlineTimeControl> = {
  '3+2': { id: '3+2', initialMs: 3 * 60_000, incrementMs: 2_000, category: 'blitz' },
  '5+0': { id: '5+0', initialMs: 5 * 60_000, incrementMs: 0, category: 'blitz' },
  '10+0': { id: '10+0', initialMs: 10 * 60_000, incrementMs: 0, category: 'rapid' },
  '15+10': { id: '15+10', initialMs: 15 * 60_000, incrementMs: 10_000, category: 'classical' },
};

export interface OnlinePlayerProfile {
  playerId: string;
  name: string;
  country: string;
  platform: ClientPlatform;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  streak: number;
  bestElo: number;
  updatedAt: number;
}

export interface OnlineRoomSeat {
  playerId: string;
  name: string;
  country: string;
  platform: ClientPlatform;
  elo: number;
  connected: boolean;
}

export interface OnlineRoomSummary {
  roomId: string;
  code: string;
  title: string;
  timeControlId: OnlineTimeControlId;
  isPrivate: boolean;
  status: 'waiting' | 'playing' | 'finished';
  white: OnlineRoomSeat | null;
  black: OnlineRoomSeat | null;
  spectatorCount: number;
  moveCount: number;
  createdAt: number;
}

export interface OnlineMoveRecord {
  ply: number;
  san: string;
  uci: string;
  fen: string;
  by: 'w' | 'b';
  timestamp: number;
}

export interface OnlineRoomChatMessage {
  id: string;
  playerId: string;
  name: string;
  country: string;
  text: string;
  timestamp: number;
}

export type OnlineGameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold'
  | 'insufficient'
  | 'draw_agreement'
  | 'fivefold_or_fifty'
  | 'resignation'
  | 'timeout'
  | 'abandoned';

export interface OnlineRoomState {
  roomId: string;
  code: string;
  title: string;
  timeControlId: OnlineTimeControlId;
  isPrivate: boolean;
  status: 'waiting' | 'playing' | 'finished';
  fen: string;
  turn: 'w' | 'b';
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
  spectatorCount: number;
  chat: OnlineRoomChatMessage[];
  eloDelta?: { w: number; b: number } | null;
}

export interface OnlineLeaderboardSnapshot {
  rankings: OnlinePlayerProfile[];
  onlinePlayersCount: number;
  activeCountriesCount: number;
  totalCompletedGames: number;
  serverTime: number;
}

export interface OnlineMatchmakingStatus {
  searching: boolean;
  timeControlId: OnlineTimeControlId | null;
  targetPlatform: PlatformFilter;
  startedAt: number | null;
  queueCount: number;
  onlineByPlatform: Record<ClientPlatform, number>;
}

export type OnlineWsClientMessage =
  | {
      type: 'hello';
      serverId: string;
      playerId: string;
      name: string;
      country: string;
      platform?: ClientPlatform;
      roomId?: string;
    }
  | {
      type: 'update_profile';
      name: string;
      country: string;
      platform?: ClientPlatform;
    }
  | {
      type: 'find_match';
      timeControlId: OnlineTimeControlId;
      targetPlatform: PlatformFilter;
      targetCountry?: string;
    }
  | {
      type: 'cancel_match';
    }
  | {
      type: 'create_room';
      title: string;
      timeControlId: OnlineTimeControlId;
      preferredSide: 'random' | 'w' | 'b';
      isPrivate: boolean;
    }
  | {
      type: 'join_room';
      roomIdOrCode: string;
      asSpectator?: boolean;
    }
  | {
      type: 'leave_room';
      roomId: string;
    }
  | {
      type: 'make_move';
      roomId: string;
      from: string;
      to: string;
      promotion?: string;
      clientMoveId: string;
    }
  | {
      type: 'resign';
      roomId: string;
    }
  | {
      type: 'offer_draw';
      roomId: string;
    }
  | {
      type: 'respond_draw';
      roomId: string;
      accept: boolean;
    }
  | {
      type: 'rematch';
      roomId: string;
    }
  | {
      type: 'send_chat';
      roomId: string;
      text: string;
    }
  | {
      type: 'request_sync';
      roomId?: string;
    };

export type OnlineWsServerMessage =
  | {
      type: 'welcome';
      selfProfile: OnlinePlayerProfile;
      rooms: OnlineRoomSummary[];
      leaderboard: OnlineLeaderboardSnapshot;
      activeRoom: OnlineRoomState | null;
      matchmaking: OnlineMatchmakingStatus;
    }
  | {
      type: 'profile:updated';
      profile: OnlinePlayerProfile;
    }
  | {
      type: 'lobby:update';
      rooms: OnlineRoomSummary[];
    }
  | {
      type: 'room:state';
      room: OnlineRoomState;
    }
  | {
      type: 'room:closed';
      roomId: string;
      reason: string;
    }
  | {
      type: 'matchmaking:status';
      status: OnlineMatchmakingStatus;
    }
  | {
      type: 'match:found';
      room: OnlineRoomState;
    }
  | {
      type: 'leaderboard:update';
      leaderboard: OnlineLeaderboardSnapshot;
    }
  | {
      type: 'error';
      code: string;
      message: string;
      roomId?: string;
    };
