export type GeoInfo = {
  city: string | null;
  region: string | null;
  country: string | null;
  org: string | null;
  isVpn: boolean;
};

export type GeoCache = {
  get(ips: string[]): Promise<Map<string, GeoInfo>>;
  set(entries: Array<[string, GeoInfo]>): Promise<void>;
};

/** VPN apps, cloud hosts and privacy relays — their city is where the exit node sits, not the person. */
const VPN_OR_HOSTING_ORG_RE =
  /cloudflare|m247|datacamp|digitalocean|amazon|aws|google cloud|google llc|microsoft|azure|ovh|hetzner|linode|akamai|vultr|choopa|leaseweb|contabo|mullvad|nord|proton|private internet|surfshark|expressvpn|zscaler|packethub|tzulo|hostinger|oracle|alibaba|tencent|performive|clouvider|g-core|gcore|apple|icloud|fastly|hostwinds|ionos|scaleway|cdn77|datapacket|psychz|quadranet|colocrossing/i;

export function orgLooksLikeVpnOrHosting(org: string | null | undefined): boolean {
  return Boolean(org && VPN_OR_HOSTING_ORG_RE.test(org));
}

export function isPublicIp(ip: string): boolean {
  const s = ip.trim().toLowerCase();
  if (!s || s === "unknown") return false;
  if (s.startsWith("::ffff:")) return isPublicIp(s.slice(7));
  if (s === "::1" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80")) return false;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(s);
  if (!m) return s.includes(":");
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 192 && b === 168) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  return true;
}

export async function lookupIpGeo(ip: string): Promise<GeoInfo | null> {
  const token = process.env.IPINFO_TOKEN?.trim();
  const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = (await res.json()) as { city?: string; region?: string; country?: string; org?: string; bogon?: boolean };
    if (j.bogon) return null;
    const org = j.org?.trim() || null;
    return {
      city: j.city?.trim() || null,
      region: j.region?.trim() || null,
      country: j.country?.trim() || null,
      org,
      isVpn: orgLooksLikeVpnOrHosting(org),
    };
  } catch {
    return null;
  }
}

/** Cache first; look up at most `maxLookups` new IPs per call so a first run cannot hammer the provider. */
export async function resolveGeo(
  ips: Iterable<string>,
  cache: GeoCache,
  maxLookups = 150,
  concurrency = 4,
): Promise<Map<string, GeoInfo>> {
  const wanted = [...new Set([...ips].map((ip) => ip.trim()).filter(isPublicIp))];
  const out = await cache.get(wanted);
  const missing = wanted.filter((ip) => !out.has(ip)).slice(0, maxLookups);
  const fresh: Array<[string, GeoInfo]> = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < missing.length) {
      const ip = missing[cursor++]!;
      const geo = await lookupIpGeo(ip);
      if (geo) {
        out.set(ip, geo);
        fresh.push([ip, geo]);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
  if (fresh.length) await cache.set(fresh);
  return out;
}

export function memoryGeoCache(): GeoCache {
  const m = new Map<string, GeoInfo>();
  return {
    async get(ips) {
      const r = new Map<string, GeoInfo>();
      for (const ip of ips) {
        const g = m.get(ip);
        if (g) r.set(ip, g);
      }
      return r;
    },
    async set(entries) {
      for (const [ip, g] of entries) m.set(ip, g);
    },
  };
}
