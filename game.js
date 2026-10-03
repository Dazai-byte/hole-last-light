"use strict";

const $ = id => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d", { alpha: false });

const ui = {
  score: $("score"), best: $("best"), time: $("time"),
  status: $("status"), level: $("level"), fill: $("growth-fill"),
  combo: $("combo"), menu: $("menu"), pauseScreen: $("pause-screen"),
  end: $("end-screen"), final: $("final-score"), record: $("record"),
  endTitle: $("end-title"), eyebrow: $("end-eyebrow"),
  flash: $("flash"), toast: $("toast"), pauseBtn: $("pause-btn")
};

let W = 0, H = 0, DPR = 1, state = "menu";
let score = 0, best = 0, time = 60, level = 1, xp = 0;
let combo = 1, comboTimer = 0, burstCooldown = 0, invulnerable = 0;
let elapsed = 0, last = 0, toastTime = 0, shake = 0, flashAlpha = 0;
let newRecord = false, audio = null;
let player = { x: 0, y: 0, r: 15 };
let target = { x: 0, y: 0 };
let pointer = { x: 0, y: 0, active: false };
let stars = [], orbs = [], hazards = [], powers = [], particles = [], rings = [];
const keys = Object.create(null);

try { best = Number(localStorage.getItem("hole-best")) || 0; } catch {}
ui.best.textContent = format(best);

function format(n) { return Math.floor(n).toString().padStart(6, "0"); }
function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function hide(el) { el.classList.add("hidden"); }
function show(el) { el.classList.remove("hidden"); }

function resize() {
  const rect = canvas.getBoundingClientRect();
  W = rect.width; H = rect.height;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  player.x = clamp(player.x || W / 2, 20, Math.max(20, W - 20));
  player.y = clamp(player.y || H / 2, 85, Math.max(85, H - 25));
  target.x = player.x; target.y = player.y;
  if (!pointer.active) { pointer.x = player.x; pointer.y = player.y; }
  makeStars();
}
window.addEventListener("resize", resize);

function makeStars() {
  stars = Array.from({ length: Math.min(150, Math.floor(W * H / 6500)) }, () => ({
    x: rand(0, W), y: rand(0, H), r: rand(.4, 1.5),
    a: rand(.16, .72), speed: rand(2, 12), phase: rand(0, 7)
  }));
}

function spawnOrb() {
  const side = Math.floor(rand(0, 4));
  let x = side === 0 ? -10 : side === 1 ? W + 10 : rand(0, W);
  let y = side === 2 ? -10 : side === 3 ? H + 10 : rand(95, H - 70);
  if (side < 2) y = rand(95, Math.max(100, H - 70));
  const roll = Math.random();
  const value = roll > .95 ? 5 : roll > .72 ? 3 : 1;
  orbs.push({
    x, y, r: value === 5 ? 6 : value === 3 ? 4.5 : 3,
    value, vx: rand(-10, 10), vy: rand(-10, 10),
    hue: value === 5 ? 42 : value === 3 ? 185 : 285, phase: rand(0, 7)
  });
}

function spawnHazard() {
  hazards.push({
    x: rand(35, Math.max(36, W - 35)),
    y: rand(100, Math.max(101, H - 90)),
    r: rand(12, 17), phase: rand(0, 7),
    vx: rand(-29, 29), vy: rand(-29, 29)
  });
}

function spawnPower() {
  powers.push({
    x: rand(35, Math.max(36, W - 35)),
    y: rand(100, Math.max(101, H - 90)),
    r: 9, phase: 0, type: Math.random() > .5 ? "time" : "surge"
  });
}

function resetGame() {
  score = 0; time = 60; level = 1; xp = 0; combo = 1;
  comboTimer = 0; burstCooldown = 0; invulnerable = 0;
  elapsed = 0; shake = 0; flashAlpha = 0; newRecord = false;
  orbs = []; hazards = []; powers = []; particles = []; rings = [];
  player = { x: W / 2, y: H / 2, r: 15 };
  target = { x: player.x, y: player.y };
  pointer = { x: player.x, y: player.y, active: false };
  for (let i = 0; i < 48; i++) spawnOrb();
  for (let i = 0; i < 4; i++) spawnHazard();
  ui.score.textContent = format(0);
  ui.time.textContent = "60.0";
  ui.level.textContent = "LV. 01";
  ui.fill.style.width = "0%";
  ui.combo.textContent = "×1 COMBO";
  ui.status.textContent = "SINGULARITY ONLINE";
}

