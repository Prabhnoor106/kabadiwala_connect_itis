/**
 * Inline SVG icon set.
 *
 * Hand-rolled rather than a library: the whole set is under 4 KB, which matters
 * for entry-level Android handsets on metered connections. Every icon inherits
 * currentColor and uses a 24×24 grid with a 2px stroke.
 */

const paths = {
  // Navigation
  home: 'M3 10.5 12 3l9 7.5M5.25 9.75V20.25h13.5V9.75',
  tag: 'M7 7h.01M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z',
  plus: 'M12 5v14M5 12h14',
  package: 'M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5m0 0 9-5m-9 5v9',
  wallet: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9ZM16 12h2',
  shield: 'M12 3 4.5 6v5.25c0 4.5 3.1 8.4 7.5 9.75 4.4-1.35 7.5-5.25 7.5-9.75V6L12 3Z',
  chart: 'M3 20.25h18M6.75 17V10M11.25 17V5.5M15.75 17v-8M20.25 17v-4',
  users: 'M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM3.75 20.25a8.25 8.25 0 0 1 16.5 0',
  factory: 'M3 20.25h18M4.5 20.25V10l5 3.5V10l5 3.5V6l5 3.5v10.75M8 16.5h.01M13 16.5h.01',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5a8 8 0 0 0-.13-1.42l2.1-1.63-2-3.46-2.48 1a8 8 0 0 0-2.46-1.42L14.6 2h-4l-.43 2.65A8 8 0 0 0 7.7 6.07l-2.48-1-2 3.46 2.1 1.63A8.1 8.1 0 0 0 5.2 12c0 .48.04.95.12 1.42l-2.1 1.63 2 3.46 2.48-1a8 8 0 0 0 2.46 1.42L10.6 22h4l.43-2.65a8 8 0 0 0 2.46-1.42l2.48 1 2-3.46-2.1-1.63c.08-.47.13-.94.13-1.42Z',

  // Status
  check: 'M4.5 12.75 9 17.25 19.5 6.75',
  checkCircle: 'M8.5 12.5l2.5 2.5 4.5-5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  xCircle: 'M9.5 9.5l5 5m0-5-5 5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  x: 'M6 6l12 12M18 6 6 18',
  clock: 'M12 7.5V12l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  alert: 'M12 9v4m0 3h.01M10.3 3.9 2.4 17.4A1.9 1.9 0 0 0 4 20.3h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z',
  info: 'M12 11v5m0-8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  truck: 'M2.5 6.5h10v10h-10zM12.5 10h4l3 3v3.5h-7M6 19.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM16.5 19.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z',
  handCoins: 'M3 13.5l4-1.5 7 2 4-2M3 17.5l4-1.5 7 2 4-2M16 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  flag: 'M5 21V4.5m0 0h11l-1.5 4 1.5 4H5',

  // Actions
  camera:
    'M4.5 8.25h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0 1 19 9.75v8A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5v-8ZM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  location: 'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  phone: 'M6.5 3h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5L16 12l4 1.5v3a1.5 1.5 0 0 1-1.7 1.5A15.5 15.5 0 0 1 5 5.7 1.5 1.5 0 0 1 6.5 3Z',
  speaker: 'M11 5 6.5 9H3.5v6h3L11 19V5ZM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10',
  search: 'M20 20l-4.5-4.5M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  filter: 'M3 6h18M6.5 12h11M10 18h4',
  refresh: 'M3.5 12a8.5 8.5 0 0 1 14.5-6M20.5 12a8.5 8.5 0 0 1-14.5 6M18 3v5h-5M6 21v-5h5',
  logout: 'M15 8V6a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 15 18v-2M11 12h10m0 0-3-3m3 3-3 3',
  edit: 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
  trash: 'M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v5M14 11v5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12S18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M4 19.5h16',
  chevronRight: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronDown: 'M5 9l7 7 7-7',
  arrowUp: 'M12 20V4m0 0-6 6m6-6 6 6',
  arrowDown: 'M12 4v16m0 0 6-6m-6 6-6-6',
  minus: 'M5 12h14',
  menu: 'M4 7h16M4 12h16M4 17h16',
  wifiOff: 'M3 3l18 18M8.5 14.5a5 5 0 0 1 6-.8M5 11a10 10 0 0 1 3-1.9M12 19h.01',
  sync: 'M4 5v5h5M20 19v-5h-5M4.6 14a8 8 0 0 0 13.3 3.4L20 15M19.4 10A8 8 0 0 0 6.1 6.6L4 9',
};

/**
 * @param {Object} props
 * @param {keyof typeof paths} props.name
 * @param {number} [props.size=20]
 * @param {string} [props.className]
 * @param {boolean} [props.filled] - Fill instead of stroke (badges/pills)
 */
export default function Icon({ name, size = 20, className = '', filled = false, ...rest }) {
  const d = paths[name];
  if (!d) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

export const iconNames = Object.keys(paths);
