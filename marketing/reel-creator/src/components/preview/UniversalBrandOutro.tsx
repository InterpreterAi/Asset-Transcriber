/**
 * @deprecated Use InterpreterAIOutro — kept for backward-compatible imports.
 */

import { InterpreterAIOutro } from "@/components/preview/InterpreterAIOutro";
import type { OutroLayerDocument } from "@/lib/outroLayerLayout";
import type { OutroPhraseTiming } from "@/lib/outroVoPacing";
import type { UniversalOutroCopy } from "@/lib/universalBrandOutro";

export function UniversalBrandOutro({
  localTime,
  durationSec,
  phraseTimings = [],
  syncToPhrases = true,
  allowPointerEvents = false,
}: {
  /** @deprecated Ignored — brand copy is locked. */
  copy?: UniversalOutroCopy;
  /** @deprecated Ignored — layout is fixed. */
  layout?: OutroLayerDocument;
  /** @deprecated */
  displayLang?: string;
  /** @deprecated */
  rtl?: boolean;
  localTime: number;
  durationSec: number;
  phraseTimings?: OutroPhraseTiming[];
  syncToPhrases?: boolean;
  allowPointerEvents?: boolean;
  /** @deprecated */
  showCtaSubline?: boolean;
}) {
  return (
    <InterpreterAIOutro
      localTime={localTime}
      durationSec={durationSec}
      phraseTimings={phraseTimings}
      syncToPhrases={syncToPhrases}
      allowPointerEvents={allowPointerEvents}
    />
  );
}
