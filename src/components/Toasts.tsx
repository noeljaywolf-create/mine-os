import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useMineStore } from '../store/mineStore';
import { useToasts } from '../store/hooks';
import { cx } from '../design-system';

const ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const TONE = {
  info: 'border-signal-blue/40 text-[#9dbcfb]',
  success: 'border-signal-green/40 text-[#7fd6a4]',
  warning: 'border-signal-amber/40 text-[#f0bd6a]',
  error: 'border-signal-red/45 text-[#f29b9b]',
};

export function Toasts() {
  const toasts = useToasts();
  const dismiss = useMineStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismiss(toast.id), 9000),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, dismiss]);

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[90] flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICON[toast.kind];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18 }}
              className={cx(
                'pointer-events-auto rounded-[2px] border bg-ink-900/95 px-3 py-2 shadow-lift backdrop-blur',
                TONE[toast.kind],
              )}
            >
              <div className="flex items-start gap-2">
                <Icon size={13} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] opacity-80">{toast.kind}</div>
                  <div className="mt-0.5 text-[12px] leading-snug text-ink-50">{toast.title}</div>
                  <div className="mt-0.5 text-2xs leading-relaxed text-ink-300">{toast.message}</div>
                </div>
                <button
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 rounded-[2px] p-0.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                >
                  <X size={12} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