function sound(freq = 440, duration = .07, type = "sine", volume = .025) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audio.currentTime);
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    osc.connect(gain); gain.connect(audio.destination);
    osc.start(); osc.stop(audio.currentTime + duration);
  } catch {}
}

function addParticles(x, y, amount, hue, force = 100) {
  for (let i = 0; i < amount; i++) {
    const a = rand(0, Math.PI * 2), speed = rand(force * .15, force);
    particles.push({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: rand(.28, .8), max: .8, r: rand(1, 3.2), hue
    });
  }
}

function toast(message) {
  ui.toast.textContent = message;
  ui.toast.style.opacity = "1";
  toastTime = 1.15;
}

function gain(points, x, y, hue) {
  score += points * combo;
  xp += points;
  comboTimer = 1.45;
  combo = Math.min(combo + 1, 12);
  addParticles(x, y, 4 + points, hue, 80);
  sound(240 + Math.min(combo, 10) * 45, .055, "sine", .018);

  if (xp >= level * 18) {
    xp -= level * 18;
    level++;
    player.r = Math.min(15 + level * 1.5, 34);
    toast("SINGULARITY EVOLVED · LV " + level);
    rings.push({ x: player.x, y: player.y, r: player.r, max: 190, alpha: 1, hue: 285 });
    addParticles(player.x, player.y, 34, 285, 180);
    shake = 5;
    sound(660, .22, "triangle", .04);
  }
}

function burst() {
  if (state !== "playing" || burstCooldown > 0) return;
  burstCooldown = 4.5;
  rings.push({ x: player.x, y: player.y, r: player.r, max: 150, alpha: .95, hue: 185 });
  addParticles(player.x, player.y, 24, 185, 170);
  shake = 4; flashAlpha = .1;
  for (const orb of orbs) {
    const d = dist(player, orb);
    if (d < 155) {
      const a = Math.atan2(player.y - orb.y, player.x - orb.x);
      const force = (1 - d / 155) * 520;
      orb.vx += Math.cos(a) * force;
      orb.vy += Math.sin(a) * force;
    }
  }
  toast("GRAVITY SURGE");
  sound(110, .3, "sawtooth", .035);
}

function finish() {
  if (state !== "playing") return;
  state = "ended";
  ui.endTitle.textContent = "TIME COLLAPSED.";
  ui.eyebrow.textContent = "THE VOID REMEMBERS";
  ui.final.textContent = format(score);
  ui.record.textContent = newRecord ? "✦ NEW PERSONAL RECORD ✦" : "EVERY RUN MAKES YOU STRONGER";
  show(ui.end);
  ui.status.textContent = "RUN COMPLETE";
}

function startGame() {
  resetGame(); state = "playing";
  hide(ui.menu); hide(ui.pauseScreen); hide(ui.end);
  ui.pauseBtn.style.visibility = "visible";
  last = performance.now();
  sound(330, .15, "triangle", .03);
}

function pauseGame() {
  if (state !== "playing") return;
  state = "paused"; show(ui.pauseScreen);
}
function resumeGame() {
  if (state !== "paused") return;
  state = "playing"; hide(ui.pauseScreen); last = performance.now();
}
function endToMenu() {
  state = "menu"; hide(ui.pauseScreen); hide(ui.end); show(ui.menu);
}

$("start").addEventListener("click", startGame);
$("again").addEventListener("click", startGame);
$("resume").addEventListener("click", resumeGame);
$("quit").addEventListener("click", () => {
  if (state !== "paused") return;
  hide(ui.pauseScreen); state = "playing"; finish();
});
$("home").addEventListener("click", endToMenu);
ui.pauseBtn.addEventListener("click", () => {
  if (state === "playing") pauseGame();
  else if (state === "paused") resumeGame();
});

window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  if (e.code === "Space" && !e.repeat) burst();
  if (k === "p" || k === "escape") {
    if (state === "playing") pauseGame();
    else if (state === "paused") resumeGame();
  }
});
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener("blur", () => {
  for (const k in keys) keys[k] = false;
  if (state === "playing") pauseGame();
});

canvas.addEventListener("pointermove", e => {
  const r = canvas.getBoundingClientRect();
  pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
  pointer.active = true;
});
canvas.addEventListener("pointerdown", e => {
  const r = canvas.getBoundingClientRect();
  pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
  pointer.active = true;
  if (state === "playing" && e.pointerType === "touch") burst();
});

