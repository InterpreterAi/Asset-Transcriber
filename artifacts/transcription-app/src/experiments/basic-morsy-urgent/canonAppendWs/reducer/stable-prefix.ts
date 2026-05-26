/** Stable committed prefix is append-only across the whole engine — no backward reconciliation. */

export function committedTextUpTo(tokens: { joinedText: string }[], endExclusive: number): string {
  let s = "";
  for (let i = 0; i < endExclusive && i < tokens.length; i++) {
    s += tokens[i]!.joinedText;
  }
  return s;
}
