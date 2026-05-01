# trustmrr-opportunity-radar

Local research pipeline for finding realistic one-person SaaS and micro-SaaS opportunities that could reach about $1,000 MRR.

This is a playground tool. It is not a production SaaS, has no frontend, has no database, and does not include GitHub Actions or CI.

## Setup

Requirements:

- Node 22
- Docker and Docker Compose
- A TrustMRR API key

Install dependencies:

```sh
npm install
```

Create a local `.env` from `.env.example`:

```sh
cp .env.example .env
```

Set `TRUSTMRR_API_KEY` in `.env`. The analyser only reads the key from `TRUSTMRR_API_KEY`; `.env` is ignored by git and must never be committed.

## Run locally

```sh
npm run build
npm run analyse
```

For development:

```sh
npm run dev
```

## Run with Docker

```sh
docker compose build
docker compose run --rm analyser
```

Docker Compose mounts `runs/` and `latest/` back into the repo. It also keeps `data/`, `out/`, and `reports/` mounted for optional legacy output compatibility.

## Environment variables

# $100k MRR
MIN_MRR_CENTS=10000000
# $1m MRR
MAX_MRR_CENTS=900000000

- `TRUSTMRR_API_KEY` required
- `MIN_MRR_CENTS` default `100000` → minimum $1,000 MRR
- `MAX_MRR_CENTS` default `1000000` → maximum $10,000 MRR
- `LIMIT` default `50`
- `MAX_PAGES` optional
- `FETCH_DETAILS` default `true`
- `TOP_N` default `50`
- `REQUEST_DELAY_MS` default `3500`
- `LOG_LEVEL` default `info`
- `LEGACY_OUTPUTS_ENABLED` default `false`
- `TRUSTMRR_MONEY_SCALE` default `auto`

`TRUSTMRR_MONEY_SCALE` controls how TrustMRR money fields are normalized:

- `auto`: detect cents vs dollars from raw API values and record warnings when uncertain
- `cents`: divide money fields by 100
- `dollars`: keep money fields as already-dollar values

The code defaults remain `MIN_MRR_CENTS=100000`, `MAX_MRR_CENTS=1000000`, and `TRUSTMRR_MONEY_SCALE=auto`. `.env.example` can be edited locally for wider exploratory runs.

## Logging

The analyser prints colorful runtime progress so you can see what it is fetching, what failed, and what files were written.

Supported log levels:

- `silent`: only fatal errors and the final summary when available
- `info`: normal progress, phase summaries, warnings, output inventory
- `debug`: request-level details, safe query params, page progress, and rate-limit waits

Run locally with debug logs:

```sh
LOG_LEVEL=debug npm run analyse
```

Run Docker with debug logs:

```sh
LOG_LEVEL=debug docker compose run --rm analyser
```

Example output:

```text
🚀 TrustMRR Opportunity Radar
Config:
   - minMrrCents: 100000
   - maxMrrCents: 1000000
   - apiKey: loaded

🔎 Fetching TrustMRR list queries (34 planned)
🔎 [1/34] configured-range-revenue-desc
   Params: minMrr=100000 maxMrr=1000000 sort=revenue-desc limit=50
   📄 Page 1: 50 items
✅ Done: 50 items across 1 pages

📦 Wrote out/ranked-by-roi.csv
🎯 ✅ TrustMRR Opportunity Radar complete
```

The logger never prints `TRUSTMRR_API_KEY`, Authorization headers, or request headers.

## Output folders and run history

Normal analyser output is written to timestamped run folders:

```text
runs/<run-id>/
  data/
  out/
  reports/
  run-summary.json
  manifest.md
```

Each run ID uses local time in `YYYY-MM-DD_HH-mm-ss` format, so folder names sort alphabetically and chronologically. If two runs start in the same second, the analyser appends a suffix such as `-001`.

The newest successful run is also copied to:

```text
latest/
```

Newest reports to inspect:

- `latest/reports/research-summary.md`
- `latest/reports/clean-opportunity-table.md`
- `latest/reports/chatgpt-brief.md`
- `latest/out/ranked-by-roi.csv`

Historical reports live under:

- `runs/<timestamp>/reports/`

List newest runs on macOS/Linux:

```sh
ls -1 runs | sort | tail -10
```

List newest runs in Windows PowerShell:

```powershell
Get-ChildItem runs | Sort-Object Name | Select-Object -Last 10
```

`runs/` is the historical source of truth. `latest/` is only a convenience copy and updates only after a successful completed run. If a run fails, partial outputs stay in `runs/<run-id>/` and `latest/` is not updated.

Set `LEGACY_OUTPUTS_ENABLED=true` to also copy outputs to the old root-level `data/`, `out/`, and `reports/` folders. Compatibility mode can overwrite those old root outputs.

