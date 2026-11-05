/**
 * The order just placed, kept for the confirmation page. Checkout knows the order number and total; the confirmation
 * page, reached by a full page load (straight from checkout, or back from the payment provider), reads them from here.
 */
const KEY = 'ng_last_order';

export type RememberedOrder = { id: string; orderNumber: string; totalKes: number; online: boolean };

export function rememberOrder(order: RememberedOrder) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // The confirmation page still works without it, with less detail.
  }
}

export function recallOrder(id: string): RememberedOrder | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(KEY) || 'null');
    return saved && saved.id === id ? saved : null;
  } catch {
    return null;
  }
}
