import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { band } from '../lib/factors';
import type { Decision } from '../lib/types';
import { AlertIcon, CheckIcon } from './icons';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong shadow-[0_1px_2px_rgb(26_34_48/0.12)]',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken shadow-[0_1px_2px_rgb(26_34_48/0.06)]',
  danger: 'bg-danger text-white hover:bg-[#921c13] shadow-[0_1px_2px_rgb(26_34_48/0.12)]',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
};

// Press feedback scales to 0.97 (Emil Kowalski): quick, transform-only, and
// dropped entirely for people who ask for reduced motion.
export function Button({
  variant = 'secondary',
  busy = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-[transform,background-color,color] duration-150 ease-(--ease-out) active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {busy && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
      )}
      {children}
    </button>
  );
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'incident' | 'accent';

const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  incident: 'bg-incident-soft text-incident',
  accent: 'bg-accent-soft text-accent-strong',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const DECISION_BADGES: Record<Decision, { tone: Tone; label: string }> = {
  allow: { tone: 'success', label: 'Signature' },
  otp_required: { tone: 'warning', label: 'SMS code' },
  blocked: { tone: 'danger', label: 'Blocked' },
};

export const DecisionBadge = ({ decision }: { decision: Decision }) => (
  <Badge tone={DECISION_BADGES[decision].tone}>{DECISION_BADGES[decision].label}</Badge>
);

const SCORE_TONES = { allow: 'success', otp: 'warning', blocked: 'danger' } as const;

export const ScoreBadge = ({ score }: { score: number }) => (
  <Badge tone={SCORE_TONES[band(score)]}>
    <span className="tabular w-6 text-right">{score}</span>
  </Badge>
);

export function Notice({ tone, title, children }: { tone: 'danger' | 'success' | 'warning' | 'incident'; title: string; children?: ReactNode }) {
  const Icon = tone === 'success' ? CheckIcon : AlertIcon;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg p-3 text-sm ${TONES[tone]}`}>
      <Icon className="mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} className="border-b border-line">
          {Array.from({ length: cols }, (_, col) => (
            <td key={col} className="px-4 py-3">
              <span className="block h-3 w-full max-w-24 animate-pulse rounded bg-sunken motion-reduce:animate-none" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export const shortWallet = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
