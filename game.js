const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayText = document.querySelector("#overlayText");
const startButton = document.querySelector("#startButton");
const upgradeOptions = document.querySelector("#upgradeOptions");
const gameTitle = document.querySelector("#gameTitle");

ctx.imageSmoothingEnabled = false;

const W = canvas.width;
const H = canvas.height;
const GROUND_Y = 294;
const MP_REGEN = 9;
const MP_COST_R = 28;
const MP_COST_F = 20;
const SP_COST_V = 100;
const HERO_DRAW_SCALE = .78;
const ENEMY_DRAW_SCALE = .6;
const BOSS_DRAW_SCALE = .72;
const HEALTH_DROP_HEAL = 24;
const ENEMY_CELL_W = 192;
const ENEMY_CELL_H = 160;
const keys = new Set();
const pressed = new Set();
const cursor = { x: 360, y: GROUND_Y, worldX: 360 };
const rnd = (min, max) => Math.random() * (max - min) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

const heroAtlas = loadImage("assets/hires-pixel-sprites.png");
const hudFrame = loadImage("assets/ui/hud-bars.png");
const skillEffects = loadImage("assets/effects/skill-upgrades.png");
const healthPotionImage = loadImage("assets/items/health-potion.png");

const HAZARD_SPRITES = {
  web: loadImage("assets/effects/hazards/web.png"),
  bone: loadImage("assets/effects/hazards/bone.png"),
  boneLine: loadImage("assets/effects/hazards/boneLine.png"),
  gust: loadImage("assets/effects/hazards/gust.png"),
  tornado: loadImage("assets/effects/hazards/tornado.png"),
  flame: loadImage("assets/effects/hazards/flame.png"),
  meteor: loadImage("assets/effects/hazards/meteor.png"),
  shock: loadImage("assets/effects/hazards/shock.png"),
  dive: loadImage("assets/effects/hazards/dive.png"),
};

const HERO_FX_SPRITES = {
  basic: loadImage("assets/effects/hero/basic-slash.png"),
  basicHit: loadImage("assets/effects/hero/basic-hit.png"),
  basicTrailJade: loadImage("assets/effects/hero/basic-trail-jade.png"),
  staffCharge: loadImage("assets/effects/hero/staff-charge.png"),
  staff: loadImage("assets/effects/hero/staff-strike.png"),
  staffWave: loadImage("assets/effects/hero/staff-wave.png"),
  goldArray: loadImage("assets/effects/hero/gold-array.png"),
  enemyHit: loadImage("assets/effects/hero/enemy-hit.png"),
  hit: loadImage("assets/effects/hero/clone-hit.png"),
};

const HERO_SPRITES = {
  idle:    [40, 107, 173, 251],
  run1:    [272, 134, 258, 202],
  run2:    [546, 135, 238, 209],
  jump:    [789, 61, 203, 243],
  attack:  [1002, 151, 487, 207],
  hurt:    [25, 437, 191, 225],
  crouch:  [237, 471, 246, 191],
  special: [521, 399, 247, 265],
  spin:    [791, 415, 307, 220],
};

const LEVELS = [
  {
    name: "盤絲洞",
    title: "蛛網月洞",
    width: 1880,
    bg: "assets/levels/01-pansi-cave.png",
    atlas: "assets/enemies/01-pansi-enemies.png",
    colors: { main: "#9b6cff", accent: "#ff4f78", hazard: "#d9f7ff" },
    mobs: [
      { name: "網蛛", row: 0, hp: 3, speed: 52, damage: 8, reach: 32, pattern: "leap", scale: .76, sp: 12 },
      { name: "毒蛛", row: 1, hp: 4, speed: 44, damage: 9, reach: 40, pattern: "web", scale: .88, sp: 18 },
    ],
    boss: { name: "盤絲蛛后", hp: 96, speed: 34, damage: 14, patterns: ["web", "leap", "summon"], scale: 1.55 },
  },
  {
    name: "白骨嶺",
    title: "冷骨荒月",
    width: 1980,
    bg: "assets/levels/02-bone-ridge.png",
    atlas: "assets/enemies/02-bone-enemies.png",
    colors: { main: "#d8dac6", accent: "#9ae5ff", hazard: "#f6e7b7" },
    mobs: [
      { name: "白骨卒", row: 0, hp: 4, speed: 48, damage: 9, reach: 34, pattern: "bone", scale: .78, sp: 12 },
      { name: "幽骨將", row: 1, hp: 6, speed: 40, damage: 11, reach: 48, pattern: "boneLine", scale: .92, sp: 18 },
    ],
    boss: { name: "白骨夫人", hp: 118, speed: 35, damage: 16, patterns: ["boneLine", "bone", "summon"], scale: 1.6 },
  },
  {
    name: "黃風嶺",
    title: "沙暴妖關",
    width: 2060,
    bg: "assets/levels/03-yellow-wind.png",
    atlas: "assets/enemies/03-yellow-wind-enemies.png",
    colors: { main: "#d19c3d", accent: "#76d7b4", hazard: "#f5c04a" },
    mobs: [
      { name: "風沙精", row: 0, hp: 4, speed: 58, damage: 8, reach: 35, pattern: "gust", scale: .78, sp: 12 },
      { name: "旋風怪", row: 1, hp: 6, speed: 48, damage: 10, reach: 42, pattern: "tornado", scale: .95, sp: 18 },
    ],
    boss: { name: "黃風大王", hp: 134, speed: 38, damage: 17, patterns: ["gust", "tornado", "charge"], scale: 1.55 },
  },
  {
    name: "火焰山",
    title: "熔岩古寺",
    width: 2140,
    bg: "assets/levels/04-flaming-mountain.png",
    atlas: "assets/enemies/04-fire-enemies.png",
    colors: { main: "#d84a36", accent: "#ff8b2f", hazard: "#ff5c26" },
    mobs: [
      { name: "火蜥", row: 0, hp: 5, speed: 54, damage: 10, reach: 38, pattern: "flame", scale: .82, sp: 12 },
      { name: "牛火卒", row: 1, hp: 7, speed: 46, damage: 13, reach: 48, pattern: "charge", scale: 1.0, sp: 18 },
    ],
    boss: { name: "鐵扇牛魔", hp: 154, speed: 40, damage: 19, patterns: ["flame", "charge", "meteor"], scale: 1.62 },
  },
  {
    name: "獅駝嶺",
    title: "妖王鐵城",
    width: 2220,
    bg: "assets/levels/05-lion-camel-ridge.png",
    atlas: "assets/enemies/05-lion-enemies.png",
    colors: { main: "#586068", accent: "#76d7b4", hazard: "#f5c04a" },
    mobs: [
      { name: "獅衛", row: 0, hp: 6, speed: 52, damage: 12, reach: 40, pattern: "shock", scale: .86, sp: 12 },
      { name: "鷲妖", row: 1, hp: 8, speed: 58, damage: 14, reach: 44, pattern: "dive", scale: .98, sp: 18 },
    ],
    boss: { name: "獅駝王", hp: 180, speed: 42, damage: 22, patterns: ["shock", "dive", "summon"], scale: 1.68 },
  },
];

LEVELS.forEach((level) => {
  level.bgImage = loadImage(level.bg);
  level.enemyAtlas = loadImage(level.atlas);
});

const SKILL_DEFS = {
  basic: {
    key: "普攻",
    title: "旋棍連擊",
    desc: "增加普攻傷害、範圍與斬擊層數；四級變雙重弧斬。",
  },
  staff: {
    key: "R",
    title: "金箍棒",
    desc: "增加棒長、傷害與破甲；四級追加地裂衝擊波。",
  },
  dodge: {
    key: "F",
    title: "筋斗閃",
    desc: "降低冷卻，增加距離與無敵；三級後殘影成為攻擊。",
  },
  special: {
    key: "V",
    title: "分身絕招",
    desc: "增加分身數、段數與 BOSS 傷害；四級展開全屏金陣。",
  },
};

const state = {
  running: false,
  devMode: false,
  mode: "title",
  time: 0,
  score: 0,
  levelIndex: 0,
  waveIndex: 0,
  waveQuota: 0,
  waveSpawned: 0,
  waveKills: 0,
  spawnTimer: 0,
  bossActive: false,
  bossSpawned: false,
  levelClearTimer: 0,
  cameraX: 0,
  shake: 0,
  hitStop: 0,
  damageFlash: 0,
  enemies: [],
  hazards: [],
  items: [],
  particles: [],
  slashes: [],
  afterimages: [],
  clones: [],
  banner: { text: "", sub: "", life: 0, maxLife: 1 },
  notice: { text: "", life: 0 },
  resourceFlash: { mp: 0, sp: 0 },
  skills: { basic: 0, staff: 0, dodge: 0, special: 0 },
  mobileAxisX: 0,
};

