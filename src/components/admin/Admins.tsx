import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  UserPlus,
  Shield,
  KeyRound,
  Trash2,
  Power,
  Crown,
  CheckCircle2,
  XCircle,
  X,
  ArrowRightLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  addAdmin,
  transferOwnership,
  setAdminActiveStatus,
  revokeAdminAccount,
  setAdminPassword,
} from "@/lib/admins.functions";
import { input } from "./shared";
import { ConfirmModal, type ConfirmState } from "./ConfirmModal";
import { AdminErrorState } from "./AdminErrorState";

type AdminRow = {
  id: string;
  email: string;
  is_owner: boolean;
  active: boolean;
  added_by_email: string | null;
  created_at: string;
};

const ERR_MAP: Record<string, string> = {
  already_admin: "هذا البريد الإلكتروني لديه صلاحية مسؤول بالفعل.",
  invalid_email: "البريد الإلكتروني المدخل غير صالح.",
  not_owner: "هذا الإجراء متاح لمالك النظام (Owner) فقط.",
  cannot_suspend_owner: "لا يمكن إيقاف حساب المالك الرئيسي.",
  cannot_revoke_self: "لا يمكنك سحب صلاحية حسابك الشخصي.",
  not_found: "المسؤول غير موجود.",
  target_inactive: "لا يمكن نقل الملكية لحساب موقوف.",
};

const getErrorMsg = (code: string) =>
  ERR_MAP[code] || Object.entries(ERR_MAP).find(([k]) => code.includes(k))?.[1] || "حدث خطأ، يرجى المحاولة لاحقاً.";

