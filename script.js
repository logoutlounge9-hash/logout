/* ============================================================
   0. FILL THIS IN
   GUILD_ID — Server Settings > Widget > Enable, then copy Server ID
   ============================================================ */
const CONFIG = {
  GUILD_ID: "000000000000000000"
};

/* ============================================================
   0b. INTAKE — batches of 20, waitlist for everyone after
   open ......... flip to false when a batch fills up
   invite ....... a Discord invite set to expire after CAP uses
   formAction ... your Google Form's URL, ending /formResponse
   fields ....... the entry.NNN ids from that form (see notes)
   ============================================================ */
const INTAKE = {
  open:  true,
  cap:   20,
  turnstileSiteKey: "YOUR_TURNSTILE_SITE_KEY",   // Cloudflare > Turnstile
  nextBatch: "Sunday",

  // The /exec URL from deploying waitlist.gs as a Web App.
  endpoint: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
};

/* ============================================================
   1. THE ROUTINE — the only schedule you maintain.
   Mon to Sun. Change it when the club's habits change, not
   every week. The week grid rebuilds itself from it.
   ============================================================ */
const WEEK = [
  { day:"Mon", slots:[] },

  { day:"Tue", slots:[
    { t:"20:00", mins:120, game:"Valorant",      type:"Scrim",  note:"Five-stack, comms on" },
    { t:"22:00", mins:90,  game:"Open lobby",    type:"Casual", note:"Whoever's still awake" }
  ]},

  { day:"Wed", slots:[
    { t:"21:00", mins:120, game:"Counter-Strike 2", type:"Ranked", note:"Premier queue, one map" }
  ]},

  { day:"Thu", slots:[
    { t:"20:00", mins:120, game:"Valorant",      type:"Ranked", note:"Split by rank into two lobbies" },
    { t:"22:30", mins:90,  game:"Rocket League", type:"Ranked", note:"2v2, rotating pairs" }
  ]},

  { day:"Fri", slots:[
    { t:"21:00", mins:150, game:"Apex Legends",  type:"Trios",  note:"Squads reshuffle every three games" },
    { t:"23:30", mins:90,  game:"Late lobby",    type:"Casual", note:"No plan, no comms required" }
  ]},

  { day:"Sat", slots:[
    { t:"18:00", mins:180, game:"Club tournament", type:"Event", note:"Brackets go up Thursday" },
    { t:"21:00", mins:120, game:"Party games",     type:"Party", note:"Among Us, Jackbox, whatever" }
  ]},

  { day:"Sun", slots:[
    { t:"16:00", mins:120, game:"Chess",     type:"Arena",  note:"5+3 blitz, join at any point" },
    { t:"20:00", mins:120, game:"Minecraft", type:"Casual", note:"Build night on the club server" }
  ]}
];

/* ============================================================
   2. EXCEPTIONS — the only thing you touch by hand, and only
   when a day differs from the routine. Key is YYYY-MM-DD.
   Past entries are ignored; delete them whenever you like.
   ============================================================ */
const OVERRIDES = {
  // "2026-08-29": { reason:"Off for the long weekend", slots:[] },
  // "2026-09-05": { slots:[{ t:"19:00", mins:240, game:"Charity marathon", type:"Event", note:"Stream starts at seven" }] }
};

/* ---- Schedule resolution: routine, unless an exception says otherwise ---- */
const dayIdx = d => (d.getDay() + 6) % 7;                 // Mon = 0
const isoDate = d => d.getFullYear() + "-" +
  String(d.getMonth()+1).padStart(2,"0") + "-" +
  String(d.getDate()).padStart(2,"0");

function scheduleFor(date){
  const ex = OVERRIDES[isoDate(date)];
  return {
    slots:  ex ? (ex.slots || []) : WEEK[dayIdx(date)].slots,
    reason: ex ? ex.reason : null
  };
}


const GAMES = [
  { name:"Valorant",         cat:"comp",   mode:"5v5 tactical",  text:"Two lobbies split by rank. Tuesday scrims, Thursday ranked push." },
  { name:"Counter-Strike 2", cat:"comp",   mode:"5v5 tactical",  text:"Wednesday only. Premier queue, one map, VOD review after if people want." },
  { name:"Rocket League",    cat:"comp",   mode:"2v2 / 3v3",     text:"The most forgiving competitive night — nobody minds carrying a new player." },
  { name:"Apex Legends",     cat:"comp",   mode:"Battle royale", text:"Friday trios. We rotate squads every three games so it doesn't clique up." },
  { name:"Minecraft",        cat:"casual", mode:"Club server",   text:"Always up. Survival world, whitelist only, no resets since 2023." },
  { name:"Chess",            cat:"casual", mode:"Blitz ladder",  text:"Sunday afternoons, 5+3 arena. Runs long, join at any point." },
  { name:"Among Us",         cat:"party",  mode:"Up to 15",      text:"Saturday chaos slot. Zero skill required, maximum shouting." },
  { name:"Jackbox",          cat:"party",  mode:"Up to 8",       text:"Whoever's hosting streams it. Ends when the jokes stop landing." }
];

