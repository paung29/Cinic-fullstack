#!/usr/bin/env node
/* =============================================================================
   Eden Clinic OS — Mock API Server (executable contract)
   Zero dependencies. Node 18+.  Run:  node mock-server.mjs   → http://localhost:4010

   This file IS the reference implementation of the contract behaviors the real
   backend must reproduce (openapi.yaml documents the shapes):
     • Idempotent replay: POST with a known id → 200 + stored row + replayed:true
     • Patient phone-merge: new id, known phone → 200 + {merged_into}
     • Product barcode-merge: same pattern
     • NEVER 4xx a completed sale: business problems ⇒ needs_review, 400 only for
       structurally malformed payloads (missing id / lines / total)
     • Clock policy: sale.at > 90 days old or > 1h future ⇒ needs_review
     • Line-math re-check: server recomputes rounded totals; mismatch ⇒ needs_review
     • 401 TOKEN_EXPIRED + refresh flow; 403 ELEVATION_REQUIRED on gated endpoints
     • Error shape everywhere: {status, code, message}
   State is in-memory; restart = reset. `?chaos=1` on any request gives a random
   500 (test outbox backoff). POST /__reset restores seed state (test hook).
   ========================================================================== */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 4010;
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const normPhone = p => String(p || '').replace(/\D/g, '');

/* ---------------- seed state ---------------- */
let db, cursor, events;
function seed() {
  cursor = 0; events = [];
  db = {
    clinic: {
      id: 'clinic-1', name: 'Eden Aesthetic Clinic', rounding_step: 500, credit_limit_mmk: 100000,
      phone: '09 000 000 000', address: 'Lashio · Myanmar', receipt_footer: 'ကျေးဇူးတင်ပါသည်', logo_url: '',
      receipt_qr: true, receipt_next_visit: true, receipt_template: 'classic', receipt_header_font: 'sans', receipt_divider: 'line', consent_mode: 'warn',
      receipt: { header: 'EDEN AESTHETIC CLINIC', sub: 'အလှပြင်ဆေးခန်း · လားရှိုးမြို့', phone: '09 000 000 000', footer: 'ကျေးဇူးတင်ပါသည်', logo: true, qr: true, fu: true, width: 80 },
      addons: { brief: true, careloop: true, recall: true, outcomes: true, insights: true },
      feature_flags: { calendar: true, leads: true },
    },
    staff: [
      { id: 's1', name: 'Dr. Hkawn Mai', role: 'admin', takes_bookings: true,  active: true, pin: '1234', password: 'eden' },
      { id: 's2', name: 'Aye Aye',       role: 'staff', takes_bookings: false, active: true, pin: '0000' },
      { id: 's3', name: 'Su Su',         role: 'staff', takes_bookings: true,  active: true, pin: '0000' },
    ],
    services: [
      { id: 'v1', category: 'Laser', name_mm: 'လေဆာအမွေးဖယ်', name_en: 'Laser hair removal', price: 45000, duration_min: 30, requires_lot: false, default_followup_days: 30, active: true },
      { id: 'v4', category: 'Injectables', name_mm: 'ဗိုတောက်စ်', name_en: 'Botox — forehead', price: 250000, duration_min: 20, requires_lot: true, default_followup_days: 90, active: true },
      { id: 'v7', category: 'Skin', name_mm: 'အသားအရေခွာ', name_en: 'Chemical peel', price: 55000, duration_min: 20, requires_lot: false, default_followup_days: 14, active: true },
      { id: 'v8', category: 'Skin', name_mm: 'မျက်နှာသန့်စင်', name_en: 'Hydra facial', price: 40000, duration_min: 30, requires_lot: false, default_followup_days: null, active: true },
    ],
    products: [
      { id: 'p1', name: 'Aftercare cream 50g', category: 'Aftercare', barcode: '8850123456789', cost: 9000, price: 18000, stock_qty: 14, low_stock_at: 5, stock_type: 'retail', sold_by: 'each', unit_label: null, photo_key: null, active: true },
      { id: 'p2', name: 'Sunscreen SPF50+ 50ml', category: 'Sun care', barcode: '4005900123456', cost: 19000, price: 32000, stock_qty: 3, low_stock_at: 5, stock_type: 'retail', sold_by: 'each', unit_label: null, photo_key: null, active: true },
      { id: 'p3', name: 'Vitamin C serum 30ml', category: 'Skincare', barcode: '8809612345678', cost: 30000, price: 48000, stock_qty: 8, low_stock_at: 3, stock_type: 'professional', sold_by: 'each', unit_label: null, photo_key: null, active: true },
      { id: 'p4', name: 'Gentle cleanser 150ml', category: 'Cleansers', barcode: null, cost: 20000, price: 22000, stock_qty: 11, low_stock_at: 4, stock_type: 'retail', sold_by: 'each', unit_label: null, photo_key: null, active: true },
      { id: 'p5', name: 'Herbal scrub', category: 'Skincare', barcode: null, cost: 60, price: 150, stock_qty: 900, low_stock_at: 200, stock_type: 'retail', sold_by: 'weight', unit_label: 'g', photo_key: null, active: true },
      { id: 'p7', name: 'Botox vial 100U', category: 'Back bar', barcode: null, cost: 180000, price: 0, stock_qty: 4, low_stock_at: 2, stock_type: 'injectable', sold_by: 'each', unit_label: 'vial', photo_key: null, active: true },
    ],
    patients: [
      { id: 'c1', code: 'P-00001', name: 'Ma Thida', phone: '09 771 234 560', sex: 'F', allergies: 'Lidocaine', alert_note: null, telegram_linked: true, followup_date: null },
      { id: 'c2', code: 'P-00002', name: 'Ko Zaw Min', phone: '09 425 118 220', sex: 'M', allergies: null, alert_note: null, telegram_linked: true, followup_date: null },
    ],
    appointments: [], sales: {}, payments: {}, contacts: {}, receives: {}, clinicalRecords: {},
    patientSeq: 3, receiptSeq: 1056,
  };
  db.products = db.products.map((product, index) => ({
    subcategory: null, sort_order: index, reorder_at: product.low_stock_at,
    requires_lot: product.stock_type === 'injectable', requires_consent: false,
    ...product,
  }));
  ['services','products','patients','staff'].forEach(k => db[k].forEach(r => bump(k.replace(/s$/,''), r)));
}
function publicStaff(staff) {
  const { pin, password, ...publicRow } = staff;
  return publicRow;
}
function publicEventRow(entity, row) {
  return entity === 'staff' ? publicStaff(row) : row;
}
function bump(entity, row) { cursor++; events.push({ at: cursor, entity, op: 'upsert', row: publicEventRow(entity, row) }); }

