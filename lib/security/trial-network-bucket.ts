import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const NETWORK_BUCKET_DOMAIN = "munjib/trial-network-bucket/v1\0";
const KST_TIME_ZONE = "Asia/Seoul";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type KstUsageWindow = Readonly<{ kstDate: string; resetsAt: string }>;

function invalid(message: string): never {
  throw new Error(`trial network bucket ${message}`);
}

function requireKey(key: string | Uint8Array): string | Uint8Array {
  if (typeof key === "string") {
    if (key.length === 0) invalid("key is required");
    return key;
  }
  if (key instanceof Uint8Array && key.byteLength > 0) return key;
  invalid("key is required");
}

function canonicalKstDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid("date is invalid");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) invalid("date is invalid");
  return value;
}

function ipv4Prefix(value: string): string {
  const octets = value.split(".");
  if (octets.length !== 4) invalid("network input is invalid");
  return `v4:${octets.slice(0, 3).join(".")}.0/24`;
}

function expandIpv6(value: string): string[] {
  const normalized = value.includes(".")
    ? value.replace(/(\d{1,3}(?:\.\d{1,3}){3})$/, (ipv4) => {
        const octets = ipv4.split(".").map(Number);
        return `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
      })
    : value;
  const sections = normalized.split("::");
  if (sections.length > 2) invalid("network input is invalid");
  const left = sections[0] === "" ? [] : sections[0].split(":");
  const right = sections.length === 1 || sections[1] === "" ? [] : sections[1].split(":");
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (sections.length === 1 && missing !== 0)) invalid("network input is invalid");
  return [...left, ...new Array(missing).fill("0"), ...right].map((part) => part.padStart(4, "0"));
}

function ipv6Prefix(value: string): string {
  const groups = expandIpv6(value);
  const maskedFourthGroup = `${groups[3].slice(0, 2)}00`;
  return `v6:${groups[0]}:${groups[1]}:${groups[2]}:${maskedFourthGroup}::/56`;
}

function networkPrefix(networkInput: string): string {
  const family = isIP(networkInput);
  if (family === 4) return ipv4Prefix(networkInput);
  if (family === 6) return ipv6Prefix(networkInput.toLowerCase());
  invalid("network input is invalid");
}

function kstDateParts(now: Date): { year: number; month: number; day: number; kstDate: string } {
  if (Number.isNaN(now.getTime())) invalid("time is invalid");
  const parts = KST_DATE_FORMATTER.formatToParts(now);
  const value = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) invalid("time is invalid");
  return { year, month, day, kstDate: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}` };
}

/** Returns the single common KST date and the following KST-midnight reset timestamp. */
export function resolveKstUsageWindow(now: Date = new Date()): KstUsageWindow {
  const { year, month, day, kstDate } = kstDateParts(now);
  const nextKstDate = new Date(Date.UTC(year, month - 1, day + 1));
  const resetsAt = new Date(
    Date.UTC(nextKstDate.getUTCFullYear(), nextKstDate.getUTCMonth(), nextKstDate.getUTCDate()) - KST_OFFSET_MS,
  ).toISOString();
  return { kstDate, resetsAt };
}

/** Returns only a rotating HMAC digest for a trusted IPv4 /24 or IPv6 /56 network input. */
export function deriveTrialNetworkBucket(networkInput: string, kstDate: string, key: string | Uint8Array): string {
  const date = canonicalKstDate(kstDate);
  const prefix = networkPrefix(networkInput);
  return createHmac("sha256", requireKey(key))
    .update(NETWORK_BUCKET_DOMAIN)
    .update(date, "utf8")
    .update("\0")
    .update(prefix, "utf8")
    .digest("base64url");
}