const hero = {
  x: 126,
  y: GROUND_Y,
  vx: 0,
  vy: 0,
  w: 26,
  h: 64,
  hp: 100,
  maxHp: 100,
  mp: 100,
  maxMp: 100,
  sp: 0,
  maxSp: 100,
  facing: 1,
  grounded: true,
  action: "idle",
  actionTime: 0,
  actionDuration: 0,
  basicCd: 0,
  basicCdMax: 0.24,
  staffCd: 0,
  staffCdMax: 0.82,
  attackHit: false,
  dodgeCooldown: 0,
  dodgeCooldownMax: 0.9,
  invuln: 0,
  hurtTime: 0,
  anim: 0,
};

function currentLevel() {
  return LEVELS[state.levelIndex];
}

function currentDifficulty() {
  return 1 + state.levelIndex * .18 + state.waveIndex * .08;
}

function currentWorldWidth() {
  return currentLevel().width;
}

function updateTitle() {
  const level = currentLevel();
  gameTitle.textContent = `${level.name} · ${level.title}`;
}

function showOverlay(title, text, buttonText = "START") {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startButton.textContent = buttonText;
  startButton.classList.remove("hidden");
  upgradeOptions.classList.add("hidden");
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function resetGame() {
  Object.assign(state, {
    running: true,
    mode: "playing",
    time: 0,
    score: 0,
    levelIndex: 0,
    waveIndex: 0,
    cameraX: 0,
    shake: 0,
    hitStop: 0,
    damageFlash: 0,
    enemies: [],
    hazards: [],
    items: [],
    particles: [],
    slashes: [],
    afterimages: [],
    clones: [],
    resourceFlash: { mp: 0, sp: 0 },
    skills: { basic: 0, staff: 0, dodge: 0, special: 0 },
  });
  resetHero(true);
  setupLevel(0);
  hideOverlay();
  document.body.classList.add("in-game");
}

function resetHero(fullReset = false) {
  Object.assign(hero, {
    x: 126,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    hp: fullReset ? hero.maxHp : clamp(hero.hp + 35, 1, hero.maxHp),
    mp: hero.maxMp,
    sp: fullReset ? 0 : clamp(hero.sp, 0, hero.maxSp),
    facing: 1,
    grounded: true,
    action: "idle",
    actionTime: 0,
    actionDuration: 0,
    basicCd: 0,
    staffCd: 0,
    attackHit: false,
    dodgeCooldown: 0,
    invuln: 0,
    hurtTime: 0,
    anim: 0,
  });
}

function setupLevel(index) {
  state.levelIndex = index;
  state.waveIndex = 0;
  state.cameraX = 0;
  state.bossActive = false;
  state.bossSpawned = false;
  state.levelClearTimer = 0;
  state.enemies = [];
  state.hazards = [];
  state.items = [];
  state.slashes = [];
  state.clones = [];
  state.afterimages = [];
  state.particles = [];
  resetHero(index === 0);
  beginWave(0);
  updateTitle();
}

function beginWave(index) {
  const level = currentLevel();
  state.waveIndex = index;
  state.waveQuota = 5 + state.levelIndex * 2 + index * 2;
  state.waveSpawned = 0;
  state.waveKills = 0;
  state.spawnTimer = .65;
  state.bossActive = false;
  state.bossSpawned = false;
  showBanner(`${level.name} 第 ${index + 1} 波`, `${state.waveQuota} 隻妖怪`);
}

function showBanner(text, sub = "", life = 2.0) {
  state.banner = { text, sub, life, maxLife: life };
}

function showNotice(text, life = 1.05) {
  state.notice = { text, life };
}

function endGame() {
  state.running = false;
  state.mode = "gameover";
  hero.action = "dead";
  document.body.classList.remove("in-game");
  showOverlay("大聖暫退", `最終分數 ${state.score}，闖到 ${currentLevel().name} 第 ${state.waveIndex + 1} 波。`, "RESTART");
}

function victory() {
  state.running = false;
  state.mode = "victory";
  document.body.classList.remove("in-game");
  showOverlay("五洞平定", `全破完成，最終分數 ${state.score}。四項技能升級保留了你的打法路線。`, "RESTART");
}

function showUpgradeOverlay() {
  state.running = false;
  state.mode = "upgrade";
  document.body.classList.remove("in-game");
  overlayTitle.textContent = `${currentLevel().name} 已破`;
  overlayText.textContent = "選一項技能升級。每項最高四級，可以全部集中投資同一招。";
  startButton.classList.add("hidden");
  upgradeOptions.innerHTML = "";
  Object.keys(SKILL_DEFS).forEach((id, index) => {
    const def = SKILL_DEFS[id];
    const rank = state.skills[id];
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.skill = id;
    button.disabled = rank >= 4;
    button.innerHTML = `<strong>${index + 1}. ${def.key} ${def.title} Lv.${rank} → Lv.${Math.min(4, rank + 1)}</strong><span>${def.desc}</span>`;
    upgradeOptions.append(button);
  });
  upgradeOptions.classList.remove("hidden");
  overlay.classList.remove("hidden");
}

function upgradeSkill(id) {
  if (state.mode !== "upgrade" || !SKILL_DEFS[id] || state.skills[id] >= 4) return;
  state.skills[id] += 1;
  const next = state.levelIndex + 1;
  if (next >= LEVELS.length) {
    victory();
    return;
  }
  state.running = true;
  state.mode = "playing";
  setupLevel(next);
  hideOverlay();
  document.body.classList.add("in-game");
}

function finishBoss() {
  if (state.levelClearTimer > 0) return;
  const isLast = state.levelIndex === LEVELS.length - 1;
  state.bossActive = false;
  state.levelClearTimer = 1.35;
  showBanner(isLast ? "最後妖王伏誅" : `${currentLevel().name} BOSS 擊破`, isLast ? "全破" : "準備升級", 1.35);
}

function setHeroAction(action, duration = 0) {
  if (hero.action !== action) {
    hero.action = action;
    hero.actionTime = 0;
  }
  hero.actionDuration = duration;
}

function spendMp(amount) {
  if (hero.mp < amount) {
    state.resourceFlash.mp = .55;
    showNotice("MP 不足");
    return false;
  }
  hero.mp -= amount;
  return true;
}

function spendSp() {
  if (hero.sp < SP_COST_V) {
    state.resourceFlash.sp = .55;
    showNotice("SP 未滿");
    return false;
  }
  hero.sp = 0;
  return true;
}

function grantSp(amount) {
  hero.sp = clamp(hero.sp + amount, 0, hero.maxSp);
}

function updateCursor(event) {
  const rect = canvas.getBoundingClientRect();
  cursor.x = clamp((event.clientX - rect.left) * W / rect.width, 0, W);
  cursor.y = clamp((event.clientY - rect.top) * H / rect.height, 0, H);
  cursor.worldX = clamp(cursor.x + state.cameraX, 0, currentWorldWidth());
}

function faceCursor() {
  hero.facing = cursor.worldX < hero.x ? -1 : 1;
}

function actionLocked() {
  return hero.action === "basic" || hero.action === "staffSkill" || hero.action === "special" || hero.action === "hurt" || hero.action === "dodge";
}

function canStartAction() {
  return state.running && hero.action !== "hurt" && hero.action !== "dodge" && hero.action !== "dead";
}

function heroBasicAttack() {
  if (!canStartAction() || hero.basicCd > 0) return;
  const rank = state.skills.basic;
  setHeroAction("basic", .28 + rank * .015);
  hero.actionTime = 0;
  hero.basicCd = Math.max(.15, .24 - rank * .018);
  hero.basicCdMax = hero.basicCd;
  hero.attackHit = false;
  hero.vx *= .45;
  addSlash(hero.x + hero.facing * (42 + rank * 4), hero.y - 34, hero.facing, "basic", rank);
}

function heroStaffSkill() {
  if (!canStartAction() || hero.staffCd > 0 || !spendMp(MP_COST_R)) return;
  const rank = state.skills.staff;
  setHeroAction("staffSkill", .52 + rank * .035);
  hero.actionTime = 0;
  hero.staffCd = Math.max(.5, .82 - rank * .06);
  hero.staffCdMax = hero.staffCd;
  hero.attackHit = false;
  hero.vx *= .15;
  addSlash(hero.x + hero.facing * 42, hero.y - 42, hero.facing, "staffCharge", rank);
  burst(hero.x + hero.facing * 22, hero.y - 44, 10 + rank * 2, "#f5c04a", 55 + rank * 12);
}

function heroDodge() {
  if (!state.running || hero.dodgeCooldown > 0 || hero.action === "hurt" || hero.action === "dead" || !spendMp(MP_COST_F)) return;
  const rank = state.skills.dodge;
  setHeroAction("dodge", .28 + rank * .02);
  hero.actionTime = 0;
  hero.dodgeCooldown = Math.max(.48, .9 - rank * .1);
  hero.dodgeCooldownMax = hero.dodgeCooldown;
  hero.invuln = .42 + rank * .07;
  hero.vx = hero.facing * (390 + rank * 32);
  hero.x = clamp(hero.x + hero.facing * (24 + rank * 8), 22, currentWorldWidth() - 22);
  state.afterimages.push({ x: hero.x - hero.facing * 28, y: hero.y, facing: hero.facing, life: .32 + rank * .05, action: "dodge", rank });
  if (rank >= 3) damageEnemiesNear(hero.x, hero.y - 28, 48 + rank * 10, .8 + rank * .25, 110);
  burst(hero.x - hero.facing * 16, hero.y - 18, 9 + rank * 2, rank >= 3 ? "#fff3a7" : "#d9f7ff", 70 + rank * 18);
}

function heroSpecial() {
  if (!state.running || hero.action === "hurt" || hero.action === "dodge" || hero.action === "dead" || !spendSp()) return;
  const rank = state.skills.special;
  setHeroAction("special", .72 + rank * .06);
  hero.actionTime = 0;
  hero.invuln = 1 + rank * .08;
  state.shake = .36 + rank * .08;
  state.hitStop = .04;
  const cloneCount = 5 + rank * 2;
  for (let i = 0; i < cloneCount; i++) {
    const offset = (i - (cloneCount - 1) / 2) * (82 - rank * 4);
    state.clones.push({
      x: clamp(hero.x + offset, 70, currentWorldWidth() - 70),
      y: GROUND_Y,
      facing: i % 2 === 0 ? 1 : -1,
      life: .58 + rank * .06,
      delay: i * .04,
      rank,
      fired: false,
    });
  }
  state.enemies.forEach((enemy) => {
    const base = enemy.boss ? 10 + rank * 4 : 7 + rank * 2;
    damageEnemy(enemy, base, 150 + rank * 35);
  });
  for (let i = 0; i < 46 + rank * 14; i++) {
    burst(rnd(state.cameraX + 50, state.cameraX + W - 50), rnd(108, GROUND_Y - 22), 1, i % 2 ? "#f5c04a" : "#76d7b4", 115 + rank * 18);
  }
  if (rank >= 4) addSlash(hero.x, hero.y - 70, 1, "goldArray", rank);
}

function addSlash(x, y, facing, type, rank = 0) {
  const life = type === "staff" ? .55 + rank * .045 : type === "staffCharge" ? .24 : type === "basic" ? .18 + rank * .015 : type === "goldArray" ? .82 : .38;
  state.slashes.push({ x, y, facing, type, rank, life, maxLife: life });
}

function damageEnemiesNear(x, y, radius, amount, knock = 80) {
  state.enemies.forEach((enemy) => {
    if (enemy.action === "dead") return;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    if (Math.hypot(dx, dy) < radius + enemy.w * .5) damageEnemy(enemy, amount, knock);
  });
}

function damageEnemy(enemy, amount, knock = 70) {
  if (enemy.action === "dead") return;
  enemy.hp -= amount;
  enemy.hurtTime = .2;
  enemy.action = enemy.hp <= 0 ? "dead" : "hurt";
  enemy.actionTime = 0;
  enemy.vx = Math.sign(enemy.x - hero.x || 1) * knock;
  state.score += Math.round(35 * amount);
  state.hitStop = Math.max(state.hitStop, .025);
  state.shake = Math.max(state.shake, enemy.boss ? .16 : .08);
  burst(enemy.x, enemy.y - enemy.h * .55, enemy.boss ? 24 : 12, enemy.color || currentLevel().colors.accent, enemy.boss ? 140 : 92);
  if (enemy.hp <= 0) {
    enemy.deadTime = enemy.boss ? 1.1 : .55;
    state.score += Math.round(enemy.maxHp * (enemy.boss ? 60 : 70));
    if (!enemy.boss) {
      grantSp(enemy.spGain);
      maybeDropHealth(enemy);
      if (!state.bossActive) state.waveKills += 1;
    }
    burst(enemy.x, enemy.y - 10, enemy.boss ? 42 : 22, "#f5c04a", enemy.boss ? 180 : 130);
    if (enemy.boss) finishBoss();
  }
}

function hurtHero(fromX, amount = 10, knock = 190) {
  if (hero.invuln > 0 || hero.action === "dead" || state.levelClearTimer > 0) return;
  hero.hp = clamp(hero.hp - amount, 0, hero.maxHp);
  hero.invuln = 1.12;
  hero.hurtTime = .34;
  hero.vx = Math.sign(hero.x - fromX || 1) * knock;
  hero.vy = -120;
  setHeroAction("hurt", .34);
  state.damageFlash = .16;
  state.shake = .22;
  burst(hero.x, hero.y - 28, 14, "#d84a36", 105);
  if (hero.hp <= 0) endGame();
}

function maybeDropHealth(enemy) {
  if (hero.hp >= hero.maxHp) return;
  const baseChance = enemy.row === 1 ? .24 : .16;
  const lowHpBonus = hero.hp <= hero.maxHp * .35 ? .12 : 0;
  const summonedPenalty = enemy.summoned ? -.06 : 0;
  if (Math.random() > baseChance + lowHpBonus + summonedPenalty) return;
  spawnHealthPotion(enemy.x, enemy.y - enemy.h * .55);
}

function spawnHealthPotion(x, y) {
  state.items.push({
    type: "healthPotion",
    x,
    y,
    vx: rnd(-34, 34),
    vy: rnd(-185, -130),
    life: 11,
    maxLife: 11,
    bob: rnd(0, Math.PI * 2),
    picked: false,
  });
}

function updateItems(dt) {
  state.items.forEach((item) => {
    item.life -= dt;
    item.bob += dt * 6;
    item.vy += 620 * dt;
    item.x = clamp(item.x + item.vx * dt, 26, currentWorldWidth() - 26);
    item.y += item.vy * dt;
    if (item.y >= GROUND_Y - 18) {
      item.y = GROUND_Y - 18;
      item.vy *= -.24;
      item.vx *= Math.pow(.12, dt);
      if (Math.abs(item.vy) < 28) item.vy = 0;
    }
    const canHeal = hero.hp < hero.maxHp && hero.action !== "dead";
    if (canHeal && Math.abs(hero.x - item.x) < 30 && Math.abs(hero.y - item.y) < 58) {
      hero.hp = clamp(hero.hp + HEALTH_DROP_HEAL, 0, hero.maxHp);
      item.picked = true;
      showNotice(`HP +${HEALTH_DROP_HEAL}`, .75);
      burst(item.x, item.y - 8, 18, "#76d7b4", 92);
    }
  });
  state.items = state.items.filter((item) => item.life > 0 && !item.picked);
}

function burst(x, y, count, color, speed) {
  for (let i = 0; i < count; i++) {
    const a = rnd(-Math.PI, Math.PI);
    const s = rnd(speed * .25, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - rnd(20, 90),
      size: rnd(1.5, 4.6),
      color,
      life: rnd(.18, .58),
      maxLife: .58,
    });
  }
}

