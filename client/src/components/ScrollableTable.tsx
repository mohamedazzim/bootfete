import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ScrollableTable — accessible horizontally-scrollable container for wide
 * data tables on small viewports.
 *
 * - role="region" + tabIndex={0} + aria-label lets keyboard users focus the
 *   region and scroll with arrow keys; screen readers announce the region.
 * - Subtle inset edge shadows indicate scrollable content and fade away once
 *   the corresponding edge is reached.
 * - The border + rounded corners give a persistent visual cue that the table
 *   is a distinct scrollable surface.
 */
export default function ScrollableTable({
  children,
  label = 'Scrollable data table',
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      setEdges({
        left: el.scrollLeft > 4,
        right: maxScroll > 4 && el.scrollLeft < maxScroll - 4,
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-testid="scrollable-table"
      className={cn(
        // relative: contains absolutely-positioned descendants (e.g. sr-only
        // labels inside row action menus) so they scroll with the region
        // instead of leaking into the document's scrollable overflow and
        // creating page-level horizontal scroll on small viewports.
        'relative overflow-x-auto rounded-lg border border-slate-200 bg-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1',
        edges.left && 'shadow-[inset_12px_0_12px_-12px_rgba(15,23,42,0.28)]',
        edges.right && 'shadow-[inset_-12px_0_12px_-12px_rgba(15,23,42,0.28)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