const LADDER = [
  { who:"Aarav",   tag:"@bunnyhop99",  main:"Valorant",      streak:"7 nights", pts:148 },
  { who:"Meera",   tag:"@mrcl",        main:"Rocket League", streak:"5 nights", pts:131 },
  { who:"Tenzin",  tag:"@tz_",         main:"CS2",           streak:"4 nights", pts:119 },
  { who:"Priya",   tag:"@pri.exe",     main:"Apex Legends",  streak:"9 nights", pts:112 },
  { who:"Dev",     tag:"@devnull",     main:"Minecraft",     streak:"2 nights", pts:97  },
  { who:"Sana",    tag:"@sanachu",     main:"Chess",         streak:"3 nights", pts:88  }
];

/* ============================================================
   3. CLOCK — the live line above the headline
   ============================================================ */
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function tick(){
  const now = new Date();
  document.getElementById("clock").textContent =
    DAYS[now.getDay()].slice(0,3).toUpperCase() + " \u00b7 " +
    String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
}
tick(); setInterval(tick, 1000);

/* ============================================================
   4. DISCORD WIDGET — real online count, no backend
   Public, unauthenticated, CORS-friendly. Needs the widget
   switched on in Server Settings > Widget, or this 403s.
   ============================================================ */
const onlineEl = document.getElementById("online");
const vcEl     = document.getElementById("voice");

async function pullDiscord(){
  try {
    const r = await fetch(`https://discord.com/api/guilds/${CONFIG.GUILD_ID}/widget.json`);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();

    onlineEl.textContent = d.presence_count;

    // Voice channels with someone actually in them
    const busy = (d.channels || [])
      .map(c => ({ name:c.name, n:(d.members||[]).filter(m => m.channel_id === c.id).length }))
      .filter(c => c.n > 0);

    vcEl.textContent = busy.length
      ? " · " + busy.map(c => `${c.n} in ${c.name}`).join(", ")
      : "";
  } catch {
    // Widget off or Discord unreachable — say nothing rather than lie.
    onlineEl.closest(".clock").style.display = "none";
  }
}
pullDiscord(); setInterval(pullDiscord, 60000);

/* ============================================================
   4b. GAMES + FILTER
   ============================================================ */
document.getElementById("games-grid").innerHTML = GAMES.map(g => `
  <article class="game" data-cat="${g.cat}">
    <p class="meta">${g.mode}</p>
    <h3>${g.name}</h3>
    <p>${g.text}</p>
  </article>`).join("");

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === chip));
    const f = chip.dataset.filter;
    document.querySelectorAll(".game").forEach(card => {
      card.hidden = f !== "all" && card.dataset.cat !== f;
    });
  });
});

/* ============================================================
   5. WEEK GRID — this calendar week, exceptions included
   ============================================================ */
const monday = new Date();
monday.setHours(0,0,0,0);
monday.setDate(monday.getDate() - dayIdx(monday));
const todayKey = isoDate(new Date());

document.getElementById("week-grid").innerHTML = WEEK.map((d,i) => {
  const date = new Date(monday);
  date.setDate(monday.getDate() + i);
  const { slots, reason } = scheduleFor(date);
  const isToday = isoDate(date) === todayKey;

  return `
    <div class="day${isToday ? " today" : ""}">
      <div class="day-h">${d.day} ${date.getDate()}${isToday ? " · today" : ""}</div>
      ${slots.length
        ? slots.map(s => `<div class="slot"><b>${s.t}</b><span>${s.game}</span></div>`).join("")
        : `<div class="rest">${reason || "Rest night"}</div>`}
    </div>`;
}).join("");

/* ============================================================
   6. LADDER
   ============================================================ */
document.getElementById("ladder-body").innerHTML = LADDER.map((m,i) => `
  <tr>
    <td class="num">${String(i+1).padStart(2,"0")}</td>
    <td class="who">${m.who}<small>${m.tag}</small></td>
    <td>${m.main}</td>
    <td class="streak-col"><span class="streak">${m.streak}</span></td>
    <td class="pts">${m.pts}</td>
  </tr>`).join("");

/* ============================================================
   7. INTAKE STATE — routes the buttons, rewrites the copy
   ============================================================ */
const ctaNav  = document.getElementById("cta-nav");
const ctaHero = document.getElementById("cta-hero");
const ctaNote = document.getElementById("cta-note");

