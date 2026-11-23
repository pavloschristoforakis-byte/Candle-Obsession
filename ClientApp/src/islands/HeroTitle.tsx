// Hero headline animated with React Bits <BlurText> (words drift down out of a soft blur).
import { createRoot } from 'react-dom/client';
import BlurText from '../reactbits/BlurText';

export function mount(el: HTMLElement): void {
  const text = el.dataset.text ?? el.textContent ?? '';
  el.setAttribute('aria-label', text); // screen readers get the plain sentence, not word fragments
  createRoot(el).render(
    <span aria-hidden="true">
      <BlurText text={text} animateBy="words" direction="top" delay={140} stepDuration={0.45} blur={12} distance={28} trigger="load" />
    </span>,
  );
}
