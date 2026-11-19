# YourOwnTube

Lecteur YouTube mobile minimaliste : **rechercher, regarder, enregistrer**. Rien d'autre.
Pas de Shorts, pas de publicité, pas de commentaires, pas de likes, pas de fil d'actualité.

- Un seul écran principal, **Explorer** : recherche, reprise de lecture, recherches récentes, vidéos enregistrées, historique.
- Lecteur intégré : lecture/pause, ±10 s (boutons ou double-tap sur les côtés), barre de progression, volume, plein écran avec rotation, lecture en arrière-plan avec contrôles système, reprise là où vous vous étiez arrêté.
- Téléchargement en un geste : la vidéo est enregistrée sur le téléphone, marquée **« Disponible hors ligne »**, et **la version locale est toujours lue en priorité** (lecture instantanée, sans réseau).
- Vidéos similaires sous le lecteur : recommandations de la source + même chaîne + même sujet, sans Shorts.
- Historique local (vidéos regardées avec date et progression, recherches), suppression ligne par ligne ou totale.
- Gestion du stockage : taille de chaque fichier, espace utilisé, espace libre, suppression individuelle ou par lot.
- États soignés : chargement (squelettes), erreurs avec « Réessayer », mode hors ligne.

## Installer l'APK sans ordinateur

À chaque push sur `main`, GitHub Actions construit un APK Android :

1. Onglet **Actions** → workflow **APK Android** → dernière exécution réussie.
2. Section **Artifacts** → télécharger `yourowntube-apk` (zip contenant `app-release.apk`).
3. Ouvrir l'APK sur le téléphone (autoriser l'installation depuis le navigateur / le gestionnaire de fichiers).

Pousser un tag `v1.0.0` attache aussi l'APK à une release GitHub. Le workflow peut être lancé à la main (« Run workflow »).

> L'APK est signé avec la clé de debug d'Expo : parfait pour un usage personnel, pas pour un store.

## Développement

```bash
npm install
npx expo install --fix     # aligne les versions sur le SDK Expo installé
npm test                   # tests du cœur (Node, sans téléphone)
npx expo run:android       # build de développement sur un appareil / émulateur
```

La lecture en arrière-plan et le picture-in-picture demandent un **build natif** (`expo run:android`, l'APK ci-dessus ou `eas build --profile preview`) ; le reste fonctionne aussi dans Expo Go.

## Sources vidéo

Réglages → **Source des vidéos**. L'application démarre en **mode démonstration** : catalogue de vrais films libres (Blender Foundation, échantillons publics de Google), lisibles et téléchargeables, pour tout essayer sans configuration. Deux faux « Shorts » y sont glissés pour vérifier qu'ils n'apparaissent jamais.

| Source | Recherche | Lecture | Téléchargement | Similaires |
|---|---|---|---|---|
| Démonstration | ✓ (locale) | ✓ | ✓ | ✓ |
| **Invidious** (recommandé) | ✓ tri et filtres côté serveur | ✓ via l'instance (`local=true`) | ✓ fichier muxé | ✓ natives + chaîne + sujet |
| Piped | ✓ tri et filtres côté client | ✓ HLS adaptatif | ✓ si flux muxé proposé | ✓ natives + chaîne + sujet |
| YouTube Data API v3 | ✓ (clé API) | via Invidious ou Piped | via Invidious ou Piped | chaîne + sujet |

L'API officielle YouTube Data v3 ne fournit **aucun flux vidéo** (et plus de « vidéos liées » depuis 2023) : elle sert à la recherche et aux métadonnées, la lecture passe par une instance Invidious ou Piped. La clé API est rangée dans le trousseau sécurisé du système (expo-secure-store), jamais dans SQLite. Chaque recherche coûte 100 unités de quota (10 000/jour par défaut).

Les instances publiques Invidious/Piped vont et viennent : le bouton **Tester la connexion** indique tout de suite si celle choisie répond. Une instance auto-hébergée est le plus fiable.

## Exclusion des Shorts

Aucune API ne marque les Shorts de façon fiable ; `src/core/shorts.ts` combine, du plus sûr au plus heuristique :

1. marqueur explicite de la source (`isShort` de Piped) ;
2. URL `/shorts/` ;
3. vidéo **verticale** de 3 minutes ou moins (dimensions des flux Invidious/Piped, `player.embedWidth/Height` de l'API YouTube) ;
4. hashtag `#shorts` dans le titre ou les tags, pour 3 minutes ou moins (« a short story » n'est pas filtré) ;
5. durée inférieure au seuil réglable (60 s par défaut, jusqu'à 3 min).

Le filtre s'applique aux résultats de recherche, aux vidéos similaires, et une dernière fois à l'ouverture d'une vidéo (lien direct) : un Short n'est jamais lu. Si une page de résultats ne contient que des Shorts, la page suivante est chargée automatiquement.

## Architecture

```
app/                      Écrans (expo-router)
  index.tsx               Explorer : recherche, filtres, accueil
  watch/[id].tsx          Lecteur, infos, téléchargement, similaires
  history.tsx             Historique (vidéos regardées / recherches)
  library.tsx             Vidéos enregistrées et stockage
  settings.tsx            Source, lecture, Shorts, qualité, confidentialité
src/
  core/                   Logique pure TypeScript, testée sous Node
    sources/              Adaptateurs Démo, Invidious, Piped, YouTube Data API
    shorts.ts             Détection et exclusion des Shorts
    similar.ts            Fusion des vidéos similaires
    filters.ts            Tri et filtres (durée, date)
    playback.ts           Reprise, priorité au fichier local
  db/                     SQLite (expo-sqlite) : schéma versionné, requêtes
  services/               Téléchargements (fichier .part puis renommage), fichiers
  components/             Lecteur, cartes, barres, états
  state/AppContext.tsx    Réglages, source active, état réseau
tests/                    Tests node:test (npm test)
```

- **Stockage** : SQLite pour l'historique, les recherches, les téléchargements, le cache de métadonnées et les réglages (migrations via `PRAGMA user_version`). Les vidéos et leurs miniatures sont écrites dans le dossier privé de l'application (pas dans le cache, que le système peut vider).
- **Téléchargements** : écriture dans un fichier `.part`, renommé une fois complet, pour ne jamais lire un fichier tronqué. Au démarrage, les téléchargements interrompus passent en « Échec — réessayer » et les fichiers orphelins sont supprimés. Si un fichier disparaît du disque, l'entrée est nettoyée.
- **Ajouter une source** : implémenter l'interface `VideoSource` (`src/core/sources/types.ts`) — filtrage des Shorts, filtres et similaires sont gérés au-dessus, une seule fois pour toutes.

## Limites connues

- YouTube ne propose presque plus de flux **muxés** (audio + vidéo dans un seul fichier) au-delà de 360p. Les téléchargements prennent la meilleure qualité muxée disponible, souvent 360p ; le streaming, lui, peut être en HD (HLS via Piped). Télécharger en HD demanderait de fusionner pistes audio et vidéo sur le téléphone (ffmpeg), non inclus.
- Les URL de flux expirent après quelques heures : elles sont redemandées à chaque lecture et le bouton « Réessayer » du lecteur en récupère de nouvelles.
- Télécharger des vidéos YouTube peut contrevenir aux conditions d'utilisation de YouTube. Réservez cet usage à des contenus que vous avez le droit d'enregistrer, à titre personnel.
