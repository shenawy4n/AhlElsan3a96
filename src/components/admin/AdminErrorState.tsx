import { AlertCircle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { isAuthError, handleAdminAuthFailure } from "@/lib/admin-error-handler";
import { useNavigate } from "@tanstack/react-router";

export interface AdminErrorStateProps {
  title?: string;
  message?: string;
  error?: unknown;
  onRetry?: () => void | Promise<unknown>;
  className?: string;
}

export function AdminErrorState({
  title = "حدث خطأ أثناء تحميل البيانات",
  message,
  error,
  onRetry,
  className = "p-8 text-center",
}: AdminErrorStateProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthError(error)) {
      handleAdminAuthFailure(navigate);
    }
  }, [error, navigate]);

  const displayMessage =
    message ||
    (isAuthError(error)
      ? "انتهت صلاحية جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى."
      : (error as any)?.message || "تعذر الاتصال بالخادم أو جلب البيانات المطلوبة.");

  return (
    <div
      role="alert"
      className={`surface rounded-2xl border border-destructive/20 bg-destructive/5 space-y-4 ${className}`}
    >
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-extrabold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{displayMessage}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={() => {
            if (isAuthError(error)) {
              handleAdminAuthFailure(navigate);
            } else {
              onRetry();
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity"
        >
          <RotateCcw className="size-4" />
          <span>حاول تاني</span>
        </button>
      )}
    </div>
  );
}
