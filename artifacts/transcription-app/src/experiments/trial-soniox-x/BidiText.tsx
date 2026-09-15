import type { BidiDir } from "./bidi-islands";
import { splitBidiIslands } from "./bidi-islands";

export function BidiText({
  text,
  baseDir,
  className,
}: {
  text: string;
  baseDir: BidiDir;
  className?: string;
}) {
  if (!text) return null;
  const pieces = splitBidiIslands(text, baseDir);
  return (
    <span className={className}>
      {pieces.map((piece, i) =>
        piece.isolate ? (
          <bdi key={i} dir={piece.isolate}>
            {piece.text}
          </bdi>
        ) : (
          <span key={i}>{piece.text}</span>
        ),
      )}
    </span>
  );
}
