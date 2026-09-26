import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusDomain =
  | 'event'
  | 'round'
  | 'attempt'
  | 'registration'
  | 'participant'
  | 'email';

interface StatusConfig {
  label: string;
  className: string;
}

const SLATE = 'bg-slate-100 text-slate-700 border-slate-200';

/**
 * Canonical status badge styling across the whole app.
 *
 * Colors are semantic, not per-page ad hoc:
 *  - success token  → finished / confirmed / sent
 *  - active token   → currently running
 *  - pending token  → waiting on something
 *  - destructive    → failed / disqualified
 *  - slate          → neutral / terminal informational states
 *
 * Labels are always humanized ("Not Started", never "not_started").
 *
 * Phase 8 canonical vocabulary for the registration/attempt lifecycle:
 *   Registered · In progress · Submitted · Evaluated
 * ("Checked-in" has no corresponding state in the data model — participants
 * move registered → completed/disqualified — so it is deliberately not
 * invented. auto_submitted keeps its distinct "Auto-Submitted" label because
 * it is a separate integrity-relevant database state, cased consistently
 * with the canonical "Submitted".)
 */
const CONFIG: Record<StatusDomain, Record<string, StatusConfig>> = {
  event: {
    draft: { label: 'Draft', className: SLATE },
    upcoming: { label: 'Upcoming', className: SLATE },
    active: { label: 'Active', className: 'bg-success text-success-foreground border-transparent' },
    completed: { label: 'Completed', className: SLATE },
  },
  round: {
    not_started: { label: 'Not Started', className: SLATE },
    in_progress: { label: 'In progress', className: 'bg-active text-active-foreground border-transparent' },
    completed: { label: 'Completed', className: 'bg-success text-success-foreground border-transparent' },
  },
  attempt: {
    in_progress: { label: 'In progress', className: 'bg-active text-active-foreground border-transparent' },
    completed: { label: 'Submitted', className: 'bg-success text-success-foreground border-transparent' },
    auto_submitted: { label: 'Auto-Submitted', className: 'bg-pending text-pending-foreground border-transparent' },
    disqualified: { label: 'Disqualified', className: 'bg-destructive text-destructive-foreground border-transparent' },
  },
  registration: {
    pending: { label: 'Pending', className: 'bg-pending text-pending-foreground border-transparent' },
    confirmed: { label: 'Confirmed', className: 'bg-success text-success-foreground border-transparent' },
    cancelled: { label: 'Cancelled', className: SLATE },
  },
  participant: {
    registered: { label: 'Registered', className: 'bg-pending text-pending-foreground border-transparent' },
    participated: { label: 'Participated', className: 'bg-active text-active-foreground border-transparent' },
    completed: { label: 'Completed', className: 'bg-success text-success-foreground border-transparent' },
    disqualified: { label: 'Disqualified', className: 'bg-destructive text-destructive-foreground border-transparent' },
  },
  email: {
    sent: { label: 'Sent', className: 'bg-success text-success-foreground border-transparent' },
    pending: { label: 'Pending', className: 'bg-pending text-pending-foreground border-transparent' },
    failed: { label: 'Failed', className: 'bg-destructive text-destructive-foreground border-transparent' },
  },
};

function humanize(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function StatusBadge({
  domain,
  status,
  className,
  testId,
}: {
  domain: StatusDomain;
  status: string;
  className?: string;
  testId?: string;
}) {
  const config = CONFIG[domain]?.[status] ?? { label: humanize(status), className: SLATE };
  return (
    <Badge className={cn(config.className, className)} data-testid={testId}>
      {config.label}
    </Badge>
  );
}

/**
 * Canonical display label for a status value, for inline text contexts
 * (select options, sentences) where a <StatusBadge> doesn't fit.
 */
export function statusLabel(domain: StatusDomain, status: string): string {
  return CONFIG[domain]?.[status]?.label ?? humanize(status);
}
