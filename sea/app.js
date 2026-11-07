/* ============================================================
   诗季 · 凌润林
   沉浸式海景 / 漂流瓶 / 完整诗集
   纯原生 JavaScript，无外部依赖
   ============================================================ */
(() => {
  'use strict';

  const POEMS = Array.isArray(window.POEMS) ? window.POEMS : [];
  const BOOK = window.BOOK || { title: '诗季', author: '凌润林', quote: '在每一个悲伤的时刻，都是诗的季节。', volumes: [] };
  const N = POEMS.length;
  const TAU = Math.PI * 2;
  const START_TOD = 0.70;
  const DAY_PERIOD = 360; // 一整个昼夜，六分钟左右

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = t => 1 - Math.pow(1 - clamp(t), 3);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad2 = n => String(n).padStart(2, '0');

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  }

  const mixRgb = (a, b, t) => [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t)
  ];

  const cssRgb = (c, alpha = 1) =>
    alpha >= 1
      ? `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`
      : `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${alpha})`;

  function normalize3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  const dom = {};

  const state = {
    simTime: 0,
    lastFrame: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    dayT: START_TOD,
    env: null,
    palette: null,
    sunAlt: 0,
    mouse: { x: 0, y: 0, tx: 0, ty: 0 },
    currentIndex: -1,
    readerOpen: false,
    tocOpen: false,
    particlesOn: true,
    soundOn: false,
    hintKey: '',
    hasSalvaged: false,
    readerBottle: null,
    phaseWord: '',
    focusReturnReader: null,
    focusReturnToc: null,
    lastEnvUpdate: -1,
    lastUiUpdate: -1,
    lastThemeUpdate: -1,
    lastPhaseUpdate: -1,
    gl: null,
    glProgram: null,
    glLocs: null,
    glCanvas: null,
    glReady: false,
    fxCtx: null,
    fxParticles: [],
    ambientParticles: [],
    sprites: null,
    particlesCleared: true,
    bottles: [],
    bottleUid: 0,
    deck: [],
    nextGullAt: 8,
    audio: null,
    audioStarting: false,
    resizeTimer: null,
    phaseTimer: null,
    renderScale: 1,
    perfAccum: 0,
    perfFrames: 0,
    perfNextAt: 6
  };

  /* ============================================================
     Palettes · 从午后的海，到深夜的月光
     ============================================================ */
  const RAW_PALETTE = [
    {
      t: 0.00,
      zen: '#060b16', hor: '#111b27', glow: '#263344', sun: '#dfe8ff',
      cloudLit: '#3c4858', cloudDark: '#0b131f',
      seaDeep: '#020a10', seaNear: '#0b202b', foam: '#a9bac3',
      sandDry: '#262728', sandWet: '#11171a',
      night: 1.0, cover: 0.72
    },
    {
      t: 0.16,
      zen: '#101a2b', hor: '#332e39', glow: '#594751', sun: '#ffe4cf',
      cloudLit: '#7a6570', cloudDark: '#171d29',
      seaDeep: '#05111c', seaNear: '#1b3039', foam: '#cdc5c0',
      sandDry: '#343433', sandWet: '#1a1f21',
      night: 0.82, cover: 0.74
    },
    {
      t: 0.225,
      zen: '#263a55', hor: '#be8b7a', glow: '#efac80', sun: '#ffd9b0',
      cloudLit: '#efc3ab', cloudDark: '#494c5f',
      seaDeep: '#0b2231', seaNear: '#334e59', foam: '#e6d5c8',
      sandDry: '#5e5446', sandWet: '#292a2a',
      night: 0.3, cover: 0.8
    },
    {
      t: 0.27,
      zen: '#5d7e9f', hor: '#f3c59c', glow: '#ffae76', sun: '#ffe2bb',
      cloudLit: '#ffd7b1', cloudDark: '#687281',
      seaDeep: '#173342', seaNear: '#5b7a82', foam: '#f3e5d3',
      sandDry: '#88765e', sandWet: '#3b3731',
      night: 0.05, cover: 0.76
    },
    {
      t: 0.36,
      zen: '#80a8c5', hor: '#e5ece8', glow: '#f3d6b8', sun: '#fff4de',
      cloudLit: '#fff3e6', cloudDark: '#8da2b1',
      seaDeep: '#24495e', seaNear: '#648a96', foam: '#edf1e9',
      sandDry: '#a08a6b', sandWet: '#565044',
      night: 0.0, cover: 0.7
    },
    {
      t: 0.50,
      zen: '#8fbad5', hor: '#ddeae9', glow: '#f2e7d4', sun: '#fffdf1',
      cloudLit: '#fffaf0', cloudDark: '#9cb0bc',
      seaDeep: '#2a5468', seaNear: '#6f97a0', foam: '#eef6ef',
      sandDry: '#b69d78', sandWet: '#726552',
      night: 0.0, cover: 0.64
    },
    {
      t: 0.66,
      zen: '#7ba6c2', hor: '#f0dbc2', glow: '#f7d0a6', sun: '#ffe7c5',
      cloudLit: '#ffe6ce', cloudDark: '#8b939f',
      seaDeep: '#2d5261', seaNear: '#73949a', foam: '#f7e9d7',
      sandDry: '#b29873', sandWet: '#6b5b47',
      night: 0.0, cover: 0.72
    },
    {
      t: 0.735,
      zen: '#536c8d', hor: '#ffbe8c', glow: '#ff915e', sun: '#ffd6a3',
      cloudLit: '#ffc79f', cloudDark: '#6a6576',
      seaDeep: '#1e3646', seaNear: '#5c6f78', foam: '#ffe2c9',
      sandDry: '#9e8063', sandWet: '#594a3d',
      night: 0.02, cover: 0.86
    },
    {
      t: 0.79,
      zen: '#373c62', hor: '#df8073', glow: '#ff9872', sun: '#ffbb93',
      cloudLit: '#e6929e', cloudDark: '#463e52',
      seaDeep: '#141d30', seaNear: '#464c5f', foam: '#ebc6bb',
      sandDry: '#6e5b51', sandWet: '#343039',
      night: 0.38, cover: 0.86
    },
    {
      t: 0.845,
      zen: '#1e2440', hor: '#895064', glow: '#b4646d', sun: '#ffa894',
      cloudLit: '#9c6175', cloudDark: '#252138',
      seaDeep: '#0a1322', seaNear: '#253141', foam: '#c2a5a5',
      sandDry: '#433f40', sandWet: '#23252e',
      night: 0.72, cover: 0.76
    },
    {
      t: 0.90,
      zen: '#0a1020', hor: '#273145', glow: '#39445a', sun: '#cbd8f2',
      cloudLit: '#3b475b', cloudDark: '#0c1421',
      seaDeep: '#030b14', seaNear: '#102431', foam: '#a7b8c1',
      sandDry: '#26272a', sandWet: '#121820',
      night: 0.93, cover: 0.68
    },
    {
      t: 1.00,
      zen: '#060b16', hor: '#111b27', glow: '#263344', sun: '#dfe8ff',
      cloudLit: '#3c4858', cloudDark: '#0b131f',
      seaDeep: '#020a10', seaNear: '#0b202b', foam: '#a9bac3',
      sandDry: '#262728', sandWet: '#11171a',
      night: 1.0, cover: 0.72
    }
  ];

  const PALETTE = RAW_PALETTE.map(k => ({
    t: k.t,
    zen: hexToRgb(k.zen),
    hor: hexToRgb(k.hor),
    glow: hexToRgb(k.glow),
    sun: hexToRgb(k.sun),
    cloudLit: hexToRgb(k.cloudLit),
    cloudDark: hexToRgb(k.cloudDark),
    seaDeep: hexToRgb(k.seaDeep),
    seaNear: hexToRgb(k.seaNear),
    foam: hexToRgb(k.foam),
    sandDry: hexToRgb(k.sandDry),
    sandWet: hexToRgb(k.sandWet),
    night: k.night,
    cover: k.cover
  }));

  function samplePalette(t) {
    t = ((t % 1) + 1) % 1;
    let a = PALETTE[0];
    let b = PALETTE[PALETTE.length - 1];
    for (let i = 0; i < PALETTE.length - 1; i++) {
      if (t >= PALETTE[i].t && t <= PALETTE[i + 1].t) {
        a = PALETTE[i];
        b = PALETTE[i + 1];
        break;
      }
    }
    const span = Math.max(0.00001, b.t - a.t);
    const raw = clamp((t - a.t) / span);
    const f = raw * raw * (3 - 2 * raw);
    return {
      zen: mixRgb(a.zen, b.zen, f),
      hor: mixRgb(a.hor, b.hor, f),
      glow: mixRgb(a.glow, b.glow, f),
      sun: mixRgb(a.sun, b.sun, f),
      cloudLit: mixRgb(a.cloudLit, b.cloudLit, f),
      cloudDark: mixRgb(a.cloudDark, b.cloudDark, f),
      seaDeep: mixRgb(a.seaDeep, b.seaDeep, f),
      seaNear: mixRgb(a.seaNear, b.seaNear, f),
      foam: mixRgb(a.foam, b.foam, f),
      sandDry: mixRgb(a.sandDry, b.sandDry, f),
      sandWet: mixRgb(a.sandWet, b.sandWet, f),
      night: lerp(a.night, b.night, f),
      cover: lerp(a.cover, b.cover, f)
    };
  }

  function phaseFor(dayT, sunAlt) {
    if (sunAlt > 0.78) return '正午';
    if (sunAlt > 0.35) return dayT < 0.5 ? '晨光' : '午后';
    if (sunAlt > 0.12) return dayT < 0.5 ? '清晨' : '向晚';
    if (sunAlt > -0.02) return dayT < 0.5 ? '日出' : '日落';
    if (sunAlt > -0.25) return dayT < 0.5 ? '破晓' : '暮色';
    if (dayT < 0.5) return '将明';
    if (sunAlt > -0.68) return '入夜';
    return '长夜';
  }

  /* ============================================================
     GLSL · 一整个海面、天空与沙滩
     ============================================================ */
  const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

  const FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_sun;
