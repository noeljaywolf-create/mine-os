import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { AssetStatus, IncidentSeverity, IncidentState } from '../domain/types';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------------------- */
/* Tone                                                                       */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'blue' | 'cyan' | 'teal' | 'green' | 'amber' | 'red' | 'violet';

const TONE_SOFT: Record<Tone, string> = {
  neutral: 'border-ink-600/80 bg-ink-750/60 text-ink-200',
  blue: 'border-signal-blue/40 bg-signal-blue/10 text-[#9dbcfb]',
  cyan: 'border-signal-cyan/40 bg-signal-cyan/10 text-[#8adcef]',
  teal: 'border-signal-teal/40 bg-signal-teal/10 text-[#7fd8d1]',
  green: 'border-signal-green/40 bg-signal-green/10 text-[#7fd6a4]',
  amber: 'border-signal-amber/40 bg-signal-amber/10 text-[#f0bd6a]',
  red: 'border-signal-red/45 bg-signal-red/10 text-[#f29b9b]',
  violet: 'border-signal-violet/40 bg-signal-violet/10 text-[#c3b3ff]',
};

const TONE_SOLID: Record<Tone, string> = {
  neutral: 'bg-ink-600 text-ink-50',
  blue: 'bg-signal-blue text-white',
  cyan: 'bg-signal-cyan text-ink-950',
  teal: 'bg-signal-teal text-ink-950',
  green: 'bg-signal-green text-white',
  amber: 'bg-signal-amber text-ink-950',
  red: 'bg-signal-red text-white',
  violet: 'bg-signal-violet text-white',
};

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink-200',
  blue: 'text-[#7fa8f5]',
  cyan: 'text-signal-cyanBright',
  teal: 'text-[#5fd0c7]',
  green: 'text-[#4cc383]',
  amber: 'text-[#e8ad4a]',
  red: 'text-[#ef7d7d]',
  violet: 'text-[#b3a0ff]',
};

export function toneText(tone: Tone): string {
  return TONE_TEXT[tone];
}

