export type DaySummary = {
  /** Orders placed that day, whatever became of them. */
  placed: number;
  cancelled: number;
  /** Placed that day and still waiting for payment. */
  unpaid: number;
  /** Orders that were paid that day (which may have been placed earlier). */
  paidOrders: number;
  revenue: number;
  items: number;
  averageOrder: number;
  /** Discount given on the orders paid that day. */
  discounts: number;
  discountedOrders: number;
};

export type Comparison = {
  label: string;
  revenue: number;
  orders: number;
  /** Percent, or null when the earlier figure is zero and a percentage would mean nothing. */
  revenueChange: number | null;
  ordersChange: number | null;
};

export type OrderRow = { orderNumber: string; customer: string; status: string; method: string; source: string; total: number };
export type ActionOrder = { orderNumber: string; customer: string; total: number; ageHours: number };
export type Seller = { name: string; units: number; revenue: number };
export type StockItem = { name: string; sku: string; onHand: number };
export type Split = { name: string; orders: number; revenue: number };

export type DailyReport = {
  shopName: string;
  currency: string;
  dateKey: string;
  label: string;
  generatedAt: string;
  today: DaySummary;
  vsPreviousDay: Comparison;
  vsLastWeek: Comparison;
  orders: OrderRow[];
  ordersOmitted: number;
  needsAction: {
    awaitingShipment: { count: number; oldest: ActionOrder[] };
    unpaidOver24h: { count: number; value: number; oldest: ActionOrder[] };
  };
  topSellers: Seller[];
  stock: { soldOut: StockItem[]; low: StockItem[] };
  demand: { abandonedCarts: number; abandonedValue: number; whatsappOrderLeads: number; newCustomers: number };
  bySource: Split[];
  byPayment: Split[];
  catalogue: { activeProducts: number; missingPhoto: number; feedItems: number; noStockAnywhere: number; syncedAwaitingStock: number };
};
