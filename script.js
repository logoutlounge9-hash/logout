const INTAKE = {
  endpoint:         "https://script.google.com/macros/s/AKfycbwdlbX5vo8vT4L8mD8dWHsjjvsyfSCHyDzWhkG8axMZmbe6l9AGKMIph7uGw2VD93g4/exec",
  turnstileSiteKey: "0x4AAAAAAEpgX4OwTHNen-tN"
};

const gate = document.getElementById("gate");
const wait = document.getElementById("wait");

let seatsLeft = null;      // null until the server tells us
let cap = 20, waiting = 0, members = null, board = null;
let boardTitle = null, boardCaption = null;
let tsReady = false;
let gateWidget = null, waitWidget = null;

/* ---- what the server says ------------------------------------ */

async function refreshSeats(){
  try {
    const r = await fetch(INTAKE.endpoint, { redirect: "follow" });
    const d = await r.json();
    if (!d || !d.ok) return;
    seatsLeft = d.seatsLeft;
    cap = d.cap ?? cap;
    waiting = d.waiting ?? 0;
    members = d.members ?? null;   // null when the bot isn't set up yet
    board   = d.board ?? null;
    boardTitle   = d.boardTitle ?? null;
    boardCaption = d.boardCaption ?? null;
    paint();
  } catch {
    // Unreachable: leave the buttons alone rather than lying about seats.
  }
}

function paint(){
  if (seatsLeft === null) return;
  const full = seatsLeft <= 0;

  document.querySelectorAll("[data-discord]").forEach(el => {
    el.textContent = full ? "Join the waitlist" : "Open Discord";
  });

  document.getElementById("gate-seats").textContent =
    full ? "No seats left" : `${seatsLeft} of ${cap} seats left`;

  document.getElementById("wait-kicker").textContent =
    waiting ? `${waiting} on the waitlist` : "The waitlist";

  // Live from Discord via the bot. Left at the written-in number if the
  // bot isn't answering — a stale count beats a blank or a zero.
  const mc = document.getElementById("member-count");
  if (mc && members) mc.textContent = members.toLocaleString();

  setNum("stat-waitlist", waiting);

  // Tonight's tables repeats the same three figures, so it reads from the
  // same variables — the two panels can never disagree.
  setNum("stat-seats", seatsLeft);
  setNum("stat-waitlist-2", waiting);
  if (members) setNum("stat-members-2", members);

  paintBoard();
}

/* Sheet data is typed by hand, so it goes in as text, never as HTML. */
function setText(id, value){
  const el = document.getElementById(id);
  if (el && value !== null && value !== undefined && value !== "") el.textContent = value;
}
function setNum(id, n){
  if (typeof n === "number") setText(id, n.toLocaleString());
}

const BOARD_ROWS = 5;   // the section always holds five, filled or not

function paintBoard(){
  if (!board || !board.length) return;   // nothing yet: leave the written-in rows

  const first = document.getElementById("board-first");
  if (!first) return;
  const wrap = first.parentNode;

  // Pad to a fixed five so the section keeps its shape on a small club.
  const rows = board.slice(0, BOARD_ROWS);
  while (rows.length < BOARD_ROWS) rows.push(null);

  wrap.textContent = "";
  rows.forEach((r, i) => {
    const row = document.createElement("div");
    // Last row carries the borderless variant, matching the static markup.
    row.className = (i === rows.length - 1) ? "board-div-3" : "board-div-2";
    if (!r) row.classList.add("board-empty");

    [["board-span-2", String(i + 1).padStart(2, "0")],
     ["board-span-3", r ? r.handle : "\u2014"],
     ["board-span-4", r ? r.note   : "unclaimed"],
     ["board-span-5", r ? String(r.nights) : "\u2014"]].forEach(([cls, text]) => {
      const sp = document.createElement("span");
      sp.className = cls;
      sp.textContent = text;      // textContent, so a handle can never inject markup
      row.appendChild(sp);
    });
    wrap.appendChild(row);
  });

  // The headline stat is row one of the same board, so the two cannot disagree.
  setNum("stat-nights", board[0].nights);
  setText("stat-top", board[0].handle);
}

/* ---- dialogs -------------------------------------------------- */

function open_(el){
  el.hidden = false;
  el.querySelector("[data-close]").focus();
}
function close_(el){ el.hidden = true; }

function status(id, msg, bad){
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.toggle("bad", !!bad);
}

document.querySelectorAll("[data-close]").forEach(b =>
  b.addEventListener("click", () => close_(b.closest(".ll-modal"))));

document.querySelectorAll(".ll-modal").forEach(m =>
  m.addEventListener("click", e => { if (e.target === m) close_(m); }));

addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  [gate, wait].forEach(m => { if (!m.hidden) close_(m); });
});

/* ---- Turnstile ------------------------------------------------ */

window.onTurnstileReady = () => {
  tsReady = true;
  if (!gate.hidden) mountGate();
  if (!wait.hidden) mountWait();
};

/** Plain-English version of Cloudflare's error codes. */
function explainTs(code){
  const c = String(code || "");
  if (c.indexOf("110200") === 0) return "This hostname is not on the widget's allowed list.";
  if (c.indexOf("400020") === 0) return "The site key does not match this widget.";
  if (c.indexOf("1020")   === 0) return "Cloudflare blocked the request.";
  if (c.indexOf("300")    === 0 || c.indexOf("600") === 0)
                                 return "The challenge could not load — network or blocker.";
  return "Look this code up in Cloudflare's Turnstile docs.";
}

