import crypto from "node:crypto";

export interface ReviewRecord {
  id: string;
  provider_id: string;
  rating: number; // 1-5
  comment: string;
  reviewer_name: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export interface PublicReview {
  id: string;
  provider_id: string;
  rating: number;
  comment: string;
  reviewer_name: string | null;
  created_at: string;
}

export interface ProviderRatingSummary {
  average: number;
  count: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTableMissingOrSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; hint?: string; status?: number };
  const msg = (err.message || "").toLowerCase();
  const hint = (err.hint || "").toLowerCase();
  const code = String(err.code || "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    code === "22P02" ||
    err.status === 404 ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    msg.includes("relation") ||
    msg.includes("does not exist") ||
    msg.includes("invalid api key") ||
    hint.includes("double check your supabase")
  );
}

/** Insert a new review (defaults to pending) */
export async function createReview(data: {
  provider_id: string;
  rating: number;
  comment: string;
  reviewer_name?: string | null;
}): Promise<{ ok: boolean; id: string }> {
  const newId = crypto.randomUUID();
  if (!data.provider_id || !UUID_REGEX.test(data.provider_id.trim())) {
    return { ok: false, id: newId };
  }

  const record = {
    id: newId,
    provider_id: data.provider_id.trim(),
    rating: data.rating,
    comment: data.comment,
    reviewer_name: data.reviewer_name?.trim() || null,
    status: "pending" as const,
    created_at: new Date().toISOString(),
  };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("reviews").insert(record);
    if (error) {
      if (!isTableMissingOrSchemaError(error)) {
        console.error("[reviews.server] Error inserting review to Supabase:", error);
      }
      return { ok: false, id: newId };
    }
    return { ok: true, id: newId };
  } catch (e) {
    if (!isTableMissingOrSchemaError(e)) {
      console.error("[reviews.server] Exception inserting review:", e);
    }
    return { ok: false, id: newId };
  }
}

/**
 * Get public reviews for a provider.
 * Strictly returns only APPROVED reviews.
 * Does not expose status, reviewed_at, or any moderation metadata.
 */
export async function getProviderApprovedReviews(providerId: string): Promise<PublicReview[]> {
  if (!providerId || !UUID_REGEX.test(providerId.trim())) {
    return [];
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("reviews")
      .select("id, provider_id, rating, comment, reviewer_name, created_at")
      .eq("provider_id", providerId.trim())
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      if (!isTableMissingOrSchemaError(error)) {
        console.error(`[reviews.server] Error fetching approved reviews:`, error);
      }
      return [];
    }
    return (data ?? []) as unknown as PublicReview[];
  } catch (e) {
    if (!isTableMissingOrSchemaError(e)) {
      console.error("[reviews.server] Exception fetching approved reviews:", e);
    }
    return [];
  }
}

/**
 * Get provider rating summary (average & count).
 * Strictly calculates based on approved reviews only.
 * Pending & rejected are NEVER included.
 */
export async function getProviderRatingSummary(providerId: string): Promise<ProviderRatingSummary> {
  if (!providerId || !UUID_REGEX.test(providerId.trim())) {
    return { average: 0, count: 0 };
  }
  const reviews = await getProviderApprovedReviews(providerId.trim());
  if (!reviews.length) {
    return { average: 0, count: 0 };
  }

  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  const average = Math.round((sum / reviews.length) * 10) / 10;
  return { average, count: reviews.length };
}

/**
 * Get all providers' rating summaries in a single batch.
 * Strictly based on approved reviews only.
 */
export async function getAllRatingSummaries(): Promise<Record<string, ProviderRatingSummary>> {
  let approvedReviews: { provider_id: string; rating: number }[] = [];

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("reviews")
      .select("provider_id, rating")
      .eq("status", "approved");

    if (error) {
      if (!isTableMissingOrSchemaError(error)) {
        console.error("[reviews.server] Error fetching ratings for all providers:", error);
      }
      return {};
    }
    approvedReviews = (data ?? []) as unknown as { provider_id: string; rating: number }[];
  } catch (e) {
    if (!isTableMissingOrSchemaError(e)) {
      console.error("[reviews.server] Exception fetching ratings for all providers:", e);
    }
    return {};
  }

  const map: Record<string, { sum: number; count: number }> = {};
  for (const r of approvedReviews) {
    const entry = map[r.provider_id] ?? { sum: 0, count: 0 };
    entry.sum += r.rating;
    entry.count += 1;
    map[r.provider_id] = entry;
  }

  const result: Record<string, ProviderRatingSummary> = {};
  for (const [id, stats] of Object.entries(map)) {
    result[id] = {
      count: stats.count,
      average: Math.round((stats.sum / stats.count) * 10) / 10,
    };
  }

  return result;
}

/**
 * Admin: list reviews with status filtering.
 */
export async function adminGetReviews(status?: "pending" | "approved" | "rejected" | "all"): Promise<ReviewRecord[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("reviews").select("*").order("created_at", { ascending: false });
    if (status && status !== "all") {
      q = q.eq("status", status);
    }
    const { data, error } = await q;
    if (error) {
      if (!isTableMissingOrSchemaError(error)) {
        console.error("[reviews.server] Error in adminGetReviews:", error);
      }
      return [];
    }
    return (data ?? []) as unknown as ReviewRecord[];
  } catch (e) {
    if (!isTableMissingOrSchemaError(e)) {
      console.error("[reviews.server] Exception in adminGetReviews:", e);
    }
    return [];
  }
}

/**
 * Admin: moderate review (approve, reject, or delete).
 */
export async function adminModerateReview(
  reviewId: string,
  action: "approve" | "reject" | "delete",
  adminId?: string
): Promise<{ ok: boolean }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (action === "delete") {
      const { error } = await supabaseAdmin.from("reviews").delete().eq("id", reviewId);
      if (error) {
        if (!isTableMissingOrSchemaError(error)) {
          console.error("[reviews.server] Error deleting review:", error);
        }
        return { ok: false };
      }
      return { ok: true };
    } else {
      const newStatus = action === "approve" ? "approved" : "rejected";
      const { error } = await supabaseAdmin
        .from("reviews")
        .update({
          status: newStatus,
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId || null,
        })
        .eq("id", reviewId);
      if (error) {
        if (!isTableMissingOrSchemaError(error)) {
          console.error("[reviews.server] Error moderating review:", error);
        }
        return { ok: false };
      }
      return { ok: true };
    }
  } catch (e) {
    if (!isTableMissingOrSchemaError(e)) {
      console.error("[reviews.server] Exception in adminModerateReview:", e);
    }
    return { ok: false };
  }
}