export function toneForStatus(status: AssetStatus): Tone {
  switch (status) {
    case 'operational':
      return 'green';
    case 'degraded':
      return 'amber';
    case 'failed':
      return 'red';
    case 'blocked':
      return 'red';
    case 'exposed':
      return 'amber';
    case 'standby':
      return 'cyan';
    case 'offline':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function toneForSeverity(severity: IncidentSeverity): Tone {
  return severity === 'critical' ? 'red' : severity === 'high' ? 'amber' : severity === 'medium' ? 'blue' : 'neutral';
}

export function toneForIncidentState(state: IncidentState): Tone {
  switch (state) {
    case 'open':
      return 'amber';
    case 'acknowledged':
      return 'blue';
    case 'investigating':
      return 'violet';
    case 'mitigating':
      return 'cyan';
    case 'resolved':
      return 'green';
    case 'closed':
      return 'neutral';
    case 'review':
      return 'teal';
    default:
      return 'neutral';
  }
}

export function humanise(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className,
  bodyClassName,
  dense,
  scroll,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  dense?: boolean;
  scroll?: boolean;
}) {
  return (
    <section className={cx('panel flex min-h-0 flex-col', className)}>
      {(title || actions || eyebrow) && (
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--hairline)] px-3.5 py-2.5">
          <div className="min-w-0">
            {eyebrow && <div className="label-micro mb-1 text-ink-400">{eyebrow}</div>}
            {title && <h2 className="truncate text-[13px] font-medium tracking-tight text-ink-50">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div
        className={cx(
          'min-h-0 flex-1',
          dense ? 'p-0' : 'p-3.5',
          scroll && 'overflow-y-auto',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="label-micro">{children}</div>
      {right && <div className="label-micro text-ink-400">{right}</div>}
    </div>
  );
}

export function Rule({ label }: { label?: string }) {
  return (
    <div className="my-3 flex items-center gap-2">
      <div className="h-px flex-1 bg-[color:var(--hairline)]" />
      {label && <span className="label-micro text-ink-400">{label}</span>}
      <div className="h-px flex-1 bg-[color:var(--hairline)]" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                      */
/* -------------------------------------------------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  solid,
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  solid?: boolean;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-[2px] border px-1.5 py-[2px] font-mono text-2xs uppercase tracking-[0.12em]',
        solid ? cx('border-transparent', TONE_SOLID[tone]) : TONE_SOFT[tone],
        className,
      )}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', solid ? 'bg-current' : 'bg-current')} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: AssetStatus; className?: string }) {
  return (
    <Badge tone={toneForStatus(status)} dot className={className}>
      {status}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return (
    <Badge tone={toneForSeverity(severity)} dot>
      {severity}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'subtle';
  size?: 'xs' | 'sm' | 'md';
  icon?: ReactNode;
};

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'border-signal-blue bg-signal-blue text-white hover:bg-[#3d7bf2] active:bg-[#2761d4] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]',
  outline: 'border-ink-600 bg-transparent text-ink-100 hover:border-ink-500 hover:bg-ink-800',
  ghost: 'border-transparent bg-transparent text-ink-200 hover:bg-ink-800 hover:text-ink-50',
  danger: 'border-signal-red bg-signal-red/90 text-white hover:bg-signal-red',
  subtle: 'border-[color:var(--hairline)] bg-ink-800 text-ink-200 hover:bg-ink-750',
};

const SIZE: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'h-6 px-2 text-2xs gap-1',
  sm: 'h-7 px-2.5 text-[12px] gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-2',
};

export function Button({ variant = 'outline', size = 'sm', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex select-none items-center justify-center rounded-[2px] border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-transparent text-ink-300 transition-colors hover:border-[color:var(--hairline)] hover:bg-ink-800 hover:text-ink-50 disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Metric                                                                     */
/* -------------------------------------------------------------------------- */

export function Metric({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
  delta,
  className,
  mono = true,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: Tone;
  delta?: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="label-micro truncate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cx('text-[19px] leading-none tracking-tight', mono && 'num', TONE_TEXT[tone])}>{value}</span>
        {unit && <span className="font-mono text-2xs text-ink-400">{unit}</span>}
        {delta}
      </div>
      {hint && <div className="mt-1 truncate text-2xs text-ink-400">{hint}</div>}
    </div>
  );
}

export function MetricGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 | 6 }) {
  const map = { 2: 'grid-cols-2', 3: 'grid-cols-2 md:grid-cols-3', 4: 'grid-cols-2 md:grid-cols-4', 5: 'grid-cols-2 md:grid-cols-5', 6: 'grid-cols-3 md:grid-cols-6' };
  return <div className={cx('grid gap-px overflow-hidden rounded-[2px] bg-[color:var(--hairline)]', map[cols])}>{children}</div>;
}

export function MetricCell({ children }: { children: ReactNode }) {
  return <div className="bg-ink-850 px-3 py-2.5">{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

export function Progress({
  value,
  tone = 'blue',
  height = 'h-1.5',
  marker,
  className,
}: {
  value: number;
  tone?: Tone;
  height?: string;
  marker?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const markerPct = marker === undefined ? null : Math.max(0, Math.min(100, marker));
  return (
    <div className={cx('relative w-full overflow-hidden rounded-[1px] bg-ink-750', height, className)}>
      <div
        className={cx('h-full transition-[width] duration-500 ease-out', TONE_SOLID[tone])}
        style={{ width: `${pct}%` }}
      />
      {markerPct !== null && (
        <div className="absolute top-0 h-full w-px bg-paper/80" style={{ left: `${markerPct}%` }} />
      )}
    </div>
  );
}

export function StackedBar({
  segments,
  height = 'h-2',
}: {
  segments: Array<{ value: number; tone: Tone; label: string }>;
  height?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div className={cx('flex w-full overflow-hidden rounded-[1px] bg-ink-750', height)}>
      {segments.map((segment) => (
        <div
          key={segment.label}
          title={`${segment.label}: ${segment.value}`}
          className={TONE_SOLID[segment.tone]}
          style={{ width: `${(segment.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: ReactNode; count?: number }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('flex items-center gap-0.5 overflow-x-auto no-scrollbar', className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cx(
              'relative shrink-0 border-b px-2.5 py-1.5 text-[12px] transition-colors',
              active
                ? 'border-signal-cyan text-ink-50'
                : 'border-transparent text-ink-300 hover:border-ink-600 hover:text-ink-100',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 font-mono text-2xs text-ink-400">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cx('block', className)}>
      <span className="label-micro mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-2xs leading-snug text-ink-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-[2px] border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-[12.5px] text-ink-100 placeholder:text-ink-400 transition-colors focus:border-signal-cyan focus:outline-none disabled:opacity-50';

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(inputClass, className)} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(inputClass, 'min-h-[72px] resize-y leading-relaxed', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(inputClass, 'appearance-none pr-7', className)}>
      {children}
    </select>
  );
}

export function Range({
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label: string;
  format?: (value: number) => string;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="label-micro">
          {label}
        </label>
        <span className="num text-2xs text-ink-200">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-ink-700 accent-signal-cyan disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-40',
        checked ? 'border-signal-cyan/60 bg-signal-cyan/30' : 'border-ink-600 bg-ink-800',
      )}
    >
      <span
        className={cx(
          'h-3.5 w-3.5 rounded-full transition-transform',
          checked ? 'translate-x-[17px] bg-signal-cyanBright' : 'translate-x-[3px] bg-ink-300',
        )}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialog                                                                     */
/* -------------------------------------------------------------------------- */

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink-950/70 p-4 pt-[8vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className={cx('panel w-full outline-none', width)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
          >
            <header className="flex items-center justify-between border-b border-[color:var(--hairline)] px-4 py-3">
              <h2 className="text-[13px] font-medium text-ink-50">{title}</h2>
              <IconButton label="Close dialog" onClick={onClose}>
                <X size={14} />
              </IconButton>
            </header>
            <div className="px-4 py-4">{children}</div>
            {footer && <footer className="flex justify-end gap-2 border-t border-[color:var(--hairline)] px-4 py-3">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  detail,
  icon,
  action,
}: {
  title: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      {icon && <div className="text-ink-500">{icon}</div>}
      <div className="text-[13px] text-ink-200">{title}</div>
      {detail && <div className="max-w-sm text-2xs leading-relaxed text-ink-400">{detail}</div>}
      {action}
    </div>
  );
}

export function KeyValue({
  label,
  value,
  mono = true,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  tone?: Tone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[color:var(--hairline)] py-1.5 last:border-0">
      <span className="text-2xs text-ink-400">{label}</span>
      <span className={cx('text-right text-[12px] text-ink-100', mono && 'num', tone && TONE_TEXT[tone])}>{value}</span>
    </div>
  );
}

export function Notice({
  tone = 'blue',
  title,
  children,
  icon,
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={cx('rounded-[2px] border px-3 py-2.5', TONE_SOFT[tone])}>
      <div className="flex items-start gap-2">
        {icon && <div className="mt-0.5 shrink-0 opacity-80">{icon}</div>}
        <div className="min-w-0">
          {title && <div className="mb-0.5 font-mono text-2xs uppercase tracking-[0.14em] opacity-90">{title}</div>}
          <div className="text-[11.5px] leading-relaxed text-ink-200/90">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline                                                                  */
/* -------------------------------------------------------------------------- */

export function Sparkline({
  values,
  tone = 'cyan',
  height = 28,
  width = 120,
  fill = true,
  marker,
}: {
  values: number[];
  tone?: Tone;
  height?: number;
  width?: number;
  fill?: boolean;
  marker?: number;
}) {
  if (values.length === 0) return <div style={{ height, width }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 2) - 1;
    return [x, y] as const;
  });
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const stroke =
    tone === 'red'
      ? '#D33F3F'
      : tone === 'amber'
        ? '#D98A0B'
        : tone === 'green'
          ? '#1E9E5A'
          : tone === 'blue'
            ? '#2F6FEB'
            : '#2BB3D6';
  const markerY =
    marker === undefined ? null : height - ((marker - min) / span) * (height - 2) - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {fill && (
        <path
          d={`${path} L${width},${height} L0,${height} Z`}
          fill={stroke}
          opacity={0.1}
        />
      )}
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" />
      {markerY !== null && markerY >= 0 && markerY <= height && (
        <line x1={0} x2={width} y1={markerY} y2={markerY} stroke="#B6C1CE" strokeDasharray="2 3" strokeWidth={0.75} opacity={0.6} />
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Mini table primitives                                                      */
/* -------------------------------------------------------------------------- */

export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-auto', className)}>
      <table className="w-full min-w-[560px] text-left text-[12px]">{children}</table>
    </div>
  );
}

export function Th({ children, align = 'left', className }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return (
    <th
      className={cx(
        'sticky top-0 z-10 whitespace-nowrap border-b border-[color:var(--hairline)] bg-ink-850 px-2.5 py-1.5 font-mono text-2xs font-medium uppercase tracking-[0.12em] text-ink-400',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return (
    <td
      className={cx(
        'border-b border-[color:var(--hairline)] px-2.5 py-1.5 align-middle text-ink-200',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/* Role gate                                                                  */
/* -------------------------------------------------------------------------- */

const CapabilityContext = createContext<((capability: string) => boolean) | null>(null);

export function CapabilityProvider({
  can,
  children,
}: {
  can: (capability: string) => boolean;
  children: ReactNode;
}) {
  return <CapabilityContext.Provider value={can}>{children}</CapabilityContext.Provider>;
}

export function useCapabilityCheck(): (capability: string) => boolean {
  return useContext(CapabilityContext) ?? (() => true);
}

export function Gated({
  capability,
  children,
  fallback,
}: {
  capability: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const can = useCapabilityCheck();
  if (can(capability)) return <>{children}</>;
  return <>{fallback ?? null}</>;
}
