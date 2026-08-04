'use client';

/* eslint-disable @next/next/no-img-element -- Receipts are local Canvas-rasterized Blob URLs. */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicRuntimeStatus, type ClinicRuntime } from '@/app/providers';
import { usePwaUpdate } from '@/app/pwaUpdate';
import { offlineApprovalsState } from '@/data/adminEnvelopes';
import { cartSubtotal, fmtMMK } from '@/data/money';
import { consumeSalePrefill } from '@/data/salePrefill';
import type { OutboxStatusView } from '@/data/outbox';
import { authEnvelopeMetaKey } from '@/data/db';
import { readPrinterProfile, type PrinterProfile } from '@/data/printerProfile';
import { useT } from '@/i18n';
import {
  captureSale,
  cartDraftTotal,
  saleBalanceDue,
  type CartLineDraft,
  type SaleDraft,
  type TenderDraft,
} from '@/modules/sale/capture';
import { applySalePrefill } from '@/modules/sale/salePrefillConsumption';
import { captureWithinBoundary } from '@/modules/sale/captureBoundary';
import { resumeTicket, type SaleTicket } from '@/modules/sale/tickets';
import { saveTicket } from '@/modules/sale/tickets';
import { renderReceipt, type ReceiptPalette, type RenderedReceipt } from '@/print/receipt';
import { buildConfirmedReceiptInput } from '@/print/receiptInput';
import { createM5PrinterTransport, createPngShareTransport } from '@/print/transport';
import { AppShell, Button, Input, Modal, PinPad, Skeleton, Tabs, useToast } from '@/ui';
import type { PatientRow, ProductRow, SaleRow, ServiceRow, StaffRow } from '@/data/types';
import styles from './SaleScreen.module.css';

type CatalogueTab = 'services' | 'products';
type CatalogueCategory = 'all' | string;
type ApprovalRequest = { kind: 'discount'; percent: number } | { kind: 'credit'; projectedCredit: number; patientId: string };
type PendingLot = { service: ServiceRow; qty: number };

export function SaleScreen() {
  const { runtime } = useClinicRuntimeStatus();
  if (runtime === undefined) {
    return <main className={styles.loading}><Skeleton size="loading" /></main>;
  }

  return <ActiveSaleScreen runtime={runtime} />;
}

