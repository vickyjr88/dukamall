export const kes = (n: number | null | undefined) => `KES ${Math.round(n ?? 0).toLocaleString()}`;
export const pct1 = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${(n * 100).toFixed(Math.abs(n) < 0.1 && n !== 0 ? 1 : 0)}%`);
