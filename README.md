# 🌳 Last.fm Discovery Tree

**See how your music taste grew, artist after artist.**

Enter your Last.fm username and the site draws the tree of your discoveries. The artists you've listened to the longest sit at the center, and each new discovery branches off from a related artist you already knew.

👉 **[Try the site](https://YOUR-USERNAME.github.io/REPO-NAME/)**

## ✨ What it shows

- 🎯 Your oldest artists at the center, recent discoveries toward the edge
- ⭕ One ring per year, circle size based on your play counts
- 🎤 Features linking artists together (in green)
- ↔️ Two "worlds" on either side, detected automatically
- 🔍 Zoom in and artist names appear inside the circles
- ▶️ Playback over time to watch the tree grow

## 🚀 Usage

1. Create a free API key at [last.fm/api/account/create](https://www.last.fm/api/account/create)
2. Enter your username (public profile) and your key
3. Wait a minute or two, then explore

You can also load a CSV export of your history, or save your tree as a `.json` file to reopen it without refetching.

## 🔒 Privacy

Everything is computed in your browser. Your key stays with you, and nothing is sent anywhere except to Last.fm.

## 🧠 How it works

An artist's parent is the one you had already listened to before them and with whom they share the most features, then the closest match according to Last.fm.

Built with [d3](https://d3js.org/) and good music.
