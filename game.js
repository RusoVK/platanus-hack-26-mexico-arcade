// Platanus Hack 26 — Equipo Ducks
// PRESIDENT OF MEXICO OR FEDERAL COURT NEW YORK
// Plataformero vertical infinito (tipo Doodle Jump) con sátira "presidente en campaña".
// - 1 jugador: pantalla completa.
// - 2 jugadores: PANTALLA DIVIDIDA, escenarios independientes, se compite por altura/score.
// Personajes seleccionables (listos para pixel art vía base64, ver CHARACTERS).

const W = 800;
const H = 600;
const SPLIT_W = 400; // ancho de cada mitad en 2 jugadores
const FULL_W = 800; // ancho de campo en 1 jugador
const FIELD2_OFFSET = 4000; // separación en coordenadas de mundo entre los dos campos

const STORAGE_KEY = "ducks-sky-jump-highscores";
const MAX_SCORES = 5;

// ---- Tuning de física (px / s) ----
const GRAVITY = 1900;
const MOVE_SPEED = 380;
const JUMP_V = 940;
const SPRING_V = 1180; // resorte: impulso más moderado para no estamparse contra obstáculos
const IMPULSE_V = 820;
const IMPULSE_CD = 1400;
const MAX_FALL = 1500;

const PLAT_W = 106;
const PLAT_H = 18;
const P_HALF_W = 18;
const P_HALF_H = 28;

const START_Y = 500;
const ANCHOR_FROM_TOP = 0.56;
const INVULN_MS = 1000;
const FALL_GRACE_MS = 3000;
const START_LIVES = 3;
const POOL = 14;
const HAZARDS = 5;

const COLORS = {
  sky: 0x0a1130,
  panel: 0x0c1024,
  skin: 0xf0c89a,
  platNormal: 0x6b7f14,
  platMove: 0x3a86ff,
  platSpring: 0x2ecc71,
  platBreak: 0xb5651d,
  turret: 0x2b2f3a,
  turretLight: 0xff4d4d,
  white: 0xf7ffd8,
  accent: 0xe1ff00,
  star: 0xffffff,
  divider: 0x2b3566,
};

// =====================================================================
// PERSONAJES
// ---------------------------------------------------------------------
// Para usar PIXEL ART: en el campo `data` pega el base64 con '/' cambiado por '!'
// y envuélvelo con charImage("..."). Si `data` es null, se dibuja uno procedural.
// =====================================================================
// Reconstruye un data URI base64; '!' representa '/' para no disparar el patron // del validador.
function charImage(b64) {
  return "data:image/png;base64," + b64.split("!").join("/");
}

const CHARACTERS = [
  { key: "c_adame", name: "ALFREDO ADAME", color: 0xffffff, sash: 0x000000, hair: 0xcccccc, data: null },
  { key: "c_abelito", name: "ABELITO", color: 0xff3333, sash: 0x3333ff, hair: 0x3a1d1d, data: null },
  { key: "c_claudia", name: "CLAUDIA SHEMABUI", color: 0x4d1d3d, sash: 0xffffff, hair: 0x111111, data: null },
  { key: "c_simi", name: "DR SIMI", color: 0xffffff, sash: 0x3366ff, hair: 0xffffff, data: null },
];

const CHAR_GRID_W = 16;
const CHAR_GRID_H = 22;
const CHAR_SCALE = 3;
const CHAR_W = CHAR_GRID_W * CHAR_SCALE; // 48
const CHAR_H = CHAR_GRID_H * CHAR_SCALE; // 66

// Arcade cabinet button → keyboard key mapping.
// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
// To add local testing shortcuts, append extra keys to any array.
const CABINET_KEYS = {
  P1_U: ["w"],
  P1_D: ["s"],
  P1_L: ["a"],
  P1_R: ["d"],
  P1_1: ["u"],
  P1_2: ["i"],
  P1_3: ["o"],
  P1_4: ["j"],
  P1_5: ["k"],
  P1_6: ["l"],
  P2_U: ["ArrowUp"],
  P2_D: ["ArrowDown"],
  P2_L: ["ArrowLeft"],
  P2_R: ["ArrowRight"],
  P2_1: ["r"],
  P2_2: ["t"],
  P2_3: ["y"],
  P2_4: ["f"],
  P2_5: ["g"],
  P2_6: ["h"],
  START1: ["Enter"],
  START2: ["2"],
};

const KEYBOARD_TO_ARCADE = {};
for (const [arcadeCode, keys] of Object.entries(CABINET_KEYS)) {
  for (const key of keys) {
    KEYBOARD_TO_ARCADE[normalizeIncomingKey(key)] = arcadeCode;
  }
}

const config = {
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: "game-root",
  backgroundColor: "#0a1130",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W,
    height: H,
  },
  scene: { preload, create, update },
};

new Phaser.Game(config);

// =====================================================================
// Lifecycle
// =====================================================================

function preload() {
  for (const c of CHARACTERS) {
    if (c.data) this.load.image(c.key, c.data);
  }
}

function create() {
  const scene = this;

  ensureCharacterTextures(scene);
  ensureMenuBackground(scene);
  ensureMoneyTexture(scene);
  ensureCrowdTexture(scene);

  scene.state = {
    phase: "start",
    twoPlayers: true,
    highScores: [],
    nav: 0,
    sel: null,
  };

  // segunda cámara para split-screen (oculta hasta jugar a 2P)
  scene.cam2 = scene.cameras.add(SPLIT_W, 0, SPLIT_W, H);
  scene.cam2.setVisible(false);
  scene.cam2.setBackgroundColor(COLORS.sky);
  scene.cameras.main.setBackgroundColor(COLORS.sky);

  // dos campos independientes (mundos separados por un offset horizontal)
  scene.fields = [
    buildField(scene, 0, 0, scene.cameras.main),
    buildField(scene, 1, FIELD2_OFFSET, scene.cam2),
  ];

  scene.players = [makePlayer(scene, 0), makePlayer(scene, 1)];
  scene.fields[0].player = scene.players[0];
  scene.fields[1].player = scene.players[1];

  createHud(scene);
  createStartScreen(scene);
  createSelectScreen(scene);
  createResultsScreen(scene);
  createControls(scene);

  // Reparto de cámaras: cada cámara solo ve lo suyo.
  scene.cam2.ignore([
    scene.fields[0].layer,
    scene.hud.p1.container,
    scene.startScreen.container,
    scene.selectScreen.container,
    scene.resultsScreen.container,
  ]);
  scene.cameras.main.ignore([scene.fields[1].layer, scene.hud.p2.container]);

  showStartScreen(scene);

  loadHighScores()
    .then((scores) => {
      scene.state.highScores = scores;
      refreshLeaderboards(scene);
    })
    .catch(() => {
      scene.state.highScores = [];
      refreshLeaderboards(scene);
    });
}

function update(time, delta) {
  const scene = this;
  if (!scene.state) return;

  const dt = Math.min(delta, 40) / 1000;
  const phase = scene.state.phase;

  if (phase === "start") {
    handleStartMenu(scene);
  } else if (phase === "select") {
    handleSelect(scene, time);
  } else if (phase === "playing") {
    updatePlaying(scene, dt, time);
  } else if (phase === "results") {
    handleResults(scene, time);
  } else if (phase === "saved") {
    if (consumeAnyPressedControl(scene, ["START1", "START2", "P1_1", "P2_1"])) {
      returnToStart(scene);
    }
  }
}

// =====================================================================
// Texturas de personajes (pixel-art procedural de respaldo)
// =====================================================================

function ensureCharacterTextures(scene) {
  for (const c of CHARACTERS) {
    if (scene.textures.exists(c.key)) {
      scene.textures.get(c.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      continue;
    }
    drawCharacterTexture(scene, c);
  }
}

function px(g, x, y, w, h, color) {
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, h);
}

function drawCore(g, c) {
  px(g, 4, 15, 3, 7, 0x22243a);
  px(g, 9, 15, 3, 7, 0x22243a);
  px(g, 3, 6, 10, 9, c.color);
  px(g, 4, 1, 8, 5, COLORS.skin);
  px(g, 6, 4, 1, 1, 0x111111);
  px(g, 9, 4, 1, 1, 0x111111);
}

function drawStandardArms(g, c) {
  px(g, 1, 7, 2, 7, c.color);
  px(g, 13, 7, 2, 7, c.color);
  px(g, 1, 14, 2, 1, COLORS.skin);
  px(g, 13, 14, 2, 1, COLORS.skin);
}

