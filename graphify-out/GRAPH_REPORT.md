# Graph Report - JMH95200_Workspace_V6  (2026-11-26)

## Corpus Check
- 7 files · ~1,996 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 11, .bat 1, .example 1)

## Summary
- 85 nodes · 97 edges · 17 communities (7 shown, 10 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ad1344e3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.js
- docker-publish.yml
- with
- tv.ps1
- Allègement télé Android TV / Google TV
- dependencies
- package.json
- INSTALLATION_SIMPLE.md
- README.md
- better-sqlite3
- cors
- dotenv
- helmet
- jsonwebtoken
- morgan
- engines
- scripts

## God Nodes (most connected - your core abstractions)
1. `with` - 8 edges
2. `Allègement télé Android TV / Google TV` - 6 edges
3. `Shell()` - 5 edges
4. `on` - 3 edges
5. `permissions` - 3 edges
6. `build-and-push` - 3 edges
7. `steps` - 3 edges
8. `bcryptjs` - 3 edges
9. `better-sqlite3` - 3 edges
10. `cors` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (17 total, 10 thin omitted)

### Community 0 - "index.js"
Cohesion: 0.11
Nodes (12): app, bcrypt, cors, Database, db, express, fs, helmet (+4 more)

### Community 1 - "docker-publish.yml"
Cohesion: 0.17
Nodes (11): runs-on, jobs, build-and-push, name, on, push, workflow_dispatch, permissions (+3 more)

### Community 2 - "with"
Cohesion: 0.20
Nodes (10): steps, uses, with, context, file, password, push, registry (+2 more)

### Community 3 - "tv.ps1"
Cohesion: 0.39
Nodes (5): Accelerer(), Desactiver(), Lister(), Restaurer(), Shell()

### Community 4 - "Allègement télé Android TV / Google TV"
Cohesion: 0.29
Nodes (6): 1. Préparer la télé (une seule fois), 2. Préparer le PC Windows (une seule fois), 3. Utiliser, Allègement télé Android TV / Google TV, Précautions, Télés compatibles

### Community 5 - "dependencies"
Cohesion: 0.40
Nodes (5): bcryptjs, express, dependencies, bcryptjs@^2.4.3, express@^4.21.2

### Community 6 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

## Knowledge Gaps
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `build-and-push` connect `docker-publish.yml` to `with`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Why does `steps` connect `with` to `docker-publish.yml`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._