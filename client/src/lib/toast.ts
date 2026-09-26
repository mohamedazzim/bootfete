import * as React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import type { useToast } from '@/hooks/use-toast';

type ToastFn = ReturnType<typeof useToast>['toast'];

/**
 * Standardized error toast: AlertCircle icon + the --destructive token.
 * The Toaster renders destructive toasts with role="alert" / aria-live="assertive".
 */
export function errorToast(
  toast: ToastFn,
  title: string,
  description?: React.ReactNode,
  opts?: { duration?: number },
) {
  toast({
    variant: 'destructive',
    title,
    duration: opts?.duration,
    description: React.createElement(
      'span',
      { className: 'flex items-start gap-2' },
      React.createElement(AlertCircle, { className: 'h-4 w-4 shrink-0 mt-0.5', 'aria-hidden': true }),
      React.createElement('span', null, description),
    ),
  });
}

/** Standardized info/notice toast for cases where no backend action exists. */
export function infoToast(toast: ToastFn, title: string, description?: React.ReactNode) {
  toast({ title, description });
}

/**
 * Standardized success toast: CheckCircle icon + the --success token.
 * Rendered with role="status" / aria-live="polite" by the Toaster.
 */
export function successToast(toast: ToastFn, title: string, description?: React.ReactNode) {
  toast({
    variant: 'success',
    title,
    description: React.createElement(
      'span',
      { className: 'flex items-start gap-2' },
      React.createElement(CheckCircle, { className: 'h-4 w-4 shrink-0 mt-0.5', 'aria-hidden': true }),
      React.createElement('span', null, description),
    ),
  });
}