/* ---------------- auth ---------------- */
const tokens = new Map();      // token -> staffId
const refreshes = new Map();   // refresh -> staffId
const elevations = new Map();  // elevToken -> expiresAtMs
function issue(staffId) {
  const t = 'tok_' + uid(), r = 'ref_' + uid();
  tokens.set(t, staffId); refreshes.set(r, staffId);
  return { token: t, refresh: r };
}

/* ---------------- money (mirror of client LAW-5) ---------------- */
const roundToStep = (n, step) => Math.round(n / step) * step;
function checkSaleMath(sale, step) {
  const issues = [];
  for (const l of sale.lines) {
    const expect = roundToStep(l.qty * l.unit_price * (1 - (l.discount_pct || 0) / 100), step);
    if (expect !== l.line_total) issues.push(`line ${l.name_snapshot}: expected ${expect}, got ${l.line_total}`);
  }
  const sub = sale.lines.reduce((a, l) => a + l.line_total, 0);
  const expectTotal = roundToStep(sub * (1 - (sale.discount_pct || 0) / 100), step);
  if (expectTotal !== sale.total) issues.push(`total: expected ${expectTotal}, got ${sale.total}`);
  return issues;
}

/* ---------------- http plumbing ---------------- */
const err = (res, status, code, message) => send(res, status, { status, code, message });
function send(res, status, body) {
  const j = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type,x-elevation', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' });
  res.end(j);
}
async function body(req) {
  let d = ''; for await (const c of req) d += c;
  try { return d ? JSON.parse(d) : {}; } catch { return null; }
}
function strictPatch(value, allowed) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.keys(value).every((key) => allowed.includes(key));
}
function isOneOf(value, options) { return options.includes(value); }

