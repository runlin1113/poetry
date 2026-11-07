/* 诗季 · 星空 — 夜声：风、蟋蟀（全部由 WebAudio 合成，无外部音频文件） */
(function (root) {
  'use strict';
  var SJ = root.SJ, U = SJ.util;

  SJ.createAudio = function () {
    var ctx = null, master = null, windBus = null, cricketBus = null, padBus = null;
    var enabled = false, built = false;
    var chirpTimer = null, windNodes = [];
    var targetVol = 0;

    function makeNoiseBuffer(seconds) {
      var len = Math.floor(ctx.sampleRate * seconds);
      var buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch);
        var last = 0;
        for (var i = 0; i < len; i++) {
          var white = Math.random() * 2 - 1;
          last = (last + 0.022 * white) / 1.022;   // 布朗噪声
          d[i] = last * 3.2;
        }
      }
      return buf;
    }

    function build() {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      // --- 风
      windBus = ctx.createGain();
      windBus.gain.value = 0.075;
      windBus.connect(master);

      var noiseBuf = makeNoiseBuffer(8);
      for (var i = 0; i < 2; i++) {
        var src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        src.playbackRate.value = i === 0 ? 0.85 : 1.13;
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = i === 0 ? 380 : 520;
        lp.Q.value = 0.5;
        var g = ctx.createGain();
        g.gain.value = i === 0 ? 0.5 : 0.34;
        var pan = ctx.createStereoPanner();
        pan.pan.value = i === 0 ? -0.55 : 0.5;
        src.connect(lp); lp.connect(g); g.connect(pan); pan.connect(windBus);
        src.start(0);
        windNodes.push({ src: src, lp: lp, g: g, pan: pan });

        // 风的呼吸
        var lfo = ctx.createOscillator();
        lfo.frequency.value = 0.028 + i * 0.011;
        var lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.22;
        lfo.connect(lfoGain); lfoGain.connect(g.gain);
        lfo.start(0);
        windNodes.push({ src: lfo, lp: null, g: lfoGain, pan: null });
      }

      // --- 蟋蟀总线（略带回声的房间感）
      cricketBus = ctx.createGain();
      cricketBus.gain.value = 0.46;
      var crickLp = ctx.createBiquadFilter();
      crickLp.type = 'lowpass';
      crickLp.frequency.value = 9000;
      cricketBus.connect(crickLp);
      crickLp.connect(master);

      var delay = ctx.createDelay(0.6);
      delay.delayTime.value = 0.23;
      var fb = ctx.createGain();
      fb.gain.value = 0.22;
      var wet = ctx.createGain();
      wet.gain.value = 0.16;
      cricketBus.connect(delay); delay.connect(fb); fb.connect(delay);
      delay.connect(wet); wet.connect(master);

      // --- 远处的低鸣
      padBus = ctx.createGain();
      padBus.gain.value = 0.026;
      padBus.connect(master);
      [55, 82.41, 110].forEach(function (f, k) {
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * (k === 2 ? 1.002 : 1);
        var g = ctx.createGain();
        g.gain.value = k === 2 ? 0.35 : 0.7;
        var trem = ctx.createOscillator();
        trem.frequency.value = 0.037 + k * 0.011;
        var tg = ctx.createGain();
        tg.gain.value = 0.3;
        trem.connect(tg); tg.connect(g.gain);
        o.connect(g); g.connect(padBus);
        o.start(0); trem.start(0);
      });

      built = true;
      return true;
    }

    // 一只蟋蟀的一声
    function chirp(when, pan, freq, pulses, pulseDur, gap, amp) {
      if (!ctx) return;
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      var vib = ctx.createOscillator();
      vib.frequency.value = 27;
      var vibG = ctx.createGain();
      vibG.gain.value = freq * 0.0035;
      vib.connect(vibG); vibG.connect(osc.frequency);

      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 16;

      var g = ctx.createGain();
      g.gain.value = 0;

      var pn = ctx.createStereoPanner();
      pn.pan.value = pan;

      osc.connect(bp); bp.connect(g); g.connect(pn); pn.connect(cricketBus);

      var t = when;
      for (var i = 0; i < pulses; i++) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.00008, t + pulseDur);
        t += pulseDur + gap;
      }
      osc.start(when); vib.start(when);
      osc.stop(t + 0.06); vib.stop(t + 0.06);
      osc.onended = function () {
        try {
          osc.disconnect(); vib.disconnect(); vibG.disconnect();
          bp.disconnect(); g.disconnect(); pn.disconnect();
        } catch (e) { }
      };
    }

    var CRICKETS = [
      { pan: -0.72, freq: 4320, pulses: 5, dur: 0.016, gap: 0.021, amp: 0.030 },
      { pan: 0.55, freq: 3980, pulses: 4, dur: 0.020, gap: 0.026, amp: 0.024 },
      { pan: -0.18, freq: 4760, pulses: 7, dur: 0.012, gap: 0.016, amp: 0.016 },
      { pan: 0.82, freq: 3640, pulses: 3, dur: 0.026, gap: 0.030, amp: 0.013 },
      { pan: -0.45, freq: 5020, pulses: 6, dur: 0.013, gap: 0.019, amp: 0.011 }
    ];

    function scheduleCrickets() {
      if (!enabled || !ctx) return;
      var c = CRICKETS[(Math.random() * CRICKETS.length) | 0];
      var now = ctx.currentTime;
      chirp(now + 0.03, c.pan, c.freq, c.pulses, c.dur, c.gap, c.amp);
      if (Math.random() < 0.4) {
        var c2 = CRICKETS[(Math.random() * CRICKETS.length) | 0];
        chirp(now + 0.18 + Math.random() * 0.35, c2.pan, c2.freq,
          c2.pulses, c2.dur, c2.gap, c2.amp * 0.7);
      }
      chirpTimer = setTimeout(scheduleCrickets, 420 + Math.random() * 1500);
    }

    function fadeTo(v, seconds) {
      if (!ctx || !master) return;
      var t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(v, t + seconds);
    }

    var api = {
      isEnabled: function () { return enabled; },
      toggle: function () {
        try {
          if (!built) {
            if (!build()) return false;
          }
          enabled = !enabled;
          if (ctx.state === 'suspended') ctx.resume();
          if (enabled) {
            fadeTo(0.55, 2.4);
            clearTimeout(chirpTimer);
            chirpTimer = setTimeout(scheduleCrickets, 700);
          } else {
            fadeTo(0.0001, 1.6);
            clearTimeout(chirpTimer);
            chirpTimer = null;
          }
          return enabled;
        } catch (e) {
          enabled = false;
          return false;
        }
      },
      suspend: function () {
        if (ctx && enabled) fadeTo(0.0001, 0.3);
      },
      resume: function () {
        if (ctx && enabled) fadeTo(0.55, 1.2);
      }
    };

    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (document.hidden) { api.suspend(); }
      else if (enabled) { api.resume(); }
    });

    return api;
  };

})(window);
