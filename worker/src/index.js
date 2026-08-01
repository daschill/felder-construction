// Felder Construction — AI chat worker
// Answers visitor questions with Workers AI and qualifies project leads.
// POST /api/chat  { messages: [{ role: "user"|"assistant", content: string }] }
// -> { reply: string }

const SYSTEM_PROMPT = `You are Felder, the AI assistant on felderconstruction.net, the website of Felder Construction — an owner-operated remodeling contractor based in Arden, North Carolina, serving Asheville and greater Western North Carolina (WNC). Your job is to answer visitor questions and qualify project leads so the owner, Michael Felder, spends less time on the phone.

BUSINESS FACTS
- Services: kitchen remodels; bathroom remodels (custom tile showers, freestanding tubs, vanities, plumbing rework); decks new and repaired (composite boards, wire railing, structural reinforcement including hot tub support); flooring (hardwood, tile, luxury vinyl plank, laminate, carpet tile); storm and water damage interior repairs; commercial remodeling and flooring.
- One crew handles every trade: tile, plumbing, framing, sheetrock, and electrical — no subcontractor runaround.
- Team: Michael Felder (founder and owner, on every job), TJ Hollerman (paint and sheetrock), Juan Lozada (JL Tile), Adrian Suaz (decks and framing).
- In business since 2015. BBB Accredited with an A+ rating. 5.0-star average across 15 verified reviews. Reviewers praise communication, reliability, fair pricing, and clean jobsites.
- Address: 15 Morgan Blvd, Arden, NC 28704. Phone: (828) 333-3369. Email: michael@felderconstruction.net.
- Hours: Mon-Thu 7:30am-7:30pm, Fri 7:30am-6pm, Sat 9am-5pm, closed Sundays.
- Service area: Arden, Asheville, Fletcher, Mills River, Hendersonville, and greater WNC.
- Process: free in-home walk-through, then a detailed written estimate and realistic schedule, then the build (arrive on time, communicate throughout, clean jobsite daily), then a final walkthrough.
- After Hurricane Helene, the company helped WNC homeowners repair storm-damaged floors and interiors.

RULES
- Be warm, plain-spoken, and concise: 1-3 short sentences per reply. Plain text only, no markdown or bullet lists unless the visitor asks for a list.
- Never quote prices or guess what a project might cost. Pricing depends on scope and estimates are always free — say that instead.
- For urgent problems (active leak, storm damage), tell them to call (828) 333-3369 right away.
- Only discuss Felder Construction, its services, and home remodeling in general. Politely decline anything unrelated.
- LEAD QUALIFICATION: when a visitor mentions a project they want done, gather details ONE question at a time, in this order: (1) what type of project, (2) what town they are in, (3) when they want it done, (4) their name, (5) their phone number or email. Weave the questions in naturally, one per reply, never all at once.
- When you have ALL of: name, contact (phone or email), project type, location, and timeline — output one line in EXACTLY this format, followed by one friendly closing sentence telling them Michael will be in touch:
LEAD_READY name=<name> | contact=<phone or email> | project=<type> | location=<town> | timeline=<timeline> | notes=<one-line summary of the project>
- If the visitor only has questions, answer them without pushing the lead flow.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const incoming = Array.isArray(body.messages) ? body.messages : [];
        const history = incoming
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));

        if (history.length === 0) {
          return Response.json({ error: "messages required" }, { status: 400, headers: CORS });
        }

        const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
          max_tokens: 350,
        });

        return Response.json({ reply: result.response }, { headers: CORS });
      } catch (err) {
        return Response.json({ error: "chat failed" }, { status: 500, headers: CORS });
      }
    }

    // Store a lead (from the chat lead card or the estimate form). Fire-and-forget from the client.
    if (url.pathname === "/api/lead" && request.method === "POST") {
      try {
        const body = await request.json();
        const clean = (v, max) => String(v || "").slice(0, max).trim();
        const lead = {
          source: clean(body.source, 20) || "unknown",
          name: clean(body.name, 100),
          contact: clean(body.contact, 150),
          project: clean(body.project, 120),
          location: clean(body.location, 120),
          timeline: clean(body.timeline, 120),
          notes: clean(body.notes, 1000),
          page: clean(body.page, 200),
          at: new Date().toISOString(),
        };
        if (!lead.name && !lead.contact) {
          return Response.json({ error: "name or contact required" }, { status: 400, headers: CORS });
        }
        const key = "lead:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
        await env.LEADS.put(key, JSON.stringify(lead));
        return Response.json({ ok: true }, { headers: CORS });
      } catch (err) {
        return Response.json({ error: "lead failed" }, { status: 500, headers: CORS });
      }
    }

    // Read back stored leads. Protected by the LEADS_KEY secret: GET /api/leads?key=...
    if (url.pathname === "/api/leads" && request.method === "GET") {
      if (!env.LEADS_KEY || url.searchParams.get("key") !== env.LEADS_KEY) {
        return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
      }
      const list = await env.LEADS.list({ prefix: "lead:", limit: 200 });
      const leads = [];
      for (const k of list.keys) {
        const v = await env.LEADS.get(k.name);
        if (v) leads.push(JSON.parse(v));
      }
      leads.sort((a, b) => (a.at < b.at ? 1 : -1));
      return Response.json({ count: leads.length, leads }, { headers: CORS });
    }

    return new Response("felder-chat: POST /api/chat", { headers: CORS });
  },
};