function drawAdame(g, c) {
  drawCore(g, c);
  drawStandardArms(g, c);
  px(g, 4, 0, 8, 1, c.hair);
  for (let i = 0; i < 8; i++) px(g, 4 + i, 10, 1, 1, c.sash);
}

function drawAbelito(g, c) {
  drawCore(g, c);
  drawStandardArms(g, c);
  px(g, 3, 0, 10, 2, c.hair);
  px(g, 3, 11, 10, 4, c.sash);
}

function drawClaudia(g, c) {
  drawCore(g, c);
  drawStandardArms(g, c);
  px(g, 4, 0, 8, 1, c.hair);
  px(g, 3, 1, 1, 4, c.hair);
  px(g, 12, 1, 1, 4, c.hair);
  px(g, 13, 3, 2, 6, c.hair);
  for (let i = 0; i < 7; i++) px(g, 4 + i, 7 + i, 1, 1, 0x006847);
  for (let i = 0; i < 7; i++) px(g, 4 + i, 8 + i, 1, 1, 0xffffff);
  for (let i = 0; i < 7; i++) px(g, 4 + i, 9 + i, 1, 1, 0xce1126);
}

function drawSimi(g, c) {
  drawCore(g, c);
  drawStandardArms(g, c);
  px(g, 3, 2, 1, 3, c.hair);
  px(g, 12, 2, 1, 3, c.hair);
  px(g, 5, 5, 6, 1, 0xffffff);
  px(g, 7, 7, 2, 5, c.sash);
}

const CHAR_DRAWERS = {
  c_adame: drawAdame,
  c_abelito: drawAbelito,
  c_claudia: drawClaudia,
  c_simi: drawSimi,
};

