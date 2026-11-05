# Deploying Parallax

Two Vercel projects build the same repo: **yours**, behind the password, on your own Neon database,
and the **public demo**, read-only, on a separate Neon database of made-up trades. Nothing below
runs automatically; each step is yours to do in the Vercel and Neon dashboards.

## Keeping it private until you decide

Nothing is reachable until something is deployed, so set everything up in this order:

1. Do Neon (section 1) first. A database alone exposes nothing.
2. Create the Vercel projects **without connecting Git**, so a push can't deploy by surprise.
3. Set the Production variables before the first deploy, `APP_PASSWORD` and `SESSION_SECRET` first. A
   deployment missing either one fails closed: nobody can sign in.
4. Deploy **your** project only, and run the checks in section 5 against it. Signed out, a page must
   redirect to `/login` and an API route must answer 401.
5. Leave the demo project empty (or undeployed, or without a domain) until you want it public. It has
   no sign-in by design.

Vercel's Deployment Protection can put its own login in front of a deployment. As far as we know
preview deployments are protected on every plan and production needs a paid one; check Vercel's
current plan page before relying on it. The app's own sign-in does not depend on it.

## 1. Neon (Postgres 17)

1. Create two Neon projects, `parallax` and `parallax-demo`, in the region nearest your Vercel
   functions (Vercel defaults to Washington, D.C., `iad1`; Neon's `aws-us-east-1` is next to it).
   Separate projects, not two databases in one, so the demo's credentials can't reach your journal.
2. From each, copy two connection strings: the **pooled** one (its host has `-pooler`), which the
   app uses, and the **direct** one, for migrations and seeding. Both include `sslmode=require`.
3. Migrate both with the direct strings:

   ```sh
   DATABASE_URL='<parallax direct url>' npm run db:migrate
   DATABASE_URL='<parallax-demo direct url>' npm run db:migrate
   ```

4. Seed the demo (it refuses any database that already has data):

   ```sh
   DEMO_DATABASE_URL='<parallax-demo direct url>' npm run db:seed-demo
   ```

Run `db:migrate` against both again whenever a commit adds a migration, before that commit deploys.

## 2. Alpaca

The demo needs its own keys from a **separate, empty paper account**. It never shows positions
(`/api/positions` is refused), but its market data reads are open to anyone and spend those keys'
rate limit. Never give the demo your live or main paper keys.

## 3. Vercel: your project

Import the repo as `parallax`. Set these for **Production only**, so preview deployments of branches
never get your database or keys:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the `parallax` **pooled** string |
| `APP_PASSWORD` | a long random password: `openssl rand -base64 24` |
| `SESSION_SECRET` | `openssl rand -base64 32`; changing it signs out every browser |
| `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`, `ALPACA_TRADING_HOST` | your keys, as in `.env.local` |
| `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` | as in `.env.local` |

Never set `NEXT_PUBLIC_DEMO_MODE` here. It turns off sign-in, and set at runtime alone the server
would read it without a rebuild.

## 4. Vercel: the demo project

Import the same repo again as `parallax-demo`, with these for **Production only**, so a preview built
without demo mode never points at the demo database:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | `true` (Vercel's Production variables are also there at build time, when Next inlines it) |
| `DATABASE_URL` | the `parallax-demo` **pooled** string |
| `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY` | the separate empty paper account's keys |
| `ALPACA_TRADING_HOST` | `https://paper-api.alpaca.markets` |

Leave out `APP_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, and `ELEVENLABS_API_KEY`: the demo
needs none of them, and leaving them out means a mistake can't spend them.

## 5. Check each deployment

Yours (`https://<your domain>`):

```sh
curl -sI https://<your domain>/journal | grep -i '^location'   # -> https://<your domain>/login?next=%2Fjournal
curl -s https://<your domain>/api/journal                       # -> {"error":"Sign in first."}
```

Then sign in in the browser, and sign out from the nav.

The demo:

```sh
curl -s -X POST https://<demo domain>/api/journal -H 'content-type: application/json' -d '{}'
# -> {"error":"The demo is read-only."}
curl -s https://<demo domain>/api/positions   # -> {"error":"The demo doesn't show account data."}
```

Then open `/journal` and check the week of 2026-10-26 shows, with its reviews' coaching.
