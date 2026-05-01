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

Docker Compose mounts `data/`, `out/`, and `reports/` back into the repo.

## Environment variables

- `TRUSTMRR_API_KEY` required
- `MIN_MRR_CENTS` default `100000`
- `MAX_MRR_CENTS` default `1000000`
- `LIMIT` default `50`
- `MAX_PAGES` optional
- `FETCH_DETAILS` default `true`
- `TOP_N` default `50`
- `REQUEST_DELAY_MS` default `3500`

## Outputs

- `data/raw-trustmrr.json`: raw TrustMRR list/detail responses and fetch logs, without request headers or API keys.
- `data/normalized-startups.json`: normalized startups with scoring fields and raw source fields preserved per startup.
- `out/ranked-by-mrr.csv`: products sorted by MRR.
- `out/ranked-by-revenue-last-30-days.csv`: products sorted by last 30 days revenue.
- `out/ranked-by-solo-fit.csv`: products sorted by solo/tiny-team likelihood.
- `out/ranked-by-roi.csv`: products sorted by ROI score.
- `out/ranked-by-lowest-build-effort.csv`: products sorted by low build effort.
- `out/research-queue.csv`: top opportunity research queries for manual follow-up.
- `reports/top-50-opportunities.md`: readable top opportunity notes.
- `reports/research-summary.md`: search strategy, ranking summaries, avoid categories, and limitations.
- `reports/chatgpt-brief.md`: compact brief for external competitor research.

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

- $1k-$10k MRR reference set sorted by revenue, growth, and newest
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