function update(dt) {
  if (!state.running) return;
  if (state.hitStop > 0) {
    state.hitStop = Math.max(0, state.hitStop - dt);
    return;
  }

  state.time += dt;
  state.shake = Math.max(0, state.shake - dt);
  state.damageFlash = Math.max(0, state.damageFlash - dt);
  state.resourceFlash.mp = Math.max(0, state.resourceFlash.mp - dt);
  state.resourceFlash.sp = Math.max(0, state.resourceFlash.sp - dt);
  state.notice.life = Math.max(0, state.notice.life - dt);
  state.banner.life = Math.max(0, state.banner.life - dt);
  hero.basicCd = Math.max(0, hero.basicCd - dt);
  hero.staffCd = Math.max(0, hero.staffCd - dt);
  hero.dodgeCooldown = Math.max(0, hero.dodgeCooldown - dt);
  hero.invuln = Math.max(0, hero.invuln - dt);
  hero.hurtTime = Math.max(0, hero.hurtTime - dt);
  hero.actionTime += dt;
  hero.anim += dt;
  hero.mp = clamp(hero.mp + MP_REGEN * dt, 0, hero.maxMp);

  if (pressed.has("r")) heroStaffSkill();
  if (pressed.has("f")) heroDodge();
  if (pressed.has("v")) heroSpecial();

  updateHero(dt);
  updateWave(dt);
  updateEnemies(dt);
  updateHazards(dt);
  updateItems(dt);
  updateEffects(dt);
  updateCamera(dt);
  pressed.clear();
}

