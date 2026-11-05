# Performance (Phase 15)

**Lab measurements only.** No real users exist yet, so no field data (Core Web Vitals at the 75th percentile of
real visits) can exist; these numbers are a pre-launch benchmark, not a promise.

## Targets (set before measuring, unchanged afterwards)

| Measure | Target |
|---|---|
| Largest Contentful Paint (LCP) | ≤ 2.5 s public pages; ≤ 3.0 s signed-in pages |
| Cumulative Layout Shift (CLS) | ≤ 0.1 |
| Interaction (INP proxy: opening search, click → frame with the dialog) | ≤ 200 ms (median) |
| Server response (TTFB, median) | ≤ 800 ms |
| Database: search, registrations, applications, statistics | the budgets in `search.sh` / `analytics.sh` and the concurrency scripts (CI) |

## Conditions

Production build (`next build` + `next start`, Next.js 16.4.2) on a Windows laptop, **against the hosted dev
database in Paris over a home connection** (≈ 85–105 ms per database round trip, measured); Microsoft Edge
(Chromium) driven by Playwright; Pixel 7 viewport and touch; CPU slowed 4×; network "slow 4G" (150 ms RTT,
1.6 Mbps down, 750 kbps up); cold (cache disabled) then warm (same context); median of 3 runs; dev data (small).
A production host next to the database would cut the signed-in server times (several sequential queries) a lot.

## Results (5 November 2026)

| Page | LCP cold | LCP warm | CLS (worst run) | TTFB | JS (compressed) |
|---|---|---|---|---|---|
| `/` | 2132 ms | 2260 ms | 0.035 | 33 ms | 238 KB |
| `/associations` | 1772 ms | 1872 ms | **0.102** | 24 ms | 236 KB |
| `/events` | 1844 ms | 1992 ms | 0.006 | 26 ms | 236 KB |
| `/recruitment` | 1816 ms | 1780 ms | 0.001 | 22 ms | 236 KB |
| `/search?q=test` | 1764 ms | 2060 ms | 0.004 | 24 ms | 236 KB |
| `/account` | 2080 ms | 2544 ms | 0.008 | 358 ms | 239 KB |
| `/account/applications` | 1860 ms | 1748 ms | 0.002 | 375 ms | 235 KB |
| `/manage/<asso>` | 1900 ms | 1996 ms | 0.124 (1 run of 3; 0.001 when re-run 3 times) | 316 ms | 257 KB |
| `/manage/<asso>/recruitment` | 1724 ms | 1972 ms | 0.063 | 301 ms | 251 KB |
| Opening search (5 tries) | — | — | — | — | median **169 ms** (first 400 ms) |

All LCP, TTFB and interaction targets are met. **CLS fails on `/associations` (0.102)**: the display font
arrives at ≈ 2.6 s and the title re-wraps; blocking the fonts gives 0 (D12, open, design decision). The 0.124 on
`/manage/<asso>` did not reproduce in three further runs (0.001); it is reported as seen.

## Changes measured in this phase

- D10 (session check) adds **one database round trip** before each signed-in page renders: ≈ 100 ms in these
  conditions, typically 5–20 ms with the site hosted in the database's region. Kept: the security gain is large.
- The CSP nonce makes every page dynamic (they already were, except the RSS feed, icons, robots and sitemap).

## Not done

Load tests with a load generator (k6 or similar) against hosted infrastructure: the bounded load cases are the
concurrency scripts (20 parallel registrations for one seat, 20 parallel searches, a synthetic campus for
statistics) run in CI on the local stack. A load test on the production plan belongs to Phase 16, at a level the
provider allows.
