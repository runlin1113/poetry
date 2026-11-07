/* 诗季 · 星空 — 后期：柔和辉光、胶片颗粒、暗角 */
(function (root) {
  'use strict';
  var SJ = root.SJ, Q = SJ.Q, U = SJ.util;

  SJ.createPost = function (renderer, scene, camera) {
    var size = new THREE.Vector2();
    var dpr = 1;

    var hdr = renderer.capabilities.isWebGL2 ||
      (renderer.extensions && renderer.extensions.has('OES_texture_half_float'));
    var type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;

    var rtScene = new THREE.WebGLRenderTarget(2, 2, {
      type: type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
    });
    var rtA = new THREE.WebGLRenderTarget(2, 2, {
      type: type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false
    });
    var rtB = rtA.clone();
    var rtC = rtA.clone();
    var rtD = rtA.clone();

    var quadScene = new THREE.Scene();
    var quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var quadGeo = new THREE.PlaneGeometry(2, 2);
    var quad = new THREE.Mesh(quadGeo, null);
    quad.frustumCulled = false;
    quadScene.add(quad);

    var VS = `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `;

    var brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 0.52 },
        uKnee: { value: 0.34 }
      },
      vertexShader: VS,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uThreshold, uKnee;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = max(max(c.r, c.g), c.b);
          float k = smoothstep(uThreshold, uThreshold + uKnee, l);
          gl_FragColor = vec4(c * k, 1.0);
        }
      `,
      depthTest: false, depthWrite: false
    });

    var blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uDir: { value: new THREE.Vector2(1, 0) }
      },
      vertexShader: VS,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel, uDir;
        void main(){
          vec3 sum = vec3(0.0);
          float wsum = 0.0;
          for (int i = -5; i <= 5; i++){
            float fi = float(i);
            float w = exp(-fi * fi / 14.0);
            sum += texture2D(tDiffuse, vUv + uDir * uTexel * fi).rgb * w;
            wsum += w;
          }
          gl_FragColor = vec4(sum / wsum, 1.0);
        }
      `,
      depthTest: false, depthWrite: false
    });

    var compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tBloomWide: { value: null },
        uTime: { value: 0 },
        uExposure: { value: 1.18 },
        uBloom: { value: 0.50 },
        uBloomWide: { value: 0.20 },
        uGrain: { value: 0.030 },
        uVignette: { value: 0.38 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uWarm: { value: 0.0 }
      },
      vertexShader: VS,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tScene, tBloom, tBloomWide;
        uniform float uTime, uExposure, uBloom, uBloomWide, uGrain, uVignette, uWarm;
        uniform vec2 uRes;

        vec3 aces(vec3 x){
          return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
        }
        float hash21(vec2 p){
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        vec3 toSRGB(vec3 c){
          return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055,
                     step(0.0031308, c));
        }

        void main(){
          vec2 uv = vUv;
          vec3 sceneC = texture2D(tScene, uv).rgb;
          vec3 bloom = texture2D(tBloom, uv).rgb;
          vec3 wide = texture2D(tBloomWide, uv).rgb;

          vec3 col = sceneC + bloom * uBloom + wide * uBloomWide;
          col *= uExposure;

          // 冷暖分离：暗部偏青蓝，亮部微暖
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col += vec3(-0.0012, 0.0006, 0.0030) * (0.6 - smoothstep(0.0, 0.35, lum));
          col += vec3(0.0060, 0.0034, 0.0000) * smoothstep(0.10, 0.85, lum) * uWarm;

          col = aces(max(col, 0.0));
          col = toSRGB(col);

          // 暗角
          vec2 q = uv - 0.5;
          float vig = smoothstep(0.92, 0.28, length(q * vec2(1.04, 0.98)));
          col *= mix(1.0, vig, uVignette);

          // 胶片颗粒（24 帧 / 秒，柔和）
          float gt = floor(uTime * 24.0);
          vec2 gp = gl_FragCoord.xy;
          float g1 = hash21(gp * 0.83 + gt * 1.37);
          float g2 = hash21(gp * 1.31 + gt * 2.11 + 17.0);
          vec3 grain = vec3(g1, g2, (g1 + g2) * 0.5) - 0.5;
          float grainAmt = uGrain * (0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.55, lum)));
          col += grain * grainAmt;

          // 抖动，防止夜空出现色带
          col += (hash21(gp * 3.1 + gt) - 0.5) / 255.0;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false, depthWrite: false
    });

    function pass(mat, target) {
      quad.material = mat;
      renderer.setRenderTarget(target || null);
      renderer.clear(true, true, true);
      renderer.render(quadScene, quadCam);
    }

    function setSize(w, h, pixelRatio) {
      dpr = pixelRatio;
      size.set(w, h);
      var bw = Math.max(2, Math.floor(w)), bh = Math.max(2, Math.floor(h));
      rtScene.setSize(bw, bh);
      var hw = Math.max(2, Math.floor(bw * 0.5)), hh = Math.max(2, Math.floor(bh * 0.5));
      rtA.setSize(hw, hh);
      rtB.setSize(hw, hh);
      var qw = Math.max(2, Math.floor(bw * 0.25)), qh = Math.max(2, Math.floor(bh * 0.25));
      rtC.setSize(qw, qh);
      rtD.setSize(qw, qh);
      compMat.uniforms.uRes.value.set(bw, bh);
      blurMat.uniforms.uTexel.value.set(1 / hw, 1 / hh);
    }

    var api = {
      rtScene: rtScene,
      comp: compMat,
      setSize: setSize,
      setBloom: function (on) {
        compMat.uniforms.uBloom.value = on ? 0.50 : 0.0;
        compMat.uniforms.uBloomWide.value = on ? 0.26 : 0.0;
      },
      render: function (time) {
        renderer.setRenderTarget(rtScene);
        renderer.clear(true, true, true);
        renderer.render(scene, camera);

        // 亮部提取
        brightMat.uniforms.tDiffuse.value = rtScene.texture;
        pass(brightMat, rtA);

        // 半分辨率高斯
        blurMat.uniforms.tDiffuse.value = rtA.texture;
        blurMat.uniforms.uDir.value.set(1, 0);
        pass(blurMat, rtB);
        blurMat.uniforms.tDiffuse.value = rtB.texture;
        blurMat.uniforms.uDir.value.set(0, 1);
        pass(blurMat, rtA);
        if (Q.bloomPasses > 1) {
          blurMat.uniforms.tDiffuse.value = rtA.texture;
          blurMat.uniforms.uDir.value.set(1.6, 0);
          pass(blurMat, rtB);
          blurMat.uniforms.tDiffuse.value = rtB.texture;
          blurMat.uniforms.uDir.value.set(0, 1.6);
          pass(blurMat, rtA);
        }

        // 四分之一分辨率宽泛光
        blurMat.uniforms.tDiffuse.value = rtA.texture;
        blurMat.uniforms.uDir.value.set(1.0, 0);
        blurMat.uniforms.uTexel.value.set(1 / rtC.width, 1 / rtC.height);
        pass(blurMat, rtC);
        blurMat.uniforms.tDiffuse.value = rtC.texture;
        blurMat.uniforms.uDir.value.set(0, 1);
        pass(blurMat, rtD);

        compMat.uniforms.tScene.value = rtScene.texture;
        compMat.uniforms.tBloom.value = rtA.texture;
        compMat.uniforms.tBloomWide.value = rtD.texture;
        compMat.uniforms.uTime.value = time;
        pass(compMat, null);
      }
    };

    // 初始尺寸
    setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
    return api;
  };

})(window);
