// Warm shimmer across the hero eyebrow text, using React Bits <ShinyText>.
import { createRoot } from 'react-dom/client';
import ShinyText from '../reactbits/ShinyText';

export function mount(el: HTMLElement): void {
  const text = el.dataset.text ?? el.textContent ?? '';
  createRoot(el).render(
    <ShinyText text={text} color="#f3d9b6" shineColor="#fff8ec" speed={3.5} delay={1.5} shineWidth={30} />,
  );
}
