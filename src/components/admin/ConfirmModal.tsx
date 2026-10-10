import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmModal({
  state,
  onClose,
}: {
  state: ConfirmState;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md rounded-2xl p-6 text-right" dir="rtl">
        <AlertDialogHeader className="text-right sm:text-right space-y-2">
          <AlertDialogTitle className="text-lg font-extrabold text-foreground">
            {state.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
            {state.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 flex flex-row items-center justify-end gap-2 sm:justify-end">
          <AlertDialogCancel
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 font-bold text-sm hover:bg-secondary transition-all"
          >
            {state.cancelLabel || "إلغاء"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={async (e) => {
              e.preventDefault();
              try {
                await state.onConfirm();
              } finally {
                onClose();
              }
            }}
            className={`rounded-xl px-4 py-2 font-extrabold text-sm transition-all ${
              state.destructive !== false
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {state.confirmLabel || "نعم، احذف الآن"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
