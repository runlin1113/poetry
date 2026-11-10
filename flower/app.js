/* =========================================================
   送你一片花海 · 春日山谷
   A procedural, first-person spring valley.
   Every flower carries a poem from 凌润林《诗季》.
   ========================================================= */

(function () {
  "use strict";

  /* ---------- 0. Small helpers ---------- */

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const fract = (v) => v - Math.floor(v);
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const smootherstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rngRange(rng, a, b) {
    return a + (b - a) * rng();
  }

  function hash2(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function valueNoise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  function fbm(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let px = x;
    let py = y;
    for (let i = 0; i < octaves; i++) {
      sum += valueNoise(px, py) * amp;
      norm += amp;
      px *= lacunarity;
      py *= lacunarity;
      amp *= gain;
    }
    return sum / norm;
  }

  function ridgedNoise(x, y, octaves = 4) {
    let sum = 0;
    let amp = 0.55;
    let norm = 0;
    let px = x;
    let py = y;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(valueNoise(px, py) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      px *= 2.03;
      py *= 2.03;
      amp *= 0.5;
    }
    return sum / norm;
  }

  const TMP_V1 = new THREE.Vector3();
  const TMP_V2 = new THREE.Vector3();
  const TMP_V3 = new THREE.Vector3();
  const TMP_M1 = new THREE.Matrix4();
  const TMP_Q1 = new THREE.Quaternion();

  function makeColor(value) {
    return value instanceof THREE.Color ? value.clone() : new THREE.Color(value);
  }

  function damp(current, target, lambda, dt) {
    return lerp(current, target, 1 - Math.exp(-lambda * dt));
  }

  function showFatal(message) {
    console.error(message);
    const box = document.getElementById("error");
    if (box) {
      box.hidden = false;
      const text = box.querySelector(".error__text");
      if (text && message) text.textContent = message;
    }
    document.body.classList.add("has-error");
  }

  /* ---------- 1. Quality & feature detection ---------- */

  const params = new URLSearchParams(window.location.search);
  const debugHour = Number.parseFloat(params.get("hour"));
  const freezeTime = params.has("freeze") || params.get("cycle") === "off";
  const qualityOverride = params.get("quality");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const narrowScreen = Math.min(window.innerWidth, window.innerHeight) < 680;
  const lowPower = qualityOverride === "low" || (qualityOverride !== "high" && (coarsePointer || narrowScreen));

  const QUALITY = {
    low: lowPower,
    dprCap: lowPower ? 1.2 : 1.42,
    grass: lowPower ? 14000 : 28000,
    peony: lowPower ? 26 : 58,
    daisy: lowPower ? 190 : 420,
    buttercup: lowPower ? 170 : 400,
    clover: lowPower ? 95 : 235,
    camellia: lowPower ? 5 : 10,
    cherryClusters: lowPower ? 520 : 1380,
    extraBlossoms: lowPower ? 250 : 820,
    fallPetals: lowPower ? 10 : 28,
    mossTufts: lowPower ? 280 : 620,
    dofTaps: lowPower ? 9 : 14,
    shadowSize: lowPower ? 1024 : 2048
  };

  /* ---------- 2. Renderer & camera ---------- */

  const canvas = document.getElementById("world");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false
    });
  } catch (error) {
    showFatal("这片花海需要支持 WebGL 的浏览器。请开启硬件加速后再试。");
    return;
  }

  if (!renderer.getContext()) {
    showFatal("无法创建 WebGL 场景。请开启浏览器硬件加速后再试。");
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.dprCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0b100d, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvas.setAttribute("tabindex", "0");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 1500);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const cameraState = {
    baseX: 0.04,
    baseZ: 8.35,
    yaw: 0.032,
    pitch: -0.07,
    lookYaw: 0,
    lookPitch: 0,
    aimYaw: 0,
    aimPitch: 0,
    dragYaw: 0,
    dragPitch: 0,
    roll: 0
  };

  function updateViewportSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / Math.max(height, 1);
    let fov = 52;
    if (aspect < 0.72) fov = 68;
    else if (aspect < 1.05) fov = 61;
    else if (aspect < 1.32) fov = 56;
    camera.aspect = aspect;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    return { width, height, aspect };
  }

  updateViewportSize();

  /* ---------- 3. Cinematic post processing ---------- */

  const FS_VERTEX = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const BRIGHT_FRAGMENT = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tScene;
    uniform float uThreshold;
    uniform float uKnee;

    void main() {
      vec3 c = texture2D(tScene, vUv).rgb;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float soft = clamp((luma - uThreshold + uKnee) / max(2.0 * uKnee, 0.0001), 0.0, 1.0);
      float contribution = max(soft, step(uThreshold, luma));
      contribution *= smoothstep(uThreshold - uKnee * 0.35, uThreshold + uKnee, luma);
      gl_FragColor = vec4(c * contribution, 1.0);
    }
  `;

  const BLUR_FRAGMENT = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tInput;
    uniform vec2 uTexel;
    uniform vec2 uDirection;

    void main() {
      vec2 stepUv = uTexel * uDirection;
      vec3 sum = texture2D(tInput, vUv).rgb * 0.2270270270;
      sum += texture2D(tInput, vUv + stepUv * 1.3846153846).rgb * 0.3162162162;
      sum += texture2D(tInput, vUv - stepUv * 1.3846153846).rgb * 0.3162162162;
      sum += texture2D(tInput, vUv + stepUv * 3.2307692308).rgb * 0.0702702703;
      sum += texture2D(tInput, vUv - stepUv * 3.2307692308).rgb * 0.0702702703;
      gl_FragColor = vec4(sum, 1.0);
    }
  `;

  const FINAL_FRAGMENT = `
    precision highp float;
    varying vec2 vUv;

    uniform sampler2D tScene;
    uniform sampler2D tDepth;
    uniform sampler2D tBloom;
    uniform vec4 uResolution;
    uniform float uAspect;
    uniform float uNear;
    uniform float uFar;
    uniform float uFocus;
    uniform float uAperture;
    uniform float uMaxBlur;
    uniform float uExposure;
    uniform float uBloom;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uRayStrength;
    uniform vec2 uSunScreen;
    uniform vec3 uShadowGrade;
    uniform vec3 uHighlightGrade;
    uniform vec3 uRayColor;
    uniform float uFade;

    #define DOF_TAPS ${QUALITY.dofTaps}

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float linearDepth(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return (uNear * uFar) / max(uFar - d * (uFar - uNear), 0.0001);
    }

    vec3 acesFilm(vec3 x) {
      x = max(vec3(0.0), x);
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }

    vec3 linearToSRGB(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
    }

    void main() {
      vec2 uv = vUv;
      float z = linearDepth(uv);

      float coc = clamp(abs(z - uFocus) / max(z, 0.45) * uAperture, 0.0, uMaxBlur);
      float skyMask = smoothstep(uFar * 0.82, uFar * 0.985, z);
      coc *= mix(1.0, 0.055, skyMask);
      vec2 radius = coc * uResolution.zw * 1.15;
      vec2 spin = vec2(0.88, 0.48);
      float angle = 6.28318530718 * fract(sin(dot(uv, spin) * 91.345) * 47453.5453);

      vec3 color = texture2D(tScene, uv).rgb * 1.7;
      float weight = 1.7;
      for (int i = 0; i < DOF_TAPS; i++) {
        float fi = float(i);
        float t = sqrt((fi + 0.5) / float(DOF_TAPS));
        float a = angle + fi * 2.3999632297;
        vec2 offset = vec2(cos(a), sin(a)) * radius * t;
        vec2 sampleUv = clamp(uv + offset, vec2(0.001), vec2(0.999));
        color += texture2D(tScene, sampleUv).rgb;
        weight += 1.0;
      }
      color /= weight;

      vec3 bloom = texture2D(tBloom, uv).rgb;
      color += bloom * uBloom;

      if (uRayStrength > 0.0005) {
        vec2 sunDir = uSunScreen - uv;
        float dist = length(sunDir * vec2(uAspect, 1.0));
        float mask = smoothstep(1.02, 0.02, dist);
        vec3 rays = vec3(0.0);
        for (int i = 1; i <= 8; i++) {
          float fi = float(i) / 8.0;
          vec2 suv = clamp(uv + sunDir * fi * 0.68, vec2(0.001), vec2(0.999));
          rays += texture2D(tBloom, suv).rgb * (1.0 - fi * 0.62);
        }
        rays /= 5.52;
        color += rays * uRayStrength * mask * uRayColor * 1.28;
      }

      color *= uExposure;
      color = acesFilm(color);
      color += vec3(0.0035, 0.0055, 0.0045) * (1.0 - color);
      vec3 filmCurve = smoothstep(vec3(0.0), vec3(1.0), color);
      color = mix(color, filmCurve, 0.16);

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color *= mix(uShadowGrade, uHighlightGrade, smoothstep(0.02, 0.82, luma));
      color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, uSaturation * 1.035);

      vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
      float vignette = 1.0 - smoothstep(0.28, 0.93, length(q)) * uVignette;
      color *= vignette;

      float grainSeed = floor(uTime * 11.0);
      float grain = hash12(gl_FragCoord.xy + vec2(grainSeed * 17.17, grainSeed * 3.71)) - 0.5;
      color += grain * uGrain * (0.38 + 0.62 * (1.0 - smoothstep(0.0, 0.74, luma)));
      color = max(color, 0.0);
      color *= uFade;

      float dither = (hash12(gl_FragCoord.xy + 19.19) - 0.5) / 255.0;
      color += dither;
      gl_FragColor = vec4(linearToSRGB(color), 1.0);
    }
  `;

  class CinematicPost {
    constructor(rendererRef, sceneRef, cameraRef) {
      this.renderer = rendererRef;
      this.scene = sceneRef;
      this.camera = cameraRef;
      this.width = 1;
      this.height = 1;
      this.bufferWidth = 1;
      this.bufferHeight = 1;
      this.pixelRatio = 1;

      const canHalfFloat =
        rendererRef.capabilities.isWebGL2 &&
        (rendererRef.extensions.has("EXT_color_buffer_half_float") || rendererRef.extensions.has("EXT_color_buffer_float"));
      this.sceneType = canHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;

      this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: this.sceneType,
        depthBuffer: true,
        stencilBuffer: false
      });
      this.sceneTarget.depthTexture = new THREE.DepthTexture(1, 1);
      this.sceneTarget.depthTexture.format = THREE.DepthFormat;
      this.sceneTarget.depthTexture.type = THREE.UnsignedIntType;
      this.sceneTarget.depthTexture.minFilter = THREE.NearestFilter;
      this.sceneTarget.depthTexture.magFilter = THREE.NearestFilter;

      this.bloomA = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: false,
        stencilBuffer: false
      });
      this.bloomB = this.bloomA.clone();

      this.quadScene = new THREE.Scene();
      this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
      this.quad.frustumCulled = false;
      this.quadScene.add(this.quad);

      this.brightMaterial = new THREE.ShaderMaterial({
        vertexShader: FS_VERTEX,
        fragmentShader: BRIGHT_FRAGMENT,
        uniforms: {
          tScene: { value: null },
          uThreshold: { value: 0.95 },
          uKnee: { value: 0.28 }
        },
        depthTest: false,
        depthWrite: false
      });

      this.blurMaterial = new THREE.ShaderMaterial({
        vertexShader: FS_VERTEX,
        fragmentShader: BLUR_FRAGMENT,
        uniforms: {
          tInput: { value: null },
          uTexel: { value: new THREE.Vector2(1, 1) },
          uDirection: { value: new THREE.Vector2(1, 0) }
        },
        depthTest: false,
        depthWrite: false
      });

      this.finalMaterial = new THREE.ShaderMaterial({
        vertexShader: FS_VERTEX,
        fragmentShader: FINAL_FRAGMENT,
        uniforms: {
          tScene: { value: null },
          tDepth: { value: null },
          tBloom: { value: null },
          uResolution: { value: new THREE.Vector4(1, 1, 1, 1) },
          uAspect: { value: 1 },
          uNear: { value: this.camera.near },
          uFar: { value: this.camera.far },
          uFocus: { value: 4.2 },
          uAperture: { value: 3.2 },
          uMaxBlur: { value: 7.0 },
          uExposure: { value: 1.0 },
          uBloom: { value: 0.28 },
          uTime: { value: 0 },
          uGrain: { value: 0.019 },
          uVignette: { value: 0.34 },
          uSaturation: { value: 0.97 },
          uRayStrength: { value: 0.0 },
          uSunScreen: { value: new THREE.Vector2(0.5, 1.2) },
          uShadowGrade: { value: new THREE.Color(0.94, 0.99, 1.04) },
          uHighlightGrade: { value: new THREE.Color(1.035, 1.0, 0.95) },
          uRayColor: { value: new THREE.Color(1.0, 0.78, 0.52) },
          uFade: { value: 0.0 }
        },
        depthTest: false,
        depthWrite: false
      });
    }

    setSize(width, height, pixelRatio) {
      this.width = width;
      this.height = height;
      this.pixelRatio = pixelRatio;
      this.bufferWidth = Math.max(2, Math.floor(width * pixelRatio));
      this.bufferHeight = Math.max(2, Math.floor(height * pixelRatio));

      this.sceneTarget.setSize(this.bufferWidth, this.bufferHeight);
      const bw = Math.max(2, Math.floor(this.bufferWidth * 0.34));
      const bh = Math.max(2, Math.floor(this.bufferHeight * 0.34));
      this.bloomA.setSize(bw, bh);
      this.bloomB.setSize(bw, bh);

      this.finalMaterial.uniforms.uResolution.value.set(
        this.bufferWidth,
        this.bufferHeight,
        1 / this.bufferWidth,
        1 / this.bufferHeight
      );
      this.finalMaterial.uniforms.uAspect.value = width / Math.max(1, height);
      this.finalMaterial.uniforms.uNear.value = this.camera.near;
      this.finalMaterial.uniforms.uFar.value = this.camera.far;
      this.blurMaterial.uniforms.uTexel.value.set(1 / bw, 1 / bh);
    }

    pass(material, target) {
      this.quad.material = material;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.quadScene, this.quadCamera);
    }

    render() {
      this.renderer.setRenderTarget(this.sceneTarget);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, this.camera);

      this.brightMaterial.uniforms.tScene.value = this.sceneTarget.texture;
      this.pass(this.brightMaterial, this.bloomA);

      this.blurMaterial.uniforms.tInput.value = this.bloomA.texture;
      this.blurMaterial.uniforms.uDirection.value.set(1, 0);
      this.pass(this.blurMaterial, this.bloomB);

      this.blurMaterial.uniforms.tInput.value = this.bloomB.texture;
      this.blurMaterial.uniforms.uDirection.value.set(0, 1);
      this.pass(this.blurMaterial, this.bloomA);

      const uniforms = this.finalMaterial.uniforms;
      uniforms.tScene.value = this.sceneTarget.texture;
      uniforms.tDepth.value = this.sceneTarget.depthTexture;
      uniforms.tBloom.value = this.bloomA.texture;

      this.quad.material = this.finalMaterial;
      this.renderer.setRenderTarget(null);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.quadScene, this.quadCamera);
    }
  }

  const post = new CinematicPost(renderer, scene, camera);
  updatePostSize();

  function updatePostSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY.dprCap);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    post.setSize(width, height, pixelRatio);
  }

  /* ---------- 4. Shared clock ---------- */

  const clock = {
    time: 0,
    windTime: 0,
    hour: Number.isFinite(debugHour) ? ((debugHour % 24) + 24) % 24 : 6.55,
    dayDuration: 240,
    started: false,
    paused: false
  };

  const windUniform = { value: 0 };
  const ui = {
    poemOpen: false,
    lastFocused: null,
    lastHoverCheck: 0,
    hovered: null,
    pointerDown: false,
    pointerStartX: 0,
    pointerStartY: 0,
    pointerMoved: false,
    pointerId: null,
    introDismissed: false,
    modalSettleUntil: 0,
    lastModalFrame: 0
  };

  /* ---------- 5. The light of a whole spring day ---------- */

  const NUMERIC_PALETTE_KEYS = [
    "sunIntensity",
    "moonIntensity",
    "hemiIntensity",
    "ambientIntensity",
    "exposure",
    "bloomStrength",
    "stars",
    "moonGlow",
    "sunGlow",
    "cloudAmount",
    "fogDensity",
    "rayStrength",
    "saturation",
    "vignette"
  ];

  const COLOR_PALETTE_KEYS = [
    "zenith",
    "horizon",
    "lower",
    "sunColor",
    "moonColor",
    "hemiSky",
    "hemiGround",
    "fog",
    "cloud",
    "water",
    "rayColor"
  ];

  const rawTimeKeys = [
    {
      h: 0,
      zenith: 0x040b16,
      horizon: 0x14233a,
      lower: 0x0a1016,
      sunColor: 0x9fbbdf,
      moonColor: 0xdde8ff,
      hemiSky: 0x40577b,
      hemiGround: 0x111a15,
      fog: 0x13202b,
      cloud: 0x18253a,
      water: 0x102129,
      rayColor: 0x8aa3c7,
      sunIntensity: 0.0,
      moonIntensity: 0.92,
      hemiIntensity: 0.46,
      ambientIntensity: 0.12,
      exposure: 1.36,
      bloomStrength: 0.46,
      stars: 1.0,
      moonGlow: 1.0,
      sunGlow: 0.0,
      cloudAmount: 0.2,
      fogDensity: 0.0065,
      rayStrength: 0.0,
      saturation: 0.9,
      vignette: 0.42,
      shadowGrade: [0.82, 0.91, 1.06],
      highlightGrade: [0.92, 0.97, 1.06]
    },
    {
      h: 4.35,
      zenith: 0x162235,
      horizon: 0x665b5d,
      lower: 0x1e2225,
      sunColor: 0xe7ad87,
      moonColor: 0xc6d7ed,
      hemiSky: 0x536a85,
      hemiGround: 0x22251e,
      fog: 0x4d4b4c,
      cloud: 0x695c61,
      water: 0x172529,
      rayColor: 0xd19a78,
      sunIntensity: 0.0,
      moonIntensity: 0.55,
      hemiIntensity: 0.4,
      ambientIntensity: 0.12,
      exposure: 1.25,
      bloomStrength: 0.5,
      stars: 0.42,
      moonGlow: 0.36,
      sunGlow: 0.24,
      cloudAmount: 0.2,
      fogDensity: 0.0075,
      rayStrength: 0.0,
      saturation: 0.9,
      vignette: 0.4,
      shadowGrade: [0.88, 0.94, 1.07],
      highlightGrade: [1.02, 0.96, 0.92]
    },
    {
      h: 5.85,
      zenith: 0x577697,
      horizon: 0xf7bb7d,
      lower: 0x4c4a45,
      sunColor: 0xffbf7e,
      moonColor: 0xd4e0f3,
      hemiSky: 0x8799a5,
      hemiGround: 0x4a4737,
      fog: 0xa99a89,
      cloud: 0xf1c39b,
      water: 0x273a3a,
      rayColor: 0xffc28b,
      sunIntensity: 1.5,
      moonIntensity: 0.06,
      hemiIntensity: 0.56,
      ambientIntensity: 0.14,
      exposure: 1.08,
      bloomStrength: 0.9,
      stars: 0.08,
      moonGlow: 0.06,
      sunGlow: 1.0,
      cloudAmount: 0.46,
      fogDensity: 0.0078,
      rayStrength: 0.72,
      saturation: 0.94,
      vignette: 0.36,
      shadowGrade: [0.92, 0.96, 1.03],
      highlightGrade: [1.06, 1.0, 0.92]
    },
    {
      h: 7.55,
      zenith: 0x6c99bb,
      horizon: 0xecd6b8,
      lower: 0x7f8977,
      sunColor: 0xffe0b1,
      moonColor: 0xd4e0f3,
      hemiSky: 0xafc5c7,
      hemiGround: 0x586048,
      fog: 0xb8beb0,
      cloud: 0xeedfc9,
      water: 0x31504a,
      rayColor: 0xffddb0,
      sunIntensity: 2.2,
      moonIntensity: 0.0,
      hemiIntensity: 0.78,
      ambientIntensity: 0.13,
      exposure: 0.98,
      bloomStrength: 0.38,
      stars: 0.0,
      moonGlow: 0.0,
      sunGlow: 0.46,
      cloudAmount: 0.29,
      fogDensity: 0.0052,
      rayStrength: 0.28,
      saturation: 0.98,
      vignette: 0.32,
      shadowGrade: [0.94, 0.99, 1.03],
      highlightGrade: [1.035, 1.0, 0.95]
    },
    {
      h: 12.0,
      zenith: 0x548ab7,
      horizon: 0xd6e6e2,
      lower: 0x8b9785,
      sunColor: 0xfff2de,
      moonColor: 0xd4e0f3,
      hemiSky: 0xaecdd3,
      hemiGround: 0x606b4e,
      fog: 0xb7ced0,
      cloud: 0xf6f3e9,
      water: 0x33574f,
      rayColor: 0xffeccd,
      sunIntensity: 2.65,
      moonIntensity: 0.0,
      hemiIntensity: 1.0,
      ambientIntensity: 0.1,
      exposure: 0.88,
      bloomStrength: 0.25,
      stars: 0.0,
      moonGlow: 0.0,
      sunGlow: 0.28,
      cloudAmount: 0.36,
      fogDensity: 0.0038,
      rayStrength: 0.12,
      saturation: 1.0,
      vignette: 0.29,
      shadowGrade: [0.97, 0.995, 1.02],
      highlightGrade: [1.02, 1.0, 0.96]
    },
    {
      h: 16.4,
      zenith: 0x839fb3,
      horizon: 0xefd5b1,
      lower: 0x88816b,
      sunColor: 0xffd9a2,
      moonColor: 0xd4e0f3,
      hemiSky: 0xb7bfc4,
      hemiGround: 0x5d5e45,
      fog: 0xc4b9a4,
      cloud: 0xf2ddc3,
      water: 0x334a45,
      rayColor: 0xffd09c,
      sunIntensity: 2.15,
      moonIntensity: 0.0,
      hemiIntensity: 0.74,
      ambientIntensity: 0.11,
      exposure: 0.95,
      bloomStrength: 0.42,
      stars: 0.0,
      moonGlow: 0.0,
      sunGlow: 0.82,
      cloudAmount: 0.31,
      fogDensity: 0.0048,
      rayStrength: 0.36,
      saturation: 0.99,
      vignette: 0.32,
      shadowGrade: [0.95, 0.985, 1.02],
      highlightGrade: [1.05, 1.0, 0.92]
    },
    {
      h: 18.25,
      zenith: 0x566587,
      horizon: 0xff985d,
      lower: 0x584642,
      sunColor: 0xff985b,
      moonColor: 0xd2def2,
      hemiSky: 0x928a9b,
      hemiGround: 0x453a34,
      fog: 0xac8775,
      cloud: 0xe9a17a,
      water: 0x33383a,
      rayColor: 0xffa066,
      sunIntensity: 1.28,
      moonIntensity: 0.08,
      hemiIntensity: 0.47,
      ambientIntensity: 0.11,
      exposure: 1.08,
      bloomStrength: 0.95,
      stars: 0.07,
      moonGlow: 0.13,
      sunGlow: 1.55,
      cloudAmount: 0.48,
      fogDensity: 0.0062,
      rayStrength: 0.95,
      saturation: 1.02,
      vignette: 0.38,
      shadowGrade: [0.9, 0.94, 1.06],
      highlightGrade: [1.1, 0.99, 0.9]
    },
    {
      h: 19.65,
      zenith: 0x2b3753,
      horizon: 0xa4615f,
      lower: 0x29272b,
      sunColor: 0xff9b6d,
      moonColor: 0xd4dff5,
      hemiSky: 0x59647f,
      hemiGround: 0x27251f,
      fog: 0x574d4d,
      cloud: 0x624c56,
      water: 0x18272d,
      rayColor: 0xf4a077,
      sunIntensity: 0.12,
      moonIntensity: 0.42,
      hemiIntensity: 0.32,
      ambientIntensity: 0.1,
      exposure: 1.2,
      bloomStrength: 0.62,
      stars: 0.45,
      moonGlow: 0.7,
      sunGlow: 0.52,
      cloudAmount: 0.3,
      fogDensity: 0.0072,
      rayStrength: 0.25,
      saturation: 0.92,
      vignette: 0.4,
      shadowGrade: [0.85, 0.92, 1.07],
      highlightGrade: [1.02, 0.95, 0.94]
    },
    {
      h: 21.3,
      zenith: 0x071021,
      horizon: 0x1c2b40,
      lower: 0x0b1219,
      sunColor: 0x9fbbdf,
      moonColor: 0xe0e9ff,
      hemiSky: 0x485f84,
      hemiGround: 0x121b16,
      fog: 0x17232e,
      cloud: 0x1d2a3b,
      water: 0x10242b,
      rayColor: 0x8fa9cc,
      sunIntensity: 0.0,
      moonIntensity: 0.98,
      hemiIntensity: 0.48,
      ambientIntensity: 0.12,
      exposure: 1.38,
      bloomStrength: 0.52,
      stars: 1.0,
      moonGlow: 1.0,
      sunGlow: 0.0,
      cloudAmount: 0.18,
      fogDensity: 0.0063,
      rayStrength: 0.0,
      saturation: 0.9,
      vignette: 0.44,
      shadowGrade: [0.8, 0.9, 1.08],
      highlightGrade: [0.9, 0.96, 1.08]
    },
    {
      h: 24,
      zenith: 0x040b16,
      horizon: 0x14233a,
      lower: 0x0a1016,
      sunColor: 0x9fbbdf,
      moonColor: 0xdde8ff,
      hemiSky: 0x40577b,
      hemiGround: 0x111a15,
      fog: 0x13202b,
      cloud: 0x18253a,
      water: 0x102129,
      rayColor: 0x8aa3c7,
      sunIntensity: 0.0,
      moonIntensity: 0.92,
      hemiIntensity: 0.46,
      ambientIntensity: 0.12,
      exposure: 1.36,
      bloomStrength: 0.46,
      stars: 1.0,
      moonGlow: 1.0,
      sunGlow: 0.0,
      cloudAmount: 0.2,
      fogDensity: 0.0065,
      rayStrength: 0.0,
      saturation: 0.9,
      vignette: 0.42,
      shadowGrade: [0.82, 0.91, 1.06],
      highlightGrade: [0.92, 0.97, 1.06]
    }
  ];

  const timeKeys = rawTimeKeys.map((raw) => {
    const key = Object.assign({}, raw);
    for (const name of COLOR_PALETTE_KEYS) key[name] = new THREE.Color(raw[name]);
    key.shadowGrade = new THREE.Color().setRGB(...raw.shadowGrade);
    key.highlightGrade = new THREE.Color().setRGB(...raw.highlightGrade);
    return key;
  });

  const palette = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    lower: new THREE.Color(),
    sunColor: new THREE.Color(),
    moonColor: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    fog: new THREE.Color(),
    cloud: new THREE.Color(),
    water: new THREE.Color(),
    rayColor: new THREE.Color(),
    shadowGrade: new THREE.Color(),
    highlightGrade: new THREE.Color(),
    sunIntensity: 0,
    moonIntensity: 0,
    hemiIntensity: 0,
    ambientIntensity: 0,
    exposure: 1,
    bloomStrength: 0.4,
    stars: 0,
    moonGlow: 0,
    sunGlow: 0,
    cloudAmount: 0,
    fogDensity: 0.005,
    rayStrength: 0,
    saturation: 1,
    vignette: 0.35
  };

  function sampleTimePalette(hour, target) {
    const h = ((hour % 24) + 24) % 24;
    let index = 0;
    for (let i = 0; i < timeKeys.length - 1; i++) {
      if (h >= timeKeys[i].h && h <= timeKeys[i + 1].h) {
        index = i;
        break;
      }
    }
    const a = timeKeys[index];
    const b = timeKeys[index + 1];
    const span = Math.max(0.0001, b.h - a.h);
    const t = smootherstep(0, 1, clamp((h - a.h) / span, 0, 1));
    for (const name of COLOR_PALETTE_KEYS) target[name].copy(a[name]).lerp(b[name], t);
    target.shadowGrade.copy(a.shadowGrade).lerp(b.shadowGrade, t);
    target.highlightGrade.copy(a.highlightGrade).lerp(b.highlightGrade, t);
    for (const name of NUMERIC_PALETTE_KEYS) target[name] = lerp(a[name], b[name], t);
    return target;
  }

  const sunDirection = new THREE.Vector3(0, 0.1, -1);
  const moonDirection = new THREE.Vector3(0, 0.2, -1);

  function updateCelestialDirections(hour) {
    const dayT = clamp((hour - 5.35) / 13.1, -0.2, 1.2);
    const sunAngle = dayT * Math.PI;
    sunDirection.set(
      -Math.cos(sunAngle) * 0.28,
      Math.max(0.05, Math.sin(sunAngle) * 0.8 + 0.03),
      -0.78
    ).normalize();

    const nightT = ((hour - 18 + 24) % 24) / 12;
    const moonAngle = nightT * Math.PI;
    moonDirection.set(
      -Math.cos(moonAngle) * 0.48,
      0.12 + Math.sin(moonAngle) * 0.26,
      -0.93
    ).normalize();
  }

  /* ---------- 6. Sky ---------- */

  const skyUniforms = {
    uSunDir: { value: sunDirection },
    uMoonDir: { value: moonDirection },
    uZenith: { value: new THREE.Color(0x79a5c1) },
    uHorizon: { value: new THREE.Color(0xdfe9e1) },
    uLower: { value: new THREE.Color(0x8b9785) },
    uSunColor: { value: new THREE.Color(0xfff2de) },
    uMoonColor: { value: new THREE.Color(0xd4e0f3) },
    uCloudColor: { value: new THREE.Color(0xf3f0e6) },
    uTime: { value: 0 },
    uStars: { value: 0 },
    uMoonGlow: { value: 0 },
    uSunGlow: { value: 0.3 },
    uCloudAmount: { value: 0.2 }
  };

  const skyVertexShader = `
    varying vec3 vWorldDir;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldDir = worldPosition.xyz - cameraPosition;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const skyFragmentShader = `
    precision highp float;
    varying vec3 vWorldDir;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uZenith;
    uniform vec3 uHorizon;
    uniform vec3 uLower;
    uniform vec3 uSunColor;
    uniform vec3 uMoonColor;
    uniform vec3 uCloudColor;
    uniform float uTime;
    uniform float uStars;
    uniform float uMoonGlow;
    uniform float uSunGlow;
    uniform float uCloudAmount;

    float hash21(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 hash22(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.xx + p3.yz) * p3.zy);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p = p * 2.03 + vec2(11.7, 7.3);
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec3 dir = normalize(vWorldDir);
      float above = max(dir.y, 0.0);
      float vertical = pow(clamp(above, 0.0, 1.0), 0.62);
      vec3 color = mix(uHorizon, uZenith, vertical);
      color = mix(uLower, color, smoothstep(-0.08, 0.055, dir.y));

      float sunDot = max(dot(dir, uSunDir), 0.0);
      float sunVisible = smoothstep(-0.025, 0.045, uSunDir.y);
      float sunDisc = smoothstep(0.99972, 0.99988, sunDot);
      float sunInner = pow(sunDot, 330.0);
      float sunWide = pow(sunDot, 11.0);
      color += uSunColor * (sunDisc * 2.35 + sunInner * 0.86 + sunWide * uSunGlow * 0.17) * sunVisible;

      float horizonBand = exp(-max(dir.y, 0.0) * 8.5);
      vec2 flatDir = normalize(vec2(dir.x, dir.z) + vec2(0.0001));
      vec2 flatSun = normalize(vec2(uSunDir.x, uSunDir.z) + vec2(0.0001));
      float sunSide = pow(max(dot(flatDir, flatSun), 0.0), 3.0);
      color += uSunColor * horizonBand * sunSide * uSunGlow * 0.24 * sunVisible;

      if (uStars > 0.001) {
        vec2 sph = vec2(atan(dir.z, dir.x) / 6.28318530718 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265359 + 0.5);
        vec2 grid = sph * vec2(620.0, 310.0);
        vec2 cell = floor(grid);
        vec2 within = fract(grid);
        float chance = hash21(cell);
        if (chance > 0.9885) {
          vec2 starPos = 0.18 + 0.64 * hash22(cell + 9.2);
          float distanceToStar = length(within - starPos);
          float bright = 0.55 + 0.6 * hash21(cell + 4.7);
          float twinkle = 0.83 + 0.17 * sin(uTime * 0.23 + chance * 83.0);
          float rarity = smoothstep(0.9885, 0.9995, chance);
          float star = smoothstep(0.12, 0.0, distanceToStar) * twinkle * bright;
          star *= 1.0 + rarity * 0.8;
          vec3 tint = mix(vec3(0.66, 0.78, 1.0), vec3(1.0, 0.86, 0.66), hash21(cell + 2.1));
          color += tint * star * uStars * 2.15 * smoothstep(0.012, 0.12, dir.y);
          float glow = smoothstep(0.34, 0.0, distanceToStar) * uStars * 0.09 * bright;
          color += tint * glow * smoothstep(0.03, 0.18, dir.y);
        }

        vec3 bandNormal = normalize(vec3(0.28, 0.58, -0.76));
        float band = 1.0 - abs(dot(dir, bandNormal));
        float milky = smoothstep(0.66, 0.98, band) * smoothstep(0.32, 0.88, fbm(sph * vec2(16.0, 9.0) + 3.4));
        color += vec3(0.22, 0.27, 0.4) * milky * uStars * 0.42;
      }

      float moonDot = max(dot(dir, uMoonDir), 0.0);
      float moonAngular = sqrt(max(0.0, 2.0 - 2.0 * moonDot));
      float moonDisc = smoothstep(0.0205, 0.0178, moonAngular);
      float moonVisible = smoothstep(-0.015, 0.03, uMoonDir.y);
      float moonHalo = exp(-moonAngular * 52.0) * 0.55 + exp(-moonAngular * 14.0) * 0.08;
      vec2 moonSurface = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0))) * 74.0;
      float craters = fbm(moonSurface + 17.0) * 0.24 + fbm(moonSurface * 2.4 + 6.2) * 0.12;
      vec3 moonTint = uMoonColor * (1.0 - craters);
      float moonFade = smoothstep(0.025, 0.42, uMoonGlow);
      color += moonTint * moonDisc * moonVisible * moonFade * 1.55;
      color += uMoonColor * moonHalo * uMoonGlow * moonVisible * 0.75;

      vec2 cloudUv = vec2(atan(dir.z, dir.x) * 1.28 + uTime * 0.0018, dir.y * 4.6 - uTime * 0.00065);
      vec2 cloudDrift = vec2(uTime * 0.0022, -uTime * 0.0007);
      vec2 cloudWarp = vec2(
        fbm(cloudUv * 1.15 + 3.7 + cloudDrift * 0.7),
        fbm(cloudUv * 1.45 + 8.3 - cloudDrift * 0.5)
      );
      float cloudField = fbm(cloudUv * 1.8 + cloudWarp * 1.15 + cloudDrift + 9.0);
      float cloud = smoothstep(0.42, 0.68, cloudField);
      float wisps = smoothstep(0.5, 0.73, fbm(vec2(cloudUv.x * 0.65, cloudUv.y * 2.25) + cloudWarp * 0.5 + 4.6));
      cloud = mix(cloud, wisps, 0.38) * smoothstep(0.012, 0.14, dir.y) * (1.0 - smoothstep(0.58, 0.96, dir.y));
      float sunWarmth = pow(max(dot(normalize(vec2(dir.x, dir.z) + 0.0001), normalize(vec2(uSunDir.x, uSunDir.z) + 0.0001)), 0.0), 2.0);
      vec3 cloudShadow = uCloudColor * 0.56 + uZenith * 0.16;
      vec3 cloudLit = uCloudColor * 1.04 + uSunColor * (0.11 + 0.16 * sunWarmth) * sunVisible;
      vec3 cloudColor = mix(cloudShadow, cloudLit, 0.58 + 0.3 * sunWarmth);
      color = mix(color, cloudColor, clamp(cloud * uCloudAmount * 1.75, 0.0, 0.72));

      float horizonFade = smoothstep(-0.15, -0.005, dir.y);
      color = mix(uLower * 0.72, color, horizonFade);
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });

  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(720, 36, 24), skyMaterial);
  skyMesh.name = "sky-dome";
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;
  scene.add(skyMesh);

  /* ---------- 7. Light ---------- */

  scene.fog = new THREE.FogExp2(0xaebba8, 0.005);

  const sunLight = new THREE.DirectionalLight(0xffd7a4, 2.0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
  sunLight.shadow.camera.left = -27;
  sunLight.shadow.camera.right = 27;
  sunLight.shadow.camera.top = 22;
  sunLight.shadow.camera.bottom = -20;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 110;
  sunLight.shadow.bias = -0.00032;
  sunLight.shadow.normalBias = 0.022;
  sunLight.shadow.radius = 2.4;
  sunLight.target.position.set(-1, 0, -2);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const moonLight = new THREE.DirectionalLight(0xb9ccef, 0.0);
  moonLight.castShadow = false;
  moonLight.target.position.set(0, 0, -4);
  scene.add(moonLight);
  scene.add(moonLight.target);

  const hemisphere = new THREE.HemisphereLight(0xc4d7d5, 0x5d6648, 0.9);
  scene.add(hemisphere);

  const ambient = new THREE.AmbientLight(0xb6c8c7, 0.1);
  scene.add(ambient);

  let skyFill = new THREE.DirectionalLight(0x93bac8, 0.22);
  skyFill.position.set(6, 8, 12);
  scene.add(skyFill);

  /* ---------- 8. Terrain ---------- */

  function streamCenterX(z) {
    return 4.0 + 5.0 * Math.sin(z * 0.05 + 0.4) + 3.0 * Math.sin(z * 0.021 - 0.8);
  }

  function streamHalfWidth(z) {
    return 1.02 + 0.34 * Math.sin(z * 0.075 + 1.1) + 0.13 * Math.sin(z * 0.19 + 0.4);
  }

  function streamSurfaceY(z) {
    return -0.3 + 0.045 * Math.sin(z * 0.105 + 0.7) + 0.0009 * z;
  }

  function uplandHeight(x, z) {
    const broad = fbm(x * 0.028 + 4.7, z * 0.028 - 2.1, 4);
    const detail = fbm(x * 0.135 - 7.3, z * 0.135 + 1.7, 2);
    let y = 0.11 + broad * 0.55 + detail * 0.08;
    y += Math.sin(x * 0.062 + z * 0.024) * 0.075;
    y += smoothstep(24, 76, Math.abs(x - 1.5)) * 1.85;
    y += smoothstep(-76, -142, z) * 2.1;
    // Soft meadow shoulders make the valley feel walked-through, not surveyed.
    y += 1.2 * Math.exp(-(((x + 11) / 13.5) ** 2 + ((z + 8) / 20.5) ** 2));
    y += 1.35 * Math.exp(-(((x - 15) / 16) ** 2 + ((z + 22) / 23) ** 2));
    y += 0.75 * Math.exp(-(((x + 2) / 11) ** 2 + ((z + 37) / 17) ** 2));
    return y;
  }

  function terrainHeight(x, z) {
    const center = streamCenterX(z);
    const half = streamHalfWidth(z);
    const d = Math.abs(x - center);
    const upland = uplandHeight(x, z);
    const bed = streamSurfaceY(z) - 0.36 - 0.12 * valueNoise(x * 1.7 + 8.2, z * 1.7);
    const bank = smoothstep(half * 0.5, half * 2.45, d);
    let y = lerp(bed, upland, bank);
    y += Math.exp(-Math.pow((d - half * 3.15) / (half * 1.25), 2)) * 0.075;
    return y;
  }

  function streamDistance(x, z) {
    return Math.abs(x - streamCenterX(z));
  }

  function isInWater(x, z, extra = 0) {
    return streamDistance(x, z) < streamHalfWidth(z) + extra;
  }

  function makeGroundTextures() {
    const size = 512;
    const colorCanvas = document.createElement("canvas");
    const bumpCanvas = document.createElement("canvas");
    colorCanvas.width = colorCanvas.height = size;
    bumpCanvas.width = bumpCanvas.height = size;
    const cctx = colorCanvas.getContext("2d");
    const bctx = bumpCanvas.getContext("2d");
    const cimg = cctx.createImageData(size, size);
    const bimg = bctx.createImageData(size, size);
    const seed = 4127;

    const dark = [55, 77, 43];
    const middle = [103, 126, 65];
    const light = [148, 160, 91];
    const dry = [160, 148, 92];
    const moss = [84, 107, 58];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const broad = tileableFbm(u, v, 4, 3, seed);
        const detail = tileableFbm(u, v, 3, 12, seed + 31);
        const fine = tileableFbm(u, v, 2, 39, seed + 97);
        const n = broad * 0.57 + detail * 0.28 + fine * 0.15;

        let cr;
        let cg;
        let cb;
        if (n < 0.46) {
          const t = smoothstep(0.18, 0.46, n);
          cr = lerp(dark[0], moss[0], t);
          cg = lerp(dark[1], moss[1], t);
          cb = lerp(dark[2], moss[2], t);
        } else if (n < 0.7) {
          const t = smoothstep(0.46, 0.7, n);
          cr = lerp(moss[0], middle[0], t);
          cg = lerp(moss[1], middle[1], t);
          cb = lerp(moss[2], middle[2], t);
        } else {
          const t = smoothstep(0.7, 0.9, n);
          cr = lerp(middle[0], light[0], t);
          cg = lerp(middle[1], light[1], t);
          cb = lerp(middle[2], light[2], t);
        }

        const strawPatch = smoothstep(0.56, 0.82, tileableFbm(u, v, 2, 5, seed + 155));
        cr = lerp(cr, dry[0], strawPatch * 0.33);
        cg = lerp(cg, dry[1], strawPatch * 0.31);
        cb = lerp(cb, dry[2], strawPatch * 0.25);

        const grain = (hash2(x * 2.37 + 4.1, y * 2.71 + 9.3) - 0.5) * 18;
        const index = (y * size + x) * 4;
        cimg.data[index] = clamp(cr + grain, 0, 255);
        cimg.data[index + 1] = clamp(cg + grain, 0, 255);
        cimg.data[index + 2] = clamp(cb + grain * 0.7, 0, 255);
        cimg.data[index + 3] = 255;

        const bump = 105 + broad * 42 + detail * 48 + fine * 34;
        bimg.data[index] = bump;
        bimg.data[index + 1] = bump;
        bimg.data[index + 2] = bump;
        bimg.data[index + 3] = 255;
      }
    }

    cctx.putImageData(cimg, 0, 0);
    bctx.putImageData(bimg, 0, 0);

    const rng = mulberry32(seed + 3);
    const wrap = (fn) => {
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) fn(ox * size, oy * size);
      }
    };

    for (let i = 0; i < 520; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const radius = 2 + rng() * 18;
      const alpha = 0.025 + rng() * 0.065;
      const green = rng() > 0.5;
      wrap((ox, oy) => {
        const gradient = cctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, radius);
        gradient.addColorStop(0, green ? `rgba(26,48,24,${alpha})` : `rgba(153,141,92,${alpha * 0.7})`);
        gradient.addColorStop(1, "rgba(70,85,45,0)");
        cctx.fillStyle = gradient;
        cctx.beginPath();
        cctx.arc(x + ox, y + oy, radius, 0, Math.PI * 2);
        cctx.fill();
      });
    }

    for (let i = 0; i < 4100; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const len = 1.2 + rng() * 6.4;
      const lean = (rng() - 0.5) * 3.2;
      const alpha = 0.12 + rng() * 0.26;
      const shade = rng();
      const color = shade > 0.73 ? `rgba(186,188,116,${alpha})` : shade > 0.4 ? `rgba(124,149,79,${alpha})` : `rgba(62,87,45,${alpha})`;
      wrap((ox, oy) => {
        cctx.strokeStyle = color;
        cctx.lineWidth = 0.45 + rng() * 0.8;
        cctx.beginPath();
        cctx.moveTo(x + ox, y + oy);
        cctx.quadraticCurveTo(x + ox + lean * 0.35, y + oy - len * 0.5, x + ox + lean, y + oy - len);
        cctx.stroke();

        bctx.strokeStyle = `rgba(${shade > 0.5 ? 216 : 45},${shade > 0.5 ? 216 : 45},${shade > 0.5 ? 216 : 45},${alpha * 0.75})`;
        bctx.lineWidth = 0.6;
        bctx.beginPath();
        bctx.moveTo(x + ox, y + oy);
        bctx.lineTo(x + ox + lean, y + oy - len);
        bctx.stroke();
      });
    }

    const colorTexture = new THREE.CanvasTexture(colorCanvas);
    colorTexture.colorSpace = THREE.SRGBColorSpace;
    colorTexture.wrapS = colorTexture.wrapT = THREE.RepeatWrapping;
    colorTexture.repeat.set(28, 28);
    colorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
    bumpTexture.wrapS = bumpTexture.wrapT = THREE.RepeatWrapping;
    bumpTexture.repeat.set(28, 28);
    bumpTexture.anisotropy = colorTexture.anisotropy;

    return { colorTexture, bumpTexture };
  }

  function tileableFbm(u, v, octaves, frequency, seed) {
    let sum = 0;
    let norm = 0;
    let amp = 0.5;
    let f = frequency;
    for (let i = 0; i < octaves; i++) {
      sum += periodicNoise(u * f, v * f, f, seed + i * 19.7) * amp;
      norm += amp;
      f *= 2;
      amp *= 0.5;
    }
    return sum / norm;
  }

  function periodicNoise(x, y, period, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const wrap = (n) => ((n % period) + period) % period;
    const h = (ix, iy) => hash2(wrap(ix) + seed * 13.17, wrap(iy) + seed * 7.31);
    const a = h(xi, yi);
    const b = h(xi + 1, yi);
    const c = h(xi, yi + 1);
    const d = h(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  const groundTextures = makeGroundTextures();

  const terrainGeometry = new THREE.PlaneGeometry(185, 182, 172, 170);
  terrainGeometry.rotateX(-Math.PI / 2);
  terrainGeometry.translate(0, 0, -53);

  {
    const positions = terrainGeometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    const treeShade = [
      { x: -4.9, z: 2.5, r: 7.2 },
      { x: 8.0, z: -3.2, r: 5.4 }
    ];
    const wetColor = new THREE.Color(0.7, 0.81, 0.65);
    const dryColor = new THREE.Color(1.05, 1.0, 0.82);
    const mudColor = new THREE.Color(0.64, 0.73, 0.57);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = terrainHeight(x, z);
      positions.setY(i, y);

      const broad = fbm(x * 0.09 + 2.1, z * 0.09 - 3.4, 3);
      const detail = fbm(x * 0.38 - 5.2, z * 0.38 + 2.6, 2);
      const d = streamDistance(x, z);
      const half = Math.max(0.4, streamHalfWidth(z));
      const wet = 1 - smoothstep(half * 1.4, half * 5.0, d);
      const mud = 1 - smoothstep(half * 0.6, half * 2.1, d);
      const dryness = smoothstep(0.58, 0.84, broad);
      const tint = 0.92 + broad * 0.25 + detail * 0.08;

      color.setRGB(tint * 1.005, tint * 1.02, tint * 0.96);
      color.lerp(wetColor, wet * 0.58);
      color.lerp(mudColor, mud * 0.45);
      color.lerp(dryColor, dryness * 0.24);

      let shade = 1;
      for (const tree of treeShade) {
        const dx = x - tree.x;
        const dz = z - tree.z;
        shade *= 1 - Math.exp(-(dx * dx + dz * dz) / (tree.r * tree.r * 0.56)) * 0.22;
      }
      const camDist = Math.hypot(x - cameraState.baseX, z - cameraState.baseZ);
      shade *= 0.88 + 0.12 * smoothstep(2.0, 10.0, camDist);
      color.multiplyScalar(shade);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    terrainGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    terrainGeometry.computeVertexNormals();
  }

  const terrainMaterial = new THREE.MeshStandardMaterial({
    map: groundTextures.colorTexture,
    bumpMap: groundTextures.bumpTexture,
    bumpScale: 0.06,
    vertexColors: true,
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0.0
  });

  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  scene.add(terrain);

  /* ---------- 9. Geometry builders ---------- */

  const WHITE = new THREE.Color(1, 1, 1);

  class GeoBuilder {
    constructor(withUV = false) {
      this.withUV = withUV;
      this.positions = [];
      this.normals = [];
      this.colors = [];
      this.uvs = [];
      this.indices = [];
      this.vertexCount = 0;
      this._normalMatrix = new THREE.Matrix3();
      this._v = new THREE.Vector3();
      this._n = new THREE.Vector3();
      this._c = new THREE.Color();
    }

    add(geometry, matrix, tint = null) {
      const positions = geometry.attributes.position;
      if (!positions) return this;
      const normals = geometry.attributes.normal;
      const colors = geometry.attributes.color;
      const uvs = geometry.attributes.uv;
      const index = geometry.index;
      const base = this.vertexCount;
      this._normalMatrix.getNormalMatrix(matrix);
      const tintColor = tint || WHITE;

      for (let i = 0; i < positions.count; i++) {
        this._v.fromBufferAttribute(positions, i).applyMatrix4(matrix);
        this.positions.push(this._v.x, this._v.y, this._v.z);

        if (normals) {
          this._n.fromBufferAttribute(normals, i).applyMatrix3(this._normalMatrix).normalize();
          this.normals.push(this._n.x, this._n.y, this._n.z);
        } else {
          this.normals.push(0, 1, 0);
        }

        if (colors) {
          this._c.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
          this._c.multiply(tintColor);
        } else {
          this._c.copy(tintColor);
        }
        this.colors.push(this._c.r, this._c.g, this._c.b);

        if (this.withUV) {
          if (uvs) this.uvs.push(uvs.getX(i), uvs.getY(i));
          else this.uvs.push(0, 0);
        }
      }

      if (index) {
        for (let i = 0; i < index.count; i++) this.indices.push(base + index.getX(i));
      } else {
        for (let i = 0; i < positions.count; i++) this.indices.push(base + i);
      }

      this.vertexCount += positions.count;
      return this;
    }

    addTube(points, radiusStart, radiusEnd, radialSegments, colorStart, colorEnd, tubularSegments) {
      const geometry = makeTubeGeometry(points, radiusStart, radiusEnd, radialSegments, colorStart, colorEnd, tubularSegments);
      if (geometry) this.add(geometry, TMP_M1.identity(), WHITE);
      return this;
    }

    build() {
      if (!this.vertexCount) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
      if (this.withUV) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
      geometry.setIndex(this.indices);
      geometry.computeBoundingSphere();
      return geometry;
    }
  }

  function makeTubeGeometry(points, radiusStart, radiusEnd, radialSegments = 5, colorStart = 0x8fa56a, colorEnd = null, tubularSegments = null) {
    if (!points || points.length < 2) return null;
    const sanitized = points.map((p) => p.clone());
    const curve = new THREE.CatmullRomCurve3(sanitized, false, "catmullrom", 0.28);
    const segments = Math.max(tubularSegments || 0, 3, points.length * 3);
    const rings = sanitized.length > 2 ? segments : Math.max(3, tubularSegments || 4);
    const frames = curve.computeFrenetFrames(rings, false);

    const positions = [];
    const normals = [];
    const colors = [];
    const uvs = [];
    const indices = [];
    const c0 = makeColor(colorStart);
    const c1 = makeColor(colorEnd === null || colorEnd === undefined ? colorStart : colorEnd);
    const c = new THREE.Color();
    const radialCount = Math.max(3, radialSegments);

    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const center = curve.getPoint(t);
      const normal = frames.normals[i];
      const binormal = frames.binormals[i];
      const taper = Math.pow(t, 0.82);
      let radius = lerp(radiusStart, radiusEnd, taper);
      radius *= 1 + Math.sin(t * 13.7 + 1.2) * 0.035;
      c.copy(c0).lerp(c1, t);
      for (let j = 0; j < radialCount; j++) {
        const angle = (j / radialCount) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const nx = normal.x * cos + binormal.x * sin;
        const ny = normal.y * cos + binormal.y * sin;
        const nz = normal.z * cos + binormal.z * sin;
        positions.push(
          center.x + nx * radius,
          center.y + ny * radius,
          center.z + nz * radius
        );
        const len = Math.hypot(nx, ny, nz) || 1;
        normals.push(nx / len, ny / len, nz / len);
        colors.push(c.r, c.g, c.b);
        uvs.push(j / radialCount, t * 3.0);
      }
    }

    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < radialCount; j++) {
        const a = i * radialCount + j;
        const b = i * radialCount + ((j + 1) % radialCount);
        const c2 = (i + 1) * radialCount + j;
        const d = (i + 1) * radialCount + ((j + 1) % radialCount);
        indices.push(a, b, c2, b, d, c2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  }

  function paintGeometryY(geometry, lowColor, highColor, power = 1) {
    const pos = geometry.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    const cLow = makeColor(lowColor);
    const cHigh = makeColor(highColor);
    const c = new THREE.Color();
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.pow(clamp((pos.getY(i) - minY) / Math.max(0.0001, maxY - minY), 0, 1), power);
      c.copy(cLow).lerp(cHigh, t);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  }

  /* ---------- 10. Petals, leaves and flower heads ---------- */

  function makePetalGeometry(options) {
    const {
      length,
      width,
      segU = 6,
      segV = 9,
      notch = 0.04,
      cup = 0.005,
      arch = 0.002,
      ruffle = 0.03,
      tipRounding = 0.35,
      baseColor = 0xf2c0ce,
      edgeColor = 0xfff9f4,
      veinColor = 0xf0d6df,
      veinStrength = 0.2,
      phase = 0
    } = options;

    const positions = [];
    const colors = [];
    const indices = [];
    const cBase = makeColor(baseColor);
    const cEdge = makeColor(edgeColor);
    const cVein = makeColor(veinColor);
    const c = new THREE.Color();

    for (let j = 0; j <= segV; j++) {
      const v = j / segV;
      const profile = Math.pow(Math.sin(Math.PI * (0.055 + v * 0.91)), 0.62);
      const tipTaper = 1 - tipRounding * smoothstep(0.72, 1, v);
      const widthV = width * profile * tipTaper * smoothstep(0, 0.115, v);
      const tipRound = 0.026 * length * v * v * v;
      const tipNotch = notch * length * Math.pow(v, 5);
      for (let i = 0; i <= segU; i++) {
        const u = -1 + (i / segU) * 2;
        const x = u * widthV;
        let z = length * v;
        z -= tipNotch * Math.exp(-u * u * 5.3) + tipRound * u * u;
        let y = cup * u * u * Math.pow(v, 1.12);
        y += arch * v * v;
        y += ruffle * 0.0022 * Math.sin(u * 7.2 + v * 11.6 + phase) * Math.pow(v, 1.5) * Math.abs(u);
        y += (veinStrength * 0.03) * 0.0009 * Math.exp(-u * u * 26) * Math.sin(v * Math.PI);
        positions.push(x, y, z);

        c.copy(cBase).lerp(cEdge, smoothstep(0, 1, Math.pow(v, 0.86)));
        const vein = Math.exp(-u * u * 32) * (0.2 + 0.8 * v);
        c.lerp(cVein, vein * veinStrength);
        const mottle = 0.965 + 0.045 * Math.sin(v * 31 + u * 8 + phase);
        c.multiplyScalar(mottle);
        colors.push(c.r, c.g, c.b);
      }
    }

    for (let j = 0; j < segV; j++) {
      for (let i = 0; i < segU; i++) {
        const a = j * (segU + 1) + i;
        const b = a + 1;
        const c2 = a + segU + 1;
        const d = c2 + 1;
        indices.push(a, c2, b, b, c2, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function makeLeafGeometry(options) {
    const {
      length,
      width,
      segU = 5,
      segV = 9,
      curl = 0.18,
      fold = 0.2,
      serration = 0.0,
      baseColor = 0x3c5a32,
      tipColor = 0x7d9b51,
      veinColor = 0x9eb06d,
      veinStrength = 0.22,
      phase = 0
    } = options;

    const positions = [];
    const colors = [];
    const indices = [];
    const cBase = makeColor(baseColor);
    const cTip = makeColor(tipColor);
    const cVein = makeColor(veinColor);
    const c = new THREE.Color();

    for (let j = 0; j <= segV; j++) {
      const v = j / segV;
      const profile = Math.pow(Math.sin(Math.PI * Math.pow(clamp(v, 0, 1), 0.88)), 0.66);
      const serr = 1 + serration * 0.1 * Math.sin(v * 37 + phase);
      const widthV = width * profile * serr * smoothstep(0, 0.08, v);
      for (let i = 0; i <= segU; i++) {
        const u = -1 + (i / segU) * 2;
        const x = u * widthV;
        const z = length * v * (1 - 0.025 * u * u);
        let y = fold * u * u * width;
        y += curl * length * v * v;
        y += 0.0009 * Math.exp(-u * u * 25) * Math.sin(v * Math.PI);
        positions.push(x, y, z);

        c.copy(cBase).lerp(cTip, smoothstep(0, 1, Math.pow(v, 0.72)));
        const veinMask = Math.exp(-u * u * 36) * smoothstep(0.02, 0.2, v);
        c.lerp(cVein, veinMask * veinStrength);
        const sideVein = Math.pow(Math.abs(Math.sin(v * 15.0 + Math.abs(u) * 2.8 + phase)), 18);
        c.lerp(cVein, sideVein * 0.055 * smoothstep(0.18, 0.8, v));
        colors.push(c.r, c.g, c.b);
      }
    }

    for (let j = 0; j < segV; j++) {
      for (let i = 0; i < segU; i++) {
        const a = j * (segU + 1) + i;
        const b = a + 1;
        const c2 = a + segU + 1;
        const d = c2 + 1;
        indices.push(a, c2, b, b, c2, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function makeCloverLeafletGeometry(baseColor, tipColor, phase) {
    const geometry = makePetalGeometry({
      length: 0.036,
      width: 0.034,
      segU: 6,
      segV: 8,
      notch: 0.25,
      cup: 0.0015,
      arch: 0.003,
      ruffle: 0.06,
      tipRounding: 0.48,
      baseColor,
      edgeColor: tipColor,
      veinColor: 0xc5d59e,
      veinStrength: 0.15,
      phase
    });
    const positions = geometry.attributes.position;
    const colors = geometry.attributes.color;
    const pale = new THREE.Color(0xc9d7a0);
    const color = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const armZ = 0.011 + Math.abs(x) * 1.18;
      const arm = smoothstep(0.0045, 0.001, Math.abs(z - armZ)) * smoothstep(0.026, 0.004, Math.abs(x));
      if (arm > 0.001) {
        color.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
        color.lerp(pale, arm * 0.55);
        colors.setXYZ(i, color.r, color.g, color.b);
      }
    }
    colors.needsUpdate = true;
    return geometry;
  }

  function petalMatrix(angle, pitch, scale, y, offset = 0, roll = 0) {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3(Math.sin(angle) * offset, y, Math.cos(angle) * offset);
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, angle, roll, "YXZ"));
    const scaleVector = new THREE.Vector3(scale, scale, scale);
    matrix.compose(position, quaternion, scaleVector);
    return matrix;
  }

  function addPetalRing(builder, geometry, count, options, rng) {
    const {
      angleOffset = 0,
      pitch = -0.12,
      y = 0,
      offset = 0.002,
      scale = 1,
      jitter = 0.08,
      pitchJitter = 0.06
    } = options;
    for (let i = 0; i < count; i++) {
      const angle = angleOffset + (i / count) * Math.PI * 2 + rngRange(rng, -0.075, 0.075);
      const p = pitch + rngRange(rng, -pitchJitter, pitchJitter);
      const s = scale * rngRange(rng, 1 - jitter, 1 + jitter);
      const roll = rngRange(rng, -0.06, 0.06);
      const matrix = petalMatrix(angle, p, s, y + rngRange(rng, -0.001, 0.001), offset, roll);
      builder.add(geometry, matrix, WHITE);
    }
  }

  function addStamens(builder, rng, options) {
    const {
      count = 14,
      centerY = 0.004,
      spread = 0.023,
      inner = 0.003,
      lengthMin = 0.018,
      lengthMax = 0.032,
      filamentColor = 0xf2dfac,
      tipColor = 0xe3b34c,
      tipSize = 0.0019,
      radialSegments = 3
    } = options;
    const tipGeo = new THREE.OctahedronGeometry(tipSize, 0);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rngRange(rng, -0.18, 0.18);
      const startRadius = inner * rngRange(rng, 0.2, 1.0);
      const endRadius = startRadius + spread * rngRange(rng, 0.52, 1.15);
      const length = rngRange(rng, lengthMin, lengthMax);
      const sway = rngRange(rng, -0.22, 0.22);
      const p0 = new THREE.Vector3(Math.cos(angle) * startRadius, centerY, Math.sin(angle) * startRadius);
      const p1 = new THREE.Vector3(
        Math.cos(angle + sway) * lerp(startRadius, endRadius, 0.55),
        centerY + length * 0.55,
        Math.sin(angle + sway) * lerp(startRadius, endRadius, 0.55)
      );
      const p2 = new THREE.Vector3(
        Math.cos(angle + sway) * endRadius,
        centerY + length,
        Math.sin(angle + sway) * endRadius
      );
      const tube = makeTubeGeometry([p0, p1, p2], 0.00115, 0.00055, radialSegments, filamentColor, filamentColor, 4);
      if (tube) builder.add(tube, TMP_M1.identity(), WHITE);
      const m = new THREE.Matrix4().makeTranslation(p2.x, p2.y, p2.z);
      builder.add(tipGeo, m, makeColor(tipColor));
    }
  }

  function addCenterDome(builder, radius, height, lowColor, highColor, y, segments = 12) {
    const dome = new THREE.SphereGeometry(radius, segments, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, height / radius, 1);
    paintGeometryY(dome, lowColor, highColor, 0.8);
    const matrix = new THREE.Matrix4().makeTranslation(0, y, 0);
    builder.add(dome, matrix, WHITE);
  }

  function buildSakuraHeadGeometry(rng, variant) {
    const builder = new GeoBuilder();
    const size = rngRange(rng, 0.92, 1.12) * (1 + variant * 0.012);
    const phase = rng() * 20;
    const outer = makePetalGeometry({
      length: 0.035 * size,
      width: 0.03 * size,
      segU: 4,
      segV: 7,
      notch: 0.2,
      cup: 0.0062,
      arch: 0.0018,
      ruffle: 0.06,
      tipRounding: 0.42,
      baseColor: 0xf2b8c9,
      edgeColor: 0xfffbf6,
      veinColor: 0xefd4de,
      veinStrength: 0.24,
      phase
    });
    const inner = makePetalGeometry({
      length: 0.026 * size,
      width: 0.023 * size,
      segU: 4,
      segV: 6,
      notch: 0.15,
      cup: 0.0045,
      arch: 0.004,
      ruffle: 0.08,
      tipRounding: 0.3,
      baseColor: 0xf6c7d6,
      edgeColor: 0xfffefb,
      veinColor: 0xf1dae2,
      veinStrength: 0.18,
      phase: phase + 2
    });
    addPetalRing(builder, outer, 5, { angleOffset: phase, pitch: -0.13, y: 0.002, offset: 0.002, jitter: 0.09 }, rng);
    addPetalRing(builder, inner, 5, { angleOffset: phase + Math.PI / 5, pitch: -0.32, y: 0.006, offset: 0.001, scale: 0.9, jitter: 0.08 }, rng);

    addCenterDome(builder, 0.0055, 0.0035, 0xbba849, 0xe4cb6a, 0.006, 8);
    addStamens(builder, rng, {
      count: 13,
      centerY: 0.007,
      spread: 0.021,
      inner: 0.0015,
      lengthMin: 0.019,
      lengthMax: 0.031,
      filamentColor: 0xf3e4bb,
      tipColor: 0xe6bb54,
      tipSize: 0.00195
    });
    return builder.build();
  }

  function buildCamelliaHeadGeometry(rng, variant) {
    const builder = new GeoBuilder();
    const size = rngRange(rng, 0.94, 1.08);
    const phase = rng() * 25;
    const outer = makePetalGeometry({
      length: 0.083 * size,
      width: 0.073 * size,
      segU: 6,
      segV: 10,
      notch: 0.02,
      cup: 0.012,
      arch: 0.0045,
      ruffle: 0.08,
      tipRounding: 0.24,
      baseColor: 0xf3e2c9,
      edgeColor: 0xfffdf4,
      veinColor: 0xf3e3d1,
      veinStrength: 0.17,
      phase
    });
    const inner = makePetalGeometry({
      length: 0.061 * size,
      width: 0.052 * size,
      segU: 5,
      segV: 9,
      notch: 0.02,
      cup: 0.011,
      arch: 0.007,
      ruffle: 0.12,
      tipRounding: 0.22,
      baseColor: 0xefd9be,
      edgeColor: 0xfff8e9,
      veinColor: 0xf2dec8,
      veinStrength: 0.12,
      phase: phase + 8
    });
    addPetalRing(builder, outer, 7, { angleOffset: phase, pitch: -0.11, y: 0.003, offset: 0.004, jitter: 0.075 }, rng);
    addPetalRing(builder, inner, 6, { angleOffset: phase + Math.PI / 6, pitch: -0.31, y: 0.013, offset: 0.002, scale: 0.82, jitter: 0.08 }, rng);
    addCenterDome(builder, 0.022, 0.011, 0x8d7939, 0xd4b658, 0.011, 12);
    addStamens(builder, rng, {
      count: 27,
      centerY: 0.014,
      spread: 0.035,
      inner: 0.001,
      lengthMin: 0.026,
      lengthMax: 0.046,
      filamentColor: 0xf0dda2,
      tipColor: 0xe0b242,
      tipSize: 0.0023
    });
    return builder.build();
  }

  function buildPeonyHeadGeometry(rng, variant) {
    const builder = new GeoBuilder();
    const size = rngRange(rng, 0.92, 1.08);
    const phase = rng() * 30;
    const warm = variant % 2 === 0;
    const base = warm ? 0xb94678 : 0xa83e71;
    const middle = warm ? 0xdf7fa5 : 0xd36e9a;
    const edge = warm ? 0xf8cadb : 0xf4b9d0;

    const outer = makePetalGeometry({
      length: 0.083 * size,
      width: 0.066 * size,
      segU: 6,
      segV: 10,
      notch: 0.07,
      cup: 0.008,
      arch: 0.004,
      ruffle: 0.42,
      tipRounding: 0.28,
      baseColor: base,
      edgeColor: edge,
      veinColor: middle,
      veinStrength: 0.32,
      phase
    });
    const middleGeo = makePetalGeometry({
      length: 0.064 * size,
      width: 0.052 * size,
      segU: 5,
      segV: 9,
      notch: 0.04,
      cup: 0.007,
      arch: 0.009,
      ruffle: 0.52,
      tipRounding: 0.25,
      baseColor: base,
      edgeColor: edge,
      veinColor: middle,
      veinStrength: 0.38,
      phase: phase + 4.2
    });
    const innerGeo = makePetalGeometry({
      length: 0.041 * size,
      width: 0.033 * size,
      segU: 4,
      segV: 7,
      notch: 0.02,
      cup: 0.005,
      arch: 0.008,
      ruffle: 0.7,
      tipRounding: 0.22,
      baseColor: middle,
      edgeColor: edge,
      veinColor: 0xae3a6b,
      veinStrength: 0.4,
      phase: phase + 9.1
    });

    addPetalRing(builder, outer, 7, { angleOffset: phase, pitch: -0.13, y: 0.003, offset: 0.005, jitter: 0.12, pitchJitter: 0.09 }, rng);
    addPetalRing(builder, middleGeo, 6, { angleOffset: phase + 0.45, pitch: -0.3, y: 0.012, offset: 0.003, scale: 0.92, jitter: 0.12, pitchJitter: 0.1 }, rng);
    addPetalRing(builder, innerGeo, 4, { angleOffset: phase + 0.8, pitch: -0.48, y: 0.023, offset: 0.002, scale: 0.85, jitter: 0.13 }, rng);

    addCenterDome(builder, 0.017, 0.006, 0x5a2838, 0x8e3e4f, 0.017, 10);
    addStamens(builder, rng, {
      count: 24,
      centerY: 0.019,
      spread: 0.033,
      inner: 0.001,
      lengthMin: 0.024,
      lengthMax: 0.044,
      filamentColor: 0xdfc37b,
      tipColor: 0xd3a43a,
      tipSize: 0.0024
    });
    return builder.build();
  }

  function buildDaisyHeadGeometry(rng, variant) {
    const builder = new GeoBuilder();
    const size = rngRange(rng, 0.92, 1.08);
    const phase = rng() * 20;
    const count = (QUALITY.low ? 12 : 15) + (variant % 3) * 2;
    const petal = makePetalGeometry({
      length: 0.04 * size,
      width: 0.0068 * size,
      segU: QUALITY.low ? 1 : 2,
      segV: QUALITY.low ? 4 : 5,
      notch: 0,
      cup: 0.0018,
      arch: 0.0005,
      ruffle: 0.025,
      tipRounding: 0.13,
      baseColor: 0xece4d0,
      edgeColor: 0xfffdf8,
      veinColor: 0xe8ddc8,
      veinStrength: 0.18,
      phase
    });
    addPetalRing(builder, petal, count, { angleOffset: phase, pitch: -0.045, y: 0.0015, offset: 0.006, jitter: 0.08, pitchJitter: 0.035 }, rng);
    if (!QUALITY.low) {
      addPetalRing(builder, petal, Math.floor(count * 0.45), { angleOffset: phase + 0.12, pitch: -0.16, y: 0.0035, offset: 0.003, scale: 0.88, jitter: 0.1 }, rng);
    }

    addCenterDome(builder, 0.018, 0.011, 0xa8751e, 0xe6bd49, 0.002, QUALITY.low ? 6 : 8);
    const floret = new THREE.OctahedronGeometry(0.0022, 0);
    const floretCount = QUALITY.low ? 7 : 12;
    for (let i = 0; i < floretCount; i++) {
      const angle = i * 2.399963 + phase;
      const radius = 0.0165 * Math.sqrt((i + 0.5) / floretCount);
      const m = new THREE.Matrix4().makeTranslation(
        Math.cos(angle) * radius,
        0.0125 - radius * 0.22 + rngRange(rng, -0.001, 0.001),
        Math.sin(angle) * radius
      );
      builder.add(floret, m, makeColor(i % 3 === 0 ? 0xf0d06b : 0xcf9b2f));
    }
    return builder.build();
  }

  function buildButtercupHeadGeometry(rng, variant) {
    const builder = new GeoBuilder();
    const size = rngRange(rng, 0.9, 1.1);
    const phase = rng() * 20;
    const petal = makePetalGeometry({
      length: 0.041 * size,
      width: 0.036 * size,
      segU: QUALITY.low ? 3 : 4,
      segV: QUALITY.low ? 5 : 6,
      notch: 0.03,
      cup: 0.0085,
      arch: 0.003,
      ruffle: 0.07,
      tipRounding: 0.18,
      baseColor: 0xda9b12,
      edgeColor: 0xffdf69,
      veinColor: 0xf0c02e,
      veinStrength: 0.26,
      phase
    });
    addPetalRing(builder, petal, QUALITY.low ? 4 : 5, { angleOffset: phase, pitch: -0.2, y: 0.002, offset: 0.003, jitter: 0.1, pitchJitter: 0.05 }, rng);
    addPetalRing(builder, petal, QUALITY.low ? 2 : 3, { angleOffset: phase + 0.3, pitch: -0.34, y: 0.005, offset: 0.001, scale: 0.72, jitter: 0.1 }, rng);
    addCenterDome(builder, 0.012, 0.009, 0x7d8228, 0xc2ba3e, 0.007, QUALITY.low ? 6 : 8);
    addStamens(builder, rng, {
      count: QUALITY.low ? 6 : 10,
      centerY: 0.009,
      spread: 0.021,
      inner: 0.0008,
      lengthMin: 0.012,
      lengthMax: 0.021,
      filamentColor: 0xd8d77b,
      tipColor: 0xf0d35a,
      tipSize: 0.0017
    });
    return builder.build();
  }

  function buildCloverHeadGeometry(rng, variant) {
    const builder = new GeoBuilder();
    const phase = rng() * 30;
    const petal = makePetalGeometry({
      length: 0.014,
      width: 0.0115,
      segU: 2,
      segV: 4,
      notch: 0.03,
      cup: 0.0017,
      arch: 0.0012,
      ruffle: 0.04,
      tipRounding: 0.22,
      baseColor: variant % 2 === 0 ? 0xeee0df : 0xf4e5e5,
      edgeColor: 0xfffcf5,
      veinColor: 0xf2d9dc,
      veinStrength: 0.15,
      phase
    });
    const up = new THREE.Vector3(0, 1, 0);
    const count = 23 + (variant % 2) * 3;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const y = lerp(-0.015, 0.019, t);
      const ring = Math.sqrt(Math.max(0, 1 - Math.pow(y / 0.021, 2)));
      const angle = i * 2.399963 + phase;
      const n = new THREE.Vector3(Math.cos(angle) * ring, y / 0.021, Math.sin(angle) * ring + 0.18).normalize();
      const xAxis = new THREE.Vector3().crossVectors(up, n);
      if (xAxis.lengthSq() < 0.01) xAxis.set(1, 0, 0);
      xAxis.normalize();
      const yAxis = new THREE.Vector3().crossVectors(n, xAxis).normalize();
      const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, n);
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
      const position = new THREE.Vector3(
        n.x * 0.012 + rngRange(rng, -0.002, 0.002),
        Math.max(0, n.y) * 0.019 + 0.001,
        n.z * 0.012 + rngRange(rng, -0.002, 0.002)
      );
      const scale = rngRange(rng, 0.82, 1.18);
      const matrix = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(scale, scale, scale));
      builder.add(petal, matrix, WHITE);
    }
    addCenterDome(builder, 0.009, 0.006, 0x8c9a5a, 0xc7c999, 0.0, 8);
    return builder.build();
  }

  const HEAD_BUILDERS = {
    sakura: buildSakuraHeadGeometry,
    camellia: buildCamelliaHeadGeometry,
    peony: buildPeonyHeadGeometry,
    daisy: buildDaisyHeadGeometry,
    buttercup: buildButtercupHeadGeometry,
    clover: buildCloverHeadGeometry
  };

  const HEAD_RADIUS = {
    sakura: 0.07,
    camellia: 0.12,
    peony: 0.12,
    daisy: 0.05,
    buttercup: 0.051,
    clover: 0.034
  };

  const headCache = {};
  for (const species of Object.keys(HEAD_BUILDERS)) {
    const rng = mulberry32(1019 + species.length * 771);
    headCache[species] = [];
    for (let variant = 0; variant < 3; variant++) {
      headCache[species].push(HEAD_BUILDERS[species](rng, variant));
    }
  }

  /* ---------- 11. Plant material & wind ---------- */

  function attachWind(material, options) {
    const amplitude = (options.amplitude === undefined ? 0.022 : options.amplitude).toFixed(4);
    const secondary = (options.secondary === undefined ? amplitude * 0.42 : options.secondary).toFixed(4);
    const depthAmp = (options.depthAmp === undefined ? amplitude * 0.55 : options.depthAmp).toFixed(4);
    const flutter = (options.flutter === undefined ? 0.0006 : options.flutter).toFixed(5);
    const heightMin = (options.heightMin === undefined ? 0.02 : options.heightMin).toFixed(3);
    const heightMax = (options.heightMax === undefined ? 0.62 : options.heightMax).toFixed(3);
    const key = `garden-wind-${amplitude}-${secondary}-${depthAmp}-${flutter}-${heightMin}-${heightMax}`;
    const previousCompile = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, rendererRef) {
      if (previousCompile) previousCompile.call(this, shader, rendererRef);
      shader.uniforms.uGardenWindTime = windUniform;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
        uniform float uGardenWindTime;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 gardenAnchor = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float gardenScale = length(instanceMatrix[0].xyz);
        #else
          vec3 gardenAnchor = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float gardenScale = 1.0;
        #endif
        float gardenPhase = dot(gardenAnchor.xz, vec2(0.317, 0.193));
        float gardenBend = smoothstep(${heightMin}, ${heightMax}, transformed.y);
        gardenBend = pow(gardenBend, 1.28);
        float gardenGust = 0.56 + 0.44 * sin(uGardenWindTime * 0.16 + gardenPhase * 0.3);
        float gardenWaveA = sin(uGardenWindTime * 0.78 + gardenPhase * 1.63 + gardenAnchor.y * 0.2);
        float gardenWaveB = sin(uGardenWindTime * 0.31 + gardenPhase * 0.73 + 1.7);
        transformed.x += (gardenWaveA * ${amplitude} + gardenWaveB * ${secondary}) * gardenBend * gardenGust;
        transformed.z += cos(uGardenWindTime * 0.58 + gardenPhase * 1.17 + 0.8) * ${depthAmp} * gardenBend * gardenGust;
        transformed.y += sin(uGardenWindTime * 0.94 + gardenPhase * 2.1 + transformed.x * 4.5) * ${flutter} * gardenBend * gardenScale;
        `
      );
    };
    material.customProgramCacheKey = function () {
      return key;
    };
    return material;
  }

  function makePetalMaterial(speciesId, blossom = false) {
    const tuning = {
      sakura: { roughness: 0.55, sheen: 0.52, sheenColor: 0xf2c6d0 },
      camellia: { roughness: 0.48, sheen: 0.42, sheenColor: 0xf1dfc8 },
      peony: { roughness: 0.53, sheen: 0.55, sheenColor: 0xe4a5be },
      daisy: { roughness: 0.6, sheen: 0.38, sheenColor: 0xf0eadf },
      buttercup: { roughness: 0.3, sheen: 0.36, sheenColor: 0xf4d56f },
      clover: { roughness: 0.58, sheen: 0.35, sheenColor: 0xede8da }
    }[speciesId];
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: tuning.roughness,
      metalness: 0.0,
      sheen: tuning.sheen,
      sheenRoughness: 0.82,
      sheenColor: new THREE.Color(tuning.sheenColor),
      clearcoat: 0.03,
      clearcoatRoughness: 0.8,
      dithering: true
    });
    material.shadowSide = THREE.DoubleSide;
    attachWind(material, {
      amplitude: blossom ? 0.032 : speciesId === "clover" ? 0.022 : 0.038,
      secondary: blossom ? 0.012 : 0.015,
      depthAmp: blossom ? 0.017 : 0.022,
      flutter: blossom ? 0.0004 : 0.0012,
      heightMin: blossom ? 0.0 : 0.015,
      heightMax: blossom ? 0.08 : speciesId === "camellia" ? 1.0 : 0.55
    });
    material.userData.species = speciesId;
    return material;
  }

  const petalMaterials = {};
  for (const speciesId of ["sakura", "camellia", "peony", "daisy", "buttercup", "clover"]) {
    petalMaterials[speciesId] = makePetalMaterial(speciesId);
  }
  const treeBlossomMaterial = makePetalMaterial("sakura", true);
  treeBlossomMaterial.emissive = new THREE.Color(0x2c121b);
  treeBlossomMaterial.emissiveIntensity = 0.45;

  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.67,
    metalness: 0.0,
    dithering: true
  });
  foliageMaterial.shadowSide = THREE.DoubleSide;
  attachWind(foliageMaterial, {
    amplitude: 0.042,
    secondary: 0.019,
    depthAmp: 0.027,
    flutter: 0.0018,
    heightMin: 0.015,
    heightMax: 0.7
  });

  const glossyFoliageMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.36,
    metalness: 0.0,
    dithering: true
  });
  glossyFoliageMaterial.shadowSide = THREE.DoubleSide;
  attachWind(glossyFoliageMaterial, {
    amplitude: 0.04,
    secondary: 0.02,
    depthAmp: 0.025,
    flutter: 0.0016,
    heightMin: 0.02,
    heightMax: 0.95
  });

  /* ---------- 12. Plant construction ---------- */

  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const leafCache = {};

  {
    const leafSpecs = {
      peony: { length: 0.118, width: 0.034, curl: 0.2, fold: 0.19, seed: 771, colors: [0x294424, 0x6f8d4e, 0x9aac6b] },
      daisy: { length: 0.1, width: 0.0155, curl: 0.14, fold: 0.25, seed: 971, colors: [0x34512d, 0x789250, 0x9baa70] },
      buttercup: { length: 0.069, width: 0.033, curl: 0.14, fold: 0.2, seed: 1217, colors: [0x2f4828, 0x6b8747, 0x91a568] },
      camellia: { length: 0.093, width: 0.032, curl: 0.15, fold: 0.13, seed: 1571, colors: [0x203a27, 0x4f7043, 0x84976a] },
      sakuraLeaf: { length: 0.06, width: 0.021, curl: 0.16, fold: 0.2, seed: 1823, colors: [0x3c5a31, 0x78934d, 0x9bab72] }
    };
    for (const [name, spec] of Object.entries(leafSpecs)) {
      const rng = mulberry32(spec.seed);
      leafCache[name] = [];
      for (let i = 0; i < 3; i++) {
        leafCache[name].push(
          makeLeafGeometry({
            length: spec.length * (0.88 + i * 0.08 + rng() * 0.08),
            width: spec.width * (0.88 + rng() * 0.22),
            segU: 5,
            segV: 9,
            curl: spec.curl * rngRange(rng, 0.8, 1.25),
            fold: spec.fold * rngRange(rng, 0.8, 1.2),
            serration: name === "camellia" ? 0.65 : 0.24,
            baseColor: spec.colors[0],
            tipColor: spec.colors[1],
            veinColor: spec.colors[2],
            veinStrength: name === "camellia" ? 0.3 : 0.2,
            phase: rng() * 20
          })
        );
      }
    }
    leafCache.clover = [];
    for (let i = 0; i < 3; i++) {
      const rng = mulberry32(2003 + i * 19);
      leafCache.clover.push(
        makeCloverLeafletGeometry(
          i === 1 ? 0x3b5b31 : 0x34522b,
          i === 1 ? 0x8ea966 : 0x80a05d,
          rng() * 10
        )
      );
    }
  }

  const calyxGeometry = new THREE.SphereGeometry(1, 8, 4);
  const sepalGeometry = makeLeafGeometry({
    length: 0.022,
    width: 0.006,
    segU: 3,
    segV: 5,
    curl: 0.1,
    fold: 0.08,
    baseColor: 0x3c552d,
    tipColor: 0x78924b,
    veinColor: 0x8fa164,
    veinStrength: 0.1,
    phase: 4.2
  });

  function stemPoints(baseX, baseZ, height, leanX, leanZ, sway, phase) {
    const points = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const bend = t * t;
      points.push(
        new THREE.Vector3(
          baseX + leanX * bend + Math.sin(t * 3.2 + phase) * sway * t,
          height * t,
          baseZ + leanZ * bend + Math.cos(t * 2.35 + phase) * sway * 0.62 * t
        )
      );
    }
    return points;
  }

  function pointOnPolyline(points, t) {
    const f = clamp(t, 0, 1) * (points.length - 1);
    const i = Math.min(points.length - 2, Math.floor(f));
    const local = f - i;
    return points[i].clone().lerp(points[i + 1], local);
  }

  function addLeafAssembly(builder, options) {
    const {
      origin,
      yaw,
      pitch = -0.18,
      roll = 0,
      scale = 1,
      geometry,
      petioleFrom = null,
      petioleColor = 0x5b6f40
    } = options;
    if (petioleFrom) {
      const end = origin.clone();
      const mid = petioleFrom.clone().lerp(end, 0.55);
      mid.y += 0.012;
      builder.addTube([petioleFrom, mid, end], 0.0017, 0.0011, 3, petioleColor, petioleColor, 3);
    }
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
    const matrix = new THREE.Matrix4().compose(origin, quaternion, new THREE.Vector3(scale, scale, scale));
    builder.add(geometry, matrix, WHITE);
  }

  const CALYX_RADIUS = {
    sakura: 0.0155,
    camellia: 0.026,
    peony: 0.026,
    daisy: 0.0105,
    buttercup: 0.009,
    clover: 0.0075
  };

  const SEPAL_SCALE = {
    sakura: 0.55,
    camellia: 1.0,
    peony: 0.9,
    daisy: 0.5,
    buttercup: 0.48,
    clover: 0.32
  };

  function addCalyx(foliageBuilder, headMatrix, rng, size, speciesId) {
    const cupRadius = CALYX_RADIUS[speciesId] * size;
    const cup = new THREE.Matrix4().copy(headMatrix);
    cup.multiply(new THREE.Matrix4().makeTranslation(0, -0.004 * size, 0));
    cup.multiply(new THREE.Matrix4().makeScale(cupRadius, cupRadius * 0.46, cupRadius));
    foliageBuilder.add(calyxGeometry, cup, makeColor(0x536b37));

    const sepalScale = SEPAL_SCALE[speciesId] * size;
    const sepalCount = speciesId === "clover" ? 2 : 4;
    for (let i = 0; i < sepalCount; i++) {
      const angle = (i / sepalCount) * Math.PI * 2 + rng() * 0.3;
      const local = new THREE.Matrix4().makeTranslation(0, -0.006 * size, 0);
      local.multiply(new THREE.Matrix4().makeRotationY(angle));
      local.multiply(new THREE.Matrix4().makeRotationX(0.42 + rng() * 0.3));
      local.multiply(new THREE.Matrix4().makeScale(sepalScale, sepalScale, sepalScale));
      const m = new THREE.Matrix4().copy(headMatrix).multiply(local);
      foliageBuilder.add(sepalGeometry, m, makeColor(0x516b35));
    }
  }

  function composeHeadMatrix(position, rng, scale) {
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        rngRange(rng, -0.28, 0.28),
        rng() * Math.PI * 2,
        rngRange(rng, -0.22, 0.22),
        "YXZ"
      )
    );
    return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(scale, scale, scale));
  }

  function addPlantFlower(foliageBuilder, petalBuilder, speciesId, position, rng, scale, headList) {
    const cache = headCache[speciesId];
    const geometry = cache[Math.floor(rng() * cache.length)];
    const headMatrix = composeHeadMatrix(position.clone(), rng, scale);
    petalBuilder.add(geometry, headMatrix, WHITE);
    addCalyx(foliageBuilder, headMatrix, rng, scale, speciesId);
    headList.push({
      x: position.x,
      y: position.y,
      z: position.z,
      radius: HEAD_RADIUS[speciesId] * scale
    });
  }

  function addBasalRosette(builder, leafGeo, rng, count, scale = 1, radius = 0.04, pitch = -0.2) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rngRange(rng, -0.18, 0.18);
      const radiusHere = radius * rngRange(rng, 0.25, 1);
      const origin = new THREE.Vector3(Math.sin(angle) * radiusHere, 0.01, Math.cos(angle) * radiusHere);
      const from = new THREE.Vector3(0, 0.008, 0);
      addLeafAssembly(builder, {
        origin,
        yaw: angle,
        pitch: pitch + rngRange(rng, -0.14, 0.1),
        roll: rngRange(rng, -0.15, 0.15),
        scale: scale * rngRange(rng, 0.82, 1.16),
        geometry: leafGeo,
        petioleFrom: from,
        petioleColor: 0x536d3d
      });
    }
  }

  function buildPeonyPlant(rng, variant) {
    const foliageBuilder = new GeoBuilder();
    const petalBuilder = new GeoBuilder();
    const heads = [];
    const stemCount = variant === 0 ? 2 : 3;

    for (let s = 0; s < stemCount; s++) {
      const height = rngRange(rng, 0.62, 0.88);
      const baseX = rngRange(rng, -0.085, 0.085);
      const baseZ = rngRange(rng, -0.08, 0.08);
      const leanX = rngRange(rng, -0.15, 0.13);
      const leanZ = rngRange(rng, -0.11, 0.13);
      const phase = rng() * 10;
      const points = stemPoints(baseX, baseZ, height, leanX, leanZ, 0.03, phase);
      foliageBuilder.addTube(points, 0.0075, 0.0028, 4, 0x586b3d, 0x809152, 8);

      const nodeHeights = [0.27, 0.44, 0.62];
      for (const nodeT of nodeHeights) {
        if (rng() < 0.16) continue;
        const node = pointOnPolyline(points, nodeT + rngRange(rng, -0.035, 0.035));
        const yaw = rng() * Math.PI * 2;
        const petioleLength = rngRange(rng, 0.055, 0.095);
        const tip = node.clone().add(
          new THREE.Vector3(Math.sin(yaw) * petioleLength, 0.018 + rng() * 0.025, Math.cos(yaw) * petioleLength)
        );
        const mid = node.clone().lerp(tip, 0.5);
        mid.y += 0.012;
        foliageBuilder.addTube([node, mid, tip], 0.0021, 0.0012, 3, 0x596f3e, 0x7c8d4e, 3);
        for (let k = -1; k <= 1; k++) {
          const geo = leafCache.peony[Math.floor(rng() * leafCache.peony.length)];
          addLeafAssembly(foliageBuilder, {
            origin: tip.clone().add(new THREE.Vector3(k * 0.006, 0.001, 0)),
            yaw: yaw + k * 0.48 + rngRange(rng, -0.08, 0.08),
            pitch: -0.28 + rngRange(rng, -0.11, 0.15),
            roll: rngRange(rng, -0.24, 0.24),
            scale: rngRange(rng, 0.74, 1.02),
            geometry: geo
          });
        }
      }

      const headPosition = points[points.length - 1].clone();
      headPosition.y -= 0.008;
      addPlantFlower(foliageBuilder, petalBuilder, "peony", headPosition, rng, rngRange(rng, 0.9, 1.12), heads);
    }

    if (rng() < 0.6) {
      const budBase = new THREE.Vector3(rngRange(rng, -0.06, 0.06), 0, rngRange(rng, -0.06, 0.06));
      const points = stemPoints(budBase.x, budBase.z, rngRange(rng, 0.35, 0.5), rngRange(rng, -0.04, 0.04), rngRange(rng, -0.04, 0.04), 0.02, rng() * 9);
      foliageBuilder.addTube(points, 0.0048, 0.0023, 3, 0x586b3d, 0x7c8e4d, 6);
      const bud = new THREE.SphereGeometry(0.021, 8, 6);
      paintGeometryY(bud, 0x6f7b40, 0xbc7f95, 0.6);
      const budPos = points[points.length - 1].clone();
      foliageBuilder.add(
        bud,
        new THREE.Matrix4().compose(
          budPos,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, rng() * 6, -0.2, "YXZ")),
          new THREE.Vector3(1, 1.16, 1)
        ),
        WHITE
      );
    }

    return {
      stemGeometry: foliageBuilder.build(),
      petalGeometry: petalBuilder.build(),
      heads,
      height: 0.9
    };
  }

  function buildDaisyPlant(rng, variant) {
    const foliageBuilder = new GeoBuilder();
    const petalBuilder = new GeoBuilder();
    const heads = [];
    const stemCount = variant === 1 ? 4 : 3;

    addBasalRosette(
      foliageBuilder,
      leafCache.daisy[Math.floor(rng() * leafCache.daisy.length)],
      rng,
      5 + variant,
      rngRange(rng, 0.9, 1.16),
      0.026,
      -0.24
    );

    for (let s = 0; s < stemCount; s++) {
      const baseX = rngRange(rng, -0.07, 0.07);
      const baseZ = rngRange(rng, -0.07, 0.07);
      const height = rngRange(rng, 0.23, 0.385);
      const points = stemPoints(baseX, baseZ, height, rngRange(rng, -0.09, 0.09), rngRange(rng, -0.09, 0.09), 0.025, rng() * 10);
      foliageBuilder.addTube(points, 0.0028, 0.0013, 3, 0x536a3c, 0x768d4c, 7);

      if (s % 2 === 0) {
        const node = pointOnPolyline(points, rngRange(rng, 0.35, 0.6));
        const yaw = rng() * Math.PI * 2;
        addLeafAssembly(foliageBuilder, {
          origin: node.clone().add(new THREE.Vector3(Math.sin(yaw) * 0.022, 0.015, Math.cos(yaw) * 0.022)),
          yaw,
          pitch: -0.33,
          roll: rngRange(rng, -0.1, 0.1),
          scale: rngRange(rng, 0.65, 0.85),
          geometry: leafCache.daisy[Math.floor(rng() * leafCache.daisy.length)],
          petioleFrom: node,
          petioleColor: 0x536a3c
        });
      }

      const headPosition = points[points.length - 1].clone();
      if (rng() < 0.84 || (s === stemCount - 1 && heads.length === 0)) {
        addPlantFlower(foliageBuilder, petalBuilder, "daisy", headPosition, rng, rngRange(rng, 0.9, 1.18), heads);
      } else {
        const bud = new THREE.SphereGeometry(0.009, 7, 5);
        paintGeometryY(bud, 0x657c3b, 0xe3dcc3, 0.6);
        foliageBuilder.add(bud, new THREE.Matrix4().makeTranslation(headPosition.x, headPosition.y, headPosition.z), WHITE);
      }
    }

    return {
      stemGeometry: foliageBuilder.build(),
      petalGeometry: petalBuilder.build(),
      heads,
      height: 0.42
    };
  }

  function buildButtercupPlant(rng, variant) {
    const foliageBuilder = new GeoBuilder();
    const petalBuilder = new GeoBuilder();
    const heads = [];
    const stemCount = 3 + (variant % 2);

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + rng() * 0.6;
      const origin = new THREE.Vector3(Math.sin(angle) * rngRange(rng, 0.012, 0.035), 0.009, Math.cos(angle) * rngRange(rng, 0.012, 0.035));
      addLeafAssembly(foliageBuilder, {
        origin,
        yaw: angle,
        pitch: -0.16 + rngRange(rng, -0.1, 0.1),
        roll: rngRange(rng, -0.15, 0.15),
        scale: rngRange(rng, 0.9, 1.3),
        geometry: leafCache.buttercup[Math.floor(rng() * leafCache.buttercup.length)],
        petioleFrom: new THREE.Vector3(0, 0.008, 0),
        petioleColor: 0x536a38
      });
    }

    for (let s = 0; s < stemCount; s++) {
      const height = rngRange(rng, 0.2, 0.34);
      const baseX = rngRange(rng, -0.06, 0.06);
      const baseZ = rngRange(rng, -0.05, 0.06);
      const points = stemPoints(baseX, baseZ, height, rngRange(rng, -0.08, 0.1), rngRange(rng, -0.1, 0.08), 0.022, rng() * 10);
      foliageBuilder.addTube(points, 0.0024, 0.0011, 3, 0x53693c, 0x869552, 6);

      if (s === 1) {
        const node = pointOnPolyline(points, 0.45);
        addLeafAssembly(foliageBuilder, {
          origin: node.clone().add(new THREE.Vector3(0.02, 0.012, 0.012)),
          yaw: rng() * 6.283,
          pitch: -0.34,
          scale: 0.75,
          geometry: leafCache.buttercup[Math.floor(rng() * 3)],
          petioleFrom: node,
          petioleColor: 0x536a38
        });
      }

      const headPosition = points[points.length - 1].clone();
      addPlantFlower(foliageBuilder, petalBuilder, "buttercup", headPosition, rng, rngRange(rng, 1.0, 1.3), heads);
    }

    return {
      stemGeometry: foliageBuilder.build(),
      petalGeometry: petalBuilder.build(),
      heads,
      height: 0.38
    };
  }

  function buildCloverPlant(rng, variant) {
    const foliageBuilder = new GeoBuilder();
    const petalBuilder = new GeoBuilder();
    const heads = [];
    const leafCount = 3 + (variant % 2);

    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2 + rngRange(rng, -0.3, 0.3);
      const height = rngRange(rng, 0.055, 0.115);
      const tip = new THREE.Vector3(
        Math.sin(angle) * rngRange(rng, 0.035, 0.08),
        height,
        Math.cos(angle) * rngRange(rng, 0.035, 0.08)
      );
      const start = new THREE.Vector3(0, 0.006, 0);
      foliageBuilder.addTube([start, start.clone().lerp(tip, 0.55).add(new THREE.Vector3(0, 0.01, 0)), tip], 0.0015, 0.0008, 3, 0x597440, 0x789453, 4);
      for (let k = 0; k < 3; k++) {
        addLeafAssembly(foliageBuilder, {
          origin: tip.clone(),
          yaw: angle + k * (Math.PI * 2 / 3) + rngRange(rng, -0.08, 0.08),
          pitch: -0.08 + rngRange(rng, -0.12, 0.12),
          roll: rngRange(rng, -0.12, 0.12),
          scale: rngRange(rng, 0.8, 1.15),
          geometry: leafCache.clover[Math.floor(rng() * 3)]
        });
      }
    }

    const flowerStemCount = 2 + (variant % 2);
    for (let s = 0; s < flowerStemCount; s++) {
      const angle = rng() * Math.PI * 2;
      const height = rngRange(rng, 0.13, 0.225);
      const base = new THREE.Vector3(Math.sin(angle) * 0.012, 0, Math.cos(angle) * 0.012);
      const top = new THREE.Vector3(
        base.x + Math.sin(angle) * rngRange(rng, 0.012, 0.04),
        height,
        base.z + Math.cos(angle) * rngRange(rng, 0.012, 0.04)
      );
      const mid = base.clone().lerp(top, 0.5);
      mid.x += 0.005;
      foliageBuilder.addTube([base, mid, top], 0.0014, 0.0007, 3, 0x5b763e, 0x849b57, 4);
      addPlantFlower(foliageBuilder, petalBuilder, "clover", top, rng, rngRange(rng, 0.9, 1.2), heads);
    }

    return {
      stemGeometry: foliageBuilder.build(),
      petalGeometry: petalBuilder.build(),
      heads,
      height: 0.24
    };
  }

  function buildCamelliaPlant(rng, variant) {
    const foliageBuilder = new GeoBuilder();
    const petalBuilder = new GeoBuilder();
    const heads = [];

    const mainBranches = 4 + (variant % 2);
    for (let b = 0; b < mainBranches; b++) {
      const baseAngle = (b / mainBranches) * Math.PI * 2 + rngRange(rng, -0.35, 0.35);
      const height = rngRange(rng, 0.65, 1.12);
      const lean = rngRange(rng, 0.15, 0.42);
      const base = new THREE.Vector3(Math.sin(baseAngle) * 0.04, 0, Math.cos(baseAngle) * 0.04);
      const mid = new THREE.Vector3(
        base.x + Math.sin(baseAngle) * lean * 0.55,
        height * 0.56,
        base.z + Math.cos(baseAngle) * lean * 0.55
      );
      const tip = new THREE.Vector3(
        base.x + Math.sin(baseAngle) * lean,
        height,
        base.z + Math.cos(baseAngle) * lean
      );
      foliageBuilder.addTube([base, mid, tip], 0.017, 0.0045, 5, 0x4b4630, 0x66613d, 8);

      const leafCount = 5 + Math.floor(rng() * 3);
      for (let l = 0; l < leafCount; l++) {
        const t = rngRange(rng, 0.15, 0.98);
        const node = pointOnPolyline([base, mid, tip], t);
        const yaw = baseAngle + rngRange(rng, -1.9, 1.9);
        addLeafAssembly(foliageBuilder, {
          origin: node.clone().add(new THREE.Vector3(Math.sin(yaw) * 0.028, 0.018, Math.cos(yaw) * 0.028)),
          yaw,
          pitch: -0.08 + rngRange(rng, -0.46, 0.24),
          roll: rngRange(rng, -0.25, 0.25),
          scale: rngRange(rng, 0.68, 1.12),
          geometry: leafCache.camellia[Math.floor(rng() * 3)],
          petioleFrom: node,
          petioleColor: 0x55523a
        });
      }

      if (b < mainBranches - 1) {
        const flowerPos = tip.clone();
        if (flowerPos.y > 0.38) {
          addPlantFlower(foliageBuilder, petalBuilder, "camellia", flowerPos, rng, rngRange(rng, 0.78, 1.02), heads);
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      const angle = rng() * 6.283;
      const pos = new THREE.Vector3(Math.sin(angle) * rngRange(rng, 0.2, 0.36), rngRange(rng, 0.18, 0.34), Math.cos(angle) * rngRange(rng, 0.2, 0.36));
      addPlantFlower(foliageBuilder, petalBuilder, "camellia", pos, rng, rngRange(rng, 0.78, 1.02), heads);
    }

    return {
      stemGeometry: foliageBuilder.build(),
      petalGeometry: petalBuilder.build(),
      heads,
      height: 1.25
    };
  }

  const PLANT_BUILDERS = {
    peony: buildPeonyPlant,
    daisy: buildDaisyPlant,
    buttercup: buildButtercupPlant,
    clover: buildCloverPlant,
    camellia: buildCamelliaPlant
  };

  const plantVariants = {};
  {
    let seedIndex = 31;
    for (const [speciesId, builder] of Object.entries(PLANT_BUILDERS)) {
      plantVariants[speciesId] = [];
      const variantCount = speciesId === "camellia" ? 2 : 3;
      for (let v = 0; v < variantCount; v++) {
        const rng = mulberry32(seedIndex * 983 + v * 313 + 77);
        plantVariants[speciesId].push(builder(rng, v));
        seedIndex++;
      }
    }
  }

  /* ---------- 13. Planted meadows ---------- */

  const flowerTargets = [];
  const plantGroup = new THREE.Group();
  plantGroup.name = "meadow-plants";
  scene.add(plantGroup);

  const TREE_SITES = [
    { x: -4.9, z: 2.5, radius: 0.8 },
    { x: 8.0, z: -3.2, radius: 0.7 },
    { x: -14.5, z: -24, radius: 0.65 }
  ];

  const FLOWER_LAYOUT = {
    peony: {
      count: QUALITY.peony,
      minCameraDistance: 2.0,
      waterMargin: 1.45,
      scale: [1.02, 1.36],
      heroes: [
        [-2.8, 2.35],
        [3.4, -0.3],
        [-5.6, -4.5],
        [4.9, -7.2],
        [2.5, 4.35],
        [-3.35, 4.75],
        [1.65, 5.8],
        [-2.0, 5.35]
      ],
      clusters: [
        { x: -2.75, z: 2.15, r: 1.7, w: 1.5 },
        { x: 3.25, z: -0.15, r: 1.85, w: 1.25 },
        { x: -4.9, z: -4.7, r: 2.7, w: 1.2 },
        { x: 4.8, z: -7.4, r: 2.6, w: 1.05 },
        { x: -7.8, z: -11.4, r: 3.9, w: 0.8 },
        { x: 8.4, z: -13.5, r: 4.2, w: 0.7 }
      ]
    },
    daisy: {
      count: QUALITY.daisy,
      minCameraDistance: 1.2,
      waterMargin: 1.2,
      scale: [1.0, 1.4],
      heroes: [
        [-1.25, 4.25],
        [2.75, 2.7],
        [-4.1, 0.45],
        [1.15, -3.9],
        [3.9, -8.2],
        [0.55, 5.55],
        [-2.45, 5.2],
        [2.95, 4.7],
        [-0.6, 5.9],
        [1.45, 5.75]
      ],
      clusters: [
        { x: -1.25, z: 3.3, r: 2.5, w: 1.45 },
        { x: 2.0, z: 2.0, r: 2.5, w: 1.35 },
        { x: -4.2, z: -1.5, r: 3.6, w: 1.2 },
        { x: 1.25, z: -7.9, r: 4.6, w: 1.45 },
        { x: 6.8, z: -13.5, r: 4.8, w: 1.05 },
        { x: -6.4, z: -10.4, r: 4.7, w: 1.05 },
        { x: -0.2, z: -18.5, r: 6.2, w: 1.0 },
        { x: -9.4, z: -21.0, r: 5.2, w: 0.7 },
        { x: 10.2, z: -20.0, r: 5.4, w: 0.65 }
      ]
    },
    buttercup: {
      count: QUALITY.buttercup,
      minCameraDistance: 1.25,
      waterMargin: 1.2,
      scale: [1.0, 1.38],
      heroes: [
        [3.1, -0.9],
        [4.9, -4.4],
        [-2.5, -5.5],
        [2.1, -10.3],
        [-0.8, 5.75],
        [2.65, 5.2],
        [-2.2, 3.4],
        [1.2, 1.0],
        [3.5, 1.8],
        [0.45, 6.05],
        [1.9, 5.65]
      ],
      clusters: [
        { x: 3.25, z: 1.4, r: 2.25, w: 1.1 },
        { x: 5.1, z: -4.1, r: 2.9, w: 1.3 },
        { x: -3.1, z: -6.2, r: 2.9, w: 1.1 },
        { x: 2.1, z: -13.4, r: 4.7, w: 1.15 },
        { x: -5.7, z: -17.7, r: 5.0, w: 0.9 },
        { x: 8.7, z: -18.0, r: 5.2, w: 0.8 }
      ]
    },
    clover: {
      count: QUALITY.clover,
      minCameraDistance: 0.9,
      waterMargin: 0.7,
      scale: [1.0, 1.36],
      heroes: [
        [-0.35, 5.45],
        [1.85, 5.05],
        [-2.15, 4.3],
        [0.8, 3.35],
        [0.35, 6.25],
        [-1.2, 5.95],
        [0.0, 6.65],
        [1.95, 6.35]
      ],
      clusters: [
        { x: -1.7, z: 5.1, r: 1.8, w: 1.5 },
        { x: 1.55, z: 4.65, r: 1.8, w: 1.4 },
        { x: -4.0, z: 3.15, r: 2.3, w: 1.05 },
        { x: 3.5, z: 4.0, r: 1.9, w: 0.9 },
        { x: 0.8, z: -1.2, r: 3.2, w: 1.1 },
        { x: -3.1, z: -3.0, r: 3.3, w: 0.85 },
        { x: 4.2, z: -8.0, r: 4.4, w: 0.65 }
      ]
    },
    camellia: {
      count: QUALITY.camellia,
      minCameraDistance: 5.5,
      waterMargin: 1.6,
      scale: [0.86, 1.16],
      fixed: [
        [-5.8, -1.8],
        [7.5, -9.4],
        [-8.2, -12.6],
        [5.3, -16.6],
        [-12.2, -20.5],
        [10.9, -22.5],
        [-2.9, -14.2],
        [14.0, -14.0],
        [-9.8, -6.1]
      ],
      heroes: [],
      clusters: [{ x: 0, z: -10, r: 12, w: 1 }]
    }
  };

  function pickWeightedCluster(clusters, rng) {
    let total = 0;
    for (const c of clusters) total += c.w;
    let r = rng() * total;
    for (const c of clusters) {
      r -= c.w;
      if (r <= 0) return c;
    }
    return clusters[clusters.length - 1];
  }

  function generatePlacements(speciesId, layout, seed) {
    const rng = mulberry32(seed);
    const placements = [];
    const cameraX = cameraState.baseX;
    const cameraZ = cameraState.baseZ;
    const heights = {};
    const valid = (x, z, minDist) => {
      if (x < -34 || x > 34 || z < -42 || z > 13) return false;
      if (streamDistance(x, z) < streamHalfWidth(z) * 1.6 + layout.waterMargin) return false;
      if (Math.hypot(x - cameraX, z - cameraZ) < minDist) return false;
      for (const tree of TREE_SITES) {
        if (Math.hypot(x - tree.x, z - tree.z) < tree.radius + 0.55) return false;
      }
      return true;
    };

    if (layout.fixed) {
      for (const [x, z] of layout.fixed) {
        if (placements.length >= layout.count) break;
        placements.push({
          x,
          z,
          scale: rngRange(rng, layout.scale[0], layout.scale[1]),
          rotation: rng() * Math.PI * 2
        });
      }
    }

    if (layout.heroes) {
      for (const [x, z] of layout.heroes) {
        if (placements.length >= layout.count) break;
        if (!valid(x, z, layout.minCameraDistance)) continue;
        placements.push({
          x,
          z,
          scale: rngRange(rng, layout.scale[0], layout.scale[1]),
          rotation: rng() * Math.PI * 2
        });
      }
    }

    let guard = 0;
    while (placements.length < layout.count && guard < layout.count * 180) {
      guard++;
      const cluster = pickWeightedCluster(layout.clusters, rng);
      const angle = rng() * Math.PI * 2;
      const radius = cluster.r * Math.sqrt(rng());
      const x = cluster.x + Math.cos(angle) * radius * 1.12;
      const z = cluster.z + Math.sin(angle) * radius * 0.82;
      if (!valid(x, z, layout.minCameraDistance)) continue;
      placements.push({
        x,
        z,
        scale: rngRange(rng, layout.scale[0], layout.scale[1]),
        rotation: rng() * Math.PI * 2
      });
    }

    if (placements.length < layout.count) {
      for (let i = placements.length; i < layout.count; i++) {
        placements.push({
          x: rngRange(rng, -8, 8),
          z: rngRange(rng, -25, 4),
          scale: rngRange(rng, layout.scale[0], layout.scale[1]),
          rotation: rng() * Math.PI * 2
        });
      }
    }

    return placements;
  }

  const plantStats = {};

  {
    const seedBase = 9107;
    const speciesList = ["peony", "daisy", "buttercup", "clover", "camellia"];
    for (let speciesIndex = 0; speciesIndex < speciesList.length; speciesIndex++) {
      const speciesId = speciesList[speciesIndex];
      const layout = FLOWER_LAYOUT[speciesId];
      const placements = generatePlacements(speciesId, layout, seedBase + speciesIndex * 811);
      const variants = plantVariants[speciesId];
      const buckets = variants.map(() => []);
      const rng = mulberry32(4411 + speciesIndex * 131);
      for (const placement of placements) {
        const variantIndex = Math.floor(rng() * variants.length);
        buckets[variantIndex].push(placement);
      }

      const petalMaterial = petalMaterials[speciesId];
      const foliageMat = speciesId === "camellia" ? glossyFoliageMaterial : foliageMaterial;
      const castingShadow = speciesId === "peony" || speciesId === "camellia";

      let totalInstances = 0;
      let totalHeads = 0;

      for (let v = 0; v < variants.length; v++) {
        const entries = buckets[v];
        if (!entries.length) continue;
        const variant = variants[v];
        const stemMesh = new THREE.InstancedMesh(variant.stemGeometry, foliageMat, entries.length);
        const petalMesh = new THREE.InstancedMesh(variant.petalGeometry, petalMaterial, entries.length);
        stemMesh.name = `${speciesId}-stems-${v}`;
        petalMesh.name = `${speciesId}-flowers-${v}`;
        stemMesh.castShadow = castingShadow;
        stemMesh.receiveShadow = true;
        petalMesh.castShadow = castingShadow;
        petalMesh.receiveShadow = true;
        stemMesh.frustumCulled = false;
        petalMesh.frustumCulled = false;

        const rotationQuat = new THREE.Quaternion();
        const scaleVector = new THREE.Vector3();
        const matrix = new THREE.Matrix4();
        const instancePosition = new THREE.Vector3();
        const instanceTint = new THREE.Color();
        const stemTint = new THREE.Color();
        const headWorld = new THREE.Vector3();

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const y = terrainHeight(entry.x, entry.z) - 0.008;
          rotationQuat.setFromAxisAngle(Y_AXIS, entry.rotation);
          const size = entry.scale * (speciesId === "camellia" ? 1.0 : 1.0);
          scaleVector.set(size, size, size);
          instancePosition.set(entry.x, y, entry.z);
          matrix.compose(instancePosition, rotationQuat, scaleVector);
          stemMesh.setMatrixAt(i, matrix);
          petalMesh.setMatrixAt(i, matrix);

          const tintLum = rngRange(rng, 0.9, 1.045);
          if (speciesId === "peony") instanceTint.setRGB(tintLum * 1.01, tintLum * 0.97, tintLum);
          else if (speciesId === "daisy") instanceTint.setRGB(tintLum * 1.015, tintLum, tintLum * 0.965);
          else if (speciesId === "buttercup") instanceTint.setRGB(tintLum * 1.035, tintLum * 1.01, tintLum * 0.94);
          else if (speciesId === "clover") instanceTint.setRGB(tintLum * 0.99, tintLum * 1.01, tintLum * 0.97);
          else if (speciesId === "camellia") instanceTint.setRGB(tintLum * 1.015, tintLum * 0.985, tintLum * 0.95);
          else instanceTint.setRGB(tintLum, tintLum * 0.99, tintLum * 0.995);
          stemTint.setRGB(tintLum, tintLum, tintLum);
          stemMesh.setColorAt(i, stemTint);
          petalMesh.setColorAt(i, instanceTint);

          for (const head of variant.heads) {
            headWorld.set(head.x, head.y, head.z).applyMatrix4(matrix);
            flowerTargets.push({
              type: speciesId,
              position: headWorld.clone(),
              radius: head.radius * size,
              yaw: entry.rotation
            });
            totalHeads++;
          }
        }

        stemMesh.instanceMatrix.needsUpdate = true;
        petalMesh.instanceMatrix.needsUpdate = true;
        if (stemMesh.instanceColor) stemMesh.instanceColor.needsUpdate = true;
        if (petalMesh.instanceColor) petalMesh.instanceColor.needsUpdate = true;
        plantGroup.add(stemMesh, petalMesh);
        totalInstances += entries.length;
      }

      plantStats[speciesId] = { plants: totalInstances, heads: totalHeads };
    }
  }

  // A few hand-placed blooms give the foreground a real subject.
  {
    const heroPlants = [
      { species: "peony", variant: 0, x: 1.45, z: 5.1, scale: 1.62, rotation: 1.35 },
      { species: "peony", variant: 1, x: -2.35, z: 4.8, scale: 1.44, rotation: 4.2 },
      { species: "peony", variant: 2, x: 0.28, z: 4.9, scale: 1.56, rotation: 2.2 },
      { species: "peony", variant: 1, x: -1.05, z: 4.2, scale: 1.28, rotation: 5.4 },
      { species: "daisy", variant: 0, x: 0.75, z: 5.55, scale: 1.5, rotation: 2.65 },
      { species: "daisy", variant: 1, x: 1.22, z: 4.72, scale: 1.28, rotation: 1.2 },
      { species: "buttercup", variant: 1, x: -0.9, z: 5.7, scale: 1.45, rotation: 0.8 },
      { species: "clover", variant: 2, x: 0.3, z: 6.55, scale: 1.3, rotation: 5.0 }
    ];
    const placementMatrix = new THREE.Matrix4();
    const placementQuat = new THREE.Quaternion();
    const headWorld = new THREE.Vector3();
    for (const spec of heroPlants) {
      if (isInWater(spec.x, spec.z, -0.1)) continue;
      const variant = plantVariants[spec.species][spec.variant];
      const foliageMesh = new THREE.Mesh(
        variant.stemGeometry,
        spec.species === "camellia" ? glossyFoliageMaterial : foliageMaterial
      );
      const petalMesh = new THREE.Mesh(variant.petalGeometry, petalMaterials[spec.species]);
      foliageMesh.castShadow = false;
      foliageMesh.receiveShadow = true;
      petalMesh.castShadow = false;
      petalMesh.receiveShadow = true;
      foliageMesh.frustumCulled = false;
      petalMesh.frustumCulled = false;
      placementQuat.setFromAxisAngle(Y_AXIS, spec.rotation);
      placementMatrix.compose(
        new THREE.Vector3(spec.x, terrainHeight(spec.x, spec.z) - 0.008, spec.z),
        placementQuat,
        new THREE.Vector3(spec.scale, spec.scale, spec.scale)
      );
      foliageMesh.matrixAutoUpdate = false;
      petalMesh.matrixAutoUpdate = false;
      foliageMesh.matrix.copy(placementMatrix);
      petalMesh.matrix.copy(placementMatrix);
      foliageMesh.name = `hero-${spec.species}-stems`;
      petalMesh.name = `hero-${spec.species}-flowers`;
      plantGroup.add(foliageMesh, petalMesh);
      foliageMesh.updateMatrixWorld(true);
      petalMesh.updateMatrixWorld(true);
      for (const head of variant.heads) {
        headWorld.set(head.x, head.y, head.z).applyMatrix4(placementMatrix);
        flowerTargets.push({
          type: spec.species,
          position: headWorld.clone(),
          radius: head.radius * spec.scale,
          yaw: spec.rotation
        });
      }
    }
  }

  /* ---------- 14. A lighter wildflower layer for the middle distance ---------- */

  function buildLodPlant(speciesId, variantSeed) {
    const rng = mulberry32(variantSeed);
    const builder = new GeoBuilder();
    const heads = [];
    const stemCount = speciesId === "clover" ? 3 : 2;
    const leafGeometry = makeLeafGeometry({
      length: speciesId === "peony" ? 0.068 : speciesId === "clover" ? 0.026 : 0.045,
      width: speciesId === "peony" ? 0.022 : speciesId === "clover" ? 0.019 : 0.012,
      segU: 3,
      segV: 4,
      curl: 0.14,
      fold: 0.2,
      baseColor: 0x3b5730,
      tipColor: 0x75914d,
      veinColor: 0x92a863,
      veinStrength: 0.16,
      phase: rng() * 8
    });

    const scaleRange =
      speciesId === "peony" ? [0.56, 0.78] : speciesId === "clover" ? [0.55, 0.78] : [0.68, 0.92];
    const heightRange =
      speciesId === "peony" ? [0.33, 0.49] : speciesId === "clover" ? [0.11, 0.2] : [0.2, 0.34];

    for (let s = 0; s < stemCount; s++) {
      const angle = (s / stemCount) * Math.PI * 2 + rngRange(rng, -0.65, 0.65);
      const height = rngRange(rng, heightRange[0], heightRange[1]);
      const lean = rngRange(rng, 0.01, 0.055);
      const base = new THREE.Vector3(
        Math.sin(angle) * rngRange(rng, 0.006, 0.03),
        0.001,
        Math.cos(angle) * rngRange(rng, 0.006, 0.03)
      );
      const mid = new THREE.Vector3(
        base.x + Math.sin(angle) * lean * 0.6,
        height * 0.58,
        base.z + Math.cos(angle) * lean * 0.6
      );
      const top = new THREE.Vector3(
        base.x + Math.sin(angle) * lean,
        height,
        base.z + Math.cos(angle) * lean
      );
      builder.addTube([base, mid, top], 0.0018, 0.0008, 3, 0x526b3a, 0x758b4c, 4);

      if (s === 0 || rng() < 0.55) {
        const leafScale = rngRange(rng, 0.6, 0.9);
        const leafMatrix = new THREE.Matrix4().compose(
          pointOnPolyline([base, mid, top], rngRange(rng, 0.2, 0.5)),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(-0.2 + rngRange(rng, -0.2, 0.2), angle + rngRange(rng, -0.7, 0.7), rng() * 0.3, "YXZ")
          ),
          new THREE.Vector3(leafScale, leafScale, leafScale)
        );
        builder.add(leafGeometry, leafMatrix, WHITE);
      }

      const headScale = rngRange(rng, scaleRange[0], scaleRange[1]);
      const headMatrix = composeHeadMatrix(top, rng, headScale);
      const petalBase = headMatrix;

      if (speciesId === "daisy") {
        const petal = makePetalGeometry({
          length: 0.04,
          width: 0.007,
          segU: 2,
          segV: 4,
          notch: 0,
          cup: 0.0018,
          arch: 0.0006,
          ruffle: 0.02,
          tipRounding: 0.14,
          baseColor: 0xe9dfc9,
          edgeColor: 0xfffdf7,
          veinColor: 0xe7dcca,
          veinStrength: 0.12,
          phase: rng() * 20
        });
        const count = 11;
        for (let i = 0; i < count; i++) {
          const pm = new THREE.Matrix4().copy(petalBase).multiply(
            petalMatrix((i / count) * Math.PI * 2 + angle, -0.06 + rngRange(rng, -0.08, 0.08), rngRange(rng, 0.85, 1.12), 0.002, 0.003)
          );
          builder.add(petal, pm, WHITE);
        }
        const center = new THREE.SphereGeometry(0.014, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2);
        paintGeometryY(center, 0xaa7620, 0xe0b747, 0.6);
        builder.add(center, new THREE.Matrix4().copy(petalBase).multiply(new THREE.Matrix4().makeTranslation(0, 0.002, 0)), WHITE);
      } else if (speciesId === "buttercup") {
        const petal = makePetalGeometry({
          length: 0.03,
          width: 0.027,
          segU: 3,
          segV: 4,
          notch: 0.03,
          cup: 0.006,
          arch: 0.002,
          ruffle: 0.04,
          tipRounding: 0.2,
          baseColor: 0xdca11d,
          edgeColor: 0xffe88d,
          veinColor: 0xefc431,
          veinStrength: 0.15,
          phase: rng() * 20
        });
        for (let i = 0; i < 5; i++) {
          const pm = new THREE.Matrix4().copy(petalBase).multiply(
            petalMatrix((i / 5) * Math.PI * 2 + angle + rngRange(rng, -0.08, 0.08), -0.18, rngRange(rng, 0.92, 1.08), 0.002, 0.002)
          );
          builder.add(petal, pm, WHITE);
        }
        const center = new THREE.SphereGeometry(0.0075, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2);
        paintGeometryY(center, 0x777b21, 0xbcbb39, 0.5);
        builder.add(center, new THREE.Matrix4().copy(petalBase).multiply(new THREE.Matrix4().makeTranslation(0, 0.004, 0)), WHITE);
      } else if (speciesId === "peony") {
        const petal = makePetalGeometry({
          length: 0.067,
          width: 0.055,
          segU: 3,
          segV: 5,
          notch: 0.06,
          cup: 0.007,
          arch: 0.003,
          ruffle: 0.3,
          tipRounding: 0.26,
          baseColor: 0xb44776,
          edgeColor: 0xf3bcd0,
          veinColor: 0xcf6490,
          veinStrength: 0.24,
          phase: rng() * 20
        });
        for (let i = 0; i < 7; i++) {
          const pm = new THREE.Matrix4().copy(petalBase).multiply(
            petalMatrix((i / 7) * Math.PI * 2 + angle, -0.12, rngRange(rng, 0.9, 1.1), 0.002, 0.004)
          );
          builder.add(petal, pm, WHITE);
        }
        for (let i = 0; i < 4; i++) {
          const pm = new THREE.Matrix4().copy(petalBase).multiply(
            petalMatrix((i / 4) * Math.PI * 2 + angle + 0.4, -0.3, 0.72, 0.006, 0.002)
          );
          builder.add(petal, pm, WHITE);
        }
        const center = new THREE.SphereGeometry(0.016, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2);
        paintGeometryY(center, 0x725025, 0xc6943f, 0.6);
        builder.add(center, new THREE.Matrix4().copy(petalBase).multiply(new THREE.Matrix4().makeTranslation(0, 0.008, 0)), WHITE);
      } else if (speciesId === "clover") {
        const petal = makePetalGeometry({
          length: 0.011,
          width: 0.0095,
          segU: 2,
          segV: 3,
          notch: 0.02,
          cup: 0.0015,
          arch: 0.001,
          ruffle: 0.03,
          tipRounding: 0.2,
          baseColor: 0xeee1de,
          edgeColor: 0xfffcf4,
          veinColor: 0xf1d8dc,
          veinStrength: 0.12,
          phase: rng() * 20
        });
        const up = new THREE.Vector3(0, 1, 0);
        const n = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < 13; i++) {
          const y = lerp(-0.014, 0.017, (i + 0.5) / 13);
          const ring = Math.sqrt(Math.max(0, 1 - Math.pow(y / 0.02, 2)));
          const a = i * 2.399963;
          n.set(Math.cos(a) * ring, y / 0.02, Math.sin(a) * ring).normalize();
          const xAxis = new THREE.Vector3().crossVectors(up, n);
          if (xAxis.lengthSq() < 0.01) xAxis.set(1, 0, 0);
          xAxis.normalize();
          const yAxis = new THREE.Vector3().crossVectors(n, xAxis).normalize();
          const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, n));
          const tm = new THREE.Matrix4().compose(
            n.clone().multiplyScalar(0.011).setY(Math.max(0.002, n.y * 0.016 + 0.002)),
            quat,
            new THREE.Vector3(0.8, 0.8, 0.8)
          );
          builder.add(petal, new THREE.Matrix4().copy(petalBase).multiply(tm), WHITE);
        }
      }

      heads.push({
        x: top.x,
        y: top.y + 0.01,
        z: top.z,
        radius: (speciesId === "peony" ? 0.1 : speciesId === "clover" ? 0.025 : 0.04) * headScale
      });
    }

    return { geometry: builder.build(), heads };
  }

  const lodVariants = {
    daisy: [buildLodPlant("daisy", 3311), buildLodPlant("daisy", 3373)],
    buttercup: [buildLodPlant("buttercup", 3413), buildLodPlant("buttercup", 3467)],
    peony: [buildLodPlant("peony", 3511), buildLodPlant("peony", 3559)],
    clover: [buildLodPlant("clover", 3613), buildLodPlant("clover", 3671)]
  };

  const LOD_LAYOUT = {
    daisy: {
      count: QUALITY.low ? 250 : 520,
      minCameraDistance: 7.5,
      waterMargin: 0.65,
      scale: [0.82, 1.16],
      clusters: [
        { x: -1.5, z: -11.0, r: 4.8, w: 1.4 },
        { x: 8.5, z: -13.0, r: 4.4, w: 1.1 },
        { x: -10.0, z: -16.0, r: 5.0, w: 1.2 },
        { x: 3.5, z: -24.0, r: 6.8, w: 1.3 },
        { x: -5.5, z: -33.0, r: 7.0, w: 1.0 },
        { x: 17.0, z: -25.0, r: 6.0, w: 0.8 },
        { x: -20.0, z: -27.0, r: 6.5, w: 0.8 },
        { x: 11.0, z: -36.0, r: 6.5, w: 0.7 },
        { x: 12.5, z: -12.5, r: 4.2, w: 0.9 }
      ]
    },
    buttercup: {
      count: QUALITY.low ? 225 : 470,
      minCameraDistance: 7.5,
      waterMargin: 0.6,
      scale: [0.8, 1.18],
      clusters: [
        { x: 4.3, z: -9.0, r: 4.6, w: 1.3 },
        { x: -6.0, z: -12.5, r: 5.0, w: 1.1 },
        { x: 10.0, z: -21.0, r: 5.4, w: 1.1 },
        { x: -1.0, z: -22.0, r: 7.0, w: 1.2 },
        { x: -14.5, z: -28.0, r: 6.2, w: 0.9 },
        { x: 14.0, z: -32.0, r: 6.2, w: 0.8 },
        { x: 9.0, z: -12.0, r: 4.4, w: 0.8 }
      ]
    },
    peony: {
      count: QUALITY.low ? 85 : 180,
      minCameraDistance: 8.5,
      waterMargin: 0.75,
      scale: [0.9, 1.16],
      clusters: [
        { x: -7.0, z: -10.0, r: 3.6, w: 1.1 },
        { x: 7.0, z: -16.0, r: 4.2, w: 1.0 },
        { x: -13.0, z: -21.5, r: 4.8, w: 0.9 },
        { x: 1.0, z: -29.0, r: 5.4, w: 0.9 },
        { x: 17.0, z: -35.0, r: 5.0, w: 0.6 }
      ]
    },
    clover: {
      count: QUALITY.low ? 170 : 340,
      minCameraDistance: 6.8,
      waterMargin: 0.5,
      scale: [0.82, 1.16],
      clusters: [
        { x: 1.8, z: -8.5, r: 4.2, w: 1.2 },
        { x: -4.8, z: -11.0, r: 5.0, w: 1.0 },
        { x: 6.0, z: -19.0, r: 6.2, w: 0.9 },
        { x: -9.0, z: -24.0, r: 6.6, w: 0.8 },
        { x: 3.0, z: -31.0, r: 7.5, w: 0.7 }
      ]
    }
  };

  {
    let lodSeed = 8807;
    for (const [speciesId, variants] of Object.entries(lodVariants)) {
      const layout = LOD_LAYOUT[speciesId];
      const placements = generatePlacements(speciesId, layout, lodSeed++ * 17 + 3);
      const buckets = variants.map(() => []);
      const rng = mulberry32(lodSeed * 41 + 9);
      for (const placement of placements) {
        buckets[Math.floor(rng() * variants.length)].push(placement);
      }
      const material = petalMaterials[speciesId];
      for (let v = 0; v < variants.length; v++) {
        const entries = buckets[v];
        if (!entries.length) continue;
        const variant = variants[v];
        const mesh = new THREE.InstancedMesh(variant.geometry, material, entries.length);
        mesh.name = `lod-${speciesId}-${v}`;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const matrix = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const tint = new THREE.Color();
        const p = new THREE.Vector3();
        const worldHead = new THREE.Vector3();
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const scale = entry.scale;
          q.setFromAxisAngle(Y_AXIS, entry.rotation);
          s.set(scale, scale, scale);
          p.set(entry.x, terrainHeight(entry.x, entry.z) - 0.007, entry.z);
          matrix.compose(p, q, s);
          mesh.setMatrixAt(i, matrix);
          const lum = rngRange(rng, 0.9, 1.04);
          tint.setRGB(lum, lum, lum);
          mesh.setColorAt(i, tint);
          for (const head of variant.heads) {
            worldHead.set(head.x, head.y, head.z).applyMatrix4(matrix);
            flowerTargets.push({
              type: speciesId,
              position: worldHead.clone(),
              radius: head.radius * scale,
              yaw: entry.rotation
            });
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        plantGroup.add(mesh);
      }
    }
  }

  /* ---------- 15. Cherry trees ---------- */

  function makeBarkTextures() {
    const width = 256;
    const height = 512;
    const canvas = document.createElement("canvas");
    const bumpCanvas = document.createElement("canvas");
    canvas.width = bumpCanvas.width = width;
    canvas.height = bumpCanvas.height = height;
    const ctx = canvas.getContext("2d");
    const bctx = bumpCanvas.getContext("2d");
    const rng = mulberry32(6129);

    ctx.fillStyle = "#4a3b31";
    ctx.fillRect(0, 0, width, height);
    bctx.fillStyle = "#7d7d7d";
    bctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 380; i++) {
      const x = rng() * width;
      const w = 0.8 + rng() * 5.5;
      const alpha = 0.035 + rng() * 0.18;
      const light = rng() > 0.58;
      ctx.strokeStyle = light
        ? `rgba(${126 + rng() * 38 | 0},${108 + rng() * 32 | 0},${92 + rng() * 24 | 0},${alpha})`
        : `rgba(${33 + rng() * 28 | 0},${26 + rng() * 24 | 0},${22 + rng() * 20 | 0},${alpha + 0.08})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x, -10);
      ctx.bezierCurveTo(x + (rng() - 0.5) * 24, height * 0.3, x + (rng() - 0.5) * 30, height * 0.7, x + (rng() - 0.5) * 22, height + 10);
      ctx.stroke();

      bctx.strokeStyle = light ? `rgba(216,216,216,${alpha})` : `rgba(38,38,38,${alpha + 0.08})`;
      bctx.lineWidth = w;
      bctx.beginPath();
      bctx.moveTo(x, -10);
      bctx.bezierCurveTo(x + (rng() - 0.5) * 24, height * 0.3, x + (rng() - 0.5) * 30, height * 0.7, x + (rng() - 0.5) * 22, height + 10);
      bctx.stroke();
    }

    for (let i = 0; i < 210; i++) {
      const x = rng() * width;
      const y = rng() * height;
      const w = 3 + rng() * 16;
      const h = 0.6 + rng() * 1.2;
      ctx.strokeStyle = `rgba(188,171,145,${0.05 + rng() * 0.15})`;
      ctx.lineWidth = h;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.5, y);
      ctx.bezierCurveTo(x - w * 0.1, y + (rng() - 0.5) * 3, x + w * 0.2, y + (rng() - 0.5) * 3, x + w * 0.5, y + (rng() - 0.5) * 2);
      ctx.stroke();
    }

    for (let i = 0; i < 18; i++) {
      const x = rng() * width;
      const y = rng() * height;
      const r = 3 + rng() * 11;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, "rgba(28,21,18,0.34)");
      gradient.addColorStop(0.55, "rgba(75,58,47,0.2)");
      gradient.addColorStop(1, "rgba(75,58,47,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1.6, 1.25);
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const bump = new THREE.CanvasTexture(bumpCanvas);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(1.6, 1.25);
    bump.anisotropy = map.anisotropy;

    return { map, bump };
  }

  const barkTextures = makeBarkTextures();

  const barkMaterial = new THREE.MeshStandardMaterial({
    map: barkTextures.map,
    bumpMap: barkTextures.bump,
    bumpScale: 0.018,
    color: 0xe0cbbd,
    roughness: 0.82,
    metalness: 0.0,
    emissive: new THREE.Color(0x32251c),
    emissiveIntensity: 0.52,
    dithering: true
  });
  attachWind(barkMaterial, {
    amplitude: 0.024,
    secondary: 0.012,
    depthAmp: 0.015,
    flutter: 0.0008,
    heightMin: 0.6,
    heightMax: 4.4
  });

  function buildTreeBlossomSpray(rng, variant) {
    const builder = new GeoBuilder();
    const blossomCenters = [];
    const petal = makePetalGeometry({
      length: 0.029,
      width: 0.027,
      segU: QUALITY.low ? 2 : 3,
      segV: QUALITY.low ? 4 : 5,
      notch: 0.22,
      cup: 0.0055,
      arch: 0.0016,
      ruffle: 0.06,
      tipRounding: 0.44,
      baseColor: variant % 2 === 0 ? 0xed9db7 : 0xf0abc0,
      edgeColor: 0xfff5f5,
      veinColor: 0xe8c1cf,
      veinStrength: 0.24,
      phase: rng() * 20
    });
    const centerGeometry = new THREE.SphereGeometry(
      0.0052,
      QUALITY.low ? 4 : 5,
      QUALITY.low ? 2 : 3,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    );
    centerGeometry.scale(1, 0.65, 1);
    paintGeometryY(centerGeometry, 0xac9a45, 0xe2c967, 0.5);

    const count = QUALITY.low ? 3 : 5;
    for (let f = 0; f < count; f++) {
      const azimuth = (f / count) * Math.PI * 2 + rngRange(rng, -0.45, 0.45);
      const radial = rngRange(rng, 0.028, 0.074);
      const floralPos = new THREE.Vector3(
        Math.sin(azimuth) * radial,
        rngRange(rng, 0.012, 0.055) + (f % 2) * 0.014,
        Math.cos(azimuth) * radial
      );
      const headQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rngRange(rng, -0.48, 0.48), rng() * Math.PI * 2, rngRange(rng, -0.4, 0.4), "YXZ")
      );
      const headMatrix = new THREE.Matrix4().compose(
        floralPos,
        headQuat,
        new THREE.Vector3(1, 1, 1).multiplyScalar(rngRange(rng, 0.86, 1.12))
      );
      blossomCenters.push(floralPos.clone());

      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + rngRange(rng, -0.11, 0.11);
        const pm = new THREE.Matrix4().copy(headMatrix).multiply(
          petalMatrix(angle, -0.16 + rngRange(rng, -0.08, 0.08), rngRange(rng, 0.92, 1.08), 0.002, 0.002)
        );
        builder.add(petal, pm, WHITE);
      }
      const centerMatrix = new THREE.Matrix4().copy(headMatrix).multiply(new THREE.Matrix4().makeTranslation(0, 0.005, 0));
      builder.add(centerGeometry, centerMatrix, WHITE);

      const stemEnd = floralPos.clone();
      const stemStart = new THREE.Vector3(
        Math.sin(azimuth) * radial * 0.25,
        Math.max(0.002, floralPos.y - 0.038),
        Math.cos(azimuth) * radial * 0.25
      );
      const stemMid = stemStart.clone().lerp(stemEnd, 0.5);
      stemMid.x += rngRange(rng, -0.012, 0.012);
      stemMid.y += 0.008;
      const pedicel = makeTubeGeometry([stemStart, stemMid, stemEnd], 0.0019, 0.001, 3, 0x775446, 0x6b5144, 3);
      if (pedicel) builder.add(pedicel, TMP_M1.identity(), WHITE);
    }

    const leafAngle = rng() * Math.PI * 2;
    const leafOrigin = new THREE.Vector3(Math.sin(leafAngle) * 0.045, 0.012, Math.cos(leafAngle) * 0.045);
    const leafQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15 + rng() * 0.3, leafAngle, rngRange(rng, -0.2, 0.2), "YXZ"));
    const leafMatrix = new THREE.Matrix4().compose(leafOrigin, leafQuat, new THREE.Vector3(0.42, 0.42, 0.42));
    builder.add(leafCache.sakuraLeaf[Math.floor(rng() * leafCache.sakuraLeaf.length)], leafMatrix, WHITE);

    const budAngle = rng() * Math.PI * 2;
    const bud = new THREE.SphereGeometry(0.009, 6, 4);
    paintGeometryY(bud, 0x6b7c4a, 0xdca7b6, 0.6);
    const budPos = new THREE.Vector3(Math.sin(budAngle) * 0.072, rngRange(rng, 0.008, 0.035), Math.cos(budAngle) * 0.072);
    builder.add(
      bud,
      new THREE.Matrix4().compose(budPos, new THREE.Quaternion(), new THREE.Vector3(0.8, 1.2, 0.8)),
      WHITE
    );

    return { geometry: builder.build(), blossoms: blossomCenters };
  }

  const treeBlossomSprays = [
    buildTreeBlossomSpray(mulberry32(5317), 0),
    buildTreeBlossomSpray(mulberry32(7949), 1)
  ];

  const treeDefs = [
    {
      x: -4.9,
      z: 2.5,
      scale: 1.15,
      seed: 8123,
      trunkHeight: 2.35,
      branchSpread: 1.05,
      primaryCount: 8,
      clusterShare: 0.62
    },
    {
      x: 8.0,
      z: -3.2,
      scale: 0.98,
      seed: 4481,
      trunkHeight: 2.0,
      branchSpread: 1.0,
      primaryCount: 7,
      clusterShare: 0.38
    }
  ];

  const cherryTrees = [];
  const totalTreeClusters = QUALITY.cherryClusters + QUALITY.extraBlossoms;

  for (let treeIndex = 0; treeIndex < treeDefs.length; treeIndex++) {
    const def = treeDefs[treeIndex];
    const rng = mulberry32(def.seed);
    const barkBuilder = new GeoBuilder(true);
    const anchors = [];
    const group = new THREE.Group();
    group.name = `cherry-tree-${treeIndex}`;
    group.position.set(def.x, terrainHeight(def.x, def.z) - 0.02, def.z);
    group.scale.setScalar(def.scale);

    const trunkHeight = def.trunkHeight;
    const trunkPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.045, trunkHeight * 0.28, -0.02),
      new THREE.Vector3(-0.05, trunkHeight * 0.6, 0.025),
      new THREE.Vector3(0.035, trunkHeight * 0.9, 0.01),
      new THREE.Vector3(0.02, trunkHeight, 0.02)
    ];
    const trunk = makeTubeGeometry(trunkPoints, 0.19, 0.095, 7, 0xffffff, 0xffffff, 14);
    if (trunk) barkBuilder.add(trunk, TMP_M1.identity(), WHITE);

    for (let r = 0; r < 5; r++) {
      const angle = rng() * Math.PI * 2;
      const rootStart = new THREE.Vector3(Math.sin(angle) * 0.04, 0.09, Math.cos(angle) * 0.04);
      const rootMid = new THREE.Vector3(Math.sin(angle) * 0.3, 0.03, Math.cos(angle) * 0.3);
      const rootEnd = new THREE.Vector3(Math.sin(angle) * 0.58, -0.03, Math.cos(angle) * 0.58);
      const root = makeTubeGeometry([rootStart, rootMid, rootEnd], 0.065, 0.015, 5, 0xffffff, 0xffffff, 6);
      if (root) barkBuilder.add(root, TMP_M1.identity(), WHITE);
    }

    function growBranch(start, direction, length, radius, depth) {
      const steps = depth >= 2 ? 5 : 4;
      const points = [start.clone()];
      const d = direction.clone().normalize();
      const p = start.clone();
      for (let i = 1; i <= steps; i++) {
        d.x += rngRange(rng, -0.32, 0.32) * (0.45 + depth * 0.12);
        d.z += rngRange(rng, -0.32, 0.32) * (0.45 + depth * 0.12);
        d.y += depth === 0 ? rngRange(rng, -0.11, 0.09) : rngRange(rng, -0.025, 0.13);
        if (depth > 0 && d.y < 0.12) d.y = 0.12;
        if (depth === 0 && d.y < -0.18) d.y = -0.18;
        d.normalize();
        p.addScaledVector(d, length / steps);
        points.push(p.clone());
      }

      const tube = makeTubeGeometry(points, radius, radius * (depth === 0 ? 0.28 : 0.52), depth >= 2 ? 5 : 4, 0xffffff, 0xffffff, 7);
      if (tube) barkBuilder.add(tube, TMP_M1.identity(), WHITE);

      if (depth > 0) {
        const childCount = depth === 3 ? 3 : 2;
        for (let c = 0; c < childCount; c++) {
          const t = depth === 3 ? 0.54 + (c / childCount) * 0.36 + rngRange(rng, -0.04, 0.04) : 0.68 + c * 0.24;
          const origin = pointOnPolyline(points, t);
          const childDir = d.clone();
          childDir.x += rngRange(rng, -0.55, 0.55);
          childDir.z += rngRange(rng, -0.55, 0.55);
          childDir.y += rngRange(rng, 0.03, 0.2);
          childDir.normalize();
          growBranch(
            origin,
            childDir,
            length * rngRange(rng, 0.55, 0.7),
            radius * rngRange(rng, 0.48, 0.63),
            depth - 1
          );
        }

        const shoulderCount = depth === 3 ? 1 : 2;
        for (let c = 0; c < shoulderCount; c++) {
          const t = 0.48 + c * 0.27 + rngRange(rng, -0.05, 0.05);
          const origin = pointOnPolyline(points, t);
          const scatter = 0.04 + rng() * 0.1;
          const angle = rng() * Math.PI * 2;
          origin.x += Math.cos(angle) * scatter;
          origin.y += rngRange(rng, -0.03, 0.06);
          origin.z += Math.sin(angle) * scatter;
          anchors.push(origin);
        }
      } else {
        const bloomCount = 5;
        for (let c = 0; c < bloomCount; c++) {
          const t = 0.16 + (c / (bloomCount - 1)) * 0.84;
          const origin = pointOnPolyline(points, t);
          const scatter = 0.045 + rng() * 0.105;
          const angle = rng() * Math.PI * 2;
          origin.x += Math.cos(angle) * scatter;
          origin.y += rngRange(rng, -0.035, 0.07);
          origin.z += Math.sin(angle) * scatter;
          anchors.push(origin);
        }
      }
    }

    const primaryAngles = [];
    for (let i = 0; i < def.primaryCount; i++) {
      primaryAngles.push((i / def.primaryCount) * Math.PI * 2 + rngRange(rng, -0.26, 0.26));
    }

    for (let b = 0; b < primaryAngles.length; b++) {
      const angle = primaryAngles[b];
      const startT = b === 0 ? 0.65 : 0.7 + rng() * 0.28;
      const start = pointOnPolyline(trunkPoints, startT);
      const elevation = rngRange(rng, 0.28, 0.62);
      const dir = new THREE.Vector3(
        Math.sin(angle) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(angle) * Math.cos(elevation)
      );
      growBranch(
        start,
        dir,
        rngRange(rng, 1.55, 2.25) * def.branchSpread,
        0.07 + rng() * 0.018,
        3
      );
    }

    const trunkGeometry = barkBuilder.build();
    const trunkMesh = new THREE.Mesh(trunkGeometry, barkMaterial);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    trunkMesh.name = `cherry-bark-${treeIndex}`;
    group.add(trunkMesh);

    const clusterTargetCount = Math.max(16, Math.round(totalTreeClusters * def.clusterShare));
    const buckets = [[], []];
    for (let i = 0; i < clusterTargetCount; i++) {
      const anchor = anchors.length ? anchors[Math.floor(rng() * anchors.length)] : new THREE.Vector3(0, trunkHeight, 0);
      const radius = rngRange(rng, 0.0, 0.17);
      const angle = rng() * Math.PI * 2;
      const localPos = new THREE.Vector3(
        anchor.x + Math.cos(angle) * radius,
        anchor.y + rngRange(rng, -0.05, 0.11),
        anchor.z + Math.sin(angle) * radius
      );
      const quaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rngRange(rng, -0.38, 0.38), rng() * Math.PI * 2, rngRange(rng, -0.35, 0.35), "YXZ")
      );
      const scale = rngRange(rng, 1.55, 2.55);
      const matrix = new THREE.Matrix4().compose(localPos, quaternion, new THREE.Vector3(scale, scale, scale));
      const bucket = rng() > 0.52 ? 0 : 1;
      buckets[bucket].push({ matrix, position: localPos.clone(), scale });
    }

    group.updateMatrixWorld(true);
    for (let variant = 0; variant < 2; variant++) {
      const bucket = buckets[variant];
      if (!bucket.length) continue;
      const spray = treeBlossomSprays[variant];
      const mesh = new THREE.InstancedMesh(spray.geometry, treeBlossomMaterial, bucket.length);
      mesh.name = `cherry-blossoms-${treeIndex}-${variant}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      const tint = new THREE.Color();
      for (let i = 0; i < bucket.length; i++) {
        const entry = bucket[i];
        mesh.setMatrixAt(i, entry.matrix);
        const lum = rngRange(rng, 0.92, 1.055);
        tint.setRGB(lum * 1.012, lum * 0.99, lum * 0.985);
        mesh.setColorAt(i, tint);

        for (const blossomCenter of spray.blossoms) {
          const world = blossomCenter.clone().applyMatrix4(entry.matrix).applyMatrix4(group.matrixWorld);
          flowerTargets.push({
            type: "sakura",
            position: world,
            radius: 0.075 * entry.scale * def.scale,
            yaw: rng() * Math.PI * 2
          });
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    }

    scene.add(group);
    cherryTrees.push({
      group,
      def,
      clusters: clusterTargetCount,
      anchors: anchors.length
    });
  }

  // Every individual bloom is a page in the collection.
  {
    const poems = window.GARDEN_POEMS || [];
    const poemCount = poems.length;
    if (poemCount > 0) {
      for (let i = 0; i < flowerTargets.length; i++) {
        flowerTargets[i].poemIndex = (i * 19 + 7) % poemCount;
        flowerTargets[i].flowerIndex = i + 1;
      }
    }
  }

  // A quiet carpet of fallen cherry petals.
  {
    const rng = mulberry32(7741);
    const petalGeometry = makePetalGeometry({
      length: 0.023,
      width: 0.021,
      segU: 3,
      segV: 4,
      notch: 0.16,
      cup: 0.0022,
      arch: 0.001,
      ruffle: 0.1,
      tipRounding: 0.4,
      baseColor: 0xefbdcb,
      edgeColor: 0xfbf1ed,
      veinColor: 0xf1d7df,
      veinStrength: 0.1,
      phase: 2.4
    });
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.72,
      metalness: 0,
      color: 0xffffff
    });
    const count = QUALITY.low ? 130 : 300;
    const mesh = new THREE.InstancedMesh(petalGeometry, material, count);
    mesh.name = "fallen-petals";
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const treeBase = treeDefs[0];
    const second = treeDefs[1];
    for (let i = 0; i < count; i++) {
      const tree = i % 5 === 0 ? second : treeBase;
      const angle = rng() * Math.PI * 2;
      const radius = Math.pow(rng(), 0.56) * 4.8;
      let x = tree.x + Math.cos(angle) * radius;
      let z = tree.z + Math.sin(angle) * radius;
      if (isInWater(x, z, 0.1)) {
        x += 1.4;
        z += 0.7;
      }
      const y = terrainHeight(x, z) + 0.005 + rng() * 0.005;
      const quat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rngRange(rng, -0.22, 0.22), rng() * Math.PI * 2, rngRange(rng, -0.22, 0.22), "YXZ")
      );
      const s = rngRange(rng, 0.5, 0.95);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  /* ---------- 15. Grass, reeds and green shrubs ---------- */

  function makeGrassBladeGeometry(rng, options) {
    const height = options.height;
    const width = options.width;
    const leanX = options.leanX;
    const leanZ = options.leanZ;
    const bend = options.bend;
    const segments = 5;
    const base = makeColor(options.baseColor);
    const mid = makeColor(options.midColor);
    const tip = makeColor(options.tipColor);
    const positions = [];
    const colors = [];
    const indices = [];
    const color = new THREE.Color();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const curve = Math.pow(t, 1.46);
      const x = leanX * curve + Math.sin(t * 3.7 + options.phase) * bend * t * t;
      const z = leanZ * curve + Math.cos(t * 2.9 + options.phase) * bend * 0.7 * t * t;
      const y = height * t;
      const widthHere = width * (1 - Math.pow(t, 1.3) * 0.92) * (0.72 + 0.28 * Math.sin(t * 5.2 + options.phase));
      const sideX = -Math.sin(options.yaw);
      const sideZ = Math.cos(options.yaw);
      positions.push(x - sideX * widthHere * 0.5, y, z - sideZ * widthHere * 0.5);
      positions.push(x + sideX * widthHere * 0.5, y, z + sideZ * widthHere * 0.5);
      color.copy(base).lerp(mid, smoothstep(0, 0.64, t)).lerp(tip, smoothstep(0.58, 1, t));
      const mottle = 0.94 + 0.06 * Math.sin(t * 17 + options.phase);
      color.multiplyScalar(mottle);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function buildGrassTuft(seed, bladeCount, tallness) {
    const rng = mulberry32(seed);
    const builder = new GeoBuilder();
    for (let b = 0; b < bladeCount; b++) {
      const yaw = (b / bladeCount) * Math.PI * 2 + rngRange(rng, -0.62, 0.62);
      const bladeHeight = rngRange(rng, 0.1, 0.29) * tallness;
      const lean = rngRange(rng, 0.02, 0.1) * tallness;
      const blade = makeGrassBladeGeometry(rng, {
        height: bladeHeight,
        width: rngRange(rng, 0.0058, 0.0102),
        leanX: Math.sin(yaw) * lean,
        leanZ: Math.cos(yaw) * lean,
        bend: rngRange(rng, 0.008, 0.032),
        yaw,
        phase: rng() * 20,
        baseColor: rng() < 0.16 ? 0x70723f : 0x405b32,
        midColor: rng() < 0.12 ? 0xa2a45a : 0x6e9448,
        tipColor: rng() < 0.1 ? 0xc2b66c : 0xaec36f
      });
      const matrix = new THREE.Matrix4().makeTranslation(
        rngRange(rng, -0.025, 0.025),
        0.002,
        rngRange(rng, -0.025, 0.025)
      );
      builder.add(blade, matrix, WHITE);
    }
    return builder.build();
  }

  const grassTuftGeometries = [
    buildGrassTuft(6101, 3, 0.88),
    buildGrassTuft(6203, 4, 1.0),
    buildGrassTuft(6311, 4, 1.18)
  ];

  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.86,
    metalness: 0.0,
    dithering: true
  });
  grassMaterial.shadowSide = THREE.DoubleSide;
  attachWind(grassMaterial, {
    amplitude: 0.043,
    secondary: 0.022,
    depthAmp: 0.03,
    flutter: 0.0016,
    heightMin: 0.008,
    heightMax: 0.22
  });

  const grassGroup = new THREE.Group();
  grassGroup.name = "wild-grass";
  scene.add(grassGroup);

  {
    const rng = mulberry32(8107);
    const count = QUALITY.grass;
    const buckets = [[], [], []];
    let guard = 0;
    while (buckets[0].length + buckets[1].length + buckets[2].length < count && guard < count * 80) {
      guard++;
      const near = rng() < 0.72;
      let x;
      let z;
      if (near) {
        x = rngRange(rng, -23, 23);
        z = rngRange(rng, -27, 12);
      } else {
        x = rngRange(rng, -40, 40);
        z = rngRange(rng, -47, -13);
      }
      if (streamDistance(x, z) < streamHalfWidth(z) * 1.5 + 0.14) continue;
      if (Math.hypot(x - cameraState.baseX, z - cameraState.baseZ) < 0.48) continue;
      const variant = Math.floor(rng() * buckets.length);
      buckets[variant].push({
        x,
        z,
        scale: rngRange(rng, 0.62, 1.44) * (near ? 1 : 1.1),
        rotation: rng() * Math.PI * 2,
        tint: rngRange(rng, 0.82, 1.06)
      });
    }

    const framingTufts = [
      { x: -2.75, z: 4.7, scale: 2.45, rotation: 0.4 },
      { x: 2.85, z: 4.35, scale: 2.6, rotation: 2.5 },
      { x: -1.35, z: 5.75, scale: 1.9, rotation: 5.1 },
      { x: 1.65, z: 5.6, scale: 2.15, rotation: 3.7 },
      { x: -4.1, z: 2.9, scale: 2.5, rotation: 1.8 },
      { x: 4.35, z: 2.3, scale: 2.25, rotation: 4.9 },
      { x: -0.55, z: 4.1, scale: 1.75, rotation: 2.9 },
      { x: 3.8, z: 6.1, scale: 2.0, rotation: 0.9 },
      { x: -1.18, z: 6.82, scale: 2.8, rotation: 2.2 },
      { x: 1.38, z: 6.95, scale: 2.45, rotation: 4.6 }
    ];
    for (let i = 0; i < framingTufts.length; i++) {
      const entry = framingTufts[i];
      if (isInWater(entry.x, entry.z, -0.1)) continue;
      buckets[2].push({
        x: entry.x,
        z: entry.z,
        scale: entry.scale,
        rotation: entry.rotation,
        tint: 0.9 + rng() * 0.12
      });
    }

    const rotationQuat = new THREE.Quaternion();
    const matrix = new THREE.Matrix4();
    const scaleVec = new THREE.Vector3();
    const position = new THREE.Vector3();
    const color = new THREE.Color();

    for (let v = 0; v < buckets.length; v++) {
      const entries = buckets[v];
      if (!entries.length) continue;
      const mesh = new THREE.InstancedMesh(grassTuftGeometries[v], grassMaterial, entries.length);
      mesh.name = `grass-${v}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const y = terrainHeight(entry.x, entry.z) - 0.012;
        rotationQuat.setFromAxisAngle(Y_AXIS, entry.rotation);
        scaleVec.set(entry.scale, entry.scale * rngRange(rng, 0.86, 1.14), entry.scale);
        position.set(entry.x, y, entry.z);
        matrix.compose(position, rotationQuat, scaleVec);
        mesh.setMatrixAt(i, matrix);
        color.setRGB(entry.tint * 0.98, entry.tint, entry.tint * 0.94);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      grassGroup.add(mesh);
    }
  }

  // Slender reeds keep the stream edges alive.
  function buildReedTuft(seed) {
    const rng = mulberry32(seed);
    const builder = new GeoBuilder();
    const stemCount = 7;
    for (let s = 0; s < stemCount; s++) {
      const yaw = (s / stemCount) * Math.PI * 2 + rngRange(rng, -0.4, 0.4);
      const h = rngRange(rng, 0.36, 0.85);
      const lean = rngRange(rng, 0.03, 0.16);
      const base = new THREE.Vector3(Math.sin(yaw) * 0.025, 0, Math.cos(yaw) * 0.025);
      const mid = new THREE.Vector3(
        base.x + Math.sin(yaw) * lean * 0.5 + rngRange(rng, -0.02, 0.02),
        h * 0.52,
        base.z + Math.cos(yaw) * lean * 0.5 + rngRange(rng, -0.02, 0.02)
      );
      const top = new THREE.Vector3(
        base.x + Math.sin(yaw) * lean,
        h,
        base.z + Math.cos(yaw) * lean
      );
      builder.addTube([base, mid, top], 0.0017, 0.0008, 3, 0x5e6d3d, 0x8d9d5c, 4);
      if (rng() < 0.72) {
        const seedHead = new THREE.SphereGeometry(rngRange(rng, 0.006, 0.011), 6, 4);
        paintGeometryY(seedHead, 0x514332, 0x9b895e, 0.45);
        seedHead.scale(0.78, 2.2, 0.78);
        builder.add(seedHead, new THREE.Matrix4().makeTranslation(top.x, top.y + 0.022, top.z), WHITE);
      }
      const blade = makeGrassBladeGeometry(rng, {
        height: h * rngRange(rng, 0.82, 1.08),
        width: rngRange(rng, 0.0038, 0.0065),
        leanX: Math.sin(yaw + 0.8) * lean * 1.8,
        leanZ: Math.cos(yaw + 0.8) * lean * 1.8,
        bend: rngRange(rng, 0.025, 0.07),
        yaw: yaw + rngRange(rng, -0.6, 0.6),
        phase: rng() * 20,
        baseColor: 0x4b6036,
        midColor: 0x879d53,
        tipColor: 0xafb975
      });
      builder.add(blade, TMP_M1.identity(), WHITE);
    }
    return builder.build();
  }

  const reedMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.84,
    metalness: 0,
    dithering: true
  });
  reedMaterial.shadowSide = THREE.DoubleSide;
  attachWind(reedMaterial, {
    amplitude: 0.055,
    secondary: 0.022,
    depthAmp: 0.032,
    flutter: 0.0016,
    heightMin: 0.01,
    heightMax: 0.72
  });

  {
    const reedGeometry = buildReedTuft(9511);
    const rng = mulberry32(5517);
    const count = QUALITY.low ? 68 : 145;
    const mesh = new THREE.InstancedMesh(reedGeometry, reedMaterial, count);
    mesh.name = "stream-reeds";
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let placed = 0;
    let guard = 0;
    const color = new THREE.Color();
    while (placed < count && guard < count * 180) {
      guard++;
      const z = rngRange(rng, -38, -4);
      const side = rng() > 0.5 ? 1 : -1;
      const half = streamHalfWidth(z) * 1.6;
      const x = streamCenterX(z) + side * (half + rngRange(rng, 0.06, 1.05));
      if (Math.hypot(x - cameraState.baseX, z - cameraState.baseZ) < 3.5) continue;
      quat.setFromAxisAngle(Y_AXIS, rng() * Math.PI * 2);
      const s = rngRange(rng, 0.85, 1.8);
      scale.set(s, s * rngRange(rng, 0.8, 1.2), s);
      matrix.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.01, z), quat, scale);
      mesh.setMatrixAt(placed, matrix);
      color.setRGB(rngRange(rng, 0.84, 1.03), rngRange(rng, 0.89, 1.04), rngRange(rng, 0.8, 0.96));
      mesh.setColorAt(placed, color);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }

  // A dense, low ribbon of bank grass hides the stream's geometry and roots it in the meadow.
  {
    const rng = mulberry32(5563);
    const count = QUALITY.low ? 320 : 680;
    const buckets = [[], [], []];
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 30) {
      guard++;
      const z = rngRange(rng, -48, 10);
      const side = rng() > 0.5 ? 1 : -1;
      const center = streamCenterX(z);
      const waterY = streamSurfaceY(z);
      activeLoop: {
        let low = 0;
        let high = streamHalfWidth(z) * 3.6;
        if (terrainHeight(center + side * high, z) <= waterY + 0.01) break activeLoop;
        for (let i = 0; i < 11; i++) {
          const mid = (low + high) * 0.5;
          if (terrainHeight(center + side * mid, z) > waterY + 0.01) high = mid;
          else low = mid;
        }
        const shoreDistance = high;
        const x = center + side * (shoreDistance + rngRange(rng, -0.02, 1.1));
        if (x < -30 || x > 30) break activeLoop;
        if (Math.hypot(x - cameraState.baseX, z - cameraState.baseZ) < 2.1) break activeLoop;
        const y = terrainHeight(x, z);
        if (y < waterY - 0.08) break activeLoop;
        buckets[Math.floor(rng() * 3)].push({
          x,
          z,
          scale: rngRange(rng, 1.25, 2.75),
          rotation: rng() * Math.PI * 2,
          tint: rngRange(rng, 0.82, 1.06)
        });
        placed++;
      }
    }
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scaleVector = new THREE.Vector3();
    const position = new THREE.Vector3();
    const tintColor = new THREE.Color();
    for (let v = 0; v < 3; v++) {
      if (!buckets[v].length) continue;
      const mesh = new THREE.InstancedMesh(grassTuftGeometries[v], grassMaterial, buckets[v].length);
      mesh.name = `bank-grass-${v}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      for (let i = 0; i < buckets[v].length; i++) {
        const entry = buckets[v][i];
        quat.setFromAxisAngle(Y_AXIS, entry.rotation);
        scaleVector.set(entry.scale, entry.scale * rngRange(rng, 0.86, 1.16), entry.scale);
        position.set(entry.x, terrainHeight(entry.x, entry.z) - 0.01, entry.z);
        matrix.compose(position, quat, scaleVector);
        mesh.setMatrixAt(i, matrix);
        tintColor.setRGB(entry.tint * 0.97, entry.tint, entry.tint * 0.9);
        mesh.setColorAt(i, tintColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      grassGroup.add(mesh);
    }
  }

  // Soft young bushes for the middle distance.
  function buildShrubGeometry(seed, variant) {
    const rng = mulberry32(seed);
    const builder = new GeoBuilder();
    const branches = 6 + (variant % 3);
    for (let b = 0; b < branches; b++) {
      const yaw = (b / branches) * Math.PI * 2 + rngRange(rng, -0.4, 0.4);
      const height = rngRange(rng, 0.45, 1.04);
      const reach = rngRange(rng, 0.24, 0.68);
      const base = new THREE.Vector3(rngRange(rng, -0.07, 0.07), 0, rngRange(rng, -0.07, 0.07));
      const mid = new THREE.Vector3(
        base.x + Math.sin(yaw) * reach * 0.38,
        height * 0.54,
        base.z + Math.cos(yaw) * reach * 0.38
      );
      const top = new THREE.Vector3(
        base.x + Math.sin(yaw) * reach,
        height,
        base.z + Math.cos(yaw) * reach
      );
      builder.addTube([base, mid, top], 0.011, 0.003, 4, 0x4e5137, 0x687443, 6);
      const leafGeo = leafCache.shrub || leafCache.daisy;
      const leafCount = 6 + Math.floor(rng() * 4);
      for (let l = 0; l < leafCount; l++) {
        const t = rngRange(rng, 0.25, 1);
        const node = pointOnPolyline([base, mid, top], t);
        const leafYaw = yaw + rngRange(rng, -2.1, 2.1);
        addLeafAssembly(builder, {
          origin: node.clone().add(new THREE.Vector3(Math.sin(leafYaw) * 0.026, rngRange(rng, 0.004, 0.04), Math.cos(leafYaw) * 0.026)),
          yaw: leafYaw,
          pitch: -0.2 + rngRange(rng, -0.5, 0.25),
          roll: rngRange(rng, -0.3, 0.3),
          scale: rngRange(rng, 0.75, 1.25),
          geometry: leafGeo[Math.floor(rng() * leafGeo.length)]
        });
      }
    }
    return builder.build();
  }

  {
    // A more delicate, rounded leaf for loose spring shrubs.
    const shrubLeaf = [];
    for (let i = 0; i < 3; i++) {
      shrubLeaf.push(
        makeLeafGeometry({
          length: 0.064 + i * 0.008,
          width: 0.026 + i * 0.003,
          segU: 4,
          segV: 7,
          curl: 0.16,
          fold: 0.22,
          serration: 0.2,
          baseColor: 0x36522e,
          tipColor: 0x77994f,
          veinColor: 0x9cb371,
          veinStrength: 0.2,
          phase: i * 3.1
        })
      );
    }
    leafCache.shrub = shrubLeaf;
    const shrubGeometries = [
      buildShrubGeometry(7491, 0),
      buildShrubGeometry(7583, 1),
      buildShrubGeometry(7667, 2)
    ];
    const bushMaterial = glossyFoliageMaterial;
    const positions = [
      [-4.2, -7.0, 1.75],
      [4.2, -10.0, 1.6],
      [-6.0, -14.0, 1.95],
      [8.0, -7.5, 1.5],
      [-8.3, -3.8, 0.95],
      [-6.6, -9.8, 1.15],
      [9.1, -7.2, 0.82],
      [6.8, -13.2, 1.25],
      [-10.4, -16.2, 1.05],
      [-3.0, -24.0, 1.3],
      [4.2, -25.5, 1.2],
      [12.4, -17.8, 1.12],
      [-15.7, -28.5, 1.1],
      [1.4, -33.0, 1.0],
      [-12.0, -8.4, 0.88],
      [14.4, -10.0, 0.92],
      [-18.2, -15.0, 0.9],
      [18.0, -24.0, 1.12],
      [0.5, -31.0, 0.9],
      [-24.0, -29.0, 1.0],
      [24.0, -32.0, 1.2],
      [9.0, -30.0, 1.0],
      [-11.0, -7.8, 2.2],
      [15.0, -20.0, 2.4],
      [-16.5, -18.0, 2.7],
      [-19.0, -40.0, 2.1],
      [-7.0, -45.0, 1.7],
      [7.5, -40.0, 1.9],
      [18.5, -43.0, 2.3],
      [29.0, -51.0, 2.4],
      [-29.0, -55.0, 2.6],
      [-14.0, -60.0, 1.8],
      [2.5, -58.0, 2.0],
      [15.0, -62.0, 2.5],
      [-4.5, -72.0, 2.8],
      [-23.0, -78.0, 3.0],
      [24.0, -82.0, 3.1],
      [10.0, -88.0, 2.7],
      [-36.0, -67.0, 2.6],
      [38.0, -71.0, 2.8]
    ];
    const placements = QUALITY.low ? positions.slice(0, 12).concat(positions.slice(18, 24)) : positions;
    const rng = mulberry32(3177);
    const bucketGeom = new Map();
    for (const [x, z, s] of placements) {
      if (streamDistance(x, z) < streamHalfWidth(z) * 1.2 + 0.6) continue;
      const index = Math.floor(rng() * shrubGeometries.length);
      if (!bucketGeom.has(index)) bucketGeom.set(index, []);
      bucketGeom.get(index).push({ x, z, s, rotation: rng() * Math.PI * 2 });
    }
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (const [index, entries] of bucketGeom.entries()) {
      const mesh = new THREE.InstancedMesh(shrubGeometries[index], bushMaterial, entries.length);
      mesh.name = `spring-shrub-${index}`;
      mesh.castShadow = !QUALITY.low;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      entries.forEach((entry, i) => {
        quaternion.setFromAxisAngle(Y_AXIS, entry.rotation);
        const s = entry.s * rngRange(rng, 0.82, 1.16);
        scale.set(s, s, s);
        matrix.compose(
          new THREE.Vector3(entry.x, terrainHeight(entry.x, entry.z) - 0.015, entry.z),
          quaternion,
          scale
        );
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    }
  }

  /* ---------- 16. The stream ---------- */

  const waterUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: sunDirection },
    uMoonDir: { value: moonDirection },
    uSunColor: { value: new THREE.Color(0xffe2b3) },
    uMoonColor: { value: new THREE.Color(0xdde8ff) },
    uSkyColor: { value: new THREE.Color(0x9ab8cb) },
    uHorizonColor: { value: new THREE.Color(0xe3dfd0) },
    uWaterColor: { value: new THREE.Color(0x213b38) },
    uFogColor: { value: new THREE.Color(0xb8c1af) },
    uFogDensity: { value: 0.005 },
    uSunStrength: { value: 0.8 },
    uMoonStrength: { value: 0.0 },
    uOpacity: { value: 0.9 }
  };

  const waterVertexShader = `
    precision highp float;
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vec3 p = position;
      float edge = sin(clamp(uv.x, 0.0, 1.0) * 3.14159265);
      p.y += (
        sin(uv.y * 28.0 - uTime * 0.34 + uv.x * 9.0) * 0.0022 +
        sin(uv.y * 62.0 + uTime * 0.22 + uv.x * 4.0) * 0.0012
      ) * edge;
      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorldPosition = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;

  const waterFragmentShader = `
    precision highp float;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uSunColor;
    uniform vec3 uMoonColor;
    uniform vec3 uSkyColor;
    uniform vec3 uHorizonColor;
    uniform vec3 uWaterColor;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform float uSunStrength;
    uniform float uMoonStrength;
    uniform float uOpacity;

    float hash21(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    void main() {
      float n1 = noise(vec2(vUv.x * 10.0 + sin(vUv.y * 2.3 + uTime * 0.08) * 0.45, vUv.y * 74.0 - uTime * 0.27));
      float n2 = noise(vec2(vUv.x * 22.0 + 3.3, vUv.y * 136.0 - uTime * 0.4));
      float n3 = noise(vec2(vUv.x * 41.0, vUv.y * 220.0 + uTime * 0.17));
      vec3 normal = normalize(vec3((n1 - n2) * 0.18 + (n3 - 0.5) * 0.025, 1.0, (n2 - n1) * 0.14));
      vec3 viewVector = normalize(cameraPosition - vWorldPosition);
      float facing = clamp(dot(normal, viewVector), 0.0, 1.0);
      float fresnel = pow(1.0 - facing, 3.2);
      vec3 reflected = reflect(-viewVector, normal);
      float reflectionHeight = clamp(reflected.y, 0.0, 1.0);
      vec3 skyReflection = mix(uHorizonColor, uSkyColor, pow(reflectionHeight, 0.62));
      skyReflection *= 0.42;
      vec3 color = mix(uWaterColor, skyReflection, clamp(0.05 + fresnel * 0.25, 0.0, 0.32));

      float sunGlint = pow(max(dot(reflected, normalize(uSunDir)), 0.0), 140.0);
      float sunBroad = pow(max(dot(reflected, normalize(uSunDir)), 0.0), 26.0);
      float moonGlint = pow(max(dot(reflected, normalize(uMoonDir)), 0.0), 110.0);
      color += uSunColor * (sunGlint * 2.0 + sunBroad * 0.035) * uSunStrength;
      color += uMoonColor * moonGlint * 1.45 * uMoonStrength;

      float edgeDistance = min(vUv.x, 1.0 - vUv.x);
      float shoreShade = 1.0 - smoothstep(0.02, 0.3, edgeDistance);
      color *= 1.0 - shoreShade * 0.46;
      color = mix(color, uWaterColor * 0.5, smoothstep(0.32, 0.0, edgeDistance) * 0.22);

      float sparkle = smoothstep(0.94, 0.985, noise(vec2(vUv.x * 70.0, vUv.y * 390.0 - uTime * 0.16)));
      color += vec3(0.58, 0.68, 0.61) * sparkle * (0.006 + fresnel * 0.02);

      float foamEdge = smoothstep(0.0, 0.055, vUv.x) * smoothstep(1.0, 0.945, vUv.x);
      float foam = smoothstep(0.78, 0.95, noise(vec2(vUv.x * 36.0, vUv.y * 130.0 - uTime * 0.1)));
      foam *= (1.0 - smoothstep(0.02, 0.12, edgeDistance)) * 0.06;
      color = mix(color, vec3(0.44, 0.5, 0.45), foam);

      float distanceToCamera = length(cameraPosition - vWorldPosition);
      float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * distanceToCamera * distanceToCamera);
      color = mix(color, uFogColor, fogFactor);

      float alpha = uOpacity * foamEdge * (1.0 - smoothstep(0.7, 1.0, fogFactor) * 0.3);
      gl_FragColor = vec4(color, alpha);
    }
  `;

  {
    const positions = [];
    const uvs = [];
    const indices = [];
    const zStart = 20;
    const zEnd = -132;
    const rows = 200;
    const columns = 6;
    let distanceAlong = 0;
    let lastZ = zStart;
    let lastX = streamCenterX(zStart);

    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const z = lerp(zStart, zEnd, t);
      const center = streamCenterX(z);
      const half = streamHalfWidth(z) * 1.34;
      const nextX = streamCenterX(z - 0.3);
      const prevX = streamCenterX(z + 0.3);
      const tangentX = nextX - prevX;
      const tangentZ = -0.6;
      const length = Math.hypot(tangentX, tangentZ) || 1;
      const sideX = -tangentZ / length;
      const sideZ = tangentX / length;

      if (i > 0) distanceAlong += Math.hypot(center - lastX, z - lastZ);
      lastX = center;
      lastZ = z;

      for (let j = 0; j <= columns; j++) {
        const u = j / columns;
        const offset = (u - 0.5) * 2 * half;
        positions.push(
          center + sideX * offset,
          streamSurfaceY(z),
          z + sideZ * offset
        );
        uvs.push(u, distanceAlong / 7.0);
      }

      if (i > 0) {
        const row = i;
        for (let j = 0; j < columns; j++) {
          const a = (row - 1) * (columns + 1) + j;
          const b = a + 1;
          const c = row * (columns + 1) + j;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }

    const waterGeometry = new THREE.BufferGeometry();
    waterGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    waterGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    waterGeometry.setIndex(indices);
    waterGeometry.computeVertexNormals();
    waterGeometry.computeBoundingSphere();

    const waterMaterial = new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false
    });

    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.name = "winding-stream";
    water.renderOrder = 2;
    water.receiveShadow = false;
    scene.add(water);
  }

  /* ---------- 17. Stone textures & stream stones ---------- */

  function makeStoneTextures() {
    const size = 256;
    const canvas = document.createElement("canvas");
    const bumpCanvas = document.createElement("canvas");
    canvas.width = bumpCanvas.width = size;
    canvas.height = bumpCanvas.height = size;
    const ctx = canvas.getContext("2d");
    const bctx = bumpCanvas.getContext("2d");
    const rng = mulberry32(8819);
    const img = ctx.createImageData(size, size);
    const bimg = bctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x * 0.055 + 2.2, y * 0.055 - 1.4, 4);
        const fine = valueNoise(x * 0.3 + 1.4, y * 0.3 + 3.1);
        const grain = (hash2(x * 1.9, y * 2.7) - 0.5) * 22;
        const base = 87 + n * 55 + fine * 22 + grain;
        const idx = (y * size + x) * 4;
        img.data[idx] = clamp(base * 1.03, 0, 255);
        img.data[idx + 1] = clamp(base * 0.97, 0, 255);
        img.data[idx + 2] = clamp(base * 0.88, 0, 255);
        img.data[idx + 3] = 255;
        bimg.data[idx] = bimg.data[idx + 1] = bimg.data[idx + 2] = clamp(80 + n * 120 + fine * 46, 0, 255);
        bimg.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    bctx.putImageData(bimg, 0, 0);
    for (let i = 0; i < 22; i++) {
      const x = rng() * size;
      const y = rng() * size;
      ctx.strokeStyle = `rgba(46,45,38,${0.06 + rng() * 0.12})`;
      bctx.strokeStyle = `rgba(30,30,30,${0.1 + rng() * 0.14})`;
      ctx.lineWidth = 0.7 + rng() * 1.4;
      bctx.lineWidth = ctx.lineWidth;
      ctx.beginPath();
      bctx.beginPath();
      let px = x;
      let py = y;
      ctx.moveTo(px, py);
      bctx.moveTo(px, py);
      for (let s = 0; s < 4; s++) {
        px += (rng() - 0.5) * 34;
        py += (rng() - 0.5) * 34;
        ctx.lineTo(px, py);
        bctx.lineTo(px, py);
      }
      ctx.stroke();
      bctx.stroke();
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1.2, 1.2);
    map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const bump = new THREE.CanvasTexture(bumpCanvas);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(1.2, 1.2);
    return { map, bump };
  }

  const stoneTextures = makeStoneTextures();

  function makeStoneGeometry(seed, variant) {
    const rng = mulberry32(seed);
    const geometry = new THREE.IcosahedronGeometry(1, 3);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    const v = new THREE.Vector3();
    const low = new THREE.Color(variant === 1 ? 0x7e7869 : 0x8d8577);
    const high = new THREE.Color(variant === 2 ? 0xb0aea2 : 0xb3a996);
    const moss = new THREE.Color(0x829560);
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i);
      const n = fbm(v.x * 1.8 + seed * 0.01, v.z * 1.8 - v.y * 0.8, 3);
      const n2 = valueNoise(v.x * 5.4 + 3.1, v.z * 5.4 + v.y * 2.2);
      const radius = 1 + (n - 0.5) * 0.48 + (n2 - 0.5) * 0.14;
      v.multiplyScalar(radius);
      v.y = v.y * 0.66 + 0.18;
      positions.setXYZ(i, v.x, v.y, v.z);
      color.copy(low).lerp(high, clamp(n * 1.15 + n2 * 0.22, 0, 1));
      const mossy = smoothstep(0.15, 1.0, v.y) * smoothstep(0.42, 0.68, n2) * 0.7;
      color.lerp(moss, mossy);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  const stoneGeometries = [makeStoneGeometry(3111, 0), makeStoneGeometry(3227, 1), makeStoneGeometry(3391, 2)];
  const stoneMaterial = new THREE.MeshStandardMaterial({
    map: stoneTextures.map,
    bumpMap: stoneTextures.bump,
    bumpScale: 0.035,
    vertexColors: true,
    color: new THREE.Color(1.12, 1.1, 1.04),
    roughness: 0.58,
    metalness: 0.0,
    dithering: true
  });

  {
    const rng = mulberry32(2119);
    const data = [[], [], []];
    const count = QUALITY.low ? 44 : 92;
    let guard = 0;
    while (data[0].length + data[1].length + data[2].length < count && guard < count * 30) {
      guard++;
      const z = rngRange(rng, -44, -2);
      const half = streamHalfWidth(z) * 1.6;
      const inWater = rng() < 0.56;
      const side = rng() > 0.5 ? 1 : -1;
      let x;
      let y;
      let scale;
      if (inWater) {
        const lateral = rngRange(rng, 0.08, 0.92) * half;
        x = streamCenterX(z) + side * lateral;
        scale = rngRange(rng, 0.06, 0.24);
        y = streamSurfaceY(z) - 0.03;
      } else {
        x = streamCenterX(z) + side * (half + rngRange(rng, 0.02, 0.9));
        scale = rngRange(rng, 0.05, 0.2);
        y = terrainHeight(x, z) + scale * 0.08;
      }
      if (Math.abs(x) > 30) continue;
      const variant = Math.floor(rng() * 3);
      data[variant].push({
        x,
        y,
        z,
        scale,
        rotation: rng() * Math.PI * 2,
        tilt: rngRange(rng, -0.12, 0.12),
        tint: rngRange(rng, 0.78, 1.12),
        inWater
      });
    }

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    const tintColor = new THREE.Color();
    for (let v = 0; v < 3; v++) {
      if (!data[v].length) continue;
      const mesh = new THREE.InstancedMesh(stoneGeometries[v], stoneMaterial, data[v].length);
      mesh.name = `stream-stones-${v}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      for (let i = 0; i < data[v].length; i++) {
        const entry = data[v][i];
        quat.setFromEuler(new THREE.Euler(entry.tilt, entry.rotation, entry.tilt * 0.4, "YXZ"));
        scaleVec.set(entry.scale * rngRange(rng, 0.8, 1.25), entry.scale * rngRange(rng, 0.55, 0.9), entry.scale * rngRange(rng, 0.8, 1.2));
        matrix.compose(new THREE.Vector3(entry.x, entry.y, entry.z), quat, scaleVec);
        mesh.setMatrixAt(i, matrix);
        tintColor.setRGB(entry.tint, entry.tint * 0.99, entry.tint * 0.93);
        mesh.setColorAt(i, tintColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
    }

    // Fine gravel and a few foreground stones.
    const gravelRng = mulberry32(9911);
    const gravelCount = QUALITY.low ? 80 : 190;
    const gravelMesh = new THREE.InstancedMesh(stoneGeometries[2], stoneMaterial, gravelCount);
    gravelMesh.name = "meadow-pebbles";
    gravelMesh.castShadow = false;
    gravelMesh.receiveShadow = true;
    gravelMesh.frustumCulled = false;
    let placed = 0;
    guard = 0;
    while (placed < gravelCount && guard < gravelCount * 30) {
      guard++;
      const z = gravelRng() < 0.7 ? gravelRng() * 15 - 13 : gravelRng() * 40 - 40;
      const x = rngRange(gravelRng, -18, 18);
      if (isInWater(x, z, 0.12)) continue;
      if (Math.hypot(x - cameraState.baseX, z - cameraState.baseZ) < 1.1) continue;
      const s = rngRange(gravelRng, 0.018, 0.065);
      quat.setFromEuler(new THREE.Euler(rngRange(gravelRng, -0.3, 0.3), gravelRng() * 6.283, rngRange(gravelRng, -0.3, 0.3), "YXZ"));
      scaleVec.set(s, s * 0.55, s);
      matrix.compose(new THREE.Vector3(x, terrainHeight(x, z) + s * 0.12, z), quat, scaleVec);
      gravelMesh.setMatrixAt(placed, matrix);
      tintColor.setRGB(0.8, 0.79, 0.73);
      gravelMesh.setColorAt(placed, tintColor);
      placed++;
    }
    gravelMesh.count = placed;
    gravelMesh.instanceMatrix.needsUpdate = true;
    if (gravelMesh.instanceColor) gravelMesh.instanceColor.needsUpdate = true;
    scene.add(gravelMesh);

    const boulderRng = mulberry32(9923);
    const boulderPositions = [
      [-0.2, -11.8, 0.38],
      [1.2, -24.0, 0.52],
      [-1.4, -34.5, 0.33],
      [6.8, -18.0, 0.3],
      [-7.2, -24.8, 0.44]
    ];
    for (const [xOffset, z, size] of boulderPositions) {
      const x = streamCenterX(z) + xOffset;
      const mesh = new THREE.Mesh(stoneGeometries[0], stoneMaterial);
      mesh.name = "stream-boulder";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(x, streamSurfaceY(z) - 0.11, z);
      mesh.rotation.set(boulderRng() * 0.2, boulderRng() * 6.283, boulderRng() * 0.2, "YXZ");
      mesh.scale.set(size * 1.25, size * 0.7, size);
      scene.add(mesh);
    }
  }

  /* ---------- 18. Layered mountains ---------- */

  function makeMountainTexture() {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    const seed = 317;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const broad = tileableFbm(u, v, 4, 4, seed);
        const fine = tileableFbm(u, v, 3, 24, seed + 29);
        const cracks = Math.pow(Math.abs(Math.sin((u * 11.0 + broad * 3.0) * Math.PI)), 22) * 0.18;
        const value = clamp(0.62 + broad * 0.23 + fine * 0.12 - cracks, 0.25, 1);
        const idx = (y * size + x) * 4;
        image.data[idx] = clamp(value * 225, 0, 255);
        image.data[idx + 1] = clamp(value * 235, 0, 255);
        image.data[idx + 2] = clamp(value * 220, 0, 255);
        image.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const rng = mulberry32(509);
    for (let i = 0; i < 4800; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const len = 1 + rng() * 5;
      ctx.strokeStyle = `rgba(${33 + rng() * 30 | 0},${44 + rng() * 26 | 0},${33 + rng() * 22 | 0},${0.05 + rng() * 0.12})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 2, y - len);
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  const mountainTexture = makeMountainTexture();

  function makeMountainRange(options) {
    const {
      width,
      depth,
      zCenter,
      peak,
      baseY,
      seed,
      segX,
      segZ,
      colors,
      roughness
    } = options;
    const geometry = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, zCenter);
    const positions = geometry.attributes.position;
    const colorsArray = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    const cLow = makeColor(colors[0]);
    const cMid = makeColor(colors[1]);
    const cHigh = makeColor(colors[2]);
    const cMist = makeColor(colors[3] || colors[2]);
    const zMin = zCenter - depth / 2;
    const zMax = zCenter + depth / 2;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const nz = (z - zMin) / depth;
      const ridge = ridgedNoise(x * options.freq + seed * 3.17, z * options.freq * 0.16 + seed, 5);
      const secondary = ridgedNoise(x * options.freq * 2.7 + seed * 7.1, z * options.freq * 0.3, 3);
      const envelope = smoothstep(0, 0.28, nz) * (1 - smoothstep(0.78, 1, nz));
      const broad = 0.68 + 0.32 * Math.sin(x * 0.009 + seed) * Math.cos(x * 0.017 - seed * 0.5);
      const height = peak * envelope * (0.3 + ridge * 0.72 + secondary * 0.12) * broad;
      let y = baseY + height;
      y += Math.sin(x * 0.035 + z * 0.021 + seed) * 0.42 * envelope;
      y += (valueNoise(x * 0.1 + seed, z * 0.1) - 0.5) * 0.5 * envelope;
      positions.setY(i, y);

      const elevation = clamp((y - baseY) / peak, 0, 1);
      const detail = fbm(x * 0.035 + 1.1, z * 0.035 - 2.4, 3);
      const upper = smoothstep(0.25, 0.88, elevation);
      color.copy(cLow).lerp(cMid, smoothstep(0.04, 0.58, elevation));
      color.lerp(cHigh, upper * 0.72);
      color.lerp(cMist, Math.pow(elevation, 2.0) * 0.16);
      color.multiplyScalar(0.8 + detail * 0.36);
      colorsArray[i * 3] = color.r;
      colorsArray[i * 3 + 1] = color.g;
      colorsArray[i * 3 + 2] = color.b;
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
    // Give the huge planes enough texture tiling without stretching it.
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (width / 34), uv.getY(i) * (depth / 34));
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      map: mountainTexture,
      vertexColors: true,
      roughness: roughness,
      metalness: 0,
      dithering: true
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.name = `mountain-layer-${seed}`;
    scene.add(mesh);
    return mesh;
  }

  makeMountainRange({
    width: 390,
    depth: 95,
    zCenter: -106,
    peak: 37,
    baseY: -10,
    seed: 11,
    freq: 0.0064,
    segX: 180,
    segZ: 30,
    colors: [0x3f523e, 0x5b6d4d, 0x6c7857, 0x7d856d],
    roughness: 0.95
  });
  makeMountainRange({
    width: 550,
    depth: 105,
    zCenter: -182,
    peak: 78,
    baseY: -16,
    seed: 27,
    freq: 0.0049,
    segX: 200,
    segZ: 28,
    colors: [0x405652, 0x5d6d65, 0x78847c, 0x8f9992],
    roughness: 0.98
  });
  makeMountainRange({
    width: 760,
    depth: 130,
    zCenter: -274,
    peak: 124,
    baseY: -23,
    seed: 53,
    freq: 0.0035,
    segX: 190,
    segZ: 22,
    colors: [0x51676c, 0x718287, 0x8e9a9c, 0xa7b0b0],
    roughness: 1.0
  });
  makeMountainRange({
    width: 1000,
    depth: 140,
    zCenter: -396,
    peak: 178,
    baseY: -30,
    seed: 79,
    freq: 0.0026,
    segX: 160,
    segZ: 16,
    colors: [0x687d87, 0x87969d, 0xa4aeb2, 0xb8c0c0],
    roughness: 1.0
  });

  /* ---------- 19. Valley mist ---------- */

  function makeFogTexture(seed) {
    const width = 512;
    const height = 256;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = x / width;
        const v = y / height;
        const n = fbm(u * 4.6 + seed, v * 3.2 - seed * 0.7, 5, 2.07, 0.52);
        const broad = fbm(u * 1.8 - 2.1 + seed, v * 1.3 + 0.4, 3);
        const field = n * 0.65 + broad * 0.35;
        const edgeX = smoothstep(0, 0.23, u) * smoothstep(1, 0.77, u);
        const edgeY = smoothstep(0, 0.34, v) * smoothstep(1, 0.6, v);
        const alpha = Math.pow(clamp((field - 0.31) / 0.38, 0, 1), 1.25) * edgeX * edgeY;
        const index = (y * width + x) * 4;
        image.data[index] = 255;
        image.data[index + 1] = 255;
        image.data[index + 2] = 255;
        image.data[index + 3] = clamp(alpha * 235, 0, 255);
      }
    }
    ctx.putImageData(image, 0, 0);

    const softCanvas = document.createElement("canvas");
    softCanvas.width = width;
    softCanvas.height = height;
    const softCtx = softCanvas.getContext("2d");
    softCtx.filter = "blur(7px)";
    softCtx.drawImage(canvas, 0, 0);

    const texture = new THREE.CanvasTexture(softCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  const mistTexture = makeFogTexture(2.7);
  const mistGroup = new THREE.Group();
  mistGroup.name = "valley-mist";
  scene.add(mistGroup);

  const mistSprites = [];
  {
    const rng = mulberry32(3711);
    const layers = [
      { x: 1.5, z: -19, y: 0.75, sx: 30, sy: 4.2, o: 0.13, phase: 0.3 },
      { x: -4.0, z: -32, y: 1.1, sx: 38, sy: 5.4, o: 0.15, phase: 1.7 },
      { x: 8.0, z: -45, y: 1.4, sx: 50, sy: 6.6, o: 0.16, phase: 3.1 },
      { x: -14.0, z: -60, y: 2.2, sx: 58, sy: 8.4, o: 0.13, phase: 5.2 },
      { x: 5.0, z: -78, y: 2.6, sx: 74, sy: 9.5, o: 0.12, phase: 2.4 },
      { x: -20.0, z: -103, y: 3.8, sx: 90, sy: 12.5, o: 0.11, phase: 0.8 },
      { x: 21.0, z: -128, y: 4.6, sx: 110, sy: 15, o: 0.1, phase: 4.4 },
      { x: 0.0, z: -156, y: 6.0, sx: 130, sy: 18, o: 0.085, phase: 1.2 },
      { x: -31.0, z: -185, y: 7.0, sx: 140, sy: 20, o: 0.08, phase: 3.7 },
      { x: 36.0, z: -220, y: 8.0, sx: 160, sy: 22, o: 0.075, phase: 5.7 },
      { x: -4.0, z: -84, y: 0.9, sx: 80, sy: 7.0, o: 0.055, phase: 2.0 }
    ];
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const material = new THREE.SpriteMaterial({
        map: mistTexture,
        color: 0xd2d3c6,
        transparent: true,
        opacity: layer.o,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        fog: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(layer.x, layer.y, layer.z);
      sprite.scale.set(layer.sx, layer.sy, 1);
      sprite.renderOrder = 1;
      mistGroup.add(sprite);
      mistSprites.push({
        sprite,
        material,
        baseX: layer.x,
        baseY: layer.y,
        baseOpacity: layer.o,
        drift: 1.4 + rng() * 2.6,
        phase: layer.phase,
        speed: 0.018 + rng() * 0.016
      });
    }

    // Two subtle low wisps across the near meadow.
    for (let i = 0; i < 2; i++) {
      const material = new THREE.SpriteMaterial({
        map: mistTexture,
        color: 0xc8cabb,
        transparent: true,
        opacity: 0.035,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        fog: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(i === 0 ? -3 : 5, terrainHeight(i === 0 ? -3 : 5, -12) + 0.45, -12 - i * 8);
      sprite.scale.set(24 + i * 12, 3.2 + i, 1);
      sprite.renderOrder = 1;
      mistGroup.add(sprite);
      mistSprites.push({
        sprite,
        material,
        baseX: sprite.position.x,
        baseY: sprite.position.y,
        baseOpacity: 0.035,
        drift: 0.8 + i * 0.5,
        phase: i * 2.7,
        speed: 0.012
      });
    }
  }

  function mistAmount(hour) {
    const h = ((hour % 24) + 24) % 24;
    const dawn = Math.exp(-Math.pow((h - 6.1) / 2.0, 2));
    const dusk = Math.exp(-Math.pow((h - 19.2) / 2.8, 2));
    const night = smoothstep(19, 21.5, h) * (1 - smoothstep(4.5, 6.3, h));
    return 0.44 + dawn * 0.86 + dusk * 0.24 + night * 0.24;
  }

  /* ---------- 20. Fireflies ---------- */

  function makeGlowTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,248,214,1)");
    gradient.addColorStop(0.2, "rgba(255,224,154,0.9)");
    gradient.addColorStop(0.52, "rgba(255,194,106,0.24)");
    gradient.addColorStop(1, "rgba(255,181,84,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const fireflyData = [];
  let fireflyPoints;
  {
    const rng = mulberry32(8831);
    const positions = new Float32Array(24 * 3);
    for (let i = 0; i < 24; i++) {
      const x = rngRange(rng, -9, 10);
      const z = rngRange(rng, -18, 4);
      const baseY = terrainHeight(x, z) + rngRange(rng, 0.35, 1.25);
      positions[i * 3] = x;
      positions[i * 3 + 1] = baseY;
      positions[i * 3 + 2] = z;
      fireflyData.push({
        x,
        y: baseY,
        z,
        phase: rng() * 20,
        drift: rngRange(rng, 0.25, 0.75),
        speed: rngRange(rng, 0.1, 0.22)
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: makeGlowTexture(),
      color: 0xffe0ad,
      size: 0.085,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      alphaTest: 0.01,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false
    });
    fireflyPoints = new THREE.Points(geometry, material);
    fireflyPoints.name = "night-fireflies";
    fireflyPoints.frustumCulled = false;
    scene.add(fireflyPoints);
  }

  /* ---------- 21. Falling petals ---------- */

  const fallingPetalData = [];
  let fallingPetalMesh;
  {
    const rng = mulberry32(4417);
    const geometry = makePetalGeometry({
      length: 0.023,
      width: 0.019,
      segU: 3,
      segV: 4,
      notch: 0.18,
      cup: 0.003,
      arch: 0.0012,
      ruffle: 0.08,
      tipRounding: 0.42,
      baseColor: 0xf1bfcd,
      edgeColor: 0xfff8f2,
      veinColor: 0xf3dce3,
      veinStrength: 0.12,
      phase: 7.7
    });
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.58,
      metalness: 0.0,
      emissive: new THREE.Color(0xb36f7e),
      emissiveIntensity: 0.52,
      dithering: true
    });
    fallingPetalMesh = new THREE.InstancedMesh(geometry, material, QUALITY.fallPetals);
    fallingPetalMesh.name = "drifting-petals";
    fallingPetalMesh.castShadow = false;
    fallingPetalMesh.receiveShadow = false;
    fallingPetalMesh.frustumCulled = false;
    scene.add(fallingPetalMesh);

    const sources = [
      { x: 1.5, z: 4.5, radius: 1.7, minY: 0.7, maxY: 1.7 },
      { x: -1.7, z: 3.6, radius: 1.9, minY: 0.6, maxY: 1.5 }
    ];

    for (let i = 0; i < QUALITY.fallPetals; i++) {
      const source = sources[i % sources.length];
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * source.radius;
      const x = source.x + Math.cos(angle) * radius;
      const z = source.z + Math.sin(angle) * radius;
      const y = rngRange(rng, source.minY, source.maxY);
      fallingPetalData.push({
        baseX: x,
        baseZ: z,
        x,
        z,
        y,
        ground: terrainHeight(x, z),
        phase: rng() * 30,
        fallSpeed: rngRange(rng, 0.085, 0.17),
        driftX: rngRange(rng, 0.16, 0.42),
        driftZ: rngRange(rng, -0.22, 0.28),
        tiltX: rng() * 6.28,
        tiltY: rng() * 6.28,
        tiltZ: rng() * 6.28,
        spinX: rngRange(rng, -0.16, 0.16),
        spinY: rngRange(rng, -0.11, 0.11),
        spinZ: rngRange(rng, -0.18, 0.18),
        scale: rngRange(rng, 0.82, 1.35)
      });
    }
  }

  const fallingPetalMatrix = new THREE.Matrix4();
  const fallingPetalQuat = new THREE.Quaternion();
  const fallingPetalEuler = new THREE.Euler();

  function updateFallingPetals(time, dt) {
    if (!fallingPetalMesh) return;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < fallingPetalData.length; i++) {
      const petal = fallingPetalData[i];
      petal.y -= petal.fallSpeed * step;
      petal.x = petal.baseX + Math.sin(time * 0.18 + petal.phase) * petal.driftX;
      petal.z = petal.baseZ + Math.cos(time * 0.14 + petal.phase * 1.2) * petal.driftZ;
      if (petal.y < petal.ground + 0.04) {
        petal.baseX = petal.x;
        petal.baseZ = petal.z;
        petal.y = 0.7 + Math.random() * 1.1;
        petal.ground = terrainHeight(petal.baseX, petal.baseZ);
        petal.phase = Math.random() * 30;
        petal.fallSpeed = 0.08 + Math.random() * 0.08;
      }
      petal.tiltX += petal.spinX * step;
      petal.tiltY += petal.spinY * step;
      petal.tiltZ += petal.spinZ * step;
      fallingPetalEuler.set(petal.tiltX, petal.tiltY, petal.tiltZ, "YXZ");
      fallingPetalQuat.setFromEuler(fallingPetalEuler);
      fallingPetalMatrix.compose(
        new THREE.Vector3(petal.x, petal.y, petal.z),
        fallingPetalQuat,
        new THREE.Vector3(petal.scale, petal.scale, petal.scale)
      );
      fallingPetalMesh.setMatrixAt(i, fallingPetalMatrix);
    }
    fallingPetalMesh.instanceMatrix.needsUpdate = true;
  }

  function updateFireflies(time, nightStrength) {
    if (!fireflyPoints) return;
    const positionAttribute = fireflyPoints.geometry.getAttribute("position");
    for (let i = 0; i < fireflyData.length; i++) {
      const fly = fireflyData[i];
      positionAttribute.setXYZ(
        i,
        fly.x + Math.sin(time * fly.speed + fly.phase) * fly.drift,
        fly.y + Math.sin(time * fly.speed * 0.73 + fly.phase * 1.6) * 0.26,
        fly.z + Math.cos(time * fly.speed * 0.86 + fly.phase) * fly.drift
      );
    }
    positionAttribute.needsUpdate = true;
    fireflyPoints.material.opacity = nightStrength * 0.86;
  }

  function updateMist(time, hour) {
    const amount = mistAmount(hour);
    for (const wisp of mistSprites) {
      wisp.sprite.position.x = wisp.baseX + Math.sin(time * wisp.speed + wisp.phase) * wisp.drift;
      wisp.sprite.position.y = wisp.baseY + Math.sin(time * wisp.speed * 0.6 + wisp.phase * 1.4) * 0.16;
      wisp.material.opacity = wisp.baseOpacity * amount;
    }
  }

  /* ---------- 22. Soft, filtered god rays ---------- */

  const lightShaftUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xffd6a3) },
    uIntensity: { value: 0 }
  };

  const lightShaftVertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const lightShaftFragmentShader = `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uSeed;
    uniform vec3 uColor;

    float hash21(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += noise(p) * a;
        p = p * 2.03 + 7.1;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      if (uIntensity < 0.0005) discard;
      float edgeX = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
      float edgeY = smoothstep(0.0, 0.19, vUv.y) * (1.0 - smoothstep(0.68, 1.0, vUv.y));
      float filament = fbm(vec2(vUv.x * 4.2 + uSeed, vUv.y * 3.0 - uTime * 0.018 + uSeed * 0.3));
      float broken = smoothstep(0.30, 0.82, filament);
      float shaft = edgeX * edgeY * (0.24 + broken * 0.9);
      float alpha = shaft * uIntensity;
      gl_FragColor = vec4(uColor, alpha);
    }
  `;

  const lightShafts = [];
  {
    const shaftDefs = [
      { x: -9.0, z: -7.0, base: 0.15, width: 3.0, height: 16.0, tilt: 0.46, seed: 2.1 },
      { x: -4.0, z: -12.0, base: 0.3, width: 2.1, height: 19.0, tilt: 0.54, seed: 5.4 },
      { x: 2.8, z: -9.5, base: 0.2, width: 2.8, height: 14.0, tilt: 0.4, seed: 7.3 },
      { x: 7.5, z: -16.0, base: 0.45, width: 3.5, height: 20.0, tilt: 0.58, seed: 3.8 },
      { x: -13.5, z: -19.0, base: 0.5, width: 4.4, height: 24.0, tilt: 0.5, seed: 9.2 },
      { x: 0.0, z: -22.0, base: 0.65, width: 2.4, height: 18.0, tilt: -0.36, seed: 6.7 }
    ];
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    for (let i = 0; i < shaftDefs.length; i++) {
      const def = shaftDefs[i];
      const material = new THREE.ShaderMaterial({
        vertexShader: lightShaftVertexShader,
        fragmentShader: lightShaftFragmentShader,
        uniforms: {
          uTime: lightShaftUniforms.uTime,
          uColor: lightShaftUniforms.uColor,
          uIntensity: lightShaftUniforms.uIntensity,
          uSeed: { value: def.seed }
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(def.x, terrainHeight(def.x, def.z) + def.base, def.z);
      mesh.scale.set(def.width, def.height, 1);
      mesh.rotation.set(0, 0, def.tilt, "YXZ");
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      scene.add(mesh);
      lightShafts.push({ mesh, baseTilt: def.tilt });
    }
  }

  /* ---------- 23. Environment update ---------- */

  const sunScreen = new THREE.Vector2(0.5, 1.4);
  const cameraForward = new THREE.Vector3();
  const projectedSun = new THREE.Vector3();

  function updateEnvironment(hour, time) {
    updateCelestialDirections(hour);
    sampleTimePalette(hour, palette);

    skyUniforms.uTime.value = time;
    skyUniforms.uStars.value = palette.stars;
    skyUniforms.uMoonGlow.value = palette.moonGlow;
    skyUniforms.uSunGlow.value = palette.sunGlow;
    skyUniforms.uCloudAmount.value = palette.cloudAmount;
    skyUniforms.uZenith.value.copy(palette.zenith);
    skyUniforms.uHorizon.value.copy(palette.horizon);
    skyUniforms.uLower.value.copy(palette.lower);
    skyUniforms.uSunColor.value.copy(palette.sunColor);
    skyUniforms.uMoonColor.value.copy(palette.moonColor);
    skyUniforms.uCloudColor.value.copy(palette.cloud);

    const sunHeight = clamp(sunDirection.y, -1, 1);
    const sunUp = smoothstep(-0.035, 0.09, sunHeight);
    const moonUp = smoothstep(-0.03, 0.07, moonDirection.y);
    const nightStrength = clamp(1 - smoothstep(-0.09, 0.06, sunHeight), 0, 1);
    const twilightLift = 1 - smoothstep(-0.04, 0.18, sunHeight);

    sunLight.color.copy(palette.sunColor);
    sunLight.intensity = palette.sunIntensity * 1.55 * sunUp;
    sunLight.position.copy(sunLight.target.position).addScaledVector(sunDirection, 58);

    moonLight.color.copy(palette.moonColor);
    moonLight.intensity = palette.moonIntensity * 1.05 * moonUp;
    moonLight.position.copy(moonLight.target.position).addScaledVector(moonDirection, 55);

    hemisphere.color.copy(palette.hemiSky);
    hemisphere.groundColor.copy(palette.hemiGround);
    hemisphere.intensity = 0.16 + palette.hemiIntensity * 1.16 + twilightLift * 0.1;

    ambient.color.copy(palette.hemiSky);
    ambient.intensity = 0.055 + palette.ambientIntensity * 1.18 + twilightLift * 0.05;

    skyFill.color.copy(palette.hemiSky).lerp(palette.horizon, 0.34);
    skyFill.intensity = 0.12 + palette.hemiIntensity * 0.32 + twilightLift * 0.08;

    scene.fog.color.copy(palette.fog);
    const effectiveFogDensity = palette.fogDensity * 0.72;
    scene.fog.density = effectiveFogDensity;

    waterUniforms.uTime.value = time;
    waterUniforms.uSunColor.value.copy(palette.sunColor);
    waterUniforms.uMoonColor.value.copy(palette.moonColor);
    waterUniforms.uSkyColor.value.copy(palette.zenith).lerp(palette.horizon, 0.36);
    waterUniforms.uHorizonColor.value.copy(palette.horizon);
    waterUniforms.uWaterColor.value.copy(palette.water);
    waterUniforms.uFogColor.value.copy(palette.fog);
    waterUniforms.uFogDensity.value = effectiveFogDensity;
    waterUniforms.uSunStrength.value = (palette.sunIntensity / 3.2) * sunUp;
    waterUniforms.uMoonStrength.value = (palette.moonIntensity / 1.0) * moonUp;
    waterUniforms.uOpacity.value = 0.88;

    camera.getWorldDirection(cameraForward);
    const sunInFront = cameraForward.dot(sunDirection);
    const rayVisible = sunInFront > 0.1 ? 1 : 0;
    if (rayVisible) {
      projectedSun.copy(camera.position).addScaledVector(sunDirection, 120).project(camera);
      sunScreen.set((projectedSun.x + 1) * 0.5, (projectedSun.y + 1) * 0.5);
    } else {
      sunScreen.set(0.5, 1.8);
    }

    const finalUniforms = post.finalMaterial.uniforms;
    finalUniforms.uExposure.value = palette.exposure;
    finalUniforms.uBloom.value = palette.bloomStrength;
    finalUniforms.uSaturation.value = palette.saturation;
    finalUniforms.uVignette.value = palette.vignette;
    finalUniforms.uShadowGrade.value.copy(palette.shadowGrade);
    finalUniforms.uHighlightGrade.value.copy(palette.highlightGrade);
    finalUniforms.uRayColor.value.copy(palette.rayColor);
    finalUniforms.uSunScreen.value.copy(sunScreen);
    finalUniforms.uRayStrength.value = palette.rayStrength * rayVisible * smoothstep(0.0, 0.06, sunHeight) * 1.7;
    finalUniforms.uTime.value = time;
    finalUniforms.uFade.value = 1.0;

    for (const wisp of mistSprites) {
      wisp.material.color.copy(palette.fog).lerp(palette.horizon, 0.5).lerp(palette.sunColor, 0.07);
    }
    updateMist(time, hour);
    updateFireflies(time, nightStrength);

    lightShaftUniforms.uTime.value = time;
    lightShaftUniforms.uColor.value.copy(palette.rayColor);
    lightShaftUniforms.uIntensity.value =
      (palette.sunGlow * 0.085 + palette.rayStrength * 0.04) * sunUp * 0.7;
    const shaftTiltDirection = sunScreen.x < 0.5 ? 1 : -1;
    for (const shaft of lightShafts) {
      const yaw = Math.atan2(
        camera.position.x - shaft.mesh.position.x,
        camera.position.z - shaft.mesh.position.z
      );
      shaft.mesh.rotation.set(0, yaw, shaft.baseTilt * shaftTiltDirection, "YXZ");
    }

    return { sunUp, moonUp, nightStrength };
  }

  /* ---------- 23. Camera: a slow walk, soft breath ---------- */

  const look = {
    pointerX: 0,
    pointerY: 0,
    targetX: 0,
    targetY: 0,
    dragYaw: 0,
    dragPitch: 0,
    lastHover: 0
  };

  function updateCamera(time, dt) {
    const calm = reducedMotion ? 0.3 : 1;
    const modalCalm = ui.poemOpen ? 0.48 : 1;
    const drift = calm * modalCalm;
    const x = cameraState.baseX + (Math.sin(time * 0.061) * 0.32 + Math.sin(time * 0.027 + 2.1) * 0.15) * drift;
    const z = cameraState.baseZ + Math.sin(time * 0.044 + 1.2) * 0.22 * drift;
    const ground = terrainHeight(x, z);
    const bob =
      (Math.sin(time * 1.44 + 0.4) * 0.008 + Math.sin(time * 0.42 + 1.4) * 0.005) *
      calm *
      modalCalm;
    camera.position.set(x, ground + 1.58 + bob, z);

    look.pointerX = damp(look.pointerX, look.targetX, 2.1, dt);
    look.pointerY = damp(look.pointerY, look.targetY, 2.1, dt);

    const yawWave =
      Math.sin(time * 0.073 + 0.7) * 0.0062 * drift +
      Math.sin(time * 0.029 + 2.6) * 0.0048 * drift;
    const pitchWave =
      Math.sin(time * 0.057 + 1.9) * 0.0032 * drift +
      Math.sin(time * 0.023) * 0.0018 * drift;

    const portraitDownTilt = camera.aspect < 0.8 ? -0.028 : 0;
    const yaw =
      cameraState.yaw +
      yawWave -
      look.pointerX * 0.036 +
      look.dragYaw;
    const pitch =
      cameraState.pitch +
      portraitDownTilt +
      pitchWave +
      look.pointerY * 0.027 +
      look.dragPitch;
    const roll =
      Math.sin(time * 0.72 + 1.2) * 0.0013 * drift +
      Math.sin(time * 1.44 + 0.1) * 0.00035 * drift -
      look.pointerX * 0.003 -
      look.dragYaw * 0.027;

    camera.rotation.set(pitch, yaw, roll, "YXZ");
    camera.updateMatrixWorld();
    skyMesh.position.copy(camera.position);
  }

  /* ---------- 24. UI: flower poems behind frosted glass ---------- */

  const poemList = window.GARDEN_POEMS || [];
  const flowerList = window.GARDEN_FLOWERS || [];
  const flowerById = new Map(flowerList.map((item) => [item.id, item]));
  const poemOverlay = document.getElementById("poem");
  const poemCard = document.getElementById("poemCard");
  const poemBody = document.getElementById("poemBody");
  const poemContent = poemCard.querySelector(".poem__content");
  const poemClose = document.getElementById("poemClose");
  const poemNav = document.getElementById("poemNav");
  const poemScrollHint = document.getElementById("poemScrollHint");
  let currentPoemIndex = -1;
  let introTimer = 0;
  let focusTimer = 0;
  let closingTimer = 0;

  function buildPoemNav() {
    if (!poemNav) return;
    poemList.forEach((poem, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `打开第 ${poem.index} 首：${poem.title}`;
      button.addEventListener("click", () => {
        const flower = flowerList[index % Math.max(1, flowerList.length)];
        openPoem(index, flower ? flower.id : null);
      });
      poemNav.appendChild(button);
    });
  }

  function updatePoemScrollHint() {
    if (!poemScrollHint) return;
    const hasOverflow = poemContent.scrollHeight > poemContent.clientHeight + 4;
    const atBottom =
      poemContent.scrollTop + poemContent.clientHeight >= poemContent.scrollHeight - 10;
    const showHint = ui.poemOpen && hasOverflow && !atBottom;
    poemScrollHint.classList.toggle("is-visible", showHint);
    poemCard.classList.toggle("has-scroll", showHint);
  }

  function fillPoemCard(poem, flower) {
    document.getElementById("poemIndex").textContent = poem.index;
    document.getElementById("poemFlower").textContent = flower.name;
    document.getElementById("poemLatin").textContent = flower.latin;
    document.getElementById("poemSeal").textContent = flower.seal;
    document.getElementById("poemKicker").textContent = `春笺 · 第 ${poem.index} 首`;
    document.getElementById("poemTitle").textContent = poem.title;
    document.getElementById("poemSource").textContent = `凌润林 ·《诗季》· ${poem.volume}`;
    poemOverlay.style.setProperty("--poem-accent", flower.accent);
    poemOverlay.style.setProperty("--poem-accent-rgb", flower.accentRGB);
    poemBody.innerHTML = "";
    poem.stanzas.forEach((stanza, stanzaIndex) => {
      const stanzaElement = document.createElement("p");
      stanzaElement.style.setProperty("--i", stanzaIndex);
      stanza.forEach((line) => {
        const lineElement = document.createElement("span");
        lineElement.className = "poem__line";
        lineElement.textContent = line;
        stanzaElement.appendChild(lineElement);
      });
      poemBody.appendChild(stanzaElement);
    });
    poemContent.scrollTop = 0;
    poemScrollHint.classList.remove("is-visible");
    poemCard.classList.remove("has-scroll");
  }

  function openPoem(poemIndex, flowerId) {
    let index = Number.isInteger(poemIndex) ? poemIndex : poemList.findIndex((item) => item.id === poemIndex);
    if (index < 0 || index >= poemList.length) return;
    const poem = poemList[index];
    const flower =
      flowerById.get(flowerId) ||
      flowerList[index % Math.max(1, flowerList.length)] ||
      { name: "花", latin: "FLOS", seal: "花", accent: "#efd6c9", accentRGB: "239, 214, 201" };
    dismissIntro();
    clearTimeout(closingTimer);
    clearTimeout(focusTimer);
    ui.poemOpen = true;
    currentPoemIndex = index;
    ui.lastFocused = document.activeElement;
    ui.modalSettleUntil = performance.now() + (reducedMotion ? 0 : 1350);
    ui.lastModalFrame = 0;
    fillPoemCard(poem, flower);
    document.body.classList.add("has-poem", "has-read");
    poemOverlay.setAttribute("aria-hidden", "false");
    poemOverlay.classList.add("is-open");
    void poemCard.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(updatePoemScrollHint));
    focusTimer = window.setTimeout(() => {
      if (ui.poemOpen) poemClose.focus({ preventScroll: true });
    }, reducedMotion ? 30 : 850);
  }

  function closePoem() {
    if (!ui.poemOpen) return;
    ui.poemOpen = false;
    currentPoemIndex = -1;
    ui.modalSettleUntil = performance.now() + (reducedMotion ? 0 : 780);
    ui.lastModalFrame = 0;
    clearTimeout(focusTimer);
    poemOverlay.classList.remove("is-open");
    poemOverlay.setAttribute("aria-hidden", "true");
    poemScrollHint.classList.remove("is-visible");
    poemCard.classList.remove("has-scroll");
    document.body.classList.remove("has-poem");
    look.targetX = 0;
    look.targetY = 0;
    const previous = ui.lastFocused;
    if (previous && typeof previous.focus === "function" && document.contains(previous)) {
      previous.focus({ preventScroll: true });
    } else {
      canvas.focus({ preventScroll: true });
    }
    closingTimer = window.setTimeout(() => {
      if (!ui.poemOpen) document.activeElement === poemClose && canvas.focus({ preventScroll: true });
    }, 1200);
  }

  function dismissIntro() {
    if (ui.introDismissed) return;
    ui.introDismissed = true;
    clearTimeout(introTimer);
    document.body.classList.add("is-intro-hidden");
  }

  function scheduleIntroDismiss() {
    if (params.has("no-intro") || params.has("debug")) {
      dismissIntro();
      return;
    }
    introTimer = window.setTimeout(dismissIntro, 6800);
  }

  poemClose.addEventListener("click", closePoem);
  poemOverlay.addEventListener("click", (event) => {
    if (event.target.closest(".poem__card")) return;
    closePoem();
  });
  poemContent.addEventListener("scroll", updatePoemScrollHint, { passive: true });

  // A moving cursor is the only "hover" effect. The flowers themselves stay still in their own light.
  function setHoverState(isOver) {
    if (isOver === ui.hovered) return;
    ui.hovered = isOver;
    canvas.style.cursor = isOver ? "pointer" : "default";
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePoem();
      return;
    }
    if (ui.poemOpen) {
      if (event.key === "Tab") {
        event.preventDefault();
        poemClose.focus({ preventScroll: true });
        return;
      }
      if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
        const step = event.key === "ArrowDown" ? 54 : poemContent.clientHeight * 0.78;
        poemContent.scrollBy({ top: step, behavior: reducedMotion ? "auto" : "smooth" });
        event.preventDefault();
        return;
      }
      if (event.key === "ArrowUp" || event.key === "PageUp") {
        const step = event.key === "ArrowUp" ? 54 : poemContent.clientHeight * 0.78;
        poemContent.scrollBy({ top: -step, behavior: reducedMotion ? "auto" : "smooth" });
        event.preventDefault();
        return;
      }
      if (event.key === "Home") {
        poemContent.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
        event.preventDefault();
        return;
      }
      if (event.key === "End") {
        poemContent.scrollTo({ top: poemContent.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
        event.preventDefault();
      }
    }
  });

  /* ---------- 25. Picking a blossom ---------- */

  const pickProjection = new THREE.Vector3();
  const pickDelta = new THREE.Vector3();
  const pickForward = new THREE.Vector3();

  function pickFlower(clientX, clientY) {
    if (ui.poemOpen) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null;
    const focal = rect.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
    camera.getWorldDirection(pickForward);
    const minHit = coarsePointer ? 18 : 8;
    let best = null;
    let bestScore = Infinity;

    for (let i = 0; i < flowerTargets.length; i++) {
      const target = flowerTargets[i];
      pickDelta.subVectors(target.position, camera.position);
      const forwardDistance = pickDelta.dot(pickForward);
      if (forwardDistance < 0.45 || forwardDistance > 38) continue;
      const distance = pickDelta.length();
      pickProjection.copy(target.position).project(camera);
      if (pickProjection.z < -1 || pickProjection.z > 1) continue;
      const screenX = (pickProjection.x * 0.5 + 0.5) * rect.width;
      const screenY = (-pickProjection.y * 0.5 + 0.5) * rect.height;
      const dx = screenX - localX;
      const dy = screenY - localY;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);
      const pixelRadius = Math.max(minHit, (target.radius / Math.max(distance, 0.4)) * focal * 1.35);
      if (pixelDistance > pixelRadius) continue;
      const score = pixelDistance / pixelRadius + distance * 0.0016;
      if (score < bestScore) {
        bestScore = score;
        best = target;
      }
    }
    return best;
  }

  function updateCursorFromPointer(clientX, clientY, now) {
    if (now - look.lastHover < 100) return;
    look.lastHover = now;
    const hit = pickFlower(clientX, clientY);
    setHoverState(Boolean(hit));
  }

  /* ---------- 26. Pointer / touch movement ---------- */

  const pointerState = {
    id: null,
    down: false,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    startTime: 0,
    moved: false
  };

  function isFinePointer(event) {
    return event.pointerType === "mouse" || event.pointerType === "pen" || event.pointerType === "";
  }

  function pointerDown(event) {
    if (ui.poemOpen) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerState.id = event.pointerId;
    pointerState.down = true;
    pointerState.lastX = event.clientX;
    pointerState.lastY = event.clientY;
    pointerState.startX = event.clientX;
    pointerState.startY = event.clientY;
    pointerState.startTime = performance.now();
    pointerState.moved = false;
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        /* pointer capture is a convenience, not a requirement */
      }
    }
    setHoverState(false);
  }

  function pointerMove(event) {
    if (ui.poemOpen) return;
    if (isFinePointer(event)) {
      look.targetX = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      look.targetY = 1 - (event.clientY / Math.max(1, window.innerHeight)) * 2;
    }

    if (pointerState.down && event.pointerId === pointerState.id) {
      const dx = event.clientX - pointerState.lastX;
      const dy = event.clientY - pointerState.lastY;
      const totalX = event.clientX - pointerState.startX;
      const totalY = event.clientY - pointerState.startY;
      if (!pointerState.moved && totalX * totalX + totalY * totalY > 42) {
        pointerState.moved = true;
      }
      if (pointerState.moved) {
        look.dragYaw = clamp(look.dragYaw - dx * 0.0021, -0.2, 0.2);
        look.dragPitch = clamp(look.dragPitch - dy * 0.00165, -0.12, 0.14);
      }
      pointerState.lastX = event.clientX;
      pointerState.lastY = event.clientY;
    } else if (isFinePointer(event) && !pointerState.down) {
      updateCursorFromPointer(event.clientX, event.clientY, performance.now());
    }
  }

  function endPointer(event) {
    if (!pointerState.down || event.pointerId !== pointerState.id) return;
    const wasMoved = pointerState.moved;
    pointerState.down = false;
    pointerState.id = null;
    if (canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (error) {
        /* no-op */
      }
    }
    if (!wasMoved && performance.now() - pointerState.startTime < 900) {
      const hit = pickFlower(event.clientX, event.clientY);
      if (hit) {
        openPoem(hit.poemIndex, hit.type);
      } else if (isFinePointer(event)) {
        setHoverState(false);
      }
    }
    if (isFinePointer(event) && !ui.poemOpen) {
      updateCursorFromPointer(event.clientX, event.clientY, performance.now());
    }
  }

  function cancelPointer(event) {
    if (event.pointerId !== pointerState.id) return;
    pointerState.down = false;
    pointerState.id = null;
  }

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", cancelPointer);
  canvas.addEventListener("pointerleave", (event) => {
    if (!pointerState.down && isFinePointer(event)) {
      look.targetX = 0;
      look.targetY = 0;
      setHoverState(false);
    }
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  /* ---------- 27. Resize ---------- */

  let resizeTimer = 0;
  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      updateViewportSize();
      updatePostSize();
      updateCamera(clock.time, 0.016);
      updateEnvironment(clock.hour, clock.time);
      if (ui.poemOpen) updatePoemScrollHint();
    }, 120);
  }
  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);

  /* ---------- 28. Main loop ---------- */

  let lastFrameTime = performance.now();
  let firstFrame = true;
  let hasStarted = false;

  function runFrame(now) {
    requestAnimationFrame(runFrame);
    if (now < ui.modalSettleUntil) return;
    // While reading, the valley keeps breathing, but at a much quieter pace.
    if (ui.poemOpen) {
      if (now - ui.lastModalFrame < 145) return;
      ui.lastModalFrame = now;
    }
    const rawDelta = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    if (rawDelta <= 0) return;
    const dt = Math.min(0.05, rawDelta);
    const timeScale = ui.poemOpen ? 0.34 : 1;

    clock.time += dt * (reducedMotion ? 0.72 : 1);
    clock.windTime += dt * (reducedMotion ? 0.55 : 1) * (ui.poemOpen ? 0.62 : 1);
    if (!freezeTime) {
      clock.hour = (clock.hour + (dt * (24 / clock.dayDuration)) * timeScale + 24) % 24;
    }
    windUniform.value = clock.windTime;

    updateCamera(clock.time, dt);
    updateFallingPetals(clock.time, dt);
    updateEnvironment(clock.hour, clock.time);
    post.finalMaterial.uniforms.uTime.value = clock.time;
    post.render();

    if (firstFrame) {
      firstFrame = false;
      document.body.classList.remove("is-loading");
      document.body.classList.add("is-ready");
      scheduleIntroDismiss();
      if (params.has("debug")) {
        console.info("[送你一片花海] flowers:", flowerTargets.length, "poems:", poemList.length, "plants:", plantStats);
      }
    }
  }

  function start() {
    hasStarted = true;
    updateCamera(0, 0.016);
    updateFallingPetals(0, 0.016);
    updateEnvironment(clock.hour, 0);
    post.setSize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, QUALITY.dprCap));
    post.finalMaterial.uniforms.uAperture.value = QUALITY.low ? 2.7 : 3.2;
    post.finalMaterial.uniforms.uFocus.value = QUALITY.low ? 4.7 : 4.2;
    post.finalMaterial.uniforms.uMaxBlur.value = QUALITY.low ? 5.7 : 7.0;
    post.finalMaterial.uniforms.uGrain.value = QUALITY.low ? 0.013 : 0.019;
    buildPoemNav();
    lastFrameTime = performance.now();
    requestAnimationFrame(runFrame);
  }

  // Context loss should never leave someone staring into a dark canvas.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    showFatal("图形上下文暂时离开了。请刷新页面，让花海重新醒来。");
  });

  window.addEventListener("error", (event) => {
    if (!hasStarted) {
      showFatal("花海没有成功醒来。请刷新页面再试一次。");
      console.error(event.error || event.message);
    }
  });

  window.__garden = {
    openPoem,
    closePoem,
    flowerTargets,
    plantStats,
    camera,
    scene,
    renderer,
    clock,
    setHour(value) {
      clock.hour = ((Number(value) % 24) + 24) % 24;
      updateEnvironment(clock.hour, clock.time);
    },
    setCamera(yaw, pitch) {
      cameraState.yaw = yaw;
      cameraState.pitch = pitch;
    }
  };

  try {
    start();
  } catch (error) {
    console.error(error);
    showFatal("花海没有成功醒来。请刷新页面，或换一个支持 WebGL 的浏览器。");
  }
})();
