# Felder Construction

Company website for Felder Construction — remodeling contractor in Arden, NC.

**Live site:** https://www.mf-revonations.com  
**Repo:** https://github.com/daschill/felder-construction

Plain static site, no build step: HTML + `css/style.css` + `js/main.js` + `assets/`.

## Deploy

```bash
# Static site → Cloudflare Pages
npx wrangler pages deploy . --project-name=felder-construction --commit-dirty=true --branch=main

# Chat / lead worker
cd worker && npx wrangler deploy
```

## AI chat assistant

`worker/` is the `felder-chat` Cloudflare Worker (Workers AI, Llama 3.3 70B).
It answers from a business knowledge base, qualifies leads, and stores them in KV.

| Endpoint | Purpose |
|----------|---------|
| `POST /api/chat` | AI chat |
| `POST /api/lead` | Store a lead |
| `GET /api/leads?key=` | List leads (`LEADS_KEY` secret) |
| `GET /api/health` | Health check |

Base URL: `https://felder-chat.michaelschillereff.workers.dev`

If the chat endpoint is unreachable, the widget falls back to a rule-based bot.
Estimate form submissions are stored in KV even when the visitor never opens an email client.

## Domains

| Host | Status |
|------|--------|
| **felder-construction.pages.dev** | **Live production** |
| `felder.schilllabs.com` | Attached to Pages; needs DNS CNAME (OAuth token cannot write DNS) |
| `mf-revonations.com` / `www` | Attached to Pages; zone is on Cloudflare but **not this account** — set CNAMEs at that zone’s DNS host |
| `felderconstruction.net` | Legacy Squarespace site (unchanged) |

### Activate a custom domain

In the Cloudflare dashboard (DNS for the zone), add:

```
CNAME  felder   →  felder-construction.pages.dev   # for felder.schilllabs.com
CNAME  www      →  felder-construction.pages.dev   # for www.mf-revonations.com
CNAME  @        →  felder-construction.pages.dev   # apex, or use ANAME/ALIAS
```

Then wait for the Pages custom domain status to flip to **Active**. After that, update canonical / OG / sitemap URLs to the custom host and redeploy.

## Leads

```bash
curl "https://felder-chat.michaelschillereff.workers.dev/api/leads?key=YOUR_LEADS_KEY"
```

## Phone call scheduling

On the contact card, **Book a call** opens a calendar of open 30-minute slots
(Eastern time). Hours: Mon–Thu 8a–7p, Fri 8a–5:30p, Sat 9a–4:30p, closed Sunday.
Minimum notice 2 hours; up to 30 days ahead. Bookings are stored in KV (`book:…`)
and also written as leads (`source: phone-schedule`).

| Endpoint | Purpose |
|----------|---------|
| `GET /api/schedule/days?days=21` | Days + open slot counts |
| `GET /api/schedule/slots?date=YYYY-MM-DD` | Open times for a day |
| `POST /api/schedule/book` | Book a slot |
| `GET /api/schedule/bookings?key=` | List bookings (admin) |

UI deep link: `https://www.mf-revonations.com/#schedule`
