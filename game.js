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
const keys = { left: false, right: false };
let state = "title";
let rocks = [];
let items = [];
let particles = [];
let scorePopups = [];
let score = 0;
let elapsed = 0;
let spawnTimer = 0;
let itemSpawnTimer = 0;
let lastTime = 0;
let shake = 0;
let soundOn = true;
let audio = null;
let bgmTimer = null;

const player = {
  x: 450, y: GROUND_Y - 78, w: 54, h: 78,
  speed: 310, facing: 1, punchTime: 0, punchCooldown: 0, defeated: false,
  helmet: false, gloveHits: 0,
};

function resetGame() {
  rocks = [];
  items = [];
  particles = [];
  scorePopups = [];
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
  let high = Number(localStorage.getItem("kochanRockPanicHigh") || 0);
  if (final > high) {
    high = final;
    localStorage.setItem("kochanRockPanicHigh", String(high));
  }
  ui.finalScore.textContent = String(final).padStart(5, "0");
  ui.highScore.textContent = String(high).padStart(5, "0");
  setTimeout(() => ui.gameOverPanel.classList.remove("hidden"), 650);
}

function punch() {
  if (state !== "playing" || player.punchCooldown > 0 || player.defeated) return;
  player.punchTime = 0.16;
  player.punchCooldown = 0.34;
  soundPunch();
}

function spawnRock() {
  const difficulty = Math.min(elapsed / 75, 1);
  const ironChance = 0.12 + difficulty * 0.11;
  const iron = Math.random() < ironChance;
  const size = iron ? 36 + Math.random() * 27 : 26 + Math.random() * 48;
  rocks.push({
    x: 18 + Math.random() * (W - size - 36),
    y: -size - 10,
    size,
    speed: 125 + Math.random() * 85 + difficulty * 190,
    iron,
    spin: Math.random() * Math.PI * 2,
    spinSpeed: (Math.random() - 0.5) * 2.5,
  });
}

function spawnItem() {
  const type = Math.random() < 0.5 ? "helmet" : "glove";
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
    x: player.x - 36,
    y: player.y - 30,
    w: player.w + 72,
    h: player.h + 66,
  };
  let nearestIndex = -1;
  let nearestDistance = Infinity;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
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
  if (item.type === "helmet") player.helmet = true;
  else player.gloveHits = 3;
  makeDebris(item.x + item.size / 2, item.y + item.size / 2, item.type === "helmet" ? "#ffd447" : "#ed3d59");
  items.splice(nearestIndex, 1);
  soundItemGet();
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

function update(dt) {
  if (shake > 0) shake = Math.max(0, shake - dt * 45);
  if (state !== "playing") {
    updateParticles(dt);
    return;
  }

  elapsed += dt;
  score += dt * 10;
  player.punchTime = Math.max(0, player.punchTime - dt);
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);

  let direction = 0;
  if (keys.left) direction -= 1;
  if (keys.right) direction += 1;
  if (direction !== 0) {
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

  const body = { x: player.x + 8, y: player.y + 5, w: player.w - 16, h: player.h - 5 };
  const punchBoxes = getPunchBoxes();

  for (let i = rocks.length - 1; i >= 0; i -= 1) {
    const rock = rocks[i];
    rock.y += rock.speed * dt;
    rock.spin += rock.spinSpeed * dt;
    const hitbox = { x: rock.x + 5, y: rock.y + 5, w: rock.size - 10, h: rock.size - 10 };

    if (player.punchTime > 0 && punchBoxes.some(box => overlaps(box, hitbox))) {
      if (rock.iron) {
        if (player.gloveHits > 0) {
          player.gloveHits -= 1;
          makeDebris(rock.x + rock.size / 2, rock.y + rock.size / 2, "#8d9aaa");
          addScorePopup(rock.x + rock.size / 2, rock.y, 100);
          rocks.splice(i, 1);
          score += 100;
          soundIronBreak();
          continue;
        }
        if (absorbRockHit(rock)) {
          rocks.splice(i, 1);
          continue;
        }
        gameOver(true);
        return;
      }
      makeDebris(rock.x + rock.size / 2, rock.y + rock.size / 2, "#8e684b");
      addScorePopup(rock.x + rock.size / 2, rock.y, 75);
      rocks.splice(i, 1);
      score += 75;
      soundBreak();
      continue;
    }

    if (overlaps(body, hitbox)) {
      if (absorbRockHit(rock)) {
        rocks.splice(i, 1);
        continue;
      }
      gameOver(rock.iron);
      return;
    }
    if (rock.y > H + rock.size) rocks.splice(i, 1);
  }
  updateParticles(dt);
  updateScorePopups(dt);
}

function addScorePopup(x, y, points) {
  scorePopups.push({ x, y, points, life: 0.9 });
}

