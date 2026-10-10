import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserCheck, AlertTriangle, Lightbulb, MessageSquare } from "lucide-react";
import { Applications, Reports, Suggestions } from "./Insights";
import { ContactMessages } from "./ContactMessages";

export type RequestsSubTab = "applications" | "reports" | "suggestions" | "messages";

export function RequestsHub({
  initialSubTab = "applications",
  onEditProvider,
  onCreateCategory,
}: {
  initialSubTab?: RequestsSubTab;
  onEditProvider: (providerId: string) => void;
  onCreateCategory: (name: string) => void;
}) {
  const [subTab, setSubTab] = useState<RequestsSubTab>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Queries for live counts
  const appsCountQuery = useQuery({
    queryKey: ["admin", "counts", "applications"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("provider_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const reportsCountQuery = useQuery({
    queryKey: ["admin", "counts", "reports"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .in("status", ["new", "reviewing"]);
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const suggestionsCountQuery = useQuery({
    queryKey: ["admin", "counts", "suggestions"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("service_suggestions")
        .select("id", { count: "exact", head: true })
        .not("name", "ilike", "[رسالة تواصل]%")
        .eq("status", "new");
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const messagesCountQuery = useQuery({
    queryKey: ["admin", "counts", "messages"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("service_suggestions")
        .select("id", { count: "exact", head: true })
        .ilike("name", "[رسالة تواصل]%")
        .eq("status", "new");
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const appsCount = appsCountQuery.data ?? 0;
  const reportsCount = reportsCountQuery.data ?? 0;
  const suggestionsCount = suggestionsCountQuery.data ?? 0;
  const messagesCount = messagesCountQuery.data ?? 0;

  const SUB_TABS = [
    {
      id: "applications" as const,
      label: "طلبات انضمام العمال",
      icon: UserCheck,
      count: appsCount,
      color: "bg-success/15 text-success border-success/30",
    },
    {
      id: "messages" as const,
      label: "رسائل تواصل معنا",
      icon: MessageSquare,
      count: messagesCount,
      color: "bg-info/15 text-info border-info/30",
    },
    {
      id: "reports" as const,
      label: "البلاغات والشكاوى",
      icon: AlertTriangle,
      count: reportsCount,
      color: "bg-warning/15 text-warning border-warning/30",
    },
    {
      id: "suggestions" as const,
      label: "اقتراحات الخدمات",
      icon: Lightbulb,
      count: suggestionsCount,
      color: "bg-primary/15 text-primary border-primary/30",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-navigation Header */}
      <div className="surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-foreground">الطلبات والوارد</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              إدارة طلبات تسجيل العمال، رسائل تواصل معنا من المواطنين، البلاغات، واقتراحات الخدمات
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-secondary text-foreground">
              إجمالي المعلق: {appsCount + messagesCount + reportsCount + suggestionsCount}
            </span>
          </div>
        </div>

        {/* Sub-tabs pills */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {SUB_TABS.map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card hover:bg-secondary/70 text-muted-foreground border border-border"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                      active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="pt-1">
        {subTab === "applications" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-extrabold text-base text-foreground">طلبات التسجيل المعلقة</h3>
              <span className="text-xs text-muted-foreground">{appsCount} طلب قيد الانتظار</span>
            </div>
            <Applications />
          </div>
        )}

        {subTab === "messages" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-extrabold text-base text-foreground">رسائل واستفسارات المواطنين</h3>
              <span className="text-xs text-muted-foreground">{messagesCount} رسالة جديدة بحاجة لمتابعة</span>
            </div>
            <ContactMessages />
          </div>
        )}

        {subTab === "reports" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-extrabold text-base text-foreground">بلاغات الهواتف والبيانات</h3>
              <span className="text-xs text-muted-foreground">{reportsCount} بلاغ مفتوح</span>
            </div>
            <Reports onEdit={onEditProvider} />
          </div>
        )}

        {subTab === "suggestions" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-extrabold text-base text-foreground">اقتراحات الخدمات من الأهالي</h3>
              <span className="text-xs text-muted-foreground">{suggestionsCount} اقتراح جديد</span>
            </div>
            <Suggestions onCreate={onCreateCategory} />
          </div>
        )}
      </div>
    </div>
  );
}
