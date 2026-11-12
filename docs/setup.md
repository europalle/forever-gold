# Setting up Forever Gold

What you do once, in order. Each step says what it unlocks. Nothing here needs a terminal except making the secret in step 3.

## 1. Database (starts the price history)

1. Vercel dashboard, **Storage**, **Create Database**, **Prisma Postgres** (Free plan). Name it `forever-gold`, region **Frankfurt** (closest to the EU data).
2. Open the database and find its connection strings. Copy the one that starts with `postgres://` (not `prisma+postgres://`).

## 2. GitHub secret (the collector runs from here)

1. github.com/europalle/forever-gold, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**.
2. Name `DATABASE_URL`, value: the `postgres://` string from step 1.
3. **Actions** tab, **Collect prices**, **Run workflow**. It should finish green and say `stored` twice in the log. After that it runs every 2 hours by itself.

From here on, every scan TSM publishes is kept, whether or not the site is up.

## 3. The website

1. Vercel, **Add New**, **Project**, import `europalle/forever-gold`. Leave the build settings as they are.
2. Before the first deploy, add environment variables:
   - `APP_PASSWORD`: the password you will type to sign in.
   - `SESSION_SECRET`: 64 random characters. Make one with `openssl rand -hex 32`, or any password manager's generator.
3. Database: in **Storage**, open the database and **Connect Project** to `forever-gold`. That adds its connection strings to the project; the app picks the right one by itself.
4. **Deploy**. The build applies the database migrations first.
5. Optional: **Settings**, **Domains**, add `gold.paro.fyi`, then a CNAME record `gold` pointing to `cname.vercel-dns.com` wherever paro.fyi's DNS lives.

## 4. Battle.net API client (for the addon, later)

1. develop.battle.net, sign in, **API Access**, **Create Client**. Any name; redirect URL and service URL can stay empty; tick that it is not for commercial use.
2. Keep the client ID and secret. They go into Vercel as environment variables when the addon work starts, never into chat or the repo.

## Already done, nothing to set up

- TSM's price files need no key.
- The collector endpoint `/api/cron/collect` exists if you ever want Vercel Cron instead of GitHub Actions; it then needs `CRON_SECRET`.