function getPunchBoxes() {
  const overheadBox = {
    x: player.facing > 0 ? player.x + 40 : player.x - 4,
    y: player.y - 38,
    w: 18,
    h: 92,
  };
  return [overheadBox];
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

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
  drawBackground();
  rocks.forEach(drawRock);
  items.forEach(drawItem);
  particles.forEach(p => { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); });
  drawScorePopups();
  drawPlayer();
  drawHud();
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
  sky.addColorStop(0, "#4b7ec9");
  sky.addColorStop(1, "#80b8df");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  ctx.fillStyle = "rgba(255,255,255,.75)";
  [[80,90],[620,60],[780,160]].forEach(([x,y], index) => {
    const s = index === 1 ? 1.25 : 1;
    ctx.fillRect(x, y + 16*s, 92*s, 22*s);
    ctx.fillRect(x + 20*s, y, 48*s, 25*s);
  });

  ctx.fillStyle = "#477b6d";
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
  ctx.save();
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  if (player.defeated) {
    ctx.translate(x + 10, GROUND_Y - 15);
    ctx.rotate(-Math.PI / 2);
    drawKochan(0, -player.h + 10, 1);
  } else {
    drawKochan(x, y, player.facing);
  }
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
  if (player.punchTime > 0) {
    const shoulderX = facing > 0 ? x + 43 : x + 1;
    const fistX = facing > 0 ? x + 39 : x - 3;
    ctx.fillRect(shoulderX, y + 6, 10, 50);
    ctx.fillStyle = player.gloveHits > 0 ? "#ed3d59" : "#f0ba91";
    ctx.fillRect(fistX, y - 8, 18, 16);
    if (player.gloveHits > 0) {
      ctx.fillStyle = "#9c1735";
      ctx.fillRect(fistX + 3, y + 5, 12, 5);
    }
  } else {
    ctx.fillRect(x + 46, y + 52, 8, 18);
  }
  ctx.fillStyle = "#e4bc32";
  ctx.fillRect(x + 10, y + 67, 34, 9);
  ctx.fillStyle = "#f0ba91";
  ctx.fillRect(x + 13, y + 76, 10, 12);
  ctx.fillRect(x + 34, y + 76, 10, 12);
  ctx.fillStyle = "#923267";
  ctx.fillRect(x + 6, y + 86, 19, 7);
  ctx.fillRect(x + 32, y + 86, 19, 7);
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
  } else {
    ctx.fillStyle = "#ed3d59";
    ctx.fillRect(x + 10, y + 2, 18, 20);
    ctx.fillRect(x + 5, y + 8, 28, 18);
    ctx.fillStyle = "#9c1735";
    ctx.fillRect(x + 12, y + 25, 15, 10);
    ctx.fillStyle = "#ff8a9b";
    ctx.fillRect(x + 9, y + 7, 8, 6);
  }
  if (isItemNearby(item)) {
    ctx.fillStyle = "#12172f";
    ctx.fillRect(x - 10, y - 27, s + 20, 19);
    ctx.fillStyle = "#fff4c7";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText("SHIFT", x + s / 2, y - 13);
  }
  ctx.restore();
}

function isItemNearby(item) {
  return overlaps(
    { x: player.x - 36, y: player.y - 30, w: player.w + 72, h: player.h + 66 },
    { x: item.x, y: item.y, w: item.size, h: item.size },
  );
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
  ctx.fillRect(14, 13, 245, 94);
  ctx.fillStyle = "#fff4c7";
  ctx.font = "bold 22px monospace";
  ctx.fillText("SCORE " + String(Math.floor(score)).padStart(5, "0"), 27, 40);
  ctx.fillStyle = "#ffd447";
  ctx.font = "bold 16px monospace";
  ctx.fillText("こーちゃん", 27, 63);
  ctx.font = "bold 14px monospace";
  ctx.fillStyle = player.helmet ? "#ffd447" : "#8f9cc5";
  ctx.fillText(`HELMET × ${player.helmet ? 1 : 0}`, 27, 84);
  ctx.fillStyle = player.gloveHits > 0 ? "#ff7b90" : "#8f9cc5";
  ctx.fillText(`GLOVE  × ${player.gloveHits}`, 136, 84);
  if (state === "playing" && elapsed < 7) {
    ctx.fillStyle = "rgba(18,23,47,.72)";
    ctx.fillRect(W - 257, 14, 243, 43);
    ctx.fillStyle = "#eef6ff";
    ctx.font = "bold 15px monospace";
    ctx.fillText("SHIFTでアイテムをゲット！", W - 247, 41);
  }
}

function initAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
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
function soundMetalCrash() {
  [920, 1380, 690, 1120].forEach((f, i) => tone(f, .3, "square", .055, i * .045));
  tone(180, .42, "sawtooth", .035);
}
function soundItemGet() {
  [392, 523, 659].forEach((f, i) => tone(f, .16, "square", .045, i * .07));
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
    tone(notes[index % notes.length], .14, "square", .025);
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
  if (["ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"].includes(event.code)) event.preventDefault();
  if (event.code === "ArrowLeft") keys.left = true;
  if (event.code === "ArrowRight") keys.right = true;
  if (event.code === "Space" && !event.repeat) punch();
  if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) getItem();
  if (event.code === "Enter" && state === "gameover") startGame();
});

window.addEventListener("keyup", event => {
  if (event.code === "ArrowLeft") keys.left = false;
  if (event.code === "ArrowRight") keys.right = false;
});

window.addEventListener("blur", () => { keys.left = false; keys.right = false; });

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, .033);
  lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
