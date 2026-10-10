import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  MessageSquare,
  Phone,
  PhoneCall,
  MessageCircle,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Trash2,
  Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { updateMessageStatus, deleteMessage } from "@/lib/messages.functions";
import { ConfirmModal, type ConfirmState } from "./ConfirmModal";
import { AdminErrorState } from "./AdminErrorState";

type ContactMsg = {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  status: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "جديدة", color: "bg-info/10 text-info border-info/20" },
  contacted: { label: "تم التواصل", color: "bg-warning/10 text-warning border-warning/20" },
  resolved: { label: "تم الحل", color: "bg-success/10 text-success border-success/20" },
  archived: { label: "مؤرشفة", color: "bg-secondary text-muted-foreground border-border" },
};

export function ContactMessages() {
  const qc = useQueryClient();
  const updateStatusFn = useServerFn(updateMessageStatus);
  const deleteFn = useServerFn(deleteMessage);

  const [filter, setFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const { data: messages = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "contact-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_suggestions")
        .select("*")
        .ilike("name", "[رسالة تواصل]%")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ContactMsg[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "contact-messages"] });
    qc.invalidateQueries({ queryKey: ["admin", "counts", "messages"] });
  };

  const copyPhone = (phone: string, id: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    toast.success("تم نسخ رقم الهاتف");
    setTimeout(() => setCopiedId(null), 2000);
  };

  async function handleSetStatus(id: string, status: "new" | "contacted" | "resolved" | "archived") {
    try {
      const r = await updateStatusFn({ data: { id, status } });
      if (!r.ok) {
        toast.error("تعذر تحديث حالة الرسالة");
        return;
      }
      toast.success("تم تحديث حالة الرسالة");
      refresh();
    } catch {
      toast.error("حدث خطأ أثناء التحديث");
    }
  }

  function handleDelete(id: string) {
    setConfirmState({
      open: true,
      title: "تأكيد حذف الرسالة",
      description: "هل أنت متأكد من حذف هذه الرسالة نهائياً؟",
      confirmLabel: "نعم، احذف الرسالة",
      destructive: true,
      onConfirm: async () => {
        try {
          const r = await deleteFn({ data: { id } });
          if (!r.ok) {
            toast.error("تعذر حذف الرسالة");
            return;
          }
          toast.success("تم حذف الرسالة بنجاح");
          refresh();
        } catch {
          toast.error("حدث خطأ أثناء الحذف");
        }
      },
    });
  }

  const filtered = messages.filter((m) => {
    if (filter === "all") return true;
    return m.status === filter;
  });

  const newCount = messages.filter((m) => m.status === "new").length;

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: "all", label: `الكل (${messages.length})` },
            { id: "new", label: `الجديدة (${newCount})` },
            { id: "contacted", label: `تم التواصل (${messages.filter((m) => m.status === "contacted").length})` },
            { id: "resolved", label: `تم الحل (${messages.filter((m) => m.status === "resolved").length})` },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                filter === f.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-card border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="p-8 text-center text-sm text-muted-foreground">جاري تحميل الرسائل...</p>
      ) : isError ? (
        <AdminErrorState
          title="تعذر تحميل الرسائل"
          error={error}
          onRetry={() => refetch()}
        />
      ) : !filtered.length ? (
        <div className="surface p-8 text-center rounded-2xl border border-border space-y-2">
          <MessageSquare className="size-8 mx-auto text-muted-foreground/60" />
          <p className="text-sm font-bold text-foreground">لا توجد رسائل تواصل في هذا القسم</p>
          <p className="text-xs text-muted-foreground">
            الرسائل المرسلة عبر صفحة «تواصل معنا» ستظهر هنا فور إرسالها من المواطنين.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((msg) => {
            const rawTitle = msg.name.replace(/^\[رسالة تواصل\]\s*/, "");
            const statusInfo = STATUS_LABELS[msg.status] || STATUS_LABELS.new;
            const cleanPhone = msg.phone?.replace(/[^\d+]/g, "") || "";
            const waPhone = cleanPhone.startsWith("0") ? "2" + cleanPhone : cleanPhone;

            return (
              <div
                key={msg.id}
                className="surface p-4 sm:p-5 rounded-2xl border border-border space-y-3 shadow-xs hover:border-primary/30 transition-colors"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/70 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-foreground">{rawTitle}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusInfo.color}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="size-3" />
                      <span>{new Date(msg.created_at).toLocaleString("ar-EG")}</span>
                    </p>
                  </div>

                  {/* Phone Actions Box */}
                  {msg.phone && (
                    <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl p-1 shadow-xs">
                      <span className="px-2 text-xs font-black tracking-wide" dir="ltr">
                        {msg.phone}
                      </span>

                      <button
                        onClick={() => copyPhone(msg.phone!, msg.id)}
                        title="نسخ رقم الهاتف"
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <Check className="size-3.5 text-success" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>

                      <a
                        href={`tel:${msg.phone}`}
                        title="اتصال هاتفي مباشر"
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs"
                      >
                        <PhoneCall className="size-3" />
                        <span>اتصال</span>
                      </a>

                      <a
                        href={`https://wa.me/${waPhone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="محادثة واتساب"
                        className="inline-flex items-center gap-1 rounded-lg bg-whatsapp px-2.5 py-1 text-xs font-bold text-whatsapp-foreground hover:brightness-105 transition-all shadow-xs"
                      >
                        <MessageCircle className="size-3" />
                        <span>واتساب</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Message Body */}
                <div className="rounded-xl bg-secondary/40 p-3.5 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-medium">
                  {msg.note || "لا يوجد نص للرسالة"}
                </div>

                {/* Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground">تحديث الحالة:</span>
                    {msg.status !== "contacted" && (
                      <button
                        onClick={() => handleSetStatus(msg.id, "contacted")}
                        className="rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning hover:bg-warning/20 transition-colors"
                      >
                        تم التواصل
                      </button>
                    )}
                    {msg.status !== "resolved" && (
                      <button
                        onClick={() => handleSetStatus(msg.id, "resolved")}
                        className="rounded-lg border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-bold text-success hover:bg-success/20 transition-colors"
                      >
                        تم الحل
                      </button>
                    )}
                    {msg.status !== "new" && (
                      <button
                        onClick={() => handleSetStatus(msg.id, "new")}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground hover:bg-secondary transition-colors"
                      >
                        تعيين كجديدة
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(msg.id)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-destructive hover:bg-destructive/10 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                    <span>حذف الرسالة</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {confirmState ? <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} /> : null}
    </div>
  );
}
