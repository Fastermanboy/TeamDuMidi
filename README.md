# 🕳 HOLE 'EM ALL

Jeu multijoueur en ligne style hole.io — canvas HTML5 + WebSocket Node.js.

## Structure du repo

```
/
├── index.html        ← Le jeu (GitHub Pages)
├── server.js         ← Serveur WebSocket (Render)
├── package.json      ← Dépendances Node
└── README.md
```

---

## 🚀 Déploiement en 10 minutes (100% gratuit)

### Étape 1 — GitHub

1. Créez un repo public sur github.com (ex: `hole-em-all`)
2. Uploadez les 4 fichiers : `index.html`, `server.js`, `package.json`, `README.md`

### Étape 2 — Serveur sur Render.com (gratuit)

1. Allez sur **render.com** → créez un compte gratuit
2. **New → Web Service**
3. Connectez votre repo GitHub
4. Paramètres :
   - **Environment** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
   - **Instance Type** : `Free`
5. Cliquez **Deploy** → attendez ~2 min
6. Copiez l'URL donnée par Render, ex: `https://hole-em-all.onrender.com`

### Étape 3 — Mettre l'URL dans le client

Dans `index.html`, ligne ~200, changez :
```js
const WS_URL = 'wss://hole-em-all.onrender.com';
```
*(remplacez par votre vraie URL Render — le port n'est pas nécessaire sur Render)*

Puis re-pushez le fichier sur GitHub.

### Étape 4 — GitHub Pages

1. Sur GitHub : **Settings → Pages**
2. Source : `Deploy from a branch` → `main` → `/ (root)`
3. Sauvegardez → votre jeu est accessible sur :
   `https://VOTRE-PSEUDO.github.io/hole-em-all/`

---

## ⚠️ Note sur Render gratuit

Le plan gratuit "endort" le serveur après 15 min d'inactivité.
Le premier joueur attendra ~30s que le serveur se réveille.
Pour éviter ça, utilisez [uptimerobot.com](https://uptimerobot.com) (gratuit) pour pinger l'URL HTTP du serveur toutes les 5 min.

---

## 🎮 Contrôles

- **ZQSD** ou **WASD** ou **Flèches directionnelles**
- Grossissez en mangeant les objets colorés
- Dévorez les autres trous si vous êtes 20% plus grand