function updateHero(dt) {
  const axisX = clamp(state.mobileAxisX || 0, -1, 1);
  const axisLeftMag = axisX < -0.18 ? Math.min(1, -axisX) : 0;
  const axisRightMag = axisX > 0.18 ? Math.min(1, axisX) : 0;
  const keyLeft = keys.has("a") || keys.has("ArrowLeft");
  const keyRight = keys.has("d") || keys.has("ArrowRight");
  const left = keyLeft || axisLeftMag > 0;
  const right = keyRight || axisRightMag > 0;
  const leftMag = Math.max(keyLeft ? 1 : 0, axisLeftMag);
  const rightMag = Math.max(keyRight ? 1 : 0, axisRightMag);
  const jump = pressed.has("w") || pressed.has("ArrowUp") || pressed.has(" ");
  const locked = actionLocked();

  if (!locked) {
    if (left) {
      hero.vx -= 780 * dt * leftMag;
      hero.facing = -1;
    }
    if (right) {
      hero.vx += 780 * dt * rightMag;
      hero.facing = 1;
    }
    if (!left && !right && hero.grounded) hero.vx *= Math.pow(.0006, dt);
  }

  if (jump && hero.grounded && hero.action !== "hurt") {
    hero.vy = -445;
    hero.grounded = false;
    burst(hero.x, hero.y - 4, 8, "#76d7b4", 62);
  }

  const max = hero.action === "dodge" ? 440 + state.skills.dodge * 34 : 164;
  hero.vx = clamp(hero.vx, -max, max);
  hero.vy += 980 * dt;
  hero.x += hero.vx * dt;
  hero.y += hero.vy * dt;
  hero.x = clamp(hero.x, 22, currentWorldWidth() - 22);

  if (hero.y >= GROUND_Y) {
    hero.y = GROUND_Y;
    hero.vy = 0;
    hero.grounded = true;
  } else {
    hero.grounded = false;
  }

  if (hero.action === "basic" && !hero.attackHit && hero.actionTime > .075) {
    const rank = state.skills.basic;
    hero.attackHit = true;
    const range = 52 + rank * 10;
    const hitX = hero.x + hero.facing * (42 + rank * 5);
    addSlash(hitX, hero.y - 30, hero.facing, "basicHit", rank);
    state.enemies.forEach((enemy) => {
      const inFront = hero.facing > 0 ? enemy.x > hero.x - 10 : enemy.x < hero.x + 10;
      if (inFront && Math.abs(enemy.x - hitX) < range + enemy.w * .35 && Math.abs(enemy.y - hero.y) < 56) {
        damageEnemy(enemy, 1.1 + rank * .62, 86 + rank * 24);
      }
    });
    if (rank >= 4) {
      addSlash(hitX + hero.facing * 22, hero.y - 50, hero.facing, "basicHit", rank);
      damageEnemiesNear(hitX + hero.facing * 24, hero.y - 38, 64, 1.4, 110);
    }
  }

  if (hero.action === "staffSkill" && !hero.attackHit && hero.actionTime > .16) {
    const rank = state.skills.staff;
    hero.attackHit = true;
    const range = 138 + rank * 24;
    const hitX = hero.x + hero.facing * (110 + rank * 12);
    addSlash(hitX, hero.y - 34, hero.facing, "staff", rank);
    state.shake = Math.max(state.shake, .12 + rank * .025);
    state.enemies.forEach((enemy) => {
      const inFront = hero.facing > 0 ? enemy.x > hero.x - 8 : enemy.x < hero.x + 8;
      if (inFront && Math.abs(enemy.x - hitX) < range + enemy.w * .3 && Math.abs(enemy.y - hero.y) < 66) {
        damageEnemy(enemy, 4 + rank * 1.15, 230 + rank * 38);
      }
    });
    if (rank >= 4) {
      addSlash(hero.x + hero.facing * 190, hero.y - 8, hero.facing, "staffWave", rank);
      state.enemies.forEach((enemy) => {
        const inFront = hero.facing > 0 ? enemy.x > hero.x : enemy.x < hero.x;
        if (inFront && Math.abs(enemy.y - hero.y) < 70 && Math.abs(enemy.x - hero.x) < 360) damageEnemy(enemy, 2.7, 190);
      });
    }
  }

  if (hero.actionDuration && hero.actionTime >= hero.actionDuration) setHeroAction("idle");

  if (!["basic", "staffSkill", "dodge", "special", "hurt", "dead"].includes(hero.action)) {
    if (!hero.grounded) setHeroAction(hero.vy < 0 ? "jump" : "fall");
    else if (Math.abs(hero.vx) > 24) setHeroAction("run");
    else setHeroAction("idle");
  }
}

function updateWave(dt) {
  if (state.bossActive || state.levelClearTimer > 0) {
    if (state.levelClearTimer > 0) {
      state.levelClearTimer -= dt;
      if (state.levelClearTimer <= 0) {
        if (state.levelIndex === LEVELS.length - 1) victory();
        else showUpgradeOverlay();
      }
    }
    return;
  }

  const activeMinions = state.enemies.filter((enemy) => enemy.action !== "dead" && !enemy.boss).length;
  const maxActive = 4 + Math.floor(state.levelIndex / 2) + Math.floor(state.waveIndex / 2);
  if (state.waveSpawned < state.waveQuota) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && activeMinions < maxActive) {
      spawnEnemy();
      const pace = 1.45 - state.levelIndex * .09 - state.waveIndex * .08;
      state.spawnTimer = Math.max(.48, pace) * rnd(.82, 1.16);
    }
    return;
  }

  if (state.waveKills >= state.waveQuota && activeMinions === 0) {
    if (state.waveIndex < 4) beginWave(state.waveIndex + 1);
    else spawnBoss();
  }
}

function spawnEnemy(options = {}) {
  const level = currentLevel();
  const diff = currentDifficulty();
  const type = options.type || (Math.random() < .67 ? level.mobs[0] : level.mobs[1]);
  const side = options.side || (Math.random() < .5 ? -1 : 1);
  let x = side < 0 ? state.cameraX - 80 : state.cameraX + W + 80;
  if (options.x) x = options.x;
  x = clamp(x, 70, level.width - 70);
  if (Math.abs(x - hero.x) < 130) x = clamp(hero.x + side * 230, 70, level.width - 70);
  const hp = type.hp * diff * (options.summoned ? .72 : 1);
  state.enemies.push({
    x,
    y: GROUND_Y,
    vx: side < 0 ? rnd(12, 22) : -rnd(12, 22),
    w: 50 * type.scale,
    h: 54 * type.scale,
    hp,
    maxHp: hp,
    damage: Math.round(type.damage * diff),
    speed: type.speed * (1 + state.levelIndex * .035),
    reach: type.reach,
    row: type.row,
    pattern: type.pattern,
    scale: type.scale,
    spGain: type.sp,
    color: level.colors.accent,
    boss: false,
    summoned: !!options.summoned,
    facing: side < 0 ? 1 : -1,
    action: "walk",
    actionTime: 0,
    attackRest: rnd(.55, 1.1),
    attackDuration: .48,
    hurtTime: 0,
    deadTime: 0,
    hitOnce: false,
    animSeed: rnd(0, 10),
  });
  if (!options.summoned) state.waveSpawned += 1;
}

function spawnBoss() {
  const level = currentLevel();
  const type = level.boss;
  const diff = 1 + state.levelIndex * .2;
  const x = clamp(hero.x + (hero.x < level.width * .55 ? 390 : -390), 220, level.width - 220);
  state.bossActive = true;
  state.bossSpawned = true;
  state.hazards = [];
  showBanner(`${type.name} 現身`, "BOSS", 2.2);
  state.enemies.push({
    x,
    y: GROUND_Y,
    vx: 0,
    w: 92 * type.scale,
    h: 86 * type.scale,
    hp: type.hp * diff,
    maxHp: type.hp * diff,
    damage: Math.round(type.damage * diff),
    speed: type.speed,
    reach: 58,
    row: 2,
    pattern: type.patterns[0],
    patterns: type.patterns,
    patternIndex: 0,
    scale: type.scale,
    spGain: 0,
    color: level.colors.hazard,
    boss: true,
    facing: x < hero.x ? 1 : -1,
    action: "special",
    actionTime: 0,
    attackRest: 1.1,
    attackDuration: .68,
    hurtTime: 0,
    deadTime: 0,
    hitOnce: false,
    animSeed: rnd(0, 10),
  });
}

