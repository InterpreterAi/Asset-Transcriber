/**
 * Cloned from Soniox live demo:
 * https://github.com/soniox/soniox_examples/blob/master/apps/soniox-live-demo/react/src/hooks/useAutoScroll.tsx
 */
import type { Token } from "@soniox/speech-to-text-web";
import { useEffect, useRef } from "react";

export default function useAutoScroll(tokens: Token[]) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tokens.length) {
      ref.current?.scrollTo({
        top: ref.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [tokens]);

  return ref;
}
