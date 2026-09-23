// One authored icon set: 16px grid, 1.5 stroke, round joins.
import type { SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M8 1.75 2.75 3.75v4c0 3.1 2.2 5.45 5.25 6.5 3.05-1.05 5.25-3.4 5.25-6.5v-4L8 1.75Z" /></Icon>
);
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="m3.25 8.25 3 3 6.5-6.5" /></Icon>
);
export const CrossIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="m4 4 8 8M12 4l-8 8" /></Icon>
);
export const AlertIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M8 5.5v3M8 11h.01M6.9 2.4 1.6 11.6c-.5.85.1 1.9 1.1 1.9h10.6c1 0 1.6-1.05 1.1-1.9L9.1 2.4a1.27 1.27 0 0 0-2.2 0Z" /></Icon>
);
export const WalletIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M2.25 4.75A1.5 1.5 0 0 1 3.75 3.25h8.5v2.5M2.25 4.75v6.5a1.5 1.5 0 0 0 1.5 1.5h9.5v-7H3.75a1.5 1.5 0 0 1-1.5-1Z" /><path d="M10.75 9.25h.01" /></Icon>
);
export const ActivityIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M1.75 8h2.5l1.75-4.5 3.5 9 1.75-4.5h2.5" /></Icon>
);
export const LedgerIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M3.25 2.25h9.5v11.5h-9.5zM5.75 5.25h4.5M5.75 8h4.5M5.75 10.75h2.5" /></Icon>
);
export const PowerIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M8 1.75V7.5M4.6 4.1a5.25 5.25 0 1 0 6.8 0" /></Icon>
);
export const LogOutIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M6.25 13.75h-2.5a1.5 1.5 0 0 1-1.5-1.5v-8.5a1.5 1.5 0 0 1 1.5-1.5h2.5M10.5 11.25 13.75 8 10.5 4.75M13.75 8h-7.5" /></Icon>
);
export const RefreshIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M13.25 3.25v3h-3M2.75 12.75v-3h3M12.6 6.1A5 5 0 0 0 3.8 5M3.4 9.9a5 5 0 0 0 8.8 1.1" /></Icon>
);
