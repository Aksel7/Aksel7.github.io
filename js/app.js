(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY_STORE = 'arbre-lastfm-key', USER_STORE = 'arbre-lastfm-user';
  var lastData = null;

  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var cfgKey = (window.CONFIG && window.CONFIG.apiKey) || '';
  $('key').value = $('key2').value = lsGet(KEY_STORE) || cfgKey;
  $('user').value = lsGet(USER_STORE);

  /* Onglets */
  var tabs = $('tabs').querySelectorAll('button');
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== b.getAttribute('data-tab'); });
      showErr('');
    });
  });

  function showErr(m) { $('err').textContent = m || ''; }
  function setProg(text, frac) {
    $('prog').textContent = text || '';
    $('bar').hidden = frac == null;
    if (frac != null) $('barfill').style.width = Math.round(frac * 100) + '%';
  }
  function busy(b) { ['goUser', 'goCsv', 'goJson', 'goExample'].forEach(function (id) { $(id).disabled = b; }); }
  var tick = function () { return new Promise(function (r) { setTimeout(r, 20); }); };

  function progress(kind, done, total, extra) {
    if (kind === 'history') setProg('Historique : page ' + done + ' / ' + total + (extra ? ' (' + extra.toLocaleString('fr-FR') + ' écoutes)' : ''), 0.6 * done / total);
    else setProg('Artistes proches : ' + done + ' / ' + total, 0.6 + 0.35 * done / total);
  }

  function finish(tracks, key) {
    var names = Pipeline.pickForSimilar(tracks, 160);
    var simP = key ? Pipeline.fetchSimilar(names, key, progress) : Promise.resolve({});
    return simP.then(function (similar) {
      setProg('Construction de l\'arbre…', 0.97);
      return tick().then(function () { return Pipeline.buildData(tracks, similar); });
    }).then(function (D) { D.noSimilar = !key; return D; });
  }

  function run(promise) {
    showErr(''); busy(true); setProg('Démarrage…', 0);
    promise.then(function (D) { setProg('', null); show(D); }).catch(function (e) {
      setProg('', null);
      var m = e && e.message ? e.message : String(e);
      if (e && e.code === 10) m = 'Clé API refusée par Last.fm. Vérifie-la.';
      else if (e && e.code === 6) m = 'Utilisateur introuvable sur Last.fm.';
      else if (e && e.code === 17) m = 'Historique privé : rends ton profil public dans les réglages Last.fm.';
      else if (e instanceof TypeError) m = 'Impossible de joindre Last.fm (réseau ou bloqueur de publicité ?).';
      showErr(m);
    }).then(function () { busy(false); });
  }

  $('goUser').addEventListener('click', function () {
    var u = $('user').value.trim(), k = $('key').value.trim();
    if (!u) return showErr('Saisis ton pseudo Last.fm.');
    if (!/^[0-9a-f]{32}$/i.test(k)) return showErr('La clé API doit faire 32 caractères hexadécimaux.');
    lsSet(KEY_STORE, k); lsSet(USER_STORE, u);
    run(Pipeline.fetchHistory(u, k, progress).then(function (tracks) {
      if (!tracks.length) throw new Error('Aucune écoute trouvée pour ce pseudo.');
      return finish(tracks, k);
    }));
  });

  $('goCsv').addEventListener('click', function () {
    var f = $('csv').files[0], k = $('key2').value.trim();
    if (!f) return showErr('Choisis un fichier CSV.');
    if (k && !/^[0-9a-f]{32}$/i.test(k)) return showErr('La clé API doit faire 32 caractères hexadécimaux (ou reste vide).');
    if (k) lsSet(KEY_STORE, k);
    run(f.text().then(function (txt) {
      setProg('Lecture du fichier…', 0.05);
      var tracks = Pipeline.parseCSV(txt);
      if (!tracks.length) throw new Error('Aucune écoute lisible dans ce fichier.');
      return finish(tracks, k);
    }));
  });

  $('goJson').addEventListener('click', function () {
    var f = $('jsonf').files[0];
    if (!f) return showErr('Choisis un fichier .json.');
    run(f.text().then(function (txt) {
      var D = JSON.parse(txt);
      if (!D || !Array.isArray(D.nodes) || !D.nodes.length) throw new Error('Ce fichier n\'est pas un arbre enregistré.');
      return D;
    }));
  });

  $('goExample').addEventListener('click', function () {
    run(fetch('data/example.json').then(function (r) { if (!r.ok) throw new Error('Exemple introuvable.'); return r.json(); }));
  });

  function viewerHTML() {
    return '' +
      '<div class="controls"><div class="time"><button class="play" id="play" type="button">Lecture</button>' +
      '<input type="range" id="slider" min="0" max="100" value="100" aria-label="Date de découverte"><span class="datelabel" id="datelabel"></span></div>' +
      '<div class="toggles"><label><input type="checkbox" id="feat" checked> Featurings</label>' +
      '<label><input type="checkbox" id="sec"> Liens secondaires</label>' +
      '<label><input type="checkbox" id="orph"> Artistes isolés (<span id="orphn">0</span>)</label></div></div>' +
      '<div class="stage" id="stage"><svg id="svg" role="img" aria-label="Graphe des artistes classés par date de première écoute"></svg>' +
      '<div class="zoomctl"><button type="button" id="zin" aria-label="Zoom avant">+</button><button type="button" id="zout" aria-label="Zoom arrière">−</button><button type="button" id="zreset" class="small" aria-label="Recentrer la vue">1:1</button></div>' +
      '<div class="sidetag l" id="tagL"></div><div class="sidetag r" id="tagR"></div></div>' +
      '<div class="below"><div class="card" id="info"></div><div class="card legend" id="legend"></div></div>' +
      '<div class="toolbar"><button class="btn secondary" id="save" type="button">Enregistrer (.json)</button><button class="btn secondary" id="back" type="button">Changer d\'historique</button></div>' +
      '<p class="foot" id="foot"></p>';
  }

  function show(D) {
    lastData = D;
    $('hero').hidden = true;
    var v = $('viewer'); v.hidden = false; v.className = 'wrap'; v.style.padding = '0';
    v.innerHTML = viewerHTML();
    $('foot').textContent = 'Le parent d\'un artiste est d\'abord choisi parmi ceux avec qui il a le plus de featurings dans ton historique, puis par proximité d\'après Last.fm, à condition que le parent ait été écouté avant lui. C\'est une piste de lecture plausible, pas une preuve de l\'origine de la découverte. Les liens verts relient deux artistes ayant un featuring (titre « feat. » ou « avec », ou nom d\'artiste commun) ; l\'épaisseur suit le nombre de titres. ' +
      (D.manualNote || 'La séparation gauche et droite est détectée automatiquement à partir des liens entre artistes : elle peut se tromper sur les artistes peu connectés.') +
      (D.noSimilar ? ' Aucune clé API n\'a été utilisée : seuls les featurings relient les artistes.' : '');
    $('save').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(lastData)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'arbre-decouvertes.json'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
    $('back').addEventListener('click', function () { v.hidden = true; v.innerHTML = ''; $('hero').hidden = false; $('sub').textContent = 'Ton historique Last.fm, du plus ancien au plus récent'; });
    window.renderTree(D);
  }
})();
