import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  status: string;
  unit_title?: string | null;
};

export type Area = {
  id: string;
  name: string;
  status: string;
};

export type Provider = {
  id: string;
  name: string;
  category_id: string;
  area_id: string;
  phone: string;
  secondary_phone: string | null;
  whatsapp: string | null;
  description: string | null;
  services: string[] | string | null;
  price_description: string | null;
  working_hours: string | null;
  is_emergency_24h?: boolean | null;
  has_workshop?: boolean | null;
  workshop_name?: string | null;
  workshop_address?: string | null;
  photo_url: string | null;
  status: string;
  is_premium: boolean;
  premium_expires_at: string | null;
  experience_id: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type ProviderWithRefs = Provider & {
  has_whatsapp?: boolean;
  categories: { id: string; name: string } | null;
  areas: { id: string; name: string } | null;
  experience_options: { id: string; label: string } | null;
  average_rating?: number;
  review_count?: number;
};

/** What the public sees — no phone numbers. */
export type PublicProvider = Omit<ProviderWithRefs, "phone" | "secondary_phone" | "whatsapp" | "has_whatsapp"> & {
  has_whatsapp: boolean;
  average_rating?: number;
  review_count?: number;
};

export type ExperienceOption = { id: string; label: string; sort_order: number; status: string };

export interface HomepageProvider extends PublicProvider {
  average_rating?: number;
  review_count?: number;
}

export interface CategoryAvailability {
  open: number;
  other: number;
  total: number;
  hasAnyHours: boolean;
}

export interface HomepageData {
  settings: Record<string, string>;
  categories: Category[];
  areas: Area[];
  category_counts: Record<string, number>;
  category_availability?: Record<string, CategoryAvailability>;
  featured_providers: HomepageProvider[];
  popular_providers: HomepageProvider[];
  top_rated_providers: HomepageProvider[];
  ratings: Record<string, { average: number; count: number }>;
}

export function homepageDataQuery(areaId?: string) {
  return {
    queryKey: ["homepage-data", areaId || "all"],
    staleTime: 1000 * 60, // 60 seconds fresh cache
    queryFn: async (): Promise<HomepageData> => {
      const { getHomepageDataServerFn } = await import("./directory.functions");
      return await getHomepageDataServerFn({ data: { areaId: areaId || undefined } });
    },
  };
}

/** Admin only (includes phone numbers). */
export const PROVIDER_SELECT = "*, categories(id,name), areas(id,name), experience_options(id,label)";
export const PUBLIC_PROVIDER_SELECT =
  "id,name,category_id,area_id,description,services,price_description,working_hours,photo_url,status,is_premium,premium_expires_at,experience_id,is_verified,has_whatsapp,created_at,updated_at, categories(id,name), areas(id,name), experience_options(id,label)";

/** Lightweight select for cards (home featured, search results, category pages). */
export const CARD_PROVIDER_SELECT =
  "id,name,category_id,area_id,description,services,photo_url,status,is_premium,premium_expires_at,experience_id,is_verified,has_whatsapp,working_hours,categories(id,name),areas(id,name),experience_options(id,label)";

export function isPremiumActive(p: Pick<Provider, "is_premium" | "premium_expires_at">) {
  if (!p.is_premium) return false;
  if (!p.premium_expires_at) return true;
  return new Date(p.premium_expires_at).getTime() > Date.now();
}

export const categoriesQuery = {
  queryKey: ["categories"],
  staleTime: 1000 * 60 * 30, // 30 minutes cache
  queryFn: async (): Promise<Category[]> => {
    try {
      const { getCategoriesServerFn } = await import("./directory.functions");
      const res = await getCategoriesServerFn();
      if (Array.isArray(res) && res.length > 0) return res;
    } catch {
      // fallback
    }
    const { data } = await supabase
      .from("categories")
      .select("id,name,icon,sort_order,status")
      .eq("status", "active")
      .order("sort_order");
    return (data ?? []) as Category[];
  },
};

export const areasQuery = {
  queryKey: ["areas"],
  staleTime: 1000 * 60 * 30, // 30 minutes cache
  queryFn: async (): Promise<Area[]> => {
    try {
      const { getAreasServerFn } = await import("./directory.functions");
      const res = await getAreasServerFn();
      if (Array.isArray(res) && res.length > 0) return res;
    } catch {
      // fallback
    }
    const { data } = await supabase
      .from("areas")
      .select("id,name,status")
      .eq("status", "active")
      .order("name");
    return (data ?? []) as Area[];
  },
};

export const categoryCountsQuery = {
  queryKey: ["category-provider-counts"],
  staleTime: 1000 * 60 * 30, // 30 minutes cache
  queryFn: async (): Promise<Record<string, number>> => {
    const { getCategoryCountsServerFn } = await import("./directory.functions");
    return await getCategoryCountsServerFn();
  },
};

/**
 * Returns the designation unit/occupation title for providers under a given category
 * following the 4-tier priority:
 * 1. Valid existing custom category unit title or explicit unit value.
 * 2. Reliable mapping from an existing category name to a specific Egyptian occupation title.
 * 3. The original category name if it exists but cannot be reliably mapped to a specific occupation.
 * 4. "مقدم خدمة" only when neither a valid occupation nor a usable category name is available.
 */
export function getCategoryUnit(categoryName?: string | null, customUnit?: string | null): string {
  // 1. Valid existing custom category unit title or explicit unit value
  if (customUnit && typeof customUnit === "string" && customUnit.trim()) {
    return customUnit.trim();
  }

  const raw = (categoryName || "").trim();
  if (!raw) {
    // 4. "مقدم خدمة" only when neither a valid occupation nor a usable category name is available
    return "مقدم خدمة";
  }

  // 2. Reliable mapping from an existing category name to a specific Egyptian occupation title
  // Medical & Healthcare
  if (/(?:طب|طبيب|أطباء|دكتور|دكاترة|عيادات?|علاج|مستشفى|صيدل)/i.test(raw)) return "طبيب";
  if (/(?:تمريض|ممرض)/i.test(raw)) return "ممرض";

  // Education
  if (/(?:تعليم|مدرس|مدرسين|معلم|دروس|تدريس|أستاذ)/i.test(raw)) return "مدرس";

  // Engineering & Law & Accounting
  if (/(?:هندس|مهندس)/i.test(raw)) return "مهندس";
  if (/(?:محام|قانون)/i.test(raw)) return "محامي";
  if (/(?:محاسب|حسابات)/i.test(raw)) return "محاسب";

  // Egyptian Crafts & Trades
  if (/(?:كهربا|كهربائي)/i.test(raw)) return "كهربائي";
  if (/(?:سباك|سباكة)/i.test(raw)) return "سباك";
  if (/(?:نجار|نجارة)/i.test(raw)) return "نجار";
  if (/(?:نقاش|نقاشة|دهانات?)/i.test(raw)) return "نقاش";
  if (/(?:حداد|حدادة)/i.test(raw)) return "حداد";
  if (/(?:ميكانيك|ميكانيكا|ميكانيكي)/i.test(raw)) return "ميكانيكي";
  if (/(?:سمكر|سمكرة|سمكري)/i.test(raw)) return "سمكري";
  if (/(?:سيراميك)/i.test(raw)) return "فني سيراميك";
  if (/(?:ألوميتال|الوميتال)/i.test(raw)) return "فني ألوميتال";
  if (/(?:رخام)/i.test(raw)) return "فني رخام";
  if (/(?:محار|محارة|مبيض\s*محار)/i.test(raw)) return "مبيض محارة";
  if (/(?:دش|رسيفر)/i.test(raw)) return "فني دش ورسيفر";
  if (/(?:كاميرات|مراقبة|انظمة\s*مراقبة)/i.test(raw)) return "فني كاميرات مراقبة";
  if (/(?:ترزي|خياط)/i.test(raw)) return "ترزي";
  if (/(?:حلاق|حلاقة)/i.test(raw)) return "حلاق";
  if (/(?:زجاج|ازاز)/i.test(raw)) return "فني زجاج";
  if (/(?:مصور|تصوير)/i.test(raw)) return "مصور";
  if (/(?:نقل|مواصلات|سائق|سواق)/i.test(raw)) return "سائق";
  if (/(?:بناء|بنا|عامل\s*بناء)/i.test(raw)) return "بَنّاء";

  // 3. The original category name if it exists but cannot be reliably mapped to a specific occupation
  return raw;
}

/**
 * Formats small notice: e.g. "متاح ١ كهربائي", "متاح ٢ طبيب", or "لا يوجد حالياً"
 */
export function formatAvailableNotice(count: number, unit?: string | null): string {
  if (count <= 0) {
    return "لا يوجد حالياً";
  }
  const cleanUnit = (unit && unit.trim()) ? unit.trim() : "مقدم خدمة";
  return `متاح ${count} ${cleanUnit}`;
}

export interface ProvidersTotals {
  all: number;
  openNow: number;
  closedNow: number;
  hoursNotSet: number;
  emergency24: number;
}

export interface ProvidersResult {
  items: PublicProvider[];
  totals: ProvidersTotals;
}

export function providersQuery(opts: {
  categoryId?: string | undefined;
  areaId?: string | undefined;
  experienceId?: string | undefined;
  search?: string | undefined;
  filterMode?: "all" | "available_now" | "emergency_now" | undefined;
  premiumOnly?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  includeHidden?: boolean | undefined;
}) {
  return {
    queryKey: ["providers", opts],
    staleTime: 1000 * 60, // 60 seconds fresh cache
    queryFn: async (): Promise<ProvidersResult> => {
      const { getProvidersServerFn } = await import("./directory.functions");
      return (await getProvidersServerFn({ data: opts })) as unknown as ProvidersResult;
    },
  };
}

export const experienceQuery = {
  queryKey: ["experience"],
  staleTime: 1000 * 60 * 30, // 30 minutes cache
  queryFn: async (): Promise<ExperienceOption[]> => {
    const { data, error } = await supabase
      .from("experience_options")
      .select("id,label,sort_order,status")
      .eq("status", "active")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as ExperienceOption[];
  },
};

export type AppSettings = Record<string, string | null>;
export const settingsQuery = {
  queryKey: ["settings"],
  staleTime: 1000 * 60 * 30, // 30 minutes cache
  queryFn: async (): Promise<AppSettings> => {
    try {
      const { getSettingsServerFn } = await import("./directory.functions");
      const res = await getSettingsServerFn();
      if (res && Object.keys(res).length > 0) return res;
    } catch {
      // fallback
    }
    const { data } = await supabase.from("app_settings").select("key,value");
    return Object.fromEntries(
      (data ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
    );
  },
};

export function providerQuery(id: string) {
  return {
    queryKey: ["provider", id],
    staleTime: 1000 * 60 * 3, // 3 minutes cache
    queryFn: async (): Promise<PublicProvider | null> => {
      try {
        const { data, error } = await supabase
          .from("providers")
          .select(PUBLIC_PROVIDER_SELECT)
          .eq("id", id)
          .maybeSingle();
        if (!error && data) return data as unknown as PublicProvider | null;
      } catch {
        // Fallback to server function
      }
      const { getProviderDetailServerFn } = await import("./directory.functions");
      return (await getProviderDetailServerFn({ data: id })) as unknown as PublicProvider | null;
    },
  };
}

/** Lightweight Arabic-tolerant LIKE pattern: كهربا → كهرب (matches كهربائي), أ/ا/إ, ة/ه, ى/ي interchangeable. */
export function arabicPattern(raw: string) {
  let s = raw.trim().replace(/[%,()_\\*]/g, "").replace(/[\u064B-\u0652\u0640]/g, "").replace(/\s+/g, " ");
  if (s.startsWith("ال") && s.length > 4) s = s.slice(2);
  while (s.length > 3 && /[اأإآةهىيئء]$/.test(s)) s = s.slice(0, -1);
  return s.replace(/[اأإآ]/g, "_").replace(/[ةه]/g, "_").replace(/[ىي]/g, "_");
}

/**
 * Single source of truth for Egyptian mobile phone validation and normalization.
 * Standard normalized format: 201XXXXXXXXX (12 digits, mobile starting with 201[0125])
 * - 01012345678   -> 201012345678
 * - +201012345678 -> 201012345678
 * - 201012345678  -> 201012345678
 * - 00201012345678 -> 201012345678
 * - ٠١٠١٢٣٤٥٦٧٨   -> 201012345678
 * Returns null if invalid or empty.
 */
export const EG_PHONE_REGEX = /^201[0125]\d{8}$/;

export function normalizeEgPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Convert Eastern Arabic numerals to standard digits and strip non-digits/+
  let n = phone
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\d+]/g, "");

  if (n.startsWith("+")) n = n.slice(1);
  if (n.startsWith("00")) n = n.slice(2);

  // If starts with 01XXXXXXXXX (11 digits) -> 201XXXXXXXXX
  if (n.startsWith("01")) {
    n = "2" + n;
  } else if (n.startsWith("1") && n.length === 10) {
    // If starts with 1XXXXXXXXX (10 digits) -> 201XXXXXXXXX
    n = "20" + n;
  }

  // Must match exactly 201[0125] followed by 8 digits (12 digits total)
  if (EG_PHONE_REGEX.test(n)) {
    return n;
  }
  return null;
}

/** Check if a phone string is a valid Egyptian mobile number */
export function isValidEgPhone(phone: string | null | undefined): boolean {
  return normalizeEgPhone(phone) !== null;
}

export function telHref(phone: string | null | undefined): string | null {
  const n = normalizeEgPhone(phone);
  return n ? `tel:+${n}` : null;
}

export function whatsappHref(phone: string | null | undefined): string | null {
  const n = normalizeEgPhone(phone);
  return n ? `https://wa.me/${n}` : null;
}
