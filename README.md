# Felder Construction

Company website for Felder Construction — remodeling contractor in Arden, NC.

**Live site:** https://www.mf-revonations.com  
**Admin:** https://www.mf-revonations.com/admin.html  
**Repo:** https://github.com/daschill/felder-construction

## Deploy

```bash
npx wrangler pages deploy . --project-name=felder-construction --commit-dirty=true --branch=main
cd worker && npx wrangler deploy
```

## Features

| Feature | Where |
|---------|--------|
| Marketing site + SEO service pages | `/`, `/kitchen-remodeling`, etc. |
| Case studies | `/project-kitchen`, `/project-bathroom`, `/project-deck` |
| Local SEO pages | `/asheville-remodeling`, `/fletcher-remodeling`, `/hendersonville-remodeling` |
| AI chat | Widget + Workers AI |
| Estimate form + lead log | KV `lead:…` |
| Phone scheduling calendar | Contact → **Book a call** · `/#schedule` |
| Admin dashboard | `/admin.html` (LEADS_KEY) |
| Pageview counts | `/api/hit` + admin “views today” |

## Worker secrets (recommended)

```bash
cd worker
npx wrangler secret put LEADS_KEY          # required for admin
npx wrangler secret put NOTIFY_WEBHOOK     # optional: Discord/Zapier/Make URL
npx wrangler secret put RESEND_API_KEY     # optional: email via Resend
npx wrangler secret put NOTIFY_EMAIL       # optional: default michael@felderconstruction.net
npx wrangler secret put NOTIFY_FROM        # optional: from address for Resend
```

With **NOTIFY_WEBHOOK** or **RESEND_API_KEY** set, every lead and phone booking pings Michael automatically.

### Discord webhook tip

Create a channel webhook and set it as `NOTIFY_WEBHOOK`. The worker posts `{ content: "..." }` compatible with Discord.

### Resend email tip

1. Sign up at resend.com  
2. `npx wrangler secret put RESEND_API_KEY`  
3. Optionally verify your domain and set `NOTIFY_FROM` to `Felder Website <leads@yourdomain.com>`

## Admin

1. Open https://www.mf-revonations.com/admin.html  
2. Enter the same value as `LEADS_KEY`  
3. View leads, upcoming calls, page views, block vacation days, cancel bookings  

## Schedule APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/schedule/days?days=21` | Open days |
| `GET /api/schedule/slots?date=` | Open times |
| `POST /api/schedule/book` | Book call |
| `GET /api/schedule/bookings?key=` | List bookings |
| `POST /api/schedule/block` | Block a day (admin) |
| `DELETE /api/schedule/block?date=` | Unblock |
| `GET /api/admin/summary?key=` | Dashboard data |

## Domains

| Host | Role |
|------|------|
| www.mf-revonations.com | Primary live |
| felder-construction.pages.dev | Backup |
| felderconstruction.net | Still on old Squarespace — point DNS when ready |