uniform vec3 u_moon;
uniform vec3 u_sun_color;
uniform vec3 u_zenith;
uniform vec3 u_horizon;
uniform vec3 u_glow;
uniform vec3 u_cloud_lit;
uniform vec3 u_cloud_dark;
uniform vec3 u_sea_deep;
uniform vec3 u_sea_near;
uniform vec3 u_foam;
uniform vec3 u_sand_dry;
uniform vec3 u_sand_wet;
uniform float u_night;
uniform float u_sun_vis;
uniform float u_moon_vis;
uniform float u_cloud_cover;
uniform vec2 u_mouse;

#define PI 3.141592653589793
#define EYE_H 2.5
#define SHORE_Z 6.8

float saturate(float x) {
  return clamp(x, 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.62, 1.18, -1.18, 1.62);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = m * p + vec2(11.7, 7.3);
    a *= 0.5;
  }
  return v;
}

float shore_line(float x) {
  float t = u_time;
  return SHORE_Z
    + 0.42 * sin(t * 0.42)
    + 0.20 * sin(t * 0.19 + 1.7)
    + 0.22 * sin(x * 0.35 + t * 0.14)
    + 0.10 * sin(x * 0.87 - t * 0.26 + 2.2);
}

vec3 sky_base(vec3 rd) {
  float h = clamp(rd.y, -0.02, 1.0);
  float g = pow(1.0 - clamp(h, 0.0, 1.0), 3.4);
  vec3 col = mix(u_zenith, u_horizon, g);

  float sun_d = max(dot(rd, u_sun), 0.0);
  float moon_d = max(dot(rd, u_moon), 0.0);
  float low = pow(1.0 - clamp(h, 0.0, 1.0), 6.0);

  col += u_glow * low * 0.23;
  col += u_glow * pow(sun_d, 4.0) * (0.14 + 0.32 * low) * u_sun_vis;
  col += u_sun_color * pow(sun_d, 80.0) * 0.10 * u_sun_vis;
  col += vec3(0.28, 0.38, 0.52) * pow(moon_d, 100.0) * 0.16 * u_moon_vis;

  return col;
}

vec3 star_layer(vec3 rd, float scale, float threshold, float size, float seed) {
  vec2 sph = vec2(atan(rd.x, rd.z), asin(clamp(rd.y, -1.0, 1.0)));
  vec2 gp = sph * vec2(scale, scale * 0.74) + vec2(seed, seed * 0.61);
  vec2 cell = floor(gp);
  vec2 f = fract(gp) - 0.5;
  float r = hash12(cell + seed * 13.31);
  float active = step(threshold, r);
  vec2 jitter = vec2(hash12(cell + 2.13), hash12(cell + 8.47)) - 0.5;
  float d = length(f - jitter * 0.55);
  float star = (1.0 - smoothstep(0.0, size, d)) * active;
  float twinkle = 0.68 + 0.32 * sin(u_time * (0.55 + 1.35 * r) + r * 37.0);
  float mag = 0.2 + 0.8 * pow(saturate((r - threshold) / max(0.001, 1.0 - threshold)), 1.7);
  vec3 tint = mix(vec3(1.0, 0.83, 0.69), vec3(0.72, 0.84, 1.0), hash12(cell + 5.61));
  return tint * star * twinkle * mag;
}

vec3 stars(vec3 rd) {
  vec3 c = star_layer(rd, 132.0, 0.974, 0.10, 7.0);
  c += star_layer(rd, 235.0, 0.986, 0.15, 19.0) * 0.7;
  c += star_layer(rd, 72.0, 0.991, 0.22, 3.0) * 1.5;
  return c * u_night * smoothstep(0.0, 0.13, rd.y);
}

vec3 moon_and_sun(vec3 rd) {
  vec3 c = vec3(0.0);
  float sd = dot(rd, u_sun);
  if (u_sun_vis > 0.001) {
    float sun_angle = length(cross(rd, u_sun));
    float disc = 1.0 - smoothstep(0.022, 0.031, sun_angle);
    float glow_a = pow(max(sd, 0.0), 180.0);
    float glow_b = pow(max(sd, 0.0), 16.0);
    c += u_sun_color * (disc * 1.12 + glow_a * 0.28 + glow_b * 0.045) * u_sun_vis;
  }

  if (u_moon_vis > 0.001) {
    vec3 moon = normalize(u_moon);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), moon) + vec3(0.0009, 0.0, 0.0));
    vec3 up = normalize(cross(moon, right));
    vec2 mp = vec2(dot(rd, right), dot(rd, up)) / 0.0225;
    float rr = length(mp);
    float disc = 1.0 - smoothstep(0.93, 1.0, rr);
    float tex = fbm(mp * 5.6 + vec2(2.4, 1.7));
    float tex2 = fbm(mp * 15.0 - vec2(4.1, 2.8));
    float maria = smoothstep(0.36, 0.72, tex * 0.7 + tex2 * 0.42);
    vec3 moon_col = mix(vec3(0.58, 0.64, 0.73), vec3(0.94, 0.95, 0.9), 1.0 - maria);
    moon_col *= 0.82 + 0.22 * (1.0 - rr * rr);
    c += moon_col * disc * u_moon_vis;
    c += vec3(0.44, 0.55, 0.72) * pow(max(dot(rd, moon), 0.0), 120.0) * 0.16 * u_moon_vis;
    c += vec3(0.62, 0.71, 0.86) * pow(max(dot(rd, moon), 0.0), 16.0) * 0.035 * u_moon_vis;
  }
  return c;
}

float clouds(vec3 rd, out vec3 cloud_color) {
  float y = clamp(rd.y, 0.0, 1.0);
  float az = atan(rd.x, rd.z);
  vec2 p = vec2(az * 1.95 + u_time * 0.0034, pow(y, 0.56) * 5.6 + u_time * 0.0007);
  float a = fbm(p * vec2(0.95, 1.5) + vec2(3.2, 1.7));
  float b = fbm(p * vec2(2.4, 3.0) + vec2(-1.7, 4.1) + a * 0.9);
  float n = a * 0.67 + b * 0.5;
  float d = smoothstep(0.48, 0.72, n) * u_cloud_cover;
  d *= smoothstep(0.0, 0.04, rd.y);
  d = clamp(d, 0.0, 0.9);

  float sd = max(dot(rd, u_sun), 0.0);
  float md = max(dot(rd, u_moon), 0.0);
  float light_amt = 0.17 + 0.83 * pow(sd, 2.1);
  vec3 col = mix(u_cloud_dark, u_cloud_lit, light_amt);
  col += u_glow * pow(sd, 8.0) * 0.12;
  float rim = smoothstep(0.44, 0.57, n) * (1.0 - smoothstep(0.58, 0.76, n));
  col += u_glow * rim * (0.08 + 0.42 * pow(sd, 3.0));
  col += vec3(0.55, 0.65, 0.8) * pow(md, 28.0) * 0.16 * u_moon_vis;
  cloud_color = col;
  return d;
}

vec3 render_sky(vec3 rd) {
  vec3 col = sky_base(rd);
  col += moon_and_sun(rd);
  if (u_night > 0.015) {
    col += stars(rd);
  }
  vec3 cloud_col;
  float cloud_d = clouds(rd, cloud_col);
  col = mix(col, cloud_col, cloud_d);
  col = mix(col, u_horizon, (1.0 - smoothstep(0.0, 0.13, rd.y)) * 0.15);
  return col;
}

vec3 wave_normal(vec2 q, float edge) {
  float t = u_time;
  float dist = max(q.y, 0.0);
  float nearField = 0.16 + 0.84 * exp(-dist * 0.036);
  vec2 g = vec2(0.0);
  vec2 dir;
  float k, a, f;

  dir = normalize(vec2(0.18, 1.0));
  k = 0.72; a = 0.100;
  f = dot(dir, q) * k + t * 0.90;
  g += dir * (a * k * cos(f));

  dir = normalize(vec2(-0.34, 1.0));
  k = 1.35; a = 0.046;
  f = dot(dir, q) * k + t * 1.42;
  g += dir * (a * k * cos(f));

  dir = normalize(vec2(0.48, 1.0));
  k = 2.45; a = 0.019;
  f = dot(dir, q) * k + t * 2.15;
  g += dir * (a * k * cos(f));

  dir = normalize(vec2(-0.65, 1.0));
  k = 4.20; a = 0.008;
  f = dot(dir, q) * k + t * 3.20;
  g += dir * (a * k * cos(f));

  float n0 = vnoise(q * vec2(1.22, 1.72) + vec2(t * 0.17, -t * 0.11));
  float nx = vnoise((q + vec2(0.09, 0.0)) * vec2(1.22, 1.72) + vec2(t * 0.17, -t * 0.11));
  float nz = vnoise((q + vec2(0.0, 0.09)) * vec2(1.22, 1.72) + vec2(t * 0.17, -t * 0.11));
  g += vec2(nx - n0, nz - n0) * 0.23 * exp(-edge * 0.11);

  g *= nearField * (1.0 + 1.25 * exp(-edge * 0.2));
  return normalize(vec3(-g.x, 1.0, -g.y));
}

float foam_pattern(vec2 q, float edge) {
  float t = u_time;
  float n1 = fbm(q * vec2(2.55, 4.15) + vec2(t * 0.055, -t * 0.032));
  float n2 = fbm(q * vec2(8.2, 11.6) + vec2(-t * 0.045, t * 0.019));
  float lace = smoothstep(0.47, 0.69, n1 * 0.7 + n2 * 0.33);
  float fronts = 0.5 + 0.5 * sin(edge * 2.15 + t * 0.58 + n1 * 5.2);
  float front = exp(-max(edge, 0.0) * 1.07);
  float foam = front * (0.27 + 0.73 * lace) * (0.38 + 0.62 * smoothstep(0.24, 0.84, fronts));
  float second_band = (edge - 2.55 - 0.58 * sin(t * 0.21)) / 1.25;
  float second = exp(-second_band * second_band);
  foam += second * smoothstep(0.42, 0.72, n1) * 0.42;
  float bubbles = smoothstep(0.63, 0.79, n2) * exp(-max(edge, 0.0) * 3.4) * 0.56;
  foam += bubbles;
  return clamp(foam, 0.0, 1.0);
}

