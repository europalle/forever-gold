# Forever Gold

A private market analyst for World of Warcraft: Forever. It collects auction prices, keeps their history, and tells you what to sell, cure, craft, disenchant and hold. It only advises: every action in the game stays a manual click.

`CLAUDE.md` is the brief. `docs/research.md` is the research the build rests on. `docs/setup.md` is the setup checklist, and `docs/mockups/addon.html` shows how the in-game addon will look.

## Setup

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL, APP_PASSWORD, SESSION_SECRET
npx prisma migrate dev
npm run collect        # fetch the TSM price files once
npm run dev
```

## Scripts

- `npm run collect`: fetch the TSM market and region files and store any that are new.
- `npm test`: unit tests (CSV parsing, money formatting, advice).
- `npm run vercel-build`: what Vercel runs; applies migrations, then builds.
