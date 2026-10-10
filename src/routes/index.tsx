import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Search, MapPin, ChevronDown, Lightbulb, UserPlus, Zap, Sparkles, Flame, Star } from "lucide-react";
import { toast } from "sonner";
import { submitPublicForm, publicFormError } from "@/lib/public-forms.functions";
import {
  categoriesQuery,
  areasQuery,
  settingsQuery,
  homepageDataQuery,
  getCategoryUnit,
} from "@/lib/directory";
import { ProviderCard } from "@/components/ProviderCard";
import { CategoryIcon } from "@/components/CategoryIcon";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData(homepageDataQuery());
      if (data) {
        if (data.categories) context.queryClient.setQueryData(categoriesQuery.queryKey, data.categories);
        if (data.areas) context.queryClient.setQueryData(areasQuery.queryKey, data.areas);
        if (data.settings) context.queryClient.setQueryData(settingsQuery.queryKey, data.settings);
      }
    } catch {
      // Loader error must not crash the page: catch and fall through
    }
  },
  head: () => ({
    meta: [
      { title: "أهل الصنعة — دليل خدمات القرية" },
      {
        name: "description",
        content:
          "دليل رقمي محلي لأرقام الصنايعية والحرفيين وأصحاب الخدمات في القرى والمناطق المصرية مع الاتصال المباشر والواتساب.",
      },
      { property: "og:title", content: "أهل الصنعة — دليل خدمات القرية" },
      {
        property: "og:description",
        content:
          "دليل رقمي محلي لأرقام الصنايعية والحرفيين وأصحاب الخدمات في القرى والمناطق المصرية مع الاتصال المباشر والواتساب.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [areaId, setAreaId] = useState("");

  // Consolidated single query for homepage data (scoped to village if selected)
  const { data: homeData, isLoading } = useQuery(homepageDataQuery(areaId || undefined));

  // Synchronize React Query cache for subcomponents
  useEffect(() => {
    if (homeData) {
      if (homeData.categories) queryClient.setQueryData(categoriesQuery.queryKey, homeData.categories);
      if (homeData.areas) queryClient.setQueryData(areasQuery.queryKey, homeData.areas);
      if (homeData.settings) queryClient.setQueryData(settingsQuery.queryKey, homeData.settings);
    }
  }, [homeData, queryClient]);

  const categories = homeData?.categories ?? [];
  const areas = homeData?.areas ?? [];
  const catCounts = homeData?.category_counts ?? {};
  const catAvailability = homeData?.category_availability ?? {};
  const ratings = homeData?.ratings ?? {};

  // Sort areas alphabetically in Arabic
  const sortedAreas = [...areas].sort((a, b) => a.name.localeCompare(b.name, "ar"));

  // Village persistence in localStorage (read after mount)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("ahl_village");
      if (stored && areas.length > 0) {
        const exists = areas.some((a) => a.id === stored);
        if (exists) {
          setAreaId(stored);
        }
      }
    } catch {
      // Ignore read errors
    }
  }, [areas]);

  const handleAreaChange = (newAreaId: string) => {
    setAreaId(newAreaId);
    try {
      if (newAreaId) {
        localStorage.setItem("ahl_village", newAreaId);
      } else {
        localStorage.removeItem("ahl_village");
      }
    } catch {
      // Ignore write errors
    }
  };

  const featured = homeData?.featured_providers ?? [];
  const popular = homeData?.popular_providers ?? [];
  const topRated = homeData?.top_rated_providers ?? [];
  type ShowcaseTab = "featured" | "popular" | "top_rated";
  const [showcaseTab, setShowcaseTab] = useState<ShowcaseTab>("featured");
  const [userPickedTab, setUserPickedTab] = useState(false);

  useEffect(() => {
    if (!userPickedTab) {
      if (featured.length > 0) {
        setShowcaseTab("featured");
      } else if (popular.length > 0) {
        setShowcaseTab("popular");
      } else if (topRated.length > 0) {
        setShowcaseTab("top_rated");
      }
    }
  }, [featured.length, popular.length, topRated.length, userPickedTab]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/search", search: { q: search || undefined } });
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl px-4">
        {/* Hero Section */}
        <section className="pt-6">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            محتاج خدمة في قريتك؟
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            كل أرقام الصنايعية والخدمات في مكان واحد. اتصل أو كلّمه واتساب مباشرة.
          </p>

          {/* Compact Search & Village Selector Row (48px high, gap-2) */}
          <form onSubmit={submit} className="mt-4 flex items-center gap-2">
            {/* Search Field (flex-1) */}
            <div className="surface flex-1 min-w-0 flex items-center h-12 rounded-2xl border border-border px-3 focus-within:border-primary transition-all">
              <Search className="size-5 shrink-0 text-muted-foreground ml-2" />
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={60}
                className="w-full min-w-0 bg-transparent text-[15px] sm:text-base outline-none placeholder:text-[15px] placeholder:text-muted-foreground text-foreground"
                placeholder="ابحث عن خدمة أو اسم"
              />
              <button
                type="submit"
                aria-label="بحث"
                className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground hover:brightness-105 active:scale-95 transition-all shadow-xs mr-0.5"
              >
                <Search className="size-4.5" />
              </button>
            </div>

            {/* Village Selector (native select styled as button) */}
            <div className="relative h-12 min-w-[7.5rem] max-w-[42%] shrink-0">
              <MapPin className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-primary shrink-0 z-10" />
              <select
                value={areaId}
                onChange={(e) => handleAreaChange(e.target.value)}
                aria-label="اختر القرية"
                suppressHydrationWarning
                className="surface h-12 w-full appearance-none rounded-2xl border border-border bg-card pr-8.5 pl-7 text-[15px] font-bold text-foreground outline-none focus:border-primary truncate cursor-pointer transition-all shadow-xs"
              >
                <option value="">كل البلاد</option>
                {sortedAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground shrink-0 z-10" />
            </div>
          </form>

          {/* Quick Filter Badges (without home area filter) */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5">
            <Link
              to="/search"
              search={{ filter: "available_now" }}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-success/30 bg-success/10 px-4 py-2 text-sm font-extrabold text-success hover:bg-success/20 transition-all"
            >
              <span className="size-2 rounded-full bg-success inline-block shrink-0" />
              <span>متاح الآن فقط</span>
            </Link>

            <Link
              to="/search"
              search={{ filter: "emergency_now" }}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-extrabold text-warning hover:bg-warning/20 transition-all"
            >
              <Zap className="size-4 fill-current shrink-0" />
              <span>خدمة طوارئ ٢٤ ساعة</span>
            </Link>
          </div>
        </section>

        {/* Categories Section - positioned directly below search & filters */}
        <section className="pt-8">
          <div className="mb-3 space-y-1.5">
            <h2 className="text-lg sm:text-xl font-extrabold text-foreground">الأقسام والخدمات</h2>
            {/* Semantic legend: dots + text */}
            <div className="flex items-center gap-3.5 text-xs font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 text-success">
                <span className="size-2 rounded-full bg-success inline-block shrink-0" aria-hidden="true" />
                <span>متاح الآن</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <span className="size-2 rounded-full bg-foreground inline-block shrink-0" aria-hidden="true" />
                <span>غير متاح</span>
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 sm:gap-2.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="surface h-28 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 sm:gap-2.5">
              {categories.map((c) => {
                const avail = catAvailability[c.id];
                const total = avail?.total ?? catCounts[c.id] ?? 0;
                const openCount = avail?.open ?? 0;
                const otherCount = avail?.other ?? (total - openCount);
                const hasAnyHours = avail?.hasAnyHours ?? false;

                return (
                  <Link
                    key={c.id}
                    to="/category/$id"
                    params={{ id: c.id }}
                    search={{ area: areaId || undefined }}
                    className="surface group relative flex flex-col items-center justify-between p-2 sm:p-2.5 text-center active:scale-[0.98] hover:border-primary/50 hover:shadow-xs transition-all rounded-2xl min-h-[108px] sm:min-h-[114px]"
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110 shrink-0">
                      <CategoryIcon name={c.icon} className="size-5" />
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold leading-tight text-foreground line-clamp-2 min-h-[2rem] sm:min-h-[2.25rem] flex items-center justify-center w-full my-1 px-0.5">
                      {c.name}
                    </span>
                    <div className="flex items-center justify-center min-h-[1.25rem]">
                      {total > 0 ? (
                        hasAnyHours ? (
                          <span className="flex items-center justify-center gap-2 text-xs sm:text-sm font-bold">
                            <span className="inline-flex items-center gap-1 text-success">
                              <span className="size-1.5 rounded-full bg-success inline-block shrink-0" aria-hidden="true" />
                              <span>{openCount}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-foreground">
                              <span className="size-1.5 rounded-full bg-foreground inline-block shrink-0" aria-hidden="true" />
                              <span>{otherCount}</span>
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs sm:text-sm font-bold text-muted-foreground">
                            {total}
                          </span>
                        )
                      ) : areaId ? (
                        <span className="text-muted-foreground/80 font-medium text-[11px] sm:text-xs">لا يوجد في بلدك</span>
                      ) : (
                        <span className="text-muted-foreground/70 font-normal text-[11px] sm:text-xs">قريباً</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Showcase Section: خدمات مميزة | الأكثر طلباً | الأعلى تقييماً */}
        <section className="pt-8">
          <div className="mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Tabs Row */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => {
                  setUserPickedTab(true);
                  setShowcaseTab("featured");
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-extrabold transition-all shrink-0 ${
                  showcaseTab === "featured"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "surface text-muted-foreground hover:text-foreground hover:border-primary/40 border border-border"
                }`}
              >
                <Sparkles className={`size-4 shrink-0 ${showcaseTab === "featured" ? "text-primary-foreground" : "text-amber-500"}`} />
                <span>خدمات مميزة</span>
                {featured.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                      showcaseTab === "featured"
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {featured.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setUserPickedTab(true);
                  setShowcaseTab("popular");
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-extrabold transition-all shrink-0 ${
                  showcaseTab === "popular"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "surface text-muted-foreground hover:text-foreground hover:border-primary/40 border border-border"
                }`}
              >
                <Flame className={`size-4 shrink-0 ${showcaseTab === "popular" ? "text-primary-foreground" : "text-orange-500"}`} />
                <span>الأكثر طلباً</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUserPickedTab(true);
                  setShowcaseTab("top_rated");
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-extrabold transition-all shrink-0 ${
                  showcaseTab === "top_rated"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "surface text-muted-foreground hover:text-foreground hover:border-primary/40 border border-border"
                }`}
              >
                <Star className={`size-4 shrink-0 ${showcaseTab === "top_rated" ? "text-primary-foreground fill-current" : "text-amber-400 fill-amber-400"}`} />
                <span>الأعلى تقييماً</span>
              </button>
            </div>

            <Link to="/search" className="text-xs sm:text-[14px] font-bold text-primary hover:underline shrink-0 mr-auto sm:mr-0">
              عرض كل الصنايعية ←
            </Link>
          </div>

          {/* Subtitle helper based on current tab criteria */}
          <p className="text-xs text-muted-foreground mb-3 font-medium">
            {showcaseTab === "featured" && "خدمات وصناع مختارون ومميزون من إدارة الدليل."}
            {showcaseTab === "popular" && "أكثر الخدمات طلباً وتواصلاً بالاتصال والواتساب بناءً على إحصائيات الدليل."}
            {showcaseTab === "top_rated" && "أعلى الصنايعية تقييماً بناءً على تجارب العملاء الإيجابية المعتمدة."}
          </p>

          {/* Provider Cards List */}
          {(() => {
            const list =
              showcaseTab === "featured"
                ? featured
                : showcaseTab === "popular"
                  ? popular
                  : topRated;

            if (isLoading) {
              return (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="surface h-28 animate-pulse rounded-2xl" />
                  ))}
                </div>
              );
            }

            if (list.length === 0) {
              return (
                <div className="surface rounded-2xl border border-border/80 p-6 text-center space-y-3 shadow-xs">
                  <p className="text-sm font-bold text-muted-foreground">
                    {showcaseTab === "featured"
                      ? "لا توجد خدمات محددة كمميزة حالياً في هذه المنطقة من قبل الإدارة."
                      : showcaseTab === "popular"
                        ? "لا توجد إحصائيات تفاعل كافية بعد لهذه المنطقة."
                        : "لا توجد تقييمات كافية بعد لهذه المنطقة."}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {showcaseTab === "featured" && popular.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserPickedTab(true);
                          setShowcaseTab("popular");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary px-3.5 py-2 text-xs font-bold transition-colors"
                      >
                        <Flame className="size-3.5" />
                        <span>تصفح الأكثر طلباً ({popular.length})</span>
                      </button>
                    )}
                    {showcaseTab === "featured" && topRated.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserPickedTab(true);
                          setShowcaseTab("top_rated");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 px-3.5 py-2 text-xs font-bold transition-colors"
                      >
                        <Star className="size-3.5 fill-current" />
                        <span>تصفح الأعلى تقييماً ({topRated.length})</span>
                      </button>
                    )}
                    <Link
                      to="/search"
                      className="inline-flex items-center gap-1 rounded-xl border border-border px-3.5 py-2 text-xs font-bold text-foreground hover:bg-secondary transition-colors"
                    >
                      تصفح كل الخدمات
                    </Link>
                  </div>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {list.map((p) => (
                  <ProviderCard key={p.id} provider={p} ratingSummary={ratings[p.id]} />
                ))}
              </div>
            );
          })()}
        </section>

        {/* Single Merged Join & Suggest Card */}
        <CommunityActionsCard categories={categories} areas={areas} />
      </main>

      <SiteFooter />
    </div>
  );
}

function CommunityActionsCard({
  categories,
  areas,
}: {
  categories: { id: string; name: string }[];
  areas: { id: string; name: string }[];
}) {
  const [activeTab, setActiveTab] = useState<"nominate" | "suggest" | null>(null);

  // Suggest state
  const [suggestName, setSuggestName] = useState("");
  const [suggestHp, setSuggestHp] = useState("");
  const [suggestBusy, setSuggestBusy] = useState(false);

  async function sendSuggest(e: React.FormEvent) {
    e.preventDefault();
    const v = suggestName.trim();
    if (v.length < 2) return;
    setSuggestBusy(true);
    const res = await submitPublicForm({
      data: { form: "service_suggestion", name: v.slice(0, 60), website: suggestHp },
    }).catch(() => ({ ok: false as const, code: "error" as const }));
    setSuggestBusy(false);
    if (!res.ok) {
      toast.error(publicFormError(res.code));
      return;
    }
    toast.success("شكراً! تم استلام اقتراحك وسنعمل على توفيره");
    setSuggestName("");
    setActiveTab(null);
  }

  return (
    <section className="surface mt-8 overflow-hidden rounded-2xl border border-border p-4 sm:p-6 shadow-xs transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-extrabold text-foreground">
            تعرف حد شاطر بيقدّم خدمة؟
          </h3>
          <p className="mt-1 text-[15px] text-muted-foreground">
            رشّح صنايعي موثوق لقريتك أو اقترح مهنة جديدة غير متوفرة في الدليل.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab((prev) => (prev === "nominate" ? null : "nominate"))}
            className={`min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-extrabold transition-all shadow-xs ${
              activeTab === "nominate"
                ? "bg-secondary text-foreground border border-border"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            <UserPlus className="size-5" />
            <span>{activeTab === "nominate" ? "إغلاق الترشيح" : "رشّح صنايعي"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab((prev) => (prev === "suggest" ? null : "suggest"))}
            className={`min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-extrabold transition-all shadow-xs ${
              activeTab === "suggest"
                ? "bg-secondary text-foreground border border-border"
                : "border border-border bg-card text-foreground hover:bg-secondary"
            }`}
          >
            <Lightbulb className="size-5 text-warning" />
            <span>{activeTab === "suggest" ? "إغلاق الاقتراح" : "اقترح خدمة"}</span>
          </button>
        </div>
      </div>

      {activeTab === "nominate" && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-base font-extrabold text-foreground">بيانات الصنايعي المرشح للإضافة</h4>
            <button
              type="button"
              onClick={() => setActiveTab(null)}
              className="text-[15px] font-bold text-muted-foreground hover:text-foreground"
            >
              إلغاء
            </button>
          </div>
          <NominateForm
            categories={categories}
            areas={areas}
            onSuccess={() => setActiveTab(null)}
            onCancel={() => setActiveTab(null)}
          />
        </div>
      )}

      {activeTab === "suggest" && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-base font-extrabold text-foreground">اقترح مهنة أو خدمة غير متوفرة في الدليل</h4>
            <button
              type="button"
              onClick={() => setActiveTab(null)}
              className="text-[15px] font-bold text-muted-foreground hover:text-foreground"
            >
              إلغاء
            </button>
          </div>
          <form onSubmit={sendSuggest} className="grid gap-3">
            <input
              value={suggestHp}
              onChange={(e) => setSuggestHp(e.target.value)}
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />
            <input
              value={suggestName}
              onChange={(e) => setSuggestName(e.target.value)}
              maxLength={60}
              placeholder="مثال: تصليح غسالات، دكتور أطفال، كهربائي منازل..."
              className="min-h-[48px] rounded-xl border border-border bg-card px-3.5 py-2.5 text-[15px] sm:text-base text-foreground placeholder:text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary"
              required
            />
            <div className="flex gap-2.5">
              <button
                disabled={suggestBusy}
                className="min-h-[48px] flex-1 rounded-xl bg-primary px-5 py-2.5 text-base font-extrabold text-primary-foreground disabled:opacity-60 shadow-xs hover:bg-primary/90 transition-all"
              >
                {suggestBusy ? "جاري الإرسال..." : "إرسال الاقتراح"}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab(null)}
                className="min-h-[48px] rounded-xl border border-border px-5 py-2.5 text-base font-bold hover:bg-secondary transition-colors"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function NominateForm({
  categories,
  areas,
  onSuccess,
  onCancel,
}: {
  categories: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const empty = {
    name: "",
    phone: "",
    whatsapp: "",
    category_id: "",
    area_id: "",
    description: "",
    services: "",
  };
  const [f, setF] = useState(empty);
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setF({ ...f, [k]: e.target.value });

  const cls = "min-h-[48px] rounded-xl border border-border bg-card px-3.5 py-2.5 text-[15px] sm:text-base text-foreground outline-none focus:border-primary placeholder:text-[15px] placeholder:text-muted-foreground";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2 || !f.phone.trim() || !f.category_id || !f.area_id) {
      toast.error("يرجى ملء الاسم والتليفون والقسم والمنطقة");
      return;
    }
    setBusy(true);
    const res = await submitPublicForm({
      data: {
        form: "provider_application",
        website: hp,
        ...f,
        whatsapp: f.whatsapp || undefined,
        description: f.description || undefined,
        services: f.services || undefined,
      },
    }).catch(() => ({ ok: false as const, code: "error" as const }));
    setBusy(false);
    if (!res.ok) {
      toast.error(publicFormError(res.code));
      return;
    }
    toast.success("شكراً لك! سيتم مراجعة الطلب ونشر الصنايعي في الدليل");
    setF(empty);
    onSuccess?.();
  }

  return (
    <form onSubmit={send} className="grid gap-3">
      <input
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          value={f.name}
          onChange={set("name")}
          maxLength={80}
          placeholder="اسم الصنايعي أو الورشة *"
          className={cls}
          required
        />
        <input
          value={f.phone}
          onChange={set("phone")}
          maxLength={30}
          inputMode="tel"
          placeholder="رقم الهاتف الأساسي *"
          dir="ltr"
          className={cls}
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <input
          value={f.whatsapp}
          onChange={set("whatsapp")}
          maxLength={30}
          inputMode="tel"
          placeholder="واتساب (اختياري)"
          dir="ltr"
          className={cls}
        />
        <select
          value={f.category_id}
          onChange={set("category_id")}
          className={cls}
          required
        >
          <option value="">اختر المهنة/القسم *</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={f.area_id}
          onChange={set("area_id")}
          className={cls}
          required
        >
          <option value="">اختر القرية/المنطقة *</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <input
        value={f.services}
        onChange={set("services")}
        maxLength={300}
        placeholder="أبرز الخدمات التي يقدمها (اختياري)"
        className={cls}
      />
      <textarea
        value={f.description}
        onChange={set("description")}
        maxLength={500}
        rows={2}
        placeholder="نبذة أو ملاحظات إضافية (اختياري)"
        className={cls}
      />
      <div className="flex items-center gap-2.5 pt-1">
        <button
          disabled={busy}
          className="min-h-[48px] flex-1 rounded-xl bg-primary px-5 py-2.5 text-base font-extrabold text-primary-foreground disabled:opacity-60 shadow-xs hover:bg-primary/90 transition-all"
        >
          {busy ? "جاري الإرسال..." : "إرسال بيانات الترشيح"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] rounded-xl border border-border px-5 py-2.5 text-base font-bold hover:bg-secondary transition-colors"
          >
            إلغاء
          </button>
        )}
      </div>
    </form>
  );
}
