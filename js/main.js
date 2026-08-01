// Felder Construction — main.js
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

  // --- Estimate form -> mailto ---
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

// --- FAQ chatbot (fully client-side, no backend) ---
(function () {
  "use strict";

  var launcher = document.getElementById("chatLauncher");
  var panel = document.getElementById("chatPanel");
  var closeBtn = document.getElementById("chatClose");
  var messages = document.getElementById("chatMessages");
  var chips = document.getElementById("chatChips");
  var form = document.getElementById("chatForm");
  var input = document.getElementById("chatText");

  var CONTACT =
    'You can reach Michael directly at <a href="tel:+18283333369">(828) 333-3369</a> or ' +
    '<a href="mailto:michael@felderconstruction.net">michael@felderconstruction.net</a>.';

  var KB = [
    {
      keys: ["service", "remodel", "kitchen", "bath", "deck", "floor", "tile", "what do you do", "offer"],
      answer:
        "We handle kitchen remodels, bathroom remodels, decks and repairs, and flooring " +
        "(hardwood, tile, LVP, laminate, carpet tile) — residential and commercial. " +
        "One team covers every trade: tile, plumbing, framing, sheetrock, and electrical."
    },
    {
      keys: ["estimate", "quote", "price", "cost", "pricing", "how much", "free"],
      answer:
        'Estimates are free. The quickest way to get one is to call ' +
        '<a href="tel:+18283333369">(828) 333-3369</a> or send the ' +
        '<a href="#contact">estimate request form</a> — you\'ll hear back directly from Michael, usually the same day.'
    },
    {
      keys: ["hour", "open", "close", "when", "schedule", "available", "availability", "book"],
      answer:
        "We're available Mon–Thu 7:30a–7:30p, Fri 7:30a–6p, and Sat 9a–5p (closed Sundays). " +
        "For current project availability, call <a href=\"tel:+18283333369\">(828) 333-3369</a>."
    },
    {
      keys: ["where", "area", "location", "serve", "city", "arden", "asheville", "hendersonville", "wnc", "address"],
      answer:
        "We're based at 15 Morgan Blvd in Arden, NC, and serve Asheville, Hendersonville, " +
        "and the greater Western North Carolina area."
    },
    {
      keys: ["review", "rating", "bbb", "reference", "testimonial", "reputation"],
      answer:
        'We hold a 5.0-star average across 15 verified reviews and an A+ BBB rating. ' +
        'You can read client reviews <a href="#reviews">here on the site</a>.'
    },
    {
      keys: ["who", "owner", "michael", "about", "company", "insured", "licensed", "experience", "team"],
      answer:
        "Felder Construction is owner-operated and has been remodeling WNC homes since 2015. " +
        "Michael Felder is on every job, working alongside a small crew of specialists " +
        "(tile, paint/sheetrock, decks and framing)."
    },
    {
      keys: ["contact", "phone", "email", "call", "talk", "human", "person", "reach"],
      answer: CONTACT
    },
    {
      keys: ["hi", "hello", "hey", "good morning", "good afternoon"],
      answer: "Hello! How can I help — services, estimates, hours, or our service area?"
    },
    {
      keys: ["thank", "thanks"],
      answer: "You're welcome! Anything else I can help with?"
    }
  ];

  var CHIPS = ["Our services", "Get an estimate", "Hours", "Service area", "Reviews", "Contact"];

  var greeted = false;

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

  function botReply(text) {
    var typing = addMsg('<span class="chat-msg typing" style="padding:0;border:0;background:none"><i></i><i></i><i></i></span>', "bot typing");
    setTimeout(function () {
      typing.remove();
      var q = text.toLowerCase();
      var hit = null;
      for (var i = 0; i < KB.length; i++) {
        for (var j = 0; j < KB[i].keys.length; j++) {
          if (q.indexOf(KB[i].keys[j]) !== -1) { hit = KB[i]; break; }
        }
        if (hit) break;
      }
      addMsg(hit ? hit.answer : "I don't have an answer for that one, but Michael does — " + CONTACT, "bot");
    }, 550);
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
    botReply(text);
  }

  function openChat() {
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    if (!greeted) {
      greeted = true;
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
