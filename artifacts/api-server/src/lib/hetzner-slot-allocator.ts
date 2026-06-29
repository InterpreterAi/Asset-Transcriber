/**
 * Pure in-memory Hetzner worker slot model used only while computing a new assignment
 * or replaying open-session state from Postgres. Not routing authority.
 *
 * Exclusive `slotPaidOwner` records which session “claimed” an empty Libre worker first.
 * Multiple sessions (trial and/or overflow paid) may **share** the same worker — each Libre
 * endpoint accepts concurrent `/translate` HTTP calls. Trials are therefore never refused
 * when “all exclusives” are taken (previously surfaced as HetznerTrialRoutingBlockedError).
 */

import type { CoreLane } from "./hetzner-core-router.js";

export type SlotAllocatorState = {
  numSlots: 2 | 4;
  slotPaidOwner: [number | null, number | null, number | null, number | null];
  slotTrialSessions: [Set<number>, Set<number>, Set<number>, Set<number>];
  sessionToLane: Map<number, CoreLane>;
};

export class HetznerTrialRoutingBlockedError extends Error {
  constructor() {
    super("HETZNER_TRIAL_ALL_CORES_RESERVED_FOR_PAID");
    this.name = "HetznerTrialRoutingBlockedError";
  }
}

function countLaneSessions(state: SlotAllocatorState, lane: CoreLane): number {
  let n = 0;
  for (const assigned of state.sessionToLane.values()) {
    if (assigned === lane) n++;
  }
  return n;
}

/**
 * Four-lane preference uses opposite-group balancing:
 * - Group A: CORE1/CORE2
 * - Group B: CORE3/CORE4
 *
 * If A is busier, prefer B. If B is busier, prefer A.
 */
function fourLaneOppositeGroupPreference(state: SlotAllocatorState): readonly number[] {
  const g12 = countLaneSessions(state, 1) + countLaneSessions(state, 2);
  const g34 = countLaneSessions(state, 3) + countLaneSessions(state, 4);

  if (g12 > g34) return [2, 3, 0, 1]; // 3,4 then 1,2
  if (g34 > g12) return [0, 1, 2, 3]; // 1,2 then 3,4
  return [0, 1, 2, 3];
}

function paidExclusiveSlotIndices(state: SlotAllocatorState): readonly number[] {
  if (state.numSlots === 4) return fourLaneOppositeGroupPreference(state);
  return [0, 1];
}

function trialIdleSpreadSlotIndices(state: SlotAllocatorState): readonly number[] {
  if (state.numSlots === 4) return fourLaneOppositeGroupPreference(state);
  return [1, 0];
}

export function createEmptySlotAllocatorState(numSlots: 2 | 4): SlotAllocatorState {
  return {
    numSlots,
    slotPaidOwner: [null, null, null, null],
    slotTrialSessions: [new Set(), new Set(), new Set(), new Set()],
    sessionToLane: new Map(),
  };
}

/**
 * Apply an already-persisted lane for an open session so allocator state matches DB truth.
 */
export function seedCommittedLane(
  state: SlotAllocatorState,
  sessionId: number,
  paid: boolean,
  lane: CoreLane,
): void {
  if (lane < 1 || lane > state.numSlots) return;
  const idx = lane - 1;
  state.sessionToLane.set(sessionId, lane);
  if (!paid) {
    state.slotTrialSessions[idx]!.add(sessionId);
    return;
  }
  if (state.slotPaidOwner[idx] === null) {
    state.slotPaidOwner[idx] = sessionId;
    return;
  }
  if (state.slotPaidOwner[idx] === sessionId) {
    return;
  }
  // Paid overflow on CORE1 or manual pin onto another paid's exclusive — occupancy stays with the exclusive owner.
  if (lane === 1) {
    return;
  }
}

/** First NUM_SLOTS paid sessions claim empty workers; further paid share CORE1 (overflow). */
export function allocatePaid(state: SlotAllocatorState, sessionId: number): CoreLane {
  for (const idx of paidExclusiveSlotIndices(state)) {
    if (idx >= state.numSlots) continue;
    if (state.slotPaidOwner[idx] === null) {
      state.slotPaidOwner[idx] = sessionId;
      const lane = (idx + 1) as CoreLane;
      state.sessionToLane.set(sessionId, lane);
      return lane;
    }
  }
  const lane: CoreLane = 1;
  state.sessionToLane.set(sessionId, lane);
  return lane;
}

/**
 * Prefer workers with **no exclusive paid owner** (trialIdleSpreadSlotIndices).
 * If every slot already has an exclusive paid session (e.g. NUM_SLOTS=2 with two Basics),
 * **multiplex**: assign to the spread order anyway — LibreTranslate queues concurrent HTTP per worker.
 * Admin manual `hetzner_mt_manual_lane` is unchanged (comes from DB replay, not this allocator predicate).
 */
export function allocateTrial(state: SlotAllocatorState, sessionId: number): CoreLane {
  for (const i of trialIdleSpreadSlotIndices(state)) {
    if (i >= state.numSlots) continue;
    if (state.slotPaidOwner[i] === null) {
      state.slotTrialSessions[i]!.add(sessionId);
      const lane = (i + 1) as CoreLane;
      state.sessionToLane.set(sessionId, lane);
      return lane;
    }
  }
  for (const i of trialIdleSpreadSlotIndices(state)) {
    if (i >= state.numSlots) continue;
    state.slotTrialSessions[i]!.add(sessionId);
    const lane = (i + 1) as CoreLane;
    state.sessionToLane.set(sessionId, lane);
    return lane;
  }
  const fallbackIdx = Math.max(0, state.numSlots - 1);
  state.slotTrialSessions[fallbackIdx]!.add(sessionId);
  return (fallbackIdx + 1) as CoreLane;
}