function updateEnemies(dt) {
  state.enemies.forEach((enemy) => {
    enemy.actionTime += dt;
    enemy.hurtTime = Math.max(0, enemy.hurtTime - dt);

    if (enemy.action === "dead") {
      enemy.deadTime -= dt;
      enemy.vx *= Math.pow(.03, dt);
      enemy.x += enemy.vx * dt;
      return;
    }

    const dist = hero.x - enemy.x;
    enemy.facing = dist >= 0 ? 1 : -1;
    enemy.attackRest = Math.max(0, enemy.attackRest - dt);

    if (enemy.action === "hurt") {
      enemy.x += enemy.vx * dt;
      enemy.vx *= Math.pow(.05, dt);
      if (enemy.hurtTime <= 0) {
        enemy.action = "walk";
        enemy.actionTime = 0;
      }
      return;
    }

    if (enemy.action === "attack" || enemy.action === "special") {
      if (!enemy.hitOnce && enemy.actionTime > getEnemyWindup(enemy)) {
        enemy.hitOnce = true;
        performEnemyAttack(enemy);
      }
      if (enemy.actionTime > enemy.attackDuration) {
        enemy.action = "walk";
        enemy.actionTime = 0;
        enemy.attackRest = getEnemyRest(enemy);
      }
      return;
    }

    const absDist = Math.abs(dist);
    const wantsRanged = ["web", "bone", "boneLine", "gust", "tornado", "flame", "meteor", "shock", "dive"].includes(enemy.pattern);
    const attackRange = enemy.boss ? 320 : wantsRanged ? 250 : enemy.reach;
    if (absDist < attackRange && Math.abs(hero.y - enemy.y) < 82 && enemy.attackRest <= 0) {
      startEnemyAttack(enemy);
      return;
    }

    enemy.action = "walk";
    enemy.vx += Math.sign(dist) * enemy.speed * 2.8 * dt;
    enemy.vx = clamp(enemy.vx, -enemy.speed, enemy.speed);
    enemy.x = clamp(enemy.x + enemy.vx * dt, 40, currentWorldWidth() - 40);
  });

  state.enemies = state.enemies.filter((enemy) => enemy.deadTime > 0 || enemy.action !== "dead");
}

function startEnemyAttack(enemy) {
  if (enemy.boss) {
    enemy.pattern = enemy.patterns[enemy.patternIndex % enemy.patterns.length];
    enemy.patternIndex += 1;
    enemy.action = enemy.pattern === "summon" || enemy.pattern === "meteor" ? "special" : "attack";
  } else {
    enemy.action = "attack";
  }
  enemy.actionTime = 0;
  enemy.hitOnce = false;
  enemy.vx = 0;
  enemy.attackDuration = enemy.boss ? .78 : enemy.pattern === "charge" || enemy.pattern === "dive" ? .62 : .5;
}

function getEnemyWindup(enemy) {
  if (enemy.boss) return enemy.pattern === "summon" ? .38 : .28;
  if (enemy.pattern === "bone" || enemy.pattern === "flame") return .24;
  return .2;
}

function getEnemyRest(enemy) {
  const base = enemy.boss ? 1.2 : 1.05;
  return Math.max(.54, base - state.levelIndex * .08 - state.waveIndex * .045);
}

function performEnemyAttack(enemy) {
  const f = enemy.facing;
  const damage = enemy.damage;
  if (enemy.pattern === "leap" || enemy.pattern === "charge") {
    enemy.x = clamp(enemy.x + f * (enemy.pattern === "charge" ? 86 : 28), 40, currentWorldWidth() - 40);
    const reach = enemy.pattern === "charge" ? 76 : enemy.reach + 18;
    if (Math.abs(hero.x - enemy.x) < reach && Math.abs(hero.y - enemy.y) < 54) hurtHero(enemy.x, damage, enemy.pattern === "charge" ? 260 : 190);
    addSlash(enemy.x + f * 34, enemy.y - 34, f, "enemyHit", 0);
  } else if (enemy.pattern === "web") {
    addHazard("web", enemy.x + f * 34, enemy.y - 42, f * 190, 0, 34, 18, 1.7, damage, "#d9f7ff");
  } else if (enemy.pattern === "bone") {
    addHazard("bone", hero.x, GROUND_Y - 18, 0, 0, 56, 56, .82, damage, "#f6e7b7", .32);
  } else if (enemy.pattern === "boneLine") {
    for (let i = 0; i < 3; i++) addHazard("boneLine", hero.x + f * i * 52, GROUND_Y - 18, 0, 0, 64, 56, .9, damage, "#f6e7b7", .2 + i * .1);
  } else if (enemy.pattern === "gust") {
    addHazard("gust", enemy.x + f * 42, enemy.y - 42, f * 240, 0, 62, 42, 1.25, damage, "#f5c04a");
  } else if (enemy.pattern === "tornado") {
    addHazard("tornado", enemy.x + f * 70, enemy.y - 60, f * 92, 0, 54, 112, 2.2, damage, "#76d7b4");
  } else if (enemy.pattern === "flame") {
    addHazard("flame", enemy.x + f * 84, GROUND_Y - 30, 0, 0, 136, 44, .52, damage, "#ff5c26");
  } else if (enemy.pattern === "meteor") {
    for (let i = 0; i < 4; i++) addHazard("meteor", clamp(hero.x + rnd(-160, 160), 70, currentWorldWidth() - 70), 90, 0, 185, 42, 42, 1.25, damage, "#ff8b2f", i * .15);
  } else if (enemy.pattern === "shock") {
    addHazard("shock", enemy.x + f * 48, GROUND_Y - 17, f * 210, 0, 56, 30, 1.25, damage, "#f5c04a");
  } else if (enemy.pattern === "dive") {
    addHazard("dive", hero.x, 120, 0, 230, 54, 72, 1.1, damage, "#76d7b4", .18);
  } else if (enemy.pattern === "summon") {
    spawnEnemy({ summoned: true, side: -enemy.facing, x: clamp(enemy.x - enemy.facing * 130, 80, currentWorldWidth() - 80) });
    spawnEnemy({ summoned: true, side: enemy.facing, x: clamp(enemy.x + enemy.facing * 130, 80, currentWorldWidth() - 80) });
    burst(enemy.x, enemy.y - 58, 24, currentLevel().colors.hazard, 130);
  }
}

function addHazard(type, x, y, vx, vy, w, h, life, damage, color, delay = 0) {
  state.hazards.push({ type, x, y, vx, vy, w, h, life, maxLife: life, damage, color, delay, hitOnce: false });
}

function updateHazards(dt) {
  state.hazards.forEach((hazard) => {
    if (hazard.delay > 0) {
      hazard.delay -= dt;
      return;
    }
    hazard.life -= dt;
    hazard.x += hazard.vx * dt;
    hazard.y += hazard.vy * dt;
    if (hazard.type === "meteor" || hazard.type === "dive") hazard.vy += 260 * dt;
    if (!hazard.hitOnce && hazardHitsHero(hazard)) {
      hazard.hitOnce = true;
      hurtHero(hazard.x, hazard.damage, hazard.vx ? Math.sign(hazard.vx) * 230 : 190);
    }
  });
  state.hazards = state.hazards.filter((hazard) => hazard.life > 0 && hazard.x > -80 && hazard.x < currentWorldWidth() + 80 && hazard.y < H + 80);
}

function hazardHitsHero(hazard) {
  if (hero.invuln > 0 || hazard.delay > 0) return false;
  const heroCx = hero.x;
  const heroCy = hero.y - hero.h * .55;
  return Math.abs(heroCx - hazard.x) < hazard.w * .5 + hero.w * .5 && Math.abs(heroCy - hazard.y) < hazard.h * .5 + hero.h * .38;
}

function updateEffects(dt) {
  state.particles.forEach((p) => {
    p.life -= dt;
    p.vy += 280 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  });
  state.particles = state.particles.filter((p) => p.life > 0);

  state.slashes.forEach((s) => s.life -= dt);
  state.slashes = state.slashes.filter((s) => s.life > 0);

  state.afterimages.forEach((a) => a.life -= dt);
  state.afterimages = state.afterimages.filter((a) => a.life > 0);

  state.clones.forEach((c) => {
    c.delay -= dt;
    if (c.delay <= 0 && !c.fired) {
      c.fired = true;
      addSlash(c.x + c.facing * 42, c.y - 28, c.facing, "hit", c.rank);
      damageEnemiesNear(c.x + c.facing * 50, c.y - 36, 64 + c.rank * 8, 1.6 + c.rank * .55, 120);
    }
    if (c.delay <= 0) c.life -= dt;
  });
  state.clones = state.clones.filter((c) => c.life > 0 || c.delay > 0);
}

