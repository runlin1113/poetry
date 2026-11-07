/* 诗季 · 星空 — 界面：目录、诗页、悬停星名 */
(function (root) {
  'use strict';
  var SJ = root.SJ, U = SJ.util;

  SJ.createUI = function (data, handlers) {
    var $ = function (s) { return document.querySelector(s); };
    var poemSheet = $('#poemSheet');
    var catalogSheet = $('#catalogSheet');
    var poemBody = $('#poemBody');
    var poemTitle = $('#poemTitle');
    var poemVol = $('#poemVol');
    var poemCount = $('#poemCount');
    var poemSign = $('#poemSign');
    var poemScroll = $('#poemScroll');
    var catalogList = $('#catalogList');
    var starTag = $('#starTag');
    var hint = $('#hint');
    var nameplate = $('#nameplate');
    var btnCatalog = $('[data-act="catalog"]');
    var btnSpin = $('[data-act="spin"]');
    var btnSound = $('[data-act="sound"]');

    var poems = data.poems;
    var vols = data.vols;
    var current = -1;
    var quieted = false;

    /* --------------------------------------------------------- 目录 */
    var html = '<div class="catalog__grid">';
    vols.forEach(function (v) {
      var list = poems.filter(function (p) { return p.vol === v.no; });
      html += '<section class="cat-vol"><h3><em>' + v.no + '</em>' + v.name +
        '<span class="sub">' + v.sub + '</span></h3><ol>';
      list.forEach(function (p) {
        var idx = poems.indexOf(p);
        html += '<li data-idx="' + idx + '">' + p.title + '</li>';
      });
      html += '</ol></section>';
    });
    html += '</div>';
    catalogList.innerHTML = html;

    catalogList.addEventListener('click', function (e) {
      var li = e.target.closest('li[data-idx]');
      if (!li) return;
      var idx = parseInt(li.getAttribute('data-idx'), 10);
      closeCatalog();
      openPoem(idx, true);
    });

    /* --------------------------------------------------------- 诗页 */
    function renderPoem(idx) {
      var p = poems[idx];
      if (!p) return;
      current = idx;
      poemVol.textContent = p.vol + ' · ' + p.volName;
      poemCount.textContent = ('0' + (idx + 1)).slice(-2) + ' / ' + poems.length;
      poemTitle.textContent = p.title;
      poemSign.textContent = p.sign || '';

      var frag = document.createDocumentFragment();
      var n = 0;
      p.stanzas.forEach(function (stanza) {
        var para = document.createElement('p');
        stanza.forEach(function (line) {
          var span = document.createElement('span');
          span.className = 'ln';
          span.style.setProperty('--i', Math.min(n, 26));
          span.textContent = line;
          para.appendChild(span);
          n++;
        });
        frag.appendChild(para);
      });
      poemBody.innerHTML = '';
      poemBody.appendChild(frag);
      poemScroll.scrollTop = 0;
    }

    function openPoem(idx, fromCatalog) {
      if (idx < 0 || idx >= poems.length) return;
      renderPoem(idx);
      closeCatalog(true);
      poemSheet.classList.add('is-open');
      poemSheet.setAttribute('aria-hidden', 'false');
      document.body.classList.add('is-reading');
      hideStarTag();
      if (handlers.onOpenPoem) handlers.onOpenPoem(idx);
      quiet();
    }

    function closePoem() {
      poemSheet.classList.remove('is-open');
      poemSheet.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-reading');
      current = -1;
      if (handlers.onClosePoem) handlers.onClosePoem();
    }

    function step(d) {
      if (current < 0) return;
      openPoem((current + d + poems.length) % poems.length);
    }

    poemSheet.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        step(parseInt(b.getAttribute('data-nav'), 10));
      });
    });

    /* --------------------------------------------------------- 目录开合 */
    function openCatalog() {
      catalogSheet.classList.add('is-open');
      catalogSheet.setAttribute('aria-hidden', 'false');
      btnCatalog.setAttribute('aria-expanded', 'true');
      hideStarTag();
      closePoem();
      quiet();
    }
    function closeCatalog(silent) {
      catalogSheet.classList.remove('is-open');
      catalogSheet.setAttribute('aria-hidden', 'true');
      btnCatalog.setAttribute('aria-expanded', 'false');
      if (!silent) quiet();
    }
    function catalogOpen() { return catalogSheet.classList.contains('is-open'); }
    function poemOpen() { return poemSheet.classList.contains('is-open'); }

    btnCatalog.addEventListener('click', function () {
      if (catalogOpen()) closeCatalog();
      else openCatalog();
      if (handlers.onCatalogToggle) handlers.onCatalogToggle(catalogOpen());
    });

    /* --------------------------------------------------------- 关闭 */
    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () {
        var which = b.getAttribute('data-close');
        if (which === 'poem') closePoem();
        else closeCatalog();
      });
    });

    btnSpin.addEventListener('click', function () {
      var on = !btnSpin.classList.contains('is-off');
      btnSpin.classList.toggle('is-off', on);
      btnSpin.setAttribute('aria-pressed', String(!on));
      if (handlers.onSpin) handlers.onSpin(!on);
      quiet();
    });

    btnSound.addEventListener('click', function () {
      if (handlers.onSound) {
        var on = handlers.onSound();
        btnSound.classList.toggle('is-off', !on);
        btnSound.classList.toggle('is-on', !!on);
        btnSound.setAttribute('aria-pressed', String(!!on));
        btnSound.setAttribute('data-label', on ? '夜声 · 开' : '夜声 · 关');
      }
      quiet();
    });

    /* --------------------------------------------------------- 星名 */
    var tagIndex = -1;
    function showStarTag(idx, x, y) {
      var p = poems[idx];
      if (!p) return;
      if (tagIndex !== idx) {
        starTag.innerHTML = '<b>' + p.title + '</b><i>' + p.vol + ' · ' + p.volName + '</i>';
        tagIndex = idx;
      }
      var pad = 100;
      var cx = Math.min(Math.max(x, pad), window.innerWidth - pad);
      var cy = Math.min(Math.max(y - 64, 40), window.innerHeight - 60);
      starTag.style.transform = 'translate(-50%,-50%) translate(' + cx + 'px,' + cy + 'px)';
      starTag.classList.add('is-live');
    }
    function hideStarTag() {
      starTag.classList.remove('is-live');
      tagIndex = -1;
    }

    /* --------------------------------------------------------- 提示 */
    function quiet() {
      if (quieted) return;
      quieted = true;
      document.body.classList.add('is-quiet');
    }

    /* --------------------------------------------------------- 键鼠 */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (poemOpen()) closePoem();
        else if (catalogOpen()) closeCatalog();
      } else if (poemOpen() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        step(e.key === 'ArrowLeft' ? -1 : 1);
      }
    });

    // 点击画布空白处合上由 app.js 的画布事件处理

    var hintTimer = setTimeout(quiet, 11000);

    return {
      openPoem: openPoem,
      closePoem: closePoem,
      openCatalog: openCatalog,
      closeCatalog: closeCatalog,
      poemOpen: poemOpen,
      catalogOpen: catalogOpen,
      showStarTag: showStarTag,
      hideStarTag: hideStarTag,
      quiet: quiet,
      setSoundOn: function (on) {
        btnSound.classList.toggle('is-on', !!on);
        btnSound.classList.toggle('is-off', !on);
      },
      setSpinOn: function (on) {
        btnSpin.classList.toggle('is-off', !on);
      },
      currentPoem: function () { return current; }
    };
  };

})(window);