vec3 shade_water(vec3 wp, float edge, vec3 rd) {
  vec3 n = wave_normal(wp.xz, edge);
  float fres = 0.024 + 0.976 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  vec3 rdir = reflect(rd, n);
  rdir.y = max(rdir.y, 0.001);
  vec3 refl = sky_base(rdir);
  refl += u_glow * pow(max(dot(rdir, u_sun), 0.0), 18.0) * 0.12 * u_sun_vis;

  float depth = smoothstep(0.0, 11.0, edge);
  vec3 base = mix(u_sea_near, u_sea_deep, depth);
  float shallow = 1.0 - smoothstep(0.0, 3.4, edge);
  base = mix(base, u_sand_wet * 0.5 + u_sea_near * 0.33, shallow * 0.35);

  vec3 col = mix(base, refl, clamp(fres * 1.06, 0.0, 0.9));

  vec3 R = reflect(rd, n);
  float sun_spec = pow(max(dot(R, u_sun), 0.0), 420.0);
  float sun_broad = pow(max(dot(R, u_sun), 0.0), 34.0);
  float glint_noise = vnoise(wp.xz * vec2(7.0, 10.0) + vec2(u_time * 0.55, u_time * 0.27));
  col += u_sun_color * (sun_spec * (0.35 + 1.5 * glint_noise) + sun_broad * 0.055) * u_sun_vis;

  float moon_spec = pow(max(dot(R, u_moon), 0.0), 280.0);
  col += vec3(0.76, 0.84, 0.95) * moon_spec * 0.52 * u_moon_vis;

  float foam = foam_pattern(wp.xz, edge);
  vec3 foam_col = u_foam * (0.73 + 0.27 * u_sun_vis);
  foam_col = mix(foam_col, refl, 0.12);
  col = mix(col, foam_col, foam * 0.92);

  return col;
}

