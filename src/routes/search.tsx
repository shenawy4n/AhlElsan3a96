import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { track } from "@/lib/track";
import {
  ArrowRight,
  Search as SearchIcon,
  X,
  Loader2,
  Zap,
  Clock,
  PhoneCall,
  UserPlus,
  HelpCircle,
} from "lucide-react";
import { areasQuery, categoriesQuery, settingsQuery, providersQuery } from "@/lib/directory";
import { ProviderCard } from "@/components/ProviderCard";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AvailabilityFilter, type AvailabilityFilterMode } from "@/components/AvailabilityFilter";
import {
  isOpenNow,
  hasWorkingHoursSet,
  getOpeningTimeText,
  isProviderAvailableNow,
  isProviderEmergency24h,
} from "@/lib/working-hours";
import { useDebounce } from "@/hooks/useDebounce";
import { ZeroSearchResults } from "@/components/ZeroSearchResults";
import { submitPublicForm, publicFormError } from "@/lib/public-forms.functions";
import { toast } from "sonner";

type SearchParams = {
  q?: string | undefined;
  area?: string | undefined;
  filter?: AvailabilityFilterMode | undefined;
};

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    ...(typeof s['q'] === "string" && s['q'] ? { q: s['q'] } : {}),
    ...(typeof s['area'] === "string" && s['area'] ? { area: s['area'] } : {}),
    ...(s['filter'] === "available_now" || s['filter'] === "emergency_now" || s['filter'] === "all"
      ? { filter: s['filter'] }
      : {}),
  }),
  loader: async ({ context }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(areasQuery),
        context.queryClient.ensureQueryData(categoriesQuery),
        context.queryClient.ensureQueryData(settingsQuery),
      ]);
    } catch {
      // Fall through to component
    }
  },
  head: () => ({
    meta: [
      { title: "نتائج البحث — أهل الصنعة" },
      { name: "description", content: "ابحث عن صنايعي أو خدمة في قريتك واتصل به مباشرة." },
      { property: "og:title", content: "نتائج البحث — أهل الصنعة" },
      { property: "og:description", content: "ابحث عن صنايعي أو خدمة في قريتك." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const params = Route.useSearch();
  const [q, setQ] = useState(params.q ?? "");
  const [area, setArea] = useState(params.area ?? "");
  const [filterMode, setFilterMode] = useState<AvailabilityFilterMode>(params.filter || "all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Emergency nomination inline form state
  const [showEmergencyNominate, setShowEmergencyNominate] = useState(false);
  const [emergencyForm, setEmergencyForm] = useState({ name: "", phone: "", whatsapp: "" });
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const [emergencyDone, setEmergencyDone] = useState(false);

  // Debounce search query by 400ms to avoid network queries on every keystroke
  const debouncedQ = useDebounce(q, 400);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, area]);

  useEffect(() => {
    const t = debouncedQ.trim();
    if (t.length < 2) return;
    const h = setTimeout(() => track("search", { query: t }), 1200);
    return () => clearTimeout(h);
  }, [debouncedQ]);

  const areas = useQuery(areasQuery);
  const categories = useQuery(categoriesQuery);
  const results = useQuery(
    providersQuery({
      search: debouncedQ || undefined,
      areaId: area || undefined,
      filterMode,
      limit: page * PAGE_SIZE,
    })
  );

  const isDebouncing = q !== debouncedQ;
  const isSearching = isDebouncing || results.isFetching;

  const allProviders = results.data?.items ?? [];
  const totals = results.data?.totals ?? {
    all: 0,
    openNow: 0,
    closedNow: 0,
    hoursNotSet: 0,
    emergency24: 0,
  };

  const counts = useMemo(() => {
    return {
      all: totals.all,
      availableNow: totals.openNow,
      emergencyNow: totals.emergency24,
    };
  }, [totals]);

  // Grouping for available_now mode
  const availableGroups = useMemo(() => {
    const openNow = allProviders.filter(
      (p) => Boolean(p.is_emergency_24h || isProviderEmergency24h(p.working_hours)) || isOpenNow(p.working_hours) === true
    );
    const closedNow = allProviders.filter(
      (p) =>
        !p.is_emergency_24h &&
        !isProviderEmergency24h(p.working_hours) &&
        isOpenNow(p.working_hours) === false
    );
    const notSet = allProviders.filter(
      (p) =>
        !p.is_emergency_24h &&
        !isProviderEmergency24h(p.working_hours) &&
        isOpenNow(p.working_hours) === null
    );

    return { openNow, closedNow, notSet };
  }, [allProviders]);

  const handleEmergencyNominateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emergencyForm.name.trim() || !emergencyForm.phone.trim()) {
      toast.error("يرجى كتابة الاسم ورقم الهاتف");
      return;
    }
    setEmergencyBusy(true);
    try {
      const res = await submitPublicForm({
        data: {
          form: "provider_application",
          name: emergencyForm.name.trim(),
          phone: emergencyForm.phone.trim(),
          whatsapp: emergencyForm.whatsapp.trim() || undefined,
          area_id: area || undefined,
        },
      });
      if (!res.ok) {
        toast.error(publicFormError(res.code));
      } else {
        toast.success("شكراً لك! استلمنا بيانات تسجيل خدمة الطوارئ وسيتم التواصل معك.");
        setEmergencyDone(true);
      }
    } catch {
      toast.error("حدث خطأ أثناء الإرسال، يرجى المحاولة لاحقاً");
    } finally {
      setEmergencyBusy(false);
    }
  };

  const selectedAreaName = areas.data?.find((a) => a.id === area)?.name;

  return (
    <div className="min-h-screen bg-background pb-12">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pt-5">
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
          <ArrowRight className="size-4" /> الرئيسية
        </Link>

        {/* Search Input with Debounce feedback and clear button */}
        <div className="surface mb-3 flex items-center gap-3 px-4 py-3.5">
          {isSearching ? (
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
          ) : (
            <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={60}
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            placeholder="ابحث باسم الصنايعي أو الخدمة"
            suppressHydrationWarning
          />
          {q.trim() && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              aria-label="مسح البحث"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Area Dropdown */}
        <div className="surface mb-4 px-4 py-2.5">
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-full bg-transparent py-1 text-base outline-none cursor-pointer"
          >
            <option value="">كل البلاد</option>
            {(areas.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Availability / Emergency Filters */}
        <div className="mb-5">
          <AvailabilityFilter
            currentMode={filterMode}
            onModeChange={setFilterMode}
            counts={counts}
          />
        </div>

        {results.isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="mx-auto size-6 animate-spin text-primary mb-2" />
            <p className="text-sm font-bold">جاري البحث عن الصنايعية…</p>
          </div>
        ) : results.isError ? (
          <div className="py-12 text-center space-y-4">
            <p className="text-base font-extrabold text-destructive">حدث خطأ أثناء تحميل البيانات</p>
            <p className="text-sm text-muted-foreground">تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى.</p>
            <button
              type="button"
              onClick={() => results.refetch()}
              className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-primary px-6 py-2.5 text-base font-extrabold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs cursor-pointer"
            >
              حاول تاني
            </button>
          </div>
        ) : totals.all === 0 ? (
          /* Truly 0 providers match query/village */
          <div className="space-y-4">
            {area && (
              <div className="surface flex items-center justify-between p-4 text-xs sm:text-sm">
                <span className="text-muted-foreground font-medium">
                  لا يوجد نتائج مطابقة في «{selectedAreaName || "البلد المحددة"}».
                </span>
                <button
                  type="button"
                  onClick={() => setArea("")}
                  className="font-bold text-primary underline cursor-pointer"
                >
                  البحث في كل البلاد
                </button>
              </div>
            )}
            <ZeroSearchResults
              query={debouncedQ}
              areaId={area}
              filterMode={filterMode}
              onClearArea={() => setArea("")}
              onClearFilter={() => setFilterMode("all")}
              onClearQuery={() => setQ("")}
              categories={categories.data ?? []}
              areas={areas.data ?? []}
            />
          </div>
        ) : filterMode === "available_now" ? (
          /* Available Now 3-Section View: Only non-empty sections displayed */
          <div className="space-y-8">
            {/* If openNow is 0, show info line on top */}
            {totals.openNow === 0 && (
              <div className="surface rounded-2xl border border-border p-4 text-center text-sm font-bold text-muted-foreground shadow-xs">
                مفيش صنايعي متاح دلوقتي حسب المواعيد المسجلة
              </div>
            )}

            {/* Section 1: Open Now */}
            {availableGroups.openNow.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border pb-2 text-sm font-black text-foreground">
                  <span className="size-2.5 rounded-full bg-success inline-block shrink-0" />
                  <h3>متاحين دلوقتي ({totals.openNow})</h3>
                </div>
                <div className="space-y-3">
                  {availableGroups.openNow.map((p) => (
                    <ProviderCard key={p.id} provider={p} />
                  ))}
                </div>
              </section>
            )}

            {/* Section 2: Closed Now with Opening Time Text */}
            {availableGroups.closedNow.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2 text-sm font-black text-foreground">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-muted-foreground" />
                    <h3>مغلق حالياً ({totals.closedNow})</h3>
                  </div>
                  <span className="text-xs font-normal text-muted-foreground">
                    لديهم مواعيد عمل محددة
                  </span>
                </div>
                <div className="space-y-3">
                  {availableGroups.closedNow.map((p) => {
                    const openText = getOpeningTimeText(p.working_hours);
                    return (
                      <div key={p.id} className="space-y-1">
                        {openText && (
                          <div className="flex items-center justify-between px-2 text-xs font-bold text-muted-foreground">
                            <span className="text-muted-foreground">مغلق حالياً</span>
                            <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-extrabold text-foreground">
                              {openText}
                            </span>
                          </div>
                        )}
                        <ProviderCard provider={p} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Section 3: Hours Not Set with Note */}
            {availableGroups.notSet.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2 text-sm font-black text-foreground">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="size-4 text-muted-foreground" />
                    <h3>مواعيدهم غير محددة ({totals.hoursNotSet})</h3>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                    اتصل واسأل
                  </span>
                </div>
                <p className="text-xs text-muted-foreground px-1">
                  صنايعية نشطون في منطقتك ولكن لم يسجلوا مواعيد أسبوعية ثابتة — يمكنك الاتصال بهم مباشرة للاستفسار.
                </p>
                <div className="space-y-3">
                  {availableGroups.notSet.map((p) => (
                    <ProviderCard key={p.id} provider={p} />
                  ))}
                </div>
              </section>
            )}

            {allProviders.length < totals.all && (
              <div className="pt-4 text-center">
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={results.isFetching}
                  className="min-h-[48px] rounded-2xl border border-border bg-card px-6 py-2.5 text-base font-extrabold text-foreground hover:bg-secondary active:scale-[0.98] transition-all shadow-xs disabled:opacity-60 cursor-pointer"
                >
                  {results.isFetching ? "جاري التحميل..." : "عرض المزيد من الصنايعية"}
                </button>
              </div>
            )}
          </div>
        ) : filterMode === "emergency_now" ? (
          /* Emergency 24h Filter Mode */
          totals.emergency24 > 0 ? (
            <div className="space-y-3">
              {allProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} />
              ))}
              {allProviders.length < totals.emergency24 && (
                <div className="pt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={results.isFetching}
                    className="min-h-[48px] rounded-2xl border border-border bg-card px-6 py-2.5 text-base font-extrabold text-foreground hover:bg-secondary active:scale-[0.98] transition-all shadow-xs disabled:opacity-60 cursor-pointer"
                  >
                    {results.isFetching ? "جاري التحميل..." : "عرض المزيد من الصنايعية"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Friendly Empty State for Emergency */
            <div className="surface rounded-2xl p-6 sm:p-8 text-center space-y-4">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning/15 text-warning ring-1 ring-warning/30">
                <Zap className="size-7 fill-current" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-extrabold text-foreground">
                  لسه مفيش خدمة طوارئ ٢٤ ساعة مسجلة
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {area
                    ? `لا توجد خدمات طوارئ ٢٤ ساعة مسجلة حالياً في ${selectedAreaName || "هذه القرية"}.`
                    : "لا توجد خدمات طوارئ ٢٤ ساعة مسجلة حالياً في هذا البحث."}
                </p>
              </div>

              {/* Two actions: Browse all providers & Register as emergency */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs cursor-pointer"
                >
                  عرض كل الصنايعية ({totals.all})
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmergencyNominate(!showEmergencyNominate)}
                  className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-extrabold text-foreground hover:bg-secondary transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  <UserPlus className="size-4" />
                  <span>{showEmergencyNominate ? "إلغاء التسجيل" : "سجّل خدمتك كطوارئ"}</span>
                </button>
              </div>

              {/* Inline quick registration form */}
              {showEmergencyNominate && (
                <div className="mt-6 rounded-2xl border border-warning/30 bg-warning/5 p-4 text-start">
                  <h4 className="text-sm font-black text-foreground mb-1 flex items-center gap-2">
                    <Zap className="size-4 text-warning fill-current" />
                    <span>تسجيل خدمة طوارئ ٢٤ ساعة</span>
                  </h4>
                  <p className="text-xs text-muted-foreground mb-4">
                    إذا كنت تقدم خدمة طوارئ ٢٤ ساعة في قريتك، اترك بياناتك وسنقوم بتفعيلها فوراً.
                  </p>

                  {emergencyDone ? (
                    <div className="rounded-xl bg-success/15 border border-success/30 p-4 text-center text-xs font-bold text-success">
                      ✓ تم استلام بياناتك بنجاح! سنقوم بمراجعتها والتواصل معك لتفعيل علامة الطوارئ.
                    </div>
                  ) : (
                    <form onSubmit={handleEmergencyNominateSubmit} className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">الاسم أو اسم الخدمة</label>
                        <input
                          type="text"
                          required
                          value={emergencyForm.name}
                          onChange={(e) => setEmergencyForm({ ...emergencyForm, name: e.target.value })}
                          placeholder="مثال: سباكة طوارئ أحمد"
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-foreground mb-1">رقم الهاتف</label>
                          <input
                            type="tel"
                            dir="ltr"
                            required
                            value={emergencyForm.phone}
                            onChange={(e) => setEmergencyForm({ ...emergencyForm, phone: e.target.value })}
                            placeholder="01xxxxxxxxx"
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-foreground mb-1">رقم واتساب (اختياري)</label>
                          <input
                            type="tel"
                            dir="ltr"
                            value={emergencyForm.whatsapp}
                            onChange={(e) => setEmergencyForm({ ...emergencyForm, whatsapp: e.target.value })}
                            placeholder="01xxxxxxxxx"
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={emergencyBusy}
                        className="w-full rounded-xl bg-primary py-2.5 text-xs font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer"
                      >
                        {emergencyBusy ? "جاري الإرسال..." : "إرسال وتأكيد خدمة الطوارئ"}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )
        ) : (
          /* Default "All" list */
          <>
            <div className="space-y-3">
              {allProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} />
              ))}
            </div>

            {allProviders.length < totals.all && (
              <div className="pt-4 text-center">
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={results.isFetching}
                  className="min-h-[48px] rounded-2xl border border-border bg-card px-6 py-2.5 text-base font-extrabold text-foreground hover:bg-secondary active:scale-[0.98] transition-all shadow-xs disabled:opacity-60 cursor-pointer"
                >
                  {results.isFetching ? "جاري التحميل..." : "عرض المزيد من الصنايعية"}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
