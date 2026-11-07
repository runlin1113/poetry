/* 诗季 · 星空 — 场景装配与主循环 */
(function (root) {
  'use strict';
  var SJ = root.SJ, U = SJ.util, Q = SJ.Q, PAL = SJ.PAL;

  var DATA = root.SHIJI;
  var W = root.innerWidth, H = root.innerHeight;

  /* ------------------------------------------------------------ 渲染器 */
  THREE.ColorManagement.enabled = false;

  function fail(msg) {
    var veil = document.getElementById('veil');
    if (veil) veil.style.display = 'none';
    var el = document.createElement('div');
    el.className = 'fallback';
    el.innerHTML = '<h1>《诗季》</h1><p>' + msg + '</p>' +
      '<p class="dim">在每一个悲伤的时刻，都是诗的季节。</p>';
    document.body.appendChild(el);
  }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });
  } catch (e) {
    fail('这片星空需要 WebGL。请换一个支持 WebGL 的浏览器，或开启硬件加速。');
    return;
  }
  var dpr = Math.min(root.devicePixelRatio || 1, Q.dprMax);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 1);
  renderer.outputEncoding = THREE.LinearEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = true;
  document.getElementById('stage').appendChild(renderer.domElement);

  /* ------------------------------------------------------------ 场景 */
  var scene = new THREE.Scene();
  var isPortrait = (W / H) < 0.85;
  var FOV = isPortrait ? 66 : 58;
  var BASE_PITCH = isPortrait ? 0.152 : 0.176;   // 向上望约 9° / 10°
  var BASE_Y = isPortrait ? 0.95 : 1.02;
  var camera = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 4000);
  camera.position.set(0, BASE_Y, 0);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(BASE_PITCH, 0, 0);

  var sky = SJ.createSky(scene, camera);

  // 低处的夜雾，把草地与远山递给夜空
  scene.fog = new THREE.FogExp2(
    new THREE.Color(PAL.haze[0], PAL.haze[1], PAL.haze[2]), 0.0190
  );

  /* ------------------------------------------------------------ 月光 */
  var moonDir = sky.moonDir;
  var moonLight = new THREE.DirectionalLight(new THREE.Color(0.62, 0.72, 0.92), 1.12);
  moonLight.position.copy(moonDir).multiplyScalar(120);
  scene.add(moonLight);

  var hemi = new THREE.HemisphereLight(
    new THREE.Color(0.058, 0.078, 0.118),
    new THREE.Color(0.012, 0.016, 0.013),
    1.85
  );
  scene.add(hemi);

  var fill = new THREE.DirectionalLight(new THREE.Color(0.20, 0.27, 0.40), 0.34);
  fill.position.set(-90, 42, 55);
  scene.add(fill);

  /* ------------------------------------------------------------ 草地 */
  var meadow = SJ.createMeadow(scene, camera, renderer);

  /* ------------------------------------------------------------ 环境贴图 */
  (function buildEnv() {
    try {
      var c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      var g = c.getContext('2d');
      var grad = g.createLinearGradient(0, 0, 0, 128);
      function css(col) {
        return 'rgb(' + Math.round(255 * Math.pow(col[0], 1 / 2.2)) + ',' +
          Math.round(255 * Math.pow(col[1], 1 / 2.2)) + ',' +
          Math.round(255 * Math.pow(col[2], 1 / 2.2)) + ')';
      }
      grad.addColorStop(0.00, css([0.004, 0.007, 0.016]));
      grad.addColorStop(0.42, css([0.011, 0.019, 0.034]));
      grad.addColorStop(0.50, css([0.036, 0.045, 0.056]));
      grad.addColorStop(0.56, css([0.010, 0.014, 0.017]));
      grad.addColorStop(1.00, css([0.004, 0.006, 0.006]));
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 128);

      // 月亮的微光
      var mx = 256 * 0.16, my = 128 * 0.44;
      var mg = g.createRadialGradient(mx, my, 0, mx, my, 26);
      mg.addColorStop(0, 'rgba(220,235,255,0.55)');
      mg.addColorStop(0.35, 'rgba(150,180,220,0.12)');
      mg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = mg;
      g.fillRect(0, 0, 256, 128);

      var tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.encoding = THREE.sRGBEncoding;
      var pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      var envRT = pmrem.fromEquirectangular(tex);
      scene.environment = envRT.texture;
      tex.dispose();
      pmrem.dispose();
    } catch (e) {
      if (Q.debug) console.warn('env failed', e);
    }
  })();

  /* ------------------------------------------------------------ 后期 */
  var post = SJ.createPost(renderer, scene, camera);
  post.setSize(Math.floor(W * dpr), Math.floor(H * dpr), dpr);

  // 调试开关
  if (Q.params.has('noenv')) scene.environment = null;
  if (Q.params.has('nofog')) scene.fog = null;
  if (Q.params.has('nobloom')) post.setBloom(false);

  /* ------------------------------------------------------------ 音量 */
  var audio = SJ.createAudio();

  /* ------------------------------------------------------------ 界面 */
  var ui = SJ.createUI(DATA, {
    onOpenPoem: function (idx) {
      sky.flash(sky.poemStars[idx] ? idx : -1);
      sky.setHover(-1);
    },
    onClosePoem: function () { sky.setHover(-1); },
    onSpin: function (on) { sky.setSpin(on); },
    onSound: function () { return audio.toggle(); }
  });

  sky.setPoems(DATA.poems);

  if (Q.isMobile) {
    var hintEl = document.getElementById('hint');
    if (hintEl) hintEl.textContent = '拖动环顾 · 轻触诗星阅读';
  }

  /* ------------------------------------------------------------ 交互 */
  var raycasterV = new THREE.Vector3();
  var hoverIndex = -1;
  var pointer = { x: -999, y: -999, active: false, type: 'mouse' };
  var canvas = renderer.domElement;

  function projectStar(idx) {
    var ps = sky.poemStars[idx];
    if (!ps) return null;
    raycasterV.copy(ps.world).project(camera);
    if (raycasterV.z > 1) return null;
    var rect = canvas.getBoundingClientRect();
    return {
      x: (raycasterV.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-raycasterV.y * 0.5 + 0.5) * rect.height + rect.top,
      z: raycasterV.z
    };
  }

  function pickStar(cx, cy) {
    var rect = canvas.getBoundingClientRect();
    var best = -1, bestD = 1e9;
    var radius = pointer.type === 'touch' ? 46 : 30;
    var minR = pointer.type === 'touch' ? 22 : 12;
    for (var i = 0; i < sky.poemStars.length; i++) {
      var s = projectStar(i);
      if (!s) continue;
      var dx = s.x - cx, dy = s.y - cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      // 越靠近地平线，越严格（避免挤在一起时误选）
      var lim = Math.max(minR, radius);
      if (d < lim && d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function applyHover(idx, cx, cy) {
    if (idx === hoverIndex) {
      if (idx >= 0) {
        var s = projectStar(idx);
        if (s) ui.showStarTag(idx, s.x, s.y);
      }
      return;
    }
    hoverIndex = idx;
    sky.setHover(idx);
    if (idx >= 0) {
      var p = projectStar(idx);
      if (p) ui.showStarTag(idx, p.x, p.y);
      canvas.style.cursor = 'pointer';
    } else {
      ui.hideStarTag();
      canvas.style.cursor = 'default';
    }
  }

  /* ------------------------------------------------------------ 视线随鼠标 */
  // 鼠标位置即视线方向；手机端用拖动环顾
  var LOOK_YAW = 0.34;       // 约 ±19.5°
  var LOOK_PITCH = 0.12;     // 约 ±6.9°
  var LOOK_LIMIT_YAW = 0.46;
  var LOOK_LIMIT_PITCH = 0.20;
  var lookTarget = { x: 0, y: 0 };
  var lookNow = { x: 0, y: 0 };
  var lookMoves = 0;
  var drag = { active: false, moved: 0, lastX: 0, lastY: 0, startX: 0, startY: 0, t0: 0 };

  function lookFromPointer(e) {
    var rect = canvas.getBoundingClientRect();
    var nx = U.clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    var ny = U.clamp(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    // 中间平缓、边缘灵动，便于把光标停在诗星上
    var ex = Math.sign(nx) * Math.pow(Math.abs(nx), 1.45);
    var ey = Math.sign(ny) * Math.pow(Math.abs(ny), 1.45);
    lookTarget.x = -ex * LOOK_YAW;
    lookTarget.y = -ey * LOOK_PITCH;
  }

  canvas.addEventListener('pointermove', function (e) {
    lookMoves++;
    if (e.pointerType === 'touch') {
      if (!drag.active) return;
      var dx = e.clientX - drag.lastX;
      var dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      // 像用手推动星空：手指向右，星空向右
      lookTarget.x = U.clamp(lookTarget.x + dx * 0.0016, -LOOK_LIMIT_YAW, LOOK_LIMIT_YAW);
      lookTarget.y = U.clamp(lookTarget.y + dy * 0.0012, -LOOK_LIMIT_PITCH, LOOK_LIMIT_PITCH);
      return;
    }
    pointer.type = 'mouse';
    lookFromPointer(e);
    var reading = ui.poemOpen() || ui.catalogOpen();
    if (reading) {
      applyHover(-1);
      return;
    }
    applyHover(pickStar(e.clientX, e.clientY), e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerleave', function () {
    pointer.active = false;
    applyHover(-1);
  });

  // 光标真的离开窗口时，视线才缓缓回正
  document.documentElement.addEventListener('mouseleave', function () {
    lookTarget.x = 0;
    lookTarget.y = 0;
  });

  canvas.addEventListener('pointerdown', function (e) {
    pointer.type = e.pointerType || 'mouse';
    if (e.pointerType === 'touch') {
      drag.active = true;
      drag.moved = 0;
      drag.lastX = drag.startX = e.clientX;
      drag.lastY = drag.startY = e.clientY;
      drag.t0 = performance.now();
      return;
    }
    var idx = pickStar(e.clientX, e.clientY);
    if (idx >= 0) {
      e.preventDefault();
      sky.flash(idx);
      ui.openPoem(idx);
    } else if (ui.poemOpen() || ui.catalogOpen()) {
      ui.closePoem();
      ui.closeCatalog();
    }
  });

  canvas.addEventListener('pointerup', function (e) {
    if (e.pointerType !== 'touch' || !drag.active) return;
    drag.active = false;
    var held = performance.now() - drag.t0;
    if (drag.moved < 14 && held < 700) {
      var idx = pickStar(e.clientX, e.clientY);
      if (idx >= 0) {
        sky.flash(idx);
        ui.openPoem(idx);
      } else if (ui.poemOpen() || ui.catalogOpen()) {
        ui.closePoem();
        ui.closeCatalog();
      }
    }
  });

  canvas.addEventListener('pointercancel', function () {
    drag.active = false;
  });

  // 轻触时不产生 300ms 延迟
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) pointer.type = 'touch';
  }, { passive: true });

  /* ------------------------------------------------------------ 呼吸 */
  var breathTime = 0;
  var reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var breathAmp = reduceMotion ? 0 : 1;
  if (reduceMotion) {
    sky.setSpin(false);
    ui.setSpinOn(false);
  }

  function breathe(dt) {
    breathTime += dt;
    var t = breathTime;
    lookNow.x = U.damp(lookNow.x, lookTarget.x, 4.0, dt);
    lookNow.y = U.damp(lookNow.y, lookTarget.y, 4.0, dt);
    camera.rotation.x = BASE_PITCH + lookNow.y +
      (Math.sin(t * 0.31) * 0.00062 + Math.sin(t * 0.17 + 1.2) * 0.00038) * breathAmp;
    camera.rotation.y = lookNow.x + (Math.sin(t * 0.21 + 0.4) * 0.00075) * breathAmp;
    camera.rotation.z = (Math.sin(t * 0.13 + 2.1) * 0.00022) * breathAmp;
    // 极轻微的位移视差：近处草与远处星产生一点点相对移动
    camera.position.x = -lookNow.x * 0.09;
    camera.position.z = lookNow.y * 0.06;
    camera.position.y = BASE_Y + Math.sin(t * 0.23 + 0.6) * 0.009 * breathAmp;
  }

  /* ------------------------------------------------------------ 尺寸 */
  function resize() {
    W = root.innerWidth; H = root.innerHeight;
    dpr = Math.min(root.devicePixelRatio || 1, Q.dprMax);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H);

    var portrait = (W / H) < 0.85;
    var fov = portrait ? 66 : 58;
    camera.aspect = W / H;
    if (Math.abs(camera.fov - fov) > 0.5) {
      camera.fov = fov;
      BASE_PITCH = portrait ? 0.152 : 0.176;
      camera.rotation.x = BASE_PITCH;
      sky.setPoems(DATA.poems);
      applyHover(-1);
    }
    camera.updateProjectionMatrix();
    post.setSize(Math.floor(W * dpr), Math.floor(H * dpr), dpr);
    var bh = renderer.domElement.height;
    sky.setStarScale(bh);
    meadow.setMoteScale(bh);
  }
  root.addEventListener('resize', function () {
    clearTimeout(resize._t);
    resize._t = setTimeout(resize, 180);
  });
  resize();

  /* ------------------------------------------------------------ 循环 */
  var clock = new THREE.Clock();
  var elapsed = 0;
  var frames = 0, fpsT = 0;
  var started = false;
  var frameCount = 0;
  var perfChecked = false;
  var degraded = false;

  function degrade() {
    if (degraded) return;
    degraded = true;
    Q.bloomPasses = 1;
    if (dpr > 1) {
      dpr = 1;
      renderer.setPixelRatio(1);
      renderer.setSize(W, H);
      post.setSize(Math.floor(W), Math.floor(H), 1);
      sky.setStarScale(renderer.domElement.height);
      meadow.setMoteScale(renderer.domElement.height);
    }
  }

  var paused = false;
  var framesTotal = 0;
  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
    if (!paused) { clock.getDelta(); }
  });

  function frame() {
    root.requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    if (paused) return;
    framesTotal++;
    elapsed += dt;

    breathe(dt);
    sky.update(dt, elapsed);
    meadow.update(dt, elapsed);

    if (hoverIndex >= 0) {
      var s = projectStar(hoverIndex);
      if (s) ui.showStarTag(hoverIndex, s.x, s.y);
    }

    post.render(elapsed);

    if (!started) {
      started = true;
      frameCount++;
      setTimeout(function () {
        document.body.classList.add('is-ready');
      }, 260);
      if (Q.debug) {
        root.__DIAG__ = {
          tier: Q.tier, stars: Q.stars, grass: Q.grassNear + Q.grassMid + Q.grassFar,
          dpr: dpr, hdr: post.rtScene.texture.type === THREE.HalfFloatType
        };
      }
    }

    frames++; fpsT += dt;
    if (fpsT > 1.2) {
      root.__FPS__ = Math.round(frames / fpsT);
      frames = 0; fpsT = 0;
      if (!perfChecked && elapsed > 6 && !Q.still) {
        perfChecked = true;
        if (root.__FPS__ > 0 && root.__FPS__ < 36) degrade();
      }
    }
  }

  /* ------------------------------------------------------------ 演示参数 */
  if (Q.params.has('poem')) {
    var pi = parseInt(Q.params.get('poem'), 10);
    setTimeout(function () { ui.openPoem(isNaN(pi) ? 0 : pi); }, 900);
  }
  if (Q.params.has('catalog')) {
    setTimeout(function () { ui.openCatalog(); }, 900);
  }
  if (Q.params.has('hover')) {
    var hi = parseInt(Q.params.get('hover'), 10);
    setTimeout(function () {
      var sp = projectStar(hi);
      if (sp) applyHover(hi, sp.x, sp.y);
    }, 1200);
  }

  // 调试接口
  if (Q.debug || Q.params.has('debug')) {
    root.__SJ = {
      sky: sky, meadow: meadow, ui: ui, camera: camera, post: post,
      look: function () {
        return { target: lookTarget, now: lookNow, moves: lookMoves, paused: paused, frames: framesTotal };
      },
      starScreen: function (i) { return projectStar(i); },
      hover: function (i) {
        var sp = projectStar(i);
        if (sp) applyHover(i, sp.x, sp.y);
        return sp;
      },
      click: function (i) {
        var sp = projectStar(i);
        if (sp) {
          canvas.dispatchEvent(new PointerEvent('pointermove', {
            clientX: sp.x, clientY: sp.y, pointerType: 'mouse', bubbles: true
          }));
          canvas.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: sp.x, clientY: sp.y, pointerType: 'mouse', bubbles: true, cancelable: true
          }));
        }
        return sp;
      }
    };
  }

  // 首帧前把星点大小算准
  sky.setStarScale(renderer.domElement.height);
  meadow.setMoteScale(renderer.domElement.height);

  frame();

})(window);
