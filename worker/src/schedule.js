// Phone-call scheduling helpers (America/New_York / Eastern)

const TZ = "America/New_York";
const SLOT_MINUTES = 30;
const MIN_NOTICE_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_DAYS_AHEAD = 30;

/** Business windows in minutes from midnight, by JS weekday (0=Sun) */
const HOURS = {
  0: null, // Sunday closed
  1: { start: 8 * 60, end: 19 * 60 }, // Mon 8a–7p call windows
  2: { start: 8 * 60, end: 19 * 60 },
  3: { start: 8 * 60, end: 19 * 60 },
  4: { start: 8 * 60, end: 19 * 60 },
  5: { start: 8 * 60, end: 17 * 60 + 30 }, // Fri until 5:30p
  6: { start: 9 * 60, end: 16 * 60 + 30 }, // Sat 9a–4:30p
};

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Parts for a Date in America/New_York */
export function easternParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  // weekday: Mon, Tue, ...
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: wdMap[parts.weekday],
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Approximate UTC Date for a wall-clock Eastern date/time (handles EST/EDT via iterative fix) */
export function easternToUtc(dateStr, hour, minute) {
  // Start with a guess: treat as UTC then adjust using formatter offset
  let guess = new Date(`${dateStr}T${pad(hour)}:${pad(minute)}:00.000Z`);
  for (let i = 0; i < 3; i++) {
    const p = easternParts(guess);
    const wantMin = hour * 60 + minute;
    const gotMin = p.hour * 60 + p.minute;
    // Also check date alignment
    const wantDay = dateStr;
    const gotDay = p.dateStr;
    let deltaMin = wantMin - gotMin;
    if (gotDay < wantDay) deltaMin += 24 * 60;
    if (gotDay > wantDay) deltaMin -= 24 * 60;
    if (deltaMin === 0) break;
    guess = new Date(guess.getTime() + deltaMin * 60 * 1000);
  }
  return guess;
}

