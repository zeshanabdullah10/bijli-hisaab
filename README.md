# BijliHisaab · بجلی حساب

**Know your bill before it lands.**

A free, private, offline-capable, bilingual (English / اردو) app for Pakistani
domestic electricity consumers. It does four jobs:

| Tab | What it does |
|---|---|
| **Bill** | Itemises your bill line by line (slabs, fixed charges, financing surcharge, QTA, FPA, duty, GST, TV fee, income tax) with a formula and source on every line. Shows where each rupee goes, the **slab cliff**, what other consumer classes would pay, a budget planner, and plain-English **insights** ("5 units from a Rs 1,556 jump"). |
| **Track** | A meter tracker. Log readings every few days; it projects the month's units and bill, flags a heatwave in your recent pace, and tells you the **units per day** that keep you under the next cliff. Close the cycle to log it, then follow your six-month **Protected** and twelve-month **Lifeline** progress and past bills. |
| **Appliances** | Pick what runs at home (or start from a preset). Each appliance is priced against the real tariff, cliffs included: what it costs per hour, what you save by switching it off, what one hour less a day is worth. One tap sends the total to the Bill tab. |
| **Learn** | A searchable glossary of every bill line (linked from the bill), money-saving tips, and a step-by-step guide for disputing a bill. |

The **audit** on the Bill tab goes beyond a diff: enter the amount on your paper
bill and it reports the units and FPA that amount implies, and whether a
different sanctioned load, consumer class or filer status reproduces it.

- No accounts, no tracking, no backend — 100% client-side. Data stays on the
  device; back it up or move it to another phone from Settings.
- Tariff data is open JSON with a `source_url` on every rate.
- Installable PWA with home-screen shortcuts. Works offline, including during
  load-shedding.
- Share a scenario as a link: `#/bill?u=300&t=protected&d=lesco&k=5`.

## Run it locally

```bash
npm start        # serves on http://127.0.0.1:8080
# or:  npx -y http-server -p 8080
# or:  python -m http.server 8080
```

Opening `index.html` directly from disk will **not** work (ES modules + `fetch`
require HTTP).

## Code map

```
index.html            app shell + the Bill view's markup
js/main.js            boot, hash router, view lifecycle
js/app.js, store.js   shared context + one-document persistence (with v1 migration)
js/views/*.js         bill, track, plan (appliances), learn, settings/welcome
js/tariff.js          bill engine (pure)
js/insights.js        insights, class comparison, bill diagnosis (pure)
js/tracker.js         cycle projection, daily allowance, streaks (pure)
js/appliances.js      appliance pricing (pure)
data/                 tariffs, DISCOs, appliance catalog, learn content (all open JSON)
```

The `js/` modules marked pure have no DOM access and are covered by `node --test`.

## Deploy to GitHub Pages

1. Create a repository (e.g. `bijli-hisaab`) and push this folder to `main`.
2. Repo **Settings → Pages → Source: Deploy from a branch** → `main`, `/ (root)`.
3. Done — no build step. The site is live at `https://<user>.github.io/bijli-hisaab/`.

Tests run automatically on every push/PR via `.github/workflows/tests.yml`.

## Tests

```bash
npm test          # node --test — zero dependencies
```

The suite pins the engine to published arithmetic (e.g. the SRO 279(I)/2026
examples: 200 unprotected units × Rs 28.91 = Rs 5,782; protected 200 units =
100 × 10.54 + 100 × 13.01 = Rs 2,355), guards the data schema (every tariff
file must carry sources and effective dates), and covers the advice, tracker and
appliance logic.

### Real-bill fixtures (help wanted!)

The best regression tests are *real bills*. If you want to contribute: photograph
your bill, blank out name/address/reference number, transcribe the line items
into a test fixture (see `tests/tariff.test.js` → "audit fixture"), and open a
PR with the image under `tests/fixtures/`. Ground truth beats simulated data.

## Updating tariff data (how this stays alive)

Rates change quarterly (base) and monthly (FPA), and a stale calculator is worse
than none — so **every number in the data files cites a source** and the UI
shows "rates in force since …" everywhere.

