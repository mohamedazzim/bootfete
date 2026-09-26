import { ReactNode } from 'react';

interface ExamShellProps {
  children: ReactNode;
}

/**
 * Phase 3: isolated exam shell.
 *
 * The active exam route strips ALL global layout chrome — no institutional
 * banner, no sidebar/top-nav, no footer. Only exam-internal UI (qualifier
 * heading, timer, violation count, progress, question navigator, content)
 * is rendered inside. Deliberately renders no navigation links at all so an
 * accidental click cannot navigate away mid-attempt.
 */
export default function ExamShell({ children }: ExamShellProps) {
  return (
    <div className="min-h-screen bg-slate-50" data-testid="exam-shell">
      <main className="p-4 md:p-8">{children}</main>
    </div>
  );
}
