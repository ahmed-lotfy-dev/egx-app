import { createHash } from "node:crypto";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

export function textValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  const record = asRecord(value);

  return record ? textValue(record["#text"]) : null;
}

export function canonicalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
