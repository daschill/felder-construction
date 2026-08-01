// Lightweight pageview beacon (no cookies)
(function () {
  try {
    var API = "https://felder-chat.michaelschillereff.workers.dev/api/hit";
    var path = location.pathname + location.search + location.hash;
    var ref = document.referrer || "";
    var url = API + "?p=" + encodeURIComponent(path) + "&r=" + encodeURIComponent(ref.slice(0, 300));
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
    } else {
      fetch(url, { method: "GET", keepalive: true, mode: "no-cors" }).catch(function () {});
    }
  } catch (e) {}
})();
