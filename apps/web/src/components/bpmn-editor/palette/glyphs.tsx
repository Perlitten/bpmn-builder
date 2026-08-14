import type { PaletteCategoryId } from './catalogPresentation';

const ICON = 22;
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round' as const };

export function CategoryGlyph({ category }: { category: PaletteCategoryId }) {
  switch (category) {
    case 'events':
      return (
        <svg viewBox="0 0 22 22" width={ICON} height={ICON} aria-hidden>
          <circle cx="11" cy="11" r="7.25" {...stroke} />
        </svg>
      );
    case 'activities':
      return (
        <svg viewBox="0 0 22 22" width={ICON} height={ICON} aria-hidden>
          <rect x="3.25" y="6" width="15.5" height="10" rx="2" {...stroke} />
        </svg>
      );
    case 'gateways':
      return (
        <svg viewBox="0 0 22 22" width={ICON} height={ICON} aria-hidden>
          <path d="M11 3.25 18.75 11 11 18.75 3.25 11Z" {...stroke} />
        </svg>
      );
    case 'flows':
      return (
        <svg viewBox="0 0 22 22" width={ICON} height={ICON} aria-hidden>
          <path d="M3.5 11h12.5M12 6.75 17.5 11 12 15.25" {...stroke} />
        </svg>
      );
    case 'participants':
      return (
        <svg viewBox="0 0 22 22" width={ICON} height={ICON} aria-hidden>
          <rect x="3.25" y="4" width="15.5" height="14" {...stroke} />
          <path d="M7.5 4v14" {...stroke} />
        </svg>
      );
    case 'data':
      return (
        <svg viewBox="0 0 22 22" width={ICON} height={ICON} aria-hidden>
          <path d="M6 4.5h7.25L16.5 7.75V17.5H6Z" {...stroke} />
          <path d="M13.25 4.5V7.75H16.5" {...stroke} />
          <path d="M8.25 11h6M8.25 14h4.25" {...stroke} />
        </svg>
      );
    case 'artifacts':
      return (
        <svg viewBox="0 0 22 22" width={ICON} height={ICON} aria-hidden>
          <path d="M9 4.25H5.75v13.5H9" {...stroke} />
          <path d="M11.25 7.5h6M11.25 11h4.5M11.25 14.5h6" {...stroke} />
        </svg>
      );
  }
}
