/* 诗季 · 星空 — 草原、野草、野花、远山 */
(function (root) {
  'use strict';
  var SJ = root.SJ, U = SJ.util, PAL = SJ.PAL, Q = SJ.Q;

  /* ------------------------------------------------------------ 地形噪声 */
  function hash2(x, y, s) {
    var n = Math.sin(x * 127.1 + y * 311.7 + (s || 0) * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  function noise2(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
    var c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm2(x, y, s, oct) {
    var v = 0, a = 0.5, sum = 0;
    for (var i = 0; i < oct; i++) {
      v += a * noise2(x, y, s + i * 13.1);
      sum += a; a *= 0.5;
      x *= 2.03; y *= 2.03;
    }
    return v / sum;
  }

  var ORIGIN_H = 0;

  function groundH(x, z) {
    var d = Math.sqrt(x * x + z * z);
    var broad = (fbm2(x * 0.0075, z * 0.0075, 3.1, 4) - 0.5) * 5.2;
    var mid = (fbm2(x * 0.038, z * 0.038, 8.7, 3) - 0.5) * 0.95;
    var near = (fbm2(x * 0.19, z * 0.19, 2.3, 2) - 0.5) * 0.16;
    var flat = U.smoothstep(0.6, 9.0, d);       // 脚下平缓
    return (broad * flat + mid * (0.35 + 0.65 * flat) + near * flat) - ORIGIN_H;
  }
  ORIGIN_H = (fbm2(0, 0, 3.1, 4) - 0.5) * 5.2 * 0 + 0;

  /* ------------------------------------------------------------ 草叶几何 */
  function bladeGeometry(seg) {
    var pos = [], nor = [], col = [], idx = [];
    var baseW = 0.0118;
    var cBase = new THREE.Color().fromArray(PAL.grassBase);
    var cTip = new THREE.Color().fromArray(PAL.grassTip);
    var tmp = new THREE.Color();

    for (var i = 0; i <= seg; i++) {
      var t = i / seg;
      var y = t;
      var hw = baseW * Math.pow(1 - t, 0.58) + 0.00032;
      // 自然的弧度：先立起，再向外垂
      var cx = 0.165 * Math.pow(t, 1.72) + 0.012 * Math.sin(t * 3.4);
      var cz = 0.055 * t * t;
      // 轻微扭曲
      var tw = t * 0.95 + 0.22;
      var dx = Math.cos(tw) * hw, dz = Math.sin(tw) * hw;
      pos.push(cx - dx, y, cz - dz);
      pos.push(cx + dx, y, cz + dz);

      // 左右两条棱给不同的法线：叶面像折出一道脊
      var nx = -Math.sin(tw), nz = Math.cos(tw);
      var spread = 0.55 * (1 - t * 0.4);
      var c1 = Math.cos(spread), s1 = Math.sin(spread);
      nor.push(nx * c1 - nz * s1, 0.34, nx * s1 + nz * c1);
      nor.push(nx * c1 + nz * s1, 0.34, -nx * s1 + nz * c1);

      // 色：根部深、尖端亮
      var k = Math.pow(t, 0.62);
      tmp.copy(cBase).lerp(cTip, k);
      if (t > 0.82) tmp.lerp(cTip, (t - 0.82) / 0.18 * 0.35);
      col.push(tmp.r, tmp.g, tmp.b);
      col.push(tmp.r, tmp.g, tmp.b);
    }
    for (var j = 0; j < seg; j++) {
      var a = j * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  /* ------------------------------------------------------------ 花与穗几何 */
  function QuadBuilder() {
    this.pos = []; this.nor = []; this.col = []; this.idx = [];
  }
  QuadBuilder.prototype.quad = function (p0, p1, p2, p3, n, c) {
    var i = this.pos.length / 3;
    [p0, p1, p2, p3].forEach(function (p) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(c[0], c[1], c[2]);
    }, this);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  QuadBuilder.prototype.build = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  };

  function flowerGeometry() {
    var q = new QuadBuilder();
    var petal = [0.98, 0.95, 0.92];
    var heart = [1.0, 0.86, 0.52];
    var stemC = [0.16, 0.26, 0.17];
    var petals = 6, seg = 4;

    for (var k = 0; k < petals; k++) {
      var a = k / petals * Math.PI * 2 + 0.35;
      var dx = Math.cos(a), dz = Math.sin(a);
      var px = -dz, pz = dx;
      var len = 0.030 + (k % 2) * 0.0035;
      var lift = 0.016;
      var verts = [];
      for (var i = 0; i <= seg; i++) {
        var u = i / seg;
        var r = len * (0.10 + 0.90 * u);
        var yy = lift * u * u * 1.15 + 0.004;
        var w = len * 0.30 * Math.sin(Math.PI * Math.pow(u, 0.62)) + 0.0004;
        verts.push([
          [dx * r - px * w, yy, dz * r - pz * w],
          [dx * r + px * w, yy, dz * r + pz * w]
        ]);
      }
      var n = [dx * 0.35, 0.94, dz * 0.35];
      for (var s = 0; s < seg; s++) {
        q.quad(verts[s][0], verts[s][1], verts[s + 1][1], verts[s + 1][0], n, petal);
      }
    }
    // 花心
    var R = 0.0075, y0 = 0.006;
    for (var t = 0; t < 8; t++) {
      var a0 = t / 8 * Math.PI * 2, a1 = (t + 1) / 8 * Math.PI * 2;
      q.quad(
        [0, y0 + 0.0035, 0],
        [Math.cos(a0) * R, y0, Math.sin(a0) * R],
        [Math.cos(a1) * R, y0, Math.sin(a1) * R],
        [0, y0 + 0.0035, 0],
        [0, 1, 0], heart
      );
    }
    // 细茎
    var sh = 0.075;
    q.quad([-0.0014, -sh, 0], [0.0014, -sh, 0], [0.0012, y0, 0], [-0.0012, y0, 0], [0, 0, 1], stemC);
    q.quad([0, -sh, -0.0014], [0, -sh, 0.0014], [0, y0, 0.0012], [0, y0, -0.0012], [1, 0, 0], stemC);

    return q.build();
  }

  function seedHeadGeometry() {
    var q = new QuadBuilder();
    var stemC = [0.075, 0.105, 0.080];
    var glume = [0.150, 0.160, 0.115];
    var hStem = 0.56;
    // 主茎：两片交叉
    q.quad([-0.0016, 0, 0], [0.0016, 0, 0], [0.0011, hStem, 0], [-0.0011, hStem, 0],
      [0, 0, 1], stemC);
    q.quad([0, 0, -0.0016], [0, 0, 0.0016], [0, hStem, 0.0011], [0, hStem, -0.0011],
      [1, 0, 0], stemC);
    // 穗芒：向外低垂的细叶
    var N = 7;
    for (var i = 0; i < N; i++) {
      var a = i / N * Math.PI * 2 + 0.3;
      var dx = Math.cos(a), dz = Math.sin(a);
      var px = -dz, pz = dx;
      var len = 0.10 + (i % 3) * 0.022;
      var rise = 0.055 + (i % 2) * 0.030;
      var segs = 3;
      var prev = null;
      for (var s = 0; s <= segs; s++) {
        var u = s / segs;
        var w = 0.0020 * (1 - u * 0.88);
        var r = len * u;
        var y = hStem + rise * Math.sin(u * Math.PI * 0.62) + 0.012 * u;
        var cx = dx * r, cz = dz * r;
        var p0 = [cx - px * w, y, cz - pz * w];
        var p1 = [cx + px * w, y, cz + pz * w];
        if (prev) q.quad(prev[0], prev[1], p1, p0, [dx * 0.3, 0.9, dz * 0.3], glume);
        prev = [p0, p1];
      }
    }
    return q.build();
  }

  /* ------------------------------------------------------------ 主体 */
  SJ.createMeadow = function (scene, camera, renderer) {
    var group = new THREE.Group();
    scene.add(group);

    var hideList = (Q.params.get('hide') || '').split(',');
    function show(name) { return hideList.indexOf(name) < 0; }

    var windUniform = { value: 0 };
    var windStrength = { value: 1 };
    var timeUniform = { value: 0 };
    var meshes = [];
    var dummy = new THREE.Object3D();
    var tmpColor = new THREE.Color();
    var bladeGeo = bladeGeometry(Q.bladeSeg);

    /* ---------------------------------------------------------- 泥土 */
    var terrainGeo = new THREE.PlaneGeometry(760, 760, 150, 150);
    terrainGeo.rotateX(-Math.PI / 2);
    var tp = terrainGeo.attributes.position;
    var tcol = new Float32Array(tp.count * 3);
    var soil = new THREE.Color().fromArray(PAL.soil);
    var soil2 = new THREE.Color().fromArray([0.0105, 0.0145, 0.0120]);
    for (var i = 0; i < tp.count; i++) {
      var x = tp.getX(i), z = tp.getZ(i);
      var y = groundH(x, z);
      tp.setY(i, y);
      var n = fbm2(x * 0.26, z * 0.26, 5.5, 3);
      tmpColor.copy(soil).lerp(soil2, U.smoothstep(0.35, 0.75, n));
      tcol[i * 3] = tmpColor.r; tcol[i * 3 + 1] = tmpColor.g; tcol[i * 3 + 2] = tmpColor.b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
    terrainGeo.computeVertexNormals();

    var groundMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 1.0,
      metalness: 0.0,
      specularIntensity: 0.05,
      envMapIntensity: 0.10,
      dithering: true
    });
    if (Q.params.has('gcol')) {
      // 调试：涂黑地面，判断亮带来源
      for (var ci = 0; ci < tcol.length; ci++) tcol[ci] = 0;
      terrainGeo.attributes.color.needsUpdate = true;
    }
    if (Q.params.has('gnoenv')) groundMat.envMapIntensity = 0;
    var ground = new THREE.Mesh(terrainGeo, groundMat);
    ground.receiveShadow = false;
    if (show('ground')) group.add(ground);

    /* ---------------------------------------------------------- 草 */
    function makeGrassMat() {
      var mat = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.86,
        metalness: 0.0,
        specularIntensity: 0.40,
        side: THREE.DoubleSide,
        envMapIntensity: 0.18,
        dithering: true
      });
      mat.onBeforeCompile = function (shader) {
        shader.uniforms.uTime = timeUniform;
        shader.uniforms.uWind = windStrength;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', [
            '#include <common>',
            'uniform float uTime;',
            'uniform float uWind;',
            'float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
            'float gn(vec2 p){',
            '  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
            '  float a = gh(i), b = gh(i + vec2(1.0, 0.0)), c = gh(i + vec2(0.0, 1.0)), d = gh(i + vec2(1.0, 1.0));',
            '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
            '}'
          ].join('\n'))
          .replace('#include <begin_vertex>', [
            '#include <begin_vertex>',
            'vec3 iOrg = instanceMatrix[3].xyz;',
            'float hN = clamp(position.y, 0.0, 1.0);',
            'float ph = gh(iOrg.xz * 1.37) * 6.2831;',
            'float gust = gn(iOrg.xz * 0.052 + vec2(uTime * 0.020, -uTime * 0.016));',
            'float gust2 = gn(iOrg.xz * 0.19 + vec2(-uTime * 0.055, uTime * 0.041));',
            'float flutter = sin(uTime * 2.45 + ph * 3.1) * 0.045 + sin(uTime * 4.1 + ph) * 0.018;',
            'float sway = sin(uTime * 0.58 + ph + iOrg.x * 0.15 + iOrg.z * 0.10) * 0.55',
            '           + sin(uTime * 0.29 + ph * 1.9) * 0.45;',
            'float amp = (sway * (0.30 + 0.70 * gust) + (gust2 - 0.5) * 0.55 + flutter) * uWind;',
            'float bend = amp * hN * hN * 0.26;',
            'transformed.x += bend;',
            'transformed.z += bend * 0.42;',
            'transformed.y -= abs(bend) * 0.32 * hN;'
          ].join('\n'));
      };
      return mat;
    }

    var grassMat = makeGrassMat();

    function scatterRing(mesh, r0, r1, count, hMin, hMax, wMin, wMax, tintFn, dim) {
      var color = new THREE.Color();
      var maxV = mesh.instanceMatrix.count;
      var n = Math.min(count, maxV);
      var placed = 0;
      var attempt = 0;
      while (placed < n && attempt < n * 4) {
        attempt++;
        var rr = Math.sqrt(U.rand() * (r1 * r1 - r0 * r0) + r0 * r0);
        var a = U.rand() * Math.PI * 2;
        var x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        var y = groundH(x, z);

        // 疏密：成簇，留出可穿行的缝隙
        var cluster = fbm2(x * 0.32, z * 0.32, 11.3, 2);
        if (U.rand() > 0.42 + cluster * 1.05) { continue; }

        var h = U.lerp(hMin, hMax, Math.pow(U.rand(), 1.18));
        if (U.rand() < 0.16) h *= 1.22;
        var w = U.lerp(wMin, wMax, U.rand());
        dummy.position.set(x, y - 0.02, z);
        dummy.rotation.set(U.rsym(0.30) * U.rand(), U.rand() * 6.283, U.rsym(0.30) * U.rand());
        dummy.scale.set(w, h, w);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        color.copy(tintFn(x, z, placed));
        if (dim) color.multiplyScalar(dim);
        mesh.setColorAt(placed, color);
        placed++;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.count = placed;
      mesh.frustumCulled = false;
      return mesh;
    }

    var greenA = new THREE.Color().fromArray([0.92, 1.02, 0.90]);
    var greenB = new THREE.Color().fromArray([1.16, 1.02, 0.78]);
    var greenC = new THREE.Color().fromArray([0.80, 0.96, 1.02]);
    var greenDry = new THREE.Color().fromArray([1.25, 1.10, 0.72]);
    function grassTint(x, z, i) {
      var t = fbm2(x * 0.55, z * 0.55, 4.7, 2);
      var c = new THREE.Color().copy(greenA).lerp(greenB, U.smoothstep(0.45, 0.85, t) * 0.85);
      c.lerp(greenC, U.smoothstep(0.2, 0.0, t) * 0.5 + (i % 7 === 0 ? 0.12 : 0));
      var lum = 0.55 + U.rand() * 0.85;
      c.multiplyScalar(lum);
      // 少许枯草
      var dry = U.rand();
      if (dry > 0.934) {
        c.lerp(greenDry, 0.55);
      }
      return c;
    }

    var nearGrass = new THREE.InstancedMesh(bladeGeo, grassMat, Q.grassNear);
    var midGrass = new THREE.InstancedMesh(bladeGeo, grassMat, Q.grassMid);
    var farGrass = new THREE.InstancedMesh(bladeGeo, grassMat, Q.grassFar);

    scatterRing(nearGrass, 0.28, 10.5, Q.grassNear, 0.24, 0.90, 0.85, 1.6, grassTint, 1.0);
    scatterRing(midGrass, 8.6, 27.0, Q.grassMid, 0.40, 1.00, 1.0, 1.9, grassTint, 0.80);
    scatterRing(farGrass, 25.0, 110.0, Q.grassFar, 0.48, 1.10, 1.1, 2.2, grassTint, 0.55);

    // 近处高草：丛生，几茎野草掠过天际线
    var tallCount = Math.round(Q.grassNear * 0.0011) + 26;
    var tallGrass = new THREE.InstancedMesh(bladeGeo, grassMat, tallCount);
    var tplaced = 0;
    var clumps = Math.ceil(tallCount / 4);
    for (var ci2 = 0; ci2 < clumps && tplaced < tallCount; ci2++) {
      var ta = U.rand() * Math.PI * 2;
      var tr = 2.6 + Math.pow(U.rand(), 0.55) * 7.4;
      var cx = Math.cos(ta) * tr, cz = Math.sin(ta) * tr;
      var per = 2 + ((U.rand() * 3) | 0);
      for (var b2 = 0; b2 < per && tplaced < tallCount; b2++) {
        var tx = cx + U.rsym(0.22), tz = cz + U.rsym(0.22);
        dummy.position.set(tx, groundH(tx, tz) - 0.03, tz);
        dummy.rotation.set(U.rsym(0.34), U.rand() * 6.283, U.rsym(0.34));
        var tw = U.rr(1.15, 1.65);
        dummy.scale.set(tw, U.rr(1.0, 1.38), tw);
        dummy.updateMatrix();
        tallGrass.setMatrixAt(tplaced, dummy.matrix);
        var tc2 = grassTint(tx, tz, tplaced);
        tc2.multiplyScalar(U.rr(0.8, 1.1));
        tallGrass.setColorAt(tplaced, tc2);
        tplaced++;
      }
    }
    tallGrass.instanceMatrix.needsUpdate = true;
    if (tallGrass.instanceColor) tallGrass.instanceColor.needsUpdate = true;
    tallGrass.frustumCulled = false;
    tallGrass.count = tplaced;
    group.add(tallGrass);

    group.add(nearGrass, midGrass, farGrass);
    meshes.push(nearGrass, midGrass, farGrass);
    if (!show('near')) nearGrass.visible = false;
    if (!show('mid')) midGrass.visible = false;
    if (!show('far')) farGrass.visible = false;

    /* ---------------------------------------------------------- 穗 */
    var seedMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
      envMapIntensity: 0.30
    });
    seedMat.onBeforeCompile = grassMat.onBeforeCompile;
    var seedCount = Math.round(Q.grassNear * 0.0042) + 16;
    var seedMesh = new THREE.InstancedMesh(seedHeadGeometry(), seedMat, seedCount);
    var placed = 0, guard = 0;
    while (placed < seedCount && guard < seedCount * 40) {
      guard++;
      var sa = U.rand() * Math.PI * 2;
      var sr = 1.2 + Math.pow(U.rand(), 0.7) * 12.0;
      var sx = Math.cos(sa) * sr, sz = Math.sin(sa) * sr;
      dummy.position.set(sx, groundH(sx, sz) - 0.02, sz);
      dummy.rotation.set(U.rsym(0.06), U.rand() * 6.283, U.rsym(0.06));
      var ss = U.rr(0.55, 1.05);
      dummy.scale.set(ss, U.rr(0.7, 1.15), ss);
      dummy.updateMatrix();
      seedMesh.setMatrixAt(placed, dummy.matrix);
      tmpColor.setRGB(1, 1, 1).multiplyScalar(U.rr(0.7, 1.25));
      seedMesh.setColorAt(placed, tmpColor);
      placed++;
    }
    seedMesh.instanceMatrix.needsUpdate = true;
    if (seedMesh.instanceColor) seedMesh.instanceColor.needsUpdate = true;
    seedMesh.frustumCulled = false;
    seedMesh.count = placed;
    group.add(seedMesh);
    meshes.push(seedMesh);

    /* ---------------------------------------------------------- 野花 */
    var flowerMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.5,
      emissive: new THREE.Color(0.075, 0.085, 0.105),
      emissiveIntensity: 0.55
    });
    var flowerCount = Q.flowers;
    var flowers = new THREE.InstancedMesh(flowerGeometry(), flowerMat, flowerCount);
    var tints = [
      [1.00, 0.99, 0.95],
      [0.92, 0.88, 1.00],
      [1.00, 0.95, 0.80],
      [0.86, 0.94, 1.00]
    ];
    var fplaced = 0; guard = 0;
    while (fplaced < flowerCount && guard < flowerCount * 40) {
      guard++;
      var fa = U.rand() * Math.PI * 2;
      var fr = 0.9 + Math.pow(U.rand(), 0.62) * 15.0;
      var cl = fbm2(Math.cos(fa) * fr * 0.3, Math.sin(fa) * fr * 0.3, 21.7, 2);
      if (U.rand() > 0.25 + cl * 1.2) continue;
      var fx = Math.cos(fa) * fr, fz = Math.sin(fa) * fr;
      dummy.position.set(fx, groundH(fx, fz) + U.rr(0.22, 0.62), fz);
      dummy.rotation.set(U.rsym(0.16), U.rand() * 6.283, U.rsym(0.16));
      var fs = U.rr(0.50, 0.95);
      dummy.scale.set(fs, fs, fs);
      dummy.updateMatrix();
      flowers.setMatrixAt(fplaced, dummy.matrix);
      var tc = tints[(U.rand() * tints.length) | 0];
      tmpColor.setRGB(tc[0] * U.rr(0.72, 1.0), tc[1] * U.rr(0.72, 1.0), tc[2] * U.rr(0.72, 1.0));
      flowers.setColorAt(fplaced, tmpColor);
      fplaced++;
    }
    flowers.instanceMatrix.needsUpdate = true;
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
    flowers.frustumCulled = false;
    flowers.count = fplaced;
    group.add(flowers);
    meshes.push(flowers);

    /* ---------------------------------------------------------- 远山 */
    function ridgeMesh(radius, baseY, height, seed, colorLow, colorHigh, hazeAmt, rimAmt) {
      var segs = 420;
      var pos = [], hts = [], idx = [];
      var raw = [];
      for (var i = 0; i <= segs; i++) {
        var t = i / segs * Math.PI * 2;
        var n1 = fbm2(Math.cos(t) * 2.4 + 10, Math.sin(t) * 2.4 + 10, seed, 4);
        var n2 = fbm2(Math.cos(t) * 6.8 - 4, Math.sin(t) * 6.8 - 4, seed + 5, 3);
        var n3 = Math.pow(noise2(Math.cos(t) * 17.0, Math.sin(t) * 17.0, seed + 9), 2.6);
        raw.push(height * (0.20 + n1 * 1.10 + n2 * 0.40 + n3 * 0.62));
      }
      // 轻微平滑，得到连绵的山脊
      for (var pass = 0; pass < 2; pass++) {
        var smoothed = [];
        for (var k = 0; k <= segs; k++) {
          var a = raw[(k - 1 + segs) % segs], b = raw[k], c = raw[(k + 1) % segs];
          smoothed.push(a * 0.22 + b * 0.56 + c * 0.22);
        }
        raw = smoothed;
      }
      for (var i2 = 0; i2 <= segs; i2++) {
        var ang = i2 / segs * Math.PI * 2;
        var x = Math.cos(ang) * radius, z = Math.sin(ang) * radius;
        var y = baseY + raw[i2];
        pos.push(x, baseY, z);
        pos.push(x, y, z);
        hts.push(0, 1);
      }
      for (var j = 0; j < segs; j++) {
        var a0 = j * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
        idx.push(a0, b1, a1, a0, b0, b1);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aH', new THREE.Float32BufferAttribute(hts, 1));
      g.setIndex(idx);

      var mat = new THREE.ShaderMaterial({
        fog: false,
        side: THREE.DoubleSide,
        uniforms: {
          uLow: { value: new THREE.Vector3().fromArray(colorLow) },
          uHigh: { value: new THREE.Vector3().fromArray(colorHigh) },
          uHaze: { value: new THREE.Vector3().fromArray(PAL.haze) },
          uHazeAmt: { value: hazeAmt },
          uRim: { value: rimAmt },
          uMoonDir: { value: U.dirFromAzAlt(38, 12.5) }
        },
        vertexShader: `
          attribute float aH;
          varying float vH;
          varying vec3 vDir;
          void main(){
            vH = aH;
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying float vH;
          varying vec3 vDir;
          uniform vec3 uLow, uHigh, uHaze, uMoonDir;
          uniform float uHazeAmt, uRim;

          float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n2(vec2 p){
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
                       mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
          }

          void main(){
            vec3 c = mix(uLow, uHigh, smoothstep(0.0, 1.0, vH));
            // 山体上极淡的褶皱，避免像剪纸
            vec2 pp = normalize(vDir).xz * 26.0 + vec2(normalize(vDir).y * 9.0);
            float grain = n2(pp) * 0.6 + n2(pp * 2.7) * 0.4;
            c *= 0.88 + 0.24 * grain;
            // 越靠山脊，越接近天空雾色（朦胧）
            float haze = uHazeAmt + (1.0 - vH) * 0.46 - vH * 0.10;
            c = mix(c, uHaze, clamp(haze, 0.0, 1.0));
            float side = smoothstep(-0.35, 0.95, dot(normalize(vDir), uMoonDir));
            float rim = smoothstep(0.97, 1.0, vH) * side;
            c += vec3(0.006, 0.008, 0.012) * rim * uRim;
            gl_FragColor = vec4(c, 1.0);
          }
        `
      });
      var m = new THREE.Mesh(g, mat);
      m.renderOrder = 0;
      return m;
    }

    var ridgeFar = ridgeMesh(980, -60, 120, 31.7, PAL.ridgeFar, [0.0062, 0.0086, 0.0126], 0.62, 0.55);
    var ridgeMid = ridgeMesh(790, -55, 88, 17.3, PAL.ridgeMid, [0.0044, 0.0062, 0.0092], 0.40, 0.45);
    var ridgeNear = ridgeMesh(620, -50, 56, 5.9, PAL.ridgeNear, [0.0028, 0.0040, 0.0060], 0.24, 0.30);
    group.add(ridgeFar, ridgeMid, ridgeNear);
    if (!show('ridges')) {
      ridgeFar.visible = ridgeMid.visible = ridgeNear.visible = false;
    }

    /* ---------------------------------------------------------- 浮尘 */
    var moteGeo = new THREE.BufferGeometry();
    var MPC = Q.motes;
    var mpos = new Float32Array(MPC * 3), mphase = new Float32Array(MPC),
      msize = new Float32Array(MPC), mbright = new Float32Array(MPC);
    for (var mi = 0; mi < MPC; mi++) {
      var ma = U.rand() * Math.PI * 2;
      var mr = 2.0 + Math.pow(U.rand(), 0.6) * 24;
      var my = 0.15 + Math.pow(U.rand(), 1.4) * 2.4;
      mpos[mi * 3] = Math.cos(ma) * mr;
      mpos[mi * 3 + 1] = my;
      mpos[mi * 3 + 2] = Math.sin(ma) * mr;
      mphase[mi] = U.rand() * 6.283;
      msize[mi] = U.rr(0.35, 1.0);
      mbright[mi] = U.rr(0.03, 0.14);
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
    moteGeo.setAttribute('aPhase', new THREE.BufferAttribute(mphase, 1));
    moteGeo.setAttribute('aSize', new THREE.BufferAttribute(msize, 1));
    moteGeo.setAttribute('aBright', new THREE.BufferAttribute(mbright, 1));
    var moteMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: timeUniform, uScale: { value: 700 } },
      vertexShader: `
        attribute float aPhase, aSize, aBright;
        uniform float uTime, uScale;
        varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime * 0.21 + aPhase) * 0.55 + sin(uTime * 0.07 + aPhase * 2.1) * 1.2;
          p.y += sin(uTime * 0.15 + aPhase * 1.7) * 0.22;
          p.z += cos(uTime * 0.19 + aPhase * 1.3) * 0.55;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.55 + 0.45 * sin(uTime * 0.7 + aPhase * 2.0);
          vA = aBright * tw;
          gl_PointSize = aSize * (uScale / max(1.0, -mv.z));
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-d * d * 4.0) * vA;
          if (a < 0.002) discard;
          gl_FragColor = vec4(vec3(0.62, 0.70, 0.86), a);
        }
      `
    });
    var motes = new THREE.Points(moteGeo, moteMat);
    motes.frustumCulled = false;
    group.add(motes);

    /* ---------------------------------------------------------- 萤火虫 */
    var flyCount = Q.fireflies;
    var flyGeo = new THREE.BufferGeometry();
    var fpos = new Float32Array(flyCount * 3);
    var fphase = new Float32Array(flyCount);
    var fperiod = new Float32Array(flyCount);
    var fsize = new Float32Array(flyCount);
    var ftint = new Float32Array(flyCount * 3);
    var flyTintA = new THREE.Color(0.86, 1.00, 0.46);   // 黄绿
    var flyTintB = new THREE.Color(1.00, 0.84, 0.42);   // 暖金
    var flyC = new THREE.Color();
    for (var fi = 0; fi < flyCount; fi++) {
      var fa = U.rand() * Math.PI * 2;
      var fr = Q.isMobile
        ? 2.0 + Math.pow(U.rand(), 1.25) * 7.8
        : 1.2 + Math.pow(U.rand(), 1.75) * 15.0;
      var fx = Math.cos(fa) * fr, fz = Math.sin(fa) * fr;
      fpos[fi * 3] = fx;
      fpos[fi * 3 + 1] = groundH(fx, fz) + 0.30 + Math.pow(U.rand(), 0.8) * 0.85;
      fpos[fi * 3 + 2] = fz;
      fphase[fi] = U.rand();
      fperiod[fi] = U.rr(2.6, 6.8);
      fsize[fi] = U.rr(1.4, 3.2);
      flyC.copy(flyTintA).lerp(flyTintB, Math.pow(U.rand(), 0.7));
      flyC.multiplyScalar(U.rr(0.85, 1.25));
      ftint[fi * 3] = flyC.r;
      ftint[fi * 3 + 1] = flyC.g;
      ftint[fi * 3 + 2] = flyC.b;
    }
    flyGeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    flyGeo.setAttribute('aPhase', new THREE.BufferAttribute(fphase, 1));
    flyGeo.setAttribute('aPeriod', new THREE.BufferAttribute(fperiod, 1));
    flyGeo.setAttribute('aSize', new THREE.BufferAttribute(fsize, 1));
    flyGeo.setAttribute('aTint', new THREE.BufferAttribute(ftint, 3));

    var flyMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: timeUniform, uScale: { value: 19 } },
      vertexShader: `
        attribute float aPhase, aPeriod, aSize;
        attribute vec3 aTint;
        uniform float uTime, uScale;
        varying vec3 vCol;
        varying float vA;
        void main(){
          vec3 p = position;
          float t = uTime;
          // 缓慢游走，各有各的轨迹
          p.x += sin(t * 0.29 + aPhase * 6.283) * 0.75
               + sin(t * 0.11 + aPhase * 11.0) * 1.45;
          p.y += sin(t * 0.37 + aPhase * 8.0) * 0.22
               + sin(t * 0.14 + aPhase * 4.0) * 0.16;
          p.z += cos(t * 0.25 + aPhase * 5.0) * 0.75
               + cos(t * 0.09 + aPhase * 9.0) * 1.45;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;

          // 每只萤火虫自己的明灭节奏：短促亮起，慢慢暗下，再久久的黑
          float cyc = fract(uTime / aPeriod + aPhase);
          float flash = smoothstep(0.0, 0.03, cyc) * (1.0 - smoothstep(0.03, 0.50, cyc));
          float idle = 0.12 + 0.04 * sin(uTime * 1.7 + aPhase * 23.0);
          vA = idle + flash * 1.05;
          vCol = aTint;

          gl_PointSize = clamp(aSize * (1.0 + flash * 0.45) * (uScale / max(1.0, -mv.z)), 1.5, 30.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vCol;
        varying float vA;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float core = exp(-d * d * 10.0);
          float halo = exp(-d * d * 3.0) * 0.40;
          float edge = smoothstep(1.0, 0.45, d);
          float a = (core + halo) * edge * vA;
          if (a < 0.002) discard;
          gl_FragColor = vec4(vCol * (0.6 + 0.6 * core), a);
        }
      `
    });
    var flies = new THREE.Points(flyGeo, flyMat);
    flies.frustumCulled = false;
    group.add(flies);
    if (!show('flies')) flies.visible = false;

    /* ---------------------------------------------------------- 几块石头 */
    var rockMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.030, 0.036, 0.042),
      roughness: 0.82,
      metalness: 0.02,
      envMapIntensity: 0.55,
      flatShading: true
    });
    for (var ri = 0; ri < 5; ri++) {
      var rg = new THREE.IcosahedronGeometry(1, 2);
      var rp = rg.attributes.position;
      for (var vi = 0; vi < rp.count; vi++) {
        var vx = rp.getX(vi), vy = rp.getY(vi), vz = rp.getZ(vi);
        var n = fbm2(vx * 2.4 + ri * 5, vz * 2.4 - vy * 1.3, 6.1 + ri, 3);
        var k = 1 + (n - 0.5) * 0.55;
        rp.setXYZ(vi, vx * k, vy * k * 0.62, vz * k);
      }
      rg.computeVertexNormals();
      var rock = new THREE.Mesh(rg, rockMat);
      var ra = 1.1 + ri * 1.7, rrad = 2.6 + ri * 1.3;
      var rx = Math.cos(ra) * rrad, rz = Math.sin(ra) * rrad;
      var rs = 0.16 + U.rand() * 0.34;
      rock.position.set(rx, groundH(rx, rz) + rs * 0.12, rz);
      rock.rotation.set(U.rsym(0.5), U.rand() * 6.28, U.rsym(0.5));
      rock.scale.set(rs, rs * 0.72, rs * 1.15);
      group.add(rock);
    }

    /* ---------------------------------------------------------- 更新 */
    var api = {
      group: group,
      groundH: groundH,
      update: function (dt, elapsed) {
        timeUniform.value = elapsed;
        // 缓慢的阵风起伏
        var g = Math.sin(elapsed * 0.071) * 0.5 + Math.sin(elapsed * 0.031 + 1.7) * 0.5;
        windStrength.value = 0.82 + g * 0.42 + Math.sin(elapsed * 0.19) * 0.08;
        if (Q.still) windStrength.value = 0.9;
      },
      setMoteScale: function (px) {
        moteMat.uniforms.uScale.value = (px / 800) * 19;
        flyMat.uniforms.uScale.value = (px / 800) * (Q.isMobile ? 19 : 14);
      }
    };
    api.setMoteScale(renderer.domElement.height || 800);
    api.meshes = meshes;
    return api;
  };

})(window);
