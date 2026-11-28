/**
 * Phase 0 Dirty Dozen Security Test Specification for Firestore Rules
 * Verifies all 12 adversarial payloads against the Eight Pillars in firestore.rules.
 */
export const DIRTY_DOZEN_SCENARIOS = [
  { id: 1, name: 'Unauthenticated ranking create', path: '/rankings/u1', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified email spoof write', path: '/rankings/u1', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Queue identity spoofing (uid != auth.uid)', path: '/matchmakingQueue/u2', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Shadow ghost field injection (isAdmin)', path: '/rankings/u1', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Self-inflated starting Elo (!= 1200)', path: '/rankings/u1', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Elo update without finished match doc', path: '/rankings/u1', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Orphaned queue match claim without batch match', path: '/matchmakingQueue/u1', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Out-of-turn chess move update', path: '/matches/m1', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Mutation after terminal finished status', path: '/matches/m1', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'ID poisoning (>128 chars or special chars)', path: '/matches/bad$id', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Bounded list/string overflow (movesSan > 300)', path: '/matches/m1', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Non-participant chat read/create', path: '/matches/m1/chat/c1', expected: 'PERMISSION_DENIED' },
] as const;
