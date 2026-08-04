# LUSA Clinic OS — Design System v1
### Adopted Thu Jul 31 · Reference: Dock (dock.us) style extraction, chosen by Dan · Direction: clinical clean · Applied live in demo v4

## The language in one paragraph

Sunlit cream workspace, one electric cobalt doing all interactive work. Canvas is warm off-white (#faf9f7), never pure white; surfaces step up canvas → ivory → white instead of using shadow depth. Cobalt (#0068f9) is the *only* filled-action color — every button, active state, link and price shares it. Violet (#6736eb) is reserved for exactly one thing in our product: **AI surfaces** (the brief, recall card, AI tags, care-loop CTA) — a perfect semantic fit for the add-on model, since the violet literally marks what's billable. Pills everywhere (buttons, tabs, chips at 999px), cards at 16px with 1px #efefef hairlines and feather micro-shadows. Type is Inter (Roobert substitute) + **Padauk for Burmese at line-height 1.7** — Burmese script needs the extra leading; never apply the tight display leading to Burmese text.

## Tokens (as implemented in the demo, CSS custom properties)

| Group | Values |
|---|---|
| Surfaces | canvas `#faf9f7` · ivory `#fbfaf7` · white `#ffffff` · lavender (AI) `#f4f0ff` |
| Text | ink `#121722` · muted `#777c86` · placeholder `#a5a5a5` |
| Interactive | cobalt `#0068f9` · pressed `#024bb1` — the only CTA color |
| Accents | AI violet `#6736eb` on `#f4f0ff` · cobalt tint `#e8f1fd` (info tags, calendar blocks, prices context) |
| Semantic (POS addition — the reference had none; a POS needs them) | success/ok `#046645` on `#e6f2ec` · warn `#a97a10` on `#faf1dc` · danger `#c0392b` on `#fdecec` — used for *status only*, never for actions |
| Borders | hairline `#efefef`, always 1px |
| Radii | buttons/pills/tabs/chips 999px · cards 16px · inputs 12px · modals 20px · appt blocks 10px |
| Shadows | subtle: `0 1px 1px rgba(0,0,0,.07)` + inset outline (cards) · lg: `0 20px 20px -8px rgba(0,0,0,.04)` (modals, floating) — never heavier |
| Type | Inter 400/500/600/700 · body 15px/1.5 · h1 20/650 · stat 22/650 · captions 12–13/500 with letter-spacing on uppercase labels · **Padauk for `my`, lh 1.7** |
| Spacing | 8px base · card padding 20 · page padding 20 · grid gaps 10–14 |

### tokens.css (verbatim — the single source of truth)

```css
:root{
  --bg:#faf9f7; --ivory:#fbfaf7; --panel:#ffffff;
  --ink:#121722; --mut:#777c86; --steel:#a5a5a5;
  --brand:#0068f9; --brand-dk:#024bb1;
  --accent:#e8f1fd; --powder:#d6e4f1; --lav:#f4f0ff;
  --line:#efefef; --chip:#f3f2ef;
  --red:#c0392b; --redbg:#fdecec; --amber:#a97a10; --amberbg:#faf1dc;
  --forest:#046645; --forestbg:#e6f2ec;
  --ai:#6736eb; --aibg:#f4f0ff;
  --sh-subtle:rgba(0,0,0,.07) 0 1px 1px 0, rgba(0,0,0,.04) 0 -1px 1px 0 inset, rgba(0,0,0,.14) 0 0 0 .5px inset;
  --sh-lg:rgba(0,0,0,.04) 0 20px 20px -8px;
  --r-card:16px; --r-btn:999px; --r-input:12px; --r-modal:20px;
}
```

## Component rules (from the reference, adapted for POS)

- **Header split:** white brand bar (56px, hairline bottom) → cream tab bar; active tab = white pill + micro-shadow, inactive = muted text. No underlines, no borders on tabs.
- **Buttons:** filled cobalt pill (hover → deep cobalt) · ghost = white + hairline · destructive = danger fill, used rarely · AI actions = violet fill. Paired filled+ghost pattern for primary/secondary. Padding 11px 22px (md), 8px 15px (sm). Weight 500.
- **Cards:** white, 16px radius, hairline border, micro-shadow. Elevation via surface steps (canvas → ivory → white), not shadow depth.
- **Category chips (sale grid):** the one inversion — active chip is **ink-filled** (not cobalt) so the cobalt prices on tiles stay the loudest blue on screen.
- **Tables:** uppercase 12px muted labels with letter-spacing, generous 11px row padding, ivory row hover, 1px hairline row separators.
- **Toggles:** cobalt when on — a toggle is interactive, so it earns the blue. 42×24px, white thumb with 1px shadow.
- **Inputs:** white, 12px radius, hairline border, steel placeholder; focus = 2px cobalt outline, offset −1px.
- **Modals:** 20px radius, `--sh-lg`, overlay `rgba(18,23,34,.4)`, ESC + backdrop close.
- **Tags:** 8px radius, tinted backgrounds per semantic group, 11.5px/600.
- **Stat tiles:** white card, uppercase 11.5px muted label, 22px/650 value.
- **PIN pad:** ivory keys, 14px radius, hairline; dots in cobalt.
- **Toast:** near-black `#1d1d1d` pill, white text, bottom-center singleton.
- **Phone simulator / receipts:** exempt surfaces — the phone stays dark (it's a phone), the receipt stays monospace paper (it's a receipt).

## POS-specific adaptations (where we deliberately deviate from the reference)

1. **Semantic status colors exist.** The reference is a marketing site with no error states; a POS lives on them. Forest/amber/red are *status-only* — they never appear on buttons except the rare destructive action.
2. **Violet = AI, strictly.** The reference uses violet decoratively; we make it semantic. If it glows violet, it's an AI add-on. This makes the billable layer visually legible — good for demos and for owners.
3. **Density.** Body 15px (not 16), card padding 20 (not 24) — a working screen, not prose. Display sizes (48–84px) are reserved for the future marketing site, where the reference applies verbatim.
4. **Touch:** all interactive elements ≥40px tall; the charge button 15px padding; `:focus-visible` = 2px cobalt ring.
5. **Fonts bundled for production.** The demo loads Inter/Padauk from Google Fonts; the real PWA ships them as local woff2 assets (offline-first — a font CDN is a network dependency). Fallback stack: `'Inter', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; Burmese: `'Padauk', "Noto Sans Myanmar", sans-serif`.

## Do / Don't

**Do:** cream canvas always · one cobalt for every action · violet only on AI surfaces · 1px hairlines only · pill buttons everywhere · elevation via surface steps · Padauk + 1.7 leading for Burmese.

**Don't:** pure-white page background · a second chromatic action color · heavy or colored shadows · borders thicker than 1px · 4–6px radii (the system commits to softness) · violet on non-AI elements · tight leading on Burmese text · status colors on buttons.

## Production TODOs (not in the demo)

Replace emoji glyphs with a monoline icon set (Lucide fits the language) · empty states & skeleton loaders per screen · focus-visible audit for keyboard/scanner users · the marketing-site layer (84px display type, cream→powder-blue hero gradient, the signature gradient-corner CTA) when the US site is built — that's where the reference's display typography belongs.
