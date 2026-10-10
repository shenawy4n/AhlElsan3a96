import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Checks whether an error is caused by missing, invalid, or expired authentication (HTTP 401).
 */
export function isAuthError(err: unknown): boolean {
  if (!err) return false;

  const status =
    (err as any)?.status ??
    (err as any)?.response?.status ??
    (err as any)?.cause?.status;

  if (status === 401) return true;

  const msg = String(
    (err as any)?.message ||
      (err as any)?.error ||
      (err as any)?.code ||
      err ||
      ""
  ).toLowerCase();

  return (
    msg.includes("401") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid or expired session") ||
    msg.includes("missing or invalid authorization") ||
    msg.includes("jwt expired") ||
    msg.includes("session expired")
  );
}

/**
 * Signs out the user and redirects to login on 401 expired/invalid session.
 */
export async function handleAdminAuthFailure(navigate?: (opts: { to: string }) => void) {
  try {
    await supabase.auth.signOut();
  } catch {}

  toast.error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");

  if (navigate) {
    navigate({ to: "/auth" });
  } else if (typeof window !== "undefined") {
    window.location.href = "/auth";
  }
}
