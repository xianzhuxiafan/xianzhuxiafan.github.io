'use strict';
/* ================================================================
 * 仙猪大战特朗普 · 数值配置
 * 所有玩法数据集中在此，方便调整平衡性
 * ================================================================ */

const TILE = 64;                 // 每格像素
const COLS = 15;                 // 地图列数
const ROWS = 10;                 // 地图行数

/* S 形进攻路线（格子坐标，-1 / 15 表示画面外入口与出口） */
const MAP_WAYPOINTS = [
  [-1, 2], [3, 2], [3, 6], [7, 6], [7, 2], [11, 2], [11, 7], [15, 7]
];

/* ---------------- 全局平衡常量 ---------------- */
const BALANCE = {
  startGold: 260,
  startLives: 20,
  sellRate: 0.7,                 // 出售返还比例
  hpGrowPerWave: 0.11,           // 每波敌人血量增长
  waveBonusBase: 25,             // 清波奖励 = 25 + 波次*10
  waveBonusPerWave: 10,

  skillDamage: 230,              // 天蓬之怒伤害
  skillRadius: TILE * 1.6,       // 轰炸半径
  skillMaxCharges: 2,
  skillStartCharges: 1,
  skillRegen: 40,                // 秒/充能
  skillCooldownUI: 0
};

/* ---------------- 防御塔：四种仙猪 ----------------
 * levels[0..2] 对应 1~3 级
 * dmg 伤害 / range 射程(格) / rate 每秒攻击次数 / projSpeed 弹速
 * splash 溅射半径(像素) / slow 减速比例 / slowDur 减速持续秒
 * ------------------------------------------------ */
const TOWER_TYPES = {
  archer: {
    name: '弓箭仙猪', icon: '🏹', color: '#66bb6a',
    cost: 100, desc: '便宜均衡，单体速射',
    levels: [
      { dmg: 16, range: 2.6, rate: 1.1, projSpeed: 11 },
      { dmg: 28, range: 2.8, rate: 1.35, projSpeed: 12 },
      { dmg: 50, range: 3.0, rate: 1.6, projSpeed: 14 }
    ],
    upCost: [80, 160]
  },
  fire: {
    name: '火焰仙猪', icon: '🔥', color: '#ef6c00',
    cost: 170, desc: '火球溅射，克制群敌',
    levels: [
      { dmg: 24, range: 2.3, rate: 0.8, projSpeed: 8, splash: 52 },
      { dmg: 42, range: 2.5, rate: 0.95, projSpeed: 8.5, splash: 60 },
      { dmg: 75, range: 2.7, rate: 1.1, projSpeed: 9, splash: 72 }
    ],
    upCost: [140, 260]
  },
  ice: {
    name: '寒冰仙猪', icon: '❄️', color: '#4fc3f7',
    cost: 140, desc: '减速敌人，控制全场',
    levels: [
      { dmg: 9,  range: 2.4, rate: 1.0, projSpeed: 10, slow: 0.50, slowDur: 1.6 },
      { dmg: 16, range: 2.6, rate: 1.2, projSpeed: 11, slow: 0.55, slowDur: 2.0 },
      { dmg: 28, range: 2.8, rate: 1.4, projSpeed: 12, slow: 0.60, slowDur: 2.5 }
    ],
    upCost: [110, 200]
  },
  cannon: {
    name: '神炮仙猪', icon: '💣', color: '#8d6e63',
    cost: 250, desc: '巨炮高伤，射速较慢',
    levels: [
      { dmg: 65,  range: 2.9, rate: 0.45, projSpeed: 7, splash: 72 },
      { dmg: 115, range: 3.1, rate: 0.55, projSpeed: 7.5, splash: 84 },
      { dmg: 200, range: 3.3, rate: 0.7, projSpeed: 8, splash: 96 }
    ],
    upCost: [200, 380]
  }
};
const TOWER_ORDER = ['archer', 'fire', 'ice', 'cannon'];

/* ---------------- 敌人：特朗普大军 ----------------
 * hp 基础血量 / speed 速度(格/秒) / gold 击杀赏金 / lives 漏过扣血
 * ------------------------------------------------ */
const ENEMY_TYPES = {
  maga: {
    name: '红帽小兵', icon: '🧢',
    hp: 52, speed: 1.0, gold: 8, lives: 1, radius: 13
  },
  suit: {
    name: '西装特工', icon: '🕶️',
    hp: 42, speed: 1.75, gold: 10, lives: 1, radius: 13
  },
  tweet: {
    name: '推特水军', icon: '📱',
    hp: 120, speed: 1.05, gold: 13, lives: 1, radius: 14
  },
  brute: {
    name: '金发壮汉', icon: '🤵',
    hp: 330, speed: 0.66, gold: 24, lives: 2, radius: 18
  },
  boss: {
    name: '特朗普', icon: '👱',
    hp: 2600, speed: 0.52, gold: 400, lives: 10, radius: 26, boss: true
  }
};

/* ---------------- 15 波次 ----------------
 * groups: type 敌人类型 / count 数量 / interval 出怪间隔(秒) / delay 本组开始延迟
 * ------------------------------------------------ */
const WAVES = [
  { groups: [ { type: 'maga', count: 6, interval: 1.2 } ] },
  { groups: [ { type: 'maga', count: 10, interval: 1.0 } ] },
  { groups: [ { type: 'maga', count: 6, interval: 1.1 },
              { type: 'suit', count: 4, interval: 0.9, delay: 6 } ] },
  { groups: [ { type: 'suit', count: 10, interval: 0.8 } ] },
  { groups: [ { type: 'tweet', count: 6, interval: 1.3 },
              { type: 'maga', count: 8, interval: 0.7, delay: 4 } ] },
  { groups: [ { type: 'suit', count: 8, interval: 0.7 },
              { type: 'tweet', count: 6, interval: 1.2, delay: 5 } ] },
  { groups: [ { type: 'tweet', count: 12, interval: 0.9 } ] },
  { groups: [ { type: 'brute', count: 2, interval: 3.0 },
              { type: 'maga', count: 14, interval: 0.6, delay: 2 } ] },
  { groups: [ { type: 'suit', count: 16, interval: 0.55 },
              { type: 'tweet', count: 8, interval: 1.0, delay: 8 } ] },
  { groups: [ { type: 'brute', count: 4, interval: 2.2 },
              { type: 'tweet', count: 8, interval: 0.9, delay: 3 } ] },
  { groups: [ { type: 'maga', count: 20, interval: 0.5 },
              { type: 'suit', count: 10, interval: 0.6, delay: 8 } ] },
  { groups: [ { type: 'tweet', count: 14, interval: 0.7 },
              { type: 'brute', count: 3, interval: 2.5, delay: 5 } ] },
  { groups: [ { type: 'suit', count: 22, interval: 0.45 },
              { type: 'brute', count: 5, interval: 2.0, delay: 6 } ] },
  { groups: [ { type: 'tweet', count: 18, interval: 0.55 },
              { type: 'brute', count: 6, interval: 1.8, delay: 4 },
              { type: 'suit', count: 10, interval: 0.5, delay: 12 } ] },
  { groups: [ { type: 'tweet', count: 10, interval: 0.8 },
              { type: 'suit', count: 8, interval: 0.7, delay: 6 },
              { type: 'brute', count: 3, interval: 3.0, delay: 12 },
              { type: 'boss', count: 1, interval: 1, delay: 20 } ] }
];

/* 保存标识 */
const SAVE_KEY = 'xianzhu_td_save_v1';
const MUTE_KEY = 'xianzhu_td_muted';
