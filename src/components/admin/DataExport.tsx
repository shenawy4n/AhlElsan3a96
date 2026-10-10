import { useState } from "react";
import { Download, FileSpreadsheet, Database, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export function DataExport() {
  const [busy, setBusy] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  async function exportProviders() {
    setBusy("providers");
    try {
      let list: any[] = [];
      try {
        const { getAdminProvidersServerFn } = await import("@/lib/admin-actions.functions");
        list = (await getAdminProvidersServerFn()) as any[];
      } catch {
        const { data, error } = await supabase
          .from("providers")
          .select("*, categories(name), areas(name), experience_options(label)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        list = data || [];
      }

      const headers = [
        "المعرف (ID)",
        "الاسم",
        "القسم",
        "المنطقة / القرية",
        "سنوات الخبرة",
        "رقم الهاتف",
        "رقم هاتف إضافي",
        "واتساب",
        "الحالة",
        "مميز (Premium)",
        "تاريخ انتهاء التمييز",
        "موثق (Verified)",
        "طوارئ ٢٤ ساعة",
        "لديه ورشة",
        "اسم الورشة",
        "عنوان الورشة",
        "ساعات العمل",
        "الوصف",
        "الخدمات",
        "رابط الصورة",
        "تاريخ التسجيل",
      ];

      const rows = list.map((p: any) => [
        p.id,
        p.name,
        p.categories?.name ?? "",
        p.areas?.name ?? "",
        p.experience_options?.label ?? "",
        p.phone ?? "",
        p.secondary_phone ?? "",
        p.whatsapp ?? "",
        p.status === "active" ? "ظاهر" : "مخفي",
        p.is_premium ? "نعم" : "لا",
        p.premium_expires_at ? new Date(p.premium_expires_at).toLocaleDateString("ar-EG") : "",
        p.is_verified ? "نعم" : "لا",
        p.is_emergency_24h ? "نعم" : "لا",
        p.has_workshop ? "نعم" : "لا",
        p.workshop_name ?? "",
        p.workshop_address ?? "",
        p.working_hours ?? "",
        p.description ?? "",
        Array.isArray(p.services) ? p.services.join(" - ") : p.services ?? "",
        p.photo_url ?? "",
        new Date(p.created_at).toLocaleDateString("ar-EG"),
      ]);

      // UTF-8 BOM (\uFEFF) ensures Excel renders Arabic letters correctly
      const csv =
        "\uFEFF" +
        [
          headers.map(escapeCsv).join(","),
          ...rows.map((r) => r.map(escapeCsv).join(",")),
        ].join("\r\n");

      downloadFile(csv, `providers_${today}.csv`, "text/csv;charset=utf-8;");
      toast.success(`تم تصدير ${list.length} صنايعي بنجاح`);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء التصدير");
    } finally {
      setBusy(null);
    }
  }

  async function exportApplications() {
    setBusy("applications");
    try {
      const { data, error } = await supabase
        .from("provider_applications")
        .select("*, categories(name), areas(name)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const list = data || [];

      const headers = [
        "المعرف (ID)",
        "الاسم",
        "القسم",
        "المنطقة / القرية",
        "رقم الهاتف",
        "واتساب",
        "الحالة",
        "سبب الرفض",
        "الوصف",
        "الخدمات",
        "تاريخ الطلب",
      ];

      const statusMap: Record<string, string> = {
        pending: "قيد المراجعة",
        approved: "مقبول",
        rejected: "مرفوض",
      };

      const rows = list.map((a: any) => [
        a.id,
        a.name,
        a.categories?.name ?? "",
        a.areas?.name ?? "",
        a.phone ?? "",
        a.whatsapp ?? "",
        statusMap[a.status] || a.status,
        a.rejection_reason ?? "",
        a.description ?? "",
        a.services ?? "",
        new Date(a.created_at).toLocaleDateString("ar-EG"),
      ]);

      const csv =
        "\uFEFF" +
        [
          headers.map(escapeCsv).join(","),
          ...rows.map((r) => r.map(escapeCsv).join(",")),
        ].join("\r\n");

      downloadFile(csv, `applications_${today}.csv`, "text/csv;charset=utf-8;");
      toast.success(`تم تصدير ${list.length} طلب بنجاح`);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء التصدير");
    } finally {
      setBusy(null);
    }
  }

  async function exportReviews() {
    setBusy("reviews");
    try {
      const { data, error } = await supabase
        .from("reviews")
        .select("*, providers(name)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const list = data || [];

      const headers = [
        "المعرف",
        "اسم الصنايعي",
        "اسم المقيّم",
        "التقييم بالنجوم",
        "التعليق",
        "الحالة",
        "تاريخ التقييم",
      ];

      const statusMap: Record<string, string> = {
        pending: "معلق",
        approved: "معتمد",
        rejected: "مرفوض",
      };

      const rows = list.map((r: any) => [
        r.id,
        r.providers?.name ?? "",
        r.reviewer_name ?? "مجهول",
        r.rating,
        r.comment,
        statusMap[r.status] || r.status,
        new Date(r.created_at).toLocaleDateString("ar-EG"),
      ]);

      const csv =
        "\uFEFF" +
        [
          headers.map(escapeCsv).join(","),
          ...rows.map((r) => r.map(escapeCsv).join(",")),
        ].join("\r\n");

      downloadFile(csv, `reviews_${today}.csv`, "text/csv;charset=utf-8;");
      toast.success(`تم تصدير ${list.length} تقييم بنجاح`);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء التصدير");
    } finally {
      setBusy(null);
    }
  }

  async function exportFullJsonBackup() {
    setBusy("json");
    try {
      let provsData: any[] = [];
      try {
        const { getAdminProvidersServerFn } = await import("@/lib/admin-actions.functions");
        provsData = (await getAdminProvidersServerFn()) as any[];
      } catch {
        const res = await supabase.from("providers").select("*");
        provsData = res.data || [];
      }

      const [cats, areas, exp, revs, apps, settings] = await Promise.all([
        supabase.from("categories").select("*"),
        supabase.from("areas").select("*"),
        supabase.from("experience_options").select("*"),
        supabase.from("reviews").select("*"),
        supabase.from("provider_applications").select("*"),
        supabase.from("app_settings").select("*"),
      ]);

      const backup = {
        meta: {
          app: "أهل الصنعة",
          exported_at: new Date().toISOString(),
          version: "1.0",
        },
        categories: cats.data || [],
        areas: areas.data || [],
        experience_options: exp.data || [],
        providers: provsData,
        reviews: revs.data || [],
        provider_applications: apps.data || [],
        app_settings: settings.data || [],
      };

      const jsonStr = JSON.stringify(backup, null, 2);
      downloadFile(jsonStr, `ahl_alsana_full_backup_${today}.json`, "application/json");
      toast.success("تم تنزيل النسخة الاحتياطية الشاملة بنجاح");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء إنشاء النسخة الاحتياطية");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="surface p-5">
        <h2 className="text-xl font-extrabold flex items-center gap-2 text-foreground">
          <Database className="size-5 text-primary" />
          تصدير البيانات والنسخ الاحتياطي
        </h2>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          يمكنك تصدير بيانات المنصة إلى ملفات Excel (CSV) متوافقة تماماً مع اللغة العربية، أو تنزيل نسخة احتياطية كاملة (JSON).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Providers Export */}
        <div className="surface p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <FileSpreadsheet className="size-5 text-success" />
              <h3 className="font-extrabold text-base">دليل الصنايعية (Excel CSV)</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              تصدير جميع بيانات الصنايعية الحاليين متضمنة أرقام الهواتف، التخصصات، المناطق، التقييمات، والتفاصيل المهنية.
            </p>
          </div>
          <button
            onClick={exportProviders}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-bold text-primary-foreground text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {busy === "providers" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            تصدير ملف الصنايعية
          </button>
        </div>

        {/* Applications Export */}
        <div className="surface p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <FileSpreadsheet className="size-5 text-primary" />
              <h3 className="font-extrabold text-base">طلبات التسجيل (Excel CSV)</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              تصدير سجل جميع طلبات تسجيل وترشيح الصنايعية (المعلقة، المقبولة، والمرفوضة).
            </p>
          </div>
          <button
            onClick={exportApplications}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 font-bold text-foreground text-sm hover:bg-secondary active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {busy === "applications" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            تصدير ملف الطلبات
          </button>
        </div>

        {/* Reviews Export */}
        <div className="surface p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <FileSpreadsheet className="size-5 text-warning" />
              <h3 className="font-extrabold text-base">التقييمات والمراجعات (Excel CSV)</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              تصدير جميع تقييمات العملاء وآرائهم للصنايعية مع التقييم بالنجوم وتواريخ النشر.
            </p>
          </div>
          <button
            onClick={exportReviews}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 font-bold text-foreground text-sm hover:bg-secondary active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {busy === "reviews" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            تصدير ملف التقييمات
          </button>
        </div>

        {/* Full JSON Backup */}
        <div className="surface p-5 flex flex-col justify-between gap-4 border-2 border-primary/20">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Database className="size-5 text-primary" />
              <h3 className="font-extrabold text-base">نسخة احتياطية كاملة (JSON)</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ملف متكامل يحتوي على كل جداول النظام (الصنايعية، الأقسام، القرى، التقييمات، الطلبات، والإعدادات) لحفظها في مكان آمن.
            </p>
          </div>
          <button
            onClick={exportFullJsonBackup}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-bold text-accent-foreground text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {busy === "json" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            تنزيل نسخة احتياطية شاملة
          </button>
        </div>
      </div>
    </div>
  );
}
