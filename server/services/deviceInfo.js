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
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (forwarded ? String(forwarded).split(",")[0] : req.socket?.remoteAddress || "").trim();
  return ip.replace(/^::ffff:/, "");
};

const isPrivateIp = (ip = "") =>
  !ip || ip === "::1" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80)/i.test(ip);

// Best-effort geolocation. Disabled unless LOGIN_GEOLOCATION=true, and never blocks login for more than ~1.5s.
export const lookupLocation = async (ip) => {
  if (process.env.LOGIN_GEOLOCATION !== "true" || isPrivateIp(ip)) return isPrivateIp(ip) ? "Local network" : undefined;
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return undefined;
    const data = await res.json();
    return [data.city, data.region, data.country_name].filter(Boolean).join(", ") || undefined;
  } catch {
    return undefined;
  }
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
