# Felder Construction

Company website for Felder Construction — remodeling contractor in Arden, NC (felderconstruction.net).

Plain static site, no build step: `index.html` + `css/style.css` + `js/main.js` + `assets/`.
Deploy by uploading the folder contents to any static host (GitHub Pages, Cloudflare Pages, Netlify).

## AI chat assistant

`worker/` contains the `felder-chat` Cloudflare Worker (Workers AI, Llama 3.3 70B)
that powers the chat widget. It answers questions from a business knowledge base
and qualifies leads (project type, location, timeline, name, contact), then gives
the visitor a one-tap summary email to Michael.

- Endpoint: https://felder-chat.michaelschillereff.workers.dev/api/chat
- Redeploy: `cd worker && npx wrangler deploy`
- If the endpoint is unreachable, the widget falls back to a built-in rule-based bot.