To update:

1. Edit `data/tariffs/exwapda/<period>.json` (or add a new period file and bump
   `default` in `data/tariffs/exwapda/index.json`).
2. Set `effective_date`, `verified_on`, and add a `sources` entry linking the
   NEPRA notification / SRO / credible news report.
3. Run `npm test` — the schema test rejects uncited data.
4. Open a PR. Anything without a source link gets rejected.

Adding a DISCO: add an entry to `data/discos.json` (with its provincial
electricity duty), create `data/tariffs/<id>/<period>.json`, and add the id to
the DISCO picker in `index.html`. The engine is DISCO-agnostic.

## What is modelled (and what is not)

Modelled: domestic single-phase for all nine ex-WAPDA DISCOs (LESCO, FESCO,
GEPCO, MEPCO, IESCO, PESCO, HESCO, SEPCO, QESCO) - unprotected / protected /
lifeline slabs, per-kW fixed charges, financing-cost surcharge, QTA, FPA
(default + your bill's exact rate), provincial electricity duty, GST, TV
licence fee, income tax for non-filers above Rs 25,000, minimum charge, the
slab cliff, budget planner, paper-bill audit and diagnosis, and rooftop solar in both
connection regimes:

- **Net metering** (grandfathered agreements): exports offset imports 1:1
  before slab billing; excess export rolls forward as a unit credit.
- **Net billing** (Prosumer Regulations 2026, new connections): imports are
  billed in full at slab rates; exports are credited at the buyback price
  (default Rs 10/unit, reported range Rs 8.13-11 - enter your agreement's rate).
  The Solar card shows with/without-solar bills, monthly saving and payback.

**Not** modelled: arrears, meter rent, municipal taxes (MUCT etc.), estimated
readings, three-phase/TOU meters, commercial & agricultural tariffs, K-Electric
(different tariff structure - welcome as a contribution). Provincial
electricity duty is verified at 1.5% for Punjab; other regions are assumed
1.5% pending verified PRs. A computed total within a few percent of the paper
bill is the expected accuracy. The app says so on every screen - please keep
it that way.

## Data layout

Tariff rates are uniform across ex-WAPDA DISCOs, so they live in ONE shared
set per period: `data/tariffs/exwapda/<period>.json`. Per-DISCO differences
(helpline, website, provincial electricity duty) live in `data/discos.json`.
A DISCO that ever gets its own rates again just points at its own tariff set.

## Roadmap

- [x] All ex-WAPDA DISCOs
- [x] Solar: net metering + net billing (Prosumer Regulations 2026)
- [ ] K-Electric (different tariff structure)
- [x] Protected-status streak tracker (200 units x 6 months)
- [x] Appliance estimator ("your AC at 8h/day = N units/month")
- [x] Meter tracker with projection and daily allowance
- [ ] Monthly FPA auto-reminder via GitHub Action -> PR
- [ ] GasHisaab - same engine, SNGPL/SSGC winter bills

## Sources

Current tariff file (`data/tariffs/exwapda/2026-10.json`) cites:
[BijliBills — NEPRA Tariff 2026 Explained (SRO 279(I)/2026)](https://bijlibills.com/nepra-tariff-2026-explained/),
[BillsCheckOnline — LESCO unit price](https://billscheckonline.pk),
[MEPCO bill tax guide](https://mymepcobill.com),
[NEPRA](https://nepra.org.pk), plus QTA/FCA determinations as reported by
Business Recorder. The authoritative source is always the NEPRA notification.

## Credits

- UI icons: [Tabler Icons](https://tabler.io/icons) (MIT), vendored as an inline SVG sprite (`tools/fetch-icons.mjs` rebuilds it)
- Type: Space Grotesk (OFL) for numbers and headings, Noto Nastaliq Urdu (OFL) for Urdu, both self-hosted in `fonts/`
- Tariff data: see the sources cited inside `data/tariffs/`

## License

MIT — see [LICENSE](LICENSE). Rates data is public tariff information.
