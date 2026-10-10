import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PublicReview, ProviderRatingSummary, ReviewRecord } from "./reviews.server";
import { requireAdminAuth, requireModeratorAuth } from "./auth-middleware";

export const getProviderReviews = createServerFn({ method: "GET" })
  .validator((d: { providerId: string }) => d)
  .handler(async ({ data }): Promise<PublicReview[]> => {
    const { getProviderApprovedReviews } = await import("./reviews.server");
    return getProviderApprovedReviews(data.providerId);
  });

export const getProviderRatingSummary = createServerFn({ method: "GET" })
  .validator((d: { providerId: string }) => d)
  .handler(async ({ data }): Promise<ProviderRatingSummary> => {
    const { getProviderRatingSummary: getSummary } = await import("./reviews.server");
    return getSummary(data.providerId);
  });

export const getAllProvidersRatingSummaries = createServerFn({ method: "GET" })
  .handler(async (): Promise<Record<string, ProviderRatingSummary>> => {
    const { getAllRatingSummaries } = await import("./reviews.server");
    return getAllRatingSummaries();
  });

/** Admin & Moderator: list reviews for moderation */
export const adminListReviews = createServerFn({ method: "GET" })
  .middleware([requireModeratorAuth])
  .validator((d?: { status?: "pending" | "approved" | "rejected" | "all" }) => d)
  .handler(async ({ data }): Promise<ReviewRecord[]> => {
    const { adminGetReviews } = await import("./reviews.server");
    return adminGetReviews(data?.status);
  });

/** Admin & Moderator: moderate review (approve, reject). Delete reserved for admin/owner */
export const adminModerateReview = createServerFn({ method: "POST" })
  .middleware([requireModeratorAuth])
  .validator(
    (d: {
      reviewId: string;
      action: "approve" | "reject" | "delete";
      adminId?: string;
    }) => d
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const caller = context as any;
    if (data.action === "delete" && caller?.role === "moderator") {
      throw new Response(
        JSON.stringify({ ok: false, error: "حذف التقييم غير متاح لمشرف المحتوى" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const adminId = data.adminId || caller?.userId;
    const { adminModerateReview: moderate } = await import("./reviews.server");

    try {
      const res = await moderate(data.reviewId, data.action, adminId);
      if (!res.ok) {
        throw new Response(
          JSON.stringify({ ok: false, error: "فشل تنفيذ إجراء مراجعة التقييم" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      return res;
    } catch (err: any) {
      if (err instanceof Response) throw err;
      throw new Response(
        JSON.stringify({ ok: false, error: err?.message || "فشل تنفيذ إجراء مراجعة التقييم" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  });
