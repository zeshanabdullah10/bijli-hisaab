# BijliHisaab · بجلی حساب

**Your electricity bill, translated.**

A free, offline-capable, bilingual (English / اردو) decoder for Pakistani domestic
electricity bills. Punch in your units and it shows — line by line, with formulas
and sources — where every rupee goes: slab charges, the new per-kW fixed charges,
financing surcharge, FPA, QTA, electricity duty, GST, TV fee and income tax.

It also shows the thing nobody explains: **the slab cliff**. Unprotected consumers
are billed at the rate of the slab the month *lands in* — cross 200 units by one
and the whole month is repriced. Drag the slider and watch it happen.

- No accounts, no tracking, no backend — 100% client-side.
- Tariff data is open JSON with a `source_url` on every rate.
- Installable PWA: works offline, including during load-shedding.

## Run it locally

```bash
npm start        # serves on http://127.0.0.1:8080
# or:  npx -y http-server -p 8080
# or:  python -m http.server 8080
```

Opening `index.html` directly from disk will **not** work (ES modules + `fetch`
require HTTP).

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
100 × 10.54 + 100 × 13.01 = Rs 2,355) and guards the data schema (every tariff
file must carry sources and effective dates).

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

1. Edit `data/tariffs/lesco/<period>.json` (or add a new period file and bump
   `default` in `data/tariffs/lesco/index.json`).
2. Set `effective_date`, `verified_on`, and add a `sources` entry linking the
   NEPRA notification / SRO / credible news report.
3. Run `npm test` — the schema test rejects uncited data.
4. Open a PR. Anything without a source link gets rejected.

Adding a DISCO: add an entry to `data/discos.json` (with its provincial
electricity duty), create `data/tariffs/<id>/<period>.json`, and add the id to
the DISCO picker in `index.html`. The engine is DISCO-agnostic.

## What is modelled (and what is not)

Modelled: domestic single-phase — unprotected / protected / lifeline slabs,
per-kW fixed charges, financing-cost surcharge, QTA, FPA (default + your bill's
exact rate), provincial electricity duty, GST, TV licence fee, income tax for
non-filers above Rs 25,000, minimum charge, the slab cliff, budget planner,
paper-bill audit.

**Not** modelled: arrears, meter rent, municipal taxes (MUCT etc.), estimated
readings, three-phase/TOU meters, commercial & agricultural tariffs, net
metering. A computed total within a few percent of the paper bill is the
expected accuracy. The app says so on every screen — please keep it that way.

## Roadmap

- [ ] More DISCOs (FESCO, GEPCO, IESCO, MEPCO…) — data PRs welcome
- [ ] K-Electric (different tariff structure)
- [ ] Protected-status streak tracker (≤200 units × 6 months)
- [ ] Appliance estimator ("your AC at 8h/day ≈ N units/month")
- [ ] Monthly FPA auto-reminder via GitHub Action → PR
- [ ] GasHisaab — same engine, SNGPL/SSGC winter bills

## Sources

Current LESCO tariff file (`data/tariffs/lesco/2026-10.json`) cites:
[BijliBills — NEPRA Tariff 2026 Explained (SRO 279(I)/2026)](https://bijlibills.com/nepra-tariff-2026-explained/),
[BillsCheckOnline — LESCO unit price](https://billscheckonline.pk),
[MEPCO bill tax guide](https://mymepcobill.com),
[NEPRA](https://nepra.org.pk), plus QTA/FCA determinations as reported by
Business Recorder. The authoritative source is always the NEPRA notification.

## Credits

- UI icons: [Tabler Icons](https://tabler.io/icons) (MIT), vendored as an inline SVG sprite (`tools/fetch-icons.mjs` rebuilds it)
- Urdu display type: Noto Nastaliq Urdu (OFL), self-hosted arabic subset in `fonts/`
- Tariff data: see the sources cited inside `data/tariffs/`

## License

MIT — see [LICENSE](LICENSE). Rates data is public tariff information.
