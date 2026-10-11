# Arbre de découvertes Last.fm

Un site statique (HTML + JavaScript, aucun serveur) qui dessine l'arbre de tes découvertes musicales à partir de ton historique Last.fm : les artistes écoutés depuis le début au centre, chaque nouvelle découverte rattachée à l'artiste proche que tu écoutais déjà, la taille des ronds selon tes écoutes, un anneau par année, deux univers de part et d'autre de l'axe vertical.

Il fonctionne pour n'importe quel pseudo Last.fm.

## Mettre le site en ligne avec GitHub Pages

1. Crée un dépôt GitHub (par exemple `arbre-lastfm`) et envoie-y tout le contenu de ce dossier (le fichier `index.html` doit être à la racine du dépôt). Le fichier `.nojekyll` doit en faire partie.
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
3. Après une minute, le site est disponible sur `https://TON-PSEUDO-GITHUB.github.io/arbre-lastfm/`.

Pour tester en local : `python3 -m http.server` dans ce dossier, puis ouvre `http://localhost:8000`. Ouvrir `index.html` directement (file://) ne suffit pas pour l'onglet « Exemple », qui charge un fichier.

## Utilisation

- **Pseudo Last.fm** : saisis ton pseudo et une clé API gratuite (https://www.last.fm/api/account/create). L'historique est lu par pages de 200 écoutes, puis les artistes proches des 160 artistes les plus écoutés sont demandés. La clé reste dans le navigateur du visiteur (localStorage).
- **Fichier CSV** : export de ton historique (colonnes `uts`, `artist`, `track`). Sans clé API, seuls les featurings relient les artistes ; avec une clé, les artistes proches sont ajoutés.
- **Reprendre un arbre** : le bouton « Enregistrer » produit un `.json` que tu peux rouvrir sans refaire les requêtes.
- **Exemple** : `data/example.json`, ton historique d'origine. Supprime ce fichier et le bouton d'exemple si tu ne veux pas le publier.

## Clé API par défaut (facultatif)

Si tu veux que les visiteurs n'aient pas à créer de clé, renseigne `apiKey` dans `config.js`. Attention : le fichier est public, donc la clé aussi ; Last.fm limite le débit par clé, ce qui peut être pénible si beaucoup de gens l'utilisent en même temps.

## Comment l'arbre est construit

- Un artiste entre dans l'arbre à partir de 20 écoutes (abaissé à 10 ou 5 pour les petits historiques).
- **Parent** : parmi les artistes écoutés avant lui, celui qui maximise `similarité × (0,8 + 0,2·e^(−écart/200 jours)) + 1,5 × min(1, log2(1 + featurings)/3)`. Le nombre de featurings pèse donc plus que la proximité ou l'ordre d'écoute ; « écouté avant lui » reste une contrainte.
- **Featurings** : titres contenant `feat.`, `ft.`, `avec`, `with`… ou plusieurs artistes dans le champ artiste, comptés en titres distincts.
- **Similarité** : `artist.getSimilar` de Last.fm (score `match`). Le site ne peut pas utiliser music-map, qui n'a pas d'API ouverte.
- **Deux univers** : deux artistes de départ (le plus écouté, et un gros artiste très éloigné de lui), puis propagation sur le graphe des liens. C'est automatique, donc imparfait pour les artistes peu connectés ; les isolés prennent le côté des artistes découverts à la même période.

## Fichiers

- `index.html`, `style.css` : page et styles.
- `js/pipeline.js` : lecture du CSV, appels Last.fm, featurings, parents, séparation en deux univers (utilisable aussi dans Node).
- `js/graph.js` : dessin (d3, simulation de forces, zoom sémantique).
- `js/app.js` : interface (onglets, progression, enregistrement).
- `vendor/d3.min.js` : d3 v7.8.5 local, aucun CDN pour le code.
