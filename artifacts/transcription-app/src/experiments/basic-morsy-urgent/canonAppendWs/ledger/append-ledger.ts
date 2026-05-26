import type { Token } from "../types/tokens";

/** Immutable snapshot of finalized Soniox pieces (append-only). Not UI state. */
export interface CanonLedgerSnapshot {
  readonly finalizedPieces: readonly string[];
  readonly finalizedTokenRefs: readonly string[];
}

export class AppendOnlyCanonLedger {
  private pieces: string[] = [];

  private ids: string[] = [];

  appendFinalTokens(tokens: Token[]): void {
    for (const t of tokens) {
      if (!t.isFinal) continue;
      this.pieces.push(t.text ?? "");
      this.ids.push(t.id);
    }
  }

  snapshot(): CanonLedgerSnapshot {
    return { finalizedPieces: [...this.pieces], finalizedTokenRefs: [...this.ids] };
  }

  joined(): string {
    return this.pieces.join("");
  }
}