vec3 shade_sand(vec3 wp, float edge, vec3 rd) {
  float wetness = 1.0 - smoothstep(0.0, 3.0, -edge);
  vec3 sand = mix(u_sand_dry, u_sand_wet, wetness);

  float broad = fbm(wp.xz * vec2(0.85, 0.62));
  float fine = fbm(wp.xz * vec2(18.5, 15.0));
  float grain = vnoise(wp.xz * vec2(95.0, 80.0));
  sand *= 0.91 + broad * 0.13 + fine * 0.08;

  float ripple = sin(wp.z * 8.4 + wp.x * 0.28 + fbm(wp.xz * 0.34) * 5.0);
  sand *= 0.965 + 0.035 * ripple * (1.0 - wetness * 0.5);

  vec3 n = normalize(vec3(
    (vnoise(wp.xz * 2.4) - 0.5) * 0.035,
    1.0,
    (vnoise(wp.xz * 2.1 + 7.0) - 0.5) * 0.035
  ));
  vec3 rdir = reflect(rd, n);
  rdir.y = max(rdir.y, 0.002);
  vec3 refl = sky_base(rdir);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  sand = mix(sand, refl * 0.62, wetness * 0.27 * fres);

  float spec = pow(max(dot(rdir, u_sun), 0.0), 90.0);
  sand += u_sun_color * spec * wetness * 0.32 * u_sun_vis;

  float residue = smoothstep(0.66, 0.79, fbm(wp.xz * vec2(6.0, 8.0) + vec2(u_time * 0.025, 0.0)));
  residue *= 1.0 - smoothstep(0.0, 1.5, -edge);
  sand = mix(sand, u_foam * 0.78, residue * 0.14);

  float sparkle = smoothstep(0.84, 0.95, grain) * (1.0 - wetness);
  sand += u_glow * sparkle * 0.05;

  return sand;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  uv += u_mouse * vec2(0.008, 0.0035);

  vec3 ro = vec3(0.0, EYE_H, 0.0);
  vec3 rd = normalize(vec3(uv.x * 1.1, uv.y * 1.1 - 0.03, 1.0));
  vec3 col;

  if (rd.y < -0.00035) {
    float t = min(-EYE_H / rd.y, 30000.0);
    vec3 wp = ro + rd * t;
    float shore = shore_line(wp.x);
    float edge = wp.z - shore;

    if (edge < -0.65) {
      col = shade_sand(wp, edge, rd);
    } else if (edge > 0.4) {
      col = shade_water(wp, max(edge, 0.001), rd);
    } else {
      vec3 sand_col = shade_sand(wp, min(edge, -0.001), rd);
      vec3 water_col = shade_water(wp, max(edge, 0.001), rd);
      col = mix(sand_col, water_col, smoothstep(-0.65, 0.4, edge));
    }

    float fog = 1.0 - exp(-max(t - 12.0, 0.0) * 0.00135);
    fog = clamp(fog, 0.0, 0.985);
    vec3 haze_dir = normalize(vec3(rd.x, 0.0, rd.z));
    vec3 haze = sky_base(haze_dir);
    col = mix(col, haze, fog);
  } else {
    col = render_sky(rd);
  }

  col = max(col, vec3(0.0));
  col = col / (1.0 + col * 0.28) * 1.18;
  col = clamp(col, 0.0, 1.0);

  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 0.965);

  vec2 q = gl_FragCoord.xy / u_res.xy;
  float vig = 1.0 - smoothstep(0.34, 1.04, length((q - 0.5) * vec2(1.12, 1.0)));
  col *= mix(0.75, 1.0, vig);

  float grain = hash12(gl_FragCoord.xy + vec2(floor(u_time * 0.7) * 11.0, floor(u_time * 0.4) * 17.0)) - 0.5;
  col += grain * 0.016;
  col += (hash12(gl_FragCoord.xy + 13.0) - 0.5) / 255.0;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

  /* ============================================================
     WebGL
     ============================================================ */
  function compileShader(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createGLProgram(gl) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function initWebGL() {
    const canvas = dom.seaCanvas;
    if (!canvas) return;
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    let gl = null;
    try {
      gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    } catch (err) {
      gl = null;
    }
    if (!gl) {
      document.body.classList.add('no-webgl');
      return;
    }

    const program = createGLProgram(gl);
    if (!program) {
      document.body.classList.add('no-webgl');
      return;
    }

    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const names = [
      'u_res', 'u_time', 'u_sun', 'u_moon', 'u_sun_color', 'u_zenith',
      'u_horizon', 'u_glow', 'u_cloud_lit', 'u_cloud_dark', 'u_sea_deep',
      'u_sea_near', 'u_foam', 'u_sand_dry', 'u_sand_wet', 'u_night',
      'u_sun_vis', 'u_moon_vis', 'u_cloud_cover', 'u_mouse'
    ];
    const locs = {};
    names.forEach(name => { locs[name] = gl.getUniformLocation(program, name); });

    state.gl = gl;
    state.glProgram = program;
    state.glLocs = locs;
    state.glCanvas = canvas;
    state.glReady = true;

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      state.glReady = false;
      document.body.classList.add('no-webgl');
    }, false);
  }

  function setUniform3(gl, loc, value) {
    if (loc) gl.uniform3f(loc, value[0], value[1], value[2]);
  }

  function renderSea() {
    const gl = state.gl;
    if (!state.glReady || !gl || !state.glLocs || !state.env) return;
    const L = state.glLocs;
    const env = state.env;
    const pal = state.palette;

    gl.uniform2f(L.u_res, state.glCanvas.width, state.glCanvas.height);
    gl.uniform1f(L.u_time, state.simTime);
    setUniform3(gl, L.u_sun, env.sunDir);
    setUniform3(gl, L.u_moon, env.moonDir);
    setUniform3(gl, L.u_sun_color, pal.sun);
    setUniform3(gl, L.u_zenith, pal.zen);
    setUniform3(gl, L.u_horizon, pal.hor);
    setUniform3(gl, L.u_glow, pal.glow);
    setUniform3(gl, L.u_cloud_lit, pal.cloudLit);
    setUniform3(gl, L.u_cloud_dark, pal.cloudDark);
    setUniform3(gl, L.u_sea_deep, pal.seaDeep);
    setUniform3(gl, L.u_sea_near, pal.seaNear);
    setUniform3(gl, L.u_foam, pal.foam);
    setUniform3(gl, L.u_sand_dry, pal.sandDry);
    setUniform3(gl, L.u_sand_wet, pal.sandWet);
    gl.uniform1f(L.u_night, pal.night);
    gl.uniform1f(L.u_sun_vis, env.sunVis);
    gl.uniform1f(L.u_moon_vis, env.moonVis);
    gl.uniform1f(L.u_cloud_cover, pal.cover);
    gl.uniform2f(L.u_mouse, state.mouse.x, state.mouse.y);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function resizeWebGL() {
    if (!state.glReady || !state.glCanvas) return;
    const gl = state.gl;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.55) * state.renderScale;
    let cw = Math.round(w * dpr);
    let ch = Math.round(h * dpr);
    const cap = w <= 900 ? 1100000 : 2200000;
    if (cw * ch > cap) {
      const scale = Math.sqrt(cap / (cw * ch));
      cw = Math.max(1, Math.round(cw * scale));
      ch = Math.max(1, Math.round(ch * scale));
    }
    if (state.glCanvas.width !== cw || state.glCanvas.height !== ch) {
      state.glCanvas.width = cw;
      state.glCanvas.height = ch;
      gl.viewport(0, 0, cw, ch);
    }
  }

  function resizeFx() {
    const canvas = dom.fxCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    state.fxCtx = ctx;
    state.fxDpr = dpr;
    state.width = w;
    state.height = h;
    initAmbientParticles();
  }

  /* ============================================================
     Environment & UI voice
     ============================================================ */
  function updateEnvironment() {
    state.dayT = (START_TOD + state.simTime / DAY_PERIOD) % 1;
    const angle = (state.dayT - 0.25) * TAU;
    const sunAlt = Math.sin(angle);
    // 让落日与初升的月亮留在手机竖屏的视野里，同时仍贴着海平线
    const sunDir = normalize3([-Math.cos(angle) * 0.22, sunAlt + 0.015, 0.98]);
    const moonDir = normalize3([Math.cos(angle) * 0.32, -sunAlt * 0.36 + 0.03, 0.9]);
    const moonAlt = moonDir[1];
    const sunVis = smoothstep(-0.025, 0.006, sunAlt);
    const moonVis = smoothstep(0.08, -0.06, sunAlt) * smoothstep(-0.005, 0.08, moonAlt);

    state.sunAlt = sunAlt;
    state.palette = samplePalette(state.dayT);
    state.env = { sunDir, moonDir, sunVis, moonVis, moonAlt };
    state.lastEnvUpdate = state.simTime;
  }

  function updateChromeTheme() {
    if (!state.palette) return;
    const pal = state.palette;
    const t = smoothstep(0.01, 0.27, pal.night);

    const ink = mixRgb([22 / 255, 40 / 255, 48 / 255], [244 / 255, 235 / 255, 223 / 255], t);
    const accent = mixRgb([124 / 255, 76 / 255, 55 / 255], [220 / 255, 166 / 255, 136 / 255], t);
    const gull = t > 0.55
      ? `rgba(229, 233, 228, ${(0.1 + 0.07 * t).toFixed(3)})`
      : 'rgba(20, 33, 40, 0.3)';

    const root = document.documentElement.style;
    root.setProperty('--ui-ink', cssRgb(ink));
    root.setProperty('--ui-soft', cssRgb(ink, 0.62));
    root.setProperty('--ui-line', cssRgb(ink, 0.18));
    root.setProperty('--ui-accent', cssRgb(accent));
    root.setProperty('--gull-ink', gull);
    root.setProperty('--glass-bg', t > 0.5
      ? `rgba(6, 17, 23, ${(0.19 + 0.08 * t).toFixed(3)})`
      : `rgba(248, 247, 242, ${(0.13 + 0.04 * (1 - t)).toFixed(3)})`);
    root.setProperty('--glass-line', t > 0.5
      ? `rgba(245, 235, 220, ${(0.13 + 0.06 * t).toFixed(3)})`
      : 'rgba(28, 45, 53, 0.13)');

    state.lastThemeUpdate = state.simTime;
  }

  function setPhaseLabel(word, instant = false) {
    if (!dom.phaseValue || word === state.phaseWord) return;
    state.phaseWord = word;
    if (instant) {
      dom.phaseValue.textContent = word;
      return;
    }
    if (state.phaseTimer) clearTimeout(state.phaseTimer);
    dom.phase.classList.add('is-changing');
    state.phaseTimer = setTimeout(() => {
      dom.phaseValue.textContent = word;
      dom.phase.classList.remove('is-changing');
    }, 380);
  }

  function updateChromeInfo(force = false) {
    if (!state.palette) return;
    if (!force && state.simTime - state.lastUiUpdate < 0.32) return;

    setPhaseLabel(phaseFor(state.dayT, state.sunAlt));
    if (dom.phaseDot) {
      const wrapped = state.lastPhaseUpdate > 0.8 && state.dayT < 0.2;
      if (wrapped) {
        dom.phaseDot.style.transition = 'none';
        dom.phaseDot.style.left = `calc(${(state.dayT * 100).toFixed(2)}% - 1.5px)`;
        void dom.phaseDot.offsetWidth;
        dom.phaseDot.style.transition = '';
      } else {
        dom.phaseDot.style.left = `calc(${(state.dayT * 100).toFixed(2)}% - 1.5px)`;
      }
      state.lastPhaseUpdate = state.dayT;
    }
    if (state.simTime - state.lastThemeUpdate > 0.8) updateChromeTheme();
    state.lastUiUpdate = state.simTime;
  }

  /* ============================================================
     Hints
     ============================================================ */
  function setHint(text, notice = false, key = '') {
    if (!dom.seaHint || !dom.seaHintText) return;
    const nextKey = key || text;
    if (state.hintKey === nextKey) return;
    state.hintKey = nextKey;
    dom.seaHintText.textContent = text;
    dom.seaHint.classList.toggle('is-notice', notice);
    dom.seaHint.classList.remove('is-hidden');
  }

  /* ============================================================
     Particles
     ============================================================ */
  function makeSprite(rgb) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
    grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.85)`);
    grad.addColorStop(0.18, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.42)`);
    grad.addColorStop(0.52, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.11)`);
    grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return c;
  }

  function initSprites() {
    if (state.sprites) return;
    state.sprites = {
      warm: makeSprite([255, 224, 179]),
      sea: makeSprite([193, 234, 236]),
      silver: makeSprite([222, 233, 246]),
      pale: makeSprite([255, 247, 229])
    };
  }

  function newAmbientParticle(spread = false) {
    const w = state.width || window.innerWidth;
    const h = state.height || window.innerHeight;
    return {
      ambient: true,
      x: rand(0, w),
      y: spread ? rand(h * 0.51, h * 0.9) : rand(h * 0.68, h * 0.92),
      vx: rand(-2.2, 2.2),
      vy: rand(-1.3, 0.8),
      size: rand(0.9, 2.8),
      baseAlpha: rand(0.025, 0.09),
      phase: rand(0, TAU),
      wobble: rand(0.1, 0.4),
      life: 0,
      maxLife: rand(8, 18)
    };
  }

  function initAmbientParticles() {
    if (!state.particlesOn) return;
    if (!state.fxCtx) return;
    initSprites();
    const count = state.width < 700 ? 16 : 28;
    state.ambientParticles = Array.from({ length: count }, () => newAmbientParticle(true));
    state.particlesCleared = false;
  }

  function toneSprite() {
    const night = state.palette ? state.palette.night : 0.3;
    if (night > 0.72) return state.sprites.silver;
    if (state.sunAlt > -0.03 && state.sunAlt < 0.32) return state.sprites.warm;
    return state.sprites.sea;
  }

  function emitMotes(x, y, count, options = {}) {
    if (!state.particlesOn || !state.fxCtx) return;
    initSprites();
    const spread = options.spread || 1;
    const upward = options.upward || 1;
    const lifeMin = options.lifeMin || 2.5;
    const lifeMax = options.lifeMax || 6.0;
    const warm = state.sunAlt > -0.05 && state.sunAlt < 0.4;
    const pool = warm ? [state.sprites.warm, state.sprites.pale] : [state.sprites.sea, state.sprites.silver];
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const r = rand(0, 1) * spread;
      state.fxParticles.push({
        ambient: false,
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r * 0.55,
        vx: Math.cos(a) * rand(2, 15) + rand(-3, 3),
        vy: -rand(1, 9) * upward + Math.sin(a) * rand(1, 5),
        size: rand(1.1, 4.6),
        life: 0,
        maxLife: rand(lifeMin, lifeMax),
        sprite: pool[Math.floor(Math.random() * pool.length)],
        phase: rand(0, TAU),
        wobble: rand(0.2, 0.7)
      });
    }
  }

  function emitDissolveMotes(rect) {
    if (!state.particlesOn || !state.fxCtx || !rect) return;
    initSprites();
    const warm = state.sprites.warm;
    const sea = state.sprites.sea;
    for (let i = 0; i < 2; i++) {
      state.fxParticles.push({
        ambient: false,
        x: rect.left + rand(rect.width * 0.2, rect.width * 0.8),
        y: rect.top + rand(rect.height * 0.08, rect.height * 0.94),
        vx: rand(-5, 5),
        vy: rand(-16, -4),
        size: rand(1.2, 3.6),
        life: 0,
        maxLife: rand(2.8, 5.5),
        sprite: Math.random() < 0.55 ? warm : sea,
        phase: rand(0, TAU),
        wobble: rand(0.3, 0.8)
      });
    }
  }

  function drawParticles(dt) {
    if (!state.fxCtx) return;
    const ctx = state.fxCtx;
    const canvas = dom.fxCanvas;
    const dpr = state.fxDpr || 1;

    if (!state.particlesOn) {
      if (!state.particlesCleared) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        state.particlesCleared = true;
      }
      return;
    }
    if (state.particlesCleared) {
      state.particlesCleared = false;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);
    const time = state.simTime;
    const ambientSprite = toneSprite();
    const w = state.width;
    const h = state.height;

    for (let i = 0; i < state.ambientParticles.length; i++) {
      let p = state.ambientParticles[i];
      p.life += dt;
      p.x += (p.vx + Math.sin(time * p.wobble + p.phase) * 1.7) * dt;
      p.y += (p.vy + Math.cos(time * p.wobble * 0.8 + p.phase) * 0.7) * dt;
      if (p.x < -20) p.x = w + 20;
      if (p.x > w + 20) p.x = -20;
      if (p.y < h * 0.49) p.y = rand(h * 0.7, h * 0.92);
      if (p.y > h * 0.95) p.y = rand(h * 0.6, h * 0.8);
      if (p.life > p.maxLife) {
        state.ambientParticles[i] = newAmbientParticle(false);
        p = state.ambientParticles[i];
      }
      const shimmer = 0.72 + 0.28 * Math.sin(time * 0.38 + p.phase * 2.1);
      const alpha = p.baseAlpha * shimmer;
      const s = p.size * 7.5;
      ctx.globalAlpha = alpha;
      ctx.drawImage(ambientSprite, p.x - s / 2, p.y - s / 2, s, s);
    }

    for (let i = state.fxParticles.length - 1; i >= 0; i--) {
      const p = state.fxParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        state.fxParticles.splice(i, 1);
        continue;
      }
      p.x += (p.vx + Math.sin(time * p.wobble + p.phase) * 4.0) * dt;
      p.y += p.vy * dt;
      p.vx *= 0.994;
      p.vy -= 0.15 * dt;
      const t = p.life / p.maxLife;
      const fade = Math.sin(Math.min(1, t) * Math.PI);
      const alpha = fade * 0.5;
      const s = p.size * 7.0;
      ctx.globalAlpha = alpha;
      ctx.drawImage(p.sprite || ambientSprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function setParticlesEnabled(on) {
    state.particlesOn = on;
    if (dom.btnParticles) {
      dom.btnParticles.classList.toggle('is-off', !on);
      dom.btnParticles.setAttribute('aria-pressed', on ? 'true' : 'false');
      dom.btnParticles.setAttribute('aria-label', on ? '关闭粒子特效' : '开启粒子特效');
      dom.btnParticles.title = on ? '关闭粒子特效' : '开启粒子特效';
    }
    if (on) {
      initAmbientParticles();
      state.particlesCleared = false;
    } else {
      state.ambientParticles = [];
      state.fxParticles = [];
    }
  }

  /* ============================================================
     Bottles
     ============================================================ */
  function buildBottleSvg(uid) {
    const g = `bgg${uid}`;
    const r = `bgr${uid}`;
    const p = `bgp${uid}`;
    const c = `bgc${uid}`;
    const clip = `bgclip${uid}`;
    const blur = `bgblur${uid}`;
    const body = 'M52 72 C52 87 45 91 38 108 C28 135 24 171 24 230 C24 281 40 310 66 310 C92 310 108 281 108 230 C108 171 104 135 94 108 C87 91 80 87 80 72 L80 48 C80 41 74 35 66 35 C58 35 52 41 52 48 Z';

    return `
