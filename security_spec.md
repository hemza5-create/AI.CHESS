# Security Specification & Payload TDD (`security_spec.md`)

## 1. Data Invariants
1. **Identity Integrity**: Every player document (`/rankings/{uid}`) and matchmaking queue ticket (`/matchmakingQueue/{queueId}`) can only be created by the verified authenticated Firebase user matching the document ID (`request.auth.uid`), with `email_verified == true`.
2. **Matchmaking Atomicity**: Claiming an opponent's `/matchmakingQueue/{queueId}` ticket to set `status = 'matched'` requires `existsAfter(/databases/$(database)/documents/matches/$(incoming().matchedMatchId))`, guaranteeing no phantom match pointers.
3. **Turn & Membership Enforcement**: Only `whiteUid` or `blackUid` of a `/matches/{matchId}` document can make moves (strictly on their own turn), offer/respond to draws, resign, or read/write `/matches/{matchId}/chat/{messageId}`.
4. **Terminal State Locking**: Once a match reaches `status == 'finished'`, no client writes can mutate its outcome (`winner`, `endReason`, `fen`, `movesSan`).
5. **Elo Anti-Tampering**: A player may update their own `/rankings/{uid}` rating only when referencing an existing finished match document in `/matches/{lastMatchId}` in which they participated, within single-game Elo delta bounds (`±48`).
6. **Zero PII Exposure**: Public collections (`rankings`, `matchmakingQueue`, `matches`) strictly prohibit email, phone, or address fields via `keys().hasOnly(...)` allowlists.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return `PERMISSION_DENIED`)
1. **Unauthenticated Write**: Create `/rankings/u1` without `request.auth`.
2. **Unverified Email Spoof**: Write `/rankings/u1` with `email_verified: false`.
3. **Identity Spoofing on Queue**: User `u2` creates `/matchmakingQueue/u2` with `uid: "u1"`.
4. **Ghost Field / Shadow Update**: Update `/rankings/u1` including extra field `isAdmin: true`.
5. **Self-Inflated Elo on Registration**: Create `/rankings/u1` with `elo: 2900` instead of `1200`.
6. **Unauthorized Elo Manipulation**: Update `/rankings/u1` `elo` without a valid finished `lastMatchId`.
7. **Orphaned Queue Match Claim**: Update `/matchmakingQueue/u1` to `status: "matched"` without atomically creating `/matches/{matchedMatchId}` in the same batch.
8. **Out-of-Turn Move**: `blackUid` submits move when `existing.turn == "w"`.
9. **Terminal Match Mutation**: Update `winner` on a match whose `existing.status == "finished"`.
10. **ID Poisoning**: Create `/matches/<200-char invalid ID>` or `/matches/bad$id`.
11. **Unbounded Array / Payload Exhaustion**: Write `movesSan` with 350 entries or `text` > 180 chars in chat.
12. **Non-Participant Chat Access**: User `u3` reads or creates a chat message under `/matches/{matchId}/chat/{msgId}` when `u3` is neither `whiteUid` nor `blackUid`.
