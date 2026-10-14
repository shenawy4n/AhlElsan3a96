import { createServerFn } from "@tanstack/react-start";
import {
  PUBLIC_PROVIDER_SELECT,
  CARD_PROVIDER_SELECT,
  isPremiumActive,
  type Category,
  type Area,
  type HomepageData,
  type HomepageProvider,
  type CategoryAvailability,
  type ProvidersTotals,
  type ProvidersResult,
} from "./directory";
import { isOpenNow, hasWorkingHoursSet, isProviderEmergency24h } from "./working-hours";

interface MinimalActiveProvider {
  id: string;
  name: string;
  description: string | null;
  services: string[] | string | null;
  category_id: string;
  area_id: string | null;
  experience_id: string | null;
  working_hours: string | null;
  is_emergency_24h?: boolean | null;
  is_premium: boolean;
  premium_expires_at: string | null;
  created_at: string;
}

// In-memory cache for 60 seconds of minimal provider columns
let activeProvidersCache: {
  timestamp: number;
  data: MinimalActiveProvider[];
} | null = null;

let categoriesCache: {
  timestamp: number;
  data: { id: string; name: string }[];
} | null = null;

let areasCache: {
  timestamp: number;
  data: { id: string; name: string }[];
} | null = null;

const CACHE_TTL_MS = 60_000;

async function getCachedActiveProviders(client: any): Promise<MinimalActiveProvider[]> {
  const now = Date.now();
  if (activeProvidersCache && now - activeProvidersCache.timestamp < CACHE_TTL_MS) {
    return activeProvidersCache.data;
  }

  const { data, error } = await client
    .from("providers")
    .select(
      "id, name, description, services, category_id, area_id, experience_id, working_hours, is_premium, premium_expires_at, created_at"
    )
    .eq("status", "active");

  if (!error && Array.isArray(data)) {
    activeProvidersCache = {
      timestamp: now,
      data: data as MinimalActiveProvider[],
    };
    return activeProvidersCache.data;
  }

  return activeProvidersCache?.data || [];
}

async function getCachedCategories(client: any): Promise<{ id: string; name: string }[]> {
  const now = Date.now();
  if (categoriesCache && now - categoriesCache.timestamp < CACHE_TTL_MS) {
    return categoriesCache.data;
  }
  const { data } = await client.from("categories").select("id, name").eq("status", "active");
  if (Array.isArray(data)) {
    categoriesCache = { timestamp: now, data };
    return data;
  }
  return categoriesCache?.data || [];
}

async function getCachedAreas(client: any): Promise<{ id: string; name: string }[]> {
  const now = Date.now();
  if (areasCache && now - areasCache.timestamp < CACHE_TTL_MS) {
    return areasCache.data;
  }
  const { data } = await client.from("areas").select("id, name").eq("status", "active");
  if (Array.isArray(data)) {
    areasCache = { timestamp: now, data };
    return data;
  }
  return areasCache?.data || [];
}

let categoryUnitsCache: {
  timestamp: number;
  data: Record<string, string>;
} | null = null;

export async function getCachedCategoryUnits(client: any): Promise<Record<string, string>> {
  const now = Date.now();
  if (categoryUnitsCache && now - categoryUnitsCache.timestamp < CACHE_TTL_MS) {
    return categoryUnitsCache.data;
  }
  const { data } = await client
    .from("app_settings")
    .select("key, value")
    .like("key", "cat_unit_%");

  const map: Record<string, string> = {};
  if (Array.isArray(data)) {
    for (const row of data) {
      if (row.key && row.value) {
        map[row.key] = row.value;
      }
    }
  }
  categoryUnitsCache = { timestamp: now, data: map };
  return map;
}

export function invalidateCategoryUnitsCache(): void {
  categoryUnitsCache = null;
  categoriesCache = null;
}

export const invalidateCategoryCacheServerFn = createServerFn({ method: "POST" })
  .handler(async () => {
    invalidateCategoryUnitsCache();
    return { ok: true };
  });

