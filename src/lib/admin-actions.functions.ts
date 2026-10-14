import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth, requireModeratorAuth } from "./auth-middleware";
import { PROVIDER_SELECT, PUBLIC_PROVIDER_SELECT, type ProviderWithRefs } from "./directory";

/** Fetch all providers with full details (Admin & Moderator only) */
export const getAdminProvidersServerFn = createServerFn({ method: "GET" })
  .middleware([requireModeratorAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");
    let { data, error } = await supabaseAdmin
      .from("providers")
      .select(PROVIDER_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      // Fallback if column-level security blocks sensitive columns
      const fallback = await supabaseAdmin
        .from("providers")
        .select(PUBLIC_PROVIDER_SELECT)
        .order("created_at", { ascending: false });

      if (!fallback.error && Array.isArray(fallback.data)) {
        data = fallback.data as any;
      } else {
        console.error("[getAdminProvidersServerFn error]", error);
        throw new Response(
          JSON.stringify({ ok: false, message: error.message || "Failed to load providers" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const { data: unitSettings } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .like("key", "cat_unit_%");
    const unitsMap: Record<string, string> = {};
    for (const u of (unitSettings ?? []) as { key: string; value: string }[]) {
      if (u.key && u.value) unitsMap[u.key] = u.value;
    }
    const list = (data ?? []) as unknown as ProviderWithRefs[];
    for (const p of list) {
      const catId = (p as any).category_id || (p as any).categories?.id;
      const customUnit = catId ? unitsMap[`cat_unit_${catId}`]?.trim() : undefined;
      if ((p as any).categories) {
        (p as any).categories.unit_title = customUnit || (p as any).categories.unit_title || null;
      }
    }
    return list;
  });

function normalizeArabicCategory(str: string): string {
  return str
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // remove tashkeel & tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[ؤئ]/g, "ء")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Delete one or multiple providers (Admin only) */
export const deleteProvidersAdminFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator((d: { ids: string[] }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    if (!data.ids || data.ids.length === 0) {
      throw new Response(
        JSON.stringify({ ok: false, message: "لا يوجد معرفات محددة للحذف" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Delete reviews and reports associated with providers
    await Promise.all([
      supabaseAdmin.from("reviews").delete().in("provider_id", data.ids),
      supabaseAdmin.from("reports").delete().in("provider_id", data.ids),
    ]);

    const { error } = await supabaseAdmin.from("providers").delete().in("id", data.ids);
    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true as const, count: data.ids.length };
  });

/** Delete category with safety check on referenced providers (Admin only) */
export const deleteCategoryAdminFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    // Check if category has any providers
    const { count } = await supabaseAdmin
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("category_id", data.id);

    if (count && count > 0) {
      throw new Response(
        JSON.stringify({
          ok: false,
          message: `لا يمكن حذف هذا القسم لأنه يحتوي على ${count} صنايعي مسجل. يرجى نقلهم لقسم آخر أو إخفاء القسم بدلاً من حذفه.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Clean up custom unit setting if exists
    await supabaseAdmin.from("app_settings").delete().eq("key", `cat_unit_${data.id}`);

    const { error } = await supabaseAdmin.from("categories").delete().eq("id", data.id);
    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true as const };
  });

/** Delete area with safety check on referenced providers (Admin only) */
export const deleteAreaAdminFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("area_id", data.id);

    if (count && count > 0) {
      throw new Response(
        JSON.stringify({
          ok: false,
          message: `لا يمكن حذف هذه المنطقة لأنها تحتوي على ${count} صنايعي مسجل. يرجى نقلهم لمنطقة أخرى أو إخفاء المنطقة.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { error } = await supabaseAdmin.from("areas").delete().eq("id", data.id);
    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true as const };
  });

/** Delete experience option safely by nullifying provider references first (Admin only) */
export const deleteExperienceAdminFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    await supabaseAdmin
      .from("providers")
      .update({ experience_id: null })
      .eq("experience_id", data.id);

    const { error } = await supabaseAdmin.from("experience_options").delete().eq("id", data.id);
    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true as const };
  });

/** Delete review (Admin only) */
export const deleteReviewAdminFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("reviews").delete().eq("id", data.id);
    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true as const };
  });

/** Delete contact message (Admin only) */
export const deleteMessageAdminFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("service_suggestions").delete().eq("id", data.id);
    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true as const };
  });

/** Get all service suggestions (Admin & Moderator) */
export const getSuggestionsAdminFn = createServerFn({ method: "GET" })
  .middleware([requireModeratorAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("service_suggestions")
      .select("id, name, status, created_at")
      .not("name", "ilike", "[رسالة تواصل]%")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getSuggestionsAdminFn error]", error);
      throw new Response(
        JSON.stringify({ ok: false, message: error.message || "Failed to load suggestions" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return (data ?? []) as {
      id: string;
      name: string;
      status: string;
      created_at: string;
    }[];
  });

/** Get single service suggestion detail (Admin & Moderator) */
export const getSuggestionDetailAdminFn = createServerFn({ method: "POST" })
  .middleware([requireModeratorAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { data: suggestion, error } = await supabaseAdmin
      .from("service_suggestions")
      .select("id, name, status, created_at")
      .eq("id", data.id)
      .maybeSingle();

    if (error) {
      console.error("[getSuggestionDetailAdminFn error]", error);
      throw new Response(
        JSON.stringify({ ok: false, message: error.message || "Failed to load suggestion detail" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!suggestion) {
      throw new Response(
        JSON.stringify({ ok: false, message: "الاقتراح غير موجود" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return suggestion;
  });

/** Update service suggestion status (Admin & Moderator) */
export const updateSuggestionStatusAdminFn = createServerFn({ method: "POST" })
  .middleware([requireModeratorAuth])
  .validator((d: { id: string; status: "new" | "approved" | "rejected" | "dismissed" }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("service_suggestions")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true as const };
  });

/** Approve service suggestion and create category as inactive for review (Admin & Moderator) */
export const approveSuggestionAndCreateCategoryAdminFn = createServerFn({ method: "POST" })
  .middleware([requireModeratorAuth])
  .validator((d: { id: string; categoryName: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const raw = data.categoryName || "";
    // Clean name: strip control characters, collapse whitespace, limit to 50 characters
    const cleanName = raw
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50);

    if (cleanName.length < 2) {
      throw new Response(
        JSON.stringify({ ok: false, message: "اسم القسم المقترح قصير جداً (حرفان على الأقل)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const normInput = normalizeArabicCategory(cleanName);

    // 1. Check for normalized duplicate among all existing categories
    const { data: allCategories, error: listErr } = await supabaseAdmin
      .from("categories")
      .select("id, name");

    if (listErr) {
      throw new Response(
        JSON.stringify({ ok: false, message: listErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const existingMatch = (allCategories ?? []).find(
      (c) => normalizeArabicCategory(c.name) === normInput
    );

    if (existingMatch) {
      throw new Response(
        JSON.stringify({
          ok: false,
          message: `يوجد قسم بنفس الاسم بالفعل («${existingMatch.name}»)`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Determine highest sort_order
    const { data: topOrder } = await supabaseAdmin
      .from("categories")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (topOrder?.sort_order ?? 0) + 1;

    // 3. Insert category as inactive for review
    const { error: catErr } = await supabaseAdmin
      .from("categories")
      .insert({
        name: cleanName,
        icon: "Wrench",
        sort_order: nextOrder,
        status: "inactive",
      });

    if (catErr) {
      throw new Response(
        JSON.stringify({ ok: false, message: catErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Mark suggestion as approved
    const { error: suggErr } = await supabaseAdmin
      .from("service_suggestions")
      .update({ status: "approved" })
      .eq("id", data.id);

    if (suggErr) {
      throw new Response(
        JSON.stringify({ ok: false, message: suggErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return { ok: true as const, name: cleanName };
  });

/** Delete service suggestion (Admin only) */
export const deleteSuggestionAdminFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("service_suggestions")
      .delete()
      .eq("id", data.id);

    if (error) {
      throw new Response(
        JSON.stringify({ ok: false, message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true as const };
  });
