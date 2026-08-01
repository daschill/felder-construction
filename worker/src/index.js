// Felder Construction — AI chat + scheduling + admin + notifications

import {
  availableSlots,
  availabilitySummary,
  bookSlot,
  listBookings,
  listBlocks,
  setBlock,
  clearBlock,
  cancelBooking,
  SCHEDULE_META,
} from "./schedule.js";
import { notify } from "./notify.js";

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
- Phone call scheduling: visitors can book a free 30-minute phone consult on the website (section #schedule). Hours for calls: Mon–Thu 8am–7pm, Fri 8am–5:30pm, Sat 9am–4:30pm Eastern, closed Sunday. Tell them to use the online calendar — open /#schedule or the Book a call tab.
- Project galleries: kitchen, bathroom, and deck case studies on the site. Local pages for Asheville, Fletcher, and Hendersonville.

RULES
- Be warm, plain-spoken, and concise: 1-3 short sentences per reply. Plain text only, no markdown or bullet lists unless the visitor asks for a list.
- Never quote prices or guess what a project might cost. Pricing depends on scope and estimates are always free — say that instead.
- For urgent problems (active leak, storm damage), tell them to call (828) 333-3369 right away.
- Only discuss Felder Construction, its services, and home remodeling in general. Politely decline anything unrelated.
- If they want to schedule a call, point them to the website calendar (#schedule) rather than inventing available times yourself. After collecting a lead, you may invite them to book a call at #schedule.
- LEAD QUALIFICATION: when a visitor mentions a project they want done, gather details ONE question at a time, in this order: (1) what type of project, (2) what town they are in, (3) when they want it done, (4) their name, (5) their phone number or email. Weave the questions in naturally, one per reply, never all at once.
- When you have ALL of: name, contact (phone or email), project type, location, and timeline — output one line in EXACTLY this format, followed by one friendly closing sentence telling them Michael will be in touch and they can also book a call at the Schedule section:
LEAD_READY name=<name> | contact=<phone or email> | project=<type> | location=<town> | timeline=<timeline> | notes=<one-line summary of the project>
- If the visitor only has questions, answer them without pushing the lead flow.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

function clean(v, max) {
  return String(v || "").slice(0, max).trim();
}

function authOk(env, request, url) {
  const key = env.LEADS_KEY;
  if (!key) return false;
  const q = url.searchParams.get("key");
  if (q && q === key) return true;
  const h = request.headers.get("Authorization") || "";
  if (h === "Bearer " + key) return true;
  return false;
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
  // Notify Michael (non-blocking for response path — still awaited so it runs)
  try {
    await notify(env, { ...lead, kind: "lead" });
  } catch (_) {}
  return { ok: true, key };
}

async function trackHit(env, request, url) {
  if (!env.LEADS) return;
  const path = clean(url.searchParams.get("p") || url.searchParams.get("path") || "/", 200);
  const ref = clean(url.searchParams.get("r") || request.headers.get("Referer") || "", 300);
  const day = new Date().toISOString().slice(0, 10);
  const key = `hit:${day}:${Math.random().toString(36).slice(2, 8)}`;
  await env.LEADS.put(
    key,
    JSON.stringify({
      path,
      ref,
      ua: clean(request.headers.get("User-Agent"), 200),
      at: new Date().toISOString(),
    }),
    { expirationTtl: 60 * 60 * 24 * 60 }
  );
  // daily counter
  const ckey = `hits:${day}`;
  const cur = parseInt((await env.LEADS.get(ckey)) || "0", 10) || 0;
  await env.LEADS.put(ckey, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 90 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "felder-chat" });
    }

    // Lightweight pageview beacon
    if (url.pathname === "/api/hit" && (request.method === "GET" || request.method === "POST")) {
      try {
        await trackHit(env, request, url);
      } catch (_) {}
      return new Response(null, { status: 204, headers: CORS });
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
          } catch (_) {}
        }

        return json({ reply });
      } catch (err) {
        return json({ error: "chat failed" }, 500);
      }
    }

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

    if (url.pathname === "/api/leads" && request.method === "GET") {
      if (!authOk(env, request, url)) return json({ error: "unauthorized" }, 401);
      if (!env.LEADS) return json({ error: "leads store not configured" }, 500);
      const list = await env.LEADS.list({ prefix: "lead:", limit: 200 });
      const leads = [];
      for (const k of list.keys) {
        const v = await env.LEADS.get(k.name);
        if (v) {
          try {
            leads.push({ id: k.name, ...JSON.parse(v) });
          } catch (_) {}
        }
      }
      leads.sort((a, b) => (a.at < b.at ? 1 : -1));
      return json({ count: leads.length, leads });
    }

    // --- Scheduling ---
    if (url.pathname === "/api/schedule/meta" && request.method === "GET") {
      return json(SCHEDULE_META);
    }

    if (url.pathname === "/api/schedule/days" && request.method === "GET") {
      try {
        return json(await availabilitySummary(env, url.searchParams.get("days") || "21"));
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
        if (result.ok && result.booking) {
          try {
            await notify(env, {
              kind: "booking",
              source: "phone-schedule",
              name: result.booking.name,
              contact: [result.booking.phone, result.booking.email].filter(Boolean).join(" / "),
              phone: result.booking.phone,
              email: result.booking.email,
              project: body.project || "Phone consultation",
              notes: body.notes || "",
              timeline: `${result.booking.date} ${result.booking.time} ET`,
              slotLabel: `${result.booking.date} ${result.booking.time} ET`,
              page: "/#schedule",
            });
          } catch (_) {}
        }
        return json(result);
      } catch (err) {
        return json({ error: "booking failed" }, 500);
      }
    }

    if (url.pathname === "/api/schedule/bookings" && request.method === "GET") {
      if (!authOk(env, request, url)) return json({ error: "unauthorized" }, 401);
      try {
        return json(await listBookings(env));
      } catch (err) {
        return json({ error: "list failed" }, 500);
      }
    }

    if (url.pathname === "/api/schedule/cancel" && request.method === "POST") {
      if (!authOk(env, request, url)) return json({ error: "unauthorized" }, 401);
      try {
        const body = await request.json();
        return json(await cancelBooking(env, body.slotId));
      } catch (err) {
        return json({ error: "cancel failed" }, 500);
      }
    }

    if (url.pathname === "/api/schedule/blocks" && request.method === "GET") {
      if (!authOk(env, request, url)) return json({ error: "unauthorized" }, 401);
      return json(await listBlocks(env));
    }

    if (url.pathname === "/api/schedule/block" && request.method === "POST") {
      if (!authOk(env, request, url)) return json({ error: "unauthorized" }, 401);
      try {
        const body = await request.json();
        const result = await setBlock(env, body.date, body.reason);
        if (result.error) return json(result, result.status || 400);
        return json(result);
      } catch (err) {
        return json({ error: "block failed" }, 500);
      }
    }

    if (url.pathname === "/api/schedule/block" && request.method === "DELETE") {
      if (!authOk(env, request, url)) return json({ error: "unauthorized" }, 401);
      try {
        const date = url.searchParams.get("date") || "";
        return json(await clearBlock(env, date));
      } catch (err) {
        return json({ error: "unblock failed" }, 500);
      }
    }

    // Admin dashboard summary
    if (url.pathname === "/api/admin/summary" && request.method === "GET") {
      if (!authOk(env, request, url)) return json({ error: "unauthorized" }, 401);
      try {
        const [bookings, blocks] = await Promise.all([listBookings(env), listBlocks(env)]);
        const leadList = await env.LEADS.list({ prefix: "lead:", limit: 200 });
        const leads = [];
        for (const k of leadList.keys) {
          const v = await env.LEADS.get(k.name);
          if (v) {
            try {
              leads.push({ id: k.name, ...JSON.parse(v) });
            } catch (_) {}
          }
        }
        leads.sort((a, b) => (a.at < b.at ? 1 : -1));
        const today = new Date().toISOString().slice(0, 10);
        const hitsToday = parseInt((await env.LEADS.get("hits:" + today)) || "0", 10) || 0;
        const upcoming = bookings.bookings.filter((b) => b.startIso && b.startIso >= new Date().toISOString());
        return json({
          hitsToday,
          leadCount: leads.length,
          bookingCount: bookings.count,
          upcomingCount: upcoming.length,
          leads: leads.slice(0, 50),
          upcoming: upcoming.slice(0, 30),
          blocks: blocks.blocks,
        });
      } catch (err) {
        return json({ error: "summary failed" }, 500);
      }
    }

    return new Response(
      "felder-chat: chat · lead · schedule · admin · hit · health",
      { headers: CORS }
    );
  },
};
