"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { kes, pct1 } from './format';

type Money = {
  orders: number; soldKes: number; paidKes: number; awaitingPaymentKes: number; averageOrderKes: number;
  cancelledOrders: number; cancelledRate: number; discountsKes: number; shippingKes: number;
  profit: { grossProfitKes: number; marginRate: number | null; costCoverage: number };
  adSpendKes: number; costPerOrderKes: number | null; returnOnAdSpend: number | null; profitAfterAdsKes: number | null;
};

/** What was sold, what is still owed, what was kept after the goods and the ads. */
export function MoneySection({ from, to }: { from: string; to: string }) {
  const [m, setM] = useState<Money | null>(null);

  useEffect(() => {
    setM(null);
    portalFetch(`/portal/analytics/money?${new URLSearchParams({ from, to }).toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setM)
      .catch(() => {});
  }, [from, to]);

  if (!m) return null;
  const covered = m.profit.costCoverage;
  const hasCosts = covered > 0;

  return (
    <div className="portal-card" style={{ marginBottom: 20 }}>
      <h4>Money in this period</h4>
      <div className="money-grid">
        <div><span>Sold</span><strong>{kes(m.soldKes)}</strong><small>{m.orders} order{m.orders === 1 ? '' : 's'}, not counting cancelled</small></div>
        <div><span>Paid</span><strong>{kes(m.paidKes)}</strong><small>{m.awaitingPaymentKes > 0 ? `${kes(m.awaitingPaymentKes)} still to be paid` : 'Nothing outstanding'}</small></div>
        <div><span>Average order</span><strong>{kes(m.averageOrderKes)}</strong><small>{m.cancelledOrders} cancelled ({pct1(m.cancelledRate)})</small></div>
        <div>
          <span>Profit before ads</span>
          <strong>{hasCosts ? kes(m.profit.grossProfitKes) : '–'}</strong>
          <small>{hasCosts ? `${pct1(m.profit.marginRate)} margin, on ${pct1(covered)} of sales that have a cost` : 'Add what you pay for each product to see this'}</small>
        </div>
        <div>
          <span>Ad spend</span>
          <strong>{m.adSpendKes > 0 ? kes(m.adSpendKes) : '–'}</strong>
          <small>{m.costPerOrderKes !== null ? `${kes(m.costPerOrderKes)} per order` : 'Enter it under Visits & ads'}</small>
        </div>
        <div>
          <span>Left after ads</span>
          <strong>{m.profitAfterAdsKes !== null ? kes(m.profitAfterAdsKes) : '–'}</strong>
          <small>{m.returnOnAdSpend !== null ? `${m.returnOnAdSpend.toFixed(1)}x sales per shilling of ads` : 'Needs ad spend and costs'}</small>
        </div>
      </div>
      {hasCosts && covered < 0.8 ? (
        <p className="money-note">Profit covers only {pct1(covered)} of what you sold, because the rest has no cost saved. Add the cost on each product for the full picture.</p>
      ) : null}
    </div>
  );
}
