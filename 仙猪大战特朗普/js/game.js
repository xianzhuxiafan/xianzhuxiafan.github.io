'use strict';
/* ================================================================
 * 仙猪大战特朗普 · 游戏主逻辑
 * 模块：路径系统 / 波次 / 塔与敌人 / 弹道粒子 / 渲染 / UI / 存档
 * ================================================================ */

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const GAME_W = COLS * TILE;
const GAME_H = ROWS * TILE;

/* DOM 引用 */
const $ = id => document.getElementById(id);
const dom = {
  menu: $('menu'), game: $('game'), helpModal: $('helpModal'), overlay: $('overlay'),
  btnStart: $('btnStart'), btnContinue: $('btnContinue'), btnHelp: $('btnHelp'), btnHelpClose: $('btnHelpClose'),
  hudLives: $('hudLives'), hudGold: $('hudGold'), hudWave: $('hudWave'),
  btnWave: $('btnWave'), btnSkill: $('btnSkill'), skillInfo: $('skillInfo'),
  btnSpeed: $('btnSpeed'), btnPause: $('btnPause'), btnMute: $('btnMute'), btnMenu: $('btnMenu'),
  shop: $('shop'), towerPanel: $('towerPanel'), waveInfo: $('waveInfo'), redFlash: $('redFlash'),
  pName: $('pName'), pLevel: $('pLevel'), pDmg: $('pDmg'), pRange: $('pRange'), pRate: $('pRate'),
  pSpecialLine: $('pSpecialLine'), pSpecial: $('pSpecial'),
  btnUpgrade: $('btnUpgrade'), btnSell: $('btnSell'),
  ovTitle: $('ovTitle'), ovText: $('ovText'), ovButtons: $('ovButtons'),
  canvasBox: $('canvasBox')
};

/* ---------------- 路径构建（沿航点的折线） ---------------- */
function buildPath() {
  const wps = MAP_WAYPOINTS.map(([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }));
  const tiles = new Set();
  for (let i = 0; i < MAP_WAYPOINTS.length - 1; i++) {
    const a = MAP_WAYPOINTS[i], b = MAP_WAYPOINTS[i + 1];
    const dc = Math.sign(b[0] - a[0]), dr = Math.sign(b[1] - a[1]);
    let c = a[0], r = a[1];
    tiles.add(c + ',' + r);
    while (c !== b[0] || r !== b[1]) { c += dc; r += dr; tiles.add(c + ',' + r); }
  }
  const segs = [];
  let total = 0;
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({
      a, b, len, start: total,
      dx: (b.x - a.x) / len, dy: (b.y - a.y) / len,
      ang: Math.atan2(b.y - a.y, b.x - a.x)
    });
    total += len;
  }
  return { wps, tiles, segs, total };
}
const PATH = buildPath();

function posAt(d) {
  const s0 = PATH.segs[0];
  if (d <= 0) return { x: s0.a.x, y: s0.a.y, ang: s0.ang };
  for (const s of PATH.segs) {
    if (d <= s.start + s.len) {
      const k = d - s.start;
      return { x: s.a.x + s.dx * k, y: s.a.y + s.dy * k, ang: s.ang };
    }
  }
  const last = PATH.segs[PATH.segs.length - 1];
  return { x: last.b.x, y: last.b.y, ang: last.ang };
}

/* 确定性伪随机（装饰用） */
function hash2(c, r, s) {
  let n = (c * 73856093) ^ (r * 19349663) ^ ((s || 0) * 83492791);
  n = (n << 13) ^ n;
  return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff;
}
const rand = (a, b) => a + Math.random() * (b - a);
const rr = (x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/* ---------------- 游戏状态 ---------------- */
function freshState() {
  return {
    screen: 'menu',
    paused: false,
    result: null,
    speed: 1,
    gold: BALANCE.startGold,
    lives: BALANCE.startLives,
    waveIndex: 0,           // 即将开始的波次（0 基）
    phase: 'idle',          // idle | running
    enemies: [], towers: [], projectiles: [], particles: [], texts: [], meteors: [],
    spawnQueue: [], waveClock: 0,
    shopSel: null, selTower: null, hover: null,
    skill: { charges: BALANCE.skillStartCharges, regen: 0, armed: false },
    shake: 0, time: 0
  };
}
const G = freshState();
window.__G = G;   // 自动化测试钩子

/* ================================================================
 * 存档
 * ================================================================ */
function save() {
  if (G.phase !== 'idle') return;   // 波次进行中不写档，读档回到本波开头
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      gold: G.gold, lives: G.lives, waveIndex: G.waveIndex,
      towers: G.towers.map(t => ({ type: t.type, c: t.c, r: t.r, level: t.level, spent: t.spent })),
      charges: G.skill.charges, regen: G.skill.regen
    }));
  } catch (e) {}
}
function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

/* ================================================================
 * 流程控制
 * ================================================================ */
function enterPlay() {
  dom.menu.classList.add('hidden');
  dom.helpModal.classList.add('hidden');
  dom.overlay.classList.add('hidden');
  dom.game.classList.remove('hidden');
  G.screen = 'play';
  requestAnimationFrame(fitCanvas);
  updateHUD(); updateShop(); updateWaveInfo(); updateTowerPanel();
}

function newGame() {
  const keep = G.screen;
  Object.assign(G, freshState(), { screen: 'play' });
  G.skill.charges = BALANCE.skillStartCharges;
  enterPlay();
  save();
}

function continueGame() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
  Object.assign(G, freshState(), { screen: 'play' });
  if (data && Array.isArray(data.towers)) {
    G.gold = ~~data.gold || BALANCE.startGold;
    G.lives = ~~data.lives || BALANCE.startLives;
    G.waveIndex = Math.min(~~data.waveIndex || 0, WAVES.length);
    G.skill.charges = Math.min(data.charges || 1, BALANCE.skillMaxCharges);
    G.skill.regen = data.regen || 0;
    data.towers.forEach(d => {
      if (!TOWER_TYPES[d.type]) return;
      if (!isBuildable(d.c, d.r)) return;
      G.towers.push(makeTower(d.type, d.c, d.r, d.level || 0, d.spent));
    });
  }
  enterPlay();
  save();
}