<svg viewBox="0 0 132 340" role="presentation" focusable="false" aria-hidden="true">
  <defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f6fffb" stop-opacity=".62"/>
      <stop offset=".16" stop-color="#8ac8bf" stop-opacity=".17"/>
      <stop offset=".38" stop-color="#ebfffa" stop-opacity=".36"/>
      <stop offset=".67" stop-color="#71aba4" stop-opacity=".13"/>
      <stop offset=".86" stop-color="#d6f6ef" stop-opacity=".4"/>
      <stop offset="1" stop-color="#8bc7bf" stop-opacity=".2"/>
    </linearGradient>
    <linearGradient id="${r}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fffaf0" stop-opacity=".8"/>
      <stop offset=".45" stop-color="#e5d7bb" stop-opacity=".28"/>
      <stop offset="1" stop-color="#9e8968" stop-opacity=".4"/>
    </linearGradient>
    <linearGradient id="${p}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8ecd2"/>
      <stop offset=".45" stop-color="#e4d0aa"/>
      <stop offset="1" stop-color="#bda483"/>
    </linearGradient>
    <linearGradient id="${c}" x1="0" y1="0" x2=".9" y2="1">
      <stop offset="0" stop-color="#d7bc92"/>
      <stop offset=".35" stop-color="#a67f54"/>
      <stop offset=".73" stop-color="#85613e"/>
      <stop offset="1" stop-color="#c5a172"/>
    </linearGradient>
    <clipPath id="${clip}">
      <path d="${body}"/>
    </clipPath>
    <filter id="${blur}" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="2.8"/>
    </filter>
  </defs>

  <ellipse cx="67" cy="316" rx="42" ry="7" fill="#071015" opacity=".2" filter="url(#${blur})"/>

  <path d="${body}" fill="#a9dcd3" opacity=".09"/>
  <g clip-path="url(#${clip})">
    <path d="M28 94 C44 130 33 190 41 245 C47 285 62 303 84 308 L24 308 L24 208 Z" fill="#0a2a2c" opacity=".16"/>
    <g transform="rotate(4 66 214)">
      <rect x="46" y="144" width="40" height="137" rx="12" fill="url(#${p})" opacity=".9"/>
      <path d="M48 158 C57 150 75 150 84 158 L84 174 C72 181 59 181 48 174 Z" fill="#f5e5c7" opacity=".45"/>
      <path d="M53 177 C63 172 73 173 82 177" fill="none" stroke="#8f7759" stroke-width=".75" stroke-linecap="round" opacity=".44"/>
      <path d="M54 187 C65 182 74 183 81 187" fill="none" stroke="#8f7759" stroke-width=".7" stroke-linecap="round" opacity=".4"/>
      <path d="M53 197 C63 192 73 193 81 197" fill="none" stroke="#8f7759" stroke-width=".7" stroke-linecap="round" opacity=".36"/>
      <path d="M54 207 C64 202 71 203 80 207" fill="none" stroke="#8f7759" stroke-width=".7" stroke-linecap="round" opacity=".33"/>
      <path d="M53 217 C65 212 74 213 81 218" fill="none" stroke="#8f7759" stroke-width=".7" stroke-linecap="round" opacity=".3"/>
      <path d="M54 227 C63 222 72 223 80 227" fill="none" stroke="#8f7759" stroke-width=".7" stroke-linecap="round" opacity=".27"/>
      <path d="M53 237 C64 232 73 233 81 237" fill="none" stroke="#8f7759" stroke-width=".7" stroke-linecap="round" opacity=".25"/>
      <circle cx="77" cy="258" r="5.2" fill="#985c55" opacity=".58"/>
      <path d="M49 274 C59 268 70 269 82 275" fill="none" stroke="#8f7759" stroke-width=".65" stroke-linecap="round" opacity=".22"/>
      <path d="M46 144 C53 136 79 136 86 144 L84 152 C72 158 58 157 48 152 Z" fill="#efddbc" opacity=".34"/>
    </g>
    <circle cx="51" cy="190" r="2.2" fill="#e8fbf7" opacity=".3"/>
    <circle cx="88" cy="207" r="1.6" fill="#e8fbf7" opacity=".24"/>
    <circle cx="43" cy="263" r="2.8" fill="#e8fbf7" opacity=".16"/>
    <path d="M35 148 C30 190 32 249 43 286" fill="none" stroke="#e9fffb" stroke-width="3.6" stroke-opacity=".16" filter="url(#${blur})"/>
    <path d="M40 120 C35 163 36 230 44 278" fill="none" stroke="#f6fffc" stroke-width="1.05" stroke-opacity=".38" stroke-linecap="round"/>
    <path d="M96 133 C102 176 101 236 91 281" fill="none" stroke="#d4f4ee" stroke-width="1" stroke-opacity=".25" stroke-linecap="round"/>
    <path d="M63 119 C57 154 57 192 61 221" fill="none" stroke="#fff" stroke-width=".7" stroke-opacity=".17" stroke-linecap="round"/>
  </g>

  <path d="${body}" fill="url(#${g})" stroke="#d9f7f2" stroke-opacity=".36" stroke-width="1.05"/>
  <path d="${body}" fill="none" stroke="#0f3331" stroke-opacity=".16" stroke-width="2.6"/>

  <path d="M52 69 C52 85 47 91 42 105" fill="none" stroke="#fcfffb" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M78 72 C78 87 82 93 87 106" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="1.1" stroke-linecap="round"/>
  <path d="M55 69 L77 69 L77 47 C77 41 72 37 66 37 C60 37 55 41 55 47 Z" fill="url(#${g})" stroke="#d9f7f2" stroke-opacity=".38" stroke-width="1"/>
  <path d="M56 47 C62 51 70 51 76 47" fill="none" stroke="#fff8ea" stroke-opacity=".36" stroke-width=".9"/>
  <path d="M55 42 C61 46 71 46 77 42" fill="none" stroke="#5e928a" stroke-opacity=".27" stroke-width="1.1"/>
  <path d="M53 35 C59 40 73 40 79 35" fill="none" stroke="#e8fbf7" stroke-opacity=".32" stroke-width="1.1"/>

  <path d="M55 14 C55 10 59 7 66 7 C73 7 77 10 77 14 L77 35 C77 39 73 42 66 42 C59 42 55 39 55 35 Z" fill="url(#${c})" stroke="#5b422b" stroke-opacity=".38" stroke-width=".85"/>
  <path d="M58 16 L64 18 M60 24 L74 21 M65 31 L75 29 M58 31 L63 33 M69 13 L72 17" fill="none" stroke="#5d452f" stroke-opacity=".28" stroke-width=".65" stroke-linecap="round"/>

  <path d="M50 59 C57 54 75 54 82 60 C74 63 58 63 50 59 Z" fill="none" stroke="#c8b091" stroke-opacity=".52" stroke-width="1"/>
  <path d="M51 62 C61 58 73 58 81 62" fill="none" stroke="#e7d7bd" stroke-opacity=".3" stroke-width=".7"/>

  <path d="M93 165 l1.4 3.7 3.7 1.4 -3.7 1.4 -1.4 3.7 -1.4 -3.7 -3.7 -1.4 3.7 -1.4 Z" fill="#fff8e7" opacity=".46"/>
  <circle cx="101" cy="255" r="1.1" fill="#f8ead2" opacity=".25"/>
  <circle cx="28" cy="226" r="1.3" fill="#f8ead2" opacity=".2"/>
