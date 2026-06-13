import { useCallback, useState } from "react";

export function readUrlSearchParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function replaceUrlSearchParams(mutate: (params: URLSearchParams) => void): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  mutate(params);
  const q = params.toString();
  const path = q ? `${window.location.pathname}?${q}` : window.location.pathname;
  window.history.replaceState(null, "", path);
}

export function parseEnumUrlParam<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = readUrlSearchParam(name)?.trim().toLowerCase();
  if (!raw) return fallback;
  const hit = allowed.find((v) => v.toLowerCase() === raw);
  return hit ?? fallback;
}

export function setEnumUrlParam(name: string, value: string | null): void {
  replaceUrlSearchParams((params) => {
    if (value) params.set(name, value);
    else params.delete(name);
  });
}

/** Keeps sidebar/tab choice in the URL so F5 returns to the same section. */
export function useUrlEnumState<T extends string>(
  param: string,
  allowed: readonly T[],
  defaultValue: T,
): [T, (next: T) => void] {
  const [value, setValueState] = useState<T>(() =>
    parseEnumUrlParam(param, allowed, defaultValue),
  );

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      setEnumUrlParam(param, next === defaultValue ? null : next);
    },
    [param, defaultValue],
  );

  return [value, setValue];
}
