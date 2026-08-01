// Felder Construction — main.js

var CHAT_API = "https://felder-chat.michaelschillereff.workers.dev/api/chat";
var LEAD_API = "https://felder-chat.michaelschillereff.workers.dev/api/lead";

// Fire-and-forget lead capture — never blocks the visitor
function postLead(payload) {
  try {
    payload.page = location.pathname;
    fetch(LEAD_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function () { /* silent — mailto path still works */ });
  } catch (e) { /* silent */ }
}

// --- Site behaviors (header, nav, gallery filter, reveal, estimate form, year) ---
(function () {
  "use strict";

  // --- Sticky header shadow ---
  var header = document.querySelector(".site-header");
  function onScroll() {
    header.classList.toggle("scrolled", window.scrollY > 10);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // --- Mobile nav ---
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("mainNav");
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  nav.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("click", function (e) {
    if (nav.classList.contains("open") && !nav.contains(e.target) && !toggle.contains(e.target)) {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  // --- Gallery filter ---
  var filterBtns = document.querySelectorAll(".filter-btn");
  var items = document.querySelectorAll(".gallery-item");
  filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      var cat = btn.getAttribute("data-filter");
      items.forEach(function (item) {
        var show = cat === "all" || item.getAttribute("data-cat") === cat;
        item.classList.toggle("hidden", !show);
      });
    });
  });

  // --- Scroll reveal ---
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  }

  // --- Estimate form -> lead log + mailto ---
  var form = document.getElementById("estimateForm");
  var note = document.getElementById("formNote");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    note.className = "form-note";

    var name = form.name.value.trim();
    var phone = form.phone.value.trim();
    var email = form.email.value.trim();
    var type = form.type.value;
    var message = form.message.value.trim();

    if (!name || !email || !message) {
      note.textContent = "Please fill in your name, email, and a few words about the project.";
      note.classList.add("err");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      note.textContent = "That email address doesn't look right — mind checking it?";
      note.classList.add("err");
      return;
    }

    // Save the lead even if the visitor never sends the email
    postLead({
      source: "estimate-form",
      name: name,
      contact: email + (phone ? " / " + phone : ""),
      project: type,
      notes: message
    });

    var subject = "Estimate request — " + type + " (" + name + ")";
    var body =
      "Name: " + name + "\n" +
      "Phone: " + (phone || "—") + "\n" +
      "Email: " + email + "\n" +
      "Project type: " + type + "\n\n" +
      message;

    window.location.href =
      "mailto:michael@felderconstruction.net" +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);

    note.textContent = "Opening your email app — if nothing happens, email michael@felderconstruction.net or call (828) 333-3369.";
    note.classList.add("ok");
  });

  // --- Footer year ---
  document.getElementById("year").textContent = String(new Date().getFullYear());
})();