function updateCamera(dt) {
  const maxCamera = Math.max(0, currentWorldWidth() - W);
  const target = clamp(hero.x - W * .48, 0, maxCamera);
  state.cameraX = lerp(state.cameraX, target, 1 - Math.pow(.001, dt));
  cursor.worldX = clamp(cursor.x + state.cameraX, 0, currentWorldWidth());
}

function px(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function render() {
  ctx.save();
  if (state.shake > 0) ctx.translate(Math.round(rnd(-5, 5) * state.shake * 4), Math.round(rnd(-4, 4) * state.shake * 4));
  drawBackground();
  ctx.save();
  ctx.translate(-Math.round(state.cameraX), 0);
  drawWorld();
  ctx.restore();
  drawHud();
  drawOverlayEffects();
  ctx.restore();
}

function drawBackground() {
  const level = currentLevel();
  const image = level.bgImage;
  if (image.complete && image.naturalWidth) {
    ctx.imageSmoothingEnabled = true;
    const sw = Math.min(image.naturalWidth, image.naturalHeight * W / H);
    const maxSx = Math.max(0, image.naturalWidth - sw);
    const maxCamera = Math.max(1, level.width - W);
    const sx = maxSx * clamp(state.cameraX / maxCamera, 0, 1);
    ctx.drawImage(image, sx, 0, sw, image.naturalHeight, 0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
  } else {
    ctx.fillStyle = "#0c2532";
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = "rgba(4, 9, 13, .16)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(246, 231, 183, .24)";
  ctx.fillRect(0, GROUND_Y + 1, W, 2);
  ctx.fillStyle = "rgba(0, 0, 0, .2)";
  ctx.fillRect(0, GROUND_Y + 6, W, H - GROUND_Y);
}

function drawWorld() {
  drawHazards();
  state.enemies.sort((a, b) => a.y - b.y).forEach(drawEnemy);
  drawItems();
  state.afterimages.forEach((a) => drawHeroSprite(a.x, a.y, a.facing, a.action, hero.anim, a.life * 2.3, a.rank));
  const blink = hero.invuln > 0 && Math.floor(hero.invuln * 18) % 2 === 0;
  drawHeroSprite(hero.x, hero.y, hero.facing, hero.action, hero.actionTime + hero.anim, blink ? .58 : 1, getHeroActionRank());
  state.clones.forEach((c) => {
    if (c.delay > 0) return;
    drawHeroSprite(c.x, c.y, c.facing, "staffSkill", .18, c.life * 1.6, c.rank);
  });
  drawEffects();
}

function getHeroActionRank() {
  if (hero.action === "basic") return state.skills.basic;
  if (hero.action === "staffSkill") return state.skills.staff;
  if (hero.action === "dodge") return state.skills.dodge;
  if (hero.action === "special") return state.skills.special;
  return 0;
}

function drawHeroSprite(x, y, facing, action, time, alpha = 1, rank = 0) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  const spriteFacing = action === "basic" ? -facing : facing;
  ctx.scale(spriteFacing, 1);
  ctx.globalAlpha = alpha;
  const phase = Math.floor(time * 7) % 2;
  let sprite = HERO_SPRITES.idle;
  let dw = 98;
  let dh = 142;
  let dx = -49;
  let dy = -142;
  if (action === "run") {
    sprite = phase ? HERO_SPRITES.run2 : HERO_SPRITES.run1;
    dw = 148;
    dh = 122;
    dx = -74;
    dy = -122 + (phase ? -2 : 0);
  } else if (action === "jump" || action === "fall") {
    sprite = HERO_SPRITES.jump;
    dw = 113;
    dh = 136;
    dx = -56;
    dy = -136;
  } else if (action === "basic") {
    sprite = HERO_SPRITES.spin;
    dw = 156;
    dh = 112;
    dx = -78;
    dy = -112;
  } else if (action === "staffSkill") {
    sprite = HERO_SPRITES.attack;
    dw = 254;
    dh = 108;
    dx = -78;
    dy = -108;
  } else if (action === "hurt") {
    sprite = HERO_SPRITES.hurt;
    dw = 110;
    dh = 130;
    dx = -55;
    dy = -130;
  } else if (action === "dodge") {
    sprite = HERO_SPRITES.run2;
    dw = 127;
    dh = 112;
    dx = -64;
    dy = -112;
    ctx.globalAlpha = alpha * .72;
    px(-52, -52, 110 + rank * 12, 20, rank >= 3 ? "rgba(255, 243, 167, .28)" : "rgba(118, 215, 180, .24)");
  } else if (action === "special") {
    sprite = time % .22 < .11 ? HERO_SPRITES.special : HERO_SPRITES.spin;
    dw = 168;
    dh = 150;
    dx = -84;
    dy = -150;
  } else if (action === "dead") {
    sprite = HERO_SPRITES.crouch;
    dw = 134;
    dh = 104;
    dx = -67;
    dy = -104;
  }
  dw *= HERO_DRAW_SCALE;
  dh *= HERO_DRAW_SCALE;
  dx *= HERO_DRAW_SCALE;
  dy *= HERO_DRAW_SCALE;
  if (heroAtlas.complete && heroAtlas.naturalWidth) {
    ctx.drawImage(heroAtlas, sprite[0], sprite[1], sprite[2], sprite[3], dx, dy, dw, dh);
  } else {
    px(-18, -64, 36, 62, "#b93730");
  }

  if (action === "staffSkill" && time > .12) {
    const p = clamp((time - .12) / .16, 0, 1);
    const ext = rank * 34;
    ctx.globalAlpha = alpha * (1 - clamp((time - .28) / .24, 0, .65));
    px(34, -47, 265 + p * 46 + ext, 18 + rank, "rgba(255, 243, 167, .78)");
    px(34, -41, 292 + p * 54 + ext, 5 + Math.floor(rank / 2), "#f5c04a");
    px(310 + p * 52 + ext, -58, 30 + rank * 4, 38, "rgba(245, 192, 74, .74)");
    px(334 + p * 60 + ext, -50, 18 + rank * 3, 22, "#fff3a7");
  }

  if (action === "special" && rank >= 3) {
    ctx.globalAlpha = alpha * .32;
    ctx.strokeStyle = rank >= 4 ? "#fff3a7" : "#f5c04a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -58, 42 + Math.sin(time * 12) * 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawEnemy(enemy) {
  const level = currentLevel();
  const atlas = level.enemyAtlas;
  const phase = Math.floor((enemy.actionTime + enemy.animSeed) * 8) % 2;
  let col = 0;
  if (enemy.action === "walk") col = phase ? 2 : 1;
  if (enemy.action === "attack") col = 3;
  if (enemy.action === "hurt") col = 4;
  if (enemy.action === "dead") col = 5;
  if (enemy.action === "special") col = 6;
  const sx = col * ENEMY_CELL_W;
  const sy = enemy.row * ENEMY_CELL_H;
  const spriteScale = enemy.boss ? BOSS_DRAW_SCALE : ENEMY_DRAW_SCALE;
  const dw = ENEMY_CELL_W * enemy.scale * spriteScale;
  const dh = ENEMY_CELL_H * enemy.scale * spriteScale;
  const sink = enemy.action === "dead" ? enemy.actionTime * 16 : 0;
  const hurt = enemy.action === "hurt" ? Math.sin(enemy.actionTime * 60) * 3 : 0;
  ctx.save();
  ctx.translate(Math.round(enemy.x + hurt), Math.round(enemy.y + sink));
  ctx.scale(enemy.facing, 1);
  ctx.globalAlpha = enemy.action === "dead" ? clamp(enemy.deadTime / (enemy.boss ? 1.1 : .55), 0, 1) : 1;
  if (atlas.complete && atlas.naturalWidth) {
    ctx.drawImage(atlas, sx, sy, ENEMY_CELL_W, ENEMY_CELL_H, -dw / 2, -dh, dw, dh);
  } else {
    px(-22, -28, 44, 24, level.colors.main);
  }
  ctx.restore();
  drawEnemyHealth(enemy);
}

function drawEnemyHealth(enemy) {
  if (enemy.action === "dead" || enemy.hp >= enemy.maxHp) return;
  const w = enemy.boss ? 138 : 42;
  const h = enemy.boss ? 7 : 4;
  const x = enemy.x - w / 2;
  const y = enemy.y - enemy.h - (enemy.boss ? 86 : 32);
  px(x, y, w, h, "rgba(5, 11, 16, .78)");
  px(x + 1, y + 1, (w - 2) * clamp(enemy.hp / enemy.maxHp, 0, 1), h - 2, enemy.boss ? "#d84a36" : "#f5c04a");
}

function drawHazards() {
  state.hazards.forEach((h) => {
    ctx.save();
    const p = h.delay > 0 ? .25 : clamp(h.life / h.maxLife, 0, 1);
    ctx.globalAlpha = h.delay > 0 ? .38 : clamp(.28 + p, 0, 1);
    ctx.translate(h.x, h.y);
    const _hSprite = HAZARD_SPRITES[h.type];
    if (_hSprite && _hSprite.complete && _hSprite.naturalWidth) {
      const dw = h.w;
      const dh = h.h || h.w * _hSprite.naturalHeight / _hSprite.naturalWidth;
      ctx.drawImage(_hSprite, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      return;
    }
    if (h.type === "spike") {
      ctx.fillStyle = h.delay > 0 ? "rgba(246, 231, 183, .22)" : h.color;
      ctx.beginPath();
      ctx.moveTo(-h.w / 2, h.h / 2);
      ctx.lineTo(0, -h.h / 2);
      ctx.lineTo(h.w / 2, h.h / 2);
      ctx.closePath();
      ctx.fill();
    } else if (h.type === "gust" || h.type === "tornado") {
      ctx.strokeStyle = h.color;
      ctx.lineWidth = h.type === "tornado" ? 7 : 4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, h.w * (.25 + i * .2), -1.2 + i, 1.4 + i);
        ctx.stroke();
      }
    } else if (h.type === "flame" || h.type === "meteor") {
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, h.w / 2, h.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      px(-h.w / 3, -4, h.w * .66, 8, "rgba(255, 236, 160, .7)");
    } else if (h.type === "shock") {
      ctx.strokeStyle = h.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-h.w / 2, 0);
      ctx.quadraticCurveTo(-h.w / 4, -24, 0, 0);
      ctx.quadraticCurveTo(h.w / 4, 24, h.w / 2, 0);
      ctx.stroke();
    } else if (h.type === "dive") {
      ctx.strokeStyle = h.color;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-22, -38);
      ctx.lineTo(0, 38);
      ctx.lineTo(22, -38);
      ctx.stroke();
    } else {
      ctx.strokeStyle = h.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-h.w / 2, 0);
      ctx.lineTo(h.w / 2, 0);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawItems() {
  state.items.forEach((item) => {
    const alpha = clamp(Math.min(item.life, 1), 0, 1);
    const bob = Math.sin(item.bob) * 3;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(item.x), Math.round(item.y + bob));
    ctx.fillStyle = "rgba(0, 0, 0, .32)";
    ctx.beginPath();
    ctx.ellipse(0, 18 - bob, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(118, 215, 180, .48)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -7, 20 + Math.sin(item.bob * 1.4) * 2, 0, Math.PI * 2);
    ctx.stroke();
    if (healthPotionImage.complete && healthPotionImage.naturalWidth) {
      ctx.drawImage(healthPotionImage, -18, -42, 36, 36);
    } else {
      px(-9, -34, 18, 28, "#d84a36");
      px(-5, -24, 10, 4, "#fff3a7");
      px(-2, -28, 4, 12, "#fff3a7");
    }
    ctx.restore();
  });
}

function drawEffects() {
  state.slashes.forEach((s) => {
    const p = 1 - s.life / s.maxLife;
    ctx.save();
    ctx.globalAlpha = clamp(s.life / s.maxLife, 0, 1);
    ctx.translate(s.x, s.y);
    if (s.type === "basic" || s.type === "basicHit") {
      const sprite = s.type === "basicHit" ? HERO_FX_SPRITES.basicHit : HERO_FX_SPRITES.basic;
      const size = 96 + p * 36 + s.rank * 12;
      if (sprite && sprite.complete && sprite.naturalWidth) {
        ctx.save();
        ctx.scale(s.facing, 1);
        ctx.drawImage(sprite, -size * .25, -size * .55, size, size);
        ctx.restore();
        if (s.rank >= 2 && HERO_FX_SPRITES.basicTrailJade.complete && HERO_FX_SPRITES.basicTrailJade.naturalWidth) {
          ctx.save();
          ctx.globalAlpha *= .55;
          ctx.scale(s.facing, 1);
          ctx.drawImage(HERO_FX_SPRITES.basicTrailJade, -size * .15, -size * .35, size * .9, size * .9);
          ctx.restore();
        }
      } else {
        // programmatic fallback while sprites load
        const r = 28 + p * 16 + s.rank * 8;
        const dir = s.facing;
        ctx.strokeStyle = s.type === "basicHit" ? "#fff3a7" : "#f5c04a";
        ctx.lineWidth = s.type === "basicHit" ? 6 + s.rank : 4 + s.rank * .7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-dir * 18, -24);
        ctx.quadraticCurveTo(dir * r, -28 + p * 8, dir * (r + 10), 16);
        ctx.stroke();
        if (s.rank >= 2) {
          ctx.strokeStyle = "rgba(118, 215, 180, .46)";
          ctx.lineWidth = 2 + s.rank;
          ctx.beginPath();
          ctx.moveTo(-dir * 12, -8);
          ctx.quadraticCurveTo(dir * (r - 6), 0, dir * (r + 16), 28);
          ctx.stroke();
        }
      }
    } else if (s.type === "staffCharge" || s.type === "staff") {
      ctx.scale(s.facing, 1);
      const _staffSprite = s.type === "staffCharge" ? HERO_FX_SPRITES.staffCharge : HERO_FX_SPRITES.staff;
      if (_staffSprite && _staffSprite.complete && _staffSprite.naturalWidth) {
        const sizeW = s.type === "staffCharge" ? 80 + s.rank * 14 : 240 + s.rank * 24;
        const sizeH = s.type === "staffCharge" ? 80 + s.rank * 14 : 100 + s.rank * 8;
        const offsetX = s.type === "staffCharge" ? -sizeW * .35 : -sizeW * .15;
        ctx.drawImage(_staffSprite, offsetX, -sizeH / 2 - 4, sizeW, sizeH);
      } else {
        // programmatic fallback while sprite loads
        if (s.type === "staffCharge") {
          px(-18, -18, 36 + s.rank * 7, 36 + s.rank * 7, "rgba(245, 192, 74, .28)");
          px(-10, -10, 20 + s.rank * 4, 20 + s.rank * 4, "rgba(255, 243, 167, .72)");
          px(10 + p * 18, -3, 50 + s.rank * 18, 6, "rgba(245, 192, 74, .65)");
        } else {
          const ext = s.rank * 34;
          px(-112, -6, 240 + ext, 12 + s.rank, "rgba(255, 243, 167, .86)");
          px(-112, -2, 240 + ext, 4 + Math.floor(s.rank / 2), "#f5c04a");
          px(95 + p * 28 + ext, -18, 38 + s.rank * 6, 36, "rgba(245, 192, 74, .76)");
          px(128 + p * 30 + ext, -8, 20 + s.rank * 4, 16, "#fff3a7");
        }
      }
    } else if (s.type === "staffWave") {
      ctx.scale(s.facing, 1);
      if (HERO_FX_SPRITES.staffWave && HERO_FX_SPRITES.staffWave.complete && HERO_FX_SPRITES.staffWave.naturalWidth) {
        const sizeW = 280 + s.rank * 28;
        const sizeH = 110 + s.rank * 10;
        ctx.drawImage(HERO_FX_SPRITES.staffWave, -sizeW * .55, -sizeH / 2, sizeW, sizeH);
      } else {
        // programmatic fallback while sprite loads
        ctx.strokeStyle = "#fff3a7";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(-150 - p * 18, 0);
        ctx.lineTo(150 + p * 90, -10);
        ctx.stroke();
        px(110 + p * 90, -18, 60, 28, "rgba(245, 192, 74, .62)");
      }
    } else if (s.type === "goldArray") {
      if (HERO_FX_SPRITES.goldArray && HERO_FX_SPRITES.goldArray.complete && HERO_FX_SPRITES.goldArray.naturalWidth) {
        const size = 240 + p * 280;
        ctx.drawImage(HERO_FX_SPRITES.goldArray, -size / 2, -size / 2, size, size);
      } else {
        // programmatic fallback while sprite loads
        ctx.strokeStyle = "#fff3a7";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, 88 + p * 240, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 12; i++) {
          const a = Math.PI * 2 * i / 12 + p * 2;
          px(Math.cos(a) * (120 + p * 170), Math.sin(a) * 38, 18, 4, "#f5c04a");
        }
      }
    } else {
      ctx.scale(s.facing, 1);
      const _hitSprite = s.type === "enemyHit" ? HERO_FX_SPRITES.enemyHit : HERO_FX_SPRITES.hit;
      if (_hitSprite && _hitSprite.complete && _hitSprite.naturalWidth) {
        const hitSize = 48 + p * 32 + s.rank * 8;
        ctx.drawImage(_hitSprite, -hitSize / 2, -hitSize / 2, hitSize, hitSize);
      } else {
        // programmatic fallback while sprite loads
        ctx.strokeStyle = s.type === "enemyHit" ? currentLevel().colors.hazard : "#fff3a7";
        ctx.lineWidth = s.type === "enemyHit" ? 4 : 7;
        ctx.beginPath();
        ctx.arc(0, 0, 21 + p * 18 + s.rank * 5, -1.1, .85);
        ctx.stroke();
        px(18 + p * 18, -3, 14 + s.rank * 4, 6, "rgba(255, 243, 167, .72)");
      }
    }
    ctx.restore();
  });

  state.particles.forEach((p) => {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    px(p.x, p.y, p.size, p.size, p.color);
    ctx.globalAlpha = 1;
  });
}

