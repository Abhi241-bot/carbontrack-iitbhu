import { useCallback, useContext } from 'react';
import { ToastContext, ToastType } from '@/components/common/Toast';

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');

  // ctx.addToast is stable (useCallback with [] in ToastProvider), so these
  // callbacks are also stable and safe to use as useEffect dependencies.
  const showSuccess = useCallback(
    (message: string) => ctx.addToast('success', message),
    [ctx.addToast]
  );
  const showError = useCallback(
    (message: string) => ctx.addToast('error', message),
    [ctx.addToast]
  );
  const showInfo = useCallback((message: string) => ctx.addToast('info', message), [ctx.addToast]);
  const showWarning = useCallback(
    (message: string) => ctx.addToast('warning', message),
    [ctx.addToast]
  );
  const showToast = useCallback(
    ({ type, message }: { type: ToastType; message: string }) => ctx.addToast(type, message),
    [ctx.addToast]
  );

  return { showSuccess, showError, showInfo, showWarning, showToast };
}
