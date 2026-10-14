import type { SVGProps } from "react";

/**
 * Small house icon set (24px grid, 1.75 stroke). Kept deliberately short:
 * icons only where they speed up scanning (dates, places, actions), never as
 * decoration on every heading.
 */
const PATHS = {
  "arrow-right": <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  "arrow-left": <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />,
  "arrow-up-right": <path d="M7 17 17 7M8.5 7H17v8.5" />,
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  search: (
    <>
      <circle cx="10.75" cy="10.75" r="6.25" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M3.5 7h17M3.5 12h17M3.5 17h11" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  bookmark: <path d="M6.5 4h11v16.5L12 16.5l-5.5 4Z" />,
  "bookmark-filled": <path d="M6.5 4h11v16.5L12 16.5l-5.5 4Z" fill="currentColor" />,
  share: <path d="M12 14.5V3.5M7.5 8 12 3.5 16.5 8M5 12.5v8h14v-8" />,
  check: <path d="m4.5 12.5 4.75 4.75L19.5 7" />,
  plus: <path d="M12 4.5v15M4.5 12h15" />,
  minus: <path d="M4.5 12h15" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5c1.2-3.8 4-5.8 7.5-5.8s6.3 2 7.5 5.8" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c.9-3.2 3.2-4.9 6-4.9s5.1 1.7 6 4.9M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.9c1.7.6 3 2.1 3.5 4.6" />
    </>
  ),
  bell: <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15ZM10 20.5a2 2 0 0 0 4 0" />,
  home: <path d="M4 10.5 12 4l8 6.5V20H4ZM10 20v-5.5h4V20" />,
  ticket: <path d="M3.5 7h17v3.25a1.75 1.75 0 0 0 0 3.5V17h-17v-3.25a1.75 1.75 0 0 0 0-3.5ZM14.5 7v10" />,
  megaphone: <path d="M4 9.75v4.5h3.25L14 18.5v-13L7.25 9.75ZM17.25 9a3.75 3.75 0 0 1 0 6" />,
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m20.5 15.5-5-5-8.5 9" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h4M12 17h8" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  chart: <path d="M4.5 20V11M10 20V4.5M15.5 20v-6.5M3 20.5h18" />,
  file: <path d="M6.5 3.5h7.5l4 4v13h-11.5ZM13.5 3.5V8h4.5M9.5 12.5h5M9.5 16h5" />,
  edit: <path d="M4.5 19.5h3.75L19 8.75 15.25 5 4.5 15.75ZM13.5 6.75l3.75 3.75" />,
  eye: (
    <>
      <path d="M2.75 12S6 5.5 12 5.5 21.25 12 21.25 12 18 18.5 12 18.5 2.75 12 2.75 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </>
  ),
  logout: <path d="M14.5 4.5h5v15h-5M10 8l-4 4 4 4M6 12h9.5" />,
  external: <path d="M13.5 4.5h6v6M19.5 4.5l-8.5 8.5M17.5 13.5v6h-13v-13h6" />,
  filter: <path d="M3.5 6.5h17M7 12h10M10.5 17.5h3" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4 6.5 8 6 8-6" />
    </>
  ),
  phone: <path d="M8 3.5H5.5a1.5 1.5 0 0 0-1.5 1.6C4.6 13.3 10.7 19.4 18.9 20a1.5 1.5 0 0 0 1.6-1.5V16l-4-1.5-2 2a12 12 0 0 1-5.5-5.5l2-2Z" />,
  shield: <path d="M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V6Z" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  alert: <path d="M12 4 21 19.5H3ZM12 10v4.5M12 17.25v.25" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.75V8" />
    </>
  ),
  grid: <path d="M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 13h7v7h-7Z" />,
  list: <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M3.5 6.5h1M3.5 12h1M3.5 17.5h1" />,
  upload: <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M4.5 15v4.5h15V15" />,
  dots: <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="3" />,
  instagram: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M16.9 7.1h.01" strokeWidth="2.4" />
    </>
  ),
  tiktok: <path d="M13.5 4v10.75a3.25 3.25 0 1 1-3.25-3.25M13.5 4c.4 2.6 2.2 4.3 4.75 4.5" />,
  linkedin: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8.25 10.5v5.5M8.25 7.75v.25M11.75 16v-5.5M11.75 13c0-1.6 1-2.6 2.25-2.6s2 .9 2 2.6v3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5Z" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  name: IconName;
  /** Pixel size; defaults to 1em so icons follow the text size. */
  size?: number | string;
  /** Provide a label only when the icon carries meaning on its own. */
  label?: string;
}

export function Icon({ name, size = "1em", label, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
