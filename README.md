# 🌳 Arbre de découvertes Last.fm

**Vois comment ton goût musical a poussé, artiste après artiste.**

Entre ton pseudo Last.fm : le site dessine l'arbre de tes découvertes. Les artistes que tu écoutes depuis toujours sont au centre, et chaque nouvelle découverte se rattache à l'artiste proche que tu écoutais déjà.

👉 **[Essayer le site](https://TON-PSEUDO.github.io/NOM-DU-REPO/)**

## ✨ Ce que ça montre

- 🎯 Les artistes les plus anciens au centre, les découvertes récentes vers l'extérieur
- ⭕ Un anneau par année, la taille des ronds selon tes écoutes
- 🎤 Les featurings qui relient les artistes (en vert)
- ↔️ Deux univers de part et d'autre, détectés automatiquement
- 🔍 Zoom : les noms apparaissent dans les ronds quand tu t'approches
- ▶️ Lecture dans le temps pour voir l'arbre grandir

## 🚀 Utilisation

1. Crée une clé API gratuite sur [last.fm/api/account/create](https://www.last.fm/api/account/create)
2. Saisis ton pseudo (profil public) et ta clé
3. Attends une à deux minutes, puis explore

Tu peux aussi charger un export CSV de ton historique, ou enregistrer ton arbre en `.json` pour le rouvrir sans refaire les requêtes.

## 🔒 Confidentialité

Tout se calcule dans ton navigateur. Ta clé reste chez toi, et rien n'est envoyé ailleurs qu'à Last.fm.

## 🧠 Comment ça marche

Le parent d'un artiste est celui qu'il a déjà écouté avant lui et avec qui il partage le plus de featurings, puis le plus proche d'après Last.fm.

Fait avec [d3](https://d3js.org/) et de la musique.
