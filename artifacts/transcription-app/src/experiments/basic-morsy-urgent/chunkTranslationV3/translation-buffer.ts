export class TranslationBuffer {
  private buffer: string = "";
  private committedText: string = "";

  addText(newText: string): string | null {
    this.buffer += newText;

    const boundary = this.findSentenceBoundary();
    if (boundary !== -1) {
      const sentence = this.buffer.slice(0, boundary + 1);
      this.buffer = this.buffer.slice(boundary + 1);
      return sentence;
    }
    return null;
  }

  private findSentenceBoundary(): number {
    const punct = [".", "!", "?"];
    let lastIdx = -1;
    for (const p of punct) {
      const idx = this.buffer.lastIndexOf(p);
      if (idx > lastIdx) lastIdx = idx;
    }
    return lastIdx;
  }

  forceFlush(): string {
    const remaining = this.buffer;
    this.buffer = "";
    return remaining;
  }
}
