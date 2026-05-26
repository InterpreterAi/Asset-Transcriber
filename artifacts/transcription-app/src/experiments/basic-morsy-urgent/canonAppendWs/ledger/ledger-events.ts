/** Ledger-side events for telemetry (experiment only). */

export type LedgerAppendEvent = {
  kind: "ledger_append_final";
  count: number;
};
