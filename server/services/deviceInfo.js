import crypto from "crypto";

const matchFirst = (ua, rules) => {
  for (const [name, regex] of rules) {
    const match = ua.match(regex);
    if (match) return match[1] ? `${name} ${match[1].split(/[._]/).slice(0, 2).join(".")}` : name;
  }
  return "Unknown";
};

// Order matters: Edge/Opera/Samsung include "Chrome" and Chrome includes "Safari".
const BROWSER_RULES = [
  ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
  ["Opera", /(?:OPR|Opera)\/([\d.]+)/],
  ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
  ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
  ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
  ["Safari", /Version\/([\d.]+).*Safari/],
  ["Internet Explorer", /(?:MSIE |Trident\/.*rv:)([\d.]+)/],
];

const OS_RULES = [
  ["Windows", /Windows NT ([\d.]+)/],
  ["iOS", /(?:iPhone|iPad|iPod).*OS ([\d_]+)/],
  ["Android", /Android ([\d.]+)/],
  ["macOS", /Mac OS X ([\d_]+)/],
  ["ChromeOS", /CrOS/],
  ["Linux", /Linux/],
];

export const parseUserAgent = (ua = "") => {
  const browser = matchFirst(ua, BROWSER_RULES);
  const os = matchFirst(ua, OS_RULES);
  let deviceType = "desktop";
  if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua)) deviceType = "tablet";
  else if (/Mobi|iPhone|iPod|Android.*Mobile/i.test(ua)) deviceType = "mobile";
  if (!ua) deviceType = "unknown";
  return { browser, os, deviceType };
};

export const getClientIp = (req) => {
  // Render fronts the app with Cloudflare, which puts the visitor's address in these headers.
  const edge = req.headers["cf-connecting-ip"] || req.headers["true-client-ip"];
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (edge ? String(edge) : forwarded ? String(forwarded).split(",")[0] : req.socket?.remoteAddress || "").trim();
  return ip.replace(/^::ffff:/, "");
};

const isPrivateIp = (ip = "") =>
  !ip || ip === "::1" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80)/i.test(ip);

const GEO_PROVIDERS = [
  {
    url: (ip) => `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    parse: (data) => (data.error ? [] : [data.city, data.region, data.country_name]),
  },
  {
    url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}`,
    parse: (data) => (data.success === false ? [] : [data.city, data.region, data.country]),
  },
];

// Best-effort geolocation ("if available"). On by default; set LOGIN_GEOLOCATION=false to disable.
// Tries a second free provider when the first is rate limited, and never blocks login for more than ~3s.
export const lookupLocation = async (ip) => {
  if (isPrivateIp(ip)) return "Local network";
  if (process.env.LOGIN_GEOLOCATION === "false") return undefined;
  for (const provider of GEO_PROVIDERS) {
    try {
      const res = await fetch(provider.url(ip), { signal: AbortSignal.timeout(1500) });
      if (!res.ok) continue;
      const location = provider.parse(await res.json()).filter(Boolean).join(", ");
      if (location) return location;
    } catch {
      // Try the next provider.
    }
  }
  return undefined;
};

export const hashDeviceId = (deviceId) => {
  const clean = String(deviceId || "").trim();
  if (!clean || clean.length > 200) return undefined;
  return crypto.createHash("sha256").update(clean).digest("hex");
};

export const getRequestDevice = async (req) => {
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 500);
  const ip = getClientIp(req);
  return {
    ...parseUserAgent(userAgent),
    userAgent,
    ip,
    location: await lookupLocation(ip),
    deviceHash: hashDeviceId(req.headers["x-device-id"] || req.body?.deviceId),
  };
};
