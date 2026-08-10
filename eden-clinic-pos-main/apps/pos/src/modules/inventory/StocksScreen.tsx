'use client';

/* eslint-disable @next/next/no-img-element -- shelf photos are local IndexedDB Blob URLs. */

import { useEffect, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiHttpError } from '@/data/api';
import { useClinicBranding } from '@/data/useClinicBranding';
import { createProduct, hasPendingProductCreate, receiveStock, updateExistingProduct } from '@/data/inventoryRecords';
import { marginPct, fmtMMK } from '@/data/money';
import { clearProductPhoto, readProductPhotos, writeProductPhoto } from '@/data/productPhoto';
import type { ProductRow } from '@/data/types';
import { useClinicRuntimeStatus, type ClinicRuntime } from '@/app/providers';
import { useT } from '@/i18n';
import { AppShell, Button, Input, Modal, Select, Skeleton, Tag, useToast } from '@/ui';
import { filterStockProducts, stockTableDetails } from './inventorySelectors';
import styles from './StocksScreen.module.css';

type ProductForm = { name: string; category: string; barcode: string; cost: string; price: string; stock: string; lowStock: string; soldBy: 'each' | 'weight'; stockType: 'retail' | 'injectable'; lotNo: string; lotExpiry: string };

const emptyForm: ProductForm = { name: '', category: 'Skin', barcode: '', cost: '0', price: '0', stock: '0', lowStock: '1', soldBy: 'each', stockType: 'retail', lotNo: '', lotExpiry: '' };

