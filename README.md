# Terrier 🐰

L'espace de notes de Myenn : pages imbriquées, éditeur par blocs, bases de données avec vues tableau et Kanban, recherche, corbeille, thème clair/sombre. Hébergé sur Firebase, données dans Firestore, accès réservé.

Le nom : le terrier, l'endroit où l'on garde tout au chaud — et un clin d'œil au lapin de *Mon Vrai*.

## Démarrer en local

Deux processus, dans deux terminaux :

```bash
npm run emulator   # Firestore local, sauvegardé dans .firestore-data
npm run dev        # http://localhost:3000
```

L'émulateur évite d'avoir une clé de service sur le disque. Il garde ses données en mémoire : `npm run emulator` les réimporte au démarrage et les réexporte à l'arrêt, pour qu'elles survivent d'une session à l'autre. Si la base locale se retrouve vide malgré tout, `npm run import` la reconstruit depuis `import/` en quelques secondes. En local, tant que `TERRIER_ALLOWED_EMAILS` n'est pas défini dans `.env.local`, l'authentification est contournée (voir `lib/auth.ts`) — impossible en production, où `NODE_ENV=production` et où la liste vient d'`apphosting.yaml`.

Autres commandes :

```bash
npm run build                      # build de production
npm run lint                       # ESLint
npx tsc --noEmit                   # types
node scripts/import-notion.mjs     # (ré)importe import/ dans Firestore (identifiants Google requis)
node scripts/import-via-api.mjs    # même import, par l'API HTTP, avec la clé pour seul sésame
node scripts/generate-api-key.mjs  # fait tourner la clé d'API locale
```

## Ce que l'app sait faire

**Pages** — arborescence illimitée, icône emoji, favoris, fil d'Ariane, duplication, corbeille avec restauration, recherche `Ctrl+K` sur titres, contenus **et** propriétés.