function drawCharacterTexture(scene, c) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const draw = CHAR_DRAWERS[c.key] || drawAdame;
  draw(g, c);
  g.generateTexture(c.key, CHAR_GRID_W, CHAR_GRID_H);
  g.destroy();
  scene.textures.get(c.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function ensureMenuBackground(scene) {
  if (scene.textures.exists("menu_bg")) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const horizon = 430;
  const bands = [
    0x0a0a2a, 0x141452, 0x2a1a6b, 0x4a2080, 0x7a2a8a, 0xb83a7a, 0xe85a5a,
    0xff8a4a, 0xffb86a,
  ];
  const bh = horizon / bands.length;
  for (let i = 0; i < bands.length; i++) {
    g.fillStyle(bands[i], 1);
    g.fillRect(0, Math.floor(i * bh), W, Math.ceil(bh) + 1);
  }
  g.fillStyle(0xffe9a8, 1);
  g.fillCircle(640, 110, 60);
  g.fillStyle(0xf0d488, 1);
  g.fillCircle(662, 96, 12);
  g.fillCircle(618, 132, 9);
  g.fillCircle(652, 142, 7);
  g.fillStyle(0xffffff, 1);
  for (let i = 0; i < 80; i++) {
    const x = Phaser.Math.Between(0, W);
    const y = Phaser.Math.Between(0, 270);
    const s = Phaser.Math.Between(1, 3);
    g.fillRect(x, y, s, s);
  }
  const plats = [
    [110, 360], [300, 300], [520, 345], [200, 215], [600, 245], [410, 150], [80, 250],
  ];
  for (const p of plats) {
    g.fillStyle(0x16264f, 1);
    g.fillRoundedRect(p[0], p[1], 72, 13, 3);
    g.fillStyle(0x2a3f7a, 1);
    g.fillRect(p[0] + 2, p[1] + 1, 68, 3);
  }
  g.fillStyle(0x241026, 1);
  g.fillRect(0, horizon, W, H - horizon);
  const bw = 46;
  const bhh = 24;
  let row = 0;
  for (let y = horizon; y < H; y += bhh, row++) {
    for (let x = -(row % 2) * (bw / 2); x < W; x += bw) {
      g.fillStyle(0x6b2f2f, 1);
      g.fillRect(x + 2, y + 2, bw - 4, bhh - 4);
      g.fillStyle(0x7e3a3a, 1);
      g.fillRect(x + 2, y + 2, bw - 4, 3);
    }
  }
  g.lineStyle(3, 0x3a1a3a, 1);
  g.beginPath();
  g.moveTo(0, horizon);
  g.lineTo(W, horizon);
  g.strokePath();
  g.generateTexture("menu_bg", W, H);
  g.destroy();
  scene.textures.get("menu_bg").setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// Fajo de dinero (marcador del resorte/trampolín)
function ensureMoneyTexture(scene) {
  if (scene.textures.exists("money")) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x2f8f4f, 1);
  g.fillRect(0, 0, 30, 18);
  g.lineStyle(2, 0x1c5e33, 1);
  g.strokeRect(1, 1, 28, 16);
  g.fillStyle(0x5fbf7f, 1);
  g.fillEllipse(15, 9, 18, 10);
  // signo de "$"
  g.fillStyle(0xffffff, 1);
  g.fillRect(14, 3, 2, 12);
  g.fillRect(11, 4, 5, 2);
  g.fillRect(14, 8, 5, 2);
  g.fillRect(11, 13, 5, 2);
  g.generateTexture("money", 30, 18);
  g.destroy();
  scene.textures.get("money").setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// Tile de multitud (la turba que te persigue desde el vacío) con carteles
function ensureCrowdTexture(scene) {
  if (scene.textures.exists("crowdTile")) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const heads = [[10, 46], [26, 42], [42, 47], [58, 43], [69, 46]];

  // cuerpos + cabezas
  g.fillStyle(0x140c1a, 1);
  for (const h of heads) {
    g.fillCircle(h[0], h[1], 8);
    g.fillRect(h[0] - 8, h[1] + 6, 16, 60);
  }
  // brazos en alto
  g.lineStyle(4, 0x140c1a, 1);
  for (const h of heads) {
    g.beginPath(); g.moveTo(h[0] - 6, h[1] + 8); g.lineTo(h[0] - 13, h[1] - 10); g.strokePath();
    g.beginPath(); g.moveTo(h[0] + 6, h[1] + 8); g.lineTo(h[0] + 13, h[1] - 10); g.strokePath();
  }
  // carteles (pancartas) sobre algunas personas
  const signs = [[26, 42, 0xfff3c4], [58, 43, 0xffffff]];
  for (const s of signs) {
    g.fillStyle(0x6b4a2a, 1);
    g.fillRect(s[0] - 1, s[1] - 30, 3, 34); // palo
    g.fillStyle(s[2], 1);
    g.fillRect(s[0] - 15, s[1] - 46, 30, 20); // pancarta
    g.lineStyle(2, 0x222222, 1);
    g.strokeRect(s[0] - 15, s[1] - 46, 30, 20);
    g.fillStyle(0x333333, 1); // líneas de "texto"
    g.fillRect(s[0] - 11, s[1] - 42, 22, 2);
    g.fillRect(s[0] - 11, s[1] - 37, 15, 2);
    g.fillRect(s[0] - 11, s[1] - 32, 19, 2);
  }
  // ojos rojos
  g.fillStyle(0xff3b3b, 1);
  for (const h of heads) {
    g.fillRect(h[0] - 4, h[1] - 2, 3, 3);
    g.fillRect(h[0] + 1, h[1] - 2, 3, 3);
  }
  g.generateTexture("crowdTile", 72, 96);
  g.destroy();
  scene.textures.get("crowdTile").setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// =====================================================================
// Campo (cada jugador tiene el suyo): plataformas + drones + estrellas
// =====================================================================

function buildField(scene, index, originX, camera) {
  const layer = scene.add.container(0, 0);

  const stars = [];
  for (let i = 0; i < 16; i++) {
    const s = scene.add.circle(
      originX + Phaser.Math.Between(0, SPLIT_W),
      Phaser.Math.Between(0, H),
      Phaser.Math.Between(1, 2),
      COLORS.star,
      Phaser.Math.FloatBetween(0.3, 0.85),
    );
    layer.add(s);
    stars.push(s);
  }

  const platforms = [];
  for (let i = 0; i < POOL; i++) platforms.push(makePlatform(scene, layer));

  const hazards = [];
  for (let i = 0; i < HAZARDS; i++) hazards.push(makeHazard(scene, layer));

  // multitud que persigue desde el vacío (borde inferior)
  const crowd = scene.add
    .tileSprite(originX + SPLIT_W / 2, 0, SPLIT_W, 96, "crowdTile")
    .setOrigin(0.5, 1)
    .setDepth(9);
  crowd.setVisible(false);
  layer.add(crowd);

  return {
    index, originX, camera, layer, stars, platforms, hazards, crowd,
    width: SPLIT_W, player: null, hud: null,
    highestY: 0, nextHazardAt: 0, maxHeight: 0, active: false,
  };
}

function makePlayer(scene, index) {
  const field = scene.fields[index];
  const sprite = scene.add.sprite(0, 0, CHARACTERS[index % CHARACTERS.length].key);
  sprite.setDisplaySize(CHAR_W, CHAR_H);
  sprite.setDepth(10);
  field.layer.add(sprite);

  return {
    index,
    prefix: index === 0 ? "P1" : "P2",
    sprite,
    field,
    charIndex: index % CHARACTERS.length,
    x: 0, y: 0, vx: 0, vy: 0,
    lives: START_LIVES,
    alive: false,
    grounded: false,
    platform: null,
    airImpulse: true,
    impulseCdUntil: 0,
    invulnUntil: 0,
    fallGraceUntil: 0,
    minY: START_Y,
    height: 0,
    milestone: 100,
    bScaleX: CHAR_SCALE,
    bScaleY: CHAR_SCALE,
  };
}

function makePlatform(scene, layer) {
  const base = scene.add.rectangle(0, 0, PLAT_W, PLAT_H, COLORS.platNormal);
  base.setStrokeStyle(2, 0x05122a, 0.6);
  const cap = scene.add.rectangle(0, -PLAT_H / 2 + 2, PLAT_W, 4, COLORS.white, 0.5);
  const spring = scene.add.sprite(0, -PLAT_H / 2 - 7, "money");
  spring.setVisible(false);
  const tBase = scene.add.rectangle(0, -2, 18, 14, COLORS.turret);
  const tBarrel = scene.add.rectangle(-12, -4, 12, 5, COLORS.turret);
  const tLight = scene.add.circle(0, -8, 3, COLORS.turretLight);
  const turret = scene.add.container(PLAT_W / 2 - 12, -PLAT_H / 2 - 8, [tBase, tBarrel, tLight]);
  turret.setVisible(false);
  const container = scene.add.container(0, 0, [base, cap, spring, turret]);
  container.setDepth(5);
  layer.add(container);
  return {
    container, base, cap, spring, turret, tLight,
    x: 0, y: 0, w: PLAT_W, h: PLAT_H, type: "normal",
    vx: 0, dx: 0, minX: 0, maxX: 0, hasTurret: false, broken: false,
  };
}

function makeHazard(scene, layer) {
  const body = scene.add.circle(0, 0, 13, COLORS.turretLight);
  body.setStrokeStyle(2, 0x05122a, 0.8);
  const wingL = scene.add.rectangle(-15, 0, 10, 4, 0x2b2f3a);
  const wingR = scene.add.rectangle(15, 0, 10, 4, 0x2b2f3a);
  const eye = scene.add.circle(0, -2, 4, 0x111111);
  const container = scene.add.container(0, 0, [wingL, wingR, body, eye]);
  container.setDepth(8);
  container.setVisible(false);
  layer.add(container);
  return { container, x: 0, y: 0, baseY: 0, phase: 0, vx: 0, active: false };
}

// =====================================================================
// Cámaras (split-screen)
// =====================================================================

function setupCameras(scene, two) {
  const main = scene.cameras.main;
  if (two) {
    main.setViewport(0, 0, SPLIT_W, H);
    main.setScroll(scene.fields[0].originX, 0);
    scene.cam2.setViewport(SPLIT_W, 0, SPLIT_W, H);
    scene.cam2.setScroll(scene.fields[1].originX, 0);
    scene.cam2.setVisible(true);
  } else {
    main.setViewport(0, 0, FULL_W, H);
    main.setScroll(scene.fields[0].originX, 0);
    scene.cam2.setVisible(false);
  }
}

function teardownCameras(scene) {
  scene.cameras.main.setViewport(0, 0, FULL_W, H);
  scene.cameras.main.setScroll(0, 0);
  scene.cam2.setVisible(false);
}

// =====================================================================
// Inicio de partida
// =====================================================================

function startMatch(scene) {
  const s = scene.state;
  const two = s.twoPlayers;

  scene.startScreen.container.setVisible(false);
  scene.selectScreen.container.setVisible(false);
  scene.resultsScreen.container.setVisible(false);

  scene.fields[0].width = two ? SPLIT_W : FULL_W;
  scene.fields[1].width = SPLIT_W;
  scene.fields[0].active = true;
  scene.fields[1].active = two;

  scene.players[0].charIndex = s.sel.p1;
  scene.players[1].charIndex = s.sel.p2;

  resetField(scene, scene.fields[0]);
  if (two) resetField(scene, scene.fields[1]);
  else hideField(scene.fields[1]);

  setupCameras(scene, two);
  refreshHud(scene);
  s.phase = "playing";
}

function resetField(scene, field) {
  const pl = field.player;
  const left = field.originX;
  const cx = left + field.width / 2;

  scene.tweens.killTweensOf(pl.sprite);
  setPlayerCharacter(pl, pl.charIndex);
  pl.alive = true;
  pl.lives = START_LIVES;
  pl.vx = 0;
  pl.vy = 0;
  pl.x = cx;
  pl.y = START_Y;
  pl.grounded = false;
  pl.platform = null;
  pl.airImpulse = true;
  pl.impulseCdUntil = 0;
  pl.invulnUntil = 0;
  pl.fallGraceUntil = 0;
  pl.minY = START_Y;
  pl.height = 0;
  pl.milestone = 100;
  pl.sprite.clearTint();
  pl.sprite.setVisible(true).setAlpha(1).setRotation(0).setPosition(pl.x, pl.y);

  field.camera.setScroll(left, 0);
  field.maxHeight = 0;
  field.nextHazardAt = 0;
  field.highestY = START_Y + 50;

  const ground = field.platforms[0];
  configurePlatform(ground, "normal", 0);
  ground.hasTurret = false;
  ground.turret.setVisible(false);
  ground.w = field.width - 60;
  ground.base.setSize(ground.w, PLAT_H);
  ground.cap.setSize(ground.w, 4);
  placePlatform(ground, cx, START_Y + 50);

  for (let i = 1; i < field.platforms.length; i++) {
    const p = field.platforms[i];
    p.w = PLAT_W;
    p.base.setSize(PLAT_W, PLAT_H);
    p.cap.setSize(PLAT_W, 4);
    spawnAbove(field, p, 0);
  }

  for (const hz of field.hazards) {
    hz.active = false;
    hz.container.setVisible(false);
  }

  for (const st of field.stars) {
    st.x = left + Phaser.Math.Between(10, field.width - 10);
    st.y = Phaser.Math.Between(0, H);
  }

  field.crowd.setVisible(true);
  field.crowd.setSize(field.width, 96);
  field.crowd.x = left + field.width / 2;
}

function hideField(field) {
  field.player.sprite.setVisible(false);
  for (const p of field.platforms) p.container.setVisible(false);
  for (const hz of field.hazards) hz.container.setVisible(false);
  if (field.crowd) field.crowd.setVisible(false);
}

function setPlayerCharacter(pl, idx) {
  pl.charIndex = idx;
  pl.sprite.setTexture(CHARACTERS[idx].key);
  pl.sprite.setDisplaySize(CHAR_W, CHAR_H);
  pl.bScaleX = pl.sprite.scaleX;
  pl.bScaleY = pl.sprite.scaleY;
}

function placePlatform(p, x, y) {
  p.x = x;
  p.y = y;
  p.container.setPosition(x, y);
}

function spawnAbove(field, p, heightProgress) {
  const gap = Phaser.Math.Between(54, 74 + Math.min(46, heightProgress / 150));
  const newY = field.highestY - gap;
  field.highestY = newY;
  const m = 50;
  const x = Phaser.Math.Between(field.originX + m, field.originX + field.width - m);
  const type = pickPlatformType(heightProgress);
  configurePlatform(p, type, heightProgress);
  placePlatform(p, x, newY);
  const turretProb = Phaser.Math.Clamp((heightProgress - 250) / 6000, 0, 0.28);
  p.hasTurret = type !== "spring" && Math.random() < turretProb;
  p.turret.setVisible(p.hasTurret);
}

function pickPlatformType(h) {
  const springProb = 0.1;
  const moveProb = Phaser.Math.Clamp(0.12 + h / 4000, 0, 0.5);
  const breakProb = Phaser.Math.Clamp((h - 400) / 8000, 0, 0.2);
  const r = Math.random();
  if (r < springProb) return "spring";
  if (r < springProb + moveProb) return "moving";
  if (r < springProb + moveProb + breakProb) return "breakable";
  return "normal";
}

function configurePlatform(p, type, h) {
  p.type = type;
  p.broken = false;
  p.dx = 0;
  p.container.setVisible(true);
  p.container.setAlpha(1);
  p.base.setVisible(true);
  p.cap.setVisible(true);
  p.spring.setVisible(false);
  if (type === "spring") {
    p.base.setFillStyle(COLORS.platSpring);
    p.spring.setVisible(true);
    p.vx = 0;
  } else if (type === "moving") {
    p.base.setFillStyle(COLORS.platMove);
    const speed = 50 + Math.random() * 60 + Math.min(70, h / 100);
    p.vx = Math.random() < 0.5 ? -speed : speed;
  } else if (type === "breakable") {
    p.base.setFillStyle(COLORS.platBreak);
    p.vx = 0;
  } else {
    p.base.setFillStyle(COLORS.platNormal);
    p.vx = 0;
  }
}

// =====================================================================
// Loop de juego
// =====================================================================

function updatePlaying(scene, dt, time) {
  if (consumeAnyPressedControl(scene, ["START1", "START2"])) {
    endMatch(scene);
    return;
  }

  for (const field of scene.fields) {
    if (field.active) updateField(scene, field, dt, time);
  }

  // La partida termina cuando NINGÚN jugador activo sigue vivo.
  const anyAlive = scene.fields.some((f) => f.active && f.player.alive);
  if (!anyAlive) endMatch(scene);
}

function updateField(scene, field, dt, time) {
  const pl = field.player;
  const cam = field.camera;

  updatePlatforms(scene, field, dt);

  if (pl.alive) stepPlayer(scene, field, dt, time);

  // cámara: sigue a su jugador, nunca retrocede
  if (pl.alive) {
    const desired = pl.y - H * ANCHOR_FROM_TOP;
    if (desired < cam.scrollY) cam.scrollY = desired;
  }

  // altura / score
  if (pl.alive) {
    if (pl.y < pl.minY) pl.minY = pl.y;
    pl.height = Math.max(0, Math.floor((START_Y - pl.minY) / 10));
    if (pl.height > field.maxHeight) field.maxHeight = pl.height;
    if (pl.height >= pl.milestone) {
      showMilestone(scene, field, pl.milestone);
      pl.milestone += 100;
    }
  }

  // ambiente: estrellas fugaces ocasionales
  if (pl.alive && Math.random() < 0.004) shootingStar(scene, field, cam);

  // caída fuera de cámara
  const bottom = cam.scrollY + H;
  if (pl.alive && pl.y - P_HALF_H > bottom + 40) {
    handleFall(scene, field, time);
  }

  updateHazards(scene, field, dt, time);

  if (pl.alive) {
    if (time < pl.invulnUntil) {
      pl.sprite.setAlpha(Math.floor(time / 90) % 2 === 0 ? 0.35 : 1);
    } else {
      pl.sprite.setAlpha(1);
      pl.sprite.clearTint();
    }
    if (time >= pl.invulnUntil) {
      checkTurrets(scene, field, time);
      checkHazards(scene, field, time);
    }
  }

  recyclePlatforms(field, cam);
  recycleStars(field, cam);

  // la multitud sigue el borde inferior de la cámara (con leve vaivén amenazante)
  field.crowd.y = cam.scrollY + H + 30 + Math.sin(scene.time.now * 0.005) * 5;
  field.crowd.tilePositionX += 0.3;

  refreshFieldHud(scene, field);
}

function updatePlatforms(scene, field, dt) {
  const left = field.originX;
  const right = field.originX + field.width;
  for (const p of field.platforms) {
    p.dx = 0;
    if (p.type === "moving" && !p.broken) {
      let nx = p.x + p.vx * dt;
      if (nx < left + 50) {
        nx = left + 50;
        p.vx = Math.abs(p.vx);
      } else if (nx > right - 50) {
        nx = right - 50;
        p.vx = -Math.abs(p.vx);
      }
      p.dx = nx - p.x;
      p.x = nx;
      p.container.x = nx;
    }
    if (p.hasTurret) {
      p.tLight.setVisible(Math.floor(scene.time.now / 300) % 2 === 0);
    }
    if (p.type === "spring" && !p.broken) {
      // el dinero flota suavemente sobre el resorte
      p.spring.y = -PLAT_H / 2 - 7 + Math.sin(scene.time.now * 0.005 + p.x * 0.05) * 2;
    }
  }
}

function updateHazards(scene, field, dt, time) {
  const cam = field.camera;
  const left = field.originX;
  const right = field.originX + field.width;
  for (const hz of field.hazards) {
    if (!hz.active) continue;
    hz.x += hz.vx * dt;
    if (hz.x < left + 26) {
      hz.x = left + 26;
      hz.vx = Math.abs(hz.vx);
    } else if (hz.x > right - 26) {
      hz.x = right - 26;
      hz.vx = -Math.abs(hz.vx);
    }
    // flotación vertical + balanceo
    hz.y = hz.baseY + Math.sin((scene.time.now + hz.phase) * 0.005) * 8;
    hz.container.setPosition(hz.x, hz.y);
    hz.container.setRotation(Math.sin((scene.time.now + hz.phase) * 0.008) * 0.2);
    if (hz.y > cam.scrollY + H + 60) {
      hz.active = false;
      hz.container.setVisible(false);
    }
  }

  const h = field.maxHeight;
  if (h < 120 || time < field.nextHazardAt) return;
  field.nextHazardAt = time + Math.max(900, 2600 - h * 4);
  const hz = field.hazards.find((e) => !e.active);
  if (!hz) return;
  hz.active = true;
  hz.x = Phaser.Math.Between(left + 40, right - 40);
  hz.y = cam.scrollY - 30;
  hz.baseY = hz.y;
  hz.phase = Math.random() * 1000;
  const speed = 70 + Math.min(120, h / 30) + Math.random() * 50;
  hz.vx = Math.random() < 0.5 ? -speed : speed;
  hz.container.setVisible(true).setPosition(hz.x, hz.y);
}

function stepPlayer(scene, field, dt, time) {
  const pl = field.player;
  const held = scene.controls.held;
  const left = field.originX;
  const right = field.originX + field.width;

  let dir = 0;
  if (held[pl.prefix + "_L"]) dir -= 1;
  if (held[pl.prefix + "_R"]) dir += 1;
  pl.vx = dir * MOVE_SPEED;
  pl.x += pl.vx * dt;

  if (pl.grounded && pl.platform && !pl.platform.broken) {
    const p = pl.platform;
    if (Math.abs(pl.x - p.x) > p.w / 2 + P_HALF_W * 0.4) {
      pl.grounded = false;
      pl.platform = null;
    } else {
      pl.x += p.dx;
      pl.y = p.y - p.h / 2 - P_HALF_H;
      pl.vy = 0;
      pl.airImpulse = true;
    }
  } else {
    pl.grounded = false;
  }

  pl.x = Phaser.Math.Wrap(pl.x, left, right);

  if (pl.grounded && held[pl.prefix + "_U"]) {
    pl.vy = -JUMP_V;
    pl.grounded = false;
    pl.platform = null;
    pl.airImpulse = true;
    tone(scene, 620, 0.08, 0.12);
    burst(scene, field, pl.x, pl.y + P_HALF_H, 0xffffff, 5, 16, 360);
  }

  if (
    !pl.grounded &&
    pl.airImpulse &&
    consumePressed(scene, pl.prefix + "_1") &&
    time > pl.impulseCdUntil
  ) {
    pl.vy = -IMPULSE_V;
    pl.airImpulse = false;
    pl.impulseCdUntil = time + IMPULSE_CD;
    tone(scene, 880, 0.1, 0.12);
    burst(scene, field, pl.x, pl.y, 0x00e0ff, 7, 24, 380);
  }

  if (!pl.grounded) {
    pl.vy += GRAVITY * dt;
    if (pl.vy > MAX_FALL) pl.vy = MAX_FALL;
    pl.y += pl.vy * dt;
    landingCheck(scene, field);
  }

  pl.sprite.setPosition(pl.x, pl.y);

  // squash & stretch según velocidad vertical (se estira al subir, se aplasta al caer)
  const sk = Phaser.Math.Clamp(-pl.vy / 4200, -0.16, 0.24);
  pl.sprite.scaleX = pl.bScaleX * (1 - sk * 0.55);
  pl.sprite.scaleY = pl.bScaleY * (1 + sk);

  // balanceo al caminar; inclinación hacia el movimiento al estar en el aire
  if (pl.grounded && Math.abs(pl.vx) > 5) {
    pl.sprite.setRotation(Math.sin(time * 0.018) * 0.26);
  } else if (!pl.grounded) {
    pl.sprite.setRotation(Phaser.Math.Clamp(pl.vx / MOVE_SPEED, -1, 1) * 0.16);
  } else {
    pl.sprite.setRotation(0);
  }
}

function landingCheck(scene, field) {
  const pl = field.player;
  if (pl.vy < 0) return;
  const feet = pl.y + P_HALF_H;
  for (const p of field.platforms) {
    if (p.broken) continue;
    if (Math.abs(pl.x - p.x) > p.w / 2 + P_HALF_W * 0.7) continue;
    const top = p.y - p.h / 2;
    if (feet >= top && feet <= top + 22 + Math.abs(pl.vy) * 0.016) {
      const impact = pl.vy;
      if (p.type === "spring") {
        pl.y = top - P_HALF_H;
        pl.vy = -SPRING_V;
        pl.grounded = false;
        pl.platform = null;
        pl.airImpulse = true;
        tone(scene, 1040, 0.12, 0.14);
        // animación de compresión del resorte + partículas + sacudida leve
        p.spring.setScale(1, 0.35);
        scene.tweens.add({ targets: p.spring, scaleY: 1, duration: 220, ease: "Back.Out" });
        burst(scene, field, pl.x, top, 0x2ecc71, 9, 32, 420);
        field.camera.shake(120, 0.004);
        return;
      }
      if (p.type === "breakable") {
        pl.y = top - P_HALF_H;
        pl.vy = -JUMP_V * 0.62;
        pl.grounded = false;
        pl.platform = null;
        pl.airImpulse = true;
        breakPlatform(scene, p);
        tone(scene, 240, 0.12, 0.12);
        burst(scene, field, pl.x, top, 0xb5651d, 8, 26, 400);
        return;
      }
      pl.y = top - P_HALF_H;
      pl.vy = 0;
      pl.grounded = true;
      pl.platform = p;
      pl.airImpulse = true;
      if (impact > 320) burst(scene, field, pl.x, top, 0xdfe6ff, 5, 18, 320);
      return;
    }
  }
}

function breakPlatform(scene, p) {
  p.broken = true;
  p.hasTurret = false;
  p.turret.setVisible(false);
  scene.tweens.add({
    targets: p.container,
    alpha: 0,
    duration: 220,
    onComplete: () => {
      p.container.setVisible(false);
      p.container.setAlpha(1);
    },
  });
}

function checkTurrets(scene, field, time) {
  const pl = field.player;
  for (const p of field.platforms) {
    if (!p.hasTurret || p.broken) continue;
    const tx = p.x + (PLAT_W / 2 - 12);
    const ty = p.y - PLAT_H / 2 - 8;
    if (Math.abs(pl.x - tx) < P_HALF_W + 11 && Math.abs(pl.y - ty) < P_HALF_H + 12) {
      hitPlayer(scene, field, time, tx);
      return;
    }
  }
}

function checkHazards(scene, field, time) {
  const pl = field.player;
  for (const hz of field.hazards) {
    if (!hz.active) continue;
    if (Math.abs(pl.x - hz.x) < P_HALF_W + 12 && Math.abs(pl.y - hz.y) < P_HALF_H + 12) {
      hitPlayer(scene, field, time, hz.x);
      return;
    }
  }
}

function hitPlayer(scene, field, time, fromX) {
  const pl = field.player;
  pl.lives -= 1;
  pl.invulnUntil = time + INVULN_MS;
  pl.vy = 260;
  pl.vx = pl.x < fromX ? -260 : 260;
  pl.x += pl.vx * 0.016;
  pl.grounded = false;
  pl.platform = null;
  tone(scene, 150, 0.18, 0.16);
  field.camera.shake(250, 0.008);
  pl.sprite.setTint(0xff5555);
  burst(scene, field, pl.x, pl.y, 0xff5d5d, 9, 28, 420);
  comicHit(scene, field, pl.x, pl.y - 34);
  if (pl.lives <= 0) eliminate(scene, pl);
}

// CORREGIDO: rescata al jugador DENTRO de la pantalla (cerca de arriba) con impulso
// hacia arriba. Antes lo dejaban debajo del borde, lo que re-disparaba la caída cada
// frame (audio trabado) y nunca recuperaba el impulso.
function handleFall(scene, field, time) {
  const pl = field.player;
  const cam = field.camera;
  const inGrace = time < pl.fallGraceUntil;
  if (!inGrace) {
    pl.lives -= 1;
    pl.fallGraceUntil = time + FALL_GRACE_MS;
    tone(scene, 120, 0.22, 0.16);
    comicHit(
      scene, field,
      Phaser.Math.Clamp(pl.x, field.originX + 40, field.originX + field.width - 40),
      cam.scrollY + H - 90,
    );
    if (pl.lives <= 0) {
      eliminate(scene, pl);
      return;
    }
  } else {
    tone(scene, 200, 0.1, 0.1);
  }
  pl.y = cam.scrollY + 90;
  pl.x = Phaser.Math.Clamp(pl.x, field.originX + 40, field.originX + field.width - 40);
  pl.vy = -JUMP_V;
  pl.grounded = false;
  pl.platform = null;
  pl.invulnUntil = time + INVULN_MS;
  pl.sprite.setPosition(pl.x, pl.y);
}

function eliminate(scene, pl) {
  pl.alive = false;
  pl.sprite.clearTint();
  // animación de salida: gira y se encoge
  scene.tweens.add({
    targets: pl.sprite,
    angle: pl.sprite.angle + 540,
    scaleX: 0,
    scaleY: 0,
    alpha: 0,
    duration: 500,
    ease: "Cubic.In",
    onComplete: () => pl.sprite.setVisible(false),
  });
}

// =====================================================================
// Efectos visuales (partículas, hitos, estrellas fugaces)
// =====================================================================

function burst(scene, field, x, y, color, count, spread, life) {
  for (let i = 0; i < count; i++) {
    const p = scene.add.circle(x, y, Phaser.Math.Between(2, 4), color, 0.9);
    field.layer.add(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = Phaser.Math.Between(spread * 0.4, spread);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(ang) * dist,
      y: y + Math.sin(ang) * dist - 6,
      alpha: 0,
      scale: 0.2,
      duration: life,
      ease: "Quad.Out",
      onComplete: () => p.destroy(),
    });
  }
}

// Animación tipo cómic al perder una vida ("¡PUM!", "¡ZAS!"...)
function comicHit(scene, field, x, y) {
  const words = ["¡PUM!", "¡ZAS!", "¡AY!", "¡BAM!", "¡UFF!"];
  const word = words[Math.floor(Math.random() * words.length)];
  const star = scene.add.star(0, 0, 11, 16, 32, 0xffe34d).setStrokeStyle(3, 0xff3b3b);
  const txt = scene.add.text(0, 2, word, {
    fontFamily: "monospace", fontSize: "18px", color: "#c81d25", fontStyle: "bold",
  }).setOrigin(0.5);
  const c = scene.add.container(x, y, [star, txt]).setDepth(20);
  field.layer.add(c);
  c.setScale(0.2);
  scene.tweens.add({
    targets: c,
    scale: 1.15,
    angle: Phaser.Math.Between(-12, 12),
    duration: 150,
    ease: "Back.Out",
    onComplete: () => {
      scene.tweens.add({
        targets: c, alpha: 0, scale: 1.4, duration: 360, delay: 240,
        onComplete: () => c.destroy(),
      });
    },
  });
}

function showMilestone(scene, field, h) {
  const pop = field.hud.popup;
  pop.setText("¡" + h + "m!");
  pop.setAlpha(1).setScale(1);
  scene.tweens.killTweensOf(pop);
  scene.tweens.add({
    targets: pop,
    scale: 1.6,
    alpha: 0,
    duration: 900,
    ease: "Quad.Out",
  });
  tone(scene, 1200, 0.12, 0.12);
}

function shootingStar(scene, field, cam) {
  const x = field.originX + Phaser.Math.Between(40, field.width - 20);
  const y = cam.scrollY + Phaser.Math.Between(20, 200);
  const s = scene.add.rectangle(x, y, 3, 3, 0xffffff, 0.9);
  field.layer.add(s);
  scene.tweens.add({
    targets: s,
    x: x - 130,
    y: y + 90,
    alpha: 0,
    duration: 700,
    onComplete: () => s.destroy(),
  });
}

function recyclePlatforms(field, cam) {
  const limit = cam.scrollY + H + 80;
  const h = field.maxHeight;
  for (const p of field.platforms) {
    if (p.y > limit) {
      if (p.w !== PLAT_W) {
        p.w = PLAT_W;
        p.base.setSize(PLAT_W, PLAT_H);
        p.cap.setSize(PLAT_W, 4);
      }
      p.container.setVisible(true).setAlpha(1);
      spawnAbove(field, p, h);
    }
  }
}

function recycleStars(field, cam) {
  const limit = cam.scrollY + H + 10;
  const top = cam.scrollY - 10;
  for (const st of field.stars) {
    if (st.y > limit) {
      st.y = top;
      st.x = field.originX + Phaser.Math.Between(6, field.width - 6);
    }
  }
}

// =====================================================================
// HUD (uno por jugador, repartido por cámara)
// =====================================================================

function createHud(scene) {
  scene.hud = {
    p1: makeHudSide(scene, "#00e0ff"),
    p2: makeHudSide(scene, "#ff5da2"),
  };
  scene.fields[0].hud = scene.hud.p1;
  scene.fields[1].hud = scene.hud.p2;
}

function makeHudSide(scene, color) {
  const container = scene.add.container(0, 0).setScrollFactor(0).setDepth(100);
  const name = scene.add.text(10, 8, "", {
    fontFamily: "monospace", fontSize: "13px", color, fontStyle: "bold",
  });
  const height = scene.add.text(10, 26, "", {
    fontFamily: "monospace", fontSize: "20px", color: "#e1ff00", fontStyle: "bold",
  });
  const lives = scene.add.text(SPLIT_W - 10, 12, "", {
    fontFamily: "monospace", fontSize: "18px", color,
  }).setOrigin(1, 0);
  const divider = scene.add.rectangle(SPLIT_W - 2, H / 2, 3, H, COLORS.divider, 0.8);
  const popup = scene.add.text(SPLIT_W / 2, 120, "", {
    fontFamily: "monospace", fontSize: "26px", color: "#e1ff00", fontStyle: "bold",
  }).setOrigin(0.5).setAlpha(0);
  container.add([name, height, lives, divider, popup]);
  return { container, name, height, lives, divider, popup, color };
}

function refreshHud(scene) {
  scene.hud.p1.container.setVisible(true);
  scene.hud.p2.container.setVisible(scene.state.twoPlayers);
  scene.hud.p1.divider.setVisible(scene.state.twoPlayers);
  scene.hud.p2.divider.setVisible(false);
}

function refreshFieldHud(scene, field) {
  const pl = field.player;
  const tag = pl.index === 0 ? "P1" : "P2";
  field.hud.name.setText(tag + " " + CHARACTERS[pl.charIndex].name);
  field.hud.height.setText(String(pl.height).padStart(4, "0") + "m");
  field.hud.lives.setText(pl.alive ? "♥".repeat(pl.lives) : "FUERA");
  // latido de alerta cuando queda una sola vida
  const lv = field.hud.lives;
  if (pl.alive && pl.lives <= 1) {
    lv.setColor("#ff4d4d").setScale(1 + Math.sin(scene.time.now * 0.012) * 0.18);
  } else {
    lv.setColor(field.hud.color).setScale(1);
  }
}

// =====================================================================
// Pantalla de inicio
// =====================================================================

function createStartScreen(scene) {
  scene.startScreen = {};
  const c = scene.add.container(0, 0).setScrollFactor(0).setDepth(200);
  c.add(scene.add.image(W / 2, H / 2, "menu_bg"));
  c.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x0a0a2a, 0.3));
  c.add(scene.add.rectangle(W / 2, 92, 700, 120, 0x0a0a2a, 0.6).setStrokeStyle(3, 0xffb86a, 0.85));
  const titleTop = scene.add.text(W / 2, 58, "PRESIDENT OF MEXICO", {
    fontFamily: "monospace", fontSize: "30px", color: "#8cff5d", fontStyle: "bold",
  }).setOrigin(0.5);
  c.add(titleTop);
  scene.tweens.add({
    targets: titleTop, scaleX: 1.05, scaleY: 1.05,
    duration: 1000, yoyo: true, repeat: -1, ease: "Sine.InOut",
  });
  c.add(scene.add.text(W / 2, 88, "or", {
    fontFamily: "monospace", fontSize: "16px", color: "#f7ffd8",
  }).setOrigin(0.5));
  c.add(scene.add.text(W / 2, 120, "FEDERAL COURT NEW YORK", {
    fontFamily: "monospace", fontSize: "26px", color: "#ff5d5d", fontStyle: "bold",
  }).setOrigin(0.5));
  c.add(scene.add.rectangle(W / 2, 342, 600, 384, 0x0a0a2a, 0.5).setStrokeStyle(2, 0x2b3566, 0.8));
  c.add(scene.add.text(W / 2, 188,
    "Salta de plataforma en plataforma y sube lo más alto posible.\n" +
    "Joystick: moverte  ·  ARRIBA: saltar  ·  BOTON 1: doble impulso\n" +
    "Esquiva torretas y drones. Si caes, ¡te DEPORTAN! (pierdes vida)\n" +
    "2 jugadores: PANTALLA DIVIDIDA, gana quien más alto llegue.",
    { fontFamily: "monospace", fontSize: "13px", color: "#dfe6ff", align: "center" },
  ).setOrigin(0.5));
  const mkBtn = (y, label) =>
    scene.add.text(W / 2, y, label, {
      fontFamily: "monospace", fontSize: "20px", color: "#f7ffd8",
      fontStyle: "bold", backgroundColor: "#1b2a6b", padding: { x: 16, y: 8 },
    }).setOrigin(0.5);
  scene.startScreen.btn1 = mkBtn(290, "1 JUGADOR");
  scene.startScreen.btn2 = mkBtn(340, "2 JUGADORES");
  c.add(scene.startScreen.btn1);
  c.add(scene.startScreen.btn2);
  c.add(scene.add.text(W / 2, 390, "Joystick ARRIBA/ABAJO para elegir  ·  START o BOTON 1", {
    fontFamily: "monospace", fontSize: "12px", color: "#8b95bb",
  }).setOrigin(0.5));
  c.add(scene.add.text(W / 2, 440, "— MEJORES ALTURAS —", {
    fontFamily: "monospace", fontSize: "13px", color: "#e1ff00", fontStyle: "bold",
  }).setOrigin(0.5));
  scene.startScreen.lead = scene.add.text(W / 2, 470, "", {
    fontFamily: "monospace", fontSize: "13px", color: "#f7ffd8", align: "center",
  }).setOrigin(0.5);
  c.add(scene.startScreen.lead);
  scene.startScreen.container = c;
}