## Outputs

- `runs/<run-id>/data/raw-trustmrr.json`: raw TrustMRR list/detail responses and fetch logs, without request headers or API keys.
- `runs/<run-id>/data/normalized-startups.json`: normalized startups with scoring fields and raw source fields preserved per startup.
- `runs/<run-id>/out/ranked-by-mrr.csv`: products sorted by MRR.
- `runs/<run-id>/out/ranked-by-revenue-last-30-days.csv`: products sorted by last 30 days revenue.
- `runs/<run-id>/out/ranked-by-solo-fit.csv`: products sorted by solo/tiny-team likelihood.
- `runs/<run-id>/out/ranked-by-roi.csv`: products sorted by ROI score.
- `runs/<run-id>/out/ranked-by-lowest-build-effort.csv`: products sorted by low build effort.
- `runs/<run-id>/out/research-queue.csv`: top opportunity research queries for manual follow-up.
- `runs/<run-id>/out/money-scale-audit.csv`: raw money values, normalized values, scale decisions, confidence, and possible 100x warnings.
- `runs/<run-id>/out/clean-opportunity-table.csv`: compact opportunity table for spreadsheet review.
- `runs/<run-id>/reports/top-50-opportunities.md`: readable top opportunity notes.
- `runs/<run-id>/reports/research-summary.md`: search strategy, ranking summaries, avoid categories, and limitations.
- `runs/<run-id>/reports/chatgpt-brief.md`: compact brief for external competitor research.
- `runs/<run-id>/reports/clean-opportunity-table.md`: clean opportunity table grouped for ChatGPT review.
- `runs/<run-id>/run-summary.json`: machine-readable run metadata, stats, failures, and next files.
- `runs/<run-id>/manifest.md`: human-readable run manifest.

## Money scaling audit

TrustMRR responses may expose money values as cents or dollars depending on the field/shape. The analyser preserves raw money fields in `normalized-startups.json` and writes a dedicated audit CSV:

```text
latest/out/money-scale-audit.csv
```

Inspect it when rankings look suspicious. Key fields include `rawMrr`, `mrrUsd`, `moneyScaleUsed`, `moneyScaleConfidence`, `possibleHundredXIssue`, and `moneyScaleWarnings`.

For a forced comparison run:

```sh
TRUSTMRR_MONEY_SCALE=dollars npm run analyse
```

## Scoring

Scores are heuristic. They are designed to prioritize products that look realistic for a solo developer to study or emulate in a narrower form.

- `revenueScore`: log-scaled MRR and last 30 days revenue.
- `soloLikelihoodScore`: based on founder count proxy, low subscription count with meaningful MRR, B2B signals, and category penalties.
- `roiScore`: rewards high MRR per active subscription, revenue per visitor, margin, growth, B2B buyer signals, low subscription counts, and pricing power.
- `buildEffortScore`: 1 to 10, where 1 is easiest and 10 is too heavy for fast solo SaaS.
- `buildEaseScore`: inverse of build effort on a 0 to 100 scale.
- `distributionDifficultyScore`: 1 to 10, where 1 is easiest to sell and 10 is hardest.
- `manualValidationScore`: rewards opportunities that can be sold manually or semi-manually before full automation.
- `finalOpportunityScore`: ROI 35%, solo likelihood 20%, build ease 15%, manual validation 15%, revenue 10%, inverse distribution difficulty 5%.

## Search strategy

The analyser fetches multiple TrustMRR passes and dedupes by slug:

- configured MRR range sorted by revenue, growth, and newest
- uncapped high-revenue pattern-discovery set sorted by revenue, growth, and newest
- category searches for SaaS, developer tools, productivity, analytics, AI, marketing, utilities, automation, ecommerce, and content categories

The client uses `Authorization: Bearer <TRUSTMRR_API_KEY>`, paginates with `limit=50`, respects the default 20 requests/minute pacing, retries 429 responses, and continues when individual detail or category requests fail.

## Security

- The API key is read only from `TRUSTMRR_API_KEY`.
- The API key is never printed.
- Request headers are never written to JSON, CSV, Markdown, or logs.
- `.env` is ignored by git.
- `.env.example` is safe to commit and contains no real secret.

## Known limitations

- TrustMRR does not confirm staff count.
- Cofounders are only a proxy, not confirmed employee count.
- Missing founder data is not proof of solo-founder status.
- Competitor research still needs external verification.
- Revenue data depends on TrustMRR accuracy.
- Build effort, distribution difficulty, and manual validation are heuristic estimates, not facts.
- The API response parser is intentionally flexible, but TrustMRR response shape changes may still require updates.
