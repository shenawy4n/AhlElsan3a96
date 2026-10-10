import { useState, useEffect } from "react";
import { Users2, FolderTree, MapPin } from "lucide-react";
import { Providers } from "./Providers";
import { Categories, Areas } from "./Lists";

export type ServicesSubTab = "workers" | "categories" | "areas";

export function ServicesHub({
  initialSubTab = "workers",
  editId,
  startNew,
  isModerator,
  onClearEdit,
  catPrefill,
  onPrefillUsed,
}: {
  initialSubTab?: ServicesSubTab;
  editId?: string | null;
  startNew?: boolean;
  isModerator?: boolean;
  onClearEdit?: () => void;
  catPrefill?: string | null;
  onPrefillUsed?: () => void;
}) {
  const [subTab, setSubTab] = useState<ServicesSubTab>(initialSubTab);

  // Sync when initialSubTab changes from parent
  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const SUB_TABS = [
    {
      id: "workers" as const,
      label: "العمال",
      icon: Users2,
      description: "إدارة بيانات العمال وأصحاب المهن والتواصل",
    },
    {
      id: "categories" as const,
      label: "الأقسام والمهن",
      icon: FolderTree,
      description: "إدارة المهن والتصنيفات الخدمية",
    },
    {
      id: "areas" as const,
      label: "المناطق والقرى",
      icon: MapPin,
      description: "إدارة القرى والمراكز المغطاة في الدليل",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-navigation Header */}
      <div className="surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-foreground">الخدمات</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              إدارة العمال وأصحاب المهن، أقسام الخدمات، والقرى والمناطق
            </p>
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
                onClick={() => {
                  setSubTab(t.id);
                  if (t.id !== "workers") {
                    onClearEdit?.();
                  }
                }}
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
        {subTab === "workers" && (
          <Providers
            key={`${editId}-${startNew}`}
            editId={editId ?? null}
            startNew={startNew ?? false}
            isModerator={isModerator}
            onClearEdit={onClearEdit ?? (() => {})}
          />
        )}
        {subTab === "categories" && (
          <Categories
            prefill={catPrefill ?? null}
            isModerator={isModerator}
            onPrefillUsed={onPrefillUsed ?? (() => {})}
          />
        )}
        {subTab === "areas" && <Areas isModerator={isModerator} />}
      </div>
    </div>
  );
}