function toMenu() {
  G.screen = 'menu';
  G.paused = false; G.skill.armed = false;
  hideOverlay();
  dom.game.classList.add('hidden');
  dom.menu.classList.remove('hidden');
  refreshContinue();
}

function showOverlay(title, text, buttons) {
  dom.ovTitle.textContent = title;
  dom.ovText.textContent = text || '';
  dom.ovButtons.innerHTML = '';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'big-btn' + (b.cls ? ' ' + b.cls : '');
    btn.textContent = b.label;
    btn.onclick = b.fn;
    dom.ovButtons.appendChild(btn);
  });
  dom.overlay.classList.remove('hidden');
}
function hideOverlay() { dom.overlay.classList.add('hidden'); }

function togglePause() {
  if (G.result) return;
  G.paused = !G.paused;
  if (G.paused) {
    showOverlay('⏸ 暂停中', '仙猪们原地待命', [
      { label: '▶ 继续战斗', fn: () => { G.paused = false; hideOverlay(); } },
      { label: '🔄 重新开始', cls: 'ghost', fn: () => { clearSave(); newGame(); } },
      { label: '🏠 回主菜单', cls: 'ghost', fn: toMenu }
    ]);
  } else hideOverlay();
  updateHUD();
}

function endGame(win) {
  G.result = win ? 'win' : 'lose';
  G.skill.armed = false;
  clearSave();
  Sound.play(win ? 'win' : 'lose');
  if (win) {
    showOverlay('🎉 仙猪大获全胜！', '特朗普被仙猪们赶回老家发推特了！全部 15 波敌军已被击退。', [
      { label: '🔄 再战一局', fn: newGame },
      { label: '🏠 回主菜单', cls: 'ghost', fn: toMenu }
    ]);
  } else {
    showOverlay('💥 洞府失守…', '敌军冲破了仙猪的防线，再接再厉！', [
      { label: '🔄 重新挑战', fn: newGame },
      { label: '🏠 回主菜单', cls: 'ghost', fn: toMenu }
    ]);
  }
}

/* ================================================================
 * 波次与出怪
 * ================================================================ */
function startWave() {
  if (G.phase !== 'idle' || G.waveIndex >= WAVES.length || G.paused || G.result) return;
  const wave = WAVES[G.waveIndex];
  const q = [];
  wave.groups.forEach(gr => {
    const delay = gr.delay || 0;
    for (let i = 0; i < gr.count; i++) q.push({ t: delay + i * gr.interval, type: gr.type });
  });
  q.sort((a, b) => a.t - b.t);
  G.spawnQueue = q;
  G.waveClock = 0;
  G.phase = 'running';
  Sound.play('wave');
  updateHUD();
}

function spawnEnemy(type, dist) {
  const cfg = ENEMY_TYPES[type];
  const mult = cfg.boss ? 1 : 1 + G.waveIndex * BALANCE.hpGrowPerWave;
  const maxHp = Math.round(cfg.hp * mult);
  G.enemies.push({
    type, cfg, hp: maxHp, maxHp,
    dist: dist || 0, speed: cfg.speed * TILE,
    slowT: 0, slowF: 1, hitFlash: 0, age: 0,
    dead: false, summons: [false, false],
    x: 0, y: 0, ang: 0
  });
}

function bossSummon(boss, type, n) {
  for (let i = 0; i < n; i++) {
    spawnEnemy(type, Math.max(0, boss.dist - 36 - i * 28));
  }
  addText(boss.x, boss.y - boss.cfg.radius - 18, '📱特朗普发推召唤援军！', '#ff5252', 13);
  Sound.play('wave');
}

function completeWave() {
  const cleared = G.waveIndex + 1;
  const bonus = BALANCE.waveBonusBase + cleared * BALANCE.waveBonusPerWave;
  G.gold += bonus;
  addText(GAME_W / 2, 90, '第 ' + cleared + ' 波击退！奖励 +' + bonus, '#ffd54f', 22);
  G.waveIndex++;
  G.phase = 'idle';
  if (G.waveIndex >= WAVES.length) {
    updateHUD();
    endGame(true);
    return;
  }
  save();
  updateHUD(); updateWaveInfo();
}

/* ================================================================
 * 建塔 / 升级 / 出售
 * ================================================================ */
function isBuildable(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
  if (PATH.tiles.has(c + ',' + r)) return false;
  return !G.towers.some(t => t.c === c && t.r === r);
}

function makeTower(type, c, r, level, spent) {
  const def = TOWER_TYPES[type];
  return {
    type, c, r, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2,
    level: level || 0, cd: 0,
    spent: spent != null ? spent : def.cost,
    aim: -Math.PI / 2
  };
}

function tryPlace(c, r) {
  const def = TOWER_TYPES[G.shopSel];
  if (!isBuildable(c, r)) {
    addText(c * TILE + TILE / 2, r * TILE + TILE / 2, '不能放这里', '#ff8a80', 14);
    return;
  }
  if (G.gold < def.cost) {
    addText(c * TILE + TILE / 2, r * TILE + TILE / 2, '金币不足', '#ff8a80', 14);
    Sound.play('sell');
    return;
  }
  G.gold -= def.cost;
  const t = makeTower(G.shopSel, c, r);
  G.towers.push(t);
  burst(t.x, t.y, '#ffe082', 10);
  ring(t.x, t.y, 30, '#ffffff');
  Sound.play('build');
  save(); updateHUD(); updateShop();
}

function upgradeTower() {
  const t = G.selTower;
  if (!t || t.level >= 2) return;
  const def = TOWER_TYPES[t.type];
  const cost = def.upCost[t.level];
  if (G.gold < cost) { Sound.play('sell'); return; }
  G.gold -= cost; t.level++; t.spent += cost;
  ring(t.x, t.y, 38, '#ffd54f');
  burst(t.x, t.y - 8, '#ffd54f', 14);
  addText(t.x, t.y - 34, '升级！', '#ffd54f', 15);
  Sound.play('upgrade');
  save(); updateHUD(); updateTowerPanel();
}

