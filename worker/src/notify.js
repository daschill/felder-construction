// Notify Michael on new leads / bookings (webhook + optional email)

const DEFAULT_TO = "michael@felderconstruction.net";

function clean(v, max) {
  return String(v || "").slice(0, max).trim();
}

export function formatLeadText(lead) {
  const lines = [
    `New ${lead.kind || "lead"} — Felder website`,
    ``,
    `Source: ${lead.source || "—"}`,
    `Name: ${lead.name || "—"}`,
    `Contact: ${lead.contact || lead.phone || lead.email || "—"}`,
    `Project: ${lead.project || "—"}`,
    `Location: ${lead.location || "—"}`,
    `Timeline: ${lead.timeline || "—"}`,
    `When: ${lead.at || new Date().toISOString()}`,
    `Page: ${lead.page || "—"}`,
  ];
  if (lead.slotLabel) lines.push(`Call slot: ${lead.slotLabel}`);
  if (lead.notes) lines.push(``, `Notes: ${lead.notes}`);
  return lines.join("\n");
}

export function formatLeadHtml(lead) {
  const esc = (s) =>
    String(s || "—")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#17191d">
  <h2 style="color:#c07a3e;margin:0 0 12px">New ${esc(lead.kind || "lead")} — Felder website</h2>
  <table style="border-collapse:collapse;width:100%;max-width:520px">
    <tr><td style="padding:6px 8px;color:#5c6270">Source</td><td style="padding:6px 8px"><strong>${esc(lead.source)}</strong></td></tr>
    <tr><td style="padding:6px 8px;color:#5c6270">Name</td><td style="padding:6px 8px">${esc(lead.name)}</td></tr>
    <tr><td style="padding:6px 8px;color:#5c6270">Contact</td><td style="padding:6px 8px">${esc(lead.contact || lead.phone || lead.email)}</td></tr>
    <tr><td style="padding:6px 8px;color:#5c6270">Project</td><td style="padding:6px 8px">${esc(lead.project)}</td></tr>
    <tr><td style="padding:6px 8px;color:#5c6270">Location</td><td style="padding:6px 8px">${esc(lead.location)}</td></tr>
    <tr><td style="padding:6px 8px;color:#5c6270">Timeline</td><td style="padding:6px 8px">${esc(lead.timeline)}</td></tr>
    ${lead.slotLabel ? `<tr><td style="padding:6px 8px;color:#5c6270">Call</td><td style="padding:6px 8px"><strong>${esc(lead.slotLabel)}</strong></td></tr>` : ""}
    <tr><td style="padding:6px 8px;color:#5c6270">When</td><td style="padding:6px 8px">${esc(lead.at)}</td></tr>
  </table>
  ${lead.notes ? `<p style="margin-top:16px"><strong>Notes</strong><br>${esc(lead.notes)}</p>` : ""}
  <p style="margin-top:20px;font-size:13px;color:#5c6270">Felder Construction site · open admin to manage leads</p>
</div>`;
}

/** Fire-and-forget notifications. Never throws to caller. */
export async function notify(env, lead) {
  const payload = {
    ...lead,
    kind: lead.kind || "lead",
    at: lead.at || new Date().toISOString(),
  };
  const text = formatLeadText(payload);
  const html = formatLeadHtml(payload);
  const subject =
    payload.kind === "booking"
      ? `Call booked: ${payload.slotLabel || payload.timeline || "phone consult"} — ${payload.name || "customer"}`
      : `New lead (${payload.source || "web"}): ${payload.name || "unknown"} — ${payload.project || "project"}`;

  const jobs = [];

  // 1) Optional webhook (Zapier / Make / Discord / Slack / n8n)
  if (env.NOTIFY_WEBHOOK) {
    jobs.push(
      fetch(env.NOTIFY_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.slice(0, 1900),
          content: text.slice(0, 1900), // Discord
          subject,
          lead: payload,
        }),
      }).catch(() => null)
    );
  }

  // 2) Cloudflare Email Sending binding (if domain onboarded)
  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    const to = env.NOTIFY_EMAIL || DEFAULT_TO;
    const fromEmail = env.NOTIFY_FROM || "leads@mf-revonations.com";
    jobs.push(
      env.EMAIL.send({
        to,
        from: { email: fromEmail, name: "Felder Website" },
        subject,
        text,
        html,
      }).catch(() => null)
    );
  }

  // 3) Resend API (if secret set)
  if (env.RESEND_API_KEY) {
    const to = env.NOTIFY_EMAIL || DEFAULT_TO;
    const fromEmail = env.NOTIFY_FROM || "Felder Website <onboarding@resend.dev>";
    jobs.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          text,
          html,
        }),
      }).catch(() => null)
    );
  }

  // 4) Always store a notify log for admin
  if (env.LEADS) {
    jobs.push(
      env.LEADS.put(
        "notify:" + Date.now() + ":" + Math.random().toString(36).slice(2, 6),
        JSON.stringify({ subject, text, at: payload.at, channels: {
          webhook: !!env.NOTIFY_WEBHOOK,
          emailBinding: !!(env.EMAIL && env.EMAIL.send),
          resend: !!env.RESEND_API_KEY,
        }}),
        { expirationTtl: 60 * 60 * 24 * 90 }
      ).catch(() => null)
    );
  }

  await Promise.all(jobs);
}
