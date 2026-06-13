import type { ReactNode } from "react";
import type { CinematicChapterMeta } from "./data/cinematic-chapters";

type Props = {
  chapter: CinematicChapterMeta;
  children: ReactNode;
  sticky?: boolean;
  /** Override DOM id for nav hash links */
  anchorId?: string;
};

export function CinematicChapter({ chapter, children, sticky, anchorId }: Props) {
  return (
    <section
      id={anchorId ?? `chapter-${chapter.id}`}
      data-chapter={chapter.id}
      className="relative scroll-mt-20"
      style={{ minHeight: `${chapter.heightVh}vh` }}
    >
      <div className={sticky ? "sticky top-16 min-h-[calc(100vh-4rem)] flex flex-col justify-center py-12" : "py-16 sm:py-20"}>
        {children}
      </div>
    </section>
  );
}
