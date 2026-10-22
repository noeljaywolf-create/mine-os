import type { EvidenceRef } from '../domain/types';
import { cx } from '../design-system';
import { formatTimestamp } from '../domain/units';
import {
  Boxes,
  Calculator,
  ClipboardList,
  FileText,
  Gauge,
  GitBranch,
  Wrench,
} from 'lucide-react';

const ICONS: Record<EvidenceRef['kind'], typeof Gauge> = {
  telemetry: Gauge,
  dependency: GitBranch,
  calculation: Calculator,
  assumption: Boxes,
  event: ClipboardList,
  document: FileText,
  decision: ClipboardList,
  maintenance: Wrench,
};

export function EvidenceList({
  evidence,
  compact,
  max,
  onSelectRef,
  className,
}: {
  evidence: EvidenceRef[];
  compact?: boolean;
  max?: number;
  onSelectRef?: (ref: string) => void;
  className?: string;
}) {
  const items = max ? evidence.slice(0, max) : evidence;
  if (items.length === 0) {
    return (
      <div className={cx('rounded-[2px] border border-dashed border-ink-600 px-3 py-3 text-2xs text-ink-400', className)}>
        No evidence recorded. MINE OS does not assert a cause without evidence.
      </div>
    );
  }

  return (
    <ul className={cx('space-y-1.5', className)}>
      {items.map((item) => {
        const Icon = ICONS[item.kind] ?? FileText;
        return (
          <li key={item.id} className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-900/50 px-2.5 py-2">
            <div className="flex items-start gap-2">
              <Icon size={13} className="mt-0.5 shrink-0 text-ink-400" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11.5px] leading-snug text-ink-100">{item.label}</span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-500">
                    {item.kind}
                  </span>
                </div>
                {!compact && (
                  <p className="mt-1 text-2xs leading-relaxed text-ink-300">{item.detail}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {item.refs.slice(0, 6).map((ref) =>
                    onSelectRef ? (
                      <button
                        key={ref}
                        onClick={() => onSelectRef(ref)}
                        className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-800 px-1 py-[1px] font-mono text-[9px] text-ink-300 hover:border-signal-cyan/50 hover:text-ink-100"
                      >
                        {ref}
                      </button>
                    ) : (
                      <span
                        key={ref}
                        className="rounded-[2px] border border-[color:var(--hairline)] bg-ink-800 px-1 py-[1px] font-mono text-[9px] text-ink-400"
                      >
                        {ref}
                      </span>
                    ),
                  )}
                  <span className="ml-auto font-mono text-[9px] text-ink-500">{formatTimestamp(item.atMs)}</span>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