function update(dt) {
  elapsed += dt;
  time -= dt;
  if (time <= 0) { time = 0; finish(); return; }

  burstCooldown = Math.max(0, burstCooldown - dt);
  invulnerable = Math.max(0, invulnerable - dt);
  comboTimer -= dt;
  if (comboTimer <= 0) combo = 1;
  shake *= Math.pow(.04, dt);
  flashAlpha *= Math.pow(.015, dt);
  toastTime -= dt;
  if (toastTime <= 0) ui.toast.style.opacity = "0";

  let dx = 0, dy = 0;
  if (keys.a || keys.arrowleft) dx--;
  if (keys.d || keys.arrowright) dx++;
  if (keys.w || keys.arrowup) dy--;
  if (keys.s || keys.arrowdown) dy++;

  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    target.x = player.x + dx / len * 100;
    target.y = player.y + dy / len * 100;
  } else if (pointer.active) {
    target.x = pointer.x; target.y = pointer.y;
  }

  target.x = clamp(target.x, 12, W - 12);
  target.y = clamp(target.y, 82, H - 25);
  const smooth = 1 - Math.exp(-9 * dt);
  player.x += (target.x - player.x) * smooth;
  player.y += (target.y - player.y) * smooth;

  if (Math.random() < dt * 4.2 && orbs.length < 90) spawnOrb();
  if (Math.random() < dt * (.38 + level * .04) && hazards.length < Math.min(10, 5 + Math.floor(level / 2))) spawnHazard();
  if (Math.random() < dt * .085 && powers.length < 3) spawnPower();

  for (const s of stars) {
    s.phase += dt;
    s.y += s.speed * dt * (.4 + level * .08);
    if (s.y > H) { s.y = 0; s.x = rand(0, W); }
  }

  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i], d = dist(player, o);
    o.phase += dt * 2;
    if (d < 150 + player.r) {
      const angle = Math.atan2(player.y - o.y, player.x - o.x);
      const pull = (1 - d / (150 + player.r)) * 360;
      o.vx += Math.cos(angle) * pull * dt;
      o.vy += Math.sin(angle) * pull * dt;
    }
    o.vx *= Math.pow(.25, dt); o.vy *= Math.pow(.25, dt);
    o.x += o.vx * dt; o.y += o.vy * dt;
    if (d < player.r + o.r + 3) {
      gain(o.value * 10, o.x, o.y, o.hue);
      orbs.splice(i, 1);
    }
  }

  for (const h of hazards) {
    h.phase += dt * 2;
    h.x += h.vx * dt; h.y += h.vy * dt;
    if (h.x < h.r || h.x > W - h.r) h.vx *= -1;
    if (h.y < 88 + h.r || h.y > H - 48 - h.r) h.vy *= -1;
    if (invulnerable <= 0 && dist(player, h) < player.r + h.r) {
      invulnerable = 1.25; time = Math.max(0, time - 4);
      score = Math.max(0, score - 25); combo = 1; comboTimer = 0;
      shake = 9; flashAlpha = .18;
      addParticles(player.x, player.y, 18, 350, 145);
      toast("COLLISION · -4 SECONDS");
      sound(90, .18, "square", .025);
    }
  }

  for (let i = powers.length - 1; i >= 0; i--) {
    const p = powers[i]; p.phase += dt * 3;
    if (dist(player, p) < player.r + p.r + 5) {
      if (p.type === "time") {
        time = Math.min(90, time + 7); toast("+7 SECONDS"); sound(760, .16, "sine", .035);
      } else {
        score += 100; burstCooldown = 0;
        rings.push({ x: player.x, y: player.y, r: 12, max: 220, alpha: 1, hue: 285 });
        addParticles(p.x, p.y, 22, 285, 160);
        toast("VOID CHARGE · +100"); sound(580, .2, "triangle", .035);
      }
      powers.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= Math.pow(.12, dt); p.vy *= Math.pow(.12, dt);
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.r += r.max / .55 * dt; r.alpha -= dt * 1.8;
    if (r.alpha <= 0) rings.splice(i, 1);
  }

  ui.score.textContent = format(score);
  ui.time.textContent = time.toFixed(1);
  ui.level.textContent = "LV. " + String(level).padStart(2, "0");
  ui.fill.style.width = Math.min(100, xp / (level * 18) * 100) + "%";
  ui.combo.textContent = "×" + combo + " COMBO";
  ui.combo.style.opacity = combo > 1 ? "1" : ".55";
  ui.status.textContent = invulnerable > 0 ? "STABILIZING..." : "SINGULARITY ONLINE";

  if (score > best) {
    best = score; newRecord = true;
    ui.best.textContent = format(best);
    try { localStorage.setItem("hole-best", String(best)); } catch {}
  }
}

