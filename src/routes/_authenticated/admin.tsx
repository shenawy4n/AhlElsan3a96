import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  LogOut,
  LayoutDashboard,
  Briefcase,
  Inbox,
  Star,
  BarChart3,
  Settings as SettingsIcon,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ServicesHub, type ServicesSubTab } from "@/components/admin/ServicesHub";
import { Overview, Analytics } from "@/components/admin/Insights";
import { AdminReviews } from "@/components/admin/Reviews";
import { RequestsHub, type RequestsSubTab } from "@/components/admin/RequestsHub";
import { SettingsHub, type SettingsSubTab } from "@/components/admin/SettingsHub";
import { adminListReviews } from "@/lib/reviews.functions";
import { AdminErrorState } from "@/components/admin/AdminErrorState";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم — أهل الصنعة" },
      { name: "description", content: "إدارة العمال والخدمات والأقسام والقرى والطلبات." },
      { property: "og:title", content: "لوحة التحكم — أهل الصنعة" },
      { property: "og:description", content: "إدارة أهل الصنعة." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Tab =
  | "home"
  | "services"
  | "requests"
  | "reviews"
  | "analytics"
  | "settings";

function AdminPage() {
  const navigate = useNavigate();

  const role = useQuery({
    queryKey: ["admin-level"],
    queryFn: async (): Promise<"owner" | "admin" | "moderator" | null> => {
      try {
        const { getCurrentAdminRole } = await import("@/lib/admins.functions");
        const res = await getCurrentAdminRole();
        if (res?.role) return res.role;
      } catch {
        // Fallback to supabase rpc
      }
      const { data, error } = await supabase.rpc("my_admin_level" as never);
      if (error) throw error;
      return (data as unknown as "owner" | "admin" | "moderator" | null) ?? null;
    },
  });

  const [tab, setTab] = useState<Tab>("home");
  const [servicesSubTab, setServicesSubTab] = useState<ServicesSubTab>("workers");
  const [requestsSubTab, setRequestsSubTab] = useState<RequestsSubTab>("applications");
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>("platform");
  const [editId, setEditId] = useState<string | null>(null);
  const [newProvider, setNewProvider] = useState(false);
  const [catPrefill, setCatPrefill] = useState<string | null>(null);

  // Live badge queries
  const appsCountQuery = useQuery({
    queryKey: ["admin", "counts", "applications"],
    queryFn: async () => {
      const { count } = await supabase
        .from("provider_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const reportsCountQuery = useQuery({
    queryKey: ["admin", "counts", "reports"],
    queryFn: async () => {
      const { count } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .in("status", ["new", "reviewing"]);
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const suggestionsCountQuery = useQuery({
    queryKey: ["admin", "counts", "suggestions"],
    queryFn: async () => {
      const { count } = await supabase
        .from("service_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const reviewsQuery = useQuery({
    queryKey: ["admin", "reviews"],
    queryFn: async () => {
      const res = await adminListReviews({ data: { status: "all" } });
      if ((res as any)?.ok === false) {
        const err = new Error((res as any)?.error || (res as any)?.message || "تعذر تحميل التقييمات");
        (err as any).status = (res as any)?.status;
        throw err;
      }
      return Array.isArray(res) ? res : [];
    },
    enabled: !!role.data,
    staleTime: 30_000,
  });

  const totalPendingRequests =
    (appsCountQuery.data ?? 0) + (reportsCountQuery.data ?? 0) + (suggestionsCountQuery.data ?? 0);
  const pendingReviewsCount = Array.isArray(reviewsQuery.data)
    ? reviewsQuery.data.filter((r) => r?.status === "pending").length
    : 0;

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  if (role.isLoading) return <p className="p-8 text-center">جاري التحقق...</p>;
  if (role.isError) {
    return (
      <div className="mx-auto max-w-md p-8">
        <AdminErrorState
          title="تعذر التحقق من صلاحيات الدخول"
          error={role.error}
          onRetry={() => role.refetch()}
        />
      </div>
    );
  }
  if (!role.data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-lg font-bold">ليس لديك صلاحية الدخول إلى لوحة الإدارة</p>
        <button
          onClick={logout}
          className="mt-4 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
        >
          تسجيل خروج
        </button>
      </div>
    );
  }

  const isOwner = role.data === "owner";
  const isModerator = role.data === "moderator";

  const go = (targetTab: string, action?: string) => {
    setEditId(null);
    setNewProvider(false);

    // Moderator cannot access settings or administration
    if (
      isModerator &&
      (targetTab === "settings" ||
        targetTab === "export" ||
        targetTab === "audit" ||
        targetTab === "admins" ||
        targetTab === "account" ||
        targetTab === "password")
    ) {
      setTab("home");
      return;
    }

    // Mappings for consolidated tabs
    if (targetTab === "providers" || targetTab === "workers") {
      setTab("services");
      setServicesSubTab("workers");
      if (action === "new") setNewProvider(true);
      return;
    }
    if (targetTab === "categories") {
      setTab("services");
      setServicesSubTab("categories");
      if (action === "new") setCatPrefill("");
      return;
    }
    if (targetTab === "areas") {
      setTab("services");
      setServicesSubTab("areas");
      return;
    }
    if (targetTab === "services") {
      setTab("services");
      setServicesSubTab("workers");
      return;
    }

    if (targetTab === "applications" || targetTab === "reports" || targetTab === "suggestions" || targetTab === "messages") {
      setTab("requests");
      setRequestsSubTab(targetTab as RequestsSubTab);
      return;
    }

    if (targetTab === "account" || targetTab === "password") {
      setTab("settings");
      setSettingsSubTab("account");
      return;
    }
    if (targetTab === "export" || targetTab === "audit" || targetTab === "admins") {
      setTab("settings");
      setSettingsSubTab(targetTab as SettingsSubTab);
      return;
    }
    if (targetTab === "settings") {
      setTab("settings");
      setSettingsSubTab("platform");
      return;
    }

    setTab(targetTab as Tab);
  };

  const navItems = [
    { id: "home" as const, label: "الرئيسية", icon: LayoutDashboard },
    { id: "services" as const, label: "الخدمات", icon: Briefcase },
    {
      id: "requests" as const,
      label: "الطلبات والوارد",
      icon: Inbox,
      badge: totalPendingRequests,
    },
    {
      id: "reviews" as const,
      label: "التقييمات",
      icon: Star,
      badge: pendingReviewsCount,
    },
    { id: "analytics" as const, label: "الإحصائيات", icon: BarChart3 },
    ...(!isModerator ? [{ id: "settings" as const, label: "الإعدادات والنظام", icon: SettingsIcon }] : []),
  ];

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur shadow-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-lg font-extrabold flex items-center gap-2 hover:text-primary transition-colors">
              <span>لوحة التحكم</span>
              <span className="text-muted-foreground text-xs font-normal">· أهل الصنعة</span>
            </Link>
            <span className="hidden sm:inline-flex text-[11px] font-bold px-2 py-0.5 rounded-md bg-secondary text-foreground">
              {isOwner ? "المالك (Owner)" : isModerator ? "مشرف محتوى (Moderator)" : "مسؤول (Admin)"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>معاينة الموقع</span>
              <ExternalLink className="size-3.5" />
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-muted-foreground hover:bg-secondary hover:text-destructive transition-colors"
            >
              <LogOut className="size-3.5" /> خروج
            </button>
          </div>
        </div>

        {/* Clean top navigation with consolidated tabs (settings hidden for moderator) */}
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                      active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5">
        {tab === "home" && <Overview go={go} />}

        {tab === "services" && (
          <ServicesHub
            initialSubTab={servicesSubTab}
            editId={editId}
            startNew={newProvider}
            isModerator={isModerator}
            onClearEdit={() => {
              setEditId(null);
              setNewProvider(false);
            }}
            catPrefill={catPrefill}
            onPrefillUsed={() => setCatPrefill(null)}
          />
        )}

        {tab === "requests" && (
          <RequestsHub
            initialSubTab={requestsSubTab}
            onEditProvider={(id) => {
              setEditId(id);
              setNewProvider(false);
              setTab("services");
              setServicesSubTab("workers");
            }}
            onCreateCategory={(n) => {
              setCatPrefill(n);
              setTab("services");
              setServicesSubTab("categories");
            }}
          />
        )}

        {tab === "reviews" && <AdminReviews isModerator={isModerator} />}

        {tab === "analytics" && <Analytics />}

        {tab === "settings" && !isModerator && (
          <SettingsHub isOwner={isOwner} initialSubTab={settingsSubTab} />
        )}
      </main>
    </div>
  );
}