function normalizeForSearch(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/[%,()_\\*'"[\]]/g, " ")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤئ]/g, "ء")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearch(text: string | null | undefined, query: string): boolean {
  if (!text) return false;
  const normText = normalizeForSearch(text);
  const normQuery = normalizeForSearch(query);
  if (!normQuery) return true;
  if (normText.includes(normQuery)) return true;
  if (normQuery.startsWith("ال") && normQuery.length > 3 && normText.includes(normQuery.slice(2))) {
    return true;
  }
  if (normText.startsWith("ال") && normText.length > 3 && normText.slice(2).includes(normQuery)) {
    return true;
  }
  return false;
}

function normalizeServicesList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((s) => (typeof s === "string" ? s.trim() : ""))
            .filter((s) => s.length > 0);
        }
      } catch {
        // fallback
      }
    }
    return trimmed
      .split(/[,،\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

export const getHomepageDataServerFn = createServerFn({ method: "POST" })
  .validator((d?: { areaId?: string }) => d)
  .handler(
    async ({ data: opts }): Promise<HomepageData> => {
      const { supabase } = await import("@/integrations/supabase/client");

      const targetAreaId = opts?.areaId;

      // Fetch active providers with minimal columns using 60s in-memory cache
      const allActiveProviders = await getCachedActiveProviders(supabase);

      // Filter active providers by area if village selected
      const scopedProviders = targetAreaId
        ? allActiveProviders.filter((p) => p.area_id === targetAreaId)
        : allActiveProviders;

      // 1. Featured providers query: strictly admin-featured / premium only
      let featuredQuery = supabase
        .from("providers")
        .select(PUBLIC_PROVIDER_SELECT)
        .eq("status", "active")
        .eq("is_premium", true)
        .order("created_at", { ascending: false })
        .limit(10);

      // 2. Query for active providers to calculate popular & top-rated lists
      let activeProvidersQuery = supabase
        .from("providers")
        .select(PUBLIC_PROVIDER_SELECT)
        .eq("status", "active");

      if (targetAreaId) {
        featuredQuery = featuredQuery.eq("area_id", targetAreaId);
        activeProvidersQuery = activeProvidersQuery.eq("area_id", targetAreaId);
      }

      // Parallelize queries
      const [catsRes, areasRes, settingsRes, featuredRes, activeRes, eventsRes, reviewsRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id,name,icon,sort_order,status")
          .eq("status", "active")
          .order("sort_order"),
        supabase
          .from("areas")
          .select("id,name,status")
          .eq("status", "active")
          .order("name"),
        supabase
          .from("app_settings")
          .select("key,value"),
        featuredQuery,
        activeProvidersQuery,
        supabase
          .from("analytics_events")
          .select("provider_id, event_type")
          .not("provider_id", "is", null),
        supabase
          .from("reviews")
          .select("provider_id, rating")
          .eq("status", "approved")
          .then(
            (res: any) => (res.error ? { data: [] } : res),
            () => ({ data: [] })
          ),
      ]);

      const settings: Record<string, string> = {};
      const unitsMap: Record<string, string> = {};
      for (const s of (settingsRes.data ?? []) as { key: string; value: string }[]) {
        settings[s.key] = s.value;
        if (s.key && s.key.startsWith("cat_unit_")) {
          unitsMap[s.key] = s.value;
        }
      }
      categoryUnitsCache = { timestamp: Date.now(), data: unitsMap };

      const categories = (catsRes.data ?? []) as Category[];
      for (const cat of categories) {
        cat.unit_title = settings[`cat_unit_${cat.id}`]?.trim() || cat.unit_title || null;
      }
      const category_counts: Record<string, number> = {};
      const category_availability: Record<string, CategoryAvailability> = {};

      for (const cat of categories) {
        const catProviders = scopedProviders.filter((p) => p.category_id === cat.id);
        const total = catProviders.length;
        category_counts[cat.id] = total;

        let openCount = 0;
        let hasAnyHours = false;

        for (const p of catProviders) {
          const is24h = Boolean(p.is_emergency_24h || isProviderEmergency24h(p.working_hours));
          const hasHours = is24h || hasWorkingHoursSet(p.working_hours);
          if (hasHours) {
            hasAnyHours = true;
          }

          if (is24h || isOpenNow(p.working_hours) === true) {
            openCount++;
          }
        }

        category_availability[cat.id] = {
          open: openCount,
          other: total - openCount,
          total,
          hasAnyHours,
        };
      }

      // Ratings aggregation
      const ratings: Record<string, { average: number; count: number }> = {};
      const ratingSums: Record<string, { sum: number; count: number }> = {};
      for (const r of (reviewsRes.data ?? []) as { provider_id: string; rating: number }[]) {
        if (!r.provider_id) continue;
        const entry = ratingSums[r.provider_id] ?? { sum: 0, count: 0 };
        entry.sum += r.rating;
        entry.count += 1;
        ratingSums[r.provider_id] = entry;
      }
      for (const [id, stats] of Object.entries(ratingSums)) {
        ratings[id] = {
          count: stats.count,
          average: Math.round((stats.sum / stats.count) * 10) / 10,
        };
      }

      // Analytics event counts per provider
      const eventCounts: Record<string, number> = {};
      for (const ev of (eventsRes.data ?? []) as { provider_id: string }[]) {
        if (ev.provider_id) {
          eventCounts[ev.provider_id] = (eventCounts[ev.provider_id] || 0) + 1;
        }
      }

      const attachCategoryUnit = (p: HomepageProvider) => {
        const catId = p.category_id || p.categories?.id;
        const customUnit = catId ? settings[`cat_unit_${catId}`]?.trim() : undefined;
        if (p.categories) {
          (p.categories as any).unit_title = customUnit || (p.categories as any).unit_title || null;
        } else if (customUnit && catId) {
          p.categories = { id: catId, name: "", unit_title: customUnit };
        }
      };

      const allActiveList = (activeRes.data ?? []) as HomepageProvider[];
      for (const p of allActiveList) {
        if (ratings[p.id]) {
          p.average_rating = ratings[p.id].average;
          p.review_count = ratings[p.id].count;
        }
        attachCategoryUnit(p);
      }

      // 1. Featured providers (strictly marked premium by admin)
      const featured_providers = ((featuredRes.data ?? []) as HomepageProvider[]).filter((p) => isPremiumActive(p));
      for (const p of featured_providers) {
        if (ratings[p.id]) {
          p.average_rating = ratings[p.id].average;
          p.review_count = ratings[p.id].count;
        }
        attachCategoryUnit(p);
      }

      // 2. Most Requested (based on analytics event volume)
      const popular_providers = [...allActiveList]
        .sort((a, b) => {
          const ca = eventCounts[a.id] || 0;
          const cb = eventCounts[b.id] || 0;
          if (cb !== ca) return cb - ca;
          if (b.is_verified !== a.is_verified) return (b.is_verified ? 1 : 0) - (a.is_verified ? 1 : 0);
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
        .slice(0, 6);

      // 3. Top Rated (based on reviews average and count)
      const top_rated_providers = [...allActiveList]
        .sort((a, b) => {
          const ra = ratings[a.id]?.average || 0;
          const rb = ratings[b.id]?.average || 0;
          if (rb !== ra) return rb - ra;
          const ca = ratings[a.id]?.count || 0;
          const cb = ratings[b.id]?.count || 0;
          if (cb !== ca) return cb - ca;
          if (b.is_verified !== a.is_verified) return (b.is_verified ? 1 : 0) - (a.is_verified ? 1 : 0);
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
        .slice(0, 6);

      return {
        settings,
        categories,
        areas: (areasRes.data ?? []) as Area[],
        category_counts,
        category_availability,
        featured_providers,
        popular_providers,
        top_rated_providers,
        ratings,
      };
    }
  );

export const getCategoriesServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Category[]> => {
    const { supabase } = await import("@/integrations/supabase/client");
    const [catsRes, unitsMap] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name,icon,sort_order,status")
        .eq("status", "active")
        .order("sort_order"),
      getCachedCategoryUnits(supabase),
    ]);
    const cats = (catsRes.data ?? []) as Category[];
    for (const c of cats) {
      c.unit_title = unitsMap[`cat_unit_${c.id}`]?.trim() || c.unit_title || null;
    }
    return cats;
  }
);

export const getAreasServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Area[]> => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("areas")
      .select("id,name,status")
      .eq("status", "active")
      .order("name");
    return (data ?? []) as Area[];
  }
);

