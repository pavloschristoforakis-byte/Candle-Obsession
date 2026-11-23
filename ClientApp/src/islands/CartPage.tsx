import { createRoot } from 'react-dom/client';
import { CartView } from './CartView';

export function mount(el: HTMLElement): void {
  el.replaceChildren();
  createRoot(el).render(<CartView />);
}