function showStartScreen(scene) {
  scene.state.phase = "start";
  scene.state.nav = scene.state.twoPlayers ? 1 : 0;
  teardownCameras(scene);
  hideField(scene.fields[1]);
  scene.hud.p1.container.setVisible(false);
  scene.hud.p2.container.setVisible(false);
  scene.selectScreen.container.setVisible(false);
  scene.resultsScreen.container.setVisible(false);
  scene.startScreen.container.setVisible(true);
  updateStartCursor(scene);
}

function updateStartCursor(scene) {
  const sel = scene.state.nav;
  scene.startScreen.btn1.setBackgroundColor(sel === 0 ? "#e1ff00" : "#1b2a6b");
  scene.startScreen.btn1.setColor(sel === 0 ? "#04110b" : "#f7ffd8");
  scene.startScreen.btn2.setBackgroundColor(sel === 1 ? "#e1ff00" : "#1b2a6b");
  scene.startScreen.btn2.setColor(sel === 1 ? "#04110b" : "#f7ffd8");
}

function handleStartMenu(scene) {
  if (consumeAnyPressedControl(scene, ["P1_U", "P2_U", "P1_D", "P2_D"])) {
    scene.state.nav = scene.state.nav === 0 ? 1 : 0;
    updateStartCursor(scene);
    tone(scene, 500, 0.05, 0.1);
  }
  if (consumeAnyPressedControl(scene, ["START1", "START2", "P1_1", "P2_1"])) {
    scene.state.twoPlayers = scene.state.nav === 1;
    tone(scene, 760, 0.1, 0.12);
    showSelect(scene);
  }
}

