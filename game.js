"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = {
  startPanel: document.getElementById("startPanel"),
  gameOverPanel: document.getElementById("gameOverPanel"),
  startButton: document.getElementById("startButton"),
  retryButton: document.getElementById("retryButton"),
  finalScore: document.getElementById("finalScore"),
  highScore: document.getElementById("highScore"),
};

const W = canvas.width;
const H = canvas.height;
const GROUND_Y = 466;
const keys = { left: false, right: false, punch: false };
let state = "title";
let rocks = [];
let items = [];
let particles = [];
let scorePopups = [];
let damagePopups = [];
let healPopups = [];
let score = 0;
let elapsed = 0;
let spawnTimer = 0;
let itemSpawnTimer = 0;
let lastTime = 0;
let shake = 0;
let soundOn = true;
let audio = null;
let bgmTimer = null;
let gameOverTimer = null;
let combo = 0;
let bestCombo = 0;
let comboTime = 0;
let feverCharge = 0;
let feverTime = 0;
let rapidTime = 0;
let hitStop = 0;
let effects = [];
let walkTime = 0;
const RULES = { punchInterval: 0.25, comboWindow: 2, feverTarget: 12, feverDuration: 6, rapidDuration: 5 };

const player = {
  x: 450, y: GROUND_Y - 78, w: 54, h: 78,
  speed: 310, facing: 1, punchTime: 0, punchCooldown: 0, defeated: false,
  helmet: false, gloveHits: 0, health: 150, invulnerable: 0,
};

function resetGame() {
  clearTimeout(gameOverTimer);
  keys.left = keys.right = keys.punch = false;
  combo = bestCombo = comboTime = feverCharge = feverTime = rapidTime = hitStop = walkTime = 0;
  effects = [];
  rocks = [];
  items = [];
  particles = [];
  scorePopups = [];
  damagePopups = [];
  healPopups = [];
  score = 0;
  elapsed = 0;
  spawnTimer = 0.55;
  itemSpawnTimer = 10 + Math.random() * 5;
  shake = 0;
  player.x = W / 2 - player.w / 2;
  player.y = GROUND_Y - player.h;
  player.facing = 1;
  player.punchTime = 0;
  player.punchCooldown = 0;
  player.defeated = false;
  player.helmet = false;
  player.gloveHits = 0;
  player.health = 150;
  player.invulnerable = 0;
  state = "playing";
  ui.startPanel.classList.add("hidden");
  ui.gameOverPanel.classList.add("hidden");
  startBgm();
}

function startGame() {
  initAudio();
  resetGame();
}

function gameOver(ironHit = false) {
  if (state !== "playing") return;
  state = "gameover";
  player.defeated = true;
  shake = 18;
  if (ironHit) soundMetalCrash();
  else soundCrash();
  stopBgm();
  const final = Math.floor(score);
  let high = final;
  try {
    high = Math.max(final, Number(localStorage.getItem("kochanRockPanicHigh") || 0) || 0);
    localStorage.setItem("kochanRockPanicHigh", String(high));
  } catch { /* Play remains available when storage is blocked. */ }
  ui.finalScore.textContent = String(final).padStart(5, "0");
  ui.highScore.textContent = String(high).padStart(5, "0");
  document.getElementById("bestCombo").textContent = bestCombo;
  gameOverTimer = setTimeout(() => {
    if (state === "gameover") ui.gameOverPanel.classList.remove("hidden");
  }, 650);
}

function punch() {
  if (state !== "playing" || player.punchCooldown > 0 || player.defeated) return;
  player.punchTime = 0.16;
  player.punchCooldown = RULES.punchInterval;
  soundPunch();
}

function spawnRock() {
  const difficulty = Math.min(elapsed / 75, 1);
  const ironChance = 0.12 + difficulty * 0.11;
  const iron = Math.random() < ironChance;
  const hasPotion = iron && Math.random() < 0.25;
  const size = iron ? 36 + Math.random() * 27 : 26 + Math.random() * 48;
  rocks.push({
    x: 18 + Math.random() * (W - size - 36),
    y: -size - 10,
    size,
    speed: 125 + Math.random() * 85 + difficulty * 190,
    iron,
    hasPotion,
    bounceVelocity: 0,
    spin: Math.random() * Math.PI * 2,
    spinSpeed: (Math.random() - 0.5) * 2.5,
  });
}