**Éditeur par blocs** — texte, titres 1/2/3, listes à puces, numérotées, cases à cocher, listes à basculer, citations, encadrés, code, séparateurs, images. Menu `/`, raccourcis markdown (`# `, `- `, `1. `, `[] `, `> `, `>> `, ` ``` `, `---`), indentation `Tab`, gras/italique/souligné/barré/code inline, déplacement des blocs à la poignée, sauvegarde automatique.

**Bases de données** — propriétés typées (texte, sélection, sélection multiple, case à cocher, date, nombre, URL), vue tableau avec édition en ligne, vue Kanban avec glisser-déposer entre colonnes, filtres et tris par vue. Chaque ligne est une vraie page : elle a ses propriétés en tête et son contenu en dessous.

## Contenu importé depuis Notion

| Source Notion | Dans Terrier |
| --- | --- |
| Base « My Rolling Day — Suivi de dev » | Base `db-my-rolling-day` : 47 tâches, 10 propriétés, 5 vues (Tableau, Kanban, Bloquants, À faire à la main, Tout) |
| Espace « Mon Vrai — Espace de marque » | Page racine 🐇 et ses 5 documents fondateurs |

L'export brut vit dans `import/` (`tasks.json`, `pages.json`, `bodies/*.md`). `scripts/import-notion.mjs` le rejoue dans Firestore ; les identifiants étant dérivés de la source, relancer le script met à jour au lieu de dupliquer.

**Reste à importer** : le corps des 47 fiches de tâches (leurs propriétés, elles, sont déjà toutes là), ainsi que les pages « Appli École à la Maison » et « 💡 Boîte à idées ».

## Accès

Deux portes, une seule identité derrière :

- **Navigateur** — connexion Google, puis cookie de session signé par Firebase. Seules les adresses listées dans `TERRIER_ALLOWED_EMAILS` entrent. Liste vide = personne n'entre.
- **Agent externe (ChatGPT, script)** — clé d'API dans l'en-tête `Authorization: Bearer …`, comparée à `TERRIER_API_KEY` en temps constant.

La barre latérale affiche qui est connecté et propose un bouton **Se déconnecter**.

### Ajouter quelqu'un

Une adresse Google de plus dans `TERRIER_ALLOWED_EMAILS` (`apphosting.yaml`), séparée par une virgule, puis un redéploiement :

```yaml
value: bohemianrollinghouse@gmail.com,autre.personne@gmail.com
```

En local, la même variable dans `.env.local` — mais attention : dès qu'elle est définie, l'échappatoire de développement disparaît et il faut se connecter pour de bon.

### Travailler à deux sur le même espace

Tout est partagé : pas d'espace privé par personne. Chaque page porte une **révision**, incrémentée à chaque écriture.

Quand deux personnes ouvrent la même page et que la seconde enregistre sur une version périmée, le serveur **refuse l'écriture** (409) au lieu d'écraser le travail de la première. L'éditeur affiche alors une bande d'avertissement nommant l'autre personne, avec deux issues : *Recharger sa version* (on abandonne ses modifications) ou *Garder la mienne* (on réécrit par-dessus en connaissance de cause).

Ce n'est pas de l'édition collaborative temps réel : deux personnes sur la même page au même moment se gêneront toujours. C'est une protection contre la perte silencieuse de travail, pas un remplacement de Notion multijoueur. Travailler sur des pages différentes ne pose en revanche aucun problème.

### Brancher ChatGPT

1. Dans ChatGPT, créer un GPT personnalisé → **Actions** → **Importer depuis une URL** : `https://terrier--terrier-myenn.europe-west4.hosted.app/api/openapi.json`
2. Authentification : **API Key**, type **Bearer**, valeur = `TERRIER_API_KEY`.

Les actions exposées : lister et lire des pages, créer une page, remplacer le contenu d'une page, lister et ajouter des lignes de base (donc créer une tâche My Rolling Day ou changer son statut), rechercher. Rien qui supprime définitivement.

## Déploiement

En ligne : **https://terrier--terrier-myenn.europe-west4.hosted.app**

Projet Firebase **`terrier-myenn`** (plan Blaze), backend App Hosting `terrier` en
**europe-west4**, branché sur la branche `main` de ce dépôt : **chaque push redéploie**,
en trois minutes environ. La base Firestore, elle, vit en europe-west1 — App Hosting n'y
étant pas proposé, les deux régions diffèrent, sans conséquence perceptible.

La clé d'API est dans Secret Manager, et le compte de service du backend a reçu le droit
de la lire (`firebase apphosting:secrets:grantaccess`). Un backend recréé devrait recevoir
ce droit à nouveau, faute de quoi il démarre sur « Secret mal configuré ».

Déployer à la main, sans passer par un push :

```bash
firebase apphosting:rollouts:create terrier --git-branch main --project terrier-myenn
```

## Architecture

```
app/
  layout.tsx              thème lu dans un cookie, posé côté serveur (pas de script, pas de flash)
  login/page.tsx          connexion Google
  p/layout.tsx            garde d'accès + coquille (barre latérale, recherche, corbeille)
  p/[id]/page.tsx         éditeur, ou vue base si la page est une base
  api/…                   pages, blocs, lignes de base, recherche, corbeille, session, openapi
components/
  editor/                 éditeur par blocs (voir editor.tsx pour le clavier et le menu /)
  database/               vues tableau et Kanban, cellules de propriétés
lib/
  db.ts                   accès Firestore
  auth.ts                 session Google + clé d'API
  types.ts                types partagés client/serveur
  sanitize.ts             allowlist HTML inline
```

### Choix techniques

- **Un document Firestore par page**, blocs inclus : une page se lit et s'écrit d'un coup, ce qui colle à la sauvegarde « document complet » du client. Une ligne de base est une page comme une autre, avec `dbId` renseigné.
- **Aucun client web ne parle à Firestore** : tout passe par les routes API, et les règles de sécurité refusent tout accès direct.
- **`contentEditable` non contrôlé** : React n'écrit dans le DOM que lorsque la valeur vient d'ailleurs, sinon le curseur sauterait à chaque frappe.
- **Déplacements en pointer events** plutôt qu'en drag-and-drop HTML5 : précis, et fonctionne au doigt.

## Limites connues

- Pas d'édition collaborative temps réel : deux personnes sur la même page se gênent, la seconde écriture est refusée plutôt que fusionnée (voir « Travailler à deux »).
- La recherche charge toutes les pages et filtre en mémoire. Parfait à cette échelle, à revoir au-delà de quelques centaines de pages.
- Pas de coloration syntaxique dans les blocs de code (le langage sert d'étiquette).
- Les vues de base ne se modifient pas encore depuis l'interface : filtres, tris et colonnes viennent de l'import.
- Les images sont référencées par URL, il n'y a pas d'envoi de fichier.