function ActiveSaleScreen({ runtime }: { runtime: ClinicRuntime }) {
  const router = useRouter();
  const { locale, t } = useT();
  const { enqueue } = useToast();
  const pwaUpdate = usePwaUpdate();
  const { revision } = useClinicRuntimeStatus();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [provisionedAdminIds, setProvisionedAdminIds] = useState<string[]>([]);
  const [tickets, setTickets] = useState<SaleTicket[]>([]);
  const [catalogueTab, setCatalogueTab] = useState<CatalogueTab>('services');
  const [catalogueCategory, setCatalogueCategory] = useState<CatalogueCategory>('all');
  const [search, setSearch] = useState('');
  const [scannerValue, setScannerValue] = useState('');
  const [draft, setDraft] = useState<SaleDraft>({ patientId: null, appointmentId: null, lines: [], discountPct: 0, discountApprovedBy: null });
  const [tenders, setTenders] = useState<TenderDraft[]>([]);
  const [creditApprovedBy, setCreditApprovedBy] = useState<string | null>(null);
  const [isCustomDiscount, setCustomDiscount] = useState(false);
  const [pendingLot, setPendingLot] = useState<PendingLot | undefined>();
  const [pendingWeight, setPendingWeight] = useState<ProductRow | undefined>();
  const [weightQuantity, setWeightQuantity] = useState('1');
  const [unknownCode, setUnknownCode] = useState<string | undefined>();
  const [tenderOpen, setTenderOpen] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | undefined>();
  const [approvalPin, setApprovalPin] = useState('');
  const [approvalStaffId, setApprovalStaffId] = useState('');
  const [receipt, setReceipt] = useState<SaleRow | undefined>();
  const [renderedReceipt, setRenderedReceipt] = useState<RenderedReceipt | undefined>();
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | undefined>();
  const [printerProfile, setPrinterProfile] = useState<PrinterProfile | undefined>();
  const [lotNo, setLotNo] = useState('');
  const [lotExpiry, setLotExpiry] = useState('');
  const [syncStatus, setSyncStatus] = useState<OutboxStatusView>({ state: 'synced', pendingCount: 0, attentionCount: 0, drainProgress: 0 });
  const [hasAdminEnvelope, setHasAdminEnvelope] = useState(true);
  const prefillChecked = useRef(false);

  const refreshLocal = async () => {
    const [nextServices, nextProducts, nextPatients, nextStaff, meta, approvals] = await Promise.all([
      runtime.db.services.toArray(),
      runtime.db.products.toArray(),
      runtime.db.patients.toArray(),
      runtime.db.staff.toArray(),
      runtime.db.meta.filter((row) => row.key.startsWith('sale-ticket:')).toArray(),
      offlineApprovalsState(runtime.db),
    ]);
    setServices(nextServices.filter((row) => row.active));
    setProducts(nextProducts.filter((row) => row.active));
    setPatients(nextPatients);
    setStaff(nextStaff.filter((row) => row.active));
    const activeAdmins = nextStaff.filter((row) => row.active && row.role === 'admin');
    const adminKeys = activeAdmins.map((row) => authEnvelopeMetaKey(row.id));
    const adminEnvelopes = await runtime.db.meta.bulkGet(adminKeys);
    setProvisionedAdminIds(activeAdmins
      .filter((_row, index) => adminEnvelopes[index] !== undefined)
      .map((row) => row.id));
    setTickets(meta.flatMap((row) => isTicket(row.value) ? [row.value] : []));
    setSyncStatus(await runtime.outbox.status());
    setHasAdminEnvelope(approvals.hasAdminEnvelope);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshLocal(); }, 0);
    return () => window.clearTimeout(timer);
  // Revision changes after bootstrap, auth state, and sync completion.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, runtime]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        if (prefillChecked.current) return;
        prefillChecked.current = true;
        const staged = await runtime.db.meta.get('sale-prefill');
        if (staged?.value !== undefined && typeof staged.value === 'object' && staged.value !== null && !Array.isArray(staged.value)) {
          const candidate = staged.value as { appointmentId?: unknown; patientId?: unknown; serviceId?: unknown };
          if (typeof candidate.appointmentId === 'string' && typeof candidate.patientId === 'string' && typeof candidate.serviceId === 'string') {
            const [patient, service] = await Promise.all([runtime.db.patients.get(candidate.patientId), runtime.db.services.get(candidate.serviceId)]);
            const accepted = applySalePrefill({ patientId: null, appointmentId: null, lines: [], discountPct: 0, discountApprovedBy: null }, candidate as { appointmentId: string; patientId: string; serviceId: string }, patient, service, crypto.randomUUID());
            if (accepted !== undefined) {
              const consumed = await consumeSalePrefill(runtime.db);
              if (consumed !== undefined) setDraft(accepted);
              return;
            }
          }
        }
        const patientId = new URLSearchParams(window.location.search).get('patient');
        if (patientId !== null && await runtime.db.patients.get(patientId) !== undefined) {
          setDraft((current) => ({ ...current, patientId }));
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [runtime]);

  useEffect(() => {
    if (receipt === undefined) return undefined;
    let disposed = false;
    let objectUrl: string | undefined;
    void (async () => {
      const [clinic, storedProfile] = await Promise.all([
        runtime.db.clinic.toCollection().first(),
        readPrinterProfile(runtime.db, runtime.deviceId),
      ]);
      if (clinic === undefined || disposed) return;
      const profile = storedProfile ?? { version: 1, transport: 'generic-escpos', width: 576 } satisfies PrinterProfile;
      const rendered = await renderReceipt(buildConfirmedReceiptInput({
        sale: receipt,
        clinic,
        width: profile.width,
        palette: receiptPalette(),
      }), { fonts: document.fonts });
      if (disposed) return;
      objectUrl = URL.createObjectURL(rendered.png);
      setPrinterProfile(profile);
      setRenderedReceipt(rendered);
      setReceiptImageUrl(objectUrl);
    })().catch(() => {
      if (!disposed) enqueue(t('sync.attention'));
    });
    return () => {
      disposed = true;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [enqueue, receipt, runtime, t]);

  const sessionState = runtime.session.state();
  const activeIdentity = sessionState.kind === 'active' || sessionState.kind === 'auth-required'
    ? sessionState.identity
    : undefined;

  useEffect(() => {
    if (activeIdentity === undefined) router.replace('/login');
  }, [activeIdentity, router]);

  const selectedPatient = patients.find((patient) => patient.id === draft.patientId);
  const total = cartDraftTotal(draft, 500);
  const paid = cartSubtotal(tenders.map((tender) => ({ qty: 1, unitPrice: tender.amount })), 1);
  const balance = saleBalanceDue(total, paid);
  // A4 cart guard: it is intentionally independent of outbox/sync state.
  const hasUncommittedCart = draft.lines.length > 0 || tenderOpen;

  useEffect(() => {
    pwaUpdate.setHasUncommittedCart(hasUncommittedCart);
    return () => pwaUpdate.setHasUncommittedCart(false);
  }, [hasUncommittedCart, pwaUpdate]);

  if (activeIdentity === undefined) {
    return <main className={styles.loading}><Skeleton size="loading" /></main>;
  }

  const addLine = (source: ServiceRow | ProductRow, qty = 1, lot: { lotNo: string | null; lotExpiry: string | null } = { lotNo: null, lotExpiry: null }) => {
    const isService = 'nameMm' in source;
    const line: CartLineDraft = {
      id: crypto.randomUUID(),
      kind: isService ? 'service' : 'product',
      itemId: source.id,
      nameSnapshot: isService ? source.nameEn ?? source.nameMm : source.name,
      qty,
      unitPrice: source.price,
      discountPct: null,
      note: null,
      lotNo: lot.lotNo,
      lotExpiry: lot.lotExpiry,
    };
    setDraft((current) => ({ ...current, lines: [...current.lines, line] }));
  };

  const addService = (service: ServiceRow) => {
    if (service.requiresLot) {
      setPendingLot({ service, qty: 1 });
      setLotNo('');
      setLotExpiry('');
      return;
    }
    addLine(service);
  };

  const addProduct = (product: ProductRow) => {
    if (product.soldBy === 'weight') {
      setPendingWeight(product);
      setWeightQuantity('1');
      return;
    }
    addLine(product);
  };

  const scan = () => {
    const code = scannerValue.trim();
    if (code === '') return;
    const product = products.find((entry) => entry.barcode === code);
    if (product === undefined) {
      setUnknownCode(code);
    } else if (product.stockType !== 'retail') {
      enqueue(t('sale.restricted'));
    } else {
      addProduct(product);
    }
    setScannerValue('');
  };

  const saveCurrentTicket = async () => {
    const ticket: SaleTicket = {
      id: crypto.randomUUID(),
      staffId: activeIdentity.staffId,
      savedAt: new Date().toISOString(),
      draft,
    };
    await saveTicket(runtime.db, ticket);
    setDraft({ patientId: null, appointmentId: null, lines: [], discountPct: 0, discountApprovedBy: null });
    setTenders([]);
    setCreditApprovedBy(null);
    setCustomDiscount(false);
    await refreshLocal();
  };

  const resumeFirstTicket = async () => {
    const ticket = tickets[0];
    if (ticket === undefined) return;
    const resumed = await resumeTicket(runtime.db, ticket.id);
    setDraft(resumed.draft);
    setTenders([]);
    setCreditApprovedBy(null);
    setCustomDiscount(![0, 5, 10, 15, 20].includes(resumed.draft.discountPct));
    await refreshLocal();
  };

  const requestCapture = async () => {
    if (draft.discountPct > 20 && draft.discountApprovedBy === null) {
      setApprovalRequest({ kind: 'discount', percent: draft.discountPct });
      return;
    }
    const projectedCredit = balance > 0 ? balance : 0;
    if (projectedCredit > 0 && draft.patientId !== null) {
      const currentCredit = cartSubtotal(
        (await runtime.db.sales.where('patientId').equals(draft.patientId).toArray()).map((sale) => ({ qty: 1, unitPrice: sale.credit })),
        1,
      );
      const patientCredit = cartSubtotal([{ qty: 1, unitPrice: currentCredit }, { qty: 1, unitPrice: projectedCredit }], 1);
      const clinicRow = await runtime.db.clinic.toCollection().first();
      if (clinicRow !== undefined && patientCredit > clinicRow.creditLimitMmk && creditApprovedBy === null) {
        setApprovalRequest({ kind: 'credit', projectedCredit: patientCredit, patientId: draft.patientId });
        return;
      }
    }

    try {
      const status = await runtime.outbox.status();
      const captured = await captureWithinBoundary(runtime.beginCaptureBoundary, () => captureSale({
        db: runtime.db,
        staffId: activeIdentity.staffId,
        deviceId: runtime.deviceId,
        draft,
        tenders,
        creditApprovedBy,
        createdOffline: status.state === 'offline',
        clock: { now: () => Date.now() },
        uuid: () => crypto.randomUUID(),
      }));
      setTenderOpen(false);
      setRenderedReceipt(undefined);
      setReceiptImageUrl(undefined);
      setReceipt(captured);
      setDraft({ patientId: null, appointmentId: null, lines: [], discountPct: 0, discountApprovedBy: null });
      setTenders([]);
      setCreditApprovedBy(null);
      setCustomDiscount(false);
      void runtime.refreshSync().then(refreshLocal);
      await refreshLocal();
    } catch {
      enqueue(t('sync.attention'));
    }
  };

  const verifyApproval = async () => {
    if (approvalRequest === undefined || approvalStaffId === '' || approvalPin.length !== 4) return;
    try {
      const approver = await runtime.verifyOfflineAdmin(approvalStaffId, approvalPin);
      if (approvalRequest.kind === 'discount') {
        setDraft((current) => ({ ...current, discountApprovedBy: approver.staffId }));
      } else {
        setCreditApprovedBy(approver.staffId);
      }
      setApprovalPin('');
      setApprovalRequest(undefined);
    } catch {
      setApprovalPin('');
      enqueue(t('auth.login.wrongPin'));
    }
  };

  const provisionedAdmins = staff.filter((member) => member.role === 'admin' && provisionedAdminIds.includes(member.id));
  const syncLabels = {
    synced: t('sync.synced'),
    syncing: t('sync.syncing'),
    offline: t('sync.offline'),
    attention: t('sync.attention'),
  };
  const syncLabel = syncLabels[syncStatus.state];
  const storageAttention = runtime.storageDiagnostics.state().kind === 'granted' ? undefined : t('shell.storageAttention');
  const serviceCategories: ReadonlyArray<{ id: CatalogueCategory; label: string }> = [
    { id: 'all', label: t('sale.category.all') },
    { id: 'Laser', label: t('sale.category.laser') },
    { id: 'Injectables', label: t('sale.category.injectables') },
    { id: 'Brows & Lips', label: t('sale.category.browsLips') },
    { id: 'Skin', label: t('sale.category.skin') },
  ];
  const productCategories: ReadonlyArray<{ id: CatalogueCategory; label: string }> = [
    { id: 'all', label: t('sale.category.all') },
    ...Array.from(new Set(products.map((product) => product.category))).map((category) => ({ id: category, label: category })),
  ];
  const categories = catalogueTab === 'services' ? serviceCategories : productCategories;
  const visibleServices = services.filter((service) => (
    (catalogueCategory === 'all' || service.category === catalogueCategory)
    && `${service.nameMm} ${service.nameEn ?? ''}`.toLowerCase().includes(search.toLowerCase())
  ));
  const visibleProducts = products.filter((product) => (
    (catalogueCategory === 'all' || product.category === catalogueCategory)
    && product.name.toLowerCase().includes(search.toLowerCase())
  ));

  return (
    <main className={styles.root} data-locale={locale} data-testid="sale-root" lang={locale === 'zh' ? 'zh-Hans' : locale}>
      <AppShell
        activeTab="sale"
        brand={t('brand.name')}
        location={t('brand.location')}
        logoutLabel={t('shell.logout')}
        switchUserLabel={t('shell.switchUser')}
        switchUserDisabled={hasUncommittedCart}
        onSwitchUser={() => { runtime.session.switchUser(); router.push('/login'); }}
        onLogout={() => { void runtime.outbox.status().then((status) => {
          if (status.pendingCount > 0 || status.attentionCount > 0) enqueue(t('auth.logout.blocked'));
          else { runtime.session.logout(); router.push('/login'); }
        }); }}
        onTabChange={(id) => router.push(id === 'today' ? '/' : id === 'clients' ? '/clients' : id === 'calendar' ? '/calendar' : id === 'stocks' ? '/stocks' : id === 'setup' ? '/setup' : '/sale')}
        sync={{ label: syncLabel, state: syncStatus.state, count: syncStatus.pendingCount, onClick: () => { void runtime.refreshSync().then(refreshLocal); } }}
        tabs={[{ id: 'today', label: t('shell.tab.today') }, { id: 'calendar', label: t('shell.tab.calendar') }, { id: 'clients', label: t('shell.tab.clients') }, { id: 'sale', label: t('shell.tab.sale') }, { id: 'stocks', label: t('shell.tab.stocks') }, { id: 'setup', label: t('shell.tab.setup') }]}
        offlineAdminAttention={hasAdminEnvelope ? undefined : t('shell.offlineAdminAttention')}
        storageAttention={storageAttention}
        userName={activeIdentity.name}
        userRole={t('shell.userRole')}
      >
        <div className={styles.workspace}>
          {activeIdentity.role === 'admin' ? <div className={styles.envelopeManager}><Button onClick={() => router.push('/security')} pill size="sm" variant="ghost">{t('auth.envelopes.open')}</Button></div> : null}
          <section className={styles.cartPanel} data-testid="sale-cart">
            <header className={styles.panelHeader}><h1>{t('sale.cart')}</h1><strong>{fmtMMK(total)}</strong></header>
            <label className={styles.patientField}>
              <span>{t('sale.patient')}</span>
              <select data-testid="patient-select" onChange={(event) => setDraft((current) => ({ ...current, patientId: event.target.value || null }))} value={draft.patientId ?? ''}>
                <option value="">{t('sale.walkIn')}</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
              </select>
            </label>
            {selectedPatient?.allergies || selectedPatient?.alertNote ? <p className={styles.allergy} data-testid="allergy-banner">{selectedPatient.allergies ?? selectedPatient.alertNote}</p> : null}
            <div className={styles.cartLines}>
              {draft.lines.length === 0 ? <p className={styles.empty}>{t('sale.emptyCart')}</p> : draft.lines.map((line) => (
                <article className={styles.cartLine} data-testid={`cart-line-${line.id}`} key={line.id}>
                  <div><strong>{line.nameSnapshot}</strong><span>{fmtMMK(line.unitPrice)}</span></div>
                  <div className={styles.lineActions}>
                    <Button aria-label={t('sale.quantity')} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.map((entry) => entry.id === line.id ? { ...entry, qty: entry.qty + 1 } : entry) }))} size="sm" variant="ghost">+</Button>
                    <span>{line.qty}</span>
                    <Button aria-label={t('sale.remove')} data-testid="sale-line-remove" onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((entry) => entry.id !== line.id) }))} size="sm" variant="ghost">−</Button>
                  </div>
                </article>
              ))}
            </div>
            <div className={styles.ticketActions}>
              <Button data-testid="save-ticket" disabled={draft.lines.length === 0} onClick={() => { void saveCurrentTicket(); }} pill size="sm" variant="ghost">{t('sale.saveTicket')}</Button>
              <Button data-testid="resume-ticket" disabled={tickets.length === 0} onClick={() => { void resumeFirstTicket(); }} pill size="sm" variant="ghost">{t('sale.resumeTicket')}</Button>
            </div>
            <div className={styles.discountField}>
              <span>{t('sale.discount')}</span>
              <div className={styles.discountChips}>
                {[0, 5, 10, 15, 20].map((percent) => <Button aria-pressed={!isCustomDiscount && draft.discountPct === percent} className={!isCustomDiscount && draft.discountPct === percent ? styles.discountChipActive : undefined} data-testid={`discount-${percent}`} key={percent} onClick={() => { setCustomDiscount(false); setDraft((current) => ({ ...current, discountPct: percent, discountApprovedBy: null })); }} pill size="sm" variant="ghost">{percent}%</Button>)}
                <Button aria-pressed={isCustomDiscount} className={isCustomDiscount ? styles.discountChipActive : undefined} data-testid="discount-custom" onClick={() => { setCustomDiscount(true); setDraft((current) => ({ ...current, discountApprovedBy: null })); }} pill size="sm" variant="ghost">{t('sale.discount.custom')}</Button>
              </div>
              {isCustomDiscount ? <Input data-testid="discount-input" min="0" onChange={(event) => setDraft((current) => ({ ...current, discountPct: Number(event.target.value) || 0, discountApprovedBy: null }))} type="number" value={draft.discountPct} /> : null}
            </div>
            <Button data-testid="open-tender" disabled={draft.lines.length === 0} onClick={() => setTenderOpen(true)}>{t('sale.complete')}</Button>
          </section>
          <section className={styles.cataloguePanel}>
            <header className={styles.panelHeader}><h1>{t('sale.catalogue')}</h1></header>
            <Tabs activeId={catalogueTab} label={t('sale.catalogue')} onChange={(id) => { setCatalogueTab(id as CatalogueTab); setCatalogueCategory('all'); }} tabs={[{ id: 'services', label: t('sale.services') }, { id: 'products', label: t('sale.products') }]} testId="catalogue-tabs" testIdPrefix="catalogue-tab" />
            <div className={styles.categoryChips} data-testid="category-chips">
              {categories.map((category) => <Button aria-pressed={catalogueCategory === category.id} className={catalogueCategory === category.id ? styles.categoryChipActive : undefined} data-testid={`category-chip-${category.id.toLowerCase().replaceAll(' ', '-')}`} key={category.id} onClick={() => setCatalogueCategory(category.id)} pill size="sm" variant="ghost">{category.label}</Button>)}
            </div>
            <Input data-testid="catalogue-search" onChange={(event) => setSearch(event.target.value)} placeholder={t('sale.search')} value={search} />
            <Input className={styles.scannerInput} data-testid="scanner-input" onChange={(event) => setScannerValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') scan(); }} placeholder={t('sale.scanner')} value={scannerValue} />
            <div className={styles.catalogueList}>
              {catalogueTab === 'services' ? visibleServices.map((service) => <Button className={styles.catalogueTile} data-testid={`catalogue-item-${service.id}`} key={service.id} onClick={() => addService(service)} variant="ghost"><span>{service.nameEn ?? service.nameMm}</span><strong>{fmtMMK(service.price)}</strong></Button>) : visibleProducts.map((product) => <Button className={styles.catalogueTile} data-testid={`catalogue-item-${product.id}`} key={product.id} onClick={() => addProduct(product)} variant="ghost"><span>{product.name}</span><strong>{fmtMMK(product.price)}</strong></Button>)}
            </div>
          </section>
        </div>
      </AppShell>

      <Modal closeLabel={t('modal.close')} onClose={() => setPendingLot(undefined)} open={pendingLot !== undefined} testId="lot-modal" title={t('sale.lotTitle')}>
        <div className={styles.modalForm}>
          <label><span>{t('sale.lot')}</span><Input onChange={(event) => setLotNo(event.target.value)} value={lotNo} /></label>
          <label><span>{t('sale.expiry')}</span><Input onChange={(event) => setLotExpiry(event.target.value)} value={lotExpiry} /></label>
          <Button data-testid="lot-prefill" onClick={() => { setLotNo('BTX-2311'); setLotExpiry('2027-01'); }} pill variant="ghost">{t('sale.lotPrefill')}</Button>
          <Button data-testid="lot-add" disabled={lotNo === '' || lotExpiry === ''} onClick={() => { if (pendingLot !== undefined) addLine(pendingLot.service, pendingLot.qty, { lotNo, lotExpiry }); setPendingLot(undefined); }}>{t('sale.add')}</Button>
        </div>
      </Modal>
      <Modal closeLabel={t('modal.close')} onClose={() => setPendingWeight(undefined)} open={pendingWeight !== undefined} title={t('sale.weightTitle')}>
        <div className={styles.modalForm}>
          <label><span>{t('sale.quantity')}</span><Input min="0.1" onChange={(event) => setWeightQuantity(event.target.value)} step="0.1" type="number" value={weightQuantity} /></label>
          <Button onClick={() => { if (pendingWeight !== undefined) addLine(pendingWeight, Number(weightQuantity) || 1); setPendingWeight(undefined); }}>{t('sale.add')}</Button>
        </div>
      </Modal>
      <Modal closeLabel={t('modal.close')} onClose={() => setUnknownCode(undefined)} open={unknownCode !== undefined} title={t('sale.catalogue')}><p>{t('sale.unknown')} {unknownCode}</p></Modal>
      <Modal closeLabel={t('modal.close')} onClose={() => setTenderOpen(false)} open={tenderOpen} testId="tender-modal" title={t('sale.tenderTitle')}>
        <div className={styles.modalForm}>
          <p>{t('sale.balance')}: <strong>{fmtMMK(balance > 0 ? balance : 0)}</strong></p>
          <div className={styles.tenderChoices}>
            <Button data-testid="tender-cash" onClick={() => setTenders([{ id: crypto.randomUUID(), method: 'cash', amount: total }])} pill variant="ghost">{t('sale.cash')}</Button>
            <Button data-testid="tender-kbzpay" onClick={() => setTenders([{ id: crypto.randomUUID(), method: 'kbzpay', amount: total }])} pill variant="ghost">{t('sale.kbzpay')}</Button>
            <Button data-testid="tender-wave" onClick={() => setTenders([{ id: crypto.randomUUID(), method: 'wave', amount: total }])} pill variant="ghost">{t('sale.wave')}</Button>
            <Button data-testid="tender-split" onClick={() => { const first = Math.min(50_000, total); setTenders([{ id: crypto.randomUUID(), method: 'cash', amount: first }, { id: crypto.randomUUID(), method: 'wave', amount: saleBalanceDue(total, first) }]); }} pill variant="ghost">{t('sale.split')}</Button>
            <Button data-testid="tender-pay-later" disabled={draft.patientId === null} onClick={() => setTenders([])} pill variant="ghost">{t('sale.payLater')}</Button>
          </div>
          <p>{t('sale.change')}: <strong>{fmtMMK(paid > total ? saleBalanceDue(paid, total) : 0)}</strong></p>
          <Button data-testid="capture-sale" onClick={() => { void requestCapture(); }}>{t('sale.complete')}</Button>
        </div>
      </Modal>
      <Modal closeLabel={t('modal.close')} onClose={() => { setApprovalRequest(undefined); setApprovalPin(''); }} open={approvalRequest !== undefined} testId="approval-modal" title={t('sale.approvalTitle')}>
        <div className={styles.modalForm}>
          <label><span>{t('sale.approval')}</span><select data-testid="approval-admin-select" onChange={(event) => setApprovalStaffId(event.target.value)} value={approvalStaffId}><option value="" />{provisionedAdmins.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <PinPad backspaceLabel={t('pin.backspace')} onChange={setApprovalPin} onSubmit={() => { void verifyApproval(); }} submitLabel={t('pin.submit')} testId="approval-pinpad" displayTestId="approval-pin-display" value={approvalPin} />
        </div>
      </Modal>
      <Modal closeLabel={t('modal.close')} onClose={() => setReceipt(undefined)} open={receipt !== undefined} title={t('sale.receipt')}>
        {receipt === undefined ? null : <section className={styles.receipt} data-qr-present={renderedReceipt?.layout.runs.some((run) => run.kind === 'qr') ? 'true' : 'false'} data-testid="receipt-view"><h2>{t('sale.receipt')}</h2><p>{t('sale.waitingSync')}</p><strong>{fmtMMK(receipt.total)}</strong>{renderedReceipt === undefined || receiptImageUrl === undefined ? <Skeleton size="receipt" /> : <img alt={t('sale.receipt')} className={styles.receiptCanvas} data-testid="receipt-canvas" src={receiptImageUrl} />}<div className={styles.tenderChoices}><Button data-testid="receipt-print" disabled={renderedReceipt === undefined || printerProfile === undefined} onClick={() => { if (renderedReceipt === undefined || printerProfile === undefined) return; void createM5PrinterTransport(printerProfile).send(renderedReceipt).catch(() => enqueue(t('sync.attention'))); }} pill variant="ghost">{t('sale.print')}</Button><Button data-testid="receipt-share" disabled={renderedReceipt === undefined} onClick={() => { if (renderedReceipt === undefined || navigator.share === undefined) return; void createPngShareTransport((file) => navigator.share({ files: [file] })).send(renderedReceipt).catch(() => enqueue(t('sync.attention'))); }} pill variant="ghost">{t('sale.share')}</Button></div><Button data-testid="sale-complete" onClick={() => setReceipt(undefined)}>{t('sale.done')}</Button></section>}
      </Modal>
    </main>
  );
}

function isTicket(value: unknown): value is SaleTicket {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && typeof candidate.staffId === 'string' && typeof candidate.savedAt === 'string' && candidate.draft !== null && typeof candidate.draft === 'object';
}

function receiptPalette(): ReceiptPalette {
  const styles = getComputedStyle(document.body);
  return {
    background: styles.getPropertyValue('--panel').trim(),
    ink: styles.getPropertyValue('--ink').trim(),
    brand: styles.getPropertyValue('--brand').trim(),
    muted: styles.getPropertyValue('--mut').trim(),
    line: styles.getPropertyValue('--line').trim(),
  };
}
