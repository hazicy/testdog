import type { SVGProps } from 'react';
const paths = {
  pause: 'M8 4v16M16 4v16',
  maximize: 'M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6',
  tests: 'M9 3h6m-5 0v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 14h8',
  results: 'm8 4 12 8-12 8V4Z',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus: 'M12 5v14M5 12h14',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M6 18 18 6',
  menu: 'M4 5h16v14H4V5Zm6 0v14',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2',
  check: 'm5 12 4 4L19 6',
  edit: 'm15 5 4 4M4 20l4-1L20 7l-4-4L4 15v5Z',
  copy: 'M9 9h11v12H9V9ZM15 6V3H3v12h3',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
};
export function WorkspaceIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