function drawHud() {
  ctx.save();
  drawMeter(44, 15, 118, 9, hero.hp / hero.maxHp, "#d84a36", state.damageFlash);
  drawMeter(44, 38, 118, 9, hero.mp / hero.maxMp, "#4aa0ee", state.resourceFlash.mp);
  drawMeter(498, 15, 118, 9, hero.sp / hero.maxSp, hero.sp >= hero.maxSp ? "#fff3a7" : "#f5c04a", state.resourceFlash.sp);
  if (hudFrame.complete && hudFrame.naturalWidth) ctx.drawImage(hudFrame, 0, 0);

  ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f6e7b7";
  ctx.fillText(`${Math.ceil(hero.hp)}/100`, 74, 19);
  ctx.fillText(`${Math.floor(hero.mp)}/100`, 74, 42);
  ctx.fillText(hero.sp >= 100 ? "V READY" : `${Math.floor(hero.sp)}%`, 534, 19);
  ctx.fillText(`SCORE ${state.score}`, 236, 20);
  const waveText = state.bossActive ? `BOSS · ${currentLevel().boss.name}` : `關 ${state.levelIndex + 1}/5  波 ${state.waveIndex + 1}/5  ${state.waveKills}/${state.waveQuota}`;
  ctx.fillText(waveText, 246, 48);
  drawSkillRanks();
  if (state.notice.life > 0) drawNotice();
  ctx.restore();
}