// =====================================================================
// Pantalla de selección de personaje
// =====================================================================

function createSelectScreen(scene) {
  scene.selectScreen = {};
  const c = scene.add.container(0, 0).setScrollFactor(0).setDepth(200);
  c.add(scene.add.image(W / 2, H / 2, "menu_bg"));
  c.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x0a0a2a, 0.62));
  c.add(scene.add.text(W / 2, 60, "ELIGE TU CANDIDATO", {
    fontFamily: "monospace", fontSize: "30px", color: "#e1ff00", fontStyle: "bold",
  }).setOrigin(0.5));

  scene.selectScreen.p1Sprite = scene.add.sprite(W / 2 - 180, 250, CHARACTERS[0].key).setScale(4);
  scene.selectScreen.p1Name = scene.add.text(W / 2 - 180, 340, "", {
    fontFamily: "monospace", fontSize: "15px", color: "#00e0ff", fontStyle: "bold",
  }).setOrigin(0.5);
  scene.selectScreen.p1Ready = scene.add.text(W / 2 - 180, 368, "", {
    fontFamily: "monospace", fontSize: "14px", color: "#8cff5d", fontStyle: "bold",
  }).setOrigin(0.5);
  c.add(scene.add.text(W / 2 - 180, 150, "P1", {
    fontFamily: "monospace", fontSize: "22px", color: "#00e0ff", fontStyle: "bold",
  }).setOrigin(0.5));
  c.add([scene.selectScreen.p1Sprite, scene.selectScreen.p1Name, scene.selectScreen.p1Ready]);

  scene.selectScreen.p2Sprite = scene.add.sprite(W / 2 + 180, 250, CHARACTERS[1].key).setScale(4);
  scene.selectScreen.p2Name = scene.add.text(W / 2 + 180, 340, "", {
    fontFamily: "monospace", fontSize: "15px", color: "#ff5da2", fontStyle: "bold",
  }).setOrigin(0.5);
  scene.selectScreen.p2Ready = scene.add.text(W / 2 + 180, 368, "", {
    fontFamily: "monospace", fontSize: "14px", color: "#8cff5d", fontStyle: "bold",
  }).setOrigin(0.5);
  scene.selectScreen.p2Label = scene.add.text(W / 2 + 180, 150, "P2", {
    fontFamily: "monospace", fontSize: "22px", color: "#ff5da2", fontStyle: "bold",
  }).setOrigin(0.5);
  c.add([scene.selectScreen.p2Label, scene.selectScreen.p2Sprite, scene.selectScreen.p2Name, scene.selectScreen.p2Ready]);

  c.add(scene.add.text(W / 2, 440,
    "Joystick IZQ/DER: cambiar  ·  BOTON 1: confirmar  ·  BOTON 2: cambiar\n" +
    "START para volver al menú",
    { fontFamily: "monospace", fontSize: "12px", color: "#8b95bb", align: "center" },
  ).setOrigin(0.5));

  // rebote idle de las vistas previas
  scene.tweens.add({
    targets: scene.selectScreen.p1Sprite, y: "+=10",
    duration: 700, yoyo: true, repeat: -1, ease: "Sine.InOut",
  });
  scene.tweens.add({
    targets: scene.selectScreen.p2Sprite, y: "+=10",
    duration: 700, yoyo: true, repeat: -1, ease: "Sine.InOut", delay: 350,
  });

  scene.selectScreen.container = c;
}