function dropPotion(rock) {
  const size = 34;
  items.push({
    type: "potion",
    x: rock.x + rock.size / 2 - size / 2,
    y: rock.y + rock.size / 2 - size / 2,
    size,
    speed: 125,
    landed: false,
    life: 7,
    pulse: 0,
  });
}

function spawnItem() {
  const type = ["helmet", "glove", "rapid"][Math.floor(Math.random() * 3)];
  const size = 38;
  items.push({
    type,
    x: 28 + Math.random() * (W - size - 56),
    y: -size,
    size,
    speed: 105,
    landed: false,
    life: 7,
    pulse: Math.random() * Math.PI * 2,
  });
}

function getItem() {
  if (state !== "playing" || player.defeated) return;
  const pickupBox = {
    x: player.x, y: player.y, w: player.w, h: player.h,
  };
  let nearestIndex = -1;
  let nearestDistance = Infinity;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.type === "potion" && player.health >= 150) continue;
    const itemBox = { x: item.x, y: item.y, w: item.size, h: item.size };
    if (!overlaps(pickupBox, itemBox)) continue;
    const distance = Math.abs(item.x + item.size / 2 - (player.x + player.w / 2));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }
  if (nearestIndex < 0) return;
  const item = items[nearestIndex];
  if (item.type === "helmet") {
    player.helmet = true;
  } else if (item.type === "glove") {
    player.gloveHits = 3;
  } else if (item.type === "rapid") {
    rapidTime = RULES.rapidDuration;
  } else {
    const healed = Math.min(50, 150 - player.health);
    player.health += healed;
    healPopups.push({
      x: player.x + player.w / 2,
      y: player.y + 8,
      life: 1, healed,
    });
  }
  const itemColor = item.type === "helmet" || item.type === "rapid" ? "#ffd447" : item.type === "glove" ? "#ed3d59" : "#43c85a";
  makeDebris(item.x + item.size / 2, item.y + item.size / 2, itemColor);
  items.splice(nearestIndex, 1);
  if (item.type === "potion") soundHeal();
  else soundItemGet();
}

function absorbRockHit(rock) {
  if (!player.helmet) return false;
  player.helmet = false;
  shake = 10;
  makeDebris(player.x + player.w / 2, player.y + 8, "#ffd447");
  makeDebris(rock.x + rock.size / 2, rock.y + rock.size / 2, rock.iron ? "#8d9aaa" : "#8e684b");
  soundHelmetBreak();
  return true;
}

function getRockDamage(rock) {
  if (rock.iron) return 150;
  if (rock.size < 42) return 20;
  if (rock.size < 60) return 50;
  return 100;
}

function takeRockDamage(rock) {
  if (feverTime > 0 || player.invulnerable > 0) return;
  if (absorbRockHit(rock)) return;
  const damage = getRockDamage(rock);
  player.health = Math.max(0, player.health - damage);
  damagePopups.push({
    x: player.x + player.w / 2,
    y: player.y + 10,
    damage,
    life: 0.9,
  });
  shake = Math.min(16, 5 + damage / 12);
  makeDebris(player.x + player.w / 2, player.y + 22, rock.iron ? "#8d9aaa" : "#d95656");
  if (player.health <= 0) {
    gameOver(rock.iron);
    return;
  }
  player.invulnerable = 1;
  soundDamage(damage);
}

