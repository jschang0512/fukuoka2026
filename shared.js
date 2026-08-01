/* ============================================================
   shared.js — common behavior used by both index.html and
   kyushu_itinerary.html. Keep this file in the same folder as
   both HTML files.
   ============================================================ */

// Header subtitle typewriter: types the destination list, pauses,
// deletes it, types the date range, pauses, deletes, and loops.
// Looks for an element with id="subtitleType" — if the page
// doesn't have one, this quietly does nothing.
// Pacing: most characters type at a steady clip with tiny random
// jitter (feels more like a real typist); separators ("・" and
// "～") get a longer pause before the next character, the way a
// person briefly pauses between items in a spoken list.
(function typewriterSubtitle(){
  const el = document.getElementById("subtitleType");
  if(!el) return;
  const dests = ["福岡","北九州","相島","太宰府","唐津","佐賀","武雄"].join(" ・ ");
  const dateRange = "2026年08月18日～2026年08月25日";
  const phrases = [dests, dateRange];
  const PAUSE_CHARS = ["・", "～"];
  let phraseIndex = 0, charIndex = 0, deleting = false;

  function jitter(base){ return base + Math.round((Math.random() - 0.5) * 20); }

  function tick(){
    const current = phrases[phraseIndex];
    let delay = jitter(65);
    if(!deleting){
      charIndex++;
      el.textContent = current.slice(0, charIndex);
      const justTyped = current[charIndex - 1];
      if(PAUSE_CHARS.includes(justTyped)) delay = 320; // brief pause after a separator
      if(charIndex === current.length){
        deleting = true;
        delay = 1500;
      }
    } else {
      charIndex--;
      el.textContent = current.slice(0, charIndex);
      delay = jitter(32);
      if(charIndex === 0){
        deleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        delay = 400;
      }
    }
    setTimeout(tick, delay);
  }
  tick();
})();

// Trip countdown: counts down to departure (IT246, 2026-08-18 06:55 Taipei time).
// Looks for an element with id="countdown" — if the page doesn't have one,
// this quietly does nothing. Builds a flip-card layout once, then each
// second only the digits that actually changed play a 3D flip animation
// (the swap to the new number happens at the animation's midpoint, timed
// by JS via setTimeout — a classic flip-clock technique).
(function tripCountdown(){
  const el = document.getElementById("countdown");
  if(!el) return;
  const target = new Date("2026-08-18T06:55:00+08:00").getTime();
  let timer;
  const prev = { d:null, h:null, m:null, s:null };

  function pad(n){ return String(n).padStart(2,"0"); }

  function unitHTML(id, label){
    return '<div class="cd-unit"><span class="cd-num"><span class="cd-num-inner" id="' + id + '">--</span></span>' +
           '<span class="cd-label">' + label + '</span></div>';
  }

  el.innerHTML = unitHTML("cdD","天") + '<div class="cd-sep">:</div>' +
                 unitHTML("cdH","時") + '<div class="cd-sep">:</div>' +
                 unitHTML("cdM","分") + '<div class="cd-sep">:</div>' +
                 unitHTML("cdS","秒");

  function flipTo(id, val, prevVal){
    const inner = document.getElementById(id);
    if(!inner) return;
    if(prevVal !== null && val === prevVal) return; // unchanged — no flip needed
    inner.classList.remove("flip");
    void inner.offsetWidth; // force reflow so the animation can restart every time
    inner.classList.add("flip");
    setTimeout(()=>{ inner.textContent = val; }, 250); // swap at the flip's midpoint
  }

  function update(){
    const now = Date.now();
    let diff = target - now;
    if(diff <= 0){
      el.innerHTML = '<div class="cd-done">🎉 旅程開始了，出發！</div>';
      clearInterval(timer);
      return;
    }
    const d = String(Math.floor(diff/86400000));
    diff -= Math.floor(diff/86400000)*86400000;
    const h = pad(Math.floor(diff/3600000));
    diff -= Math.floor(diff/3600000)*3600000;
    const m = pad(Math.floor(diff/60000));
    diff -= Math.floor(diff/60000)*60000;
    const s = pad(Math.floor(diff/1000));

    flipTo("cdD", d, prev.d);
    flipTo("cdH", h, prev.h);
    flipTo("cdM", m, prev.m);
    flipTo("cdS", s, prev.s);
    prev.d = d; prev.h = h; prev.m = m; prev.s = s;
  }
  update();
  timer = setInterval(update, 1000);
})();

