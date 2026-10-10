import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, EyeOff, Star, BadgeCheck, AlertTriangle, ExternalLink, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isPremiumActive, settingsQuery, type Area, type Category, type ExperienceOption, type ProviderWithRefs, normalizeEgPhone } from "@/lib/directory";
import { input, btnGhost, useAll, isFlagged } from "./shared";
import { WorkingHoursEditor } from "./WorkingHoursEditor";
import { ProviderPhotoUploader } from "./ProviderPhotoUploader";
import { uploadProviderPhoto, deleteProviderPhotoFromStorage, validatePhotoFile } from "@/lib/provider-photos";
import { ConfirmModal, type ConfirmState } from "./ConfirmModal";
import { deleteProvidersAdminFn } from "@/lib/admin-actions.functions";
import { AdminErrorState } from "./AdminErrorState";

type Form = {
  id?: string;
  name: string; category_id: string; area_id: string; phone: string; secondary_phone: string; whatsapp: string;
  description: string; services: string; price_description: string; working_hours: string; photo_url: string;
  status: string; is_premium: boolean; premium_expires_at: string; experience_id: string; is_verified: boolean;
};
const empty: Form = { name: "", category_id: "", area_id: "", phone: "", secondary_phone: "", whatsapp: "", description: "", services: "", price_description: "", working_hours: "", photo_url: "", status: "active", is_premium: false, premium_expires_at: "", experience_id: "", is_verified: false };

function toForm(p: ProviderWithRefs): Form {
  return {
    id: p.id,
    name: p.name,
    category_id: p.category_id,
    area_id: p.area_id,
    phone: p.phone,
    secondary_phone: p.secondary_phone ?? "",
    whatsapp: p.whatsapp ?? "",
    description: p.description ?? "",
    services: Array.isArray(p.services) ? (p.services as string[]).join("، ") : (p.services ?? ""),
    price_description: p.price_description ?? "",
    working_hours: p.working_hours ?? "",
    photo_url: p.photo_url ?? "",
    status: p.status,
    is_premium: p.is_premium,
    premium_expires_at: p.premium_expires_at ? p.premium_expires_at.slice(0, 10) : "",
    experience_id: p.experience_id ?? "",
    is_verified: p.is_verified,
  };
}

type Patch = Partial<{ status: string; is_verified: boolean; is_premium: boolean; premium_expires_at: string | null }>;

