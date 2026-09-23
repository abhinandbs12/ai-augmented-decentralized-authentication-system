import type { ReactNode } from 'react';
import { CheckIcon, CrossIcon, ShieldIcon } from './icons';

// The customer side reads like a bank's own web banking: one calm card, the
// bank's name, and nothing technical (NFR-07).
export function CustomerFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <span className="grid size-7 place-items-center rounded-md bg-accent text-white">
              <ShieldIcon />
            </span>
            Demo Bank
          </span>
          <span className="text-xs text-ink-3">Secure sign-in · no password</span>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-ink-3">
        Demonstration system running on a local network. Demo customers use test wallets only.
      </footer>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgb(26_34_48/0.06),0_8px_24px_-12px_rgb(26_34_48/0.12)] sm:p-8">
      {children}
    </section>
  );
}

export type StepState = 'done' | 'active' | 'waiting' | 'failed';

// Where the sign-in is, in plain words.
export function Steps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="mt-6 space-y-3">
      {steps.map((step) => (
        <li key={step.label} className="flex items-center gap-3 text-sm">
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-full border ${
              step.state === 'done'
                ? 'border-success bg-success text-white'
                : step.state === 'active'
                  ? 'border-accent'
                  : step.state === 'failed'
                    ? 'border-danger bg-danger text-white'
                    : 'border-line-strong'
            }`}
          >
            {step.state === 'done' && <CheckIcon width={12} height={12} strokeWidth={2} />}
            {step.state === 'failed' && <CrossIcon width={12} height={12} strokeWidth={2} />}
            {step.state === 'active' && (
              <span className="size-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
            )}
          </span>
          <span className={step.state === 'waiting' ? 'text-ink-3' : 'text-ink'}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