function mountGate(){
  if (!tsReady || gateWidget !== null) return;
  if (!INTAKE.turnstileSiteKey || INTAKE.turnstileSiteKey.indexOf("YOUR_") === 0){
    status("gate-status", "No Turnstile site key set in script.js.", true);
    return;
  }
  gateWidget = turnstile.render("#gate-widget", {
    sitekey: INTAKE.turnstileSiteKey,
    theme: "dark",
    action: "invite",
    callback: claimSeat,
    "error-callback": code => {
      // Cloudflare hands us a code. Showing it turns a vague failure into
      // a diagnosis: 110200 = hostname not on the widget's list,
      // 400020 = wrong sitekey, 300xxx = network or blocked script.
      console.error("Turnstile error", code);
      status("gate-status", "Check failed — Cloudflare code " + code + ". " + explainTs(code), true);
    },
    "expired-callback": () => { turnstile.reset(gateWidget); status("gate-status", "Check expired — here is a fresh one."); }
  });
}

function mountWait(){
  if (!tsReady || waitWidget !== null) return;
  waitWidget = turnstile.render("#wait-widget", {
    sitekey: INTAKE.turnstileSiteKey,
    theme: "dark",
    action: "waitlist",
    "error-callback": code => {
      console.error("Turnstile error", code);
      status("wait-status", "Check failed — Cloudflare code " + code + ". " + explainTs(code), true);
    }
  });
}

/* ---- opening Discord ------------------------------------------ */

document.querySelectorAll("[data-discord]").forEach(el => {
  el.addEventListener("click", e => {
    e.preventDefault();
    if (seatsLeft !== null && seatsLeft <= 0){ openWaitlist(); return; }
    document.getElementById("gate-go").hidden = true;
    status("gate-status", "Waiting for the check\u2026");
    open_(gate);
    if (gateWidget !== null) turnstile.reset(gateWidget); else mountGate();
  });
});

async function claimSeat(token){
  status("gate-status", "Checking\u2026");
  try {
    const r = await fetch(INTAKE.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "invite", token }),
      redirect: "follow"
    });
    const d = await r.json();

    if (d && d.ok && d.full){
      seatsLeft = 0; paint();
      close_(gate);
      openWaitlist();
      status("wait-status", "The last seat went while you were on the page. You are first in line for the next batch.");
      return;
    }

    if (d && d.ok && d.invite){
      seatsLeft = d.seatsLeft; paint();
      const go = document.getElementById("gate-go");
      go.href = d.invite;
      go.hidden = false;
      status("gate-status", `Seat ${d.seat} of ${cap} is yours. ${d.seatsLeft} left after you.`);
      /* Not auto-opening: a window.open after an await has lost the click,
         so browsers block it. The button keeps the gesture. */
      return;
    }

    status("gate-status", (d && d.error) || "Could not verify that. Try again.", true);
    turnstile.reset(gateWidget);

  } catch {
    status("gate-status", "Could not reach the server. Check your connection and retry.", true);
    turnstile.reset(gateWidget);
  }
}

/* ---- the waitlist --------------------------------------------- */

let waitOpenedAt = 0;

function openWaitlist(){
  waitOpenedAt = Date.now();
  const form = document.getElementById("wait-form");
  form.classList.remove("sent");
  status("wait-status", "");
  open_(wait);
  if (waitWidget !== null) turnstile.reset(waitWidget); else mountWait();
}

document.querySelectorAll("[data-waitlist]").forEach(el => {
  el.addEventListener("click", e => { e.preventDefault(); openWaitlist(); });
});

document.getElementById("wait-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("w-name");
  const disc = document.getElementById("w-discord");

  let bad = false;
  [name, disc].forEach(f => {
    const empty = !f.value.trim();
    f.classList.toggle("bad", empty);
    if (empty) bad = true;
  });
  if (bad){
    status("wait-status", "Add your name and Discord handle so we know who to add.", true);
    name.value.trim() ? disc.focus() : name.focus();
    return;
  }

  const token = waitWidget !== null ? turnstile.getResponse(waitWidget) : "";
  if (!token){
    status("wait-status", "Finish the check just above, then send.", true);
    return;
  }

  const btn = document.getElementById("wait-submit");
  btn.disabled = true;
  status("wait-status", "Sending\u2026");

  try {
    const r = await fetch(INTAKE.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "waitlist", token,
        name: name.value.trim(),
        discord: disc.value.trim(),
        main: document.getElementById("w-main").value,
        hp: document.getElementById("w-site").value,   // honeypot, must stay empty
        dt: Date.now() - waitOpenedAt                  // humans take longer than 1.5s
      }),
      redirect: "follow"
    });
    const d = await r.json();

    if (d && d.ok){
      document.getElementById("wait-form").classList.add("sent");
      status("wait-status", d.duplicate
        ? `You were already on the list, at number ${d.position}.`
        : `You are number ${d.position}. Watch for a friend request on Discord.`);
      return;
    }
    status("wait-status", (d && d.error) || "That did not send. Try again.", true);
  } catch {
    status("wait-status", "Could not reach the server. Try again in a moment.", true);
  } finally {
    btn.disabled = false;
    if (waitWidget !== null) turnstile.reset(waitWidget);
  }
});

refreshSeats();


/* ============================================================
   10. NAV MENU (small screens)
   ============================================================ */
const nav = document.querySelector(".site-nav");
const burger = document.getElementById("nav-burger");

function setNav(open){
  nav.classList.toggle("open", open);
  burger.setAttribute("aria-expanded", open ? "true" : "false");
}

burger.addEventListener("click", () => setNav(!nav.classList.contains("open")));

// Jumping to a section should close the menu behind you.
document.querySelectorAll("#nav-links a").forEach(a =>
  a.addEventListener("click", () => setNav(false)));

document.addEventListener("click", e => {
  if (!nav.contains(e.target)) setNav(false);
});

addEventListener("keydown", e => {
  if (e.key === "Escape" && nav.classList.contains("open")){
    setNav(false);
    burger.focus();
  }
});