export function StocksScreen() {
  const { runtime } = useClinicRuntimeStatus();
  if (runtime === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  return <ActiveStocksScreen runtime={runtime} />;
}

function ActiveStocksScreen({ runtime }: { runtime: ClinicRuntime }) {
  const router = useRouter();
  const { locale, t } = useT();
  const branding = useClinicBranding(runtime, { brand: t('brand.name'), location: t('brand.location') });
  const { enqueue } = useToast();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [receiveProduct, setReceiveProduct] = useState<ProductRow | undefined>();
  const [editProduct, setEditProduct] = useState<ProductRow | undefined>();
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [receiveQty, setReceiveQty] = useState('1');
  const [receiveCost, setReceiveCost] = useState('');
  const [receiveLot, setReceiveLot] = useState('');
  const [receiveExpiry, setReceiveExpiry] = useState('');
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('0');
  const [editBarcode, setEditBarcode] = useState('');
  const [elevationOpen, setElevationOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photoRevision, setPhotoRevision] = useState(0);
  const session = runtime.session.state();
  const identity = session.kind === 'active' || session.kind === 'auth-required' ? session.identity : undefined;

  useEffect(() => {
    if (identity === undefined) router.replace('/login');
  }, [identity, router]);

  const refresh = async () => {
    const rows = await runtime.db.products.toArray();
    const pending = await Promise.all(rows.map(async (product) => hasPendingProductCreate(runtime.db, product.id)));
    setProducts(rows);
    setPendingIds(new Set(rows.filter((_product, index) => pending[index]).map((product) => product.id)));
  };
  // Refresh is intentionally scheduled after mount; revision/sync callers invoke the same command explicitly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [runtime]);
  // One bulk read per product list rather than a lookup per rendered row, and
  // every object URL created here is revoked when the list changes — a stock
  // screen left open all day would otherwise leak one per refresh.
  useEffect(() => {
    let disposed = false;
    const created: string[] = [];
    void readProductPhotos(runtime.db, products.map((product) => product.id)).then((found) => {
      if (disposed) return;
      const next: Record<string, string> = {};
      found.forEach((blob, id) => {
        const url = URL.createObjectURL(blob);
        created.push(url);
        next[id] = url;
      });
      setPhotoUrls(next);
    });
    return () => {
      disposed = true;
      created.forEach(URL.revokeObjectURL);
    };
  }, [products, photoRevision, runtime.db]);

  const pickProductPhoto = async (productId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    if (file.size > 8_000_000) {
      enqueue(t('setup.logoTooBig'));
      return;
    }
    await writeProductPhoto(runtime.db, productId, file);
    setPhotoRevision((current) => current + 1);
  };

  const removeProductPhoto = async (productId: string) => {
    await clearProductPhoto(runtime.db, productId);
    setPhotoRevision((current) => current + 1);
  };

  if (identity === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  const visible = filterStockProducts(products, query);
  const status = { state: 'synced' as const, pendingCount: 0, attentionCount: 0, drainProgress: 0 };
  const route = (id: string) => id === 'sale' ? '/sale' : id === 'calendar' ? '/calendar' : id === 'clients' ? '/clients' : id === 'analytics' ? '/analytics' : id === 'setup' ? '/setup' : '/stocks';

  const saveNew = async () => {
    const product = await createProduct({ db: runtime.db, now: Date.now(), uuid: () => crypto.randomUUID(), input: {
      name: form.name || t('stocks.name'), category: form.category || 'Other', subcategory: null, sortOrder: products.length,
      barcode: form.barcode || null, cost: Number(form.cost) || 0, price: Number(form.price) || 0, stockQty: Number(form.stock) || 0,
      lowStockAt: Number(form.lowStock) || 0, reorderAt: Number(form.lowStock) || 0, stockType: form.stockType,
      soldBy: form.soldBy, requiresLot: form.stockType === 'injectable', requiresConsent: false, unitLabel: form.soldBy === 'weight' ? 'g' : null, photoKey: null,
      lots: form.stockType === 'injectable' && form.lotNo ? [{ lotNo: form.lotNo, expiry: form.lotExpiry || null, qty: Number(form.stock) || 0 }] : [], active: true,
    } });
    setAddOpen(false); setForm(emptyForm); enqueue(t('sync.syncing')); await refresh();
    void product;
  };

  const lookupBarcode = async () => {
    try {
      const result = await runtime.api.lookupBarcode(form.barcode);
      if (result.found) setForm((current) => ({ ...current, name: result.name ?? current.name, category: result.category ?? current.category }));
    } catch { enqueue(t('sync.attention')); }
  };

  const saveReceive = async () => {
    if (receiveProduct === undefined) return;
    await receiveStock({ db: runtime.db, now: Date.now(), uuid: () => crypto.randomUUID(), input: { productId: receiveProduct.id, qty: Number(receiveQty) || 0, cost: receiveCost === '' ? undefined : Number(receiveCost), lotNo: receiveLot || undefined, lotExpiry: receiveExpiry || undefined } });
    setReceiveProduct(undefined); enqueue(t('sync.syncing')); await refresh();
  };

  const saveEdit = async (token: string) => {
    if (editProduct === undefined) return;
    try {
      await updateExistingProduct({ db: runtime.db, api: runtime.api, productId: editProduct.id, patch: { name: editName, price: Number(editPrice) || 0, barcode: editBarcode || null }, elevationToken: token });
      setEditProduct(undefined); enqueue(t('sync.synced')); await refresh();
    } catch (error) {
      enqueue(error instanceof ApiHttpError && error.code === 'DUPLICATE_BARCODE' ? t('stocks.duplicateBarcode') : t('sync.attention'));
    }
  };

  const requestEdit = (product: ProductRow) => {
    if (pendingIds.has(product.id)) return;
    setEditProduct(product); setEditName(product.name); setEditPrice(String(product.price)); setEditBarcode(product.barcode ?? '');
    if (runtime.elevation.state().kind !== 'active') setElevationOpen(true);
  };

  return <main className={styles.root} data-locale={locale} data-testid="stocks-root" lang={locale === 'zh' ? 'zh-Hans' : locale}>
    <AppShell activeTab="stocks" brand={branding.brand} location={branding.location} logoutLabel={t('shell.logout')} switchUserLabel={t('shell.switchUser')} onSwitchUser={() => { runtime.session.switchUser(); router.push('/login'); }} storageAttention={runtime.storageDiagnostics.state().kind === 'granted' ? undefined : t('shell.storageTag')} onLogout={() => { void runtime.outbox.status().then((next) => { if (next.pendingCount > 0 || next.attentionCount > 0) enqueue(t('auth.logout.blocked')); else { void runtime.session.logout(); router.push('/login'); } }); }} onTabChange={(id) => router.push(id === 'today' ? '/' : route(id))} sync={{ label: t('sync.synced'), state: status.state, count: 0, onClick: () => { void runtime.refreshSync().then(refresh); } }} tabs={[{ id: 'today', label: t('shell.tab.today') }, { id: 'calendar', label: t('shell.tab.calendar') }, { id: 'clients', label: t('shell.tab.clients') }, { id: 'sale', label: t('shell.tab.sale') }, { id: 'stocks', label: t('shell.tab.stocks') }, { id: 'analytics', label: t('shell.tab.analytics') }, { id: 'setup', label: t('shell.tab.setup') }]} userName={identity.name} userRole={identity.role === 'admin' ? t('auth.role.admin') : t('auth.role.staff')}>
      <div className={styles.content}><div className={styles.toolbar}><h1>{t('stocks.title')}</h1><div className={styles.actions}><Input onChange={(event) => setQuery(event.target.value)} placeholder={t('sale.search')} value={query} /><Button data-testid="add-product-open" onClick={() => setAddOpen(true)}>{t('stocks.add')}</Button></div></div><div className={styles.table}><table><thead><tr><th className={styles.photoHead}>{t('stocks.photo')}</th><th>{t('stocks.name')}</th><th>{t('stocks.category')}</th><th>{t('stocks.type')}</th><th>{t('stocks.cost')}</th><th>{t('stocks.price')}</th><th>{t('stocks.margin')}</th><th>{t('stocks.stock')}</th><th /></tr></thead><tbody>{visible.map((product) => { const details = stockTableDetails(product); const margin = marginPct(product.cost, product.price); return <tr data-testid={`stock-row-${product.id}`} key={product.id}><td className={styles.photoCell}>{photoUrls[product.id] === undefined ? <span aria-hidden="true" className={styles.photoEmpty} data-testid={`product-photo-empty-${product.id}`} /> : <img alt={product.name} className={styles.photoThumb} data-testid={`product-photo-${product.id}`} src={photoUrls[product.id]} />}</td><td><span className={styles.productName}><strong>{product.name}</strong>{product.soldBy === 'weight' ? <Tag tone="blue">{t('stocks.weight')}</Tag> : null}</span><br /><small>{product.barcode ?? '—'}</small></td><td>{product.category}</td><td><Tag tone={details.typeTone}>{product.stockType}</Tag></td><td>{product.cost === 0 ? '—' : `${fmtMMK(product.cost)}${product.soldBy === 'weight' && product.unitLabel !== null ? ` / ${product.unitLabel}` : ''}`}</td><td>{product.price === 0 ? '—' : `${fmtMMK(product.price)}${product.soldBy === 'weight' && product.unitLabel !== null ? ` / ${product.unitLabel}` : ''}`}</td><td className={details.margin === 'high' ? styles.marginHigh : details.margin === 'medium' ? styles.marginMedium : details.margin === 'low' ? styles.marginLow : undefined}>{margin === null ? '—' : `${margin}%`}</td><td><span className={styles.stockValue}>{product.stockQty}{product.soldBy === 'weight' && product.unitLabel !== null ? ` ${product.unitLabel}` : ''}{details.lowStock ? <Tag tone="low">{t('tag.low')}</Tag> : null}</span>{details.lotLines.map((line) => <small className={styles.lotLine} key={line}>{line}</small>)}</td><td className={styles.actions}>{pendingIds.has(product.id) ? <span data-testid={`product-waiting-${product.id}`} className={styles.notice}>{t('stocks.pending')}</span> : <Button data-testid={`product-edit-${product.id}`} onClick={() => requestEdit(product)} pill size="sm" variant="ghost">{t('stocks.edit')}</Button>}<Button data-testid={`receive-open-${product.id}`} onClick={() => { setReceiveProduct(product); setReceiveQty('1'); setReceiveCost(''); setReceiveLot(''); setReceiveExpiry(''); }} pill size="sm" variant="ghost">{t('stocks.receive')}</Button></td></tr>; })}</tbody></table>{visible.length === 0 ? <p className={styles.tableEmpty}>{t('stocks.empty')}</p> : null}</div></div>
    </AppShell>
    <Modal closeLabel={t('modal.close')} onClose={() => setAddOpen(false)} open={addOpen} testId="add-product-modal" title={t('stocks.add')}><div className={styles.stack}><div className={styles.fields}><label><span>{t('stocks.barcode')}</span><Input data-testid="add-product-barcode" onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))} value={form.barcode} /></label><Button data-testid="add-product-lookup" onClick={() => { void lookupBarcode(); }} pill variant="ghost">{t('stocks.lookup')}</Button><label><span>{t('stocks.name')}</span><Input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} /></label><label><span>{t('stocks.category')}</span><Input onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} value={form.category} /></label><label><span>{t('stocks.soldBy')}</span><Select data-testid="add-product-sold-by" onChange={(event) => setForm((current) => ({ ...current, soldBy: event.target.value as ProductForm['soldBy'] }))} value={form.soldBy}><option value="each">{t('stocks.each')}</option><option value="weight">{t('stocks.weight')}</option></Select></label><label><span>{t('stocks.type')}</span><Select onChange={(event) => setForm((current) => ({ ...current, stockType: event.target.value as ProductForm['stockType'] }))} value={form.stockType}><option value="retail">retail</option><option value="injectable">injectable</option></Select></label><label><span>{t('stocks.cost')}</span><Input onChange={(event) => setForm((current) => ({ ...current, cost: event.target.value }))} type="number" value={form.cost} /></label><label><span>{t('stocks.price')}</span><Input onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} type="number" value={form.price} /></label><label><span>{t('stocks.stock')}</span><Input onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} type="number" value={form.stock} /></label><label><span>{t('stocks.lowStock')}</span><Input onChange={(event) => setForm((current) => ({ ...current, lowStock: event.target.value }))} type="number" value={form.lowStock} /></label>{form.stockType === 'injectable' ? <><label><span>{t('stocks.lot')}</span><Input onChange={(event) => setForm((current) => ({ ...current, lotNo: event.target.value }))} value={form.lotNo} /></label><label><span>{t('stocks.expiry')}</span><Input onChange={(event) => setForm((current) => ({ ...current, lotExpiry: event.target.value }))} value={form.lotExpiry} /></label></> : null}</div><Button data-testid="add-product-save" disabled={form.name === ''} onClick={() => { void saveNew(); }}>{t('stocks.save')}</Button></div></Modal>
    <Modal closeLabel={t('modal.close')} onClose={() => setReceiveProduct(undefined)} open={receiveProduct !== undefined} testId="receive-modal" title={t('stocks.receive')}><div className={styles.stack}><label><span>{t('sale.quantity')}</span><Input onChange={(event) => setReceiveQty(event.target.value)} type="number" value={receiveQty} /></label><label><span>{t('stocks.cost')}</span><Input onChange={(event) => setReceiveCost(event.target.value)} type="number" value={receiveCost} /></label>{receiveProduct?.stockType === 'injectable' ? <><label><span>{t('stocks.lot')}</span><Input data-testid="receive-lot" onChange={(event) => setReceiveLot(event.target.value)} value={receiveLot} /></label><label><span>{t('stocks.expiry')}</span><Input data-testid="receive-expiry" onChange={(event) => setReceiveExpiry(event.target.value)} value={receiveExpiry} /></label></> : null}<Button data-testid="receive-save" onClick={() => { void saveReceive(); }}>{t('stocks.receive')}</Button></div></Modal>
    <Modal closeLabel={t('modal.close')} onClose={() => setEditProduct(undefined)} open={editProduct !== undefined} testId="product-edit-modal" title={t('stocks.edit')}><div className={styles.stack}><label><span>{t('stocks.name')}</span><Input onChange={(event) => setEditName(event.target.value)} value={editName} /></label><label><span>{t('stocks.price')}</span><Input onChange={(event) => setEditPrice(event.target.value)} type="number" value={editPrice} /></label><label><span>{t('stocks.barcode')}</span><Input onChange={(event) => setEditBarcode(event.target.value)} value={editBarcode} /></label>{editProduct === undefined ? null : <div className={styles.photoEditor}><span>{t('stocks.photo')}</span>{photoUrls[editProduct.id] === undefined ? <p className={styles.notice}>{t('stocks.photoNone')}</p> : <img alt={editProduct.name} className={styles.photoPreview} data-testid="product-photo-preview" src={photoUrls[editProduct.id]} />}<div className={styles.photoActions}><label className={styles.photoPick}><span>{photoUrls[editProduct.id] === undefined ? t('stocks.photoAdd') : t('stocks.photoReplace')}</span><input accept="image/*" className={styles.photoInput} data-testid="product-photo-input" onChange={(event) => { void pickProductPhoto(editProduct.id, event); }} type="file" /></label>{photoUrls[editProduct.id] === undefined ? null : <Button data-testid="product-photo-remove" onClick={() => { void removeProductPhoto(editProduct.id); }} pill size="sm" variant="ghost">{t('stocks.photoRemove')}</Button>}</div></div>}<Button data-testid="product-edit-save" onClick={() => { const elevation = runtime.elevation.state(); if (elevation.kind === 'active') void saveEdit(elevation.token); else setElevationOpen(true); }}>{t('stocks.save')}</Button></div></Modal>
    <Modal closeLabel={t('modal.close')} onClose={() => setElevationOpen(false)} open={elevationOpen} testId="stocks-elevation" title={t('setup.elevate')}><div className={styles.stack}><label><span>{t('setup.password')}</span><Input onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label><Button onClick={() => { void runtime.elevation.elevate(password, 'stocks').then(() => { const elevation = runtime.elevation.state(); setElevationOpen(false); if (elevation.kind === 'active') return saveEdit(elevation.token); return undefined; }).catch(() => enqueue(t('sync.attention'))); }}>{t('setup.elevate')}</Button></div></Modal>
  </main>;
}