function sellTower() {
  const t = G.selTower;
  if (!t) return;
  const val = Math.round(t.spent * BALANCE.sellRate);
  G.gold += val;
  G.towers = G.towers.filter(x => x !== t);
  G.selTower = null;
  burst(t.x, t.y, '#bcaaa4', 8);
  addText(t.x, t.y - 20, '+' + val, '#ffd54f', 15);
  Sound.play('sell');
  save(); updateHUD(); updateShop(); updateTowerPanel();
}

/* ================================================================
 * 战斗更新
 * ================================================================ */
function damageEnemy(e, dmg) {
  if (e.dead) return;
  e.hp -= dmg;
  e.hitFlash = 0.08;
  if (e.hp <= 0) {
    e.dead = true;
    G.gold += e.cfg.gold;
    addText(e.x, e.y - e.cfg.radius - 6, '+' + e.cfg.gold, '#ffd54f', e.cfg.boss ? 22 : 14);
    burst(e.x, e.y, e.cfg.boss ? '#ffd54f' : '#fff59d', e.cfg.boss ? 40 : 10);
    ring(e.x, e.y, e.cfg.radius * 1.6, '#ffffff');
    if (e.cfg.boss) G.shake = 18;
    Sound.play(e.cfg.boss ? 'meteor' : 'kill');
  }
}

function applySlow(e, ratio, dur) {
  const f = 1 - ratio;
  if (f < e.slowF || e.slowT <= 0) { e.slowF = f; e.slowT = dur; }
  else { e.slowF = Math.min(e.slowF, f); e.slowT = Math.max(e.slowT, dur); }
}

function explode(x, y, radius, dmg, big) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - x, e.y - y) <= radius + e.cfg.radius) damageEnemy(e, dmg);
  }
  ring(x, y, radius, big ? '#ffab40' : '#ff8a65');
  burst(x, y, big ? '#ff7043' : '#ffb74d', big ? 22 : 12);
  for (let i = 0; i < (big ? 8 : 4); i++) {
    G.particles.push({
      shape: 'circle', x: x + rand(-8, 8), y: y + rand(-8, 8),
      vx: rand(-20, 20), vy: rand(-40, -10), grav: 30,
      life: rand(0.4, 0.8), max: 0.8, size: rand(6, 11), color: 'rgba(90,90,90,0.5)'
    });
  }
  G.shake = Math.max(G.shake, big ? 8 : 4);
  Sound.play('boom');
}

function fireTower(t, st, target) {
  G.projectiles.push({
    kind: t.type, x: t.x, y: t.y - 12, target,
    tx: target.x, ty: target.y,
    speed: st.projSpeed * TILE, dmg: st.dmg,
    splash: st.splash || 0, slow: st.slow || 0, slowDur: st.slowDur || 0,
    ang: t.aim, dead: false
  });
  Sound.play('shoot_' + t.type);
}

function impact(p) {
  if (p.kind === 'archer') {
    if (p.target && !p.target.dead) damageEnemy(p.target, p.dmg);
    else burst(p.tx, p.ty, '#eeeeee', 3);
  } else if (p.kind === 'ice') {
    if (p.target && !p.target.dead) {
      damageEnemy(p.target, p.dmg);
      applySlow(p.target, p.slow, p.slowDur);
      burst(p.target.x, p.target.y, '#81d4fa', 6);
    } else burst(p.tx, p.ty, '#b3e5fc', 3);
  } else {
    explode(p.tx, p.ty, p.splash, p.dmg, p.kind === 'cannon');
  }
}

/* 天蓬之怒 */
function meteorStrike(x, y) {
  G.meteors.push({ sx: x - 80, sy: y - 340, x, y, t: 0, dur: 0.38, hit: false });
}

function update(dt) {
  G.time += dt;

  /* 技能充能 */
  if (G.skill.charges < BALANCE.skillMaxCharges) {
    G.skill.regen += dt;
    if (G.skill.regen >= BALANCE.skillRegen) {
      G.skill.regen = 0;
      G.skill.charges++;
      Sound.play('charge');
      updateHUD();
    }
  }

  /* 出怪 */
  if (G.phase === 'running') {
    G.waveClock += dt;
    while (G.spawnQueue.length && G.spawnQueue[0].t <= G.waveClock) {
      spawnEnemy(G.spawnQueue.shift().type);
    }
  }

  /* 敌人 */
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.age += dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 1; }
    e.dist += e.speed * e.slowF * dt;
    if (e.dist >= PATH.total) {
      e.dead = true;
      G.lives = Math.max(0, G.lives - e.cfg.lives);
      addText(GAME_W - 44, 7 * TILE + 18, '-' + e.cfg.lives + ' ❤', '#ff5252', 18);
      flashRed();
      Sound.play('leak');
      if (G.lives <= 0) { endGame(false); break; }
      continue;
    }
    const p = posAt(e.dist);
    e.x = p.x; e.y = p.y; e.ang = p.ang;
    if (e.cfg.boss) {
      const ratio = e.hp / e.maxHp;
      if (!e.summons[0] && ratio <= 0.6) { e.summons[0] = true; bossSummon(e, 'maga', 3); }
      else if (!e.summons[1] && ratio <= 0.3) { e.summons[1] = true; bossSummon(e, 'suit', 3); }
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);

  /* 防御塔 */
  for (const t of G.towers) {
    t.cd -= dt;
    const st = TOWER_TYPES[t.type].levels[t.level];
    const rangePx = st.range * TILE;
    let target = null, best = -1;
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - t.x, e.y - t.y) <= rangePx && e.dist > best) {
        best = e.dist; target = e;
      }
    }
    if (target) {
      t.aim = Math.atan2(target.y - t.y, target.x - t.x);
      if (t.cd <= 0) { fireTower(t, st, target); t.cd = 1 / st.rate; }
    }
  }

  /* 弹道 */
  for (const p of G.projectiles) {
    if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    p.ang = Math.atan2(dy, dx);
    if (d <= step + 4) { impact(p); p.dead = true; }
    else { p.x += dx / d * step; p.y += dy / d * step; }
  }
  G.projectiles = G.projectiles.filter(p => !p.dead);

  /* 陨石 */
  for (const m of G.meteors) {
    m.t += dt;
    if (m.t >= m.dur && !m.hit) {
      m.hit = true;
      for (const e of G.enemies) {
        if (!e.dead && Math.hypot(e.x - m.x, e.y - m.y) <= BALANCE.skillRadius + e.cfg.radius) {
          damageEnemy(e, BALANCE.skillDamage);
        }
      }
      ring(m.x, m.y, BALANCE.skillRadius, '#ff6e40');
      burst(m.x, m.y, '#ff7043', 30);
      G.shake = 14;
      Sound.play('meteor');
      addText(m.x, m.y - 30, '天蓬之怒！', '#ffab40', 20);
    }
  }
  G.meteors = G.meteors.filter(m => !m.hit || m.t < m.dur + 0.35);

  /* 粒子 */
  for (const q of G.particles) {
    q.life -= dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.grav) q.vy += q.grav * dt;
  }
  G.particles = G.particles.filter(q => q.life > 0);

  /* 浮动文字 */
  for (const tx of G.texts) { tx.life -= dt; tx.y += tx.vy * dt; }
  G.texts = G.texts.filter(tx => tx.life > 0);

  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 40);

  /* 清波判定 */
  if (G.phase === 'running' && G.spawnQueue.length === 0 && G.enemies.length === 0 && !G.result) {
    completeWave();
  }
}

