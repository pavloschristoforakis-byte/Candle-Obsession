// Gift guide tiles with the React Bits <SpotlightCard> warm spotlight that follows the pointer.
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import SpotlightCard from '../reactbits/SpotlightCard';

interface Guide {
  id: string;
  name: string;
  description: string;
  icon: string;
  count: number;
  url: string;
}

// Warm cocoa surface instead of the React Bits near-black default (the component spreads `style` last).
const warmTile = {
  '--spotlight-card-surface': '#3a2e26',
  '--spotlight-card-border': 'rgba(242, 190, 132, 0.22)',
  '--spotlight-card-shadow': '0 24px 48px -24px rgba(20, 12, 6, 0.55)',
} as CSSProperties;

function GiftGuide({ guides }: { guides: Guide[] }) {
  return (
    <>
      {guides.map((g) => (
        <a key={g.id} className="guide-link" href={g.url}>
          <SpotlightCard className="guide-tile" theme="dark" spotlightColor="rgba(242, 190, 132, 0.28)" intensity={0.22} spotlightSize={260}
            style={warmTile}>
            <svg className="icon" aria-hidden="true">
              <use href={`#i-${g.icon}`} />
            </svg>
            <span className="guide-name">{g.name}</span>
            <span className="guide-desc">{g.description}</span>
            <span className="guide-count">
              {g.count} {g.count === 1 ? 'product' : 'products'}
              <svg className="icon" aria-hidden="true">
                <use href="#i-arrow" />
              </svg>
            </span>
          </SpotlightCard>
        </a>
      ))}
    </>
  );
}

export function mount(el: HTMLElement): void {
  let guides: Guide[] = [];
  try {
    guides = JSON.parse(el.dataset.guides ?? '[]');
  } catch {
    return; // keep server fallback
  }
  el.replaceChildren();
  createRoot(el).render(<GiftGuide guides={guides} />);
}
