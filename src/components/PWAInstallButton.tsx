import { useState, useEffect, useRef } from "react";
import { Smartphone, Share, PlusSquare, X, CheckCircle2, Download } from "lucide-react";
import { usePWAInstall } from "@/lib/usePWAInstall";

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Esc key listener and focus management
  useEffect(() => {
    if (!showModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModal(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showModal]);

  // If already installed, show small verified indicator
  if (isInstalled) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1 rounded-xl bg-success/10 border border-success/20 px-2.5 py-1 text-xs font-bold text-success">
        <CheckCircle2 className="size-3.5 text-success" />
        <span>التطبيق مثبت</span>
      </span>
    );
  }

  const handleOpenClick = async () => {
    // If browser supports native prompt directly, try prompt first
    if (isInstallable) {
      const ok = await install();
      if (!ok) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  const handleTriggerNativeInstall = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) {
        setShowModal(false);
      }
    }
  };

  return (
    <>
      <button
        onClick={handleOpenClick}
        type="button"
        suppressHydrationWarning
        className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-xs font-extrabold transition-all shadow-xs active:scale-95 cursor-pointer"
        title="تثبيت التطبيق على هاتفك"
      >
        <Smartphone className="size-3.5 shrink-0" />
        <span>تثبيت التطبيق</span>
      </button>

      {/* Centered Modal Dialog */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowModal(false)}
        >
          <div
            ref={modalRef}
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            className="surface relative w-full max-w-[22rem] max-h-[85dvh] overflow-y-auto rounded-3xl border border-border p-5 sm:p-6 shadow-2xl text-foreground space-y-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))] animate-in zoom-in-95 duration-150"
          >
            {/* Header with Close Button */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shrink-0 shadow-xs">
                  <Smartphone className="size-6" />
                </div>
                <div className="min-w-0">
                  <h3 id="pwa-install-title" className="text-base font-extrabold text-foreground truncate">
                    تثبيت «أهل الصنعة»
                  </h3>
                  <p className="text-xs text-muted-foreground">على شاشة هاتفك الرئيسية</p>
                </div>
              </div>

              <button
                ref={closeButtonRef}
                onClick={() => setShowModal(false)}
                type="button"
                className="grid size-8 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="size-4.5" />
              </button>
            </div>

            {/* Content Body */}
            {isInstallable ? (
              <div className="space-y-3.5">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  يمكنك تثبيت تطبيق أهل الصنعة مباشرة ليعمل كتطبيق أصلي سريع بدون فتح المتصفح.
                </p>
                <button
                  type="button"
                  onClick={handleTriggerNativeInstall}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-extrabold shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Download className="size-4" />
                  <span>تثبيت التطبيق الآن</span>
                </button>
              </div>
            ) : isIOS ? (
              <div className="space-y-3 rounded-2xl bg-secondary/50 p-3.5 text-xs text-foreground/90 border border-border/60">
                <p className="font-extrabold text-primary text-sm">خطوات التثبيت على Safari:</p>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-5.5 place-items-center rounded-full bg-primary/10 text-primary shrink-0 font-black text-xs">
                      ١
                    </span>
                    <p className="leading-snug">
                      اضغط على زر المشاركة <Share className="inline size-3.5 text-primary mx-0.5 align-text-bottom" /> في شريط متصفح سفاري بالأسفل.
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="grid size-5.5 place-items-center rounded-full bg-primary/10 text-primary shrink-0 font-black text-xs">
                      ٢
                    </span>
                    <p className="leading-snug">
                      مرر القائمة واختر <strong className="font-extrabold text-foreground">«إضافة إلى الشاشة الرئيسية»</strong> (Add to Home Screen) <PlusSquare className="inline size-3.5 text-primary mx-0.5 align-text-bottom" />.
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="grid size-5.5 place-items-center rounded-full bg-primary/10 text-primary shrink-0 font-black text-xs">
                      ٣
                    </span>
                    <p className="leading-snug">
                      اضغط <strong className="font-extrabold text-foreground">«إضافة» (Add)</strong> في أعلى الشاشة ليظهر التطبيق مع برامج هاتفك.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl bg-secondary/50 p-3.5 text-xs text-foreground/90 border border-border/60">
                <p className="font-extrabold text-primary text-sm">خطوات التثبيت على الهاتف:</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  اضغط على قائمة المتصفح (⋮) أعلى أو أسفل الصفحة، ثم اختر <strong className="font-extrabold text-foreground">«تثبيت التطبيق» (Install App)</strong> أو <strong className="font-extrabold text-foreground">«إضافة إلى الشاشة الرئيسية»</strong> لتثبيت أيقونة التطبيق على شاشة هاتفك مباشرة.
                </p>
              </div>
            )}

            {/* Footer Dismiss Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full rounded-2xl border border-border bg-card hover:bg-secondary py-2.5 text-xs font-bold text-foreground transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
