import {
  brandAssets,
  DEFAULT_ASSET_BASE,
  type BrandTheme,
} from "../tokens";
import { cn } from "../cn";

type LogoVariant = "wordmark" | "mark";
type LogoFormat = "svg" | "png";

const FILE: Record<LogoVariant, Record<BrandTheme, Record<LogoFormat, string>>> = {
  wordmark: {
    dark: { svg: brandAssets.logoDarkSvg, png: brandAssets.logoDarkPng },
    light: { svg: brandAssets.logoLightSvg, png: brandAssets.logoLightPng },
  },
  mark: {
    dark: { svg: brandAssets.markDarkSvg, png: brandAssets.markDarkPng },
    light: { svg: brandAssets.markLightSvg, png: brandAssets.markLightPng },
  },
};

/**
 * Renders an existing InterpreterAI logo file from `assets/` (via assetBase).
 * Does not draw or recreate the mark.
 */
export function BrandLogo({
  theme = "dark",
  variant = "wordmark",
  format = "svg",
  assetBase = DEFAULT_ASSET_BASE,
  src,
  className,
  alt = "InterpreterAI",
}: {
  theme?: BrandTheme;
  variant?: LogoVariant;
  format?: LogoFormat;
  /** URL prefix; default `/brand` (existing public copy of assets). */
  assetBase?: string;
  /** Absolute override — use only with an existing logo file. */
  src?: string;
  className?: string;
  alt?: string;
}) {
  const resolved =
    src ??
    `${assetBase.replace(/\/$/, "")}/${FILE[variant][theme][format]}`;

  return (
    <img
      src={resolved}
      alt={alt}
      className={cn(
        variant === "mark" ? "h-10 w-10 object-contain" : "h-10 w-auto object-contain",
        className,
      )}
      draggable={false}
    />
  );
}