function formatLabel(hour, minute) {
  const h12 = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12}:${pad(minute)} ${ampm}`;
}

/** Generate all theoretical slots for a YYYY-MM-DD in Eastern */
export function slotsForDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Find weekday: use noon UTC approx then easternParts
  const probe = easternToUtc(dateStr, 12, 0);
  const wd = easternParts(probe).weekday;
  const win = HOURS[wd];
  if (!win) return { closed: true, slots: [], weekday: wd };

  const slots = [];
  for (let t = win.start; t + SLOT_MINUTES <= win.end; t += SLOT_MINUTES) {
    const hour = Math.floor(t / 60);
    const minute = t % 60;
    const startUtc = easternToUtc(dateStr, hour, minute);
    slots.push({
      id: `${dateStr}T${pad(hour)}${pad(minute)}`,
      date: dateStr,
      time: `${pad(hour)}:${pad(minute)}`,
      label: formatLabel(hour, minute),
      startIso: startUtc.toISOString(),
      endIso: new Date(startUtc.getTime() + SLOT_MINUTES * 60 * 1000).toISOString(),
    });
  }
  return { closed: false, slots, weekday: wd };
}

/** Filter to open (future + not booked) slots */
export async function availableSlots(env, dateStr, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: "invalid date" };
  }
  const todayE = easternParts(now).dateStr;
  if (dateStr < todayE) {
    return { date: dateStr, timezone: TZ, closed: false, slots: [] };
  }
  // Cap range
  const maxDate = new Date(now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const maxStr = easternParts(maxDate).dateStr;
  if (dateStr > maxStr) {
    return { date: dateStr, timezone: TZ, closed: false, slots: [], message: "too far ahead" };
  }

  const { closed, slots } = slotsForDate(dateStr);
  if (closed) {
    return { date: dateStr, timezone: TZ, closed: true, slots: [], message: "Closed Sundays" };
  }

  const booked = await listBookedIdsForDate(env, dateStr);
  const minTime = now.getTime() + MIN_NOTICE_MS;
  const open = slots.filter((s) => {
    if (booked.has(s.id)) return false;
    if (new Date(s.startIso).getTime() < minTime) return false;
    return true;
  });

  return {
    date: dateStr,
    timezone: TZ,
    closed: false,
    slotMinutes: SLOT_MINUTES,
    slots: open,
  };
}

/** Next N days summary (for calendar UI) */
export async function availabilitySummary(env, days = 14, now = new Date()) {
  const n = Math.min(Math.max(Number(days) || 14, 1), MAX_DAYS_AHEAD);
  const start = easternParts(now);
  const out = [];
  // Iterate calendar days in Eastern
  let cursor = easternToUtc(start.dateStr, 12, 0);
  for (let i = 0; i < n; i++) {
    const p = easternParts(cursor);
    const dateStr = p.dateStr;
    const avail = await availableSlots(env, dateStr, now);
    out.push({
      date: dateStr,
      weekday: p.weekday,
      closed: !!avail.closed,
      openCount: (avail.slots || []).length,
      firstSlot: avail.slots && avail.slots[0] ? avail.slots[0].label : null,
    });
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return { timezone: TZ, days: out, slotMinutes: SLOT_MINUTES, minNoticeHours: 2 };
}

/** Day index (JSON array of slotIds) — more reliable than KV list() which can lag */
async function listBookedIdsForDate(env, dateStr) {
  const set = new Set();
  if (!env.LEADS) return set;
  try {
    const idx = await env.LEADS.get(`bookday:${dateStr}`, { type: "json" });
    if (Array.isArray(idx)) {
      for (const id of idx) set.add(id);
    }
  } catch (_) {
    /* ignore corrupt index */
  }
  return set;
}

async function addToDayIndex(env, dateStr, slotId) {
  const key = `bookday:${dateStr}`;
  let idx = [];
  try {
    const cur = await env.LEADS.get(key, { type: "json" });
    if (Array.isArray(cur)) idx = cur;
  } catch (_) {}
  if (!idx.includes(slotId)) idx.push(slotId);
  await env.LEADS.put(key, JSON.stringify(idx), { expirationTtl: 60 * 60 * 24 * 120 });
}

export async function bookSlot(env, body) {
  const clean = (v, max) => String(v || "").slice(0, max).trim();
  const slotId = clean(body.slotId, 32);
  const name = clean(body.name, 100);
  const phone = clean(body.phone, 40);
  const email = clean(body.email, 120);
  const notes = clean(body.notes, 500);
  const project = clean(body.project, 120);

  if (!slotId || !/^\d{4}-\d{2}-\d{2}T\d{4}$/.test(slotId)) {
    return { error: "valid slotId required", status: 400 };
  }
  if (!name || (!phone && !email)) {
    return { error: "name and phone or email required", status: 400 };
  }

  const [dateStr, hm] = slotId.split("T");
  const hour = Number(hm.slice(0, 2));
  const minute = Number(hm.slice(2, 4));
  const { closed, slots } = slotsForDate(dateStr);
  if (closed) return { error: "that day is closed", status: 400 };

  const slot = slots.find((s) => s.id === slotId);
  if (!slot) return { error: "invalid time slot", status: 400 };

  const now = new Date();
  if (new Date(slot.startIso).getTime() < now.getTime() + MIN_NOTICE_MS) {
    return { error: "that time is no longer available — pick a later slot", status: 409 };
  }

  if (!env.LEADS) return { error: "booking store not configured", status: 500 };

  const key = `book:${slotId}`;
  const existing = await env.LEADS.get(key);
  if (existing) return { error: "that slot was just taken — pick another", status: 409 };

  const booking = {
    slotId,
    date: dateStr,
    time: slot.time,
    label: slot.label,
    startIso: slot.startIso,
    endIso: slot.endIso,
    timezone: TZ,
    name,
    phone,
    email,
    project,
    notes,
    source: "phone-schedule",
    at: now.toISOString(),
  };

  // Store booking + day index (TTL 120 days)
  await env.LEADS.put(key, JSON.stringify(booking), { expirationTtl: 60 * 60 * 24 * 120 });
  await addToDayIndex(env, dateStr, slotId);
  const verify = await env.LEADS.get(key);
  if (!verify) {
    return { error: "could not save booking — try again", status: 500 };
  }

  // Also log as lead for the existing leads pipeline
  const leadKey = "lead:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
  await env.LEADS.put(
    leadKey,
    JSON.stringify({
      source: "phone-schedule",
      name,
      contact: [phone, email].filter(Boolean).join(" / "),
      project: project || "Phone consultation",
      location: "",
      timeline: `${dateStr} ${slot.label} ET`,
      notes: `BOOKED CALL ${dateStr} ${slot.label} ET. ${notes}`.trim(),
      page: "/#schedule",
      at: now.toISOString(),
      bookingSlotId: slotId,
    })
  );

  return {
    ok: true,
    booking: {
      slotId,
      date: dateStr,
      time: slot.label,
      timezone: "Eastern Time",
      name,
      phone,
      email,
    },
  };
}

export async function listBookings(env) {
  if (!env.LEADS) return { count: 0, bookings: [] };
  const list = await env.LEADS.list({ prefix: "book:", limit: 200 });
  const bookings = [];
  for (const k of list.keys) {
    const v = await env.LEADS.get(k.name);
    if (v) {
      try {
        bookings.push(JSON.parse(v));
      } catch (_) {}
    }
  }
  bookings.sort((a, b) => (a.startIso < b.startIso ? -1 : 1));
  return { count: bookings.length, bookings };
}

export const SCHEDULE_META = {
  timezone: TZ,
  slotMinutes: SLOT_MINUTES,
  minNoticeHours: MIN_NOTICE_MS / (60 * 60 * 1000),
  maxDaysAhead: MAX_DAYS_AHEAD,
  hoursNote:
    "Mon–Thu 8:00a–7:00p, Fri 8:00a–5:30p, Sat 9:00a–4:30p Eastern (closed Sunday). 30-minute phone calls.",
};
