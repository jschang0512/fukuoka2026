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

// JPY→TWD exchange rate badge, always visible (no tap needed). Frankfurter
// (ECB data) doesn't carry TWD at all, so this tries ExchangeRate-API's
// open-access endpoint first (free, keyless, no signup), then two more
// free fallbacks if that's unreachable.
(function tripForex(){
  const el = document.getElementById("forexBadge");
  if(!el) return;
  el.innerHTML = '<span class="spinner"></span>讀取中…';

  // three independent free, keyless providers, tried in order — different
  // response shapes, so each has its own parser
  const sources = [
    { url:"https://open.er-api.com/v6/latest/JPY",
      parse:(data)=> data && data.rates && data.rates.TWD },
    { url:"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/jpy.json",
      parse:(data)=> data && data.jpy && data.jpy.twd },
    { url:"https://latest.currency-api.pages.dev/v1/currencies/jpy.json",
      parse:(data)=> data && data.jpy && data.jpy.twd }
  ];

  function fetchWithTimeout(url, ms){
    const controller = new AbortController();
    const timer = setTimeout(()=> controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(()=> clearTimeout(timer));
  }

  function tryFetch(i){
    if(i >= sources.length){
      el.innerHTML = '匯率讀取失敗';
      return;
    }
    fetchWithTimeout(sources[i].url, 6000)
      .then(r=>{ if(!r.ok) throw new Error("bad response"); return r.json(); })
      .then(data=>{
        const rate = sources[i].parse(data);
        if(!rate) throw new Error("no rate");
        const twd1 = rate.toFixed(3);
        el.innerHTML = '<span class="cd-forex-jpy">¥1</span><span class="cd-forex-eq">=</span><span class="cd-forex-twd">NT$' + twd1 + '</span>';
      })
      .catch(()=> tryFetch(i+1));
  }
  tryFetch(0);
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

// Light/dark theme toggle. Remembers the choice (localStorage) and falls
// back to the visitor's OS preference the first time. Adds a small
// floating button (top-right) to switch — no HTML markup needed on
// either page, this creates it itself.
(function themeToggle(){
  const KEY = "kyushu-theme";

  function getPreferred(){
    try{
      const saved = localStorage.getItem(KEY);
      if(saved === "dark" || saved === "light") return saved;
    }catch(e){}
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }

  let current = getPreferred();
  document.documentElement.setAttribute("data-theme", current);

  function init(){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "切換深色／淺色模式");
    btn.textContent = current === "dark" ? "☀️" : "🌙";
    btn.addEventListener("click", ()=>{
      current = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", current);
      btn.textContent = current === "dark" ? "☀️" : "🌙";
      try{ localStorage.setItem(KEY, current); }catch(e){}
    });
    document.body.appendChild(btn);
  }
  if(document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();

