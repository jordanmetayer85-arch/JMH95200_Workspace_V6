# JMH95200 Workspace Enterprise V6 — consignes pour Claude

## Règle de délégation (économiser la limite de session)

L'agent principal garde la **réflexion** ; la **collecte** part chez les sous-agents.

- Lecture en volume (beaucoup de fichiers, logs, recherches dans le projet, pages web) → sous-agent `collecteur` (Haiku, environ 8 fois moins cher qu'Opus).
- Croiser ou synthétiser plusieurs sources → sous-agent `analyste` (Sonnet).
- L'agent principal garde : le plan, les décisions, l'écriture du code et la relecture finale.
- Lancer en parallèle les collectes indépendantes.
- Une lecture ciblée d'un ou deux fichiers se fait directement, sans sous-agent.

## Une question avant d'écrire

Avant une modification importante (nouvelle fonctionnalité, refonte, plusieurs fichiers) :

1. Reformuler la demande en une phrase.
2. Si un point change le résultat et ne se déduit pas du code, poser **une** question courte (ou utiliser le skill `grilling` pour un vrai plan).
3. Faire le changement le plus petit qui répond à la demande : pas de fonctionnalité en plus, pas de refonte non demandée.

Pour une correction simple et évidente, ne pas poser de question : agir.

## Compétences installées (`.claude/skills/`)

| Skill | Usage |
|---|---|
| `grill-me` / `grilling` | Se faire interroger pour clarifier un plan avant de coder |
| `tdd` | Développer en test d'abord |
| `diagnosing-bugs` | Méthode de diagnostic de bug (boucle de reproduction) |
| `apple-design` | Interfaces fluides et minimalistes façon Apple (client, pages web) |
| `humanizer` | Retirer les tics d'écriture IA d'un texte |
| `copywriting` | Textes marketing (site, présentation, annonces) |
| `graphify` | Carte du projet en graphe de connaissances (`/graphify`) |

Sources et licences : `.claude/skills/SOURCES.md`.

## Graphify — carte du code

Le projet a un graphe de connaissances dans `graphify-out/` (fichiers, fonctions, dépendances et leurs liens).

- Pour une question sur le code, lancer d'abord `graphify query "<question>"`, avant tout grep ou lecture de fichier. Ensuite, lire seulement les lignes que le graphe a désignées.
- Relation entre deux éléments : `graphify path "<A>" "<B>"`. Expliquer un élément : `graphify explain "<nom>"`.
- Vue d'ensemble de l'architecture : `graphify-out/GRAPH_REPORT.md`. Vue visuelle : ouvrir `graphify-out/graph.html` dans un navigateur.
- Après une modification du code, lancer `graphify update .` (analyse locale, gratuite) et committer `graphify-out/` avec le changement.
- Mettre cette règle dans le prompt de chaque sous-agent qui explore le code.
- Si la commande `graphify` n'est pas installée, travailler normalement avec grep et Read.
- Installation (une fois par machine) : `uv tool install graphifyy` ou `pipx install graphifyy`.

## Langue

Répondre et écrire la documentation en français.
