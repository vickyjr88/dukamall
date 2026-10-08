"use client";

// Types, labels and badges shared by the orders list, the order detail screen
// and the new-order form.

export type PaymentStatus = 'PENDING' | 'PAID' | 'CANCELLED';
export type FulfilmentStatus = 'UNFULFILLED' | 'SHIPPED' | 'DELIVERED';
export type OrderSource = 'WEBSITE' | 'WHATSAPP' | 'IN_PERSON' | 'OTHER';
export type PaymentMethod = 'PAYSTACK' | 'CASH' | 'MPESA' | 'BANK_TRANSFER' | 'OTHER';

export type OrderLine = {
  id: string; quantity: number; priceKes: string;
  variant: { name: string; size: string | null; sku: string; product: { name: string; imageUrls?: string[] } };
};
export type OrderNote = { id: string; authorName: string; text: string; createdAt: string };

export type OrderDetail = {
  id: string; orderNumber: string; status: PaymentStatus; fulfilmentStatus: FulfilmentStatus; source: OrderSource;
  firstName: string; lastName: string; email: string | null; phone: string | null; shippingAddress: string | null;
  subtotalKes: string; discountKes: string; shippingKes: string; totalKes: string;
  paymentMethod: PaymentMethod | null; paymentReference: string | null; paystackReference: string | null; paidAt: string | null;
  trackingNote: string | null; shippedAt: string | null; deliveredAt: string | null;
  createdAt: string; lines: OrderLine[]; notes?: OrderNote[]; discount?: { code: string } | null;
};

export const SOURCE_LABEL: Record<OrderSource, string> = { WEBSITE: 'Website', WHATSAPP: 'WhatsApp', IN_PERSON: 'In person', OTHER: 'Other' };
export const METHOD_LABEL: Record<PaymentMethod, string> = { PAYSTACK: 'Card (Paystack)', CASH: 'Cash', MPESA: 'M-Pesa', BANK_TRANSFER: 'Bank transfer', OTHER: 'Other' };
export const FULFILMENT_LABEL: Record<FulfilmentStatus, string> = { UNFULFILLED: 'To ship', SHIPPED: 'Shipped', DELIVERED: 'Delivered' };
export const MANUAL_METHODS: PaymentMethod[] = ['MPESA', 'CASH', 'BANK_TRANSFER', 'OTHER'];

const PAYMENT_CLASS: Record<PaymentStatus, string> = { PENDING: 'is-pending', PAID: 'is-paid', CANCELLED: 'is-cancelled' };
const PAYMENT_LABEL: Record<PaymentStatus, string> = { PENDING: 'Unpaid', PAID: 'Paid', CANCELLED: 'Cancelled' };
const FULFILMENT_CLASS: Record<FulfilmentStatus, string> = { UNFULFILLED: 'is-muted', SHIPPED: 'is-info', DELIVERED: 'is-paid' };

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`portal-badge ${PAYMENT_CLASS[status]}`}>{PAYMENT_LABEL[status]}</span>;
}

export function FulfilmentBadge({ status, cancelled }: { status: FulfilmentStatus; cancelled?: boolean }) {
  if (cancelled) return null; // a cancelled order has no delivery state worth showing
  return <span className={`portal-badge ${FULFILMENT_CLASS[status]}`}>{FULFILMENT_LABEL[status]}</span>;
}

export const money = (n: number | string) => `KES ${Number(n).toLocaleString()}`;
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '');

/** The payment method an order shows -- an online order from before the column existed has only a Paystack reference. */
export function methodOf(order: Pick<OrderDetail, 'paymentMethod' | 'paystackReference' | 'status'>): PaymentMethod | null {
  if (order.paymentMethod) return order.paymentMethod;
  return order.status === 'PAID' && order.paystackReference ? 'PAYSTACK' : null;
}

export function whatsappLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