function update(dt) {
  if (shake > 0) shake = Math.max(0, shake - dt * 45);
  if (state !== "playing") {
    updateParticles(dt);
    updateScorePopups(dt);
    updateDamagePopups(dt);
    updateHealPopups(dt);
    return;
  }

  effects.forEach(effect => { effect.life -= dt; });
  effects = effects.filter(effect => effect.life > 0);
  // Only the part of this frame outside fever consumes the item timer.
  rapidTime = Math.max(0, rapidTime - Math.max(0, dt - feverTime));
  feverTime = Math.max(0, feverTime - dt);
  comboTime = Math.max(0, comboTime - dt);
  if (comboTime === 0) combo = 0;
  elapsed += dt;
  score += dt * 10;
  player.punchTime = Math.max(0, player.punchTime - dt);
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  if (keys.punch && (rapidTime > 0 || feverTime > 0)) punch();

  let direction = 0;
  if (keys.left) direction -= 1;
  if (keys.right) direction += 1;
  if (direction !== 0) {
    walkTime += dt * 15;
    player.facing = direction;
    player.x += direction * player.speed * dt;
  }
  player.x = Math.max(12, Math.min(W - player.w - 12, player.x));

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnRock();
    const minGap = Math.max(0.23, 0.74 - elapsed * 0.006);
    spawnTimer = minGap + Math.random() * 0.45;
    if (elapsed > 30 && Math.random() < Math.min(0.38, elapsed / 180)) spawnRock();
  }

  itemSpawnTimer -= dt;
  if (itemSpawnTimer <= 0) {
    spawnItem();
    itemSpawnTimer = 15 + Math.random() * 10;
  }

  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    item.pulse += dt * 5;
    if (!item.landed) {
      item.y += item.speed * dt;
      if (item.y + item.size >= GROUND_Y - 3) {
        item.y = GROUND_Y - item.size - 3;
        item.landed = true;
      }
    } else {
      item.life -= dt;
      if (item.life <= 0) items.splice(i, 1);
    }
  }

  getItem();

  const body = { x: player.x + 8, y: player.y + 5, w: player.w - 16, h: player.h - 5 };

  for (let i = rocks.length - 1; i >= 0; i -= 1) {
    const rock = rocks[i];
    if (rock.bounceVelocity < 0) {
      rock.y += rock.bounceVelocity * dt;
      rock.bounceVelocity = Math.min(0, rock.bounceVelocity + 850 * dt);
    } else rock.y += rock.speed * dt;
    rock.spin += rock.spinSpeed * dt;
    const hitbox = { x: rock.x + 5, y: rock.y + 5, w: rock.size - 10, h: rock.size - 10 };

    if (player.punchTime > 0 && getPunchBoxes().some(box => overlaps(box, hitbox))) {
      if (rock.iron && player.gloveHits === 0 && feverTime === 0) {
        if (rock.bounceVelocity >= 0) {
          rock.bounceVelocity = -430;
          rock.y = Math.min(rock.y, getPunchBoxes()[0].y - rock.size + 6);
          effects.push({ x: rock.x + rock.size / 2, y: rock.y + rock.size, life: .25 });
          tone(720, .09, "triangle", .04);
        }
        continue;
      }
      if (rock.iron && feverTime === 0) player.gloveHits -= 1;
      destroyRock(rock);
      rocks.splice(i, 1);
      continue;
    }

    if (overlaps(body, hitbox)) {
      takeRockDamage(rock);
      rocks.splice(i, 1);
      if (state !== "playing") return;
      continue;
    }
    if (rock.y > H + rock.size) rocks.splice(i, 1);
  }
  updateParticles(dt);
  updateScorePopups(dt);
  updateDamagePopups(dt);
  updateHealPopups(dt);
}

function addScorePopup(x, y, points) {
  scorePopups.push({ x, y, points, life: 0.9 });
}

function destroyRock(rock) {
  combo += 1;
  bestCombo = Math.max(bestCombo, combo);
  comboTime = RULES.comboWindow;
  const multiplier = combo >= 10 ? 2 : combo >= 5 ? 1.5 : 1;
  const points = (rock.iron ? 100 : 75) * multiplier;
  score += points;
  addScorePopup(rock.x + rock.size / 2, rock.y, points);
  makeDebris(rock.x + rock.size / 2, rock.y + rock.size / 2, rock.iron ? "#c5e6ee" : "#e4ab68");
  effects.push({ x: rock.x + rock.size / 2, y: rock.y + rock.size / 2, life: .25 });
  hitStop = .035;
  shake = rock.size >= 60 ? 4 : 2;
  if (rock.hasPotion) dropPotion(rock);
  if (rock.iron) soundIronBreak();
  else soundBreak();
  tone(390 + Math.min(combo, 16) * 35, .1, "triangle", .035);
  if (feverTime === 0) {
    feverCharge += 1;
    if (feverCharge >= RULES.feverTarget) {
      feverCharge = 0;
      feverTime = RULES.feverDuration;
      [523, 659, 784, 1047].forEach((note, i) => tone(note, .2, "square", .04, i * .08));
    }
  }
}