function showSelect(scene) {
  scene.state.phase = "select";
  scene.state.sel = { p1: 0, p2: 1 % CHARACTERS.length, p1ok: false, p2ok: false, cd1: 0, cd2: 0 };
  teardownCameras(scene);
  scene.hud.p1.container.setVisible(false);
  scene.hud.p2.container.setVisible(false);
  scene.startScreen.container.setVisible(false);
  const two = scene.state.twoPlayers;
  scene.selectScreen.p2Sprite.setVisible(two);
  scene.selectScreen.p2Name.setVisible(two);
  scene.selectScreen.p2Ready.setVisible(two);
  scene.selectScreen.p2Label.setVisible(two);
  scene.selectScreen.container.setVisible(true);
  refreshSelect(scene);
}

function refreshSelect(scene) {
  const s = scene.state.sel;
  const ss = scene.selectScreen;
  ss.p1Sprite.setTexture(CHARACTERS[s.p1].key);
  ss.p1Name.setText(CHARACTERS[s.p1].name);
  ss.p1Ready.setText(s.p1ok ? "LISTO" : "");
  ss.p2Sprite.setTexture(CHARACTERS[s.p2].key);
  ss.p2Name.setText(CHARACTERS[s.p2].name);
  ss.p2Ready.setText(s.p2ok ? "LISTO" : "");
}

