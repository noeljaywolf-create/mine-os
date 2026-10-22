import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useCapabilities } from '../store/hooks';
import { Badge, Notice, cx } from '../design-system';
import type { Capability } from '../domain/types';
import type { ModuleDefinition } from '../app/modules';

export function ModuleHeader({
  module,
  actions,
  children,
}: {
  module: ModuleDefinition;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="label-micro text-signal-cyan/80">{module.group}</span>
            <span className="h-2.5 w-px bg-[color:var(--hairline)]" />
            <span className="label-micro">{module.id.replace(/-/g, ' ')}</span>
            {module.product && (
              <Badge tone={module.product === 'deepwater' ? 'cyan' : module.product === 'impact' ? 'amber' : 'neutral'}>
                {module.product === 'core' ? 'shared core' : module.product}
              </Badge>
            )}
          </div>
          <h1 className="mt-1 text-[19px] font-medium leading-tight tracking-[-0.01em] text-ink-50">{module.label}</h1>
          <p className="mt-0.5 max-w-[760px] text-[11.5px] leading-relaxed text-ink-400">{module.description}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
      {children && <div className="mt-2.5">{children}</div>}
    </header>
  );
}

export function ModuleGate({ capability, children }: { capability: Capability | Capability[]; children: ReactNode }) {
  const capabilities = useCapabilities();
  const needed = Array.isArray(capability) ? capability : [capability];
  const missing = needed.filter((item) => !capabilities.can(item));
  if (missing.length === 0) return <>{children}</>;

  return (
    <Notice
      tone="amber"
      icon={<Lock size={14} />}
      title="This view is outside the current role's remit"
    >
      <p>
        The role <strong className="text-ink-100">{capabilities.title}</strong> does not hold{' '}
        {missing.map((item) => (
          <code key={item} className="mr-1 rounded-[2px] bg-ink-900 px-1 font-mono text-[10px] text-ink-200">
            {item}
          </code>
        ))}
        . Switch role in the top bar to demonstrate that separation of duty. Role switching is a demonstration
        control, not authentication.
      </p>
    </Notice>
  );
}

export function PanelTitle({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-center justify-between gap-2 border-b border-[color:var(--hairline)] px-3 py-2', className)}>
      <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-400">{children}</span>
      {right && <div className="flex items-center gap-1.5">{right}</div>}
    </div>
  );
}
