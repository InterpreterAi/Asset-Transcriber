/**
 * Soniox keeps the first spelling it wrote for a sound until that WebSocket
 * ends. https://docs.soniox.com/stt/concepts/context
 * A final `<end>` means the utterance is done, so the next one can open a new socket.
 */

export function tokenIsHeardSpeech(token: { text?: string }): boolean {
  const text = token.text ?? "";
  return text.length > 0 && text !== "<end>";
}

export function shouldOpenFreshSonioxEar(
  tokens: ReadonlyArray<{ text?: string; is_final?: boolean }>,
  heardSpeechSinceOpen: boolean,
): boolean {
  if (!heardSpeechSinceOpen) return false;
  return tokens.some((token) => token.is_final === true && token.text === "<end>");
}