seed();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://x`);
  const path = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (url.searchParams.get('chaos') === '1' && Math.random() < 0.5) return err(res, 500, 'CHAOS', 'simulated failure');

  /* ---- unauthenticated ---- */
  if (path === '/health') return send(res, 200, { ok: true, server_time: now() });
  if (path === '/__reset' && req.method === 'POST') {
    const options = await body(req); seed();
    if (typeof options?.addons?.recall === 'boolean') db.clinic.addons.recall = options.addons.recall;
    return send(res, 200, { ok: true });
  }
  // Harness-only inspection for deterministic end-to-end attribution checks.
  if (path === '/__state' && req.method === 'GET') return send(res, 200, JSON.parse(JSON.stringify(db)));
  const offboardMatch = path.match(/^\/__staff\/([^/]+)\/offboard$/);
  if (offboardMatch && req.method === 'POST') {
    const staff = db.staff.find(s => s.id === offboardMatch[1]);
    if (!staff) return err(res, 404, 'NOT_FOUND', 'unknown staff');
    staff.active = false; bump('staff', staff);
    return send(res, 200, { staff: publicStaff(staff) });
  }

  if (path === '/api/setup' && req.method === 'POST') {
    // First-run clinic install: mirrors the backend's /api/setup so the
    // "create a new clinic" login flow is exercisable against the contract.
    const b = await body(req); if (!b) return err(res, 400, 'MALFORMED', 'bad json');
    if (!b.clinic_name || !b.admin_name || !b.admin_phone || !b.email || String(b.password || '').length < 8 || !/^\d{4}$/.test(b.pin || '')) {
      return err(res, 400, 'MALFORMED', 'setup fields are invalid');
    }
    db.clinic.name = b.clinic_name;
    if (b.clinic_phone) db.clinic.phone = b.clinic_phone;
    if (b.clinic_address) db.clinic.address = b.clinic_address;
    const admin = { id: uid(), name: b.admin_name, role: 'admin', takes_bookings: true, active: true, pin: b.pin, password: b.password };
    db.staff.push(admin); bump('staff', admin);
    return send(res, 201, { clinic_id: db.clinic.id, staff_id: admin.id, account_id: uid(), email: String(b.email).toLowerCase() });
  }

  if (path === '/auth/login' && req.method === 'POST') {
    const b = await body(req); if (!b) return err(res, 400, 'MALFORMED', 'bad json');
    const s = db.staff.find(x => x.id === b.staff_id && x.active !== false && x.pin === b.pin);
    if (!s) return err(res, 401, 'BAD_CREDENTIALS', 'wrong staff or PIN');
    const pair = issue(s.id);
    return send(res, 200, { ...pair, staff: publicStaff(s), clinic: db.clinic, server_time: now() });
  }
  if (path === '/auth/refresh' && req.method === 'POST') {
    const b = await body(req); if (!b) return err(res, 400, 'MALFORMED', 'bad json');
    const staffId = refreshes.get(b.refresh);
    if (!staffId) return err(res, 401, 'BAD_REFRESH', 'unknown refresh token');
    refreshes.delete(b.refresh);
    return send(res, 200, issue(staffId));
  }
  if (path === '/auth/logout' && req.method === 'POST') {
    const b = await body(req);
    if (b?.refresh) refreshes.delete(b.refresh);
    res.writeHead(204, { 'access-control-allow-origin': '*' });
    return res.end();
  }

  /* ---- bearer wall ---- */
  const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
  const staffId = tokens.get(auth);
  if (!staffId) return err(res, 401, 'TOKEN_EXPIRED', 'missing or expired token');
  const me = db.staff.find(s => s.id === staffId);
  const elevated = () => { const e = req.headers['x-elevation']; return e && (elevations.get(e) || 0) > Date.now(); };

  if (path === '/auth/elevate' && req.method === 'POST') {
    const b = await body(req);
    if (me.role !== 'admin' || b?.password !== me.password) return err(res, 401, 'BAD_PASSWORD', 'wrong admin password');
    const t = 'elev_' + uid(); const exp = Date.now() + 15 * 60 * 1000;
    elevations.set(t, exp);
    return send(res, 200, { elevation_token: t, expires_at: new Date(exp).toISOString() });
  }
  if (path === '/license' && req.method === 'GET') {
    const term = new Date(); term.setFullYear(term.getFullYear() + 1);
    const grace = new Date(term); grace.setDate(grace.getDate() + 90);
    return send(res, 200, { id: 'license-1', clinic_id: db.clinic.id, stored_status: 'ACTIVE', effective_status: 'ACTIVE', term_ends_on: term.toISOString().slice(0, 10), grace_ends_on: grace.toISOString().slice(0, 10), changed_at: now(), changed_by: 'admin', note: null });
  }
  if (path === '/admin/staff-account' && req.method === 'POST') {
    if (me.role !== 'admin') return err(res, 403, 'ELEVATION_REQUIRED', 'administrator role required');
    const b = await body(req);
    if (!b?.name || !/^\d{4}$/.test(b.pin || '') || !b.email || String(b.password || '').length < 8) return err(res, 400, 'MALFORMED', 'staff account fields are invalid');
    const member = { id: uid(), name: b.name, role: b.role || 'staff', takes_bookings: b.takes_bookings === true, active: true, pin: b.pin, password: b.password };
    db.staff.push(member); bump('staff', member);
    return send(res, 200, publicStaff(member));
  }
  if (path === '/export' && req.method === 'POST') {
    const b = await body(req);
    if (b?.password !== 'eden') return err(res, 400, 'BUSINESS_RULE', 'Admin password is incorrect.');
    return send(res, 200, { clinicId: db.clinic.id, patients: db.patients, staff: db.staff.map(publicStaff), catalogue: [...db.services, ...db.products], sales: Object.values(db.sales) });
  }

  if (path === '/clinic' && req.method === 'PATCH') {
    if (!elevated()) return err(res, 403, 'ELEVATION_REQUIRED', 'admin elevation required');
    const b = await body(req);
    const allowed = ['name', 'phone', 'address', 'receipt_footer', 'logo_url', 'rounding_step', 'credit_limit_mmk', 'consent_mode', 'receipt_qr', 'receipt_next_visit', 'receipt_template', 'receipt_header_font', 'receipt_divider'];
    if (!strictPatch(b, allowed)) return err(res, 400, 'MALFORMED', 'clinic update must include only mutable fields');
    if ('rounding_step' in b && !isOneOf(b.rounding_step, [1, 100, 500, 1000])) return err(res, 400, 'MALFORMED', 'invalid rounding_step');
    if ('credit_limit_mmk' in b && (!Number.isInteger(b.credit_limit_mmk) || b.credit_limit_mmk < 0)) return err(res, 400, 'MALFORMED', 'invalid credit_limit_mmk');
    if ('consent_mode' in b && !isOneOf(b.consent_mode, ['off', 'warn', 'block'])) return err(res, 400, 'MALFORMED', 'invalid consent_mode');
    if ('receipt_template' in b && !isOneOf(b.receipt_template, ['classic', 'modern', 'minimal', 'boxed'])) return err(res, 400, 'MALFORMED', 'invalid receipt_template');
    if ('receipt_header_font' in b && !isOneOf(b.receipt_header_font, ['sans', 'serif', 'display'])) return err(res, 400, 'MALFORMED', 'invalid receipt_header_font');
    if ('receipt_divider' in b && !isOneOf(b.receipt_divider, ['line', 'dots', 'none'])) return err(res, 400, 'MALFORMED', 'invalid receipt_divider');
    if (['name', 'phone', 'address', 'receipt_footer', 'logo_url'].some(key => key in b && typeof b[key] !== 'string')) return err(res, 400, 'MALFORMED', 'clinic text fields must be strings');
    if (['receipt_qr', 'receipt_next_visit'].some(key => key in b && typeof b[key] !== 'boolean')) return err(res, 400, 'MALFORMED', 'receipt options must be booleans');
    Object.assign(db.clinic, b); bump('clinic', db.clinic);
    return send(res, 200, db.clinic);
  }

  if (path === '/bootstrap') {
    return send(res, 200, {
      clinic: db.clinic, staff: db.staff.map(publicStaff),
      services: db.services, products: db.products, patients: db.patients,
      appointments: db.appointments, recent_sales: Object.values(db.sales).slice(-50),
      server_time: now(), cursor,
    });
  }
  if (path === '/delta') {
    const since = parseInt(url.searchParams.get('since') || '0', 10);
    return send(res, 200, { changes: events.filter(e => e.at > since).map(({ entity, op, row }) => ({ entity, op, row })), cursor, server_time: now() });
  }

  /* ---- SALES: idempotent, never-4xx-completed ---- */
  if (path === '/sales' && req.method === 'POST') {
    const b = await body(req);
    if (!b || !b.id || !Array.isArray(b.lines) || !b.lines.length || typeof b.total !== 'number' || !b.staff_id || !b.at)
      return err(res, 400, 'MALFORMED', 'sale requires id, staff_id, at, lines[], total');
    if (db.sales[b.id]) return send(res, 200, { sale: db.sales[b.id], replayed: true });   // LAW: replay → stored row
    const reasons = [];
    const ageDays = (Date.now() - Date.parse(b.at)) / 86400000;
    if (ageDays > 90) reasons.push('timestamp older than 90 days');
    if (ageDays < -1 / 24) reasons.push('timestamp in the future');
    reasons.push(...checkSaleMath(b, db.clinic.rounding_step));
    for (const l of b.lines) {
      const svc = db.services.find(s => s.id === l.item_id);
      if (svc?.requires_lot && !l.lot_no) reasons.push(`missing lot on ${l.name_snapshot}`);
      const p = db.products.find(x => x.id === l.item_id);
      if (p) { p.stock_qty = Math.max(0, p.stock_qty - l.qty); bump('product', p); }      // one "transaction"
    }
    const sale = { ...b, no: 'R-' + (db.receiptSeq++), status: 'completed',
      needs_review: reasons.length > 0, review_reason: reasons.join('; ') || null, received_at: now() };
    db.sales[sale.id] = sale; bump('sale', sale);
    return send(res, 200, { sale, replayed: false });                                     // accepted — ALWAYS
  }
  let m;
  if ((m = path.match(/^\/sales\/([^/]+)\/payments$/)) && req.method === 'POST') {
    const b = await body(req);
    if (!b?.id || typeof b.amount !== 'number' || !b.method) return err(res, 400, 'MALFORMED', 'payment requires id, method, amount');
    if (!db.sales[m[1]]) return err(res, 404, 'NOT_FOUND', 'unknown sale');
    if (db.payments[b.id]) return send(res, 200, { payment: db.payments[b.id], replayed: true });
    const p = { ...b, at: b.at || now(), sale_id: m[1] };
    db.payments[b.id] = p; db.sales[m[1]].payments = [...(db.sales[m[1]].payments || []), p]; bump('sale', db.sales[m[1]]);
    return send(res, 200, { payment: p, replayed: false });
  }
  if ((m = path.match(/^\/sales\/([^/]+)\/void$/)) && req.method === 'POST') {
    if (!elevated()) return err(res, 403, 'ELEVATION_REQUIRED', 'admin elevation required');
    const s = db.sales[m[1]]; if (!s) return err(res, 404, 'NOT_FOUND', 'unknown sale');
    s.status = 'voided';
    for (const l of s.lines) { const p = db.products.find(x => x.id === l.item_id); if (p) { p.stock_qty += l.qty; bump('product', p); } }
    bump('sale', s);
    return send(res, 200, { sale: s });
  }

  /* ---- PATIENTS: idempotent + phone merge ---- */
  if (path === '/patients' && req.method === 'POST') {
    const b = await body(req);
    if (!b?.id || !b.name || !b.phone) return err(res, 400, 'MALFORMED', 'patient requires id, name, phone');
    const existing = db.patients.find(p => p.id === b.id);
    if (existing) return send(res, 200, { patient: existing, replayed: true });
    const dupe = db.patients.find(p => normPhone(p.phone) === normPhone(b.phone));
    if (dupe) return send(res, 200, { patient: dupe, merged_into: dupe.id });              // LAW: merge, don't duplicate
    const p = { telegram_linked: false, allergies: null, alert_note: null, sex: null, followup_date: null,
      ...b, code: 'P-' + String(db.patientSeq++).padStart(5, '0') };
    db.patients.push(p); bump('patient', p);
    return send(res, 200, { patient: p, replayed: false });
  }
  if ((m = path.match(/^\/patients\/([^/]+)$/)) && req.method === 'PATCH') {
    const p = db.patients.find(x => x.id === m[1]); if (!p) return err(res, 404, 'NOT_FOUND', 'unknown patient');
    Object.assign(p, await body(req) || {}); bump('patient', p);
    return send(res, 200, p);
  }
  if ((m = path.match(/^\/patients\/([^/]+)\/clinical-records$/)) && req.method === 'GET') {
    if (!elevated()) return err(res, 403, 'ELEVATION_REQUIRED', 'admin elevation required');
    return send(res, 200, db.clinicalRecords[m[1]] || []);
  }
  if ((m = path.match(/^\/patients\/([^/]+)\/clinical-records$/)) && req.method === 'POST') {
    if (!elevated()) return err(res, 403, 'ELEVATION_REQUIRED', 'admin elevation required');
    const b = await body(req);
    if (!b?.staff_id) return err(res, 400, 'MALFORMED', 'staff_id is required');
    const record = { id: uid(), patient_id: m[1], created_at: now(), ...b };
    db.clinicalRecords[m[1]] = [record, ...(db.clinicalRecords[m[1]] || [])];
    return send(res, 200, record);
  }

  /* ---- PRODUCTS: idempotent + barcode merge ---- */
  if (path === '/products' && req.method === 'POST') {
    const b = await body(req);
    if (!b?.id || !b.name) return err(res, 400, 'MALFORMED', 'product requires id, name');
    const existing = db.products.find(p => p.id === b.id);
    if (existing) return send(res, 200, { product: existing, replayed: true });
    if (b.barcode) {
      const dupe = db.products.find(p => p.barcode && p.barcode === b.barcode);
      if (dupe) return send(res, 200, { product: dupe, merged_into: dupe.id });
    }
    const p = { stock_type: 'retail', sold_by: 'each', stock_qty: 0, low_stock_at: 3, cost: 0, price: 0,
      barcode: null, unit_label: null, photo_key: null, category: 'Other', active: true, ...b };
    db.products.push(p); bump('product', p);
    return send(res, 200, { product: p, replayed: false });
  }
  if ((m = path.match(/^\/products\/([^/]+)$/)) && req.method === 'PATCH') {
    if (!elevated()) return err(res, 403, 'ELEVATION_REQUIRED', 'admin elevation required');
    const b = await body(req);
    const allowed = ['name', 'category', 'subcategory', 'sort_order', 'price', 'cost', 'low_stock_at', 'reorder_at', 'stock_type', 'sold_by', 'requires_lot', 'requires_consent', 'unit_label', 'barcode', 'photo_key', 'active'];
    if (!strictPatch(b, allowed)) return err(res, 400, 'MALFORMED', 'product update must include only mutable fields');
    const p = db.products.find(product => product.id === m[1]);
    if (!p) return err(res, 404, 'NOT_FOUND', 'unknown product');
    if (['name', 'category', 'stock_type', 'sold_by'].some(key => key in b && typeof b[key] !== 'string')) return err(res, 400, 'MALFORMED', 'invalid product text field');
    if (['subcategory', 'unit_label', 'barcode', 'photo_key'].some(key => key in b && b[key] !== null && typeof b[key] !== 'string')) return err(res, 400, 'MALFORMED', 'invalid nullable product field');
    if (['sort_order', 'price', 'cost', 'low_stock_at', 'reorder_at'].some(key => key in b && (!Number.isFinite(b[key]) || b[key] < 0))) return err(res, 400, 'MALFORMED', 'invalid product number');
    if (['requires_lot', 'requires_consent', 'active'].some(key => key in b && typeof b[key] !== 'boolean')) return err(res, 400, 'MALFORMED', 'invalid product boolean');
    if ('stock_type' in b && !isOneOf(b.stock_type, ['retail', 'injectable'])) return err(res, 400, 'MALFORMED', 'invalid stock_type');
    if ('sold_by' in b && !isOneOf(b.sold_by, ['each', 'weight'])) return err(res, 400, 'MALFORMED', 'invalid sold_by');
    if (b.barcode) {
      const dupe = db.products.find(product => product.id !== p.id && product.barcode === b.barcode);
      if (dupe) return err(res, 400, 'DUPLICATE_BARCODE', `barcode already belongs to product ${dupe.id}`);
    }
    Object.assign(p, b); bump('product', p);
    return send(res, 200, p);
  }

  /* ---- STOCK ---- */
  if (path === '/stock/receive' && req.method === 'POST') {
    const b = await body(req);
    if (!b?.id || !b.product_id || typeof b.qty !== 'number') return err(res, 400, 'MALFORMED', 'receive requires id, product_id, qty');
    if (db.receives[b.id]) { const p = db.products.find(x => x.id === b.product_id); return send(res, 200, { product: p, replayed: true }); }
    const p = db.products.find(x => x.id === b.product_id);
    if (!p) return err(res, 404, 'NOT_FOUND', 'unknown product');
    db.receives[b.id] = true; p.stock_qty += b.qty; if (b.cost) p.cost = b.cost; bump('product', p);
    return send(res, 200, { product: p, replayed: false });
  }
  if (path === '/stock/adjust' && req.method === 'POST') {
    if (!elevated()) return err(res, 403, 'ELEVATION_REQUIRED', 'admin elevation required');
    const b = await body(req);
    const p = db.products.find(x => x.id === b?.product_id); if (!p) return err(res, 404, 'NOT_FOUND', 'unknown product');
    p.stock_qty = Math.max(0, p.stock_qty + b.delta); bump('product', p);
    return send(res, 200, p);
  }

  /* ---- BARCODE LOOKUP (miss = 200 found:false) ---- */
  if (path === '/barcode-lookup') {
    const GLOBAL = {
      '4005900654321': { name: 'NIVEA Soft moisturising cream 100ml', brand: 'NIVEA', category: 'Skincare', source: 'obf' },
      '8809747912345': { name: 'COSRX Snail mucin essence 100ml', brand: 'COSRX', category: 'Skincare', source: 'obf' },
    };
    const hit = GLOBAL[url.searchParams.get('code')];
    return send(res, 200, hit ? { found: true, ...hit } : { found: false });
  }

  /* ---- APPOINTMENTS: idempotent; conflict accepted + flagged ---- */
  if (path === '/appointments' && req.method === 'POST') {
    const b = await body(req);
    if (!b?.id || !b.date || !b.time || !b.staff_id || !b.patient_id || !b.service_id)
      return err(res, 400, 'MALFORMED', 'appointment requires id, date, time, staff_id, patient_id, service_id');
    const existing = db.appointments.find(a => a.id === b.id);
    if (existing) return send(res, 200, { appointment: existing, replayed: true });
    const conflict = db.appointments.some(a => a.date === b.date && a.time === b.time && a.staff_id === b.staff_id && a.status !== 'cancelled');
    const appt = { status: 'booked', ...b };
    db.appointments.push(appt); bump('appointment', appt);
    return send(res, 200, { appointment: appt, conflict, replayed: false });               // accepted even on conflict
  }
  if ((m = path.match(/^\/appointments\/([^/]+)$/)) && req.method === 'PATCH') {
    const a = db.appointments.find(x => x.id === m[1]); if (!a) return err(res, 404, 'NOT_FOUND', 'unknown appointment');
    Object.assign(a, await body(req) || {}); bump('appointment', a);
    return send(res, 200, a);
  }

  /* ---- CARE ---- */
  if (path === '/contact-log' && req.method === 'POST') {
    const b = await body(req);
    if (!b?.id || !b.patient_id || !b.channel || !b.direction) return err(res, 400, 'MALFORMED', 'contact requires id, patient_id, channel, direction');
    if (db.contacts[b.id]) return send(res, 200, { contact: db.contacts[b.id], replayed: true });
    const c = { at: now(), automated: false, outcome: null, note: null, sale_id: null, ...b };
    db.contacts[b.id] = c; bump('contact', c);
    return send(res, 200, { contact: c, replayed: false });
  }
  if (path === '/followups') {
    return send(res, 200, db.patients.filter(p => p.followup_date).map(p => ({ patient_id: p.id, date: p.followup_date, service: null })));
  }

  /* ---- REPORTS (elevation) ---- */
  if (path === '/reports/daily') {
    if (!elevated()) return err(res, 403, 'ELEVATION_REQUIRED', 'admin elevation required');
    const sales = Object.values(db.sales).filter(s => s.status === 'completed');
    const collected = sales.reduce((a, s) => a + (s.payments || []).reduce((x, p) => x + p.amount, 0), 0);
    const delivered = sales.reduce((a, s) => a + s.total, 0);
    const newCredit = Math.max(0, delivered - collected);
    return send(res, 200, {
      date: url.searchParams.get('date'), collected,
      delivered,
      new_credit: newCredit,
      outstanding: newCredit,
      sales: sales.length,
      needs_review_count: sales.filter(s => s.needs_review).length,
    });
  }

  return err(res, 404, 'NOT_FOUND', `no route ${req.method} ${path}`);
});
server.listen(PORT, () => console.log(`Eden mock API on http://localhost:${PORT}`));