/* 粒子辅助 */
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = rand(40, 150);
    G.particles.push({
      shape: 'circle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      grav: 60, life: rand(0.3, 0.6), max: 0.6, size: rand(2.5, 5), color
    });
  }
}
function ring(x, y, maxR, color) {
  G.particles.push({ shape: 'ring', x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: maxR, color });
}
function addText(x, y, txt, color, size) {
  G.texts.push({ x, y, txt, color, size: size || 14, life: 1.1, max: 1.1, vy: -34 });
}
function flashRed() {
  dom.redFlash.classList.remove('show');
  void dom.redFlash.offsetWidth;
  dom.redFlash.classList.add('show');
}

/* ================================================================
 * 渲染
 * ================================================================ */
function drawGround() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE, y = r * TILE;
      const isPath = PATH.tiles.has(c + ',' + r);
      if (isPath) {
        ctx.fillStyle = (c + r) % 2 ? '#c9a36a' : '#c19a60';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(120,80,40,0.18)';
        for (let k = 0; k < 3; k++) {
          const hx = x + 10 + hash2(c, r, k) * 44, hy = y + 10 + hash2(c, r, k + 9) * 44;
          ctx.fillRect(hx, hy, 3, 3);
        }
      } else {
        ctx.fillStyle = (c + r) % 2 ? '#86c45f' : '#7fbd57';
        ctx.fillRect(x, y, TILE, TILE);
        /* 小花 / 草从装饰 */
        const v = hash2(c, r, 3);
        if (v > 0.82) {
          const fx = x + 14 + hash2(c, r, 4) * 36, fy = y + 14 + hash2(c, r, 5) * 36;
          const cols = ['#fff176', '#f48fb1', '#ffffff', '#ce93d8'];
          ctx.fillStyle = cols[Math.floor(hash2(c, r, 6) * cols.length)];
          for (let p = 0; p < 5; p++) {
            const a = p / 5 * Math.PI * 2;
            ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 3.2, fy + Math.sin(a) * 3.2, 2.2, 0, 7); ctx.fill();
          }
          ctx.fillStyle = '#ffd54f';
          ctx.beginPath(); ctx.arc(fx, fy, 2, 0, 7); ctx.fill();
        } else if (v < 0.12) {
          ctx.strokeStyle = 'rgba(40,100,30,0.5)'; ctx.lineWidth = 2;
          const gx = x + 12 + hash2(c, r, 7) * 40, gy = y + 44;
          ctx.beginPath();
          ctx.moveTo(gx, gy); ctx.lineTo(gx - 3, gy - 8);
          ctx.moveTo(gx, gy); ctx.lineTo(gx + 3, gy - 9);
          ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 10);
          ctx.stroke();
        }
      }
    }
  }
  /* 入口：红色敌营旗 */
  ctx.fillStyle = '#b71c1c';
  rr(2, 2 * TILE + 8, 40, 48, 6); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('敌', 22, 2 * TILE + 33);
  /* 出口：仙猪洞府 */
  ctx.fillStyle = '#616161';
  rr(14 * TILE + 4, 7 * TILE - 4, 58, 72, 14); ctx.fill();
  ctx.fillStyle = '#2e2e2e';
  ctx.beginPath(); ctx.ellipse(14 * TILE + 33, 7 * TILE + 40, 22, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f48fb1';
  ctx.beginPath(); ctx.ellipse(14 * TILE + 33, 7 * TILE + 46, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8d4e63';
  ctx.beginPath(); ctx.arc(14 * TILE + 29, 7 * TILE + 45, 1.6, 0, 7); ctx.arc(14 * TILE + 37, 7 * TILE + 45, 1.6, 0, 7); ctx.fill();
}

function drawPlacementLayer() {
  /* 已选中的塔：射程圈 */
  if (G.selTower) {
    const t = G.selTower;
    const st = TOWER_TYPES[t.type].levels[t.level];
    ctx.fillStyle = 'rgba(255,235,59,0.12)';
    ctx.strokeStyle = 'rgba(255,235,59,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, st.range * TILE, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  /* 待放置预览 */
  const h = G.hover;
  if (G.shopSel && h && h.c >= 0 && h.c < COLS && h.r >= 0 && h.r < ROWS) {
    const ok = isBuildable(h.c, h.r) && G.gold >= TOWER_TYPES[G.shopSel].cost;
    const x = h.c * TILE, y = h.r * TILE;
    ctx.fillStyle = ok ? 'rgba(124,220,80,0.35)' : 'rgba(230,60,60,0.35)';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    const st = TOWER_TYPES[G.shopSel].levels[0];
    ctx.fillStyle = ok ? 'rgba(124,220,80,0.10)' : 'rgba(230,60,60,0.10)';
    ctx.strokeStyle = ok ? 'rgba(90,200,60,0.9)' : 'rgba(220,50,50,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + TILE / 2, y + TILE / 2, st.range * TILE, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (ok) {
      ctx.globalAlpha = 0.65;
      drawPig(x + TILE / 2, y + TILE / 2 + Math.sin(G.time * 3) * 2, G.shopSel, 0, -Math.PI / 2);
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------- 仙猪塔 ---------- */
function drawPig(x, y, type, level, aim) {
  /* 影子 */
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x, y + 19, 20, 7, 0, 0, Math.PI * 2); ctx.fill();

  /* 耳朵 */
  ctx.fillStyle = '#f08bb0';
  ctx.beginPath();
  ctx.moveTo(x - 13, y - 8); ctx.lineTo(x - 19, y - 21); ctx.lineTo(x - 6, y - 15); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 13, y - 8); ctx.lineTo(x + 19, y - 21); ctx.lineTo(x + 6, y - 15); ctx.closePath(); ctx.fill();

  /* 身体 */
  ctx.fillStyle = '#f7b3cc';
  ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#d97a9b'; ctx.stroke();

  /* 红肚兜 */
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.moveTo(x - 9, y + 2); ctx.lineTo(x + 9, y + 2); ctx.lineTo(x + 6, y + 16); ctx.lineTo(x - 6, y + 16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd54f';
  ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('仙', x, y + 10);

  /* 脸 */
  ctx.fillStyle = '#f7b3cc';
  ctx.beginPath(); ctx.arc(x, y - 4, 12, 0, Math.PI * 2); ctx.fill();
  /* 红头巾 */
  ctx.fillStyle = '#d81b60';
  ctx.beginPath(); ctx.arc(x, y - 8, 12, Math.PI, 0); ctx.fill();
  ctx.fillRect(x - 12, y - 10, 24, 4);
  ctx.beginPath(); ctx.moveTo(x + 9, y - 9); ctx.lineTo(x + 20, y - 13); ctx.lineTo(x + 11, y - 4); ctx.closePath(); ctx.fill();
  /* 眼睛 */
  ctx.fillStyle = '#3a2230';
  ctx.beginPath(); ctx.arc(x - 5, y - 3, 1.9, 0, 7); ctx.arc(x + 5, y - 3, 1.9, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - 4.4, y - 3.6, 0.7, 0, 7); ctx.arc(x + 5.6, y - 3.6, 0.7, 0, 7); ctx.fill();
  /* 腮红 */
  ctx.fillStyle = 'rgba(240,80,120,0.35)';
  ctx.beginPath(); ctx.arc(x - 8, y + 2, 2.6, 0, 7); ctx.arc(x + 8, y + 2, 2.6, 0, 7); ctx.fill();
  /* 鼻子 */
  ctx.fillStyle = '#ffc2d4';
  ctx.beginPath(); ctx.ellipse(x, y + 4, 5.4, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a85c78';
  ctx.beginPath(); ctx.arc(x - 2, y + 4, 1.1, 0, 7); ctx.arc(x + 2, y + 4, 1.1, 0, 7); ctx.fill();

  /* 武器（朝向目标） */
  ctx.save();
  ctx.translate(x, y + 2);
  ctx.rotate(aim);
  if (type === 'archer') {
    ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(10, 0, 9, -1.1, 1.1); ctx.stroke();
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(10 + Math.cos(-1.1) * 9, Math.sin(-1.1) * 9);
    ctx.lineTo(10 + Math.cos(1.1) * 9, Math.sin(1.1) * 9); ctx.stroke();
  } else if (type === 'fire') {
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(16, 0); ctx.stroke();
    ctx.fillStyle = '#ff7043';
    ctx.beginPath(); ctx.arc(17, 0, 5 + Math.sin(G.time * 12) * 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffca28';
    ctx.beginPath(); ctx.arc(17, 0, 2.6, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'ice') {
    ctx.strokeStyle = '#0288d1'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(16, 0); ctx.stroke();
    ctx.fillStyle = '#81d4fa';
    ctx.beginPath(); ctx.arc(17, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(17, -5); ctx.lineTo(17, 5);
    ctx.moveTo(13, 0); ctx.lineTo(21, 0);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#424242';
    rr(4, -5, 20, 10, 3); ctx.fill();
    ctx.fillStyle = '#212121';
    ctx.fillRect(20, -4, 6, 8);
  }
  ctx.restore();

  /* 等级金点 */
  for (let i = 0; i <= level; i++) {
    ctx.fillStyle = '#ffca28';
    ctx.strokeStyle = '#a8740a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + (i - level / 2) * 9, y + 27, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

/* ---------- 敌人 ---------- */
function drawEnemy(e) {
  const x = e.x, y = e.y, r = e.cfg.radius;
  const spawnScale = Math.min(1, e.age / 0.25);

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x, y + r + 4, r * 0.95, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.scale((Math.cos(e.ang) >= 0 ? 1 : -1) * spawnScale, spawnScale);

  /* 腿 */
  ctx.fillStyle = '#37474f';
  rr(-r * 0.55, r * 0.55, r * 0.42, r * 0.55, 2); ctx.fill();
  rr(r * 0.13, r * 0.55, r * 0.42, r * 0.55, 2); ctx.fill();

  const bodyColor = {
    maga: '#1a3a8c', suit: '#263238', tweet: '#1565c0',
    brute: '#37474f', boss: '#212121'
  }[e.type];

  /* 身体 */
  ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : bodyColor;
  rr(-r * 0.72, -r * 0.35, r * 1.44, r * 1.05, r * 0.3); ctx.fill();
  /* 衬衫 + 领带 */
  ctx.fillStyle = '#f5f5f5';
  ctx.beginPath();
  ctx.moveTo(-r * 0.28, -r * 0.35); ctx.lineTo(r * 0.28, -r * 0.35);
  ctx.lineTo(r * 0.12, r * 0.2); ctx.lineTo(-r * 0.12, r * 0.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.32);
  ctx.lineTo(r * 0.13, -r * 0.1); ctx.lineTo(r * 0.07, r * 0.55);
  ctx.lineTo(-r * 0.07, r * 0.55); ctx.lineTo(-r * 0.13, -r * 0.1);
  ctx.closePath(); ctx.fill();

  /* 手臂 */
  ctx.fillStyle = bodyColor;
  rr(-r * 0.95, -r * 0.25, r * 0.3, r * 0.8, r * 0.12); ctx.fill();
  rr(r * 0.65, -r * 0.25, r * 0.3, r * 0.8, r * 0.12); ctx.fill();
  /* 手（橘色） */
  ctx.fillStyle = '#f0a868';
  ctx.beginPath(); ctx.arc(-r * 0.8, r * 0.6, r * 0.17, 0, 7); ctx.arc(r * 0.8, r * 0.6, r * 0.17, 0, 7); ctx.fill();

  /* 头 */
  const hy = -r * 0.72, hr = r * 0.62;
  ctx.fillStyle = e.hitFlash > 0 ? '#fff' : '#f5b87d';
  ctx.beginPath(); ctx.arc(0, hy, hr, 0, Math.PI * 2); ctx.fill();

  /* 眼睛（朝右） */
  if (e.type === 'suit' || e.type === 'brute' || e.type === 'boss') {
    ctx.fillStyle = '#111';
    rr(hr * 0.05, hy - hr * 0.22, hr * 0.5, hr * 0.28, 2); ctx.fill();
  } else {
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(hr * 0.32, hy - hr * 0.1, hr * 0.11, 0, 7); ctx.fill();
    if (e.type === 'tweet') { ctx.beginPath(); ctx.arc(-hr * 0.1, hy - hr * 0.1, hr * 0.09, 0, 7); ctx.fill(); }
  }
  /* 怒眉 */
  if (e.type === 'brute' || e.type === 'boss') {
    ctx.strokeStyle = '#5d4037'; ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.beginPath(); ctx.moveTo(hr * 0.02, hy - hr * 0.42); ctx.lineTo(hr * 0.55, hy - hr * 0.28); ctx.stroke();
  }
  /* 嘴 */
  ctx.strokeStyle = '#8d4e2a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(hr * 0.25, hy + hr * 0.3, hr * 0.18, 0.1, Math.PI - 0.4); ctx.stroke();

  /* 帽子 / 头发 */
  if (e.type === 'maga') {
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath(); ctx.arc(0, hy - hr * 0.45, hr * 0.9, Math.PI, 0); ctx.fill();
    ctx.fillRect(-hr * 0.95, hy - hr * 0.5, hr * 1.9, hr * 0.22);
  } else if (e.type === 'tweet') {
    ctx.fillStyle = '#1976d2';
    ctx.beginPath(); ctx.arc(0, hy - hr * 0.5, hr * 0.8, Math.PI, 0); ctx.fill();
    /* 手机蓝光 */
    ctx.fillStyle = '#90caf9';
    rr(r * 0.72, r * 0.05, r * 0.28, r * 0.45, 2); ctx.fill();
  } else {
    /* 金色秀发 */
    ctx.fillStyle = '#fdd835';
    ctx.beginPath();
    ctx.moveTo(-hr * 0.95, hy - hr * 0.25);
    ctx.quadraticCurveTo(-hr * 0.9, hy - hr * 1.15, hr * 0.2, hy - hr * 1.05);
    ctx.quadraticCurveTo(hr * 1.05, hy - hr * 0.95, hr * 0.95, hy - hr * 0.3);
    ctx.quadraticCurveTo(hr * 0.5, hy - hr * 0.55, -hr * 0.2, hy - hr * 0.45);
    ctx.quadraticCurveTo(-hr * 0.6, hy - hr * 0.35, -hr * 0.95, hy - hr * 0.25);
    ctx.fill();
    /* 脑后一撮 */
    ctx.beginPath();
    ctx.moveTo(-hr * 0.85, hy - hr * 0.1);
    ctx.quadraticCurveTo(-hr * 1.25, hy + hr * 0.35, -hr * 0.7, hy + hr * 0.25);
    ctx.quadraticCurveTo(-hr * 0.8, -hr * 0.05, -hr * 0.85, hy - hr * 0.1);
    ctx.fill();
  }
  if (e.type === 'boss') {
    /* 夸张红领带加宽已在上面；BOSS 金扣 */
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath(); ctx.arc(0, r * 0.32, r * 0.09, 0, 7); ctx.fill();
  }
  ctx.restore();

  /* 减速冰晶环 */
  if (e.slowT > 0) {
    ctx.strokeStyle = 'rgba(79,195,247,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(129,212,250,0.9)';
    for (let i = 0; i < 3; i++) {
      const a = G.time * 2 + i * 2.1;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5), 2, 0, 7); ctx.fill();
    }
  }

  /* 血条 */
  const bw = e.cfg.boss ? 76 : Math.max(26, r * 2.2);
  const bx = x - bw / 2, by = y - r - (e.cfg.boss ? 22 : 12);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  rr(bx - 1, by - 1, bw + 2, e.cfg.boss ? 8 : 5, 2); ctx.fill();
  const ratio = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = ratio > 0.5 ? '#66bb6a' : ratio > 0.25 ? '#ffca28' : '#ef5350';
  rr(bx, by, bw * ratio, e.cfg.boss ? 6 : 3, 1.5); ctx.fill();
  if (e.cfg.boss) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('BOSS · 特朗普', x, by - 2);
  }
}

/* ---------- 弹道 ---------- */
function drawProjectile(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.ang);
  if (p.kind === 'archer') {
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.fillStyle = '#90a4ae';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(1, -3); ctx.lineTo(1, 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-10, -3); ctx.moveTo(-7, 0); ctx.lineTo(-10, 3); ctx.stroke();
  } else if (p.kind === 'fire') {
    const fl = 1 + Math.sin(G.time * 20 + p.x) * 0.15;
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 9 * fl);
    g.addColorStop(0, '#fff59d'); g.addColorStop(0.5, '#ff7043'); g.addColorStop(1, 'rgba(216,67,21,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 9 * fl, 0, Math.PI * 2); ctx.fill();
  } else if (p.kind === 'ice') {
    ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
    ctx.moveTo(0, -6); ctx.lineTo(0, 6);
    ctx.moveTo(-4, -4); ctx.lineTo(4, 4);
    ctx.moveTo(4, -4); ctx.lineTo(-4, 4);
    ctx.stroke();
    ctx.fillStyle = '#e1f5fe';
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(-2, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#666';
    ctx.beginPath(); ctx.arc(-4, -2, 2, 0, 7); ctx.fill();
  }
  ctx.restore();
}

/* ---------- 陨石 / 粒子 / 文字 ---------- */
function drawMeteor(m) {
  const k = Math.min(1, m.t / m.dur);
  const x = m.sx + (m.x - m.sx) * k * k;
  const y = m.sy + (m.y - m.sy) * k * k;
  /* 尾焰 */
  const g = ctx.createRadialGradient(x, y, 2, x, y, 30);
  g.addColorStop(0, '#fff59d'); g.addColorStop(0.4, '#ff7043'); g.addColorStop(1, 'rgba(183,28,28,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5d4037';
  ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  /* 落点标记 */
  ctx.strokeStyle = 'rgba(255,110,64,' + (0.5 + 0.4 * Math.sin(G.time * 14)) + ')';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(m.x, m.y, BALANCE.skillRadius, 0, Math.PI * 2); ctx.stroke();
}

function drawParticles() {
  for (const q of G.particles) {
    const a = Math.max(0, q.life / q.max);
    ctx.globalAlpha = a;
    if (q.shape === 'ring') {
      const rad = q.size * (1 - a * 0.6);
      ctx.strokeStyle = q.color; ctx.lineWidth = 3 * a + 1;
      ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size * a + 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    const a = Math.min(1, t.life / t.max * 1.5);
    ctx.globalAlpha = a;
    ctx.font = 'bold ' + t.size + 'px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(t.txt, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, GAME_W, GAME_H);
  ctx.save();
  if (G.shake > 0) ctx.translate(rand(-G.shake, G.shake) * 0.4, rand(-G.shake, G.shake) * 0.4);

  drawGround();
  drawPlacementLayer();

  /* 塔与敌人按 y 排序，形成前后遮挡 */
  const list = [];
  for (const t of G.towers) list.push({ y: t.y, fn: () => drawPig(t.x, t.y + Math.sin(G.time * 3 + t.c * 1.7 + t.r * 2.3) * 2, t.type, t.level, t.aim) });
  for (const e of G.enemies) list.push({ y: e.y, fn: () => drawEnemy(e) });
  list.sort((a, b) => a.y - b.y);
  for (const it of list) it.fn();

  for (const p of G.projectiles) drawProjectile(p);
  for (const m of G.meteors) drawMeteor(m);
  drawParticles();
  drawTexts();

  /* 技能瞄准模式全屏提示 */
  if (G.skill.armed) {
    const h = G.hover;
    ctx.fillStyle = 'rgba(255,235,59,0.06)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    if (h && h.c >= 0 && h.c < COLS && h.r >= 0 && h.r < ROWS) {
      const x = h.c * TILE + TILE / 2, y = h.r * TILE + TILE / 2;
      ctx.fillStyle = 'rgba(255,110,64,0.18)';
      ctx.beginPath(); ctx.arc(x, y, BALANCE.skillRadius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, BALANCE.skillRadius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.5)';
    const tip = '点击战场释放【天蓬之怒】（右键 / ESC 取消）';
    ctx.strokeText(tip, GAME_W / 2, 44); ctx.fillText(tip, GAME_W / 2, 44);
  }

  ctx.restore();
}

/* ================================================================
 * HUD / 侧栏
 * ================================================================ */
const hudCache = {};
function setText(el, v) {
  if (hudCache[el.id] !== v) { el.textContent = v; hudCache[el.id] = v; }
}
function updateHUD() {
  setText(dom.hudLives, G.lives);
  setText(dom.hudGold, G.gold);
  setText(dom.hudWave, G.waveIndex);
  if (G.phase === 'running') {
    dom.btnWave.disabled = true;
    setText(dom.btnWave, '⚔ 第' + (G.waveIndex + 1) + '波进攻中');
  } else if (G.waveIndex >= WAVES.length) {
    dom.btnWave.disabled = true;
    setText(dom.btnWave, '已全部完成');
  } else {
    dom.btnWave.disabled = !!(G.paused || G.result);
    setText(dom.btnWave, '▶ 开始第' + (G.waveIndex + 1) + '波');
  }
  /* 技能 */
  const can = G.skill.charges > 0;
  dom.btnSkill.disabled = !can;
  dom.btnSkill.classList.toggle('armed', G.skill.armed);
  setText(dom.skillInfo, can ? String(G.skill.charges) : Math.ceil(BALANCE.skillRegen - G.skill.regen) + 's');
  setText(dom.btnSpeed, G.speed === 1 ? '⏩ 1x' : '⏩ 2x');
  setText(dom.btnPause, G.paused ? '▶ 继续' : '⏸ 暂停');
  setText(dom.btnMute, Sound.muted ? '🔇' : '🔊');
  updateShop();
}

function updateShop() {
  dom.shop.querySelectorAll('.tower-card').forEach(card => {
    card.classList.toggle('cant', G.gold < TOWER_TYPES[card.dataset.type].cost);
    card.classList.toggle('selected', G.shopSel === card.dataset.type);
  });
}

function buildShop() {
  dom.shop.innerHTML = '';
  TOWER_ORDER.forEach((key, i) => {
    const t = TOWER_TYPES[key];
    const card = document.createElement('div');
    card.className = 'tower-card';
    card.dataset.type = key;
    card.title = t.desc;
    card.innerHTML =
      '<div class="tower-icon" style="background:' + t.color + '22">' + t.icon + '</div>' +
      '<div class="tower-info"><b>' + t.name + '</b><small>' + t.desc + '</small>' +
      '<small>快捷键 ' + (i + 1) + '</small></div>' +
      '<div class="tower-cost">🪙' + t.cost + '</div>';
    card.onclick = () => selectShop(key);
    dom.shop.appendChild(card);
  });
}
function selectShop(key) {
  Sound.play('ui');
  G.shopSel = G.shopSel === key ? null : key;
  G.selTower = null;
  updateTowerPanel(); updateHUD();
}

function updateTowerPanel() {
  const t = G.selTower;
  if (!t) { dom.towerPanel.classList.add('hidden'); return; }
  const def = TOWER_TYPES[t.type];
  const st = def.levels[t.level];
  dom.towerPanel.classList.remove('hidden');
  dom.pName.textContent = def.icon + ' ' + def.name;
  dom.pLevel.textContent = (t.level + 1) + ' / 3 级';
  dom.pDmg.textContent = st.dmg;
  dom.pRange.textContent = st.range.toFixed(1) + ' 格';
  dom.pRate.textContent = st.rate.toFixed(2) + ' /秒';
  if (st.splash) dom.pSpecial.textContent = '💥 溅射半径 ' + Math.round(st.splash);
  else if (st.slow) dom.pSpecial.textContent = '❄️ 减速 ' + Math.round(st.slow * 100) + '% · ' + st.slowDur + '秒';
  else dom.pSpecial.textContent = '🎯 单体速射';
  if (t.level >= 2) {
    dom.btnUpgrade.disabled = true;
    dom.btnUpgrade.textContent = '已满级 ★';
  } else {
    const cost = def.upCost[t.level];
    dom.btnUpgrade.disabled = G.gold < cost;
    dom.btnUpgrade.textContent = '⬆ 升级（🪙' + cost + '）';
  }
  dom.btnSell.textContent = '💰 出售（🪙' + Math.round(t.spent * BALANCE.sellRate) + '）';
}

function updateWaveInfo() {
  if (G.waveIndex >= WAVES.length) { dom.waveInfo.innerHTML = '<div class="wave-row">最终决战！</div>'; return; }
  const groups = WAVES[G.waveIndex].groups;
  const agg = {};
  groups.forEach(g => { agg[g.type] = (agg[g.type] || 0) + g.count; });
  let html = '<div class="wave-row"><b>第 ' + (G.waveIndex + 1) + ' 波：</b></div><div class="wave-row">';
  for (const k in agg) {
    html += '<span class="wave-chip">' + ENEMY_TYPES[k].icon + ENEMY_TYPES[k].name + ' ×' + agg[k] + '</span>';
  }
  html += '</div>';
  dom.waveInfo.innerHTML = html;
}

/* ================================================================
 * 输入
 * ================================================================ */
function fitCanvas() {
  const aw = dom.canvasBox.clientWidth - 8;
  const ah = dom.canvasBox.clientHeight - 8;
  if (aw <= 0 || ah <= 0) return;
  const s = Math.min(aw / GAME_W, ah / GAME_H, 1.4);
  cv.style.width = Math.floor(GAME_W * s) + 'px';
  cv.style.height = Math.floor(GAME_H * s) + 'px';
}
window.addEventListener('resize', fitCanvas);

function toCanvas(e) {
  const rect = cv.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (cv.width / rect.width),
    y: (e.clientY - rect.top) * (cv.height / rect.height)
  };
}
function cancelModes() {
  G.skill.armed = false;
  G.shopSel = null;
  updateHUD();
}

cv.addEventListener('pointermove', e => {
  const p = toCanvas(e);
  G.hover = { c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) };
});
cv.addEventListener('pointerleave', () => { G.hover = null; });
cv.addEventListener('contextmenu', e => { e.preventDefault(); cancelModes(); });
cv.addEventListener('pointerdown', e => {
  if (e.button === 2) return;
  e.preventDefault();
  Sound.init();
  if (G.screen !== 'play' || G.paused || G.result) return;
  const p = toCanvas(e);
  const c = Math.floor(p.x / TILE), r = Math.floor(p.y / TILE);

  if (G.skill.armed) {
    if (G.skill.charges <= 0) { G.skill.armed = false; updateHUD(); return; }
    G.skill.charges--; G.skill.regen = 0;
    G.skill.armed = false;
    meteorStrike(p.x, p.y);
    save(); updateHUD();
    return;
  }
  if (G.shopSel) { tryPlace(c, r); return; }

  const t = G.towers.find(tw => tw.c === c && tw.r === r);
  G.selTower = t || null;
  updateTowerPanel();
});

/* 按钮 */
dom.btnStart.onclick = () => { Sound.init(); Sound.play('ui'); newGame(); };
dom.btnContinue.onclick = () => { Sound.init(); Sound.play('ui'); continueGame(); };
dom.btnHelp.onclick = () => { dom.helpModal.classList.toggle('hidden'); };
dom.btnHelpClose.onclick = () => { dom.helpModal.classList.add('hidden'); };
dom.btnWave.onclick = startWave;
dom.btnSkill.onclick = () => {
  if (G.skill.charges <= 0 || G.paused || G.result) return;
  Sound.play('ui');
  G.skill.armed = !G.skill.armed;
  G.shopSel = null;
  updateHUD();
};
dom.btnSpeed.onclick = () => { G.speed = G.speed === 1 ? 2 : 1; Sound.play('ui'); updateHUD(); };
dom.btnPause.onclick = togglePause;
dom.btnMute.onclick = () => { Sound.init(); Sound.setMuted(!Sound.muted); updateHUD(); };
dom.btnMenu.onclick = () => { save(); toMenu(); };
dom.btnUpgrade.onclick = upgradeTower;
dom.btnSell.onclick = sellTower;

window.addEventListener('keydown', e => {
  if (G.screen !== 'play') return;
  if (e.key >= '1' && e.key <= '4') {
    const idx = ~~e.key - 1;
    if (TOWER_ORDER[idx]) selectShop(TOWER_ORDER[idx]);
  } else if (e.key === 'Escape') {
    if (G.skill.armed || G.shopSel) cancelModes();
    else if (!G.result) togglePause();
  } else if (e.key === ' ') {
    e.preventDefault();
    if (G.phase === 'idle' && !G.paused && !G.result) startWave();
  }
});
window.addEventListener('beforeunload', save);
setInterval(save, 15000);

/* ================================================================
 * 主循环
 * ================================================================ */
function refreshContinue() { dom.btnContinue.classList.toggle('hidden', !hasSave()); }

let lastT = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts / 1000;
  const dt = lastT ? Math.min(0.05, now - lastT) : 0;
  lastT = now;
  if (G.screen === 'play') {
    if (!G.paused && !G.result) update(dt * G.speed);
    render();
    if (G.selTower) {
      /* 塔仍存在才保持选中；金币变化时刷新按钮可用性 */
      if (!G.towers.includes(G.selTower)) { G.selTower = null; updateTowerPanel(); }
      else updateTowerPanel();
    }
  }
}

/* ---------- 启动 ---------- */
buildShop();
updateHUD();
refreshContinue();
requestAnimationFrame(frame);
