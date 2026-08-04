import { expect, test } from 'vitest';
import { marginBand } from '@/data/money';
import { filterStockProducts, stockTableDetails } from '@/modules/inventory/inventorySelectors';

test('uses centralized money margin thresholds and does not persist presentation values', () => {
  expect(marginBand(60, 100)).toBe('high');
  expect(marginBand(80, 100)).toBe('medium');
  expect(marginBand(90, 100)).toBe('low');
  expect(marginBand(0, 100)).toBe('none');
});

test('filters locally by product search/barcode while excluding retired rows', () => {
  const products = [{ id: 'p1', name: 'Aftercare cream', category: 'Skin', barcode: '123', active: true }, { id: 'p2', name: 'Retired', category: 'Skin', barcode: '456', active: false }] as const;
  expect(filterStockProducts(products, '123')).toEqual([products[0]]);
});

test('derives the visual stock cues an owner reads from one product row', () => {
  expect(stockTableDetails({
    cost: 180_000,
    price: 250_000,
    stockQty: 2,
    lowStockAt: 2,
    stockType: 'injectable',
    lots: [{ lotNo: 'BTX-2311', expiry: '2027-01' }],
  })).toEqual({
    margin: 'medium',
    typeTone: 'amber',
    lowStock: true,
    lotLines: ['BTX-2311 exp 2027-01'],
  });
});
