// Felder Construction — AI chat + phone scheduling worker
// POST /api/chat  ·  POST /api/lead  ·  GET /api/leads
// GET  /api/schedule/days  ·  GET /api/schedule/slots  ·  POST /api/schedule/book

import {
  availableSlots,
  availabilitySummary,
  bookSlot,
  listBookings,
  SCHEDULE_META,
} from "./schedule.js";

const SYSTEM_PROMPT = `You are Felder, the AI assistant on the Felder Construction website — an owner-operated remodeling contractor based in Arden, North Carolina, serving Asheville and greater Western North Carolina (WNC). Your job is to answer visitor questions and qualify project leads so the owner, Michael Felder, spends less time on the phone.

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
- Phone call scheduling: visitors can book a free 30-minute phone consult on the website (section #schedule). Hours for calls: Mon–Thu 8am–7pm, Fri 8am–5:30pm, Sat 9am–4:30pm Eastern, closed Sunday. Tell them to use the online calendar at the Schedule a Call section, or open /#schedule.

RULES
- Be warm, plain-spoken, and concise: 1-3 short sentences per reply. Plain text only, no markdown or bullet lists unless the visitor asks for a list.
- Never quote prices or guess what a project might cost. Pricing depends on scope and estimates are always free — say that instead.
- For urgent problems (active leak, storm damage), tell them to call (828) 333-3369 right away.
- Only discuss Felder Construction, its services, and home remodeling in general. Politely decline anything unrelated.
- If they want to schedule a call, point them to the website calendar (#schedule) rather than inventing available times yourself.
- LEAD QUALIFICATION: when a visitor mentions a project they want done, gather details ONE question at a time, in this order: (1) what type of project, (2) what town they are in, (3) when they want it done, (4) their name, (5) their phone number or email. Weave the questions in naturally, one per reply, never all at once.
- When you have ALL of: name, contact (phone or email), project type, location, and timeline — output one line in EXACTLY this format, followed by one friendly closing sentence telling them Michael will be in touch:
LEAD_READY name=<name> | contact=<phone or email> | project=<type> | location=<town> | timeline=<timeline> | notes=<one-line summary of the project>
- If the visitor only has questions, answer them without pushing the lead flow.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

function clean(v, max) {
  return String(v || "").slice(0, max).trim();
}

function parseLeadLine(text) {
  const m = String(text).match(/LEAD_READY\s+(.+?)(?:\n|$)/);
  if (!m) return null;
  const lead = {};
  m[1].split("|").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx > -1) lead[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  });
  return lead;
}

async function storeLead(env, body) {
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
    return { error: "name or contact required" };
  }
  if (!env.LEADS) {
    return { error: "leads store not configured" };
  }
  const key = "lead:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
  await env.LEADS.put(key, JSON.stringify(lead));
  return { ok: true, key };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Health check
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "felder-chat" });
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
          return json({ error: "messages required" }, 400);
        }

        const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
          max_tokens: 350,
        });

        const reply = result.response || "";

        // Server-side lead capture so leads are not lost if the client fails
        const parsed = parseLeadLine(reply);
        if (parsed && (parsed.name || parsed.contact)) {
          try {
            await storeLead(env, {
              source: "chat-server",
              name: parsed.name,
              contact: parsed.contact,
              project: parsed.project,
              location: parsed.location,
              timeline: parsed.timeline,
              notes: parsed.notes,
              page: clean(body.page, 200) || "chat",
            });
          } catch (_) {
            /* never fail the chat reply over lead storage */
          }
        }

        return json({ reply });
      } catch (err) {
        return json({ error: "chat failed" }, 500);
      }
    }

    // Store a lead (from the chat lead card or the estimate form)
    if (url.pathname === "/api/lead" && request.method === "POST") {
      try {
        const body = await request.json();
        const result = await storeLead(env, body);
        if (result.error) {
          const status = result.error.includes("required") ? 400 : 500;
          return json(result, status);
        }
        return json(result);
      } catch (err) {
        return json({ error: "lead failed" }, 500);
      }
    }

    // Read back stored leads. Protected by the LEADS_KEY secret: GET /api/leads?key=...
    if (url.pathname === "/api/leads" && request.method === "GET") {
      if (!env.LEADS_KEY || url.searchParams.get("key") !== env.LEADS_KEY) {
        return json({ error: "unauthorized" }, 401);
      }
      if (!env.LEADS) {
        return json({ error: "leads store not configured" }, 500);
      }
      const list = await env.LEADS.list({ prefix: "lead:", limit: 200 });
      const leads = [];
      for (const k of list.keys) {
        const v = await env.LEADS.get(k.name);
        if (v) {
          try {
            leads.push(JSON.parse(v));
          } catch (_) {
            /* skip bad records */
          }
        }
      }
      leads.sort((a, b) => (a.at < b.at ? 1 : -1));
      return json({ count: leads.length, leads });
    }

    // --- Scheduling: phone consult calendar ---
    if (url.pathname === "/api/schedule/meta" && request.method === "GET") {
      return json(SCHEDULE_META);
    }

    if (url.pathname === "/api/schedule/days" && request.method === "GET") {
      try {
        const days = url.searchParams.get("days") || "21";
        const summary = await availabilitySummary(env, days);
        return json(summary);
      } catch (err) {
        return json({ error: "availability failed" }, 500);
      }
    }

    if (url.pathname === "/api/schedule/slots" && request.method === "GET") {
      try {
        const date = url.searchParams.get("date") || "";
        if (!date) return json({ error: "date required (YYYY-MM-DD)" }, 400);
        const result = await availableSlots(env, date);
        if (result.error) return json(result, 400);
        return json(result);
      } catch (err) {
        return json({ error: "slots failed" }, 500);
      }
    }

    if (url.pathname === "/api/schedule/book" && request.method === "POST") {
      try {
        const body = await request.json();
        const result = await bookSlot(env, body);
        if (result.error) return json(result, result.status || 400);
        return json(result);
      } catch (err) {
        return json({ error: "booking failed" }, 500);
      }
    }

    if (url.pathname === "/api/schedule/bookings" && request.method === "GET") {
      if (!env.LEADS_KEY || url.searchParams.get("key") !== env.LEADS_KEY) {
        return json({ error: "unauthorized" }, 401);
      }
      try {
        return json(await listBookings(env));
      } catch (err) {
        return json({ error: "list failed" }, 500);
      }
    }

    return new Response(
      "felder-chat: /api/chat · /api/lead · /api/schedule/days · /api/schedule/slots · /api/schedule/book · /api/health",
      { headers: CORS }
    );
  },
};
