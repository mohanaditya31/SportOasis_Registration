# SportOasis 2026 — Team Registration

A static registration form (`public/`) plus one Vercel serverless function
(`api/register.js`) that validates each submission and writes it to a Google
Sheet through a small Google Apps Script (`apps-script/Code.gs`).

```
Browser form ──POST /api/register──▶ Vercel function ──▶ Apps Script web app ──▶ Google Sheet
              (validated in browser)   (validated again,     (checks secret,
                                        adds secret)          writes rows)
```

The Apps Script URL and secret live only in Vercel environment variables, so
nobody can post to your Sheet directly from the browser.

## 1. Set up the Google Sheet (5 min)

1. Create a new Google Sheet, e.g. **SportOasis 2026 Registrations**.
2. **Extensions → Apps Script**. Delete the sample code and paste in all of
   `apps-script/Code.gs`. Save.
3. **Project Settings (gear icon) → Script properties → Add script property**
   - Property: `SHARED_SECRET`
   - Value: a long random string (e.g. run `openssl rand -hex 32`). Keep it handy.
4. **Deploy → New deployment** → type **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, authorise when asked, and copy the **Web app URL** (ends in `/exec`).
5. Check it: open that URL in a browser — you should see
   `{"ok":true,"service":"SportOasis registration"}`.

The `Teams` and `Players` tabs are created automatically on the first submission:

- **Teams**: one row per registration (reference, university, sport, coordinator,
  captain, player count, full team list, and a *Possible duplicate* flag when
  the same university registers the same sport twice).
- **Players**: one row per player, linked by Reference, with name, college ID,
  ID type, and ID number. Filter this tab by sport to get rosters.

> If you later edit `Code.gs`, use **Deploy → Manage deployments → ✏️ → Version: New version**
> so the URL stays the same.

## 2. Deploy to Vercel

1. Push this folder to a GitHub repo (or run `npx vercel` from this folder).
2. Import it in Vercel. There's no build step, so keep the defaults; `vercel.json` handles the config.
3. **Settings → Environment Variables**, then add both values for Production (and Preview if you use it):
   - `GOOGLE_SCRIPT_URL`: the `/exec` URL from step 1.4
   - `SHARED_SECRET`: the same string you set in Apps Script
4. Redeploy so the variables take effect. Submit a test registration and check the Sheet.

## Local development

```bash
npm run dev        # → http://localhost:3000  (Node 18+, no installs needed)
```

With no `.env.local`, submissions are written to `local-sheet/Teams.csv` and
`local-sheet/Players.csv`, which have the same columns as the Google Sheet. To test against the
real Sheet, `cp .env.example .env.local`, fill in both values, and restart.

## Changing things

- **Sports / squad sizes**: edit `SPORTS` in `public/shared.js`. The form and the server both read it.
- **Validation rules** (Emirates ID format, phone, email): also in `public/shared.js`.
- **Look and feel**: the colour tokens at the top of `public/styles.css` match the main SportOasis site.
- **Closing registration**: remove `GOOGLE_SCRIPT_URL` in Vercel, or in Apps Script
  go to **Deploy → Manage deployments → Archive**.

## What the form does

- Captures everything in the original registration form: university, coordinator, sport,
  captain contact, and the team list. Players are entered as separate rows instead of
  one free-text box, so the Sheet gets clean columns.
- Enforces each sport's squad size, with the captain counted as player 1.
- Validates Emirates IDs (15 digits starting with 784, saved as `784-YYYY-NNNNNNN-N`),
  allows a passport number instead, and flags the same ID entered twice.
- Saves a draft in the browser, so a refresh doesn't lose a 16-player list.
- After submitting, shows a reference number (e.g. `SO26-3F9A1C`). "Register another sport"
  keeps the university and coordinator details filled in.
- Uses a hidden honeypot field to stop basic spam bots.
