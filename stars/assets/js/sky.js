/* 诗季 · 星空 — 夜空、银河、群星与诗星 */
(function (root) {
  'use strict';
  var SJ = root.SJ, U = SJ.util, PAL = SJ.PAL, Q = SJ.Q;

  var R_STAR = 1200;
  var POLE = U.dirFromAzAlt(-148, 47);      // 天极
  var SPIN_SPEED = 0.00165;                 // 弧度/秒，约 63 分钟一周

  // 银河走向：一条由两点确定的大圆，横贯天际
  var MW_A = U.dirFromAzAlt(-40, 9);
  var MW_B = U.dirFromAzAlt(38, 24);
  var MW_N = new THREE.Vector3().crossVectors(MW_A, MW_B).normalize();
  var MW_CORE = U.dirFromAzAlt(18, 23.8);

  var MOON_DIR = U.dirFromAzAlt(38, 12.5);

  var NOISE_GLSL = `
    float hash13(vec3 p){
      p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float vnoise(vec3 x){
      vec3 i = floor(x); vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
      float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
      float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
      float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
      float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
      float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
      float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
      float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
      return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                 mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
    }
    float fbm(vec3 p, float oct){
      float v = 0.0, a = 0.52, sum = 0.0;
      for (int i = 0; i < 6; i++){
        float w = step(float(i), oct);
        v += a * vnoise(p) * w;
        sum += a * w;
        p = p * 2.02 + 11.7;
        a *= 0.5;
      }
      return v / max(sum, 0.001);
    }
  `;

  SJ.createSky = function (scene, camera) {
    var group = new THREE.Group();          // 随天极缓慢旋转
    scene.add(group);
    var skyDome, starPts, poemPts, halo, moon, moonGlow;
    var rotAngle = 0;
    var timeUniform = { value: 0 };
    var colU = { value: new THREE.Vector3() };
    var hoverIndex = -1, hoverSmooth = -1;
    var flashIndex = -1, flashStart = -99;
    var spinOn = true;
    var poemStars = [];
    var tmpV = new THREE.Vector3();

    /* -------------------------------------------------------------- 天穹 */
    var domeGeo = new THREE.SphereGeometry(R_STAR * 1.45, 48, 32);
    var domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uTime: timeUniform,
        uSkyRot: { value: new THREE.Matrix3() },
        uGalN: { value: MW_N.clone() },
        uGalCore: { value: MW_CORE.clone() },
        uMoonDir: { value: MOON_DIR.clone() },
        uOct: { value: Q.skyOct },
        uMw: { value: Q.params.has('mw') ? parseFloat(Q.params.get('mw')) : 0.115 },
        uZenith: { value: new THREE.Vector3().fromArray(PAL.zenith) },
        uMid: { value: new THREE.Vector3().fromArray(PAL.skyMid) },
        uHorizon: { value: new THREE.Vector3().fromArray(PAL.horizon) },
        uMwc: { value: new THREE.Vector3().fromArray(PAL.mwCool) },
        uMww: { value: new THREE.Vector3().fromArray(PAL.mwWarm) }
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vDir;
        uniform float uTime, uOct, uMw;
        uniform mat3 uSkyRot;
        uniform vec3 uGalN, uGalCore, uMoonDir, uZenith, uMid, uHorizon, uMwc, uMww;

        ${NOISE_GLSL}

        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;

          // 基础夜色：近地暖灰蓝，天顶深靛
          vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.30, h));
          col = mix(col, uZenith, smoothstep(0.18, 0.92, h));
          // 地平附近的微光
          col += vec3(0.0072, 0.0090, 0.0122) * pow(max(0.0, 1.0 - h), 14.0);

          // 月光雾
          float md = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.045, 0.056, 0.075) * pow(md, 22.0) * 0.85;
          col += vec3(0.018, 0.024, 0.034) * pow(md, 4.0) * 0.55;

          // 银河（随群星一起转）
          vec3 s = uSkyRot * d;
          float lat = dot(s, uGalN);
          float w = abs(lat);

          float coreBand = exp(-pow(w * 16.0, 2.0));     // 主带
          float haloBand = exp(-pow(w * 6.4, 2.0));      // 外晕
          float nFine = fbm(s * 24.0 + 4.1, uOct);       // 细结构
          float nFine2 = fbm(s * 48.0 - 8.3, uOct - 1.0);
          float nDust = fbm(s * 15.0 + 31.3, uOct - 1.0);// 尘埃带
          float dustLane = smoothstep(0.46, 0.70, nDust) * exp(-pow(w * 11.0, 2.0));
          float core = pow(max(dot(s, uGalCore), 0.0), 6.0);
          // 沿天河中央的大裂隙
          float rift = exp(-pow(lat * 42.0, 2.0)) * 0.55;

          float bright = coreBand * (0.86 + 0.55 * nFine + 0.22 * nFine2);
          bright *= (1.0 - 0.62 * dustLane) * (1.0 - rift * 0.38);
          bright += haloBand * 0.15 * (0.55 + 0.55 * nDust);
          bright *= (0.45 + 1.35 * core);
          // 靠近地平线被大气压暗
          bright *= smoothstep(0.0, 0.16, h);

          vec3 mwCol = mix(uMwc, uMww, clamp(0.02 + core * 0.72 + nFine * 0.14, 0.0, 1.0));
          col += mwCol * bright * uMw;

          // 银河里未分辨的星尘
          float sp = vnoise(s * 130.0);
          sp = smoothstep(0.62, 0.98, sp) * coreBand;
          col += vec3(0.30, 0.35, 0.48) * sp * 0.42 * uMw;

          // 地平线以下渐隐
          col = mix(col, vec3(0.009, 0.012, 0.017), smoothstep(0.015, -0.22, h));

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    skyDome = new THREE.Mesh(domeGeo, domeMat);
    skyDome.renderOrder = -100;
    skyDome.frustumCulled = false;
    scene.add(skyDome);

    /* -------------------------------------------------------------- 星点材质 */
    var starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: timeUniform,
        uScale: { value: 800 },
        uOpacity: { value: 1 }
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute float aSpeed;
        attribute float aBright;
        attribute vec3 aTint;
        uniform float uTime, uScale;
        varying vec3 vCol;
        varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float t = uTime * aSpeed + aPhase;
          // 三个不同周期的正弦叠加，像大气抖动
          float s1 = sin(t);
          float s2 = sin(t * 2.13 + aPhase * 1.7);
          float s3 = sin(t * 0.41 + aPhase * 3.1);
          float tw = 0.50 * s1 + 0.32 * s2 + 0.18 * s3;
          float f = 1.0 + 0.42 * tw;
          vec3 nd = normalize(position);
          float horizonFade = smoothstep(-0.02, 0.10, nd.y);
          vA = aBright * f * horizonFade;
          vCol = aTint;
          gl_PointSize = aSize * (1.0 + 0.14 * tw) * (uScale / max(1.0, -mv.z));
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vCol;
        varying float vA;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float core = pow(smoothstep(1.0, 0.0, d), 3.2);
          float glow = exp(-d * d * 3.2) * 0.26;
          float a = (core + glow) * smoothstep(1.0, 0.55, d) * vA;
          if (a < 0.0025) discard;
          gl_FragColor = vec4(vCol, a);
        }
      `
    });

    /* -------------------------------------------------------------- 背景群星 */
    function buildStars(count) {
      var pos = [], size = [], phase = [], speed = [], bright = [], tint = [];
      var cool = new THREE.Color().fromArray(PAL.starCool);
      var warm = new THREE.Color().fromArray(PAL.starWarm);
      var c = new THREE.Color();
      var v = new THREE.Vector3();
      var tries = 0;
      while (pos.length / 3 < count && tries < count * 12) {
        tries++;
        var u = U.rand() * 2 - 1, th = U.rand() * Math.PI * 2;
        var r = Math.sqrt(Math.max(0, 1 - u * u));
        v.set(r * Math.cos(th), u, r * Math.sin(th));
        if (v.y < -0.02) continue;
        // 向银河带聚集
        var lat = Math.abs(v.dot(MW_N));
        var w = 0.22 + 1.9 * Math.exp(-Math.pow(lat / 0.22, 2));
        if (U.rand() > w / 2.12) continue;

        pos.push(v.x * R_STAR, v.y * R_STAR, v.z * R_STAR);
        var mag = Math.pow(U.rand(), 4.6);
        var s = 0.42 + mag * 2.6;
        size.push(s);
        phase.push(U.rand() * 6.283);
        speed.push(0.55 + U.rand() * 1.85);
        bright.push(0.34 + mag * 1.15 + U.rand() * 0.10);
        var t = Math.pow(U.rand(), 1.9);
        c.copy(cool).lerp(warm, t * 0.85);
        var lum = 0.72 + U.rand() * 0.45;
        tint.push(c.r * lum, c.g * lum, c.b * lum);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
      g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
      g.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speed, 1));
      g.setAttribute('aBright', new THREE.Float32BufferAttribute(bright, 1));
      g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 3));
      var pts = new THREE.Points(g, starMat);
      pts.frustumCulled = false;
      pts.renderOrder = 1;
      return pts;
    }
    starPts = buildStars(Q.stars);
    group.add(starPts);

    /* -------------------------------------------------------------- 诗星 */
    var poemMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: timeUniform,
        uScale: { value: 800 },
        uHover: { value: -1 },
        uFlash: { value: -1 },
        uFlashT: { value: 0 }
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute float aIndex;
        attribute float aBright;
        attribute vec3 aTint;
        uniform float uTime, uScale, uHover, uFlash, uFlashT;
        varying vec3 vCol;
        varying float vA;
        varying float vHot;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float hov = step(abs(aIndex - uHover), 0.5);
          float fl = step(abs(aIndex - uFlash), 0.5) * exp(-uFlashT * 1.1) * step(0.0, uFlashT);
          float pulse = 0.80 + 0.16 * sin(uTime * 0.33 + aPhase)
                             + 0.10 * sin(uTime * 1.62 + aPhase * 2.3);
          vA = aBright * pulse * (1.0 + hov * 0.50 + fl * 1.1);
          vCol = aTint;
          vHot = hov;
          float s = aSize * (1.0 + hov * 0.22 + fl * 0.35);
          gl_PointSize = s * (uScale / max(1.0, -mv.z));
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vCol;
        varying float vA;
        varying float vHot;
        uniform float uTime;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float core = pow(smoothstep(1.0, 0.0, d), 3.0);
          float halo = exp(-d * d * 2.1) * 0.38;
          float cx = exp(-abs(p.x) * 58.0) * exp(-abs(p.y) * 7.0);
          float cy = exp(-abs(p.y) * 58.0) * exp(-abs(p.x) * 7.0);
          float cross = (cx + cy) * (0.16 + vHot * 0.34);
          float a = (core * 1.15 + halo + cross) * smoothstep(1.0, 0.5, d) * vA;
          if (a < 0.0025) discard;
          vec3 c = vCol * (1.0 + vHot * 0.55);
          gl_FragColor = vec4(c, a);
        }
      `
    });

    // 五卷 = 五簇
    var clusters = [
      { az: -31.0, alt: 17.5, spread: 5.6 },
      { az: -16.0, alt: 30.5, spread: 5.2 },
      { az: -1.0, alt: 20.5, spread: 5.8 },
      { az: 14.5, alt: 31.0, spread: 5.4 },
      { az: 28.0, alt: 18.0, spread: 4.6 }
    ];

    // 竖屏时把星簇收拢到可视范围内
    function layoutScale() {
      var aspect = camera.aspect || 1.78;
      var hFov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * aspect) * 180 / Math.PI;
      var az = U.clamp(hFov / 86, 0.36, 1);
      return { az: az, alt: az < 0.72 ? 1.34 : 1.0 };
    }

    function buildPoemStars(list) {
      var LS = layoutScale();
      var AZ_SCALE = LS.az, ALT_SCALE = LS.alt;
      var pos = [], size = [], phase = [], idx = [], bright = [], tint = [];
      var gold = new THREE.Color().fromArray(PAL.poemGold);
      var blue = new THREE.Color().fromArray(PAL.poemBlue);
      var c = new THREE.Color();

      var byVol = {};
      list.forEach(function (p, i) {
        var key = p.vol || '卷一';
        (byVol[key] = byVol[key] || []).push(i);
      });

      var used = [];
      list.forEach(function (p, i) {
        var volNames = ['卷一', '卷二', '卷三', '卷四', '卷五'];
        var vi = Math.max(0, volNames.indexOf(p.vol));
        var cl = clusters[vi] || clusters[0];
        var n = (byVol[p.vol] || []).length || 1;
        var local = (byVol[p.vol] || []).indexOf(i);

        var v, tries = 0;
        do {
          var ang = U.rand() * 6.28318;
          var rad = cl.spread * Math.sqrt((local + 0.55) / n) * (0.55 + 0.45 * U.rand());
          var az = cl.az * AZ_SCALE + Math.cos(ang) * rad * AZ_SCALE;
          var alt = (cl.alt - 24) * ALT_SCALE + 24 + Math.sin(ang) * rad * 0.78;
          v = U.dirFromAzAlt(az, alt);
          tries++;
        } while (tries < 24 && used.some(function (u) {
          return u.angleTo(v) < 0.035;
        }));
        used.push(v);

        // 轻微抖动
        v.x += U.rsym(0.002); v.z += U.rsym(0.002); v.normalize();

        var pv = v.clone().multiplyScalar(R_STAR);
        pos.push(pv.x, pv.y, pv.z);

        var s = 4.6 + U.rand() * 3.6;
        size.push(s);
        phase.push(U.rand() * 6.283);
        idx.push(i);
        bright.push(0.55 + U.rand() * 0.45);

        var warm = U.rand();
        c.copy(blue).lerp(gold, 0.30 + warm * 0.62);
        tint.push(c.r, c.g, c.b);

        poemStars.push({ index: i, dir: v.clone(), world: pv.clone(), size: s });
        used.push(pv);
      });

      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
      g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
      g.setAttribute('aIndex', new THREE.Float32BufferAttribute(idx, 1));
      g.setAttribute('aBright', new THREE.Float32BufferAttribute(bright, 1));
      g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 3));
      var pts = new THREE.Points(g, poemMat);
      pts.frustumCulled = false;
      pts.renderOrder = 2;
      return pts;
    }

    /* -------------------------------------------------------------- 悬停光晕 */
    var haloMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uOpacity: { value: 0 },
        uTime: timeUniform
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uOpacity, uTime;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float glow = exp(-r * r * 4.6) * 0.34;
          float core = smoothstep(0.30, 0.0, r) * 0.18;
          float a = (glow + core) * uOpacity;
          vec3 c = mix(vec3(0.60, 0.72, 0.94), vec3(1.0, 0.91, 0.74), 0.5 + 0.22 * sin(uTime * 0.4));
          if (a < 0.002) discard;
          gl_FragColor = vec4(c, a);
        }
      `
    });
    halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
    halo.frustumCulled = false;
    halo.renderOrder = 3;
    halo.visible = false;
    scene.add(halo);

    /* -------------------------------------------------------------- 月 */
    var moonMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: timeUniform },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        ${NOISE_GLSL}
        void main(){
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          // 月盘（很淡，像隔着一层薄雾）
          float limb = smoothstep(0.255, 0.205, r);
          float m = fbm(vec3(p * 3.4, 1.0), 4.0);
          float craters = smoothstep(0.35, 0.72, m) * 0.35 + 0.72;
          float disc = limb * craters * 0.15;
          // 光晕
          float halo1 = exp(-r * r * 5.0) * 0.050;
          float halo2 = exp(-r * 2.2) * 0.026;
          float a = disc + halo1 + halo2;
          vec3 c = mix(vec3(0.72, 0.80, 0.95), vec3(0.95, 0.94, 0.88), 0.4);
          if (a < 0.0015) discard;
          gl_FragColor = vec4(c, a);
        }
      `
    });
    // 月盘很小：scale 决定角直径
    moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), moonMat);
    var moonRadius = 46;
    moon.scale.setScalar(moonRadius * 2.0);
    moon.position.copy(MOON_DIR).multiplyScalar(R_STAR * 1.2);
    moon.lookAt(0, 0, 0);
    moon.renderOrder = -1;
    scene.add(moon);

    /* -------------------------------------------------------------- 旋转矩阵 */
    var m4 = new THREE.Matrix4();
    var m3 = new THREE.Matrix3();
    function applyRotation() {
      group.quaternion.setFromAxisAngle(POLE, rotAngle);
      group.updateMatrixWorld(true);
      m4.makeRotationAxis(POLE, -rotAngle);
      m3.setFromMatrix4(m4);
      domeMat.uniforms.uSkyRot.value.copy(m3);
      // 更新诗星世界坐标
      for (var i = 0; i < poemStars.length; i++) {
        poemStars[i].world.copy(poemStars[i].dir).multiplyScalar(R_STAR).applyQuaternion(group.quaternion);
      }
    }

    /* -------------------------------------------------------------- 对外 */
    var api = {
      group: group,
      poemStars: poemStars,
      pole: POLE,
      moonDir: MOON_DIR,
      moon: moon,
      dome: skyDome,
      get angle() { return rotAngle; },

      setPoems: function (list) {
        if (poemPts) { group.remove(poemPts); poemPts.geometry.dispose(); }
        poemStars.length = 0;
        poemPts = buildPoemStars(list);
        group.add(poemPts);
        applyRotation();
      },

      setSpin: function (on) { spinOn = !!on; },
      isSpinning: function () { return spinOn; },

      setHover: function (i) {
        hoverIndex = i;
        poemMat.uniforms.uHover.value = i;
        if (i >= 0) {
          var ps = poemStars[i];
          if (ps) {
            halo.position.copy(ps.world).multiplyScalar(0.9);
            halo.visible = true;
            halo.scale.setScalar(58);
            halo.lookAt(camera.position);
          }
        }
      },

      flash: function (i) {
        flashIndex = i;
        flashStart = timeUniform.value;
        poemMat.uniforms.uFlash.value = i;
      },

      update: function (dt, elapsed) {
        timeUniform.value = elapsed;
        if (spinOn && !Q.still) {
          rotAngle += dt * SPIN_SPEED;
          if (rotAngle > Math.PI * 2) rotAngle -= Math.PI * 2;
          applyRotation();
        }
        // 悬停光晕呼吸
        var target = hoverIndex >= 0 ? 1 : 0;
        hoverSmooth = U.damp(hoverSmooth, target, 6, dt);
        haloMat.uniforms.uOpacity.value = hoverSmooth * 0.5 * (0.82 + 0.18 * Math.sin(elapsed * 1.1));
        if (hoverIndex >= 0) {
          var ps = poemStars[hoverIndex];
          if (ps) {
            halo.position.copy(ps.world).multiplyScalar(0.9);
            halo.lookAt(camera.position);
          }
        } else if (hoverSmooth < 0.01) {
          halo.visible = false;
        }
        if (flashIndex >= 0) {
          poemMat.uniforms.uFlashT.value = elapsed - flashStart;
        }
        // 月、天穹跟随相机
        skyDome.position.copy(camera.position);
        moon.position.copy(MOON_DIR).multiplyScalar(R_STAR * 1.2).add(camera.position);
        moon.lookAt(camera.position);
      },

      setStarScale: function (px) {
        var s = px * 0.5 / Math.tan((camera.fov * Math.PI / 180) * 0.5) * 1.75;
        starMat.uniforms.uScale.value = s;
        poemMat.uniforms.uScale.value = s;
      }
    };

    // 默认星点大小缩放
    api.setStarScale(800);
    return api;
  };

})(window);
