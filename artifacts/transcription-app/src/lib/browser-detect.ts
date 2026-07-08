export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || "";
  return (
    /LinkedInApp/i.test(ua) ||
    /FBAN|FBAV|FB_IAB/i.test(ua) ||
    /Instagram/i.test(ua) ||
    /Twitter/i.test(ua) ||
    /\bwv\b/.test(ua) ||
    (/iPhone|iPod|iPad/.test(ua) && !/Safari/.test(ua) && /AppleWebKit/.test(ua))
  );
}