</svg>`;
  }

  function drawPoemIndex() {
    if (!state.deck.length) {
      state.deck = shuffle(POEMS.map((_, i) => i));
    }
    return state.deck.pop();
  }

  function resetDeck() {
    const preferred = ['听懂了海', '海风', '山海', '平静'];
    const picked = [];
    preferred.forEach(title => {
      const id = POEMS.findIndex(p => p.title === title);
      if (id >= 0 && !picked.includes(id)) picked.push(id);
    });
    const rest = shuffle(POEMS.map((_, i) => i).filter(i => !picked.includes(i)));
    state.deck = rest.concat(picked.reverse());
  }

  function activeBottles() {
    return state.bottles.filter(b => !b.removed && !b.dissolveStarted);
  }

  function incomingBottle() {
    return state.bottles.find(b => !b.removed && !b.dissolveStarted && !b.beached) || null;
  }

  function beachedBottles() {
    return state.bottles.filter(b => !b.removed && !b.dissolveStarted && b.beached);
  }

  function refreshSalvageUI() {
    const incoming = incomingBottle();
    const beached = beachedBottles();
    const active = activeBottles();
    const full = active.length >= 3;
    const busy = !!incoming || full;

    if (dom.btnSalvage) {
      dom.btnSalvage.disabled = busy;
      dom.btnSalvage.classList.toggle('is-busy', !!incoming);
      let label = '打捞漂流瓶';
      if (incoming) label = '正在打捞漂流瓶，请稍候';
      else if (full) label = '沙滩上已有三只漂流瓶，请先拾起';
      dom.btnSalvage.setAttribute('aria-label', label);
      dom.btnSalvage.title = label;
    }

    if (incoming) {
      setHint('潮水正把一只漂流瓶送上来…', false, 'incoming');
    } else if (beached.length) {
      const amount = beached.length === 1 ? '一只' : (beached.length === 2 ? '两只' : '三只');
      setHint(`${amount}漂流瓶靠岸了 · 轻触拾起`, true, `beached-${beached.length}`);
    } else if (state.bottles.some(b => !b.removed && b.dissolveStarted)) {
      setHint('漂流瓶正慢慢回到海里…', false, 'dissolve');
    } else {
      setHint(
        state.hasSalvaged ? '再打捞一只漂流瓶吧' : '轻触「打捞漂流瓶」，从海里取一只漂流瓶',
        false,
        state.hasSalvaged ? 'idle-again' : 'idle-first'
      );
    }
  }

  function salvageBottle() {
    if (!N || incomingBottle() || activeBottles().length >= 3) return;

    let targetX = rand(0.24, 0.76);
    const occupied = state.bottles.filter(b => !b.removed && !b.dissolveStarted).map(b => b.targetX);
    for (let attempt = 0; attempt < 7; attempt++) {
      if (occupied.every(x => Math.abs(x - targetX) > 0.17)) break;
      targetX = rand(0.24, 0.76);
    }

    const bottle = spawnBottle({
      progress: 0.48,
      travel: 9.2,
      targetX
    });
    if (!bottle) return;

    state.hasSalvaged = true;
    refreshSalvageUI();

    const rect = bottle.el.getBoundingClientRect();
    emitMotes(
      rect.left + rect.width * 0.5,
      rect.top + rect.height * 0.72,
      24,
      {
        spread: Math.max(30, rect.width * 1.25),
        upward: 0.55,
        lifeMin: 1.8,
        lifeMax: 4.4
      }
    );
    if (dom.live) {
      dom.live.textContent = '打捞起一只漂流瓶，等它随潮水靠岸。';
    }
  }

  function spawnBottle(options = {}) {
    if (!dom.bottleLayer || !N) return null;
    if (activeBottles().length >= 3) return null;
    if (!state.deck.length) resetDeck();

    const poemIndex = drawPoemIndex();
    if (poemIndex === undefined) return null;
    const poem = POEMS[poemIndex];
    if (!poem) return null;

    const uid = ++state.bottleUid;
    const progress = clamp(options.progress ?? 0);
    const travel = options.travel ?? rand(8, 12);
    const targetX = options.targetX ?? rand(0.28, 0.72);
    const seed = rand(0, TAU);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'bottle is-floating';
    el.disabled = true;
    el.tabIndex = -1;
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('aria-label', `漂流瓶，装着《${poem.title}》`);
    el.style.opacity = '0';
    el.innerHTML =
      `<span class="bottle__halo" aria-hidden="true"></span>` +
      `<span class="bottle__wake" aria-hidden="true"></span>` +
      `<span class="bottle__art" aria-hidden="true">${buildBottleSvg(uid)}</span>`;

    const bottle = {
      uid,
      poemIndex,
      el,
      progress,
      travel: Math.max(4, travel),
      targetX,
      seed,
      age: rand(0, 60),
      reveal: 0,
      beached: false,
      beachedAt: 0,
      dwell: rand(55, 75),
      floatingRotation: rand(-8, 5),
      finalRotation: rand(-9, 10),
      dissolveStarted: false,
      dissolveAge: 0,
      dissolveRect: null,
      removed: false,
      lastEmit: 0
    };

    el.addEventListener('click', () => {
      if (!bottle.beached || bottle.dissolveStarted) return;
      const rect = el.getBoundingClientRect();
      emitMotes(rect.left + rect.width * 0.5, rect.top + rect.height * 0.45, 26, {
        spread: rect.width * 0.55,
        upward: 1.4,
        lifeMin: 1.6,
        lifeMax: 3.8
      });
      openReader(poemIndex, { origin: dom.btnToc, bottle });
    });

    dom.bottleLayer.appendChild(el);
    state.bottles.push(bottle);
    updateBottleElement(bottle, true);
    return bottle;
  }

  function updateBottleElement(bottle, instant = false) {
    const el = bottle.el;
    if (!el) return;
    const p = bottle.progress;
    const age = bottle.age;
    // 以瓶底为锚点：无论屏幕多高，瓶子都会落在同一条潮线上
    const startBaseY = 0.478;
    const endBaseY = 0.845;
    const pathY = startBaseY + (endBaseY - startBaseY) * Math.pow(p, 1.68);
    let x;
    let y;
    let scale;
    let rotation;

    if (!bottle.beached) {
      const startX = 0.5 + (bottle.targetX - 0.5) * 0.16;
      const wobble = Math.sin(age * 0.31 + bottle.seed) * (0.3 + 1.1 * (1 - p));
      x = lerp(startX, bottle.targetX, p) + wobble * 0.008;
      y = pathY + Math.sin(age * 0.72 + bottle.seed) * (0.0022 + p * 0.0028);
      scale = 0.02 + 0.98 * Math.pow(p, 2.4);
      rotation = Math.sin(age * 0.36 + bottle.seed) * 8.0 * (1 - p * 0.35) + bottle.floatingRotation * (1 - p);
      el.style.opacity = String(Math.min(1, p * 18) * bottle.reveal);
    } else {
      const settle = easeOutCubic((state.simTime - bottle.beachedAt) / 3.4);
      x = bottle.targetX + Math.sin(age * 0.22 + bottle.seed) * 0.0012;
      y = endBaseY + Math.sin(age * 0.55 + bottle.seed) * 0.0012;
      scale = 1.0;
      rotation = lerp(bottle.beachRotation, bottle.finalRotation, settle);
      el.style.opacity = String(bottle.reveal);
    }

    el.style.left = `${(x * 100).toFixed(3)}%`;
    el.style.top = `${(y * 100).toFixed(3)}%`;
    el.style.transform = `translate(-50%, -100%) scale(${scale.toFixed(4)}) rotate(${rotation.toFixed(3)}deg)`;
    el.style.zIndex = String(10 + Math.round(p * 30));
  }

  function beachBottle(bottle) {
    if (bottle.beached) return;
    bottle.beached = true;
    bottle.beachedAt = state.simTime;
    bottle.progress = 1;
    bottle.beachRotation = Math.sin(bottle.age * 0.36 + bottle.seed) * 8.0 * 0.65;
    const el = bottle.el;
    el.classList.remove('is-floating');
    el.classList.add('is-beached');
    el.disabled = false;
    el.tabIndex = 0;
    el.removeAttribute('aria-hidden');
    el.title = `拾起漂流瓶，阅读《${POEMS[bottle.poemIndex].title}》`;
    el.setAttribute('aria-label', `拾起漂流瓶，阅读《${POEMS[bottle.poemIndex].title}》`);
    updateBottleElement(bottle, true);
    refreshSalvageUI();
    const rect = el.getBoundingClientRect();
    emitMotes(rect.left + rect.width * 0.5, rect.top + rect.height * 0.78, 18, {
      spread: rect.width * 0.7,
      lifeMin: 2.4,
      lifeMax: 5.2
    });
    if (dom.live) {
      dom.live.textContent = `一只漂流瓶靠岸了，里面是《${POEMS[bottle.poemIndex].title}》。`;
    }
  }

  function beginBottleDissolve(bottle) {
    if (bottle.dissolveStarted) return;
    bottle.dissolveStarted = true;
    bottle.dissolveAge = 0;
    bottle.el.classList.add('is-dissolving');
    bottle.el.classList.remove('is-beached');
    bottle.el.classList.add('is-floating');
    bottle.el.disabled = true;
    bottle.el.tabIndex = -1;
    bottle.el.setAttribute('aria-hidden', 'true');
    bottle.dissolveRect = bottle.el.getBoundingClientRect();
    refreshSalvageUI();
  }

  function updateBottles(dt) {
    for (let i = state.bottles.length - 1; i >= 0; i--) {
      const bottle = state.bottles[i];
      if (bottle.removed) continue;
      bottle.age += dt;
      bottle.reveal = Math.min(1, bottle.reveal + dt / 1.5);

      if (bottle.dissolveStarted) {
        bottle.dissolveAge += dt;
        if (state.particlesOn && bottle.dissolveAge < 4.4) {
          bottle.lastEmit += dt;
          if (bottle.lastEmit > 0.075) {
            bottle.lastEmit = 0;
            emitDissolveMotes(bottle.dissolveRect);
          }
        }
        if (bottle.dissolveAge > 5.15) {
          if (bottle.el && bottle.el.parentNode) bottle.el.parentNode.removeChild(bottle.el);
          bottle.removed = true;
          state.bottles.splice(i, 1);
          refreshSalvageUI();
        }
        continue;
      }

      if (!bottle.beached) {
        bottle.progress += dt / bottle.travel;
        if (bottle.progress >= 1) {
          bottle.progress = 1;
          beachBottle(bottle);
        }
      } else if (!(state.readerOpen && state.readerBottle === bottle)) {
        if (state.simTime - bottle.beachedAt > bottle.dwell) {
          beginBottleDissolve(bottle);
        }
      }

      updateBottleElement(bottle);
    }
  }

  /* ============================================================
     Gulls
     ============================================================ */
  function gullMarkup(size, opacity) {
    return `
<svg class="gull" viewBox="0 0 120 46" style="--size:${size}px;--opacity:${opacity};" aria-hidden="true">
  <g class="gull__wing gull__wing--l">
    <path d="M59 27 C44 24 25 15 5 22 C20 26 38 31 58 32 Z"/>
  </g>
  <g class="gull__wing gull__wing--r">
    <path d="M61 27 C76 24 95 15 115 22 C100 26 82 31 62 32 Z"/>
  </g>
  <ellipse cx="60" cy="29" rx="4.4" ry="2.2"/>
  <path d="M57 31 C59 34 63 34 65 31 C63 33 59 33 57 31 Z" opacity=".7"/>
