// Gift-box reveal for the "Gift Boxes & Sets" section (custom, built with motion + React Bits <ClickSpark>).
// When the box scrolls into view the ribbon unties, the lid lifts and the gift sets below fade in one by one.
// Clicking the box ties/unties it again (with sparks). The products are never hidden for long: a safety
// timer reveals them even if the animation never runs, and reduced-motion visitors see them immediately.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, MotionConfig, useInView } from 'motion/react';
import ClickSpark from '../reactbits/ClickSpark';
import { prefersReducedMotion } from '../lib/util';

const spring = { type: 'spring', stiffness: 170, damping: 18 } as const;

function revealGrid(grid: HTMLElement | null): void {
  if (!grid) return;
  grid.classList.remove('is-wrapped');
  grid.classList.add('is-revealed');
}

function GiftReveal({ grid }: { grid: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [open, setOpen] = useState(false);
  // MotionConfig reducedMotion="user" only stops transforms; the endless opacity blink must go too.
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (!inView) return;
    const t = window.setTimeout(() => setOpen(true), 350);
    return () => window.clearTimeout(t);
  }, [inView]);

  useEffect(() => {
    if (open) window.setTimeout(() => revealGrid(grid), 450);
  }, [open, grid]);

  return (
    <MotionConfig reducedMotion="user">
      <div ref={ref} className={`gift-reveal${open ? ' is-open' : ''}`}>
        <ClickSpark sparkColor={['#f2be84', '#d48f49', '#fff3dd']} sparkCount={12} sparkRadius={34} sparkSize={12} duration={520} shape="star" glow={0.6}>
          <button type="button" className="gift-box" aria-pressed={open} onClick={() => setOpen((o) => !o)}>
            <span className="visually-hidden">{open ? 'Tie the gift ribbon again' : 'Untie the gift ribbon'}</span>
            <svg viewBox="0 0 240 210" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="gr-box" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#d9b28a" />
                  <stop offset="1" stopColor="#b98a5e" />
                </linearGradient>
                <linearGradient id="gr-lid" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#e6c49f" />
                  <stop offset="1" stopColor="#c99a6c" />
                </linearGradient>
                <radialGradient id="gr-glow">
                  <stop offset="0" stopColor="#ffe3b5" stopOpacity="0.95" />
                  <stop offset="1" stopColor="#ffb85c" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* warm light escaping from the open box */}
              <motion.ellipse cx="120" cy="98" rx="92" ry="60" fill="url(#gr-glow)"
                initial={false} animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.6 }} transition={{ duration: 0.7 }} />

              {/* box */}
              <rect x="46" y="96" width="148" height="104" rx="6" fill="url(#gr-box)" />
              <rect x="110" y="96" width="20" height="104" fill="#8f2f3a" />
              <rect x="46" y="96" width="148" height="8" fill="#000" opacity="0.08" />

              {/* lid (lifts and tilts away) */}
              <motion.g initial={false} style={{ originX: '50%', originY: '100%' }}
                animate={open ? { y: -58, x: -26, rotate: -16 } : { y: 0, x: 0, rotate: 0 }} transition={{ ...spring, delay: open ? 0.35 : 0 }}>
                <rect x="38" y="74" width="164" height="28" rx="6" fill="url(#gr-lid)" />
                <motion.rect x="110" y="74" width="20" height="28" fill="#a33a46"
                  initial={false} animate={{ scaleY: open ? 0 : 1, opacity: open ? 0 : 1 }} style={{ originY: '0%' }} transition={{ duration: 0.3 }} />
              </motion.g>

              {/* bow: loops shrink and spin off as the ribbon unties */}
              <motion.g initial={false} style={{ originX: '120px', originY: '74px' }}
                animate={open ? { scale: 0.2, rotate: 40, opacity: 0, y: -20 } : { scale: 1, rotate: 0, opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: 'easeIn' }}>
                <path d="M120 74 C 96 44, 70 52, 84 72 C 92 82, 110 78, 120 74Z" fill="#a33a46" />
                <path d="M120 74 C 144 44, 170 52, 156 72 C 148 82, 130 78, 120 74Z" fill="#a33a46" />
                <path d="M120 74 C 112 92, 104 104, 96 116" stroke="#8f2f3a" strokeWidth="8" fill="none" strokeLinecap="round" />
                <path d="M120 74 C 128 92, 138 102, 148 112" stroke="#8f2f3a" strokeWidth="8" fill="none" strokeLinecap="round" />
                <circle cx="120" cy="74" r="8" fill="#7c2531" />
              </motion.g>

              {/* little sparkles that rise out of the box */}
              {!reduced && [0, 1, 2, 3, 4].map((i) => (
                <motion.circle key={i} cx={78 + i * 21} cy={94} r={2.6} fill="#fff1d6"
                  initial={false}
                  animate={open ? { y: [-4, -70 - i * 6], opacity: [0, 1, 0] } : { y: 0, opacity: 0 }}
                  transition={{ duration: 1.6, delay: 0.5 + i * 0.12, repeat: open ? Infinity : 0, repeatDelay: 1.2 }} />
              ))}
            </svg>
            <span className="gift-box-label" aria-hidden="true">{open ? 'Tie the ribbon again' : 'Untie the ribbon'}</span>
          </button>
        </ClickSpark>
      </div>
    </MotionConfig>
  );
}

export function mount(el: HTMLElement): void {
  const grid = document.getElementById(el.dataset.target ?? '');
  if (grid) {
    grid.querySelectorAll<HTMLElement>('.product-card').forEach((card, i) => card.style.setProperty('--i', String(i)));
    if (prefersReducedMotion()) revealGrid(grid);
    else {
      grid.classList.add('is-wrapped');
      window.setTimeout(() => revealGrid(grid), 4000); // never keep products hidden
    }
  }
  createRoot(el).render(<GiftReveal grid={grid} />);
}
