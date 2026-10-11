/* Pipeline : historique d'écoute -> données de l'arbre. Fonctionne dans le navigateur et dans Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pipeline = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /* ---------- Lecture du CSV (export Last.fm : uts, utc_time, artist, ..., track) ---------- */
  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false, i = 0, n = text.length, c;
    if (text.charCodeAt(0) === 0xFEFF) i = 1;
    for (; i < n; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var iu = head.indexOf('uts'), ia = head.indexOf('artist'), it = head.indexOf('track');
    if (ia < 0) throw new Error('Colonne « artist » introuvable : est-ce bien un export Last.fm ?');
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var x = rows[r]; if (x.length <= ia) continue;
      var uts = iu >= 0 ? +x[iu] : NaN;
      if (!(uts > 0)) {
        var ut = head.indexOf('utc_time'); uts = ut >= 0 ? Date.parse(x[ut] + ' UTC') / 1000 : NaN;
      }
      if (!(uts > 0)) continue;
      out.push({ uts: uts, artist: x[ia], track: it >= 0 ? x[it] : '' });
    }
    return out;
  }

  /* ---------- Featurings ---------- */
  var FEAT_RE = /[\(\[]\s*(?:feat\.?|ft\.?|featuring|avec|with|w\/)\s+([^\)\]]+)[\)\]]|\s(?:feat\.?|ft\.?|featuring)\s+(.+)$/i;
  var SPLIT_RE = /\s*(?:,|&|\+|\/|\sx\s|\set\s|\sand\s)\s*/i;
  function splitNames(s) { return s.split(SPLIT_RE).map(function (x) { return x.trim(); }).filter(Boolean); }

  function trackNames(artist, title) {
    var names = [artist], m = FEAT_RE.exec(title || '');
    if (m) names = names.concat(splitNames(m[1] || m[2] || ''));
    if (SPLIT_RE.test(artist)) names = names.concat(splitNames(artist));
    return names;
  }

  /* ---------- Construction des données ---------- */
  function buildData(tracks, similar, opts) {
    opts = opts || {};
    similar = similar || {};
    var progress = opts.progress || function () {};
    var art = new Map(), total = tracks.length, T = [];
    tracks.forEach(function (t) {
      var k = norm(t.artist); if (!k) return;
      var a = art.get(k);
      if (!a) { a = { id: k, name: t.artist, n: 0, first: Infinity, counts: new Map() }; art.set(k, a); }
      a.n++; var d = Math.floor(t.uts / 86400); if (d < a.first) a.first = d;
      a.counts.set(t.artist, (a.counts.get(t.artist) || 0) + 1);
    });
    /* Nom d'affichage : graphie la plus fréquente. */
    art.forEach(function (a) { var best = 0; a.counts.forEach(function (c, nm) { if (c > best) { best = c; a.name = nm; } }); delete a.counts; });
    var all = Array.from(art.values()).sort(function (a, b) { return b.n - a.n; });
    var minPlays = opts.minPlays || 20, pool = all.filter(function (a) { return a.n >= minPlays; });
    if (!opts.minPlays) { [20, 10, 5].some(function (m) { minPlays = m; pool = all.filter(function (a) { return a.n >= m; }); return pool.length >= 60; }); }
    var maxNodes = opts.maxNodes || 350;
    var nodes = pool.slice(0, maxNodes).map(function (a) { return { id: a.id, name: a.name, n: a.n, day: a.first, parent: null, s: 'R' }; });
    var byId = new Map(nodes.map(function (d) { return [d.id, d]; }));
    if (nodes.length < 3) throw new Error('Pas assez d\'artistes écoutés : essaie avec un historique plus long.');

    /* Featurings : pairs d'artistes, comptées en titres distincts. */
    var pairs = new Map();
    tracks.forEach(function (t) {
      var names = trackNames(t.artist, t.track), ks = [];
      names.forEach(function (nm) { var k = norm(nm); if (k && byId.has(k) && ks.indexOf(k) < 0) ks.push(k); });
      if (ks.length < 2) return;
      var tk = norm(t.artist) + '|' + norm(t.track);
      for (var i = 0; i < ks.length; i++) for (var j = i + 1; j < ks.length; j++) {
        var key = ks[i] < ks[j] ? ks[i] + '\t' + ks[j] : ks[j] + '\t' + ks[i];
        var p = pairs.get(key); if (!p) { p = { tracks: new Set(), plays: 0 }; pairs.set(key, p); }
        p.tracks.add(tk); p.plays++;
      }
    });
    var ft = new Map();
    function fget(a, b) { return (ft.get(a + '\t' + b) || 0); }
    var featList = [];
    pairs.forEach(function (p, key) { var ab = key.split('\t'); var t = p.tracks.size; ft.set(key, t); ft.set(ab[1] + '\t' + ab[0], t); featList.push([ab[0], ab[1], t, p.plays]); });

    /* Similarité symétrique (score Last.fm "match" entre 0 et 1). */
    var sim = new Map();
    function sset(a, b, s) { if (!byId.has(a) || !byId.has(b) || a === b) return; var m = sim.get(a); if (!m) { m = new Map(); sim.set(a, m); } if ((m.get(b) || 0) < s) m.set(b, s); }
    Object.keys(similar).forEach(function (k) { (similar[k] || []).forEach(function (e) { sset(k, e[0], e[1]); sset(e[0], k, e[1]); }); });

    /* Parent : le nombre de featurings pèse le plus, la proximité ensuite, "écouté avant lui" reste une contrainte. */
    var sec = [], usedFeat = new Set();
    nodes.forEach(function (x) {
      var cands = new Set();
      (sim.get(x.id) || new Map()).forEach(function (s, y) { cands.add(y); });
      byId.forEach(function (_, y) { if (fget(x.id, y) > 0) cands.add(y); });
      var best = null, bs = 0, arr = [];
      cands.forEach(function (y) {
        var yd = byId.get(y); if (!yd || !(yd.day < x.day)) return;
        var s = (sim.get(x.id) || new Map()).get(y) || 0, t = fget(x.id, y);
        if (!(s >= 0.1 || t >= 1)) return;
        var sc = s * (0.8 + 0.2 * Math.exp(-(x.day - yd.day) / 200)) + 1.5 * Math.min(1, Math.log2(1 + t) / 3);
        arr.push({ y: y, s: s, sc: sc });
        if (sc > bs) { bs = sc; best = y; }
      });
      if (best) { x.parent = best; if (fget(x.id, best) > 0) usedFeat.add(x.id < best ? x.id + '\t' + best : best + '\t' + x.id); }
      arr.filter(function (e) { return e.y !== best && e.s >= 0.5; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 2).forEach(function (e) { sec.push([x.id, e.y]); });
    });

    /* On garde les featurings entre artistes proches, ceux qui servent de parent, et les plus fournis. */
    var feats = featList.filter(function (f) {
      var near = ((sim.get(f[0]) || new Map()).get(f[1]) || 0) >= 0.1;
      return near || usedFeat.has(f[0] + '\t' + f[1]) || f[2] >= 3;
    });

    /* Deux univers. */
    var edges = [];
    nodes.forEach(function (d) { if (d.parent) edges.push([d.id, d.parent, 1]); });
    sec.forEach(function (e) { edges.push([e[0], e[1], 0.5]); });
    sim.forEach(function (m, a) { m.forEach(function (s, b) { if (a < b && s >= 0.2) edges.push([a, b, s]); }); });
    feats.forEach(function (f) { edges.push([f[0], f[1], 0.4 + 0.2 * Math.min(f[2], 5)]); });
    var split = opts.manualSides ? applyManual(nodes, opts.manualSides) : autoSplit(nodes, edges);

    var labels = opts.labels || split.labels;
    return { total: total, minPlays: minPlays, nodes: nodes, links: sec, feats: feats, labels: labels };
  }

  function applyManual(nodes, left) { var set = new Set(left); nodes.forEach(function (d) { d.s = set.has(d.id) ? 'L' : 'R'; }); return { labels: null }; }

  function autoSplit(nodes, edges) {
    var idx = new Map(nodes.map(function (d, i) { return [d.id, i]; })), N = nodes.length;
    var adj = nodes.map(function () { return []; });
    edges.forEach(function (e) { var a = idx.get(e[0]), b = idx.get(e[1]); if (a === undefined || b === undefined || a === b) return; adj[a].push([b, e[2]]); adj[b].push([a, e[2]]); });
    /* Graine A : l'artiste le plus écouté. Graine B : parmi les gros artistes, le plus éloigné de A dans le graphe. */
    var A = 0, aff = new Array(N).fill(0); aff[A] = 1;
    for (var it = 0; it < 4; it++) {
      var nx = aff.slice();
      for (var i = 0; i < N; i++) { adj[i].forEach(function (e) { nx[e[0]] += aff[i] * e[1] * 0.5; }); }
      var mx = Math.max.apply(null, nx) || 1; aff = nx.map(function (v) { return v / mx; });
    }
    var B = -1, bv = Infinity, top = Math.min(N, 25);
    for (var j = 1; j < top; j++) { if (adj[j].length && aff[j] < bv) { bv = aff[j]; B = j; } }
    if (B < 0) B = Math.min(1, N - 1);
    /* Fonction harmonique : valeur moyenne des voisins, A = 1, B = 0. */
    var f = new Array(N).fill(0.5); f[A] = 1; f[B] = 0;
    for (var r = 0; r < 60; r++) {
      for (var u = 0; u < N; u++) {
        if (u === A || u === B || !adj[u].length) continue;
        var s = 0, w = 0; adj[u].forEach(function (e) { s += f[e[0]] * e[1]; w += e[1]; });
        f[u] = s / w;
      }
    }
    var side = f.map(function (v) { return v >= 0.5 ? 'L' : 'R'; });
    /* Isolés : côté majoritaire des artistes découverts à quelques semaines d'écart. */
    for (var o = 0; o < N; o++) {
      if (adj[o].length) continue;
      var sc = { L: 0, R: 0 };
      for (var p = 0; p < N; p++) if (p !== o && adj[p].length && Math.abs(nodes[p].day - nodes[o].day) <= 30) sc[side[p]] += Math.sqrt(nodes[p].n);
      side[o] = sc.L >= sc.R ? 'L' : 'R';
    }
    nodes.forEach(function (d, i) { d.s = side[i]; });
    function lab(s, seedIdx) {
      var tops = nodes.filter(function (d) { return d.s === s; }).slice(0, 2).map(function (d) { return d.name; });
      return tops.length ? 'Univers de ' + tops.join(', ') : '—';
    }
    return { labels: { L: lab('L'), R: lab('R') } };
  }

  /* ---------- API Last.fm (navigateur) ---------- */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function api(key, params, tries) {
    tries = tries === undefined ? 4 : tries;
    var qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var url = 'https://ws.audioscrobbler.com/2.0/?' + qs + '&api_key=' + encodeURIComponent(key) + '&format=json';
    return fetch(url).then(function (r) { return r.json().catch(function () { return { error: -1, message: 'Réponse illisible (HTTP ' + r.status + ')' }; }); }).then(function (j) {
      if (j && j.error) {
        if ((j.error === 29 || j.error === 8 || j.error === 11 || j.error === 16 || j.error === -1) && tries > 0) return sleep(1200).then(function () { return api(key, params, tries - 1); });
        var e = new Error(j.message || 'Erreur Last.fm'); e.code = j.error; throw e;
      }
      return j;
    }, function (err) {
      if (tries > 0) return sleep(1200).then(function () { return api(key, params, tries - 1); });
      throw err;
    });
  }

  function fetchHistory(user, key, progress) {
    progress = progress || function () {};
    var tracks = [];
    return api(key, { method: 'user.getrecenttracks', user: user, limit: 200, page: 1 }).then(function (first) {
      var rt = first.recenttracks, pages = +rt['@attr'].totalPages, totalTracks = +rt['@attr'].total;
      function take(j) {
        var arr = j.recenttracks.track || []; if (!Array.isArray(arr)) arr = [arr];
        arr.forEach(function (t) { if (t.date && t.date.uts) tracks.push({ uts: +t.date.uts, artist: (t.artist && (t.artist['#text'] || t.artist.name)) || '', track: t.name || '' }); });
      }
      take(first); progress('history', 1, pages, totalTracks);
      var next = 2, done = 1;
      function worker() {
        if (next > pages) return Promise.resolve();
        var p = next++;
        return api(key, { method: 'user.getrecenttracks', user: user, limit: 200, page: p }).then(function (j) { take(j); done++; progress('history', done, pages, totalTracks); return worker(); });
      }
      var ws = []; for (var i = 0; i < 4; i++) ws.push(worker());
      return Promise.all(ws).then(function () { return tracks; });
    });
  }

  function fetchSimilar(names, key, progress) {
    progress = progress || function () {};
    var out = {}, i = 0, done = 0;
    function worker() {
      if (i >= names.length) return Promise.resolve();
      var nm = names[i++];
      return api(key, { method: 'artist.getsimilar', artist: nm, limit: 50, autocorrect: 1 }, 2).then(function (j) {
        var arr = (j.similarartists && j.similarartists.artist) || []; if (!Array.isArray(arr)) arr = [arr];
        out[norm(nm)] = arr.map(function (a) { return [norm(a.name), +a.match]; });
      }, function () { out[norm(nm)] = []; }).then(function () { done++; progress('similar', done, names.length); return worker(); });
    }
    var ws = []; for (var k = 0; k < 4; k++) ws.push(worker());
    return Promise.all(ws).then(function () { return out; });
  }

  /* Étape complète à partir de lignes déjà chargées : choisit les artistes dont on demande les voisins. */
  function pickForSimilar(tracks, count) {
    var c = new Map();
    tracks.forEach(function (t) { var k = norm(t.artist); if (!k) return; var e = c.get(k) || { name: t.artist, n: 0 }; e.n++; c.set(k, e); });
    return Array.from(c.values()).sort(function (a, b) { return b.n - a.n; }).slice(0, count || 160).map(function (e) { return e.name; });
  }

  return { norm: norm, parseCSV: parseCSV, buildData: buildData, autoSplit: autoSplit, fetchHistory: fetchHistory, fetchSimilar: fetchSimilar, pickForSimilar: pickForSimilar, trackNames: trackNames };
});