function handleSelect(scene, time) {
  const s = scene.state.sel;
  const two = scene.state.twoPlayers;
  const n = CHARACTERS.length;
  if (consumeAnyPressedControl(scene, ["START1", "START2"])) {
    showStartScreen(scene);
    return;
  }
  if (!s.p1ok && time > s.cd1) {
    if (isControlHeld(scene, "P1_L")) {
      s.p1 = (s.p1 + n - 1) % n; s.cd1 = time + 180; refreshSelect(scene); tone(scene, 520, 0.04, 0.1);
    } else if (isControlHeld(scene, "P1_R")) {
      s.p1 = (s.p1 + 1) % n; s.cd1 = time + 180; refreshSelect(scene); tone(scene, 520, 0.04, 0.1);
    }
  }
  if (consumePressed(scene, "P1_1")) { s.p1ok = true; refreshSelect(scene); tone(scene, 760, 0.08, 0.12); }
  if (consumePressed(scene, "P1_2")) { s.p1ok = false; refreshSelect(scene); }
  if (two) {
    if (!s.p2ok && time > s.cd2) {
      if (isControlHeld(scene, "P2_L")) {
        s.p2 = (s.p2 + n - 1) % n; s.cd2 = time + 180; refreshSelect(scene); tone(scene, 520, 0.04, 0.1);
      } else if (isControlHeld(scene, "P2_R")) {
        s.p2 = (s.p2 + 1) % n; s.cd2 = time + 180; refreshSelect(scene); tone(scene, 520, 0.04, 0.1);
      }
    }
    if (consumePressed(scene, "P2_1")) { s.p2ok = true; refreshSelect(scene); tone(scene, 760, 0.08, 0.12); }
    if (consumePressed(scene, "P2_2")) { s.p2ok = false; refreshSelect(scene); }
  }
  if (s.p1ok && (!two || s.p2ok)) {
    tone(scene, 900, 0.12, 0.13);
    startMatch(scene);
  }
}

// =====================================================================
// Resultados + iniciales
// =====================================================================

function createResultsScreen(scene) {
  scene.resultsScreen = {};
  const c = scene.add.container(0, 0).setScrollFactor(0).setDepth(200);
  c.add(scene.add.image(W / 2, H / 2, "menu_bg"));
  c.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x0a0a2a, 0.62));
  c.add(scene.add.text(W / 2, 64, "FIN DE LA CAMPAÑA", {
    fontFamily: "monospace", fontSize: "32px", color: "#e1ff00", fontStyle: "bold",
  }).setOrigin(0.5));
  scene.resultsScreen.result = scene.add.text(W / 2, 150, "", {
    fontFamily: "monospace", fontSize: "20px", color: "#f7ffd8", align: "center", fontStyle: "bold",
  }).setOrigin(0.5);
  c.add(scene.resultsScreen.result);
  scene.resultsScreen.prompt = scene.add.text(W / 2, 240, "Escribe tus iniciales:", {
    fontFamily: "monospace", fontSize: "15px", color: "#b9c2e0",
  }).setOrigin(0.5);
  c.add(scene.resultsScreen.prompt);
  scene.resultsScreen.initials = scene.add.text(W / 2, 292, "", {
    fontFamily: "monospace", fontSize: "44px", color: "#e1ff00", fontStyle: "bold",
  }).setOrigin(0.5);
  c.add(scene.resultsScreen.initials);
  scene.resultsScreen.help = scene.add.text(W / 2, 350,
    "Joystick: ARRIBA/ABAJO letra · IZQ/DER hueco\nBOTON 1: guardar    ·    START: omitir",
    { fontFamily: "monospace", fontSize: "12px", color: "#8b95bb", align: "center" },
  ).setOrigin(0.5);
  c.add(scene.resultsScreen.help);
  scene.resultsScreen.status = scene.add.text(W / 2, 410, "", {
    fontFamily: "monospace", fontSize: "13px", color: "#ff5da2",
  }).setOrigin(0.5);
  c.add(scene.resultsScreen.status);
  c.add(scene.add.text(W / 2, 460, "— MEJORES ALTURAS —", {
    fontFamily: "monospace", fontSize: "13px", color: "#e1ff00", fontStyle: "bold",
  }).setOrigin(0.5));
  scene.resultsScreen.lead = scene.add.text(W / 2, 490, "", {
    fontFamily: "monospace", fontSize: "13px", color: "#f7ffd8", align: "center",
  }).setOrigin(0.5);
  c.add(scene.resultsScreen.lead);
  scene.resultsScreen.container = c;
}