// --- AI chatbot (Workers AI backend, rule-based fallback) ---
(function () {
  "use strict";

  var launcher = document.getElementById("chatLauncher");
  var panel = document.getElementById("chatPanel");
  var closeBtn = document.getElementById("chatClose");
  var messages = document.getElementById("chatMessages");
  var chips = document.getElementById("chatChips");
  var form = document.getElementById("chatForm");
  var input = document.getElementById("chatText");

  var history = []; // { role: "user"|"assistant", content: string }
  var greeted = false;

  // Rule-based fallback, used only if the AI endpoint is unreachable
  var FALLBACK_CONTACT =
    'You can reach Michael directly at <a href="tel:+18283333369">(828) 333-3369</a> or ' +
    '<a href="mailto:michael@felderconstruction.net">michael@felderconstruction.net</a>.';
  var FALLBACK_KB = [
    {
      keys: ["service", "remodel", "kitchen", "bath", "deck", "floor", "tile", "what do you do", "offer"],
      answer: "We handle kitchen remodels, bathroom remodels, decks and repairs, and flooring — residential and commercial. One team covers every trade: tile, plumbing, framing, sheetrock, and electrical."
    },
    {
      keys: ["estimate", "quote", "price", "cost", "pricing", "how much", "free"],
      answer: 'Estimates are free. Call <a href="tel:+18283333369">(828) 333-3369</a> or send the <a href="#contact">estimate request form</a> — you\'ll hear back directly from Michael, usually the same day.'
    },
    {
      keys: ["hour", "open", "close", "when", "schedule", "available", "book"],
      answer: "We're available Mon–Thu 7:30a–7:30p, Fri 7:30a–6p, and Sat 9a–5p (closed Sundays). For scheduling, call <a href=\"tel:+18283333369\">(828) 333-3369</a>."
    },
    {
      keys: ["where", "area", "location", "serve", "city", "arden", "asheville", "hendersonville", "wnc", "address"],
      answer: "We're based at 15 Morgan Blvd in Arden, NC, and serve Asheville, Fletcher, Mills River, Hendersonville, and greater Western North Carolina."
    },
    {
      keys: ["review", "rating", "bbb", "reference", "testimonial", "reputation"],
      answer: 'We hold a 5.0-star average across 15 verified reviews and an A+ BBB rating. Read client reviews <a href="#reviews">here</a>.'
    },
    {
      keys: ["who", "owner", "michael", "about", "company", "insured", "licensed", "experience", "team"],
      answer: "Felder Construction is owner-operated and has been remodeling WNC homes since 2015. Michael Felder is on every job, alongside a small crew of specialists."
    },
    {
      keys: ["hi", "hello", "hey", "thank"],
      answer: "Hello! Ask me anything about our services, estimates, hours, or service area."
    }
  ];

  var CHIPS = ["Our services", "Get an estimate", "Hours", "Service area", "Reviews", "Contact"];

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function addMsg(html, who) {
    var div = document.createElement("div");
    div.className = "chat-msg " + who;
    div.innerHTML = html;
    messages.appendChild(div);
    scrollToBottom();
    return div;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showTyping() {
    var div = document.createElement("div");
    div.className = "chat-msg bot typing";
    div.innerHTML = "<i></i><i></i><i></i>";
    messages.appendChild(div);
    scrollToBottom();
    return div;
  }

  function fallbackAnswer(text) {
    var q = text.toLowerCase();
    for (var i = 0; i < FALLBACK_KB.length; i++) {
      for (var j = 0; j < FALLBACK_KB[i].keys.length; j++) {
        if (q.indexOf(FALLBACK_KB[i].keys[j]) !== -1) return FALLBACK_KB[i].answer;
      }
    }
    return "I'm offline at the moment, but Michael can help — " + FALLBACK_CONTACT;
  }

  // Parse "LEAD_READY name=.. | contact=.. | project=.. | location=.. | timeline=.. | notes=.."
  function parseLead(text) {
    var m = text.match(/LEAD_READY\s+(.+?)(?:\n|$)/);
    if (!m) return null;
    var lead = {};
    m[1].split("|").forEach(function (pair) {
      var idx = pair.indexOf("=");
      if (idx > -1) lead[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    });
    var visible = text.replace(/LEAD_READY\s+.+?(\n|$)/, "").trim();
    return { lead: lead, visible: visible };
  }

  function renderLeadCard(lead) {
    // Save the lead immediately — even if the visitor never taps "Send to Michael"
    postLead({
      source: "chat",
      name: lead.name || "",
      contact: lead.contact || "",
      project: lead.project || "",
      location: lead.location || "",
      timeline: lead.timeline || "",
      notes: lead.notes || ""
    });

    var subject = "Website chat lead — " + (lead.project || "project") + " (" + (lead.name || "") + ")";
    var body =
      "Name: " + (lead.name || "") + "\n" +
      "Contact: " + (lead.contact || "") + "\n" +
      "Project: " + (lead.project || "") + "\n" +
      "Location: " + (lead.location || "") + "\n" +
      "Timeline: " + (lead.timeline || "") + "\n" +
      "Details: " + (lead.notes || "") + "\n\n" +
      "(Collected by the website chat assistant)";
    var href = "mailto:michael@felderconstruction.net?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    var card = document.createElement("div");
    card.className = "chat-msg bot chat-lead";
    card.innerHTML =
      "<strong>Project summary</strong>" +
      "<span>" + escapeHtml(lead.project || "") + " — " + escapeHtml(lead.location || "") + "</span>" +
      '<a class="chat-lead-btn" href="' + href + '">Send to Michael</a>';
    messages.appendChild(card);
    scrollToBottom();
  }

  function botReply(text) {
    var typing = showTyping();

    fetch(CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        typing.remove();
        var reply = (data && data.reply) ? String(data.reply) : "";
        if (!reply) throw new Error("empty reply");

        var parsed = parseLead(reply);
        var visible = parsed ? parsed.visible : reply;
        if (visible) {
          addMsg(escapeHtml(visible).replace(/\n/g, "<br>"), "bot");
        }
        history.push({ role: "assistant", content: reply });
        if (parsed) renderLeadCard(parsed.lead);
      })
      .catch(function () {
        typing.remove();
        addMsg(fallbackAnswer(text), "bot");
      });
  }

  function renderChips() {
    chips.innerHTML = "";
    CHIPS.forEach(function (label) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chat-chip";
      b.textContent = label;
      b.addEventListener("click", function () { send(label); });
      chips.appendChild(b);
    });
  }

  function send(text) {
    addMsg(escapeHtml(text), "user");
    history.push({ role: "user", content: text });
    botReply(text);
  }

  function openChat() {
    hideNudge();
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    if (!greeted) {
      greeted = true;
      history.push({
        role: "user",
        content: "Hi — a visitor just opened the chat. Greet them briefly as the Felder Construction assistant and ask how you can help."
      });
      botReply("hi");
      renderChips();
    }
    setTimeout(function () { input.focus(); }, 50);
  }

  function closeChat() {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }

  launcher.addEventListener("click", function () {
    if (panel.hidden) openChat(); else closeChat();
  });
  closeBtn.addEventListener("click", closeChat);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) closeChat();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    send(text);
  });

  // Let in-chat anchor links (#contact, #reviews) close the panel before jumping
  messages.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (a && a.getAttribute("href") && a.getAttribute("href").charAt(0) === "#") closeChat();
  });

  // --- Engagement nudge: one subtle prompt if the visitor hasn't opened chat ---
  var nudgeEl = null;
  function hideNudge() {
    launcher.classList.remove("pulse");
    if (nudgeEl) { nudgeEl.remove(); nudgeEl = null; }
  }
  function showNudge() {
    if (!panel.hidden || nudgeEl) return;
    try {
      if (sessionStorage.getItem("fc-nudged")) return;
      sessionStorage.setItem("fc-nudged", "1");
    } catch (e) { /* private mode */ }
    launcher.classList.add("pulse");
    nudgeEl = document.createElement("button");
    nudgeEl.type = "button";
    nudgeEl.className = "chat-nudge";
    nudgeEl.innerHTML = "<strong>Questions about your project?</strong><br>Ask me — I answer instantly.";
    nudgeEl.addEventListener("click", openChat);
    document.getElementById("chatWidget").appendChild(nudgeEl);
    setTimeout(hideNudge, 14000);
  }
  setTimeout(showNudge, 15000);

  // Open via URL hash (e.g. #chat) — also handy for support links
  if (window.location.hash === "#chat") openChat();
})();

// --- FAQ accordion ---
(function () {
  "use strict";
  var questions = document.querySelectorAll(".faq-q");
  questions.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var isOpen = btn.getAttribute("aria-expanded") === "true";
      questions.forEach(function (other) {
        other.setAttribute("aria-expanded", "false");
        other.nextElementSibling.hidden = true;
      });
      if (!isOpen) {
        btn.setAttribute("aria-expanded", "true");
        btn.nextElementSibling.hidden = false;
      }
    });
  });
})();
