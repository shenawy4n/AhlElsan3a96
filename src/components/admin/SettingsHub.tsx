import { useState, useEffect } from "react";
import { Sliders, Users, History, Download, ShieldCheck, KeyRound } from "lucide-react";
import { Settings, AuditLog } from "./Insights";
import { Admins } from "./Admins";
import { DataExport } from "./DataExport";
import { AdminAccount } from "./AdminAccount";

export type SettingsSubTab = "platform" | "account" | "admins" | "audit" | "export";

export function SettingsHub({
  isOwner,
  initialSubTab = "platform",
}: {
  isOwner: boolean;
  initialSubTab?: SettingsSubTab;
}) {
  const [subTab, setSubTab] = useState<SettingsSubTab>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const SUB_TABS = [
    {
      id: "platform" as const,
      label: "إعدادات المنصة والهوية",
      icon: Sliders,
      description: "اللوجو، اسم التطبيق، أرقام وتواصل معنا، والصفحات الثابتة",
    },
    {
      id: "account" as const,
      label: "الحساب",
      icon: KeyRound,
      description: "بيانات حسابك وتغيير كلمة المرور الشخصية",
    },
    ...(isOwner
      ? [
          {
            id: "admins" as const,
            label: "إدارة المسؤولين",
            icon: Users,
            description: "صلاحيات المديرين واختيار الأدوار وحسابات الدخول",
          },
        ]
      : []),
    {
      id: "audit" as const,
      label: "سجل التغييرات",
      icon: History,
      description: "سجل العمليات والأنشطة الإدارية",
    },
    {
      id: "export" as const,
      label: "تصدير البيانات والنسخ",
      icon: Download,
      description: "تنزيل تقارير Excel ونسخة احتياطية كاملة",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Settings Navigation Header */}
      <div className="surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-foreground">الإعدادات والنظام</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              إدارة إعدادات الموقع، هوية المنصة، الحساب وكلمة المرور، المسؤولين، والنسخ الاحتياطي
            </p>
          </div>
          {isOwner && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="size-3.5" /> مالك النظام (Owner)
            </span>
          )}
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
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="pt-1">
        {subTab === "platform" && <Settings />}
        {subTab === "account" && <AdminAccount isOwner={isOwner} />}
        {subTab === "admins" && isOwner && <Admins />}
        {subTab === "audit" && <AuditLog />}
        {subTab === "export" && <DataExport />}
      </div>
    </div>
  );
}