// The luminous punch and its collision area use the same rectangle.
function getPunchBoxes() {
  const powered = feverTime > 0;
  const width = powered ? 100 : 42;
  return [{
    x: player.x + player.w / 2 - width / 2 + player.facing * (powered ? 12 : 18),
    y: player.y - (powered ? 100 : 54),
    w: width, h: powered ? 151 : 105,
  }];
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function makeDebris(x, y, color) {
  for (let i = 0; i < 10; i += 1) {
    particles.push({ x, y, vx: (Math.random() - .5) * 260, vy: -60 - Math.random() * 180, life: .5 + Math.random() * .35, color, size: 5 + Math.random() * 8 });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.vy += 500 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateScorePopups(dt) {
  for (let i = scorePopups.length - 1; i >= 0; i -= 1) {
    const popup = scorePopups[i];
    popup.life -= dt;
    popup.y -= 42 * dt;
    if (popup.life <= 0) scorePopups.splice(i, 1);
  }
}

function updateDamagePopups(dt) {
  for (let i = damagePopups.length - 1; i >= 0; i -= 1) {
    const popup = damagePopups[i];
    popup.life -= dt;
    popup.y -= 36 * dt;
    if (popup.life <= 0) damagePopups.splice(i, 1);
  }
}

function updateHealPopups(dt) {
  for (let i = healPopups.length - 1; i >= 0; i -= 1) {
    const popup = healPopups[i];
    popup.life -= dt;
    popup.y -= 38 * dt;
    if (popup.life <= 0) healPopups.splice(i, 1);
  }
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
  drawBackground();
  rocks.forEach(drawRock);
  items.forEach(drawItem);
  particles.forEach(p => { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); });
  drawScorePopups();
  drawDamagePopups();
  drawHealPopups();
  drawPlayer();
  drawRapidGauge();
  drawPunch();
  drawEffects();
  ctx.restore();
  drawHud();
}

function drawHealPopups() {
  ctx.save();
  ctx.font = "bold 25px monospace";
  ctx.textAlign = "center";
  for (const popup of healPopups) {
    ctx.globalAlpha = Math.min(1, popup.life * 2);
    ctx.fillStyle = "#12172f";
    ctx.fillText(`HP +${popup.healed}`, popup.x + 2, popup.y + 2);
    ctx.fillStyle = "#54e36b";
    ctx.fillText(`HP +${popup.healed}`, popup.x, popup.y);
  }
  ctx.restore();
}

function drawDamagePopups() {
  ctx.save();
  ctx.font = "bold 25px monospace";
  ctx.textAlign = "center";
  for (const popup of damagePopups) {
    ctx.globalAlpha = Math.min(1, popup.life * 2);
    const label = `-${popup.damage}`;
    ctx.fillStyle = "#12172f";
    ctx.fillText(label, popup.x + 2, popup.y + 2);
    ctx.fillStyle = "#ff5b64";
    ctx.fillText(label, popup.x, popup.y);
  }
  ctx.restore();
}

function drawScorePopups() {
  ctx.save();
  ctx.font = "bold 25px monospace";
  ctx.textAlign = "center";
  for (const popup of scorePopups) {
    ctx.globalAlpha = Math.min(1, popup.life * 2);
    ctx.fillStyle = "#12172f";
    const label = `+${popup.points}`;
    ctx.fillText(label, popup.x + 2, popup.y + 2);
    ctx.fillStyle = "#ffd447";
    ctx.fillText(label, popup.x, popup.y);
  }
  ctx.restore();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#459cde");
  sky.addColorStop(1, "#c2edf0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  ctx.fillStyle = "rgba(255,255,255,.75)";
  [[80,90],[620,60],[780,160]].forEach(([x,y], index) => {
    x = (x + elapsed * (4 + index)) % (W + 120) - 60;
    const s = index === 1 ? 1.25 : 1;
    ctx.fillRect(x, y + 16*s, 92*s, 22*s);
    ctx.fillRect(x + 20*s, y, 48*s, 25*s);
  });

  ctx.fillStyle = "#92c6b7";
  for (let x = -80; x < W; x += 240) {
    ctx.beginPath(); ctx.moveTo(x, 380); ctx.lineTo(x + 140, 225);
    ctx.lineTo(x + 290, 380); ctx.fill();
  }
  ctx.fillStyle = "#609d83";
  ctx.fillRect(0, 360, W, 106);
  ctx.fillStyle = "#3d6b60";
  for (let x = 0; x < W; x += 64) {
    const h = 34 + ((x / 64) % 3) * 17;
    ctx.fillRect(x, 360 - h, 64, h);
  }
  ctx.fillStyle = "#65a94f";
  ctx.fillRect(0, GROUND_Y - 18, W, 22);
  ctx.fillStyle = "#416f37";
  for (let x = 0; x < W; x += 32) ctx.fillRect(x, GROUND_Y - (x % 64 ? 11 : 17), 32, 8);
  ctx.fillStyle = "#8d5937";
  ctx.fillRect(0, GROUND_Y + 4, W, H - GROUND_Y);
  ctx.fillStyle = "#68422f";
  for (let y = GROUND_Y + 12; y < H; y += 24) {
    for (let x = (y % 48); x < W; x += 64) ctx.fillRect(x, y, 24, 10);
  }
}

function drawPlayer() {
  if (!player.defeated && player.invulnerable > 0 && Math.floor(player.invulnerable * 14) % 2 === 0) return;
  ctx.save();
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  ctx.fillStyle = "rgba(18,48,52,.22)";
  ctx.beginPath(); ctx.ellipse(x + 27, GROUND_Y + 8, 35, 8, 0, 0, Math.PI * 2); ctx.fill();
  if (feverTime > 0) {
    ctx.shadowColor = "#ffe974"; ctx.shadowBlur = 18;
  }
  if (player.defeated) {
    ctx.translate(x + 10, GROUND_Y - 15);
    ctx.rotate(-Math.PI / 2);
    drawKochan(0, -player.h + 10, 1);
  } else {
    drawKochan(x, y, player.facing);
  }
  ctx.restore();
}

function drawRapidGauge() {
  if (state !== "playing" || rapidTime <= 0) return;
  const x = Math.max(8, Math.min(W - 128, player.x + player.w / 2 - 60));
  const y = player.y - 89;
  const paused = feverTime > 0;
  const blinking = !paused && rapidTime <= 1 && Math.floor(rapidTime * 8) % 2 === 0;
  ctx.save();
  ctx.fillStyle = "rgba(18,23,47,.9)";
  ctx.fillRect(x, y, 120, 33);
  ctx.textAlign = "center";
  ctx.font = "bold 12px monospace";
  ctx.fillStyle = blinking ? "#fff" : "#ffe974";
  ctx.fillText(paused ? "連打キープ中" : `連打 あと${rapidTime.toFixed(1)}秒`, x + 60, y + 14);
  ctx.fillStyle = "#344268";
  ctx.fillRect(x + 6, y + 21, 108, 6);
  ctx.fillStyle = blinking ? "#fff" : "#ffe974";
  ctx.fillRect(x + 6, y + 21, 108 * rapidTime / RULES.rapidDuration, 6);
  ctx.restore();
}

function drawKochan(x, y, facing) {
  const flipX = px => facing > 0 ? x + px : x + player.w - px;
  ctx.fillStyle = "#1f315e";
  ctx.fillRect(x + 9, y, 36, 10);
  ctx.fillRect(x + 3, y + 9, 48, 15);
  if (player.helmet) {
    ctx.fillStyle = "#ffd447";
    ctx.fillRect(x + 7, y - 7, 40, 9);
    ctx.fillRect(x + 3, y + 1, 48, 12);
    ctx.fillStyle = "#b87022";
    ctx.fillRect(x + 7, y + 10, 8, 7);
    ctx.fillRect(x + 43, y + 10, 8, 7);
  }
  ctx.fillStyle = "#f0ba91";
  ctx.fillRect(x + 10, y + 18, 34, 27);
  ctx.fillRect(x + 18, y + 43, 20, 8);
  ctx.fillStyle = "#4778c5";
  ctx.fillRect(flipX(16) - (facing < 0 ? 5 : 0), y + 26, 5, 5);
  ctx.fillStyle = "#1b2a53";
  ctx.fillRect(flipX(35) - (facing < 0 ? 5 : 0), y + 35, 5, 3);
  ctx.fillStyle = "#1da8aa";
  ctx.fillRect(x + 5, y + 49, 44, 21);
  ctx.fillStyle = "#d52e6c";
  ctx.fillRect(x + 17, y + 55, 22, 7);
  ctx.fillStyle = "#f0ba91";
  ctx.fillRect(x, y + 53, 8, 8);
  if (player.punchTime === 0) {
    const armX = facing > 0 ? x + 46 : x - 4;
    ctx.fillRect(armX, y + 52, 10, 16);
    if (player.gloveHits > 0 || feverTime > 0) {
      ctx.fillStyle = feverTime > 0 ? "#ffe974" : "#ed3d59";
      ctx.fillRect(armX - 3, y + 57, 16, 16);
    }
  }
  const stride = state === "playing" && keys.left !== keys.right ? Math.round(Math.sin(walkTime) * 5) : 0;
  ctx.fillStyle = "#e4bc32";
  ctx.fillRect(x + 10, y + 67, 34, 9);
  ctx.fillStyle = "#f0ba91";
  ctx.fillRect(x + 13, y + 69 + stride, 10, 9);
  ctx.fillRect(x + 34, y + 69 - stride, 10, 9);
  ctx.fillStyle = "#923267";
  ctx.fillRect(x + 6, y + 76 + stride, 19, 7);
  ctx.fillRect(x + 32, y + 76 - stride, 19, 7);
}

function drawItem(item) {
  const x = Math.round(item.x);
  const y = Math.round(item.y + (item.landed ? Math.sin(item.pulse) * 2 : 0));
  const s = item.size;
  ctx.save();
  if (item.landed && item.life < 2) ctx.globalAlpha = Math.sin(item.life * 18) > 0 ? 1 : 0.3;
  ctx.fillStyle = `rgba(255,244,199,${0.18 + (Math.sin(item.pulse) + 1) * 0.1})`;
  ctx.fillRect(x - 6, y - 6, s + 12, s + 12);
  if (item.type === "helmet") {
    ctx.fillStyle = "#ffd447";
    ctx.fillRect(x + 6, y + 4, s - 12, 9);
    ctx.fillRect(x + 2, y + 12, s - 4, 15);
    ctx.fillStyle = "#b87022";
    ctx.fillRect(x + 2, y + 25, 9, 7);
    ctx.fillRect(x + s - 11, y + 25, 9, 7);
  } else if (item.type === "glove") {
    ctx.fillStyle = "#ed3d59";
    ctx.fillRect(x + 10, y + 2, 18, 20);
    ctx.fillRect(x + 5, y + 8, 28, 18);
    ctx.fillStyle = "#9c1735";
    ctx.fillRect(x + 12, y + 25, 15, 10);
    ctx.fillStyle = "#ff8a9b";
    ctx.fillRect(x + 9, y + 7, 8, 6);
  } else if (item.type === "rapid") {
    ctx.fillStyle = "#24375d";
    ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.strokeStyle = "#ffe974";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    ctx.fillStyle = "#ffe974";
    ctx.beginPath();
    ctx.moveTo(x + 21, y + 3); ctx.lineTo(x + 8, y + 22);
    ctx.lineTo(x + 18, y + 22); ctx.lineTo(x + 14, y + 35);
    ctx.lineTo(x + 31, y + 15); ctx.lineTo(x + 21, y + 15);
    ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = "#f4f1df";
    ctx.fillRect(x + 11, y + 1, 12, 7);
    ctx.fillStyle = "#a8b7c2";
    ctx.fillRect(x + 9, y + 7, 16, 5);
    ctx.fillStyle = "#43c85a";
    ctx.fillRect(x + 5, y + 12, 24, 19);
    ctx.fillStyle = "#b8f3c1";
    ctx.fillRect(x + 9, y + 15, 7, 11);
  }
  ctx.restore();
}

function drawPunch() {
  if (player.punchTime <= 0 || player.defeated) return;
  const box = getPunchBoxes()[0];
  ctx.save();
  const powered = feverTime > 0;
  ctx.fillStyle = powered ? "rgba(255,235,130,.4)" : "rgba(233,255,255,.38)";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = powered ? "#ffe974" : "#d5fbff";
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
  ctx.fillStyle = "#f0ba91";
  ctx.fillRect(box.x + box.w / 2 - 5, box.y + 25, 10, box.h - 25);
  ctx.fillStyle = powered ? "#ffe974" : player.gloveHits > 0 ? "#ed3d59" : "#ffd0a3";
  ctx.fillRect(box.x, box.y, box.w, powered ? 48 : 29);
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillRect(box.x + 5, box.y + 5, box.w - 10, 6);
  ctx.restore();
}

function drawEffects() {
  ctx.save();
  for (const effect of effects) {
    ctx.globalAlpha = effect.life / .25;
    const radius = 12 + (1 - effect.life / .25) * 32;
    ctx.strokeStyle = "#fff3aa"; ctx.lineWidth = 4;
    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(effect.x + Math.cos(angle) * radius * .5, effect.y + Math.sin(angle) * radius * .5);
      ctx.lineTo(effect.x + Math.cos(angle) * radius, effect.y + Math.sin(angle) * radius);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRock(rock) {
  ctx.save();
  ctx.translate(Math.round(rock.x + rock.size / 2), Math.round(rock.y + rock.size / 2));
  ctx.rotate(rock.spin);
  const s = rock.size;
  const x = -s / 2, y = -s / 2;
  if (rock.iron) {
    ctx.fillStyle = "#414a5b";
    ctx.fillRect(x + s*.1, y, s*.8, s);
    ctx.fillRect(x, y + s*.18, s, s*.64);
    ctx.fillStyle = "#8d9aaa";
    ctx.fillRect(x + s*.15, y + s*.15, s*.45, s*.25);
    ctx.fillStyle = "#d9edf0";
    ctx.fillRect(x + s*.25, y + s*.12, s*.25, s*.12);
    ctx.fillStyle = "#202736";
    ctx.fillRect(x + s*.55, y + s*.55, s*.25, s*.23);
    if (rock.hasPotion) {
      ctx.fillStyle = "#43c85a";
      ctx.fillRect(x + s*.41, y + s*.2, s*.18, s*.6);
      ctx.fillRect(x + s*.2, y + s*.41, s*.6, s*.18);
      ctx.fillStyle = "#b8f3c1";
      ctx.fillRect(x + s*.45, y + s*.24, s*.07, s*.2);
    }
  } else {
    ctx.fillStyle = "#5a4036";
    ctx.fillRect(x + s*.1, y, s*.75, s);
    ctx.fillRect(x, y + s*.16, s, s*.65);
    ctx.fillStyle = "#8e684b";
    ctx.fillRect(x + s*.13, y + s*.13, s*.46, s*.31);
    ctx.fillStyle = "#b48b61";
    ctx.fillRect(x + s*.2, y + s*.12, s*.25, s*.13);
    ctx.fillStyle = "#422d2a";
    ctx.fillRect(x + s*.56, y + s*.53, s*.25, s*.24);
  }
  ctx.restore();
}

function drawHud() {
  ctx.fillStyle = "rgba(18,23,47,.78)";
  ctx.fillRect(14, 13, 265, 126);
  ctx.fillStyle = "#fff4c7";
  ctx.font = "bold 22px monospace";
  ctx.fillText("SCORE " + String(Math.floor(score)).padStart(5, "0"), 27, 40);
  ctx.fillStyle = "#ffd447";
  ctx.font = "bold 16px monospace";
  ctx.fillText("こーちゃん", 27, 63);
  ctx.fillStyle = "#fff4c7";
  ctx.font = "bold 13px monospace";
  ctx.fillText(`HP ${String(player.health).padStart(3, " ")} / 150`, 27, 83);
  ctx.fillStyle = "#26304f";
  ctx.fillRect(27, 91, 228, 13);
  ctx.fillStyle = "#43c85a";
  ctx.fillRect(29, 93, 224 * (player.health / 150), 9);
  ctx.font = "bold 14px monospace";
  ctx.fillStyle = player.helmet ? "#ffd447" : "#8f9cc5";
  ctx.fillText(`HELMET × ${player.helmet ? 1 : 0}`, 27, 125);
  ctx.fillStyle = player.gloveHits > 0 ? "#ff7b90" : "#8f9cc5";
  ctx.fillText(`GLOVE  × ${player.gloveHits}`, 146, 125);
  ctx.fillStyle = "rgba(18,23,47,.85)";
  ctx.fillRect(W - 292, 13, 278, 80);
  const active = feverTime > 0;
  const warning = active && feverTime < 2;
  ctx.fillStyle = warning && Math.floor(feverTime * 6) % 2 === 0 ? "#fff" : "#ffe974";
  ctx.font = "bold 18px monospace";
  ctx.fillText(active ? `FEVER! あと ${Math.ceil(feverTime)} 秒` : `FEVER  ${feverCharge} / 12`, W - 278, 41);
  ctx.fillStyle = "#344268"; ctx.fillRect(W - 278, 56, 248, 19);
  ctx.fillStyle = active ? "#ffe974" : "#52ddcc";
  ctx.fillRect(W - 278, 56, 248 * (active ? feverTime / RULES.feverDuration : feverCharge / RULES.feverTarget), 19);
  if (combo > 1 && state === "playing") {
    ctx.textAlign = "center";
    ctx.font = "bold 30px monospace";
    ctx.fillStyle = "#173650";
    ctx.fillText(`${combo} 連続！`, W / 2 + 2, 48);
    ctx.fillStyle = "#fff3ae";
    ctx.fillText(`${combo} 連続！`, W / 2, 46);
    ctx.font = "bold 16px monospace";
    ctx.fillText(`得点 ×${combo >= 10 ? 2 : combo >= 5 ? 1.5 : 1}`, W / 2, 70);
    ctx.fillRect(W / 2 - 60, 81, 120 * comboTime / RULES.comboWindow, 4);
    ctx.textAlign = "left";
  }
  if (active && state === "playing") {
    ctx.strokeStyle = warning && Math.floor(feverTime * 6) % 2 === 0 ? "#fff" : "#ffe974";
    ctx.lineWidth = 7; ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.fillStyle = "#173650"; ctx.fillRect(W / 2 - 194, H - 43, 388, 30);
    ctx.fillStyle = "#fff3ae"; ctx.font = "bold 17px monospace";
    ctx.textAlign = "center";
    ctx.fillText("無敵！ 鉄岩もまとめてふっとばせ！", W / 2, H - 22);
    ctx.textAlign = "left";
  }
}

function initAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume().catch(() => {});
  } catch { audio = null; }
}

function tone(freq, duration, type = "square", volume = .045, when = 0) {
  if (!soundOn || !audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, audio.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + when + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(audio.currentTime + when);
  osc.stop(audio.currentTime + when + duration);
}

function soundPunch() { tone(145, .08, "square", .07); tone(90, .12, "square", .045, .04); }
function soundBreak() { [260, 190, 125].forEach((f, i) => tone(f, .11, "square", .055, i * .045)); }
function soundCrash() { [170, 110, 65].forEach((f, i) => tone(f, .28, "sawtooth", .08, i * .12)); }
function soundDamage(damage) {
  const base = damage >= 100 ? 95 : damage >= 50 ? 125 : 165;
  tone(base, .18, "sawtooth", .06);
  tone(base * 0.7, .2, "square", .04, .06);
}
function soundMetalCrash() {
  [920, 1380, 690, 1120].forEach((f, i) => tone(f, .3, "square", .055, i * .045));
  tone(180, .42, "sawtooth", .035);
}
function soundItemGet() {
  [392, 523, 659].forEach((f, i) => tone(f, .16, "square", .045, i * .07));
}
function soundHeal() {
  [330, 440, 554, 659].forEach((f, i) => tone(f, .18, "triangle", .055, i * .065));
}
function soundHelmetBreak() {
  [520, 390, 260].forEach((f, i) => tone(f, .18, "square", .06, i * .05));
}
function soundIronBreak() {
  [1200, 860, 620, 340].forEach((f, i) => tone(f, .22, "square", .06, i * .045));
  tone(150, .32, "sawtooth", .04);
}

function startBgm() {
  stopBgm();
  if (!soundOn) return;
  const notes = [262, 330, 392, 330, 294, 349, 440, 349, 262, 330, 392, 523, 440, 392, 330, 294];
  let index = 0;
  const play = () => {
    if (state !== "playing" || !soundOn) return;
    tone(notes[index % notes.length] * (feverTime > 0 ? 1.5 : 1), .14, "square", .025);
    if (index % 2 === 0) tone(notes[index % notes.length] / 2, .18, "triangle", .025);
    index += 1;
  };
  play();
  bgmTimer = setInterval(play, 180);
}

function stopBgm() {
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
}

ui.startButton.addEventListener("click", startGame);
ui.retryButton.addEventListener("click", startGame);

window.addEventListener("keydown", event => {
  if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "ArrowLeft") keys.left = true;
  if (event.code === "ArrowRight") keys.right = true;
  if (event.code === "Space") { keys.punch = true; if (!event.repeat) punch(); }
  if (event.code === "Enter" && state === "gameover") startGame();
});

window.addEventListener("keyup", event => {
  if (event.code === "ArrowLeft") keys.left = false;
  if (event.code === "ArrowRight") keys.right = false;
  if (event.code === "Space") keys.punch = false;
});

window.addEventListener("blur", () => { keys.left = keys.right = keys.punch = false; });

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, .033);
  lastTime = time;
  if (hitStop > 0) hitStop = Math.max(0, hitStop - dt);
  else update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
