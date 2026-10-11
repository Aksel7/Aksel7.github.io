/* Rendu de l'arbre (d3). window.renderTree(D) dessine dans le gabarit créé par viewerHTML(). */
window.renderTree = function (D) {
    var LABEL_L = (D.labels && D.labels.L) || 'Univers A', LABEL_R = (D.labels && D.labels.R) || 'Univers B';
  var fmtN = function (n) { return n.toLocaleString('fr-FR'); };
  var fmtD = function (day) { return new Date(day * 864e5).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  var yearOf = function (d) { return new Date(d.day * 864e5).getUTCFullYear(); };
  var MINY = Math.min.apply(null, D.nodes.map(function (d) { return new Date(d.day * 864e5).getUTCFullYear(); }));
  var cvar = function (y) { return 'var(--c' + (((y - MINY) % 8) + 8) % 8 + ')'; };
  var yvar = function (d) { return cvar(yearOf(d)); };

  var nodes = D.nodes.map(function (d) { return { id: d.id, name: d.name, n: d.n, day: d.day, s: d.s === 'L' ? 'L' : 'R', parent: d.parent || null, children: [], nb: new Set(), sec: false }; });
  var byId = new Map(nodes.map(function (d) { return [d.id, d]; }));
  var MIN_DAY = Math.min.apply(null, nodes.map(function (d) { return d.day; }));
  nodes.forEach(function (d) {
    if (d.parent && byId.has(d.parent)) { var p = byId.get(d.parent); p.children.push(d); d.nb.add(p.id); p.nb.add(d.id); } else { d.parent = null; }
  });
  var secData = D.links.filter(function (l) { return byId.has(l[0]) && byId.has(l[1]); });
  secData.forEach(function (l) { var a = byId.get(l[0]), b = byId.get(l[1]); a.nb.add(b.id); b.nb.add(a.id); a.sec = true; b.sec = true; });
  function featCount(a, b) { var r = 0; (D.feats || []).forEach(function (f) { if ((f[0] === a && f[1] === b) || (f[0] === b && f[1] === a)) r = f[2]; }); return r; }
  var featData = (D.feats || []).filter(function (f) { return byId.has(f[0]) && byId.has(f[1]); });
  featData.forEach(function (f) {
    var a = byId.get(f[0]), b = byId.get(f[1]);
    a.nb.add(b.id); b.nb.add(a.id); a.sec = true; b.sec = true;
    (a.feats = a.feats || []).push([b, f[2]]); (b.feats = b.feats || []).push([a, f[2]]);
  });
  nodes.forEach(function (d) { d.orphan = !d.parent && d.children.length === 0 && !d.sec && d.day > MIN_DAY && d.n < 100; });

  var descMemo = new Map();
  function desc(d) { if (descMemo.has(d.id)) return descMemo.get(d.id); var c = 0; d.children.forEach(function (k) { c += 1 + desc(k); }); descMemo.set(d.id, c); return c; }

  var svg = d3.select('#svg'), stage = document.getElementById('stage');
  var gRoot = svg.append('g'), gRings = gRoot.append('g'), gLinks = gRoot.append('g'), gNodes = gRoot.append('g'), gLabels = gRoot.append('g');
  var slider = document.getElementById('slider'), dateLabel = document.getElementById('datelabel');
  var chkSec = document.getElementById('sec'), chkFeat = document.getElementById('feat'), chkOrph = document.getElementById('orph');
  var playBtn = document.getElementById('play'), info = document.getElementById('info');
  document.getElementById('orphn').textContent = nodes.filter(function (d) { return d.orphan; }).length;

  var total = D.total, last = Math.max.apply(null, nodes.map(function (d) { return d.day; }));
  document.getElementById('sub').textContent = fmtN(total) + ' écoutes · ' + nodes.length + ' artistes à ' + (D.minPlays || 20) + ' écoutes ou plus · ' + fmtD(MIN_DAY) + ' au ' + fmtD(last);

  var vis = [], nodeSel, labelSel, linkSel, zoomBehavior, pinned = null, timer = null, zk = 1;

  /* Le nom est écrit dans le rond : il apparaît dès que sa taille à l'écran devient lisible. */
  function updateLabels() {
    if (!labelSel) return;
    labelSel.classed('lo', function (d) { return d.fs * zk < 7; });
  }

  function layout() {
    var w = stage.clientWidth, h = Math.max(460, Math.min(Math.round(w * 0.9), Math.round(window.innerHeight * 0.84)));
    svg.attr('width', w).attr('height', h);
    var showO = chkOrph.checked;
    vis = nodes.filter(function (d) { return showO || !d.orphan; }).sort(function (a, b) { return a.day - b.day || b.n - a.n; });
    var N = vis.length, R = Math.min(w, h) / 2 - 14, k = Math.max(0.55, Math.min(1.15, R / 380));
    var SPAN = 1.4, kidsOf = new Map(), rootsBy = { L: [], R: [] }, size = new Map();
    /* Rang virtuel : les longues pauses entre deux découvertes (2022) élargissent la bande correspondante. */
    var vr = [0];
    for (var q = 1; q < N; q++) { var gp = vis[q].day - vis[q - 1].day; vr.push(vr[q - 1] + 1 + (gp > 90 ? Math.min(30, gp / 16) : 0)); }
    var VN = vr[N - 1] || 1;
    function rAt(v) { return R * (0.1 + 0.9 * Math.pow(Math.max(0, Math.min(v, VN)) / VN, 0.55)); }
    function radiusAtDay(day) {
      if (day <= vis[0].day) return rAt(0);
      if (day >= vis[N - 1].day) return rAt(VN);
      for (var j = 0; j < N - 1; j++) {
        if (vis[j].day <= day && day < vis[j + 1].day) { return rAt(vr[j] + (vr[j + 1] - vr[j]) * (day - vis[j].day) / (vis[j + 1].day - vis[j].day)); }
      }
      return rAt(VN);
    }
    vis.forEach(function (d, i) {
      d.rank = i; d.side = d.s === 'L' ? -1 : 1;
      d.r = (3.5 + Math.sqrt(d.n) * 0.4) * k;
      d.fs = Math.min(d.r, (d.r * 1.75) / (d.name.length * 0.52));
      d.R = rAt(vr[i]);
      kidsOf.set(d.id, []);
    });
    vis.forEach(function (d) {
      var par = d.parent ? byId.get(d.parent) : null;
      if (par && par.side === d.side && kidsOf.has(par.id)) kidsOf.get(par.id).push(d); else rootsBy[d.s].push(d);
    });
    function sz(d) { if (size.has(d.id)) return size.get(d.id); var s = 1; kidsOf.get(d.id).forEach(function (c) { s += sz(c); }); size.set(d.id, s); return s; }
    /* Chaque famille reçoit un secteur d'angle proportionnel à sa taille : les proches restent groupés et le demi-disque est rempli. */
    function assign(d, a0, a1, base) {
      d.ta = base + (a0 + a1) / 2;
      var kids = kidsOf.get(d.id); if (!kids.length) return;
      var tot = 0; kids.forEach(function (c) { tot += sz(c); });
      var cur = a0;
      kids.forEach(function (c) { var span = (a1 - a0) * sz(c) / tot; assign(c, cur, cur + span, base); cur += span; });
    }
    ['L', 'R'].forEach(function (s) {
      var base = s === 'L' ? Math.PI : 0, roots = rootsBy[s].slice().sort(function (a, b) { return sz(b) - sz(a) || a.rank - b.rank; });
      var arr = []; roots.forEach(function (d, i) { if (i % 2) arr.unshift(d); else arr.push(d); });
      var tot = 0; arr.forEach(function (d) { tot += sz(d); });
      var cur = -SPAN;
      arr.forEach(function (d) { var span = 2 * SPAN * sz(d) / tot; assign(d, cur, cur + span, base); cur += span; });
    });
    vis.forEach(function (d) { d.x = Math.cos(d.ta) * d.R; d.y = Math.sin(d.ta) * d.R; d.vx = 0; d.vy = 0; });
    var ids = new Set(vis.map(function (d) { return d.id; }));
    var L = [];
    vis.forEach(function (d) { if (d.parent && ids.has(d.parent)) L.push({ source: d.parent, target: d.id, kind: 'tree' }); });
    secData.forEach(function (l) { if (ids.has(l[0]) && ids.has(l[1])) L.push({ source: l[0], target: l[1], kind: 'sec' }); });
    featData.forEach(function (f) { if (ids.has(f[0]) && ids.has(f[1])) L.push({ source: f[0], target: f[1], kind: 'feat', c: f[2] }); });
    var sim = d3.forceSimulation(vis)
      .force('link', d3.forceLink(L).id(function (d) { return d.id; })
        .distance(function (l) { return 4 + (l.source.r + l.target.r); })
        .strength(function (l) { return l.kind === 'tree' ? 0.3 : (l.kind === 'feat' ? 0.1 : 0.05); }))
      .force('charge', d3.forceManyBody().strength(-10))
      .force('collide', d3.forceCollide(function (d) { return d.r + 2; }).iterations(3))
      .force('radial', d3.forceRadial(function (d) { return d.R; }, 0, 0).strength(0.85))
      .force('sector', function () {
        vis.forEach(function (d) {
          var cur = Math.atan2(d.y, d.x), diff = Math.atan2(Math.sin(d.ta - cur), Math.cos(d.ta - cur)), rr = Math.hypot(d.x, d.y) || 1;
          d.vx -= Math.sin(cur) * diff * rr * 0.08; d.vy += Math.cos(cur) * diff * rr * 0.08;
        });
      })
      .stop();
    for (var i = 0; i < 700; i++) {
      sim.tick();
      vis.forEach(function (d) { var m = d.r + 6; if (d.side < 0) { if (d.x > -m) d.x = -m; } else if (d.x < m) { d.x = m; } });
    }

    gRings.selectAll('*').remove(); gLinks.selectAll('*').remove(); gNodes.selectAll('*').remove(); gLabels.selectAll('*').remove();
    gRings.append('line').attr('class', 'divider').attr('x1', 0).attr('x2', 0).attr('y1', -R).attr('y2', R);
    for (var y = yearOf(vis[0]); y <= yearOf(vis[N - 1]); y++) {
      var ry = radiusAtDay(Date.UTC(y, 0, 1) / 864e5);
      gRings.append('circle').attr('class', 'ring').attr('r', ry);
      gRings.append('text').attr('class', 'ringlabel').attr('y', -ry - 4).text('dès ' + y);
    }
    linkSel = gLinks.selectAll('line').data(L).join('line')
      .attr('class', function (l) { return 'lk' + (l.kind === 'sec' ? ' sec' : (l.kind === 'feat' ? ' feat' : '')); })
      .style('stroke-width', function (l) { return l.kind === 'feat' ? Math.min(1.2 + l.c * 0.35, 3.2) : null; })
      .attr('x1', function (l) { return l.source.x; }).attr('y1', function (l) { return l.source.y; })
      .attr('x2', function (l) { return l.target.x; }).attr('y2', function (l) { return l.target.y; });
    nodeSel = gNodes.selectAll('circle').data(vis).join('circle')
      .attr('class', 'nd').attr('cx', function (d) { return d.x; }).attr('cy', function (d) { return d.y; })
      .attr('r', function (d) { return d.r; }).style('fill', yvar)
      .on('pointerover', function (e, d) { if (!pinned) focus(d); })
      .on('pointerout', function () { if (!pinned) focus(null); })
      .on('click', function (e, d) { e.stopPropagation(); pinned = (pinned === d) ? null : d; focus(pinned); });
    labelSel = gLabels.selectAll('text').data(vis).join('text')
      .attr('class', 'lb').attr('x', function (d) { return d.x; }).attr('y', function (d) { return d.y; }).attr('dy', '0.35em')
      .style('font-size', function (d) { return d.fs + 'px'; })
      .text(function (d) { return d.name; });
    var cL = vis.filter(function (d) { return d.side < 0; }).length;
    document.getElementById('tagL').textContent = LABEL_L + ' · ' + cL;
    document.getElementById('tagR').textContent = LABEL_R + ' · ' + (N - cL);
    slider.max = N - 1; slider.value = N - 1;
    svg.on('click', function () { pinned = null; focus(null); });
    zoomBehavior = d3.zoom().scaleExtent([0.6, 14]).on('zoom', function (e) { gRoot.attr('transform', e.transform); zk = e.transform.k; updateLabels(); });
    svg.call(zoomBehavior).on('dblclick.zoom', null);
    svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(w / 2, h / 2));
    pinned = null; focus(null); applyTime(); applySec(); updateLabels();
  }

  function applySec() { if (linkSel) linkSel.each(function (l) { this.style.display = ((l.kind === 'sec' && !chkSec.checked) || (l.kind === 'feat' && !chkFeat.checked)) ? 'none' : ''; }); }

  function applyTime() {
    var v = +slider.value;
    nodeSel.classed('off', function (d) { return d.rank > v; });
    labelSel.classed('off', function (d) { return d.rank > v; });
    linkSel.classed('off', function (l) { return l.source.rank > v || l.target.rank > v; });
    dateLabel.textContent = vis.length ? fmtD(vis[Math.min(v, vis.length - 1)].day) : '';
  }

  function focus(d) {
    svg.classed('focus', !!d);
    if (d) {
      nodeSel.classed('hl', function (n) { return n === d || d.nb.has(n.id); });
      labelSel.classed('hl', function (n) { return n === d || d.nb.has(n.id); });
      linkSel.classed('hl', function (l) { return l.source === d || l.target === d; });
    } else {
      nodeSel.classed('hl', false); labelSel.classed('hl', false); linkSel.classed('hl', false);
    }
    renderInfo(d);
  }

  function renderInfo(d) {
    if (!d) {
      var roots = nodes.filter(function (n) { return n.day === MIN_DAY; }).length;
      info.innerHTML = '<h2>Touche ou survole un artiste</h2><p>' + roots + ' artistes sont écoutés dès le premier jour de l\'historique : ils sont près du centre. Chaque couronne marque le début d\'une année de découverte, la ligne verticale sépare les deux univers (détectés automatiquement d\'après les liens entre artistes).</p><p class="meta">Glisse pour déplacer, molette ou pincement pour zoomer : les noms apparaissent dans les ronds.</p>';
      return;
    }
    var parent = d.parent ? byId.get(d.parent) : null, nd = desc(d);
    info.innerHTML = '<h2></h2><p class="meta"></p><p></p>';
    info.querySelector('h2').textContent = d.name;
    info.querySelector('.meta').textContent = fmtN(d.n) + ' écoutes · première écoute le ' + fmtD(d.day) + ' · ' + (d.s === 'L' ? LABEL_L : LABEL_R);
    var pf = parent ? featCount(d.id, parent.id) : 0; var line = parent ? 'Rattaché à ' + parent.name + (pf ? ' (' + pf + ' featuring' + (pf > 1 ? 's' : '') + ').' : ' (voisin music-map, écouté avant lui).') : (d.day === MIN_DAY ? 'Présent dès le début de l\'historique.' : 'Aucun voisin music-map écouté avant lui.');
    if (nd > 0) line += ' Descendance : ' + nd + ' artiste' + (nd > 1 ? 's' : '') + '.';
    info.querySelectorAll('p')[1].textContent = line;
    if (d.feats && d.feats.length) {
      var fp = d.feats.slice().sort(function (x, y) { return y[1] - x[1]; }).slice(0, 6).map(function (x) { return x[0].name + (x[1] > 1 ? ' (' + x[1] + ')' : ''); });
      var p3 = document.createElement('p'); p3.className = 'meta';
      p3.textContent = 'Featurings proches : ' + fp.join(', ') + (d.feats.length > 6 ? '…' : '');
      info.appendChild(p3);
    }
  }

  function renderLegend() {
    var el = document.getElementById('legend'), counts = {};
    nodes.forEach(function (d) { var y = yearOf(d); counts[y] = (counts[y] || 0) + 1; });
    var html = '<h2>Année de première écoute</h2>';
    var ys = Object.keys(counts).map(Number);
    for (var y = Math.min.apply(null, ys); y <= Math.max.apply(null, ys); y++) {
      var c = counts[y] || 0;
      html += '<div class="row"><span class="dot' + (c ? '' : ' empty') + '"' + (c ? ' style="background:' + cvar(y) + '"' : '') + '></span>' + y + ' · ' + c + ' artiste' + (c > 1 ? 's' : '') + '</div>';
    }
    html += '<div class="row"><span class="sw"></span>Featuring entre artistes proches</div>';
    html += '<div class="note">Taille du rond : nombre d\'écoutes. Distance au centre : ordre de découverte. Zoome pour lire les noms, d\'abord ceux des gros ronds, puis tous.</div>';
    el.innerHTML = html;
  }

  slider.addEventListener('input', function () { stopPlay(); applyTime(); });
  document.getElementById('zin').addEventListener('click', function () { svg.transition().duration(200).call(zoomBehavior.scaleBy, 1.7); });
  document.getElementById('zout').addEventListener('click', function () { svg.transition().duration(200).call(zoomBehavior.scaleBy, 1 / 1.7); });
  document.getElementById('zreset').addEventListener('click', function () { svg.transition().duration(250).call(zoomBehavior.transform, d3.zoomIdentity.translate(+svg.attr('width') / 2, +svg.attr('height') / 2)); });
  chkSec.addEventListener('change', applySec);
  chkFeat.addEventListener('change', applySec);
  chkOrph.addEventListener('change', layout);
  function stopPlay() { if (timer) { clearInterval(timer); timer = null; playBtn.textContent = 'Lecture'; } }
  playBtn.addEventListener('click', function () {
    if (timer) { stopPlay(); return; }
    if (+slider.value >= +slider.max) slider.value = 0;
    playBtn.textContent = 'Pause';
    timer = setInterval(function () {
      var v = +slider.value + 1; slider.value = v; applyTime();
      if (v >= +slider.max) stopPlay();
    }, 45);
  });
  var lastW = 0, rt = null;
  if (window.__treeResize) window.removeEventListener('resize', window.__treeResize);
  window.__treeResize = function () { clearTimeout(rt); rt = setTimeout(function () { if (Math.abs(stage.clientWidth - lastW) > 30) { lastW = stage.clientWidth; layout(); } }, 200); };
  window.addEventListener('resize', window.__treeResize);

  renderLegend();
  lastW = stage.clientWidth;
  layout();
};
