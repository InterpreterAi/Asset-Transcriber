import { brandAssets, type BrandTheme } from "@/brand/tokens";
import { cn } from "@/lib/utils";

type LogoVariant = "wordmark" | "mark";
type LogoFormat = "svg" | "png";

const SRC: Record<LogoVariant, Record<BrandTheme, Record<LogoFormat, string>>> = {
  wordmark: {
    dark: { svg: brandAssets.logoDarkSvg, png: brandAssets.logoDarkPng },
    light: { svg: brandAssets.logoLightSvg, png: brandAssets.logoLightPng },
  },
  mark: {
    dark: { svg: brandAssets.markDarkSvg, png: brandAssets.markDarkPng },
    light: { svg: brandAssets.markLightSvg, png: brandAssets.markLightPng },
  },
};

export function BrandLogo({
  theme = "dark",
  variant = "wordmark",
  format = "svg",
  className,
  alt = "InterpreterAI",
}: {
  theme?: BrandTheme;
  variant?: LogoVariant;
  format?: LogoFormat;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={SRC[variant][theme][format]}
      alt={alt}
      className={cn(
        variant === "mark" ? "h-10 w-10 object-contain" : "h-10 w-auto object-contain",
        className,
      )}
      draggable={false}
    />
  );
}
