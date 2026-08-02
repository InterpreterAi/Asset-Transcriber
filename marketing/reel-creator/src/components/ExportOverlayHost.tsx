import { BrandIntro } from "@brand/components/BrandIntro";
import { BrandOutro } from "@brand/components/BrandOutro";
import { CANVAS_H, CANVAS_W, type ReelConfig } from "../lib/config";

type OverlayMode = "intro" | "outro" | "none";

/**
 * Off-DOM-visual but in-document 1080×1920 host for export capture.
 * Never CSS-scaled — prevents tiny overlays on a black canvas.
 */
export function ExportOverlayHost({
  mode,
  cfg,
  hostRef,
}: {
  mode: OverlayMode;
  cfg: ReelConfig;
  hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: -CANVAS_W - 80,
        top: 0,
        width: CANVAS_W,
        height: CANVAS_H,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: -1,
        opacity: 1,
      }}
    >
      <div
        ref={hostRef}
        style={{
          position: "relative",
          width: CANVAS_W,
          height: CANVAS_H,
          overflow: "hidden",
          background: "transparent",
        }}
      >
        {mode === "intro" ? (
          <BrandIntro
            durationMs={cfg.intro.durationMs}
            transparent={cfg.intro.transparent}
            showTitle={false}
            assetBase="/brand"
          />
        ) : null}
        {mode === "outro" ? (
          <BrandOutro
            durationMs={cfg.outro.durationMs}
            referralUrl={cfg.referralLink}
            cta={cfg.cta}
            assetBase="/brand"
          />
        ) : null}
      </div>
    </div>
  );
}
