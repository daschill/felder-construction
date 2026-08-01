// Felder Construction — phone call scheduler
(function () {
  "use strict";

  var API = "https://felder-chat.michaelschillereff.workers.dev";
  var selectedSlot = null;
  var selectedDate = null;

  var daysEl = document.getElementById("scheduleDays");
  var slotsEl = document.getElementById("scheduleSlots");
  var stepTimes = document.getElementById("scheduleStepTimes");
  var form = document.getElementById("scheduleForm");
  var success = document.getElementById("scheduleSuccess");
  var dayLabel = document.getElementById("scheduleDayLabel");
  var selectedEl = document.getElementById("scheduleSelected");
  var note = document.getElementById("scheduleNote");
  var submitBtn = document.getElementById("scheduleSubmit");

  if (!daysEl) return;

  // --- Tabs: estimate vs schedule ---
  var tabEstimate = document.getElementById("tabEstimate");
  var tabSchedule = document.getElementById("tabSchedule");
  var panelEstimate = document.getElementById("panelEstimate");
  var panelSchedule = document.getElementById("panelSchedule");

  function showTab(which) {
    var isSchedule = which === "schedule";
    if (tabEstimate) {
      tabEstimate.classList.toggle("active", !isSchedule);
      tabEstimate.setAttribute("aria-selected", String(!isSchedule));
    }
    if (tabSchedule) {
      tabSchedule.classList.toggle("active", isSchedule);
      tabSchedule.setAttribute("aria-selected", String(isSchedule));
    }
    if (panelEstimate) panelEstimate.hidden = isSchedule;
    if (panelSchedule) panelSchedule.hidden = !isSchedule;
    if (isSchedule) loadDays();
  }

  if (tabEstimate) tabEstimate.addEventListener("click", function () { showTab("estimate"); });
  if (tabSchedule) tabSchedule.addEventListener("click", function () { showTab("schedule"); });

  // Deep link #schedule or #book
  function checkHash() {
    var h = (location.hash || "").toLowerCase();
    if (h === "#schedule" || h === "#book" || h === "#book-a-call") {
      showTab("schedule");
      var el = document.getElementById("contact") || document.getElementById("schedule");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  window.addEventListener("hashchange", checkHash);
  checkHash();

  function weekdayName(n) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n] || "";
  }

  function formatDateShort(dateStr) {
    var p = dateStr.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatDateLong(dateStr) {
    var p = dateStr.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }

  function loadDays() {
    daysEl.innerHTML = '<p class="schedule-loading">Loading open days&hellip;</p>';
    stepTimes.hidden = true;
    form.hidden = true;
    selectedSlot = null;
    selectedDate = null;

    fetch(API + "/api/schedule/days?days=21")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        daysEl.innerHTML = "";
        if (!data.days || !data.days.length) {
          daysEl.innerHTML = '<p class="schedule-empty">No days available right now. Call <a href="tel:+18283333369">(828) 333-3369</a>.</p>';
          return;
        }
        data.days.forEach(function (day) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "schedule-day";
          btn.setAttribute("role", "option");
          btn.dataset.date = day.date;

          if (day.closed || day.openCount === 0) {
            btn.classList.add("is-closed");
            btn.disabled = true;
            btn.innerHTML =
              '<span class="sd-wd">' + weekdayName(day.weekday) + "</span>" +
              '<span class="sd-dt">' + formatDateShort(day.date) + "</span>" +
              '<span class="sd-meta">' + (day.closed ? "Closed" : "Full") + "</span>";
          } else {
            btn.innerHTML =
              '<span class="sd-wd">' + weekdayName(day.weekday) + "</span>" +
              '<span class="sd-dt">' + formatDateShort(day.date) + "</span>" +
              '<span class="sd-meta">' + day.openCount + " open</span>";
            btn.addEventListener("click", function () { selectDay(day.date); });
          }
          daysEl.appendChild(btn);
        });
      })
      .catch(function () {
        daysEl.innerHTML = '<p class="schedule-empty">Couldn&rsquo;t load the calendar. Call <a href="tel:+18283333369">(828) 333-3369</a>.</p>';
      });
  }

  function selectDay(dateStr) {
    selectedDate = dateStr;
    selectedSlot = null;
    form.hidden = true;

    Array.prototype.forEach.call(daysEl.querySelectorAll(".schedule-day"), function (b) {
      b.classList.toggle("is-selected", b.dataset.date === dateStr);
    });

    dayLabel.textContent = "— " + formatDateLong(dateStr);
    stepTimes.hidden = false;
    slotsEl.innerHTML = '<p class="schedule-loading">Loading times&hellip;</p>';

    fetch(API + "/api/schedule/slots?date=" + encodeURIComponent(dateStr))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        slotsEl.innerHTML = "";
        if (!data.slots || !data.slots.length) {
          slotsEl.innerHTML = '<p class="schedule-empty">No open times that day. Pick another day.</p>';
          return;
        }
        data.slots.forEach(function (slot) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "schedule-slot";
          btn.setAttribute("role", "option");
          btn.textContent = slot.label;
          btn.dataset.slotId = slot.id;
          btn.addEventListener("click", function () { selectSlot(slot); });
          slotsEl.appendChild(btn);
        });
      })
      .catch(function () {
        slotsEl.innerHTML = '<p class="schedule-empty">Couldn&rsquo;t load times. Try again or call us.</p>';
      });
  }

  function selectSlot(slot) {
    selectedSlot = slot;
    Array.prototype.forEach.call(slotsEl.querySelectorAll(".schedule-slot"), function (b) {
      b.classList.toggle("is-selected", b.dataset.slotId === slot.id);
    });
    form.hidden = false;
    selectedEl.textContent = formatDateLong(slot.date) + " at " + slot.label + " Eastern";
    note.className = "form-note";
    note.textContent = "";
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    note.className = "form-note";

    if (!selectedSlot) {
      note.textContent = "Pick a day and time first.";
      note.classList.add("err");
      return;
    }

    var name = (document.getElementById("s-name").value || "").trim();
    var phone = (document.getElementById("s-phone").value || "").trim();
    var email = (document.getElementById("s-email").value || "").trim();
    var project = document.getElementById("s-project").value || "";
    var notes = (document.getElementById("s-notes").value || "").trim();

    if (!name || !phone) {
      note.textContent = "Please enter your name and phone number.";
      note.classList.add("err");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Booking…";

    fetch(API + "/api/schedule/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: selectedSlot.id,
        name: name,
        phone: phone,
        email: email,
        project: project,
        notes: notes
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.j.ok) {
          throw new Error((res.j && res.j.error) || "Booking failed");
        }
        document.querySelector(".schedule-widget h3").hidden = true;
        document.querySelector(".schedule-intro").hidden = true;
        document.getElementById("scheduleHours").hidden = true;
        daysEl.parentElement.hidden = true;
        stepTimes.hidden = true;
        form.hidden = true;
        success.hidden = false;
        document.getElementById("scheduleSuccessMsg").textContent =
          "You're set for " + formatDateLong(res.j.booking.date) + " at " + res.j.booking.time +
          " Eastern. We'll call " + (phone || "you") + ".";
      })
      .catch(function (err) {
        note.textContent = err.message || "Something went wrong. Call (828) 333-3369.";
        note.classList.add("err");
        // Refresh times — slot may have been taken
        if (selectedDate) selectDay(selectedDate);
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirm call";
      });
  });

  var again = document.getElementById("scheduleAgain");
  if (again) {
    again.addEventListener("click", function () {
      success.hidden = true;
      document.querySelector(".schedule-widget h3").hidden = false;
      document.querySelector(".schedule-intro").hidden = false;
      document.getElementById("scheduleHours").hidden = false;
      daysEl.parentElement.hidden = false;
      form.reset();
      loadDays();
    });
  }

  // Prefetch days when page loads if already on schedule tab
  if (panelSchedule && !panelSchedule.hidden) loadDays();
})();