export const getSettingsServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, string>> => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.from("app_settings").select("key,value");
    return Object.fromEntries(
      (data ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
    );
  }
);

export const getCategoryCountsServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, number>> => {
    const { supabase } = await import("@/integrations/supabase/client");
    try {
      const { data, error } = await (supabase.rpc as any)("get_homepage_data");
      if (!error && data?.category_counts) {
        return data.category_counts as Record<string, number>;
      }
    } catch {
      // Fallback
    }
    return {};
  }
);

export const getProvidersServerFn = createServerFn({ method: "POST" })
  .validator((d: {
    categoryId?: string;
    areaId?: string;
    experienceId?: string;
    search?: string;
    filterMode?: "all" | "available_now" | "emergency_now";
    premiumOnly?: boolean;
    limit?: number;
    offset?: number;
  }) => d)
  .handler(async ({ data: opts }): Promise<ProvidersResult> => {
    const { supabase } = await import("@/integrations/supabase/client");

    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const rawSearch = opts.search ? opts.search.trim().slice(0, 60) : "";

    // 1. Fetch all active providers with minimal columns using 60s in-memory cache
    const allActive = await getCachedActiveProviders(supabase);
    const [categories, areas] = await Promise.all([
      getCachedCategories(supabase),
      getCachedAreas(supabase),
    ]);
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const areaMap = new Map(areas.map((a) => [a.id, a.name]));

    // 2. Filter matching active providers for current query (q, category, village)
    const matchingProviders = allActive.filter((p) => {
      if (opts.categoryId && p.category_id !== opts.categoryId) return false;
      if (opts.areaId && p.area_id !== opts.areaId) return false;
      if (opts.experienceId && p.experience_id !== opts.experienceId) return false;
      if (opts.premiumOnly && !isPremiumActive(p)) return false;

      if (rawSearch) {
        if (matchesSearch(p.name, rawSearch)) return true;
        if (matchesSearch(p.description, rawSearch)) return true;
        const srvs = normalizeServicesList(p.services);
        if (srvs.some((s) => matchesSearch(s, rawSearch))) return true;
        const catName = catMap.get(p.category_id);
        if (catName && matchesSearch(catName, rawSearch)) return true;
        if (p.area_id) {
          const areaName = areaMap.get(p.area_id);
          if (areaName && matchesSearch(areaName, rawSearch)) return true;
        }
        return false;
      }

      return true;
    });

    // 3. Compute exact totals across ALL matching providers (never page-capped)
    let openNow = 0;
    let closedNow = 0;
    let hoursNotSet = 0;
    let emergency24 = 0;

    for (const p of matchingProviders) {
      const isEmerg = Boolean(p.is_emergency_24h || isProviderEmergency24h(p.working_hours));
      if (isEmerg) emergency24++;

      const status = isOpenNow(p.working_hours);
      if (isEmerg || status === true) {
        openNow++;
      } else if (status === false) {
        closedNow++;
      } else {
        hoursNotSet++;
      }
    }

    const totals: ProvidersTotals = {
      all: matchingProviders.length,
      openNow,
      closedNow,
      hoursNotSet,
      emergency24,
    };

    // 4. Order items according to requested view:
    // Inside each group: premium first, then newest
    const comparePremiumThenNewest = (a: MinimalActiveProvider, b: MinimalActiveProvider) => {
      const aPrem = isPremiumActive(a) ? 1 : 0;
      const bPrem = isPremiumActive(b) ? 1 : 0;
      if (aPrem !== bPrem) return bPrem - aPrem;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    };

    let orderedProviders: MinimalActiveProvider[];

    if (opts.filterMode === "available_now") {
      const openGroup = matchingProviders
        .filter((p) => {
          const isEmerg = Boolean(p.is_emergency_24h || isProviderEmergency24h(p.working_hours));
          return isEmerg || isOpenNow(p.working_hours) === true;
        })
        .sort(comparePremiumThenNewest);

      const closedGroup = matchingProviders
        .filter((p) => {
          const isEmerg = Boolean(p.is_emergency_24h || isProviderEmergency24h(p.working_hours));
          return !isEmerg && isOpenNow(p.working_hours) === false;
        })
        .sort(comparePremiumThenNewest);

      const notSetGroup = matchingProviders
        .filter((p) => {
          const isEmerg = Boolean(p.is_emergency_24h || isProviderEmergency24h(p.working_hours));
          return !isEmerg && isOpenNow(p.working_hours) === null;
        })
        .sort(comparePremiumThenNewest);

      orderedProviders = [...openGroup, ...closedGroup, ...notSetGroup];
    } else if (opts.filterMode === "emergency_now") {
      orderedProviders = matchingProviders
        .filter((p) => Boolean(p.is_emergency_24h || isProviderEmergency24h(p.working_hours)))
        .sort(comparePremiumThenNewest);
    } else {
      orderedProviders = [...matchingProviders].sort(comparePremiumThenNewest);
    }

    // 5. Slice requested page of items
    const pageProviders = orderedProviders.slice(offset, offset + limit);
    const pageIds = pageProviders.map((p) => p.id);

    if (pageIds.length === 0) {
      return {
        totals,
        items: [],
      };
    }

    // 6. Load full card rows for the paged IDs with reviews & services
    let fullRows: any[] = [];
    const { data: rowsData, error } = await supabase
      .from("providers")
      .select(CARD_PROVIDER_SELECT)
      .in("id", pageIds);

    if (error) {
      console.warn("[getProvidersServerFn error, falling back to cached providers]", error.message);
      fullRows = pageProviders as any[];
    } else {
      fullRows = rowsData ?? [];
    }

    const unitsMap = await getCachedCategoryUnits(supabase);
    const rowMap = new Map<string, any>();
    for (const r of fullRows ?? []) {
      const catId = r.category_id || r.categories?.id;
      const customUnit = catId ? unitsMap[`cat_unit_${catId}`]?.trim() : undefined;
      if (r.categories) {
        r.categories.unit_title = customUnit || (r.categories as any).unit_title || null;
      }
      const revs = Array.isArray((r as any).reviews)
        ? (r as any).reviews.filter((rev: any) => rev.status === "approved")
        : [];
      const revCount = revs.length;
      const avg = revCount > 0
        ? Math.round(
            (revs.reduce((sum: number, rev: any) => sum + (Number(rev.rating) || 0), 0) / revCount) * 10
          ) / 10
        : 0;
      (r as any).average_rating = avg;
      (r as any).review_count = revCount;
      delete (r as any).reviews;
      rowMap.set(r.id, r);
    }

    const items = pageIds.map((id) => rowMap.get(id)).filter(Boolean);

    return {
      totals,
      items,
    };
  });

export const getProviderDetailServerFn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("providers")
      .select(PUBLIC_PROVIDER_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (data) {
      const unitsMap = await getCachedCategoryUnits(supabase);
      const catId = (data as any).category_id || (data as any).categories?.id;
      const customUnit = catId ? unitsMap[`cat_unit_${catId}`]?.trim() : undefined;
      if ((data as any).categories) {
        (data as any).categories.unit_title = customUnit || (data as any).categories.unit_title || null;
      }
    }
    return data ?? null;
  });

export { getAdminProvidersServerFn } from "./admin-actions.functions";

