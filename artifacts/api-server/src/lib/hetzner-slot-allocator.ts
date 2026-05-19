/**
 * Pure in-memory Hetzner worker slot model used only while computing a new assignment
 * or replaying open-session state from Postgres. Not routing authority.
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

function physicalSpreadSlotIndices(numSlots: 2 | 4): readonly number[] {
  if (numSlots === 4) return [0, 2, 3, 1];
  return [0, 1];
}

function trialIdleSpreadSlotIndices(numSlots: 2 | 4): readonly number[] {
  if (numSlots === 4) return [1, 2, 3, 0];
  return [1, 0];
}

function clearTrialsFromSlot(state: SlotAllocatorState, idx: number): void {
  const set = state.slotTrialSessions[idx];
  if (!set) return;
  for (const sid of set) {
    state.sessionToLane.delete(sid);
  }
  set.clear();
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
    clearTrialsFromSlot(state, idx);
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
  for (const idx of physicalSpreadSlotIndices(state.numSlots)) {
    if (idx >= state.numSlots) continue;
    if (state.slotPaidOwner[idx] === null) {
      clearTrialsFromSlot(state, idx);
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
 * Trials use only workers with no exclusive paid owner. If every slot has an exclusive paid owner,
 * trial routing fails (no sharing with paid).
 */
export function allocateTrial(state: SlotAllocatorState, sessionId: number): CoreLane {
  for (const i of trialIdleSpreadSlotIndices(state.numSlots)) {
    if (i >= state.numSlots) continue;
    if (state.slotPaidOwner[i] === null) {
      state.slotTrialSessions[i]!.add(sessionId);
      const lane = (i + 1) as CoreLane;
      state.sessionToLane.set(sessionId, lane);
      return lane;
    }
  }
  throw new HetznerTrialRoutingBlockedError();
}
