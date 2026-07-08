# The Coin Bank

A family coin/allowance tracker. Kids (Ryan and Emma) each have an account where they can earn coins by completing tasks, save toward reward goals ("buckets"), and request rewards. A PIN-locked parent panel approves requests, manages the task and reward catalogs, and adjusts balances.

Built with React + Vite, data stored in Supabase (free tier), deployed on GitHub Pages (free).

## Features

- Per-kid passbook view: balance, coin stack visual, savings goals, activity history
- Task catalog with coin values, assignable to one kid or both; kids can also suggest their own tasks
- Request/approve flow: kids request coins for completed tasks, parent approves (with editable amount) or declines
- Savings goals with progress bars; claiming a completed goal also requires parent approval
- Reward catalog for one-tap goal creation
- Full transaction ledger, JSON backup/export and restore
- Multi-device: data auto-refreshes every 15 seconds and on tab focus

## Setup (once, ~15 minutes)

### 1. Supabase (the database)

1. Create a free account at [supabase.com](https://supabase.com) and create a new project (any name, e.g. `coin-bank`). Choose a strong database password and save it somewhere safe (you rarely need it again).
2. In the dashboard, open **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Go to **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long string; this key is *designed* to be public)

### 2. Run locally (optional but recommended first)

```bash
npm install
cp .env.example .env
# edit .env and paste in your Project URL and anon key
npm run dev
```

Open the printed localhost URL. Add some coins from the Parent tab (default PIN `1234` — change it right away from the panel) and confirm the data survives a page refresh. Check the `coin_bank` table in Supabase's Table Editor — you should see one row.

### 3. GitHub + Pages deployment

1. Create a new GitHub repository and push this folder to it (branch `main`).
2. In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Add both:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings → Pages → Source**: select **GitHub Actions**.
4. Push to `main` (or re-run the workflow from the Actions tab). The included workflow builds and deploys automatically.
5. Your app will be live at `https://<your-username>.github.io/<repo-name>/`. Send that link to the kids — add it to their home screens for an app-like experience.

## Migrating data from the Claude artifact version

Use the **Backup** button in the old artifact's Parent tab to download the JSON file, then use **Restore** in the new deployed app's Parent tab to load it. Balances, goals, catalogs, and full history carry over.

## Security model (read this once)

This is a *trusted family app*, not a bank:

- The Supabase anon key is public by design; anyone who has your app URL can read/write the family's coin data through the app. Don't post the link publicly.
- The parent PIN gates the UI only — it stops kids from opening the parent panel, but a technically determined teenager with dev tools could bypass it. For two kids and a Lego fund, this is fine. If you ever want real auth, Supabase Auth (email magic links) is the natural upgrade and only touches `storageAdapter.js` / `supabaseClient.js`.
- No delete policy exists on the table, so the data row can't be wiped through the public key.

## Project structure

```
├── index.html                  # Tailwind CDN + fonts + root div
├── src/
│   ├── main.jsx                # React entry point
│   ├── App.jsx                 # The entire app UI (all components)
│   ├── storageAdapter.js       # load()/save() against Supabase — swap backends here
│   └── supabaseClient.js       # Supabase client init from env vars
├── supabase/schema.sql         # One-time database setup
└── .github/workflows/deploy.yml# Auto-deploy to GitHub Pages on push
```

## Everyday changes

- **Rename the kids / add a third kid:** edit the `KIDS` and `ACCENTS` constants at the top of `src/App.jsx`.
- **Change seeded tasks/rewards:** they live in `defaultData` in `src/App.jsx` (only used the first time, before any data exists).
- **Reset everything:** delete the row in Supabase's Table Editor.
