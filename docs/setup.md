# Setting up Forever Gold

What you do once, in order. Each step says what it unlocks. Nothing here needs a terminal.

## 1. Database (starts the price history)

1. Vercel dashboard, **Storage**, **Create Database**, **Prisma Postgres** (Free plan). Name it `forever-gold`, region **Frankfurt** (closest to the EU data).
2. Open the database and find its connection strings. Copy the one that starts with `postgres://` (not `prisma+postgres://`).

## 2. The website

1. Vercel, **Add New**, **Project**, import `europalle/forever-gold`. Leave the build settings as they are.
2. Before the first deploy, add environment variables:
   - `APP_PASSWORD`: the password you will type to sign in.
   - `SESSION_SECRET`: 64 random characters. Make one with `openssl rand -hex 32`, or any password manager's generator.
   - `CRON_SECRET`: another 64 random characters, different from the first. The scheduler uses it in step 3.
3. Database: in **Storage**, open the database and **Connect Project** to `forever-gold`. That adds its connection strings to the project; the app picks the right one by itself.
4. **Deploy**. The build applies the database migrations first.
5. Optional: **Settings**, **Domains**, add `gold.paro.fyi`, then a CNAME record `gold` pointing to `cname.vercel-dns.com` wherever paro.fyi's DNS lives.

## 3. Scheduler: cron-job.org (collects the prices)

Free, runs on the minute, and emails you when a run fails.

1. Sign up at cron-job.org and **Create cronjob**.
2. URL: `https://<your site>/api/cron/collect` (for example `https://gold.paro.fyi/api/cron/collect`).
3. Schedule: every hour, at minute 30. TSM publishes around :25 every 3 hours, so this picks up each scan within minutes.
4. **Advanced**, **Headers**, add one: name `Authorization`, value `Bearer ` followed by your `CRON_SECRET` (one space after Bearer).
5. **Notifications**: turn on "execution failed".
6. Save, then **Test run**. The response should say `stored` or `unchanged` for both files. `401` means the header does not match `CRON_SECRET`.

## 4. Backup: GitHub Actions

Optional, but cheap insurance if the site or cron-job.org has a bad day.

1. github.com/europalle/forever-gold, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**.
2. Name `DATABASE_URL`, value: the `postgres://` string from step 1.
3. **Actions** tab, **Collect prices**, **Run workflow** to test it. After that it runs every 6 hours.

## 5. Battle.net API client (for the addon, later)

1. develop.battle.net, sign in, **API Access**, **Create Client**. Any name; redirect URL and service URL can stay empty; tick that it is not for commercial use.
2. Keep the client ID and secret. They go into Vercel as environment variables when the addon work starts, never into chat or the repo.

## Already done, nothing to set up

- TSM's price files need no key.
- Running both schedulers is safe: each TSM scan is stored once, whoever fetches it first.
