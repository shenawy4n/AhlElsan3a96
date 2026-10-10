import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Send,
  Phone,
  User,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { settingsQuery } from "@/lib/directory";
import { sendContactMessage } from "@/lib/messages.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "تواصل معنا — أهل الصنعة" },
      {
        name: "description",
        content: "أرسل رسالتك أو استفسارك لإدارة منصة أهل الصنعة وسنتواصل معك مباشرة.",
      },
      { property: "og:title", content: "تواصل معنا — أهل الصنعة" },
      {
        property: "og:description",
        content: "أرسل رسالتك أو استفسارك وسيقوم فريق العمل بالتواصل معك.",
      },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { data: settings } = useQuery(settingsQuery);
  const appName = settings?.["app_name"] || "أهل الصنعة";
  const customContent = settings?.["contact_content"]?.trim() || "";

  const sendFn = useServerFn(sendContactMessage);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("استفسار عام");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [lastPhone, setLastPhone] = useState("");

  const SUBJECT_OPTIONS = [
    "استفسار عام",
    "طلب إضافة مهنة أو خدمة جديدة",
    "مشكلة في رقم أو بيانات صنايعي",
    "اقتراح لتطوير المنصة",
    "شكوى أو ملاحظة",
    "أخرى",
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("يرجى إدخال اسمك");
      return;
    }

    const cleanPhone = phone.replace(/[^\d+]/g, "");
    if (!cleanPhone || cleanPhone.length < 10) {
      toast.error("يرجى إدخال رقم هاتف صحيح للتواصل (١٠ إلى ١١ رقم)");
      return;
    }

    if (!message.trim() || message.trim().length < 5) {
      toast.error("يرجى كتابة نص الرسالة (٥ أحرف على الأقل)");
      return;
    }

    setBusy(true);
    try {
      const res = await sendFn({
        data: {
          name: name.trim(),
          phone: cleanPhone,
          subject: subject,
          message: message.trim(),
        },
      });

      if (!res.ok) {
        toast.error("تعذر إرسال الرسالة حالياً، يرجى المحاولة لاحقاً");
        return;
      }

      setLastPhone(cleanPhone);
      setSentSuccess(true);
      setName("");
      setPhone("");
      setMessage("");
      toast.success("تم إرسال رسالتك بنجاح للإدارة");
    } catch {
      toast.error("حدث خطأ أثناء إرسال الرسالة، تأكد من اتصالك وحاول مجدداً");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <div>
        <SiteHeader />

        <main className="mx-auto w-full max-w-xl px-4 py-8">
          {sentSuccess ? (
            /* Success State */
            <div className="surface p-6 sm:p-8 rounded-3xl border border-success/30 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-success/10 text-success">
                <CheckCircle2 className="size-9" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-extrabold text-foreground">
                  تم استلام رسالتك بنجاح!
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  شكراً لتواصلك مع إدارة <strong className="text-foreground">{appName}</strong>. تم تحويل رسالتك إلى قسم الطلبات والوارد، وسيقوم فريق العمل بالتواصل معك على الرقم:
                </p>
                <p className="text-base font-extrabold text-primary" dir="ltr">
                  {lastPhone}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setSentSuccess(false)}
                  className="w-full sm:w-auto rounded-xl bg-secondary px-5 py-2.5 text-xs font-bold text-foreground hover:bg-secondary/80 transition-colors"
                >
                  إرسال رسالة أخرى
                </button>
                <Link
                  to="/"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-extrabold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs"
                >
                  <span>الرجوع للرئيسية</span>
                  <ArrowRight className="size-3.5 rotate-180" />
                </Link>
              </div>
            </div>
          ) : (
            /* Contact Form */
            <section className="space-y-6">
              {/* Header */}
              <div className="text-center space-y-2 border-b border-border pb-5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  <MessageSquare className="size-3.5" /> تواصل مع الإدارة
                </span>
                <h1 className="text-2xl font-extrabold sm:text-3xl text-foreground tracking-tight">
                  أرسل رسالتك إلى {appName}
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                  نسعد دائماً باستقبال رسالتك أو استفسارك أو مشكلتك. املأ البيانات وسنتواصل معك هاتفياً في أقرب وقت.
                </p>
              </div>

              {/* Custom Admin Announcement if provided */}
              {customContent && (
                <div className="surface p-4 rounded-2xl border border-primary/20 bg-primary/5 space-y-1 text-xs text-foreground/90">
                  <p className="font-extrabold text-primary flex items-center gap-1.5">
                    <HelpCircle className="size-3.5" /> ملاحظات هامة:
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed">{customContent}</p>
                </div>
              )}

              {/* Form Card */}
              <form onSubmit={handleSubmit} className="surface p-5 sm:p-7 rounded-3xl border border-border shadow-xs space-y-4">
                {/* Sender Name */}
                <label className="block space-y-1.5">
                  <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                    <User className="size-3.5 text-primary" />
                    الاسم بالكامل *
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: أحمد عبد الله"
                    maxLength={100}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary transition-colors"
                  />
                </label>

                {/* Sender Phone (Required) */}
                <label className="block space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                      <Phone className="size-3.5 text-primary" />
                      رقم الهاتف للتواصل *
                    </span>
                    <span className="text-[11px] font-bold text-primary">مطلوب للتواصل معك</span>
                  </div>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01012345678"
                    maxLength={20}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground outline-none focus:border-primary transition-colors"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    سيتم استخدام هذا الرقم للاتصال بك أو مراسلتك للرد على استفسارك.
                  </p>
                </label>

                {/* Subject / Type */}
                <label className="block space-y-1.5">
                  <span className="text-xs font-extrabold text-foreground">
                    موضوع الرسالة
                  </span>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground outline-none focus:border-primary transition-colors"
                  >
                    {SUBJECT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Message Body */}
                <label className="block space-y-1.5">
                  <span className="text-xs font-extrabold text-foreground">
                    نص الرسالة أو تفاصيل الاستفسار *
                  </span>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="اكتب هنا كافة تفاصيل استفسارك أو مشكلتك أو طلبك بالتفصيل..."
                    maxLength={2000}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary transition-colors leading-relaxed"
                  />
                </label>

                {/* Submit Button */}
                <button
                  disabled={busy}
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-extrabold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shadow-xs active:scale-[0.99]"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>جاري إرسال الرسالة...</span>
                    </>
                  ) : (
                    <>
                      <Send className="size-4" />
                      <span>إرسال الرسالة للإدارة</span>
                    </>
                  )}
                </button>
              </form>
            </section>
          )}
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
