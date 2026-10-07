# Pelosi Portfolio

A personal view of Nancy Pelosi’s disclosed stock book. Each weekday the sync reads new [House Clerk periodic transaction reports](https://disclosures-clerk.house.gov/public_disc/financial-pdfs/), rebuilds positions from those filings, and marks them with market prices.

The screen is meant to feel like a brokerage account: what is held, when it was entered, what it is worth, and how the book has moved.

## Run it

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install
npm run sync
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run sync` is also the daily job. It only downloads filings that are not already parsed, then refreshes prices.

## What the numbers mean

House filings disclose a dollar range, not a brokerage confirmation. When the PDF states a share count (“Purchased 25,000 shares”, “Exercised 50 call options (5,000 shares)”), that count is used. Otherwise shares are estimated from the midpoint of the range and the closing price on the trade date.

Most of the reported trades are the spouse’s. They stay in the book because they are on the member’s official filing. Sales that exceed purchases found in these reports are treated as shares acquired before the tracked window, and those shares are left out of profit.

Prices come from Yahoo Finance daily closes. Past share counts are adjusted for splits. Option contracts stay out of the stock market value until a filing says they were exercised.

Reports can be filed up to 45 days after the trade, so a daily check finds new filings, not same-day executions. When the same trade is restated on a later report, it is counted once.

## Daily refresh

`.github/workflows/daily-sync.yml` runs every day at 22:00 UTC, commits `data/trades.json` and `data/snapshot.json` when something changed, and pushes to this repository. Pull to see the update locally.
