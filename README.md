# Disclosed congressional books

A personal reconstruction of official periodic transaction reports for Nancy Pelosi, Ro Khanna, Michael McCaul, Ashley Moody, and John Fetterman. The home page opens each member's book. Positions show the filing PDF, entry, and current price.

House members come from the [House Clerk](https://disclosures-clerk.house.gov/public_disc/financial-pdfs/). Senators come from [Senate eFD](https://efdsearch.senate.gov/search/). Paper House filings are images, so those rows are read with OCR and each position still links to the official PDF. These reports are public and this app is a personal, non-commercial reading of them.

## Run it

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install
npm run sync
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server is on port 3001 if 3000 is already taken.

`npm run sync` downloads filings that are not already parsed, refreshes prices, and sends Telegram alerts when a new trade appears.

## Schedule

The sync is meant to run at 9:00, 12:00, and 3:30 America/New_York. `.github/workflows/daily-sync.yml` starts at the UTC hours that correspond to those times in both EST and EDT. A run that is not actually one of those local times exits without doing work. You can also run it by hand with `workflow_dispatch`.

## Telegram

1. In Telegram, open @BotFather and create a bot.
2. Copy `.env.example` to `.env.local` and set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`.
3. Open Alerts, enter your mobile number, and tap Start in the bot.

Telegram will not text a phone number until that chat has opened the bot. The number is only the label on the registration form. The message goes to the Telegram chat. For the scheduled job, add `TELEGRAM_BOT_TOKEN` as a repository secret. The same workflow commits new filings and any newly registered chats.

## Keep it running

The site can stay up without this laptop.

- **Website:** import the GitHub repo into [Vercel](https://vercel.com). Vercel builds the Next.js app and keeps the URL online until you delete or pause the project. Set the same two Telegram variables in the Vercel project if you want the Alerts page to open the bot.
- **The three daily pulls:** GitHub Actions, already in `.github/workflows/daily-sync.yml`. Disable that workflow when you want the pulls to stop. The site itself stays up and simply shows the last committed books.

That split is the one that keeps running after the computer is closed. A VPS or a `launchd` job on this Mac also works, but the Mac job stops when the machine sleeps.

Publishing the workflow file needs a GitHub token with the `workflow` scope (`gh auth refresh -s workflow`).

## What the numbers mean

Filings disclose a dollar range, not a brokerage confirmation. When the report states a share count, that count is used. Otherwise shares are estimated from the midpoint of the range and the closing price on the trade date.

Spouse and dependent trades stay in the book because they are on the member's official filing. Sales that exceed purchases found in these reports are treated as shares acquired before the tracked window, and those shares are left out of profit.

Prices come from Nasdaq daily closes. Past share counts are adjusted for splits. Option contracts stay out of the stock market value until a filing says they were exercised.

Reports can be filed up to 45 days after the trade, so a check finds new filings, not same-day executions. When the same trade is restated on a later report, it is counted once.