function glowCircle(x, y, r, color, blur = 15) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBackground() {
  ctx.fillStyle = "#070817"; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W * .5, H * .48, 0, W * .5, H * .48, W * .7);
  bg.addColorStop(0, "#13172f"); bg.addColorStop(1, "#070817");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#90a4ff08"; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  for (const s of stars) {
    ctx.globalAlpha = s.a * (.72 + Math.sin(s.phase * 2) * .28);
    ctx.fillStyle = "#d7e7ff"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawOrbs() {
  for (const o of orbs) {
    const r = o.r + Math.sin(o.phase) * .5;
    glowCircle(o.x, o.y, r, `hsl(${o.hue} 100% 72%)`, 11);
    ctx.fillStyle = "#fff"; ctx.globalAlpha = .8;
    ctx.beginPath(); ctx.arc(o.x - 1, o.y - 1, Math.max(1, r * .3), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHazards() {
  for (const h of hazards) {
    const pulse = Math.sin(h.phase) * 2;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.phase * .25);
    ctx.strokeStyle = "#ff5478"; ctx.shadowColor = "#ff315c"; ctx.shadowBlur = 18; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, r = h.r + (i % 2 ? pulse : -pulse);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke(); ctx.fillStyle = "#ff315c18"; ctx.fill(); ctx.restore();
  }
}

function drawPowers() {
  for (const p of powers) {
    const pulse = Math.sin(p.phase) * 2, color = p.type === "time" ? "#70faff" : "#bb8cff";
    glowCircle(p.x, p.y, p.r + pulse, color, 18);
    ctx.fillStyle = "#10142a"; ctx.font = "bold 12px Orbitron"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(p.type === "time" ? "+" : "✦", p.x, p.y);
  }
}

function drawPlayer() {
  const p = player;
  if (invulnerable > 0 && Math.floor(elapsed * 12) % 2 === 0) return;
  const outer = p.r + 14;
  const gradient = ctx.createRadialGradient(p.x, p.y, p.r * .35, p.x, p.y, outer);
  gradient.addColorStop(0, "#04040d"); gradient.addColorStop(.45, "#12152d");
  gradient.addColorStop(.75, "#70faff26"); gradient.addColorStop(1, "#70faff00");
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(p.x, p.y, outer, 0, Math.PI * 2); ctx.fill();

  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(elapsed * 1.3);
  ctx.strokeStyle = "#70faff"; ctx.shadowColor = "#70faff"; ctx.shadowBlur = 20; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(0, 0, p.r + 5, Math.max(3, p.r * .43), -.2, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#bd8aff"; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.ellipse(0, 0, p.r + 8, Math.max(3, p.r * .3), .35, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#02030a"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#9ffaff"; ctx.lineWidth = 1.2; ctx.shadowColor = "#70faff"; ctx.shadowBlur = 13;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
}

function drawEffects() {
  for (const r of rings) {
    ctx.save(); ctx.globalAlpha = Math.max(0, r.alpha);
    ctx.strokeStyle = `hsl(${r.hue} 100% 75%)`; ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 20; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = `hsl(${p.hue} 100% 72%)`; ctx.fillRect(p.x, p.y, p.r, p.r);
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.save();
  if (shake > .1) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawBackground(); drawOrbs(); drawHazards(); drawPowers(); drawEffects(); drawPlayer();
  ctx.restore();
  if (flashAlpha > .005) {
    ctx.fillStyle = `rgba(112,250,255,${flashAlpha})`; ctx.fillRect(0, 0, W, H);
  }
}

function loop(now) {
  const dt = Math.min(Math.max((now - last) / 1000 || 0, 0), .04);
  last = now;
  if (state === "playing") update(dt);
  else {
    // Keep the backdrop gently alive on the title and pause screens.
    elapsed += dt * .3;
    for (const s of stars) {
      s.phase += dt * .3;
      s.y += s.speed * dt * .12;
      if (s.y > H) { s.y = 0; s.x = rand(0, W); }
    }
  }
  render();
  requestAnimationFrame(loop);
}

resize();
for (let i = 0; i < 32; i++) spawnOrb();
requestAnimationFrame(now => { last = now; requestAnimationFrame(loop); });