</svg>`;
  }

  function spawnGulls() {
    if (!dom.gullLayer) return;
    const dirLeft = Math.random() < 0.44;
    const group = document.createElement('div');
    group.className = 'gull-group' + (dirLeft ? ' is-left' : '');
    const duration = rand(38, 62);
    group.style.setProperty('--duration', `${duration.toFixed(1)}s`);
    group.style.top = `${rand(14, 38).toFixed(1)}%`;

    const dayCount = state.width < 700
      ? 2 + Math.floor(Math.random() * 3)
      : 2 + Math.floor(Math.random() * 4);
    const baseSize = state.width < 700 ? rand(9, 16) : rand(12, 23);

    for (let i = 0; i < dayCount; i++) {
      const bird = document.createElement('div');
      bird.innerHTML = gullMarkup(
        (baseSize * rand(0.7, 1.15)).toFixed(1),
        rand(0.2, 0.38).toFixed(2)
      );
      bird.style.marginTop = `${rand(-14, 14).toFixed(1)}px`;
      group.appendChild(bird);
    }
    dom.gullLayer.appendChild(group);
    window.setTimeout(() => {
      if (group.parentNode) group.parentNode.removeChild(group);
    }, (duration + 2) * 1000);
  }

  function updateGulls() {
    if (state.simTime < state.nextGullAt) return;

    // 飞鸟只在日间与暮色将临时出现；深夜不再起飞
    const canFly = state.sunAlt > -0.1;
    if (canFly && dom.gullLayer && dom.gullLayer.children.length < 5) {
      spawnGulls();
      state.nextGullAt = state.simTime + rand(12, 24);
    } else {
      state.nextGullAt = state.simTime + (canFly ? rand(8, 15) : rand(16, 30));
    }
  }

  /* ============================================================
     Tides · WebAudio
     ============================================================ */
  async function initOceanAudio() {
    if (state.audio) return state.audio;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('WebAudio unavailable');

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const seconds = 12;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.105;
        b6 = white * 0.115926;
        const swell = 0.74 + 0.17 * Math.sin((i / rate) * 0.78 + ch * 1.7) + 0.09 * Math.sin((i / rate) * 0.31 + 0.4);
        data[i] = pink * swell * 0.9;
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 72;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 920;
    lp.Q.value = 0.38;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.48;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(bodyGain);
    bodyGain.connect(master);

    const src2 = ctx.createBufferSource();
    src2.buffer = buffer;
    src2.loop = true;
    src2.playbackRate.value = 0.93;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 0.42;
    const foamGain = ctx.createGain();
    foamGain.gain.value = 0.055;
    src2.connect(bp);
    bp.connect(foamGain);
    foamGain.connect(master);

    const swell = ctx.createOscillator();
    swell.type = 'sine';
    swell.frequency.value = 0.067;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.17;
    swell.connect(swellDepth);
    swellDepth.connect(bodyGain.gain);

    const ebb = ctx.createOscillator();
    ebb.type = 'sine';
    ebb.frequency.value = 0.112;
    const ebbDepth = ctx.createGain();
    ebbDepth.gain.value = 0.027;
    ebb.connect(ebbDepth);
    ebbDepth.connect(foamGain.gain);

    src.start();
    src2.start();
    swell.start();
    ebb.start();

    state.audio = { ctx, master, src, src2, swell, ebb };
    return state.audio;
  }

  async function enableAudio() {
    if (state.audioStarting) return;
    state.audioStarting = true;
    try {
      const audio = await initOceanAudio();
      if (audio.ctx.state === 'suspended') await audio.ctx.resume();
      const now = audio.ctx.currentTime;
      audio.master.gain.cancelScheduledValues(now);
      audio.master.gain.setValueAtTime(audio.master.gain.value || 0.0001, now);
      audio.master.gain.linearRampToValueAtTime(0.48, now + 4.2);
      state.soundOn = true;
      syncSoundButton();
      if (dom.live) dom.live.textContent = '轻柔的海浪声已开启。';
    } catch (err) {
      console.warn('Audio unavailable:', err);
      state.soundOn = false;
      syncSoundButton();
      if (dom.btnSound) dom.btnSound.title = '当前浏览器无法播放环境音';
    } finally {
      state.audioStarting = false;
    }
  }

  function disableAudio() {
    if (!state.audio) {
      state.soundOn = false;
      syncSoundButton();
      return;
    }
    const audio = state.audio;
    const now = audio.ctx.currentTime;
    audio.master.gain.cancelScheduledValues(now);
    audio.master.gain.setValueAtTime(audio.master.gain.value, now);
    audio.master.gain.linearRampToValueAtTime(0.0001, now + 1.9);
    state.soundOn = false;
    syncSoundButton();
    if (dom.live) dom.live.textContent = '海浪声已关闭。';
    window.setTimeout(() => {
      if (!state.soundOn && state.audio && state.audio.ctx.state === 'running') {
        state.audio.ctx.suspend().catch(() => {});
      }
    }, 2100);
  }

  function syncSoundButton() {
    if (!dom.btnSound) return;
    dom.btnSound.classList.toggle('is-on', state.soundOn);
    dom.btnSound.setAttribute('aria-pressed', state.soundOn ? 'true' : 'false');
    dom.btnSound.setAttribute('aria-label', state.soundOn ? '关闭轻柔海浪环境音' : '开启轻柔海浪环境音');
    dom.btnSound.title = state.soundOn ? '关闭轻柔海浪环境音' : '开启轻柔海浪环境音';
  }

  /* ============================================================
     Reader
     ============================================================ */
  function setPageInert(inert) {
    if (dom.chrome) dom.chrome.inert = inert;
    if (dom.bottleLayer) dom.bottleLayer.inert = inert;
    document.body.classList.toggle('has-overlay', inert);
  }

  function buildToc() {
    if (!dom.tocScroll) return;
    const frag = document.createDocumentFragment();
    BOOK.volumes.forEach((vol, vi) => {
      const section = document.createElement('section');
      section.className = 'toc__volume';

      const head = document.createElement('div');
      head.className = 'toc__vol-head';
      const no = document.createElement('span');
      no.className = 'toc__vol-no';
      no.textContent = vol.no;
      const name = document.createElement('span');
      name.className = 'toc__vol-name';
      name.textContent = vol.name;
      const sub = document.createElement('span');
      sub.className = 'toc__vol-sub';
      sub.textContent = vol.sub;
      head.append(no, name, sub);

      const list = document.createElement('div');
      list.className = 'toc__list';
      POEMS.forEach((poem, index) => {
        if (poem.volume !== vi) return;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'toc__item';
        item.dataset.index = String(index);
        const itemNo = document.createElement('span');
        itemNo.className = 'toc__item-no';
        itemNo.textContent = pad2(index + 1);
        const title = document.createElement('span');
        title.className = 'toc__item-title';
        title.textContent = poem.title;
        item.append(itemNo, title);
        item.addEventListener('click', () => {
          openReader(index, { origin: dom.btnToc });
        });
        list.appendChild(item);
      });

      section.append(head, list);
      frag.appendChild(section);
    });
    dom.tocScroll.replaceChildren(frag);
  }

  function updateTocCurrent() {
    if (!dom.tocScroll) return;
    dom.tocScroll.querySelectorAll('.toc__item').forEach(item => {
      const active = Number(item.dataset.index) === state.currentIndex;
      item.classList.toggle('is-current', active);
      if (active) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
  }

  function scrollTocToCurrent() {
    if (!dom.tocScroll) return;
    const current = dom.tocScroll.querySelector('.toc__item.is-current');
    if (current) {
      window.setTimeout(() => {
        try {
          current.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (err) {
          current.scrollIntoView();
        }
      }, 360);
    }
  }

  function renderReaderContent(index, animate = false) {
    const poem = POEMS[index];
    if (!poem) return;
    const vol = BOOK.volumes[poem.volume] || { no: '', name: '', sub: '' };

    if (dom.readerVolume) dom.readerVolume.textContent = `${vol.no} · ${vol.name}`;
    if (dom.readerIndex) dom.readerIndex.textContent = pad2(index + 1);
    if (dom.readerTitle) dom.readerTitle.textContent = poem.title;
    if (dom.readerSub) dom.readerSub.textContent = vol.sub || '';
    if (dom.readerScroll) dom.readerScroll.scrollTop = 0;

    if (dom.poemBody) {
      const frag = document.createDocumentFragment();
      const stanzas = String(poem.body || '').replace(/\r/g, '').trim().split(/\n\s*\n/);
      stanzas.forEach(stanza => {
        const p = document.createElement('p');
        p.className = 'poem-stanza';
        stanza.split('\n').forEach(line => {
          const span = document.createElement('span');
          span.className = 'poem-line';
          span.textContent = line;
          p.appendChild(span);
        });
        frag.appendChild(p);
      });
      dom.poemBody.replaceChildren(frag);
      dom.poemBody.classList.remove('is-in');
      if (animate) {
        void dom.poemBody.offsetWidth;
        dom.poemBody.classList.add('is-in');
      }
    }

    if (dom.poemSign) {
      if (poem.sig) {
        dom.poemSign.hidden = false;
        dom.poemSign.textContent = `落款 · ${poem.sig}`;
      } else {
        dom.poemSign.hidden = true;
        dom.poemSign.textContent = '';
      }
    }
    updateTocCurrent();
    if (animate && dom.live) {
      dom.live.textContent = `第${index + 1}首，${poem.title}`;
    }
  }

  function openReader(index, options = {}) {
    if (!POEMS[index] || !dom.reader) return;
    const alreadyOpen = state.readerOpen;
    if (state.tocOpen) {
      closeToc({ restoreFocus: false, keepOverlay: true, silent: true });
    }

    state.currentIndex = index;
    state.readerBottle = options.bottle || null;
    renderReaderContent(index, alreadyOpen);

    if (alreadyOpen) {
      return;
    }

    state.focusReturnReader = options.origin || document.activeElement || dom.btnToc;
    state.readerOpen = true;
    document.body.classList.add('has-overlay');
    dom.reader.classList.add('is-open');
    dom.reader.setAttribute('aria-hidden', 'false');
    setPageInert(true);
    dom.poemBody.classList.add('is-in');
    window.setTimeout(() => {
      if (dom.readerClose && state.readerOpen) {
        try { dom.readerClose.focus({ preventScroll: true }); } catch (err) { dom.readerClose.focus(); }
      }
    }, 420);
    if (dom.live) dom.live.textContent = `正在阅读第${index + 1}首，《${POEMS[index].title}》。`;
  }

  function closeReader(options = {}) {
    if (!state.readerOpen) return;
    state.readerOpen = false;
    dom.reader.classList.remove('is-open');
    dom.reader.setAttribute('aria-hidden', 'true');

    const openedBottle = state.readerBottle;
    state.readerBottle = null;

    if (!options.keepOverlay && !state.tocOpen) {
      setPageInert(false);
    }

    if (openedBottle && openedBottle.beached && !openedBottle.dissolveStarted) {
      beginBottleDissolve(openedBottle);
    } else {
      refreshSalvageUI();
    }

    if (!options.silent) {
      const target = state.focusReturnReader;
      window.setTimeout(() => {
        if (target && target.isConnected && !target.disabled) {
          try { target.focus({ preventScroll: true }); return; } catch (err) { /* ignore */ }
        }
        if (dom.btnToc) dom.btnToc.focus({ preventScroll: true });
      }, 160);
    }
  }

  function openToc(options = {}) {
    if (!dom.toc) return;
    if (state.readerOpen) {
      closeReader({ restoreFocus: false, keepOverlay: true, silent: true });
    }
    if (state.tocOpen) return;
    state.focusReturnToc = options.origin || document.activeElement || dom.btnToc;
    state.tocOpen = true;
    document.body.classList.add('has-overlay');
    dom.toc.classList.add('is-open');
    dom.toc.setAttribute('aria-hidden', 'false');
    setPageInert(true);
    updateTocCurrent();
    scrollTocToCurrent();
    window.setTimeout(() => {
      if (dom.tocClose && state.tocOpen) {
        try { dom.tocClose.focus({ preventScroll: true }); } catch (err) { dom.tocClose.focus(); }
      }
    }, 400);
  }

  function closeToc(options = {}) {
    if (!state.tocOpen) return;
    state.tocOpen = false;
    dom.toc.classList.remove('is-open');
    dom.toc.setAttribute('aria-hidden', 'true');
    if (!options.keepOverlay && !state.readerOpen) {
      setPageInert(false);
    }
    refreshSalvageUI();
    if (!options.silent) {
      const target = state.focusReturnToc;
      window.setTimeout(() => {
        if (target && target.isConnected) {
          try { target.focus({ preventScroll: true }); return; } catch (err) { /* ignore */ }
        }
        if (dom.btnToc) dom.btnToc.focus({ preventScroll: true });
      }, 160);
    }
  }

  function focusableIn(container) {
    return Array.from(container.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => el.offsetParent !== null);
  }

  function trapFocus(container, event) {
    const list = focusableIn(container);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ============================================================
     Events
     ============================================================ */
  function bindEvents() {
    if (dom.btnSalvage) dom.btnSalvage.addEventListener('click', salvageBottle);
    if (dom.btnToc) dom.btnToc.addEventListener('click', event => openToc({ origin: event.currentTarget }));
    if (dom.btnParticles) {
      dom.btnParticles.addEventListener('click', () => {
        setParticlesEnabled(!state.particlesOn);
      });
    }
    if (dom.btnSound) {
      dom.btnSound.addEventListener('click', () => {
        if (state.soundOn) disableAudio();
        else enableAudio();
      });
    }

    if (dom.readerClose) dom.readerClose.addEventListener('click', () => closeReader());
    if (dom.tocClose) dom.tocClose.addEventListener('click', () => closeToc());

    document.querySelectorAll('[data-reader-close]').forEach(el => {
      el.addEventListener('click', () => closeReader());
    });
    document.querySelectorAll('[data-toc-close]').forEach(el => {
      el.addEventListener('click', () => closeToc());
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (state.readerOpen) {
          event.preventDefault();
          closeReader();
        } else if (state.tocOpen) {
          event.preventDefault();
          closeToc();
        }
        return;
      }

      if (state.readerOpen) {
        if (event.key === 'Tab') {
          trapFocus(dom.reader.querySelector('.reader__panel'), event);
        }
      } else if (state.tocOpen) {
        if (event.key === 'Tab') {
          trapFocus(dom.toc.querySelector('.toc__panel'), event);
        }
      }
    });

    window.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      state.mouse.tx = (event.clientX / Math.max(1, state.width)) * 2 - 1;
      state.mouse.ty = (event.clientY / Math.max(1, state.height)) * 2 - 1;
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
      state.mouse.tx = 0;
      state.mouse.ty = 0;
    }, { passive: true });

    window.addEventListener('resize', () => {
      if (state.resizeTimer) clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(() => {
        state.width = window.innerWidth;
        state.height = window.innerHeight;
        resizeWebGL();
        resizeFx();
      }, 110);
    });

    document.addEventListener('visibilitychange', () => {
      if (!state.audio) return;
      if (document.hidden) {
        state.audio.ctx.suspend().catch(() => {});
      } else if (state.soundOn) {
        state.audio.ctx.resume().catch(() => {});
      }
    });
  }

  /* ============================================================
     Frame
     ============================================================ */
  function frame(timestamp) {
    const raw = state.lastFrame ? (timestamp - state.lastFrame) / 1000 : 0.016;
    const dt = Math.min(Math.max(raw, 0), 0.06);
    state.lastFrame = timestamp;
    state.simTime += dt;

    // 在性能较弱的设备上悄悄降低海面着色器的分辨率，保留文字的清晰度
    state.perfAccum += dt;
    state.perfFrames++;
    if (state.simTime > state.perfNextAt && state.perfFrames > 75) {
      const average = state.perfAccum / state.perfFrames;
      if (average > 0.031 && state.renderScale > 0.56) {
        state.renderScale = Math.max(0.55, state.renderScale * 0.82);
        resizeWebGL();
      }
      state.perfAccum = 0;
      state.perfFrames = 0;
      state.perfNextAt = state.simTime + 6;
    }

    // 平滑视差
    state.mouse.x = lerp(state.mouse.x, state.mouse.tx, 0.045);
    state.mouse.y = lerp(state.mouse.y, state.mouse.ty, 0.045);

    if (state.simTime - state.lastEnvUpdate > 0.12) {
      updateEnvironment();
    }
    if (!state.env) updateEnvironment();

    renderSea();

    updateBottles(dt);
    updateGulls();
    updateChromeInfo();
    drawParticles(dt);

    requestAnimationFrame(frame);
  }

  /* ============================================================
     Init
     ============================================================ */
  function cacheDom() {
    dom.scene = document.getElementById('scene');
    dom.seaCanvas = document.getElementById('sea-canvas');
    dom.fxCanvas = document.getElementById('fx-canvas');
    dom.bottleLayer = document.getElementById('bottle-layer');
    dom.gullLayer = document.getElementById('gull-layer');
    dom.chrome = document.getElementById('chrome');
    dom.phase = document.getElementById('phase');
    dom.phaseValue = document.getElementById('phase-value');
    dom.phaseDot = document.getElementById('phase-dot');
    dom.seaHint = document.getElementById('sea-hint');
    dom.seaHintText = document.getElementById('sea-hint-text');
    dom.btnSalvage = document.getElementById('btn-salvage');
    dom.btnToc = document.getElementById('btn-toc');
    dom.btnParticles = document.getElementById('btn-particles');
    dom.btnSound = document.getElementById('btn-sound');
    dom.reader = document.getElementById('reader');
    dom.readerVolume = document.getElementById('reader-volume');
    dom.readerClose = document.getElementById('reader-close');
    dom.readerScroll = document.getElementById('reader-scroll');
    dom.readerIndex = document.getElementById('reader-index');
    dom.readerTitle = document.getElementById('reader-title');
    dom.readerSub = document.getElementById('reader-sub');
    dom.poemBody = document.getElementById('poem-body');
    dom.poemSign = document.getElementById('poem-sign');
    dom.toc = document.getElementById('toc');
    dom.tocClose = document.getElementById('toc-close');
    dom.tocScroll = document.getElementById('toc-scroll');
    dom.live = document.getElementById('live');
  }

  function makeReady() {
    document.body.classList.add('is-ready');
    document.body.classList.remove('is-loading');
  }

  function init() {
    cacheDom();
    buildToc();
    updateChromeTheme();
    setPhaseLabel(phaseFor(START_TOD, Math.sin((START_TOD - 0.25) * TAU)), true);
    updateEnvironment();
    updateChromeInfo(true);
    setParticlesEnabled(true);
    resizeFx();
    initWebGL();
    if (state.glReady) {
      resizeWebGL();
      renderSea();
    } else {
      document.body.classList.add('no-webgl');
    }
    bindEvents();
    resetDeck();
    refreshSalvageUI();
    state.nextGullAt = 1.8 + Math.random() * 2.4;

    requestAnimationFrame(frame);

    window.setTimeout(() => {
      makeReady();
      if (dom.phaseDot) {
        dom.phaseDot.style.transition = 'none';
        dom.phaseDot.style.left = `calc(${(state.dayT * 100).toFixed(2)}% - 1.5px)`;
        requestAnimationFrame(() => { dom.phaseDot.style.transition = ''; });
      }
    }, 1050);
  }

  // 启动。若发生未知错误，也让海面/UI 有机会出现。
  try {
    init();
  } catch (err) {
    console.error('Shiyu init error:', err);
    document.body.classList.add('is-ready', 'no-webgl');
    document.body.classList.remove('is-loading');
  }

  window.addEventListener('error', () => {
    if (document.body.classList.contains('is-loading')) {
      document.body.classList.add('is-ready');
      document.body.classList.remove('is-loading');
    }
  });
})();
