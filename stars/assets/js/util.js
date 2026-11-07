/* 诗季 · 星空 — 基础工具、色板、画质分级 */
(function (root) {
  'use strict';
  var SJ = root.SJ = root.SJ || {};

  /* ------------------------------------------------------------ 随机数 */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var rng = mulberry32(20261107);
  function reseed(s) { rng = mulberry32(s >>> 0); }
  function rand() { return rng(); }
  function rr(a, b) { return a + (b - a) * rng(); }
  function rsym(a) { return (rng() * 2 - 1) * a; }
  function gauss() {
    var u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v);
  }
  function pick(arr) { return arr[(rng() * arr.length) | 0]; }

  /* ------------------------------------------------------------ 数学 */
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function damp(cur, target, lambda, dt) {
    return lerp(cur, target, 1 - Math.exp(-lambda * dt));
  }

  // 方位角(度) + 高度角(度) -> 单位向量（方位 0 = 正前方 -Z，顺时针为正）
  function dirFromAzAlt(azDeg, altDeg) {
    var az = azDeg * Math.PI / 180, alt = altDeg * Math.PI / 180;
    var ca = Math.cos(alt);
    return new THREE.Vector3(
      Math.sin(az) * ca,
      Math.sin(alt),
      -Math.cos(az) * ca
    );
  }

  /* ------------------------------------------------------------ 色板（线性空间） */
  // 全部数值已在 gamma 2.2 之前，故整体偏小
  SJ.PAL = {
    zenith: [0.0010, 0.0018, 0.0042],
    skyMid: [0.0030, 0.0052, 0.0108],
    horizon: [0.0100, 0.0132, 0.0190],
    haze: [0.0096, 0.0126, 0.0182],
    moon: [0.62, 0.70, 0.90],
    moonGlow: [0.055, 0.070, 0.100],
    mwCool: [0.30, 0.37, 0.58],
    mwWarm: [0.52, 0.48, 0.42],
    starCool: [0.55, 0.66, 0.98],
    starWarm: [1.00, 0.80, 0.55],
    poemGold: [1.00, 0.84, 0.56],
    poemBlue: [0.68, 0.83, 1.00],
    grassBase: [0.0078, 0.0142, 0.0110],
    grassTip: [0.0420, 0.0750, 0.0520],
    grassDry: [0.070, 0.072, 0.042],
    soil: [0.0032, 0.0046, 0.0039],
    ridgeFar: [0.0090, 0.0125, 0.0185],
    ridgeMid: [0.0055, 0.0080, 0.0125],
    ridgeNear: [0.0032, 0.0050, 0.0080],
    petal: [0.60, 0.62, 0.72],
    pollen: [0.75, 0.82, 0.95]
  };

  /* ------------------------------------------------------------ 画质 */
  var params = new URLSearchParams(root.location.search);
  var forced = params.get('tier');

  var PRESETS = {
    high: {
      grassNear: 128000, grassMid: 58000, grassFar: 30000,
      bladeSeg: 5, flowers: 900, motes: 110, fireflies: 140,
      stars: 9000, dprMax: 2, bloomPasses: 2, skyOct: 5,
      mwFine: 1
    },
    mid: {
      grassNear: 46000, grassMid: 22000, grassFar: 12000,
      bladeSeg: 4, flowers: 340, motes: 60, fireflies: 120,
      stars: 4800, dprMax: 1.75, bloomPasses: 1, skyOct: 4,
      mwFine: 0
    },
    low: {
      grassNear: 12000, grassMid: 6000, grassFar: 3800,
      bladeSeg: 3, flowers: 120, motes: 30, fireflies: 48,
      stars: 2200, dprMax: 1, bloomPasses: 1, skyOct: 3,
      mwFine: 0
    }
  };

  var coarse = root.matchMedia && root.matchMedia('(pointer: coarse)').matches;
  var small = root.innerWidth < 820;
  var autoTier = (coarse || small) ? 'mid' : 'high';
  var tierName = forced && PRESETS[forced] ? forced : autoTier;

  var Q = SJ.Q = Object.assign({ tier: tierName, params: params }, PRESETS[tierName]);
  Q.isMobile = coarse || small;
  Q.still = params.has('still');
  Q.debug = params.has('debug');

  /* ------------------------------------------------------------ 杂项 */
  SJ.util = {
    reseed: reseed, rand: rand, rr: rr, rsym: rsym, gauss: gauss, pick: pick,
    clamp: clamp, lerp: lerp, smoothstep: smoothstep, damp: damp,
    dirFromAzAlt: dirFromAzAlt,
    // 线性色 -> THREE.Color
    col: function (arr) { return new THREE.Color(arr[0], arr[1], arr[2]); },
    css: function (arr) {
      function g(c) { return Math.round(255 * Math.pow(clamp(c, 0, 1), 1 / 2.2)); }
      return 'rgb(' + g(arr[0]) + ',' + g(arr[1]) + ',' + g(arr[2]) + ')';
    }
  };

  /* ------------------------------------------------------------ 全局错误提示 */
  root.addEventListener('error', function (e) {
    if (SJ.debug) console.error(e.message);
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:12px;top:12px;z-index:999;color:#f88;font:12px monospace;' +
      'background:#000a;padding:8px 10px;border-radius:6px;max-width:70vw;white-space:pre-wrap';
    el.textContent = 'ERR: ' + (e.message || e.error);
    document.body.appendChild(el);
  });

})(window);