// Header parallax: the hero header's background layer drifts slightly
// slower than the page as you scroll, giving it a subtle sense of depth.
// Looks for an element with id="heroBg" — if the page doesn't have one,
// this quietly does nothing. Throttled to one update per animation frame.
(function heroParallax(){
  const bg = document.getElementById("heroBg");
  const hero = document.getElementById("heroHeader");
  if(!bg || !hero) return;
  let ticking = false;
  function apply(){
    const rect = hero.getBoundingClientRect();
    if(rect.bottom > 0){
      const offset = Math.max(0, -rect.top) * 0.35;
      bg.style.transform = "translateY(" + offset + "px)";
    }
    ticking = false;
  }
  window.addEventListener("scroll", ()=>{
    if(!ticking){
      requestAnimationFrame(apply);
      ticking = true;
    }
  }, { passive:true });
  apply();
})();

// Shared helper: flies the camera through a sequence of waypoints, one
// hop at a time — short hops between close-together stops zoom in so
// they're easy to see, longer hops zoom back out — then at the end eases
// out to show the whole route. This only moves the camera; draw all your
// markers and the full route line up front as usual, before calling this.
//
// Uses Leaflet's own map.flyTo() for the camera (smooth, throttled tile
// loads — much cheaper than driving it by hand frame-by-frame). If the
// user drags, scroll-zooms, or touches the map at any point, the tour
// stops immediately and hands control back to them.
//
// waypoints: [[lat,lng], [lat,lng], ...] — visited in order
// opts.baseZoom  — the "whole route fits" zoom level (e.g. from map.getZoom() after fitBounds)
// opts.maxZoom   — how far in to zoom for very short hops (default 17)
// opts.bounds    — LatLngBounds-ish array to fly back out to when finished
// opts.onAllComplete(zoom) — called after the final zoom-out finishes
//
// Call after positioning the map at waypoints[0], at opts.baseZoom.
window.animateCameraTour = function(map, waypoints, opts){
  opts = opts || {};
  const segDuration = opts.segDuration || 700;
  const gapDelay = opts.gapDelay || 50;
  const baseZoom = (typeof opts.baseZoom === "number") ? opts.baseZoom : map.getZoom();
  const maxZoom = opts.maxZoom || 17;
  let i = 0;
  let cancelled = false;
  let pending = null;

  function cancel(){
    if(cancelled) return;
    cancelled = true;
    if(pending) clearTimeout(pending);
    map.stop(); // halts any in-flight flyTo/flyToBounds
  }
  // only genuine user gestures pause the tour — flyTo itself never fires
  // these events, so there's no risk of the tour cancelling itself
  ["dragstart","wheel","touchstart"].forEach(evt => map.on(evt, cancel));
  const zoomBtns = map.getContainer().querySelectorAll(".leaflet-control-zoom-in, .leaflet-control-zoom-out");
  zoomBtns.forEach(btn => btn.addEventListener("click", cancel));

  function distanceKm(a, b){
    const R = 6371;
    const dLat = (b[0]-a[0]) * Math.PI/180;
    const dLng = (b[1]-a[1]) * Math.PI/180;
    const lat1 = a[0]*Math.PI/180, lat2 = b[0]*Math.PI/180;
    const x = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)*Math.sin(dLng/2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  // short hops get a closer zoom so they're actually visible; never zoom
  // out further than the overview level though
  function zoomForDistance(km){
    let z;
    if(km < 0.6) z = maxZoom;
    else if(km < 1.5) z = maxZoom - 1;
    else if(km < 4)   z = maxZoom - 3;
    else if(km < 10)  z = maxZoom - 5;
    else z = baseZoom;
    return Math.max(baseZoom, Math.min(maxZoom, z));
  }

  function flyNext(){
    if(cancelled) return;
    if(i >= waypoints.length - 1){
      finish();
      return;
    }
    const a = waypoints[i], b = waypoints[i+1];
    const targetZoom = zoomForDistance(distanceKm(a, b));
    map.flyTo(b, targetZoom, { duration: segDuration/1000, easeLinearity: 0.3 });
    pending = setTimeout(()=>{
      if(cancelled) return;
      i++;
      pending = setTimeout(flyNext, gapDelay);
    }, segDuration);
  }

  function finish(){
    if(cancelled) return;
    if(opts.bounds && opts.bounds.length){
      pending = setTimeout(()=>{
        if(cancelled) return;
        map.flyToBounds(opts.bounds, { padding: opts.padding || [24,24], duration: 0.9 });
        if(typeof opts.onAllComplete === "function"){
          pending = setTimeout(()=>{ if(!cancelled) opts.onAllComplete(map.getZoom()); }, 950);
        }
      }, gapDelay);
    } else if(typeof opts.onAllComplete === "function"){
      pending = setTimeout(()=>{ if(!cancelled) opts.onAllComplete(map.getZoom()); }, gapDelay);
    }
  }

  flyNext();
};
