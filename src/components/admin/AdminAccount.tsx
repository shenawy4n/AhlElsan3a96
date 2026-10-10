import { useQuery } from "@tanstack/react-query";
import { UserCheck, ShieldCheck, Mail, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChangePassword } from "./ChangePassword";

export function AdminAccount({ isOwner }: { isOwner: boolean }) {
  const userQuery = useQuery({
    queryKey: ["auth", "current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const email = userQuery.data?.email || "—";
  const createdAt = userQuery.data?.created_at
    ? new Date(userQuery.data.created_at).toLocaleDateString("ar-EG")
    : "—";

  return (
    <div className="space-y-5">
      {/* Account Info Card */}
      <div className="surface p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary shadow-xs">
            <UserCheck className="size-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-foreground">بيانات الحساب الشخصي</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              معلومات حساب المسؤول المسجل به حالياً في لوحة التحكم
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Mail className="size-3.5 text-primary" /> البريد الإلكتروني
            </span>
            <p className="text-sm font-extrabold text-foreground truncate" dir="ltr">
              {email}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-primary" /> مستوى الصلاحية
            </span>
            <p className="text-sm font-extrabold text-foreground">
              {isOwner ? (
                <span className="text-primary font-black">مالك النظام (Owner)</span>
              ) : (
                <span className="text-foreground">مسؤول عام (Admin)</span>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
            <span className="text-xs font-bold text-muted-foreground">تاريخ إنشاء الحساب</span>
            <p className="text-sm font-extrabold text-foreground">{createdAt}</p>
          </div>
        </div>
      </div>

      {/* Password Management */}
      <div className="space-y-3">
        <ChangePassword />
      </div>
    </div>
  );
}