function applyIntake(){
  if (INTAKE.open){
    [ctaNav, ctaHero].forEach(a => {
      a.href = "#";
      a.removeAttribute("target");
      a.removeAttribute("rel");
      a.textContent = "Join the club";
      a.addEventListener("click", e => { e.preventDefault(); openGate(); });
    });
    ctaNote.innerHTML =
      `We let ${INTAKE.cap} people in at a time. ` +
      `<a href="#join">Invite full? Join the waitlist.</a>`;

    document.getElementById("join-title").innerHTML = "Takes about<br>forty seconds";
    document.getElementById("join-lede").textContent =
      `The invite above is capped at ${INTAKE.cap} so nobody walks into chaos. ` +
      `If it's already used up, leave your details here and you'll be first into the next batch.`;
    document.getElementById("join-submit").textContent = "Join the waitlist";

  } else {
    [ctaNav, ctaHero].forEach(a => {
      a.href = "#join";
      a.removeAttribute("target");
      a.removeAttribute("rel");
      a.textContent = "Join the waitlist";
    });
    ctaNote.textContent = `This batch is full. Next one opens ${INTAKE.nextBatch}.`;

    document.getElementById("join-title").innerHTML = "The batch<br>is full";
    document.getElementById("join-lede").textContent =
      `All ${INTAKE.cap} spots are taken. Leave your details and you'll get the invite ` +
      `when the next batch opens ${INTAKE.nextBatch.toLowerCase()}.`;
    document.getElementById("join-submit").textContent = "Join the waitlist";
  }
}
applyIntake();

/* ============================================================
   7. JOIN FORM
   Front-end only. To actually receive these, point it at a form
   service (Formspree, Getform) or your own endpoint — see notes.
   ============================================================ */
const form = document.getElementById("join-form");
form.addEventListener("submit", e => {
  e.preventDefault();
  let ok = true;

  [["name","f-name"],["discord","f-discord"]].forEach(([id, wrap]) => {
    const bad = !document.getElementById(id).value.trim();
    document.getElementById(wrap).classList.toggle("bad", bad);
    if (bad) ok = false;
  });
  if (!ok){ form.querySelector(".bad input").focus(); return; }

  const data = {
    name:    document.getElementById("name").value.trim(),
    discord: document.getElementById("discord").value.trim(),
    main:    document.getElementById("main").value,
    nights:  [...document.querySelectorAll("input[name=nights]:checked")].map(n => n.value)
  };
  /* text/plain keeps this a "simple" request, so the browser skips the CORS
     preflight that Apps Script can't answer. The reply carries their queue
     position, which we drop into the confirmation once it lands. */
  fetch(INTAKE.endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(data),
    redirect: "follow"
  })
    .then(r => r.json())
    .then(res => {
      if (!res || !res.ok || !res.position) return;
      document.getElementById("ok-position").textContent = res.duplicate
        ? ` You were already on it, at number ${res.position}.`
        : ` You're number ${res.position} in the queue.`;
    })
    .catch(err => console.error("Waitlist POST failed:", err));

  form.classList.add("sent");
  document.getElementById("join-ok").classList.add("show");
});


/* ============================================================
   8. VERIFICATION GATE
   The invite never appears in this file or in the HTML. The page
   asks Cloudflare for a token, the Apps Script asks Cloudflare
   whether that token is real, and only then does it reply with
   the link. A scraper reading the source finds nothing.
   ============================================================ */
const gate       = document.getElementById("gate");
const gateStatus = document.getElementById("gate-status");
const gateGo     = document.getElementById("gate-go");
let   widgetId   = null;
let   tsReady    = false;

window.onTurnstileReady = () => { tsReady = true; if (!gate.hidden) mountWidget(); };

function mountWidget(){
  if (!tsReady || widgetId !== null) return;
  widgetId = turnstile.render("#gate-widget", {
    sitekey: INTAKE.turnstileSiteKey,
    theme: "dark",
    callback: fetchInvite,
    "error-callback":   () => setStatus("That check didn't go through. Try again.", true),
    "expired-callback": () => { turnstile.reset(widgetId); setStatus("Check expired — here's a fresh one."); }
  });
}

function openGate(){
  gate.hidden = false;
  gateGo.hidden = true;
  setStatus("Waiting for the check\u2026");
  if (widgetId !== null) turnstile.reset(widgetId); else mountWidget();
  document.getElementById("gate-close").focus();
}

function closeGate(){
  gate.hidden = true;
}

function setStatus(msg, bad){
  gateStatus.textContent = msg;
  gateStatus.classList.toggle("bad", !!bad);
}

async function fetchInvite(token){
  setStatus("Checking\u2026");
  try {
    const r = await fetch(INTAKE.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "invite", token }),
      redirect: "follow"
    });
    const res = await r.json();

    if (res && res.ok && res.invite){
      gateGo.href = res.invite;
      gateGo.hidden = false;
      setStatus("You're through. See you in there.");
      /* Deliberately not auto-opening: a window.open after an await has lost
         the user's click, so browsers block it. The button keeps the gesture. */
    } else {
      setStatus((res && res.error) || "Couldn't verify that. Try again.", true);
      turnstile.reset(widgetId);
    }
  } catch (err){
    setStatus("Couldn't reach the server. Check your connection and retry.", true);
    turnstile.reset(widgetId);
  }
}

document.getElementById("gate-close").addEventListener("click", closeGate);
gate.addEventListener("click", e => { if (e.target === gate) closeGate(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !gate.hidden) closeGate(); });
