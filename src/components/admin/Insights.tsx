import { ChangePassword } from "./ChangePassword";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { Phone, PhoneCall, MessageCircle, Eye, Search, Upload, Image as ImageIcon, Trash2, Loader2, FileText, Info, Shield, Share2, Globe, Check, X as XIcon, Lightbulb, Clock, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/directory";
import { ExperienceManager } from "./Lists";
import { useAll, RangePicker, rangeStart, StatCard, input, btn, btnGhost, type Range } from "./shared";
import { adminListReviews } from "@/lib/reviews.functions";
import { ConfirmModal, type ConfirmState } from "./ConfirmModal";
import { AdminErrorState } from "./AdminErrorState";
import {
  getSuggestionsAdminFn,
  updateSuggestionStatusAdminFn,
  approveSuggestionAndCreateCategoryAdminFn,
  deleteSuggestionAdminFn,
  getAdminApplicationsServerFn,
  actApplicationAdminFn,
} from "@/lib/admin-actions.functions";

type Ev = { event_type: string; provider_id: string | null; category_id: string | null };

function useEvents(range: Range) {
  return useQuery({
    queryKey: ["admin", "events", range],
    queryFn: async () => {
      const start = rangeStart(range);
      const out: Ev[] = [];
      for (let from = 0; from < 100000; from += 1000) {
        let q = supabase.from("analytics_events").select("event_type,provider_id,category_id").range(from, from + 999);
        if (start) q = q.gte("created_at", start);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
}

export function Overview({ go }: { go: (tab: string, action?: string) => void }) {
  const { providers, categories, areas } = useAll();
  const ev = useEvents("all");
  const rev = useQuery({
    queryKey: ["admin", "reviews"],
    queryFn: async () => {
      const res = await adminListReviews({ data: { status: "all" } });
      return Array.isArray(res) ? res : [];
    },
  });

  const appsCountQuery = useQuery({
    queryKey: ["admin", "counts", "applications"],
    queryFn: async () => {
      const { count } = await supabase.from("provider_applications").select("id", { count: "exact", head: true }).eq("status", "pending");
      return count ?? 0;
    },
  });

  const reportsCountQuery = useQuery({
    queryKey: ["admin", "counts", "reports"],
    queryFn: async () => {
      const { count } = await supabase.from("reports").select("id", { count: "exact", head: true }).in("status", ["new", "reviewing"]);
      return count ?? 0;
    },
  });

  const suggestionsCountQuery = useQuery({
    queryKey: ["admin", "counts", "suggestions"],
    queryFn: async () => {
      const { count } = await supabase.from("service_suggestions").select("id", { count: "exact", head: true }).eq("status", "new");
      return count ?? 0;
    },
  });

  const p = Array.isArray(providers.data) ? providers.data : [];
  const e = Array.isArray(ev.data) ? ev.data : [];
  const rList = Array.isArray(rev.data) ? rev.data : [];
  const pendingReviewsCount = rList.filter((r) => r?.status === "pending").length;
  const approvedReviewsCount = rList.filter((r) => r?.status === "approved").length;
  const appsCount = appsCountQuery.data ?? 0;
  const reportsCount = reportsCountQuery.data ?? 0;
  const suggestionsCount = suggestionsCountQuery.data ?? 0;
  const totalPendingRequests = appsCount + reportsCount + suggestionsCount;

  if (providers.isLoading && !providers.data) {
    return (
      <div className="surface p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="font-bold">جاري تحميل بيانات لوحة التحكم...</p>
      </div>
    );
  }

  if (providers.isError && (!providers.data || (Array.isArray(providers.data) && providers.data.length === 0))) {
    return (
      <AdminErrorState
        title="تعذر تحميل بيانات لوحة التحكم"
        error={providers.error}
        onRetry={() => {
          providers.refetch();
        }}
      />
    );
  }

  const c = (t: string) => e.filter((x) => x.event_type === t).length;
  return (
    <div className="grid gap-5">
      {/* Quick Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => go("providers", "new")} className={btn}>+ إضافة صنايعي</button>
        <button onClick={() => go("categories", "new")} className={btn}>+ إضافة قسم</button>
        <button onClick={() => go("areas")} className={btn}>+ إضافة منطقة</button>
        <button onClick={() => go("requests")} className={`${btnGhost} ${totalPendingRequests > 0 ? "border-warning/40 text-warning font-extrabold" : ""}`}>
          الطلبات والوارد {totalPendingRequests > 0 ? `(${totalPendingRequests})` : ""}
        </button>
        <button onClick={() => go("reviews")} className={`${btnGhost} ${pendingReviewsCount > 0 ? "border-primary/40 text-primary font-extrabold" : ""}`}>
          التقييمات {pendingReviewsCount > 0 ? `(${pendingReviewsCount})` : ""}
        </button>
        <button onClick={() => go("export")} className={btnGhost}>تصدير البيانات</button>
      </div>

      {/* Actionable Alerts for Pending Items if any */}
      {(totalPendingRequests > 0 || pendingReviewsCount > 0) && (
        <div className="surface p-4 border border-warning/30 bg-warning/5 space-y-2.5">
          <p className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warning" />
            تنبيهات تحتاج متابعة من الإدارة:
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {appsCount > 0 && (
              <button
                onClick={() => go("applications")}
                className="px-3 py-1.5 rounded-lg bg-card border border-border font-bold hover:border-primary transition-colors flex items-center gap-1.5"
              >
                <span>📝 طلبات انضمام جديدة:</span>
                <span className="font-extrabold text-primary">{appsCount}</span>
              </button>
            )}
            {reportsCount > 0 && (
              <button
                onClick={() => go("reports")}
                className="px-3 py-1.5 rounded-lg bg-card border border-border font-bold hover:border-destructive transition-colors flex items-center gap-1.5"
              >
                <span>🚨 بلاغات مفتوحة:</span>
                <span className="font-extrabold text-destructive">{reportsCount}</span>
              </button>
            )}
            {suggestionsCount > 0 && (
              <button
                onClick={() => go("suggestions")}
                className="px-3 py-1.5 rounded-lg bg-card border border-border font-bold hover:border-primary transition-colors flex items-center gap-1.5"
              >
                <span>💡 اقتراحات خدمات:</span>
                <span className="font-extrabold text-primary">{suggestionsCount}</span>
              </button>
            )}
            {pendingReviewsCount > 0 && (
              <button
                onClick={() => go("reviews")}
                className="px-3 py-1.5 rounded-lg bg-card border border-border font-bold hover:border-warning transition-colors flex items-center gap-1.5"
              >
                <span>⭐ تقييمات قيد المراجعة:</span>
                <span className="font-extrabold text-warning">{pendingReviewsCount}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <StatCard label="إجمالي العمال والمهنيين" value={p.length} />
        <StatCard label="العمال النشطين" value={p.filter((x) => x.status === "active").length} />
        <StatCard label="طلبات التسجيل المعلقة" value={appsCount} />
        <StatCard label="البلاغات المفتوحة" value={reportsCount} />
        <StatCard label="اقتراحات الخدمات" value={suggestionsCount} />
        <StatCard label="تقييمات قيد المراجعة" value={pendingReviewsCount} />
        <StatCard label="تقييمات معتمدة" value={approvedReviewsCount} />
        <StatCard label="إجمالي الأقسام" value={Array.isArray(categories.data) ? categories.data.length : 0} />
        <StatCard label="إجمالي المناطق" value={Array.isArray(areas.data) ? areas.data.length : 0} />
        <StatCard label="مشاهدات الملفات" value={c("profile_view")} />
        <StatCard label="ضغطات الاتصال" value={c("phone_click")} />
        <StatCard label="ضغطات واتساب" value={c("whatsapp_click")} />
      </div>
    </div>
  );
}

type Sort = "profile_view" | "phone_click" | "whatsapp_click";
const KINDS: Sort[] = ["profile_view", "phone_click", "whatsapp_click"];
const blank = () => ({ profile_view: 0, phone_click: 0, whatsapp_click: 0 });
const rate = (clicks: number, views: number) => (views ? `${Math.round((clicks / views) * 100)}%` : "—");

export function Analytics() {
  const [range, setRange] = useState<Range>("30");
  const [sort, setSort] = useState<Sort>("phone_click");
  const { providers, categories } = useAll();
  const ev = useEvents(range);
  const e = Array.isArray(ev.data) ? ev.data : [];
  const provList = Array.isArray(providers.data) ? providers.data : [];
  const catList = Array.isArray(categories.data) ? categories.data : [];

  const { byCat, byProv } = useMemo(() => {
    const provCat = new Map(provList.map((p) => [p.id, p.category_id]));
    const byCat = new Map<string, ReturnType<typeof blank>>();
    const byProv = new Map<string, ReturnType<typeof blank>>();
    for (const x of e) {
      if (!KINDS.includes(x.event_type as Sort)) continue;
      const t = x.event_type as Sort;
      const cat = x.category_id ?? (x.provider_id ? provCat.get(x.provider_id) : undefined);
      if (cat) { const o = byCat.get(cat) ?? blank(); o[t]++; byCat.set(cat, o); }
      if (x.provider_id) { const o = byProv.get(x.provider_id) ?? blank(); o[t]++; byProv.set(x.provider_id, o); }
    }
    return { byCat, byProv };
  }, [e, provList]);

  const cnt = (t: string) => e.filter((x) => x.event_type === t).length;
  const catRows = catList.map((c) => ({ c, n: provList.filter((p) => p.category_id === c.id).length, s: byCat.get(c.id) ?? blank() })).sort((a, b) => b.s[sort] - a.s[sort]);
  const provRows = provList.map((p) => ({ p, s: byProv.get(p.id) ?? blank() }));
  const topBy = (k: Sort) => [...provRows].filter((r) => r.s[k] > 0).sort((a, b) => b.s[k] - a.s[k]).slice(0, 10);
  const provSorted = [...provRows].sort((a, b) => b.s[sort] - a.s[sort]).slice(0, 50);

  if (providers.isError || ev.isError) {
    return (
      <AdminErrorState
        title="تعذر تحميل بيانات الإحصائيات"
        error={providers.error || ev.error}
        onRetry={() => {
          providers.refetch();
          ev.refetch();
        }}
      />
    );
  }

  const th = "p-2 text-start font-bold";
  const sortBtn = (k: Sort, l: string) => <button onClick={() => setSort(k)} className={`${btnGhost} ${sort === k ? "bg-primary text-primary-foreground" : ""}`}>{l}</button>;
  const topList = (k: Sort, title: string, Icon: typeof Phone, empty: string) => {
    const rows = topBy(k);
    return (
      <section className="surface p-4">
        <h2 className="mb-3 text-lg font-extrabold">{title}</h2>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
          <ol className="grid gap-2">
            {rows.map((r, i) => (
              <li key={r.p.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
                <span className="font-bold">{i + 1}. {r.p.name} <span className="text-sm font-normal text-muted-foreground">· {r.p.categories?.name}</span></span>
                <span className="flex items-center gap-1 font-extrabold text-primary"><Icon className="size-4" />{r.s[k]}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  };

  return (
    <div className="grid gap-5">
      <RangePicker value={range} onChange={setRange} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="مشاهدات الملفات" value={cnt("profile_view")} />
        <StatCard label="ضغطات الاتصال" value={cnt("phone_click")} />
        <StatCard label="ضغطات WhatsApp" value={cnt("whatsapp_click")} />
        <StatCard label="عمليات البحث" value={cnt("search")} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {topList("phone_click", "الأكثر ضغطات اتصال", Phone, "مفيش ضغطات اتصال في الفترة دي.")}
        {topList("whatsapp_click", "الأكثر ضغطات WhatsApp", MessageCircle, "مفيش ضغطات واتساب في الفترة دي.")}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-sm"><span className="font-bold">ترتيب حسب:</span>{sortBtn("phone_click", "ضغطات الاتصال")}{sortBtn("profile_view", "المشاهدات")}{sortBtn("whatsapp_click", "WhatsApp")}</div>

      <section className="surface overflow-x-auto p-2">
        <h2 className="p-2 text-lg font-extrabold">حسب القسم</h2>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground"><tr><th className={th}>القسم</th><th className={th}>الصنايعية</th><th className={th}>المشاهدات</th><th className={th}>ضغطات الاتصال</th><th className={th}>ضغطات WhatsApp</th></tr></thead>
          <tbody>{catRows.map((r) => <tr key={r.c.id} className="border-t border-border"><td className="p-2 font-bold">{r.c.name}</td><td className="p-2">{r.n}</td><td className="p-2">{r.s.profile_view}</td><td className="p-2">{r.s.phone_click}</td><td className="p-2">{r.s.whatsapp_click}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="surface overflow-x-auto p-2">
        <h2 className="p-2 text-lg font-extrabold">حسب الصنايعي</h2>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground"><tr><th className={th}>اسم الصنايعي</th><th className={th}>الخدمة/الصنعة</th><th className={th}>عدد المشاهدات</th><th className={th}>ضغطات الاتصال</th><th className={th}>ضغطات WhatsApp</th><th className={th}>نسبة التحويل للاتصال</th></tr></thead>
          <tbody>{provSorted.map((r) => <tr key={r.p.id} className="border-t border-border"><td className="p-2 font-bold">{r.p.name}</td><td className="p-2">{r.p.categories?.name}</td><td className="p-2">{r.s.profile_view}</td><td className="p-2">{r.s.phone_click}</td><td className="p-2">{r.s.whatsapp_click}</td><td className="p-2">{rate(r.s.phone_click, r.s.profile_view)}</td></tr>)}</tbody>
        </table>
      </section>
      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Search className="size-3" /> زياراتك كمسؤول مش بتتحسب. ضغطة "اتصال" معناها إن الزائر ضغط الزرار، مش إن المكالمة تمت.</p>
    </div>
  );
}

type Report = { id: string; reason: string; details: string | null; status: string; created_at: string; provider_id: string; providers: { name: string; status: string } | null };
const R_STATUS: Record<string, string> = { new: "جديد", reviewing: "قيد المراجعة", resolved: "تم الحل", rejected: "مرفوض" };

export function Reports({ onEdit }: { onEdit: (providerId: string) => void }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("open");
  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("reports").select("*, providers(name,status)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Report[];
    },
  });
  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("reports").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries();
  }
  async function hide(pid: string) {
    const { error } = await supabase.from("providers").update({ status: "hidden" }).eq("id", pid);
    if (error) { toast.error(error.message); return; }
    toast.success("اتخفى");
    qc.invalidateQueries();
  }
  const list = data.filter((r) => filter === "all" || (filter === "open" ? r.status === "new" || r.status === "reviewing" : r.status === filter));

  if (isLoading) return <p className="p-6 text-center text-muted-foreground">جاري تحميل البلاغات...</p>;
  if (isError) return <AdminErrorState title="تعذر تحميل البلاغات" error={error} onRetry={() => refetch()} />;
  return (
    <div className="grid gap-3">
      <select value={filter} onChange={(e) => setFilter(e.target.value)} className={input}>
        <option value="open">المفتوحة</option><option value="all">الكل</option>
        {Object.entries(R_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {list.length === 0 ? <p className="p-6 text-center text-muted-foreground">مفيش بلاغات</p> : null}
      {list.map((r) => (
        <div key={r.id} className={`surface p-4 ${r.status === "resolved" || r.status === "rejected" ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-extrabold">{r.providers?.name ?? "—"} {r.providers?.status === "hidden" ? <span className="text-xs text-destructive">(مخفي)</span> : null}</p>
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">{R_STATUS[r.status] ?? r.status}</span>
          </div>
          <p className="mt-1 font-bold text-primary">{r.reason}</p>
          {r.details ? <p className="mt-1 text-sm">{r.details}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("ar-EG")}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.status === "new" ? <button className={btnGhost} onClick={() => setStatus(r.id, "reviewing")}>مراجعة</button> : null}
            <button className={btnGhost} onClick={() => onEdit(r.provider_id)}>تعديل الصنايعي</button>
            {r.providers?.status !== "hidden" ? <button className={btnGhost} onClick={() => hide(r.provider_id)}>إخفاء الصنايعي</button> : null}
            <button className={btnGhost} onClick={() => setStatus(r.id, "resolved")}>تم الحل</button>
            <button className={`${btnGhost} text-destructive`} onClick={() => setStatus(r.id, "rejected")}>رفض</button>
          </div>
        </div>
      ))}
    </div>
  );
}

type SuggestionItem = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

export function Suggestions({ onCreate }: { onCreate?: (name: string) => void }) {
  const qc = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<SuggestionItem | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const { data: suggestions = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "suggestions"],
    queryFn: async () => {
      return await getSuggestionsAdminFn();
    },
    staleTime: 15_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "suggestions"] });
    qc.invalidateQueries({ queryKey: ["admin", "counts", "suggestions"] });
  };

  // Status Labels & styling
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return { label: "معتمد", color: "bg-success/15 text-success border-success/30" };
      case "rejected":
        return { label: "مرفوض", color: "bg-destructive/15 text-destructive border-destructive/30" };
      case "dismissed":
        return { label: "متجاهل", color: "bg-muted text-muted-foreground border-border" };
      case "new":
      default:
        return { label: "جديد", color: "bg-primary/15 text-primary border-primary/30" };
    }
  };

  // Handlers for Detail View Actions
  const handleApprove = (item: SuggestionItem) => {
    setConfirmState({
      open: true,
      title: "تأكيد اعتماد الاقتراح",
      description: `هل ترغب في اعتماد الاقتراح «${item.name}» وإنشاء قسم جديد غير مفعل للمراجعة؟`,
      confirmLabel: "نعم، اعتمد وأنشئ القسم",
      destructive: false,
      onConfirm: async () => {
        setActionBusy(true);
        try {
          const res = await approveSuggestionAndCreateCategoryAdminFn({
            data: { id: item.id, categoryName: item.name },
          });
          if (!(res as any)?.ok) {
            toast.error((res as any)?.message || "تعذر اعتماد الاقتراح");
            return;
          }
          toast.success(`تم اعتماد الاقتراح وإنشاء قسم «${res.name}» (غير مفعل للمراجعة) بنجاح`);
          setSelectedItem(null);
          refresh();
        } catch (err: any) {
          toast.error(err?.message || "حدث خطأ أثناء اعتماد الاقتراح");
        } finally {
          setActionBusy(false);
        }
      },
    });
  };

  const handleReject = (item: SuggestionItem) => {
    setConfirmState({
      open: true,
      title: "تأكيد رفض الاقتراح",
      description: `هل ترغب في تغيير حالة اقتراح «${item.name}» إلى مرفوض؟`,
      confirmLabel: "رفض الاقتراح",
      destructive: true,
      onConfirm: async () => {
        setActionBusy(true);
        try {
          const res = await updateSuggestionStatusAdminFn({
            data: { id: item.id, status: "rejected" },
          });
          if (!(res as any)?.ok) {
            toast.error((res as any)?.message || "تعذر رفض الاقتراح");
            return;
          }
          toast.success("تم تعيين حالة الاقتراح كمرفوض");
          setSelectedItem(null);
          refresh();
        } catch (err: any) {
          toast.error(err?.message || "حدث خطأ أثناء التحديث");
        } finally {
          setActionBusy(false);
        }
      },
    });
  };

  const handleDelete = (item: SuggestionItem) => {
    setConfirmState({
      open: true,
      title: "تأكيد حذف الاقتراح",
      description: `هل أنت متأكد من حذف اقتراح «${item.name}» نهائياً؟`,
      confirmLabel: "نعم، احذف نهائياً",
      destructive: true,
      onConfirm: async () => {
        setActionBusy(true);
        try {
          const res = await deleteSuggestionAdminFn({
            data: { id: item.id },
          });
          if (!(res as any)?.ok) {
            toast.error((res as any)?.message || "تعذر حذف الاقتراح");
            return;
          }
          toast.success("تم حذف الاقتراح بنجاح");
          setSelectedItem(null);
          refresh();
        } catch (err: any) {
          toast.error(err?.message || "حدث خطأ أثناء الحذف");
        } finally {
          setActionBusy(false);
        }
      },
    });
  };

  if (isLoading) {
    return (
      <div className="surface p-12 text-center text-muted-foreground">
        <Loader2 className="mx-auto size-7 animate-spin text-primary mb-3" />
        <p className="text-sm font-bold">جاري تحميل اقتراحات الخدمات…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <AdminErrorState
        title="تعذر تحميل بيانات الاقتراحات"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  if (!suggestions.length) {
    return (
      <div className="surface p-12 text-center text-muted-foreground rounded-2xl">
        <Lightbulb className="mx-auto size-10 opacity-30 mb-2" />
        <p className="font-extrabold text-base text-foreground">لا توجد اقتراحات خدمات حالياً</p>
        <p className="text-xs mt-1">أي اقتراحات يرسلها الأهالي لمهن جديدة ستظهر هنا مباشرة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Suggestions List */}
      <div className="grid gap-2.5 sm:gap-3">
        {suggestions.map((s) => {
          const badge = getStatusBadge(s.status);
          const isSelected = selectedItem?.id === s.id;
          return (
            <div
              key={s.id}
              onClick={() => setSelectedItem(s)}
              className={`surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer hover:border-primary/40 active:scale-[0.99] ${
                isSelected ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-extrabold text-base text-foreground truncate">{s.name}</h4>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold border ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>{new Date(s.created_at).toLocaleDateString("ar-EG")}</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem(s);
                  }}
                  className="rounded-xl bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-xs font-bold text-foreground transition-all cursor-pointer"
                >
                  عرض التفاصيل
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Suggestion Detail View Modal */}
      {selectedItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedItem(null)}
        >
          <div
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            className="surface relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-border p-5 sm:p-6 shadow-2xl text-foreground space-y-5 animate-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Lightbulb className="size-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-foreground">
                    تفاصيل اقتراح الخدمة
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    مراجعة الاقتراح واتخاذ القرار بشأنه
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="grid size-8 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0 cursor-pointer"
                aria-label="إغلاق"
              >
                <XIcon className="size-4.5" />
              </button>
            </div>

            {/* Content Fields */}
            <div className="space-y-3.5 text-sm">
              <div className="rounded-2xl bg-secondary/40 p-3.5 border border-border/50 space-y-1">
                <span className="text-xs font-bold text-muted-foreground block">المهنة أو الخدمة المقترحة:</span>
                <p className="text-base sm:text-lg font-extrabold text-foreground">{selectedItem.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl bg-secondary/30 p-3 border border-border/40">
                  <span className="text-xs font-bold text-muted-foreground block mb-1">تاريخ الإرسال:</span>
                  <span className="font-extrabold text-foreground text-xs">
                    {new Date(selectedItem.created_at).toLocaleString("ar-EG")}
                  </span>
                </div>

                <div className="rounded-2xl bg-secondary/30 p-3 border border-border/40">
                  <span className="text-xs font-bold text-muted-foreground block mb-1">الحالة:</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold border ${
                      getStatusBadge(selectedItem.status).color
                    }`}
                  >
                    {getStatusBadge(selectedItem.status).label}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="border-t border-border pt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {selectedItem.status !== "approved" && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleApprove(selectedItem)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-success text-success-foreground hover:bg-success/90 px-3.5 py-2 text-xs font-extrabold shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle2 className="size-3.5" />
                    <span>اعتماد وإنشاء قسم (غير مفعل)</span>
                  </button>
                )}

                {selectedItem.status !== "rejected" && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleReject(selectedItem)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 text-warning hover:bg-warning/20 px-3 py-2 text-xs font-extrabold transition-all cursor-pointer disabled:opacity-60"
                  >
                    <XCircle className="size-3.5" />
                    <span>رفض الاقتراح</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={actionBusy}
                onClick={() => handleDelete(selectedItem)}
                className="inline-flex items-center gap-1 rounded-xl text-destructive hover:bg-destructive/10 px-3 py-2 text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
              >
                <Trash2 className="size-3.5" />
                <span>حذف</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmState ? (
        <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
      ) : null}
    </div>
  );
}

type Log = { id: string; action: string; target: string | null; admin_email: string | null; created_at: string };

export function AuditLog() {
  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as Log[];
    },
  });
  if (isLoading) return <p className="p-6 text-center text-muted-foreground">جاري تحميل سجل النشاط...</p>;
  if (isError) return <AdminErrorState title="تعذر تحميل سجل النشاط" error={error} onRetry={() => refetch()} />;
  if (!data.length) return <p className="p-6 text-center text-muted-foreground">مفيش تغييرات مسجلة لسه</p>;
  return (
    <div className="surface divide-y divide-border">
      {data.map((l) => {
        const d = new Date(l.created_at);
        return (
          <div key={l.id} className="flex items-start justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p><span className="font-extrabold">{l.action}</span>{l.target ? <>: {l.target}</> : null}</p>
              <p className="truncate text-xs text-muted-foreground" dir="ltr">{l.admin_email ?? "—"}</p>
            </div>
            <div className="shrink-0 text-end text-xs text-muted-foreground">
              <p>{d.toLocaleDateString("ar-EG")}</p>
              <p>{d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const GENERAL_FIELDS: [string, string, string?][] = [
  ["app_name", "اسم التطبيق"],
  ["tagline", "الشعار"],
];

const CONTACT_FIELDS: [string, string, string?, string?][] = [
  ["contact_phone", "رقم الهاتف الأساسي", "ltr", "01012345678"],
  ["contact_secondary_phone", "رقم هاتف إضافي (اختياري)", "ltr", "011..."],
  ["contact_whatsapp", "رقم واتساب للتواصل والمراسلة", "ltr", "010..."],
  ["contact_email", "البريد الإلكتروني (اختياري)", "ltr", "info@example.com"],
  ["contact_address", "المقر أو العنوان / القرية والمركز (اختياري)", "rtl", "مثال: قرية كذا، مركز كذا"],
  ["contact_hours", "مواعيد استقبال الاتصالات (اختياري)", "rtl", "مثال: يومياً من ٩ ص حتى ١١ م"],
  ["contact_facebook", "رابط صفحة أو جروب فيسبوك (اختياري)", "ltr", "https://facebook.com/..."],
  ["contact_telegram", "رابط قناة أو جروب تليجرام (اختياري)", "ltr", "https://t.me/..."],
  ["contact_custom_link", "رابط مخصص إضافي (اختياري)", "ltr", "https://..."],
  ["contact_custom_link_label", "اسم الرابط الإضافي", "rtl", "مثال: صفحتنا على إنستغرام أو جروب القرية"],
];

function fileToOptimizedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === "image/svg+xml") {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 512;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const isPng = file.type === "image/png";
        const format = isPng ? "image/png" : "image/webp";
        resolve(canvas.toDataURL(format, 0.88));
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function Settings() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery(settingsQuery);
  const [vals, setVals] = useState<Record<string, string> | null>(null);
  const v = vals ?? Object.fromEntries(Object.entries(data ?? {}).map(([k, x]) => [k, x ?? ""]));
  const [busy, setBusy] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUrlInput, setLogoUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) return <p className="p-8 text-center text-muted-foreground font-bold">جاري تحميل إعدادات المنصة...</p>;
  if (isError) return <AdminErrorState title="تعذر تحميل إعدادات المنصة" error={error} onRetry={() => refetch()} />;

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.type)) {
      toast.error("يرجى اختيار صورة بصيغة JPG أو PNG أو WEBP أو SVG");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب ألا يتجاوز 5 ميجابايت");
      return;
    }
    setUploadingLogo(true);
    try {
      // 1. Generate optimized data URL
      const dataUrl = await fileToOptimizedDataUrl(file);
      let finalUrl = dataUrl;

      // 2. Try storage upload if available
      try {
        const ext = file.name.split(".").pop() || "png";
        const path = `platform/logo_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("provider-photos").upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });
        if (!uploadError) {
          const { data: pubData } = supabase.storage.from("provider-photos").getPublicUrl(path);
          if (pubData?.publicUrl) {
            finalUrl = pubData.publicUrl;
          }
        }
      } catch {
        // Fallback to optimized data URL if bucket is not configured
      }

      setVals((prev) => ({ ...(prev ?? v), logo_url: finalUrl }));
      await supabase.from("app_settings").upsert({ key: "logo_url", value: finalUrl, updated_at: new Date().toISOString() });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("تم تحديث وحفظ لوجو المنصة بنجاح");
    } catch (err: any) {
      toast.error(err.message || "فشل رفع اللوجو");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function applyDirectLogoUrl() {
    const url = logoUrlInput.trim();
    if (!url) return;
    setBusy(true);
    try {
      await supabase.from("app_settings").upsert({ key: "logo_url", value: url, updated_at: new Date().toISOString() });
      setVals((prev) => ({ ...(prev ?? v), logo_url: url }));
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("تم حفظ رابط اللوجو بنجاح");
      setLogoUrlInput("");
    } catch (err: any) {
      toast.error(err.message || "فشل حفظ اللوجو");
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    setVals((prev) => ({ ...(prev ?? v), logo_url: "" }));
    await supabase.from("app_settings").upsert({ key: "logo_url", value: null, updated_at: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ["settings"] });
    toast.success("تمت إزالة اللوجو والعودة للشعار الافتراضي");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const keysToSave = [
      ...GENERAL_FIELDS.map(([k]) => k),
      ...CONTACT_FIELDS.map(([k]) => k),
      "contact_content",
      "logo_url",
      "default_provider_status",
      "about_content",
      "privacy_content",
      "terms_content",
    ];
    const currentLogoVal = v["logo_url"] !== undefined ? (v["logo_url"]?.trim() || null) : (data?.["logo_url"] || null);
    const rows = keysToSave.map((key) => ({
      key,
      value: key === "logo_url" ? currentLogoVal : (v[key]?.trim() || null),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("app_settings").upsert(rows);
    setBusy(false);
    if (error) { toast.error("ماقدرناش نحفظ الإعدادات، جرّب تاني"); return; }
    toast.success("اتحفظت الإعدادات بنجاح");
    setVals(null);
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  const currentLogo = v["logo_url"] || data?.["logo_url"];
  const appName = v["app_name"] || data?.["app_name"] || "أهل الصنعة";

  return (
    <div className="grid gap-5">
      {/* Brand & Logo Section */}
      <div className="surface p-5 space-y-4">
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <ImageIcon className="size-5 text-primary" />
          لوجو وهوية المنصة
        </h2>
        <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border border-border bg-card">
          <div className="relative shrink-0">
            {currentLogo ? (
              <img
                src={currentLogo}
                alt={appName}
                className="size-20 rounded-2xl object-contain bg-background border border-border shadow-sm p-1"
              />
            ) : (
              <div className="size-20 rounded-2xl bg-primary text-3xl font-extrabold text-primary-foreground grid place-items-center shadow-sm">
                {appName.charAt(0)}
              </div>
            )}
          </div>
          <div className="space-y-2 text-center sm:text-start flex-1 min-w-0">
            <div>
              <p className="font-extrabold text-sm">{currentLogo ? "لوجو مخصص مفعّل" : "الشعار الافتراضي (الحرف الأول)"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                صيغ الصور المدعومة: PNG, JPG, WEBP, SVG (يظهر في الهيدر ومعاينة الموقع). يتم تحسين وحفظ الصورة تلقائياً.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
                id="logo-upload-input"
              />
              <label
                htmlFor="logo-upload-input"
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-xs"
              >
                {uploadingLogo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {currentLogo ? "رفع صورة بديلة من جهازك" : "رفع لوجو من جهازك"}
              </label>

              {currentLogo ? (
                <button
                  type="button"
                  onClick={removeLogo}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs font-bold text-destructive hover:bg-destructive/15 active:scale-95 transition-all"
                >
                  <Trash2 className="size-4" />
                  إزالة اللوجو
                </button>
              ) : null}
            </div>

            {/* Direct URL input fallback */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-border/60">
              <input
                value={logoUrlInput}
                onChange={(e) => setLogoUrlInput(e.target.value)}
                placeholder="أو ضع رابط صورة مباشر (https://...)"
                className="w-full sm:max-w-xs rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                dir="ltr"
              />
              <button
                type="button"
                onClick={applyDirectLogoUrl}
                disabled={!logoUrlInput.trim() || busy}
                className="w-full sm:w-auto rounded-xl border border-border bg-secondary hover:bg-secondary/80 px-3.5 py-1.5 text-xs font-bold disabled:opacity-50 transition-colors"
              >
                تطبيق الرابط
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* General Settings */}
      <form onSubmit={save} className="surface grid gap-6 p-5 sm:p-6">
        {/* Section 1: General Platform Info */}
        <div className="space-y-3">
          <h2 className="text-lg font-extrabold text-foreground">البيانات العامة للمنصة</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {GENERAL_FIELDS.map(([k, l, dir]) => (
              <label key={k} className="grid gap-1 text-sm font-bold">
                {l}
                <input value={v[k] ?? ""} dir={dir} onChange={(e) => setVals({ ...v, [k]: e.target.value })} className={input} maxLength={200} />
              </label>
            ))}
          </div>

          <label className="grid gap-1 text-sm font-bold">
            الحالة الافتراضية للصنايعي الجديد
            <select value={v["default_provider_status"] || "active"} onChange={(e) => setVals({ ...v, default_provider_status: e.target.value })} className={input}>
              <option value="active">ظاهر في الدليل فوراً</option>
              <option value="hidden">مخفي (يحتاج تفعيل يدوي)</option>
            </select>
          </label>
        </div>

        {/* Section 2: Contact Us Page Settings */}
        <div className="pt-4 border-t border-border space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold flex items-center gap-2 text-foreground">
                <PhoneCall className="size-5 text-primary" />
                إدارة صفحة وبيانات «تواصل معنا» (/contact)
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                تحكم في كافة أرقام الهواتف، واتساب، البريد، الروابط، والملاحظات التي تظهر للجمهور في صفحة تواصل معنا.
              </p>
            </div>
            <a
              href="/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20 transition-colors"
            >
              <span>معاينة صفحة تواصل معنا</span>
              <Globe className="size-3.5" />
            </a>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {CONTACT_FIELDS.map(([k, l, dir, placeholder]) => (
              <label key={k} className="grid gap-1 text-sm font-bold">
                {l}
                <input
                  value={v[k] ?? ""}
                  dir={dir}
                  placeholder={placeholder}
                  onChange={(e) => setVals({ ...v, [k]: e.target.value })}
                  className={input}
                  maxLength={300}
                />
              </label>
            ))}
          </div>

          <label className="grid gap-1.5 text-sm font-bold">
            <span>ملاحظات وإرشادات مخصصة لصفحة تواصل معنا (اختياري)</span>
            <textarea
              rows={3}
              value={v["contact_content"] ?? ""}
              onChange={(e) => setVals({ ...v, contact_content: e.target.value })}
              placeholder="اكتب أي تعليمات تظهر في أعلى صفحة تواصل معنا (مثلاً: أوقات الصيانة، طريقة الإبلاغ السريع، إلخ)..."
              className={input}
            />
          </label>
        </div>

        {/* Section 3: Content Management (Pages) */}
        <div className="pt-4 border-t border-border space-y-4">
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            إدارة صفحات المحتوى (من نحن والسياسات)
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            يمكنك تخصيص نصوص هذه الصفحات كما تشاء. إذا تركت أي حقل فارغاً، ستعرض الصفحة المحتوى الاسترشادي الافتراضي الشامل.
          </p>

          <label className="grid gap-1.5 text-sm font-bold">
            <span className="flex items-center gap-1.5">
              <Info className="size-4 text-primary" />
              محتوى صفحة «من نحن» (About Us)
            </span>
            <textarea
              rows={5}
              value={v["about_content"] ?? ""}
              onChange={(e) => setVals({ ...v, about_content: e.target.value })}
              placeholder="اكتب نبذة عن المنصة وفريق العمل وأهداف الخدمة في قريتك ومحافظتك..."
              className={input}
            />
          </label>

          <label className="grid gap-1.5 text-sm font-bold">
            <span className="flex items-center gap-1.5">
              <Shield className="size-4 text-primary" />
              محتوى صفحة «سياسة الخصوصية» (Privacy Policy)
            </span>
            <textarea
              rows={5}
              value={v["privacy_content"] ?? ""}
              onChange={(e) => setVals({ ...v, privacy_content: e.target.value })}
              placeholder="اكتب تفاصيل سياسة الخصوصية وحماية بيانات أرقام الهواتف والتواصل..."
              className={input}
            />
          </label>

          <label className="grid gap-1.5 text-sm font-bold">
            <span className="flex items-center gap-1.5">
              <FileText className="size-4 text-primary" />
              محتوى صفحة «شروط الاستخدام» (Terms of Service)
            </span>
            <textarea
              rows={5}
              value={v["terms_content"] ?? ""}
              onChange={(e) => setVals({ ...v, terms_content: e.target.value })}
              placeholder="اكتب شروط وضوابط استخدام الدليل ومسؤولية الحرفيين والمستخدمين..."
              className={input}
            />
          </label>
        </div>

        <button disabled={busy} className={`${btn} mt-2`}>
          {busy ? "جاري الحفظ..." : "حفظ جميع الإعدادات"}
        </button>
      </form>

      <section className="grid gap-3">
        <h2 className="text-lg font-extrabold">سنوات الخبرة</h2>
        <ExperienceManager />
      </section>
    </div>
  );
}

type App = { id: string; name: string; phone: string; whatsapp: string | null; description: string | null; services: string | null; created_at: string; categories: { name: string } | null; areas: { name: string } | null };

const APP_ERR_PATTERNS: Array<[RegExp, string]> = [
  [/already active|duplicate_phone|مسجل بالفعل/i, "يوجد مقدم خدمة مسجل ومفعل بنفس رقم الهاتف بالفعل"],
  [/not pending|not in pending|اتراجع قبل/i, "تمت مراجعة هذا الطلب من قبل أو لم يعد معلقاً"],
  [/rejection reason|invalid_reason/i, "سبب الرفض مطلوب ويجب ألا يقل عن 3 أحرف"],
  [/Egyptian mobile|invalid_phone/i, "رقم الهاتف غير صالح كمعيار هاتف مصري"],
  [/unauthorized|admin role required/i, "الإجراء يتطلب صلاحيات مسؤول النظام (Admin)"],
  [/not found|غير موجود/i, "طلب الترشيح غير موجود في النظام"],
];

function getAppErrorMessage(err: { message?: string } | null | undefined): string {
  if (!err?.message) return "تعذر إتمام الإجراء، يرجى المحاولة مرة أخرى";
  for (const [pattern, msg] of APP_ERR_PATTERNS) {
    if (pattern.test(err.message)) return msg;
  }
  return err.message;
}

export function Applications() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const apps = useQuery({
    queryKey: ["admin", "applications"],
    queryFn: async () => {
      try {
        const res = await getAdminApplicationsServerFn();
        if (Array.isArray(res)) return res as unknown as App[];
      } catch {
        // Fallback to client query
      }
      const { data, error } = await supabase.from("provider_applications")
        .select("id,name,phone,whatsapp,description,services,created_at,categories(name),areas(name)")
        .eq("status", "pending").order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as App[];
    },
  });

  async function act(id: string, approve: boolean) {
    if (busy) return;
    const reason = "تم رفض الطلب بواسطة الإدارة";
    setBusy(id);

    try {
      // 1. Try server function first for robust authentication & role checks
      try {
        const res = await actApplicationAdminFn({ data: { id, approve, reason } });
        if ((res as any)?.ok) {
          toast.success(approve ? "تم القبول ونشر مقدم الخدمة بنجاح" : "تم رفض الطلب بنجاح");
          qc.invalidateQueries({ queryKey: ["admin"] });
          return;
        }
      } catch (serverErr: any) {
        // If server function threw a meaningful message, parse and show or fall through to RPC
        let parsedMsg: string | null = null;
        try {
          if (serverErr?.message) {
            const parsed = JSON.parse(serverErr.message);
            parsedMsg = parsed.message || parsed.error;
          }
        } catch {}
        if (parsedMsg && !parsedMsg.includes("Unauthorized")) {
          toast.error(parsedMsg);
          return;
        }
      }

      // 2. Fallback to client PostgreSQL RPC
      let res = approve
        ? await supabase.rpc("approve_application", { app_id: id } as any)
        : await supabase.rpc("reject_application", { app_id: id, reason } as any);

      if (res.error && (res.error.code === "PGRST202" || res.error.message?.includes("schema cache"))) {
        res = approve
          ? await supabase.rpc("approve_application", { _id: id } as any)
          : await supabase.rpc("reject_application", { _id: id, _reason: reason } as any);
      }

      if (res.error) {
        toast.error(getAppErrorMessage(res.error));
        return;
      }

      toast.success(approve ? "تم القبول ونشر مقدم الخدمة بنجاح" : "تم رفض الطلب بنجاح");
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ غير متوقع أثناء معالجة الطلب");
    } finally {
      setBusy(null);
    }
  }

  if (apps.isLoading) return <p className="p-8 text-center text-muted-foreground font-bold">جاري التحميل...</p>;
  if (apps.isError) return <AdminErrorState title="تعذر تحميل طلبات انضمام العمال" error={apps.error} onRetry={() => apps.refetch()} />;
  const list = apps.data ?? [];
  if (!list.length) return <p className="text-muted-foreground">لا توجد طلبات جديدة</p>;
  return (
    <div className="grid gap-3">
      {list.map((a) => (
        <div key={a.id} className="surface grid gap-1 p-4">
          <p className="font-extrabold">{a.name}</p>
          <p className="text-sm text-muted-foreground">{a.categories?.name} · {a.areas?.name} · {new Date(a.created_at).toLocaleDateString("ar-EG")}</p>
          <p className="text-sm" dir="ltr">{a.phone}{a.whatsapp ? ` · WA ${a.whatsapp}` : ""}</p>
          {a.description && <p className="text-sm">{a.description}</p>}
          {a.services && <p className="text-sm text-muted-foreground">{a.services}</p>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button disabled={Boolean(busy)} onClick={() => act(a.id, true)} className={btn}>
              {busy === a.id ? "جاري..." : "قبول"}
            </button>
            <button disabled={Boolean(busy)} onClick={() => act(a.id, false)} className={btnGhost}>
              {busy === a.id ? "جاري..." : "رفض"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