export function Admins() {
  const qc = useQueryClient();
  const addFn = useServerFn(addAdmin);
  const transferFn = useServerFn(transferOwnership);
  const setActiveFn = useServerFn(setAdminActiveStatus);
  const revokeFn = useServerFn(revokeAdminAccount);
  const setPassFn = useServerFn(setAdminPassword);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "moderator">("admin");
  const [busy, setBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // Password reset modal state
  const [passModalAdmin, setPassModalAdmin] = useState<AdminRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passBusy, setPassBusy] = useState(false);

  const list = useQuery({
    queryKey: ["admin", "admins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_users" as never)
        .select("*")
        .order("is_owner", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AdminRow[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "admins"] });
    qc.invalidateQueries({ queryKey: ["admin", "audit"] });
  };

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      toast.error(ERR_MAP["invalid_email"]);
      return;
    }
    if (password && password.length < 10) {
      toast.error("كلمة المرور يجب أن تكون ١٠ أحرف على الأقل.");
      return;
    }
    if (list.data?.some((a) => a.email === em)) {
      toast.error(ERR_MAP["already_admin"]);
      return;
    }

    setBusy(true);
    try {
      const r = await addFn({
        data: {
          email: em,
          password: password || undefined,
          role,
        },
      });
      if (!(r as any)?.ok) {
        toast.error(getErrorMsg((r as any)?.code));
        return;
      }
      toast.success("تمت إضافة المسؤول بنجاح");
      if (r.warning) {
        toast.warning(r.warning);
      }
      setEmail("");
      setPassword("");
      refresh();
    } catch {
      toast.error("حدث خطأ أثناء إضافة المسؤول");
    } finally {
      setBusy(false);
    }
  }

  function handleTransferOwnership(admin: AdminRow) {
    setConfirmState({
      open: true,
      title: "نقل الملكية الرئيسية للنظام",
      description: `تحذير هام: هل أنت متأكد من نقل الملكية الرئيسية للنظام بالكامل إلى (${admin.email})؟ بعد ذلك سيصبح هو المالك الرئيسي الوحيد.`,
      confirmLabel: "نعم، انقل الملكية",
      destructive: true,
      onConfirm: async () => {
        try {
          const r = await transferFn({ data: { targetAdminId: admin.id } });
          if (!(r as any)?.ok) {
            toast.error(getErrorMsg((r as any)?.code));
            return;
          }
          toast.success(`تم نقل ملكية النظام بنجاح إلى ${admin.email}`);
          refresh();
        } catch {
          toast.error("حدث خطأ أثناء نقل الملكية");
        }
      },
    });
  }

  function handleToggleActive(admin: AdminRow) {
    const nextState = !admin.active;
    const actionLabel = nextState ? "تفعيل" : "إيقاف";
    setConfirmState({
      open: true,
      title: `${actionLabel} حساب المسؤول`,
      description: `هل أنت متأكد من ${actionLabel} حساب (${admin.email})؟`,
      confirmLabel: `نعم، ${actionLabel} الحساب`,
      destructive: !nextState,
      onConfirm: async () => {
        try {
          const r = await setActiveFn({ data: { id: admin.id, active: nextState } });
          if (!(r as any)?.ok) {
            toast.error(getErrorMsg((r as any)?.code));
            return;
          }
          toast.success(`تم ${actionLabel} الحساب بنجاح`);
          refresh();
        } catch {
          toast.error("حدث خطأ أثناء تحديث حالة الحساب");
        }
      },
    });
  }

  function handleRevoke(admin: AdminRow) {
    setConfirmState({
      open: true,
      title: "سحب صلاحية المسؤول نهائياً",
      description: `تحذير: هل أنت متأكد من حذف وسحب صلاحية المسؤول (${admin.email}) نهائياً؟`,
      confirmLabel: "نعم، اسحب الصلاحية",
      destructive: true,
      onConfirm: async () => {
        try {
          const r = await revokeFn({ data: { id: admin.id } });
          if (!(r as any)?.ok) {
            toast.error(getErrorMsg((r as any)?.code));
            return;
          }
          toast.success(`تم سحب صلاحية ${admin.email} بنجاح`);
          refresh();
        } catch {
          toast.error("حدث خطأ أثناء سحب الصلاحية");
        }
      },
    });
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passModalAdmin) return;
    if (newPassword.length < 10) {
      toast.error("كلمة المرور يجب أن تكون ١٠ أحرف على الأقل.");
      return;
    }

    setPassBusy(true);
    try {
      const r = await setPassFn({
        data: {
          id: passModalAdmin.id,
          password: newPassword,
        },
      });
      if (!r.ok) {
        toast.error(getErrorMsg((r as any).code));
        return;
      }
      toast.success(`تم تعيين كلمة المرور الجديدة لـ ${passModalAdmin.email}`);
      setPassModalAdmin(null);
      setNewPassword("");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء تغيير كلمة المرور");
    } finally {
      setPassBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Add Admin Form */}
      <form onSubmit={handleAdd} className="surface p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-border pb-3">
          <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <UserPlus className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-foreground">إضافة مسؤول جديد</h2>
            <p className="text-xs text-muted-foreground">
              حدد البريد الإلكتروني وكلمة المرور لمنحه صلاحيات الدخول إلى لوحة التحكم
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="grid gap-1 text-sm font-bold sm:col-span-1">
            البريد الإلكتروني *
            <input
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className={input}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold sm:col-span-1">
            كلمة المرور المبدئية
            <input
              type="text"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="١٠ أحرف على الأقل"
              className={input}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold sm:col-span-1">
            الدور المطلوب
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "moderator")}
              className={input}
            >
              <option value="admin">مسؤول عام (Admin)</option>
              <option value="moderator">مشرف محتوى (Moderator)</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            • <strong className="text-foreground">المسؤول:</strong> يدير العمال، اعتماد الطلبات، التقييمات، والخدمات.
          </p>
          <button
            disabled={busy}
            className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-xs transition-all"
          >
            {busy ? "جاري الإضافة..." : "إضافة وحفظ المسؤول"}
          </button>
        </div>
      </form>

      {/* Admins List Section */}
      <div className="surface p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            المسؤولون الحاليون ({list.data?.length ?? 0})
          </h2>
          <span className="text-xs text-muted-foreground">يمكنك تعديل الحالة أو كلمة المرور أو حذف الحسابات</span>
        </div>

        {list.isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">جاري تحميل قائمة المسؤولين...</p>
        ) : list.isError ? (
          <AdminErrorState
            title="تعذر تحميل قائمة المسؤولين"
            error={list.error}
            onRetry={() => list.refetch()}
          />
        ) : !list.data?.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد مسؤولين مسجلين</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {list.data.map((admin) => (
              <div
                key={admin.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-card hover:bg-secondary/40 transition-colors"
              >
                {/* Admin info */}
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-extrabold text-foreground truncate" dir="ltr">
                      {admin.email}
                    </p>
                    {admin.is_owner ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-black text-primary">
                        <Crown className="size-3 text-premium" /> المالك الرئيسي (Owner)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary border border-border px-2.5 py-0.5 text-[11px] font-bold text-foreground">
                        <Shield className="size-3" /> مسؤول (Admin)
                      </span>
                    )}
                    {admin.active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                        <CheckCircle2 className="size-2.5" /> نشط
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                        <XCircle className="size-2.5" /> موقوف
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    أضيف بتاريخ: {new Date(admin.created_at).toLocaleDateString("ar-EG")}
                    {admin.added_by_email && ` · بواسطة: ${admin.added_by_email}`}
                  </p>
                </div>

                {/* Role and Action Controls */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {/* Reset Password Button */}
                  <button
                    onClick={() => {
                      setPassModalAdmin(admin);
                      setNewPassword("");
                    }}
                    title="تغيير كلمة المرور للمسؤول"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:bg-secondary text-primary transition-colors"
                  >
                    <KeyRound className="size-3.5" />
                    <span>كلمة السر</span>
                  </button>

                  {!admin.is_owner && (
                    <>
                      {/* Transfer Ownership Button */}
                      <button
                        onClick={() => handleTransferOwnership(admin)}
                        title="نقل الملكية الرئيسية لهذا المسؤول"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:bg-secondary text-warning transition-colors"
                      >
                        <ArrowRightLeft className="size-3.5" />
                        <span>نقل الملكية</span>
                      </button>

                      {/* Toggle Active/Inactive */}
                      <button
                        onClick={() => handleToggleActive(admin)}
                        title={admin.active ? "إيقاف الحساب" : "تفعيل الحساب"}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                          admin.active
                            ? "border-warning/30 text-warning hover:bg-warning/10"
                            : "border-success/30 text-success hover:bg-success/10"
                        }`}
                      >
                        <Power className="size-3.5" />
                        <span>{admin.active ? "إيقاف" : "تفعيل"}</span>
                      </button>

                      {/* Revoke Admin Button */}
                      <button
                        onClick={() => handleRevoke(admin)}
                        title="سحب الصلاحية وحذف الحساب"
                        className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 px-2 py-1.5 text-xs font-bold transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Set New Password For Admin */}
      {passModalAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <form
            onSubmit={handleSetPassword}
            className="relative w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-2xl text-foreground space-y-4"
          >
            <button
              type="button"
              onClick={() => setPassModalAdmin(null)}
              className="absolute left-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <KeyRound className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold">تعيين كلمة سر جديدة</h3>
                <p className="text-xs text-muted-foreground truncate" dir="ltr">
                  {passModalAdmin.email}
                </p>
              </div>
            </div>

            <label className="grid gap-1 text-sm font-bold">
              كلمة المرور الجديدة (٨ أحرف على الأقل) *
              <input
                type="text"
                dir="ltr"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="اكتب كلمة السر الجديدة..."
                className={input}
                autoFocus
              />
            </label>

            <div className="flex items-center gap-2 pt-2">
              <button
                disabled={passBusy}
                type="submit"
                className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shadow-xs"
              >
                {passBusy ? "جاري الحفظ..." : "حفظ كلمة السر"}
              </button>
              <button
                type="button"
                onClick={() => setPassModalAdmin(null)}
                className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold hover:bg-secondary"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
      {confirmState ? <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} /> : null}
    </div>
  );
}