export function Providers({
  editId,
  startNew,
  isModerator,
  onClearEdit,
}: {
  editId?: string | null;
  startNew?: boolean;
  isModerator?: boolean;
  onClearEdit?: () => void;
}) {
  const qc = useQueryClient();
  const { providers, categories, areas, experience } = useAll();
  const settings = useQuery(settingsQuery);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [ver, setVer] = useState("");
  const [prem, setPrem] = useState("");
  const [exp, setExp] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<Form | null>(null);
  const [handled, setHandled] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const all = Array.isArray(providers.data) ? providers.data : [];
  const key = editId ? `e${editId}` : startNew ? "new" : null;
  if (key && handled !== key && (startNew || all.length)) {
    setHandled(key);
    const p = all.find((x) => x.id === editId);
    setForm(p ? toForm(p) : { ...empty, status: settings.data?.["default_provider_status"] || "active" });
  }

  const refresh = () => qc.invalidateQueries();
  const list = all.filter((p) =>
    (!q || p.name.includes(q) || p.phone.includes(q)) &&
    (!cat || p.category_id === cat) &&
    (!area || p.area_id === area) &&
    (!status || p.status === status) &&
    (!ver || String(p.is_verified) === ver) &&
    (!prem || String(isPremiumActive(p)) === prem) &&
    (!exp || p.experience_id === exp) &&
    (!flagged || isFlagged(p)),
  );

  async function patch(ids: string[], row: Patch) {
    if (!ids.length) return;
    const { error } = await supabase.from("providers").update(row).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success("تم");
    refresh();
  }
  function remove(ids: string[]) {
    if (!ids.length) return;
    setConfirmState({
      open: true,
      title: "تأكيد الحذف النهائي",
      description: `هل أنت متأكد من حذف ${ids.length > 1 ? `${ids.length} صنايعي` : "هذا الصنايعي"} نهائياً؟ سيتم أيضاً حذف التقييمات والبلاغات المرتبطة به ولا يمكن التراجع بعد الحذف.`,
      confirmLabel: "نعم، احذف نهائياً",
      destructive: true,
      onConfirm: async () => {
        try {
          const res = await deleteProvidersAdminFn({ data: { ids } });
          if (!(res as any)?.ok) {
            const { error: clientErr } = await supabase.from("providers").delete().in("id", ids);
            if (clientErr) {
              toast.error((res as any)?.message || clientErr.message || "حدث خطأ أثناء الحذف");
              return;
            }
          }
          setSel(new Set());
          toast.success("تم الحذف بنجاح");
          if (form) {
            setForm(null);
            onClearEdit?.();
          }
          refresh();
        } catch (err: any) {
          try {
            const { error: clientErr } = await supabase.from("providers").delete().in("id", ids);
            if (clientErr) {
              toast.error(err.message || clientErr.message || "تعذر الحذف");
              return;
            }
            setSel(new Set());
            toast.success("تم الحذف بنجاح");
            if (form) {
              setForm(null);
              onClearEdit?.();
            }
            refresh();
          } catch (err: any) {
            toast.error(err?.message || "تعذر الحذف");
          }
        }
      },
    });
  }
  const toggleSel = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s); };

  const close = () => { setForm(null); onClearEdit?.(); refresh(); };
  if (form) {
    return (
      <>
        <ProviderForm
          form={form}
          categories={categories.data ?? []}
          areas={areas.data ?? []}
          experience={experience.data ?? []}
          onDone={close}
          onDelete={!isModerator ? ((id) => remove([id])) : undefined}
        />
        {confirmState ? <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} /> : null}
      </>
    );
  }

  if (providers.isLoading) return <p className="p-8 text-center text-muted-foreground font-bold">جاري تحميل بيانات العمال والمهنيين...</p>;
  if (providers.isError) return <AdminErrorState title="تعذر تحميل قائمة العمال والمهنيين" error={providers.error} onRetry={() => providers.refetch()} />;

  const ids = [...sel];
  return (
    <div className="grid gap-3">
      <button onClick={() => setForm({ ...empty, status: settings.data?.["default_provider_status"] || "active" })} className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"><Plus className="size-5" /> إضافة عامل جديد</button>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو رقم التليفون" className={input} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={input}><option value="">كل الأقسام</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={area} onChange={(e) => setArea(e.target.value)} className={input}><option value="">كل المناطق</option>{(areas.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}><option value="">كل الحالات</option><option value="active">ظاهر</option><option value="hidden">مخفي</option></select>
        <select value={ver} onChange={(e) => setVer(e.target.value)} className={input}><option value="">التوثيق: الكل</option><option value="true">موثّق</option><option value="false">غير موثّق</option></select>
        <select value={prem} onChange={(e) => setPrem(e.target.value)} className={input}><option value="">التمييز: الكل</option><option value="true">مميز</option><option value="false">عادي</option></select>
        <select value={exp} onChange={(e) => setExp(e.target.value)} className={input}><option value="">كل الخبرات</option>{(experience.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} className="size-4" /> <AlertTriangle className="size-4 text-destructive" /> بيانات تحتاج مراجعة</label>

      {ids.length > 0 ? (
        <div className="surface sticky top-0 z-10 flex flex-wrap items-center gap-1.5 p-2 text-sm">
          <span className="px-2 font-bold">محدد: {ids.length}</span>
          <button className={btnGhost} onClick={() => patch(ids, { status: "hidden" })}>إخفاء</button>
          <button className={btnGhost} onClick={() => patch(ids, { status: "active" })}>إظهار</button>
          <button className={btnGhost} onClick={() => patch(ids, { is_verified: true })}>توثيق</button>
          <button className={btnGhost} onClick={() => patch(ids, { is_verified: false })}>إلغاء التوثيق</button>
          <button className={btnGhost} onClick={() => patch(ids, { is_premium: true })}>تمييز</button>
          <button className={btnGhost} onClick={() => patch(ids, { is_premium: false, premium_expires_at: null })}>إلغاء التمييز</button>
          {!isModerator && (
            <button className={`${btnGhost} text-destructive`} onClick={() => remove(ids)}>حذف</button>
          )}
          <button className="px-2 text-muted-foreground" onClick={() => setSel(new Set())}>إلغاء التحديد</button>
        </div>
      ) : null}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{list.length} نتيجة</span>
        <button className="font-bold" onClick={() => setSel(new Set(list.map((p) => p.id)))}>تحديد الكل</button>
      </div>
      {list.length === 0 ? <p className="p-6 text-center text-muted-foreground">مفيش نتائج</p> : null}
      {list.map((p) => (
        <div key={p.id} className="surface flex items-center gap-2 p-3">
          <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggleSel(p.id)} className="size-5 shrink-0" aria-label="تحديد" />
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">
              {p.name}{" "}
              {p.is_verified ? <BadgeCheck className="inline size-4 text-primary" /> : null}{" "}
              {isPremiumActive(p) ? <Star className="inline size-4 fill-premium text-premium" /> : null}{" "}
              {p.status !== "active" ? <span className="text-xs text-destructive">(مخفي)</span> : null}{" "}
              {isFlagged(p) ? <AlertTriangle className="inline size-4 text-destructive" /> : null}
            </p>
            <p className="truncate text-sm text-muted-foreground">{p.categories?.name ?? "—"} · {p.areas?.name ?? "—"} · <span dir="ltr">{p.phone}</span>{p.experience_options ? ` · ${p.experience_options.label}` : ""}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-0.5">
            <a
              href={`/provider/${p.id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="معاينة الملف"
              title="معاينة الملف العام في نافذة جديدة"
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <ExternalLink className="size-4.5" />
            </a>
            <button aria-label="تعديل" title="تعديل" onClick={() => setForm(toForm(p))} className="rounded-lg p-2 text-primary hover:bg-secondary"><Pencil className="size-4.5" /></button>
            <button aria-label="توثيق" title={p.is_verified ? "إلغاء التوثيق" : "توثيق"} onClick={() => patch([p.id], { is_verified: !p.is_verified })} className={`rounded-lg p-2 hover:bg-secondary ${p.is_verified ? "text-primary" : "text-muted-foreground"}`}><BadgeCheck className="size-4.5" /></button>
            <button aria-label="تمييز" title={p.is_premium ? "إلغاء التمييز" : "تمييز"} onClick={() => patch([p.id], p.is_premium ? { is_premium: false, premium_expires_at: null } : { is_premium: true })} className={`rounded-lg p-2 hover:bg-secondary ${p.is_premium ? "text-premium" : "text-muted-foreground"}`}><Star className="size-4.5" /></button>
            <button aria-label="إخفاء/إظهار" title="إخفاء/إظهار" onClick={() => patch([p.id], { status: p.status === "active" ? "hidden" : "active" })} className="rounded-lg p-2 hover:bg-secondary">{p.status === "active" ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}</button>
            {!isModerator && (
              <button aria-label="حذف" title="حذف" onClick={() => remove([p.id])} className="rounded-lg p-2 text-destructive hover:bg-secondary"><Trash2 className="size-4.5" /></button>
            )}
          </div>
        </div>
      ))}
      {confirmState ? <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} /> : null}
    </div>
  );
}

function ProviderForm({
  form,
  categories,
  areas,
  experience,
  onDone,
  onDelete,
}: {
  form: Form;
  categories: Category[];
  areas: Area[];
  experience: ExperienceOption[];
  onDone: () => void;
  onDelete?: (id: string) => void;
}) {
  const [f, setF] = useState(form);
  const [busy, setBusy] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => (v.trim() ? v.trim() : null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !f.category_id || !f.area_id || !f.phone.trim()) {
      toast.error("الاسم والقسم والمنطقة والتليفون مطلوبين");
      return;
    }

    const normPhone = normalizeEgPhone(f.phone);
    if (!normPhone) {
      toast.error("رقم الهاتف غير صحيح (يجب أن يكون رقم محمول مصري مثل 01012345678)");
      return;
    }

    let normSecondary: string | null = null;
    if (f.secondary_phone?.trim()) {
      normSecondary = normalizeEgPhone(f.secondary_phone);
      if (!normSecondary) {
        toast.error("الرقم الإضافي غير صحيح (يجب أن يكون رقم محمول مصري مثل 01012345678)");
        return;
      }
    }

    let normWhatsapp: string | null = null;
    if (f.whatsapp?.trim()) {
      normWhatsapp = normalizeEgPhone(f.whatsapp);
      if (!normWhatsapp) {
        toast.error("رقم الواتساب غير صحيح (يجب أن يكون رقم محمول مصري مثل 01012345678)");
        return;
      }
    }

    // Validate photo before proceeding if a file was selected
    if (photoFile) {
      const validation = validatePhotoFile(photoFile);
      if (!validation.valid) {
        toast.error(validation.error || "الصورة المختارة غير صالحة");
        return;
      }
    }

    setBusy(true);

    try {
      if (!f.id) {
        // Safe create -> upload/update flow for new provider
        // 1. Create provider first without photo (prevents orphan files if DB fails)
        const row = {
          name: f.name.trim(),
          category_id: f.category_id,
          area_id: f.area_id,
          phone: normPhone,
          secondary_phone: normSecondary,
          whatsapp: normWhatsapp,
          description: n(f.description),
          services: (f.services ? f.services.split(/[,،\n]+/).map((s) => s.trim()).filter(Boolean) : []) as unknown as string,
          price_description: n(f.price_description),
          working_hours: n(f.working_hours),
          photo_url: photoFile ? null : n(f.photo_url),
          status: f.status,
          is_premium: f.is_premium,
          is_verified: f.is_verified,
          experience_id: f.experience_id || null,
          premium_expires_at: f.is_premium && f.premium_expires_at ? new Date(f.premium_expires_at + "T23:59:59").toISOString() : null,
        };

        const { data: created, error: insertError } = await supabase
          .from("providers")
          .insert(row)
          .select("id")
          .single();

        if (insertError || !created) {
          throw new Error(insertError?.message || "فشل إنشاء بيانات الصنايعي");
        }

        const newId = created.id;

        // 2. Upload photo if selected
        if (photoFile) {
          try {
            const { publicUrl } = await uploadProviderPhoto(newId, photoFile);
            await supabase.from("providers").update({ photo_url: publicUrl }).eq("id", newId);
          } catch (uploadErr: any) {
            console.error("Photo upload error after create:", uploadErr);
            toast.warning("تم حفظ بيانات الصنايعي بنجاح، ولكن تعذر رفع الصورة. يمكنك المحاولة مجدداً عبر تعديل الصنايعي.");
            setBusy(false);
            onDone();
            return;
          }
        }

        toast.success("تمت إضافة الصنايعي بنجاح");
        setBusy(false);
        onDone();
      } else {
        // Update existing provider flow
        let finalPhotoUrl = f.photo_url;

        if (photoFile) {
          const { publicUrl } = await uploadProviderPhoto(f.id, photoFile);
          // If previous photo was in storage bucket, clean it up
          if (f.photo_url) {
            await deleteProviderPhotoFromStorage(f.photo_url);
          }
          finalPhotoUrl = publicUrl;
        } else if (photoRemoved) {
          if (f.photo_url) {
            await deleteProviderPhotoFromStorage(f.photo_url);
          }
          finalPhotoUrl = "";
        }

        const row = {
          name: f.name.trim(),
          category_id: f.category_id,
          area_id: f.area_id,
          phone: normPhone,
          secondary_phone: normSecondary,
          whatsapp: normWhatsapp,
          description: n(f.description),
          services: (f.services ? f.services.split(/[,،\n]+/).map((s) => s.trim()).filter(Boolean) : []) as unknown as string,
          price_description: n(f.price_description),
          working_hours: n(f.working_hours),
          photo_url: n(finalPhotoUrl),
          status: f.status,
          is_premium: f.is_premium,
          is_verified: f.is_verified,
          experience_id: f.experience_id || null,
          premium_expires_at: f.is_premium && f.premium_expires_at ? new Date(f.premium_expires_at + "T23:59:59").toISOString() : null,
        };

        const { error: updateError } = await supabase.from("providers").update(row).eq("id", f.id);
        if (updateError) {
          throw new Error(updateError.message);
        }

        toast.success("تم حفظ التعديلات بنجاح");
        setBusy(false);
        onDone();
      }
    } catch (err: any) {
      setBusy(false);
      toast.error(err.message || "حدث خطأ أثناء الحفظ");
    }
  }

  const field = (k: keyof Form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="grid gap-1 text-sm font-bold">{label}<input value={f[k] as string} onChange={set(k)} className={input} {...extra} /></label>
  );
  const area = (k: keyof Form, label: string) => (
    <label className="grid gap-1 text-sm font-bold">{label}<textarea value={f[k] as string} onChange={set(k)} rows={3} className={input} /></label>
  );

  return (
    <form onSubmit={save} className="surface grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDone}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <ArrowRight className="size-3.5" />
            <span>رجوع للقائمة</span>
          </button>
          <h2 className="text-xl font-extrabold text-foreground">
            {f.id ? `تعديل بيانات العامل: ${f.name || ""}` : "إضافة عامل جديد"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {f.id && (
            <>
              <a
                href={`/provider/${f.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline px-2 py-1"
              >
                <span>معاينة الملف</span>
                <ExternalLink className="size-3.5" />
              </a>
              <button
                type="button"
                onClick={() => onDelete?.(f.id!)}
                className="flex items-center gap-1 rounded-xl border border-destructive/30 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="size-3.5" />
                <span>حذف</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onDone}
            className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-secondary"
          >
            إلغاء
          </button>
          <button
            disabled={busy}
            className="rounded-xl bg-primary px-5 py-2 text-xs font-extrabold text-primary-foreground disabled:opacity-60 shadow-sm"
          >
            {busy ? "جاري الحفظ..." : "حفظ التغييرات"}
          </button>
        </div>
      </div>
      {field("name", "الاسم *", { required: true, maxLength: 100 })}
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm font-bold">القسم *<select value={f.category_id} onChange={set("category_id")} className={input} required><option value="">اختار</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-bold">المنطقة *<select value={f.area_id} onChange={set("area_id")} className={input} required><option value="">اختار</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      </div>
      <label className="grid gap-1 text-sm font-bold">سنوات الخبرة<select value={f.experience_id} onChange={set("experience_id")} className={input}><option value="">غير محدد</option>{experience.map((x) => <option key={x.id} value={x.id}>{x.label}{x.status !== "active" ? " (غير مفعل)" : ""}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2">
        {field("phone", "التليفون *", { required: true, dir: "ltr", inputMode: "tel", maxLength: 20 })}
        {field("whatsapp", "واتساب", { dir: "ltr", inputMode: "tel", maxLength: 20 })}
      </div>
      {field("secondary_phone", "رقم تاني", { dir: "ltr", inputMode: "tel", maxLength: 20 })}
      {area("description", "وصف")}
      {area("services", "تفاصيل الخدمات")}
      {field("price_description", "الأسعار")}
      <WorkingHoursEditor
        value={f.working_hours}
        onChange={(val) => setF({ ...f, working_hours: val })}
      />
      <ProviderPhotoUploader
        currentPhotoUrl={photoRemoved ? null : f.photo_url || null}
        selectedFile={photoFile}
        onFileSelect={(file) => {
          setPhotoFile(file);
          if (file) setPhotoRemoved(false);
        }}
        onRemovePhoto={() => {
          setPhotoFile(null);
          setPhotoRemoved(true);
          setF({ ...f, photo_url: "" });
        }}
        isUploading={busy}
      />
      <label className="grid gap-1 text-sm font-bold">الحالة<select value={f.status} onChange={set("status")} className={input}><option value="active">ظاهر</option><option value="hidden">مخفي</option></select></label>
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={f.is_verified} onChange={(e) => setF({ ...f, is_verified: e.target.checked })} className="size-5" /> موثّق</label>
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={f.is_premium} onChange={(e) => setF({ ...f, is_premium: e.target.checked })} className="size-5" /> مميز</label>
      {f.is_premium ? field("premium_expires_at", "ينتهي التمييز في (فاضي = بدون انتهاء)", { type: "date" }) : null}
      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy} className="rounded-xl bg-primary py-3 font-extrabold text-primary-foreground disabled:opacity-60">حفظ</button>
        <button type="button" onClick={onDone} className="rounded-xl border border-border py-3 font-bold">إلغاء</button>
      </div>
    </form>
  );
}