function endMatch(scene) {
  const s = scene.state;
  const p1 = scene.players[0];
  const p2 = scene.players[1];
  let resultText;
  let best;
  if (s.twoPlayers) {
    if (p1.height > p2.height)
      resultText = "GANA P1\nP1 " + p1.height + "m   ·   P2 " + p2.height + "m";
    else if (p2.height > p1.height)
      resultText = "GANA P2\nP1 " + p1.height + "m   ·   P2 " + p2.height + "m";
    else resultText = "EMPATE\nP1 " + p1.height + "m   ·   P2 " + p2.height + "m";
    best = Math.max(p1.height, p2.height);
  } else {
    resultText = "ALTURA: " + p1.height + "m";
    best = p1.height;
  }
  s.pendingScore = best;
  s.entry = { row: [0, 0, 0], slot: 0, cdUntil: 0 };
  s.phase = "results";
  scene.fields[0].active = false;
  scene.fields[1].active = false;
  teardownCameras(scene);
  scene.hud.p1.container.setVisible(false);
  scene.hud.p2.container.setVisible(false);
  scene.resultsScreen.result.setText(resultText);
  scene.resultsScreen.result.setScale(0.6);
  scene.tweens.add({
    targets: scene.resultsScreen.result, scale: 1, duration: 400, ease: "Back.Out",
  });
  scene.resultsScreen.status.setText("");
  scene.resultsScreen.prompt.setVisible(best > 0);
  scene.resultsScreen.initials.setVisible(best > 0);
  scene.resultsScreen.help.setVisible(best > 0);
  refreshInitials(scene);
  refreshLeaderboards(scene);
  scene.resultsScreen.container.setVisible(true);
  tone(scene, 400, 0.3, 0.14);
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function refreshInitials(scene) {
  const e = scene.state.entry;
  scene.resultsScreen.initials.setText(
    e.row.map((idx, i) => (i === e.slot ? "[" + ALPHABET[idx] + "]" : " " + ALPHABET[idx] + " ")).join(""),
  );
}

function handleResults(scene, time) {
  const e = scene.state.entry;
  const hasScore = scene.state.pendingScore > 0;
  if (hasScore && time > e.cdUntil) {
    let moved = false;
    if (isControlHeld(scene, "P1_U") || isControlHeld(scene, "P2_U")) { e.row[e.slot] = (e.row[e.slot] + 1) % 26; moved = true; }
    else if (isControlHeld(scene, "P1_D") || isControlHeld(scene, "P2_D")) { e.row[e.slot] = (e.row[e.slot] + 25) % 26; moved = true; }
    else if (isControlHeld(scene, "P1_L") || isControlHeld(scene, "P2_L")) { e.slot = (e.slot + 2) % 3; moved = true; }
    else if (isControlHeld(scene, "P1_R") || isControlHeld(scene, "P2_R")) { e.slot = (e.slot + 1) % 3; moved = true; }
    if (moved) { e.cdUntil = time + 160; refreshInitials(scene); tone(scene, 520, 0.04, 0.1); }
  }
  if (hasScore && consumeAnyPressedControl(scene, ["P1_1", "P2_1"])) { saveScore(scene); return; }
  if (consumeAnyPressedControl(scene, ["START1", "START2"])) returnToStart(scene);
}

function saveScore(scene) {
  const e = scene.state.entry;
  const name = e.row.map((i) => ALPHABET[i]).join("");
  const entry = {
    name,
    score: scene.state.pendingScore,
    mode: scene.state.twoPlayers ? "2P" : "1P",
    savedAt: new Date().toISOString().slice(0, 10),
  };
  scene.resultsScreen.status.setText("Guardando...");
  scene.state.phase = "saved";
  persistHighScore(entry)
    .then((scores) => {
      scene.state.highScores = scores;
      refreshLeaderboards(scene);
      scene.resultsScreen.status.setText("¡Guardado " + name + "! START para volver.");
    })
    .catch(() => scene.resultsScreen.status.setText("No se pudo guardar. START para volver."));
}

function returnToStart(scene) {
  showStartScreen(scene);
}

// =====================================================================
// Leaderboard
// =====================================================================

function refreshLeaderboards(scene) {
  const lines = scene.state.highScores.length
    ? scene.state.highScores.map(
        (e, i) =>
          String(i + 1) + ". " + e.name.padEnd(3, " ") + "  " +
          String(e.score).padStart(4, "0") + "m  " + e.mode,
      )
    : ["SIN PUNTAJES AUN"];
  const text = lines.join("\n");
  if (scene.startScreen) scene.startScreen.lead.setText(text);
  if (scene.resultsScreen) scene.resultsScreen.lead.setText(text);
}

// =====================================================================
// Audio (tonos generados)
// =====================================================================

function tone(scene, freq, dur, vol) {
  try {
    const ctx = scene.sound.context;
    if (!ctx || ctx.state === "suspended") return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.stop(ctx.currentTime + dur);
  } catch (err) {}
}

// =====================================================================
// Input (cabinet bridge) — NO modificar el mapeo CABINET_KEYS
// =====================================================================

function createControls(scene) {
  scene.controls = { held: Object.create(null), pressed: Object.create(null) };
  const onKeyDown = (event) => {
    const key = normalizeIncomingKey(event.key);
    if (!key) return;
    const arcadeCode = KEYBOARD_TO_ARCADE[key];
    if (!arcadeCode) return;
    if (!scene.controls.held[arcadeCode]) scene.controls.pressed[arcadeCode] = true;
    scene.controls.held[arcadeCode] = true;
  };
  const onKeyUp = (event) => {
    const key = normalizeIncomingKey(event.key);
    if (!key) return;
    const arcadeCode = KEYBOARD_TO_ARCADE[key];
    if (!arcadeCode) return;
    scene.controls.held[arcadeCode] = false;
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  scene.events.once("shutdown", () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  });
}

function normalizeIncomingKey(key) {
  if (typeof key !== "string" || key.length === 0) return "";
  if (key === " ") return "space";
  return key.toLowerCase();
}

function isControlHeld(scene, controlCode) {
  return scene.controls.held[controlCode] === true;
}

function consumePressed(scene, controlCode) {
  if (scene.controls.pressed[controlCode]) {
    scene.controls.pressed[controlCode] = false;
    return true;
  }
  return false;
}

function consumeAnyPressedControl(scene, controlCodes) {
  for (const controlCode of controlCodes) {
    if (scene.controls.pressed[controlCode]) {
      scene.controls.pressed[controlCode] = false;
      return true;
    }
  }
  return false;
}

// =====================================================================
// Storage
// =====================================================================

async function persistHighScore(entry) {
  const existing = await loadHighScores();
  const next = existing
    .concat(entry)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.savedAt < b.savedAt ? 1 : -1))
    .slice(0, MAX_SCORES);
  await storageSet(STORAGE_KEY, next);
  return next;
}

async function loadHighScores() {
  const result = await storageGet(STORAGE_KEY);
  if (!result.found || !Array.isArray(result.value)) return [];
  return result.value.filter(isHighScoreEntry).slice(0, MAX_SCORES);
}

function isHighScoreEntry(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.name === "string" &&
    typeof value.score === "number" &&
    typeof value.mode === "string" &&
    typeof value.savedAt === "string"
  );
}

function getStorage() {
  if (window.platanusArcadeStorage) return window.platanusArcadeStorage;
  return {
    async get(key) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? { found: false, value: null } : { found: true, value: JSON.parse(raw) };
      } catch {
        return { found: false, value: null };
      }
    },
    async set(key, value) {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
  };
}

async function storageGet(key) {
  return getStorage().get(key);
}
async function storageSet(key, value) {
  return getStorage().set(key, value);
}