function drawMeter(x, y, w, h, value, color, flash) {
  px(x, y, w, h, "rgba(5, 11, 16, .78)");
  px(x + 1, y + 1, (w - 2) * clamp(value, 0, 1), h - 2, color);
  if (flash > 0) {
    ctx.strokeStyle = `rgba(216, 74, 54, ${flash * 1.7})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  }
}

function drawSkillRanks() {
  const x = 454;
  const y = 39;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "rgba(246, 231, 183, .85)";
  ctx.fillText(`普${state.skills.basic} R${state.skills.staff} F${state.skills.dodge} V${state.skills.special}`, x, y);
}

function drawNotice() {
  const alpha = clamp(state.notice.life, 0, 1);
  ctx.globalAlpha = alpha;
  ctx.font = "900 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff3a7";
  ctx.fillText(state.notice.text, W / 2, 78);
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

function drawOverlayEffects() {
  if (state.damageFlash > 0) {
    ctx.fillStyle = `rgba(216, 74, 54, ${state.damageFlash * 2.1})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (state.banner.life > 0) {
    const p = state.banner.life / state.banner.maxLife;
    ctx.save();
    ctx.globalAlpha = clamp(Math.min(p * 2.2, 1), 0, 1);
    ctx.fillStyle = "rgba(5, 11, 16, .6)";
    ctx.fillRect(0, 138, W, 78);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f5c04a";
    ctx.font = "900 28px Songti SC, Noto Serif TC, serif";
    ctx.fillText(state.banner.text, W / 2, 170);
    ctx.fillStyle = "rgba(246, 231, 183, .85)";
    ctx.font = "900 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(state.banner.sub, W / 2, 193);
    ctx.restore();
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(.033, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)) event.preventDefault();

  if (state.mode === "upgrade" && ["1", "2", "3", "4"].includes(key)) {
    const id = Object.keys(SKILL_DEFS)[Number(key) - 1];
    upgradeSkill(id);
    return;
  }

  if (state.devMode && key === "q" && state.running) {
    hero.hp = hero.maxHp;
    hero.sp = hero.maxSp;
    hero.mp = hero.maxMp;
    return;
  }

  if (state.devMode && state.running && ["1", "2", "3", "4", "5"].includes(key)) {
    const target = Number(key) - 1;
    if (target >= 0 && target < LEVELS.length) {
      setupLevel(target);
      showNotice(`DEV · 跳到 ${LEVELS[target].name}`);
    }
    return;
  }

  if (state.devMode && key === "b" && state.running && !state.bossSpawned) {
    state.enemies = [];
    state.hazards = [];
    state.waveIndex = 4;
    state.waveQuota = 0;
    state.waveSpawned = 0;
    state.waveKills = 0;
    spawnBoss();
    showNotice(`DEV · 直接 BOSS · ${currentLevel().boss.name}`);
    return;
  }

  if (!keys.has(key)) pressed.add(key);
  keys.add(key);
  if (!state.running && (key === "r" || key === "enter")) resetGame();
});

window.addEventListener("keyup", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.delete(key);
});

canvas.addEventListener("pointermove", updateCursor);

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") {
    if (!state.running && state.mode !== "upgrade") resetGame();
    return;
  }
  updateCursor(event);
  if (!state.running && state.mode !== "upgrade") {
    resetGame();
  } else if (state.running) {
    faceCursor();
    heroBasicAttack();
  }
});

startButton.addEventListener("click", resetGame);

const DEV_PASSWORD = "wukong";
const devBtn = document.querySelector("#devBtn");
if (devBtn) {
  devBtn.addEventListener("click", () => {
    if (state.devMode) {
      state.devMode = false;
      devBtn.classList.remove("active");
      devBtn.textContent = "DEV";
      return;
    }
    const input = window.prompt("輸入 DEV 密碼");
    if (input == null) return;
    if (input === DEV_PASSWORD) {
      state.devMode = true;
      devBtn.classList.add("active");
      devBtn.textContent = "DEV ON · Q回血 · 1-5跳關 · B跳BOSS";
    } else {
      window.alert("密碼錯誤");
    }
  });
}
upgradeOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-skill]");
  if (button) upgradeSkill(button.dataset.skill);
});

updateTitle();
showOverlay("五洞開戰", "五個妖洞，每關五波怪，清完召出 BOSS。R/F 消耗 MP，V 消耗滿格 SP，過關後選一項技能升級。", "START");
requestAnimationFrame(loop);

window.heroBasicAttack = heroBasicAttack;
window.heroStaffSkill = heroStaffSkill;
window.heroDodge = heroDodge;
window.heroSpecial = heroSpecial;
window.heroJump = function heroJumpExternal() {
  if (!state.running) return;
  if (hero.action === "hurt" || hero.action === "dead") return;
  pressed.add(" ");
  keys.add(" ");
};
window.heroJumpRelease = function heroJumpReleaseExternal() {
  keys.delete(" ");
};
window.setMobileAxisX = function setMobileAxisX(value) {
  state.mobileAxisX = clamp(Number(value) || 0, -1, 1);
};
window.heroState = function heroStateSnapshot() {
  const basicMax = hero.basicCdMax || 0.24;
  const staffMax = hero.staffCdMax || 0.82;
  const dodgeMax = hero.dodgeCooldownMax || 0.9;
  const alive = state.running && hero.action !== "hurt" && hero.action !== "dodge" && hero.action !== "dead";
  const aliveDodge = state.running && hero.action !== "hurt" && hero.action !== "dead";
  return {
    running: state.running,
    mode: state.mode,
    grounded: hero.grounded,
    basicReady: alive && hero.basicCd <= 0,
    staffReady: alive && hero.staffCd <= 0 && hero.mp >= MP_COST_R,
    dodgeReady: aliveDodge && hero.dodgeCooldown <= 0 && hero.mp >= MP_COST_F,
    basicCdFrac: clamp(hero.basicCd / basicMax, 0, 1),
    staffCdFrac: clamp(hero.staffCd / staffMax, 0, 1),
    dodgeCdFrac: clamp(hero.dodgeCooldown / dodgeMax, 0, 1),
    staffMpOk: hero.mp >= MP_COST_R,
    dodgeMpOk: hero.mp >= MP_COST_F,
    spReady: hero.sp >= hero.maxSp,
    spFrac: clamp(hero.sp / hero.maxSp, 0, 1),
  };
};

window.__pansiGame = { state, hero, LEVELS, SKILL_DEFS, resetGame, upgradeSkill };
