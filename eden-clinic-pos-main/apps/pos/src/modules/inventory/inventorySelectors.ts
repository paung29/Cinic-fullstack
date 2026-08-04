import { marginBand } from '@/data/money';

export function filterStockProducts<T extends { active: boolean; name: string; barcode: string | null }>(products: readonly T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  return products.filter((product) => product.active && (normalized === '' || product.name.toLowerCase().includes(normalized) || product.barcode?.toLowerCase().includes(normalized)));
}

type StockTableProduct = {
  cost: number;
  price: number;
  stockQty: number;
  lowStockAt: number;
  stockType: 'retail' | 'professional' | 'injectable';
  lots: readonly { lotNo: string; expiry: string | null }[];
};

export function stockTableDetails(product: StockTableProduct): {
  margin: ReturnType<typeof marginBand>;
  typeTone: 'ok' | 'amber' | 'blue';
  lowStock: boolean;
  lotLines: string[];
} {
  return {
    margin: marginBand(product.cost, product.price),
    typeTone: product.stockType === 'retail' ? 'ok' : product.stockType === 'injectable' ? 'amber' : 'blue',
    lowStock: product.stockQty <= product.lowStockAt,
    lotLines: product.stockType === 'injectable'
      ? product.lots.map((lot) => `${lot.lotNo} exp ${lot.expiry ?? '—'}`)
      : [],
  };
}
