import { getRequest } from "@tanstack/react-start/server";

// Server-only. Persistent, atomic rate limit backed by the check_rate_limit DB function.
// Limits live in the rate_limit_policies table (default 5 requests / 10 minutes per IP + form_type).
export type RateLimitedForm =
  | "report"
  | "service_suggestion"
  | "provider_application"
  | "review"
  | "provider_contact";

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?).){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^[0-9a-fA-F:]+$/;

function sanitizeAndValidateIp(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const cleaned = candidate.trim();
  if (cleaned.length < 3 || cleaned.length > 45) return null;
  if (IPV4_REGEX.test(cleaned) || IPV6_REGEX.test(cleaned)) {
    return cleaned;
  }
  return null;
}

export function getClientIp(request: Request): string {
  const h = request.headers;

  // 1. Cloudflare edge-injected header (highest trust when deployed on Cloudflare/Lovable edge)
  const cfIp = sanitizeAndValidateIp(h.get("cf-connecting-ip"));
  if (cfIp) return cfIp;

  // 2. Direct reverse proxy header
  const realIp = sanitizeAndValidateIp(h.get("x-real-ip"));
  if (realIp) return realIp;

  // 3. X-Forwarded-For proxy chain: parse and extract first valid IP
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",");
    for (const part of parts) {
      const valid = sanitizeAndValidateIp(part);
      if (valid) return valid;
    }
  }

  return "unknown";
}

// In-memory sliding window cache as emergency fallback
const memoryLimitCache = new Map<string, number[]>();

function checkMemoryLimit(ip: string, formType: string, max = 10, windowMs = 600_000): boolean {
  const key = `${ip}:${formType}`;
  const now = Date.now();
  const timestamps = (memoryLimitCache.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= max) {
    return false;
  }
  timestamps.push(now);
  memoryLimitCache.set(key, timestamps);
  return true;
}

export async function checkCurrentRequestRateLimit(formType: RateLimitedForm): Promise<boolean> {
  try {
    const req = getRequest();
    const ip = req ? getClientIp(req) : "unknown";
    return checkRateLimit(ip, formType);
  } catch {
    // Fail-guarded fallback: if request context cannot be resolved, apply in-memory guard for "unknown"
    return checkMemoryLimit("unknown", formType);
  }
}

/** Returns true when the request is allowed (and records it); false when over the limit. */
export async function checkRateLimit(ip: string, formType: RateLimitedForm): Promise<boolean> {
  // If unknown IP or empty, guard with memory limiter
  if (!ip || ip === "unknown") {
    return checkMemoryLimit("unknown", formType);
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Parameter names in SQL are: ip and form_type (without leading underscores)
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit" as never, {
      ip,
      form_type: formType,
    } as never);

    if (error) {
      console.warn("[rate-limit.server] check_rate_limit fallback to memory:", error.message);
      return checkMemoryLimit(ip, formType);
    }

    return data === true;
  } catch (e) {
    console.warn("[rate-limit.server] check_rate_limit exception fallback to memory:", e);
    return checkMemoryLimit(ip, formType);
  }
}
