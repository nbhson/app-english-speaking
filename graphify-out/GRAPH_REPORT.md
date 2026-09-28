# Graph Report - app-english-speaking  (2026-09-28)

## Corpus Check
- Corpus is ~41,847 words - fits in a single context window. You may not need a graph.

## Summary
- 318 nodes · 679 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core App Shell
- Library & Progress UI
- Translation & Settings
- Web Dependencies
- Error & Correction Cards
- Server Package
- Web TypeScript Config
- Web Dev Dependencies
- Root Monorepo Config
- Translation Cache

## God Nodes (most connected - your core abstractions)
1. `App()` - 25 edges
2. `LibraryPanel()` - 24 edges
3. `compilerOptions` - 20 edges
4. `AppMode` - 17 edges
5. `react` - 15 edges
6. `AIConfig` - 14 edges
7. `serverAvailable()` - 14 edges
8. `SettingsModal()` - 10 edges
9. `write()` - 10 edges
10. `getMistakes()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `chatStream()`  [EXTRACTED]
  apps/web/App.tsx → apps/web/utils/api.ts
- `App()` --calls--> `loadConfig()`  [EXTRACTED]
  apps/web/App.tsx → apps/web/utils/api.ts
- `App()` --calls--> `speech()`  [EXTRACTED]
  apps/web/App.tsx → apps/web/utils/api.ts
- `App()` --calls--> `transcribe()`  [EXTRACTED]
  apps/web/App.tsx → apps/web/utils/api.ts
- `App()` --calls--> `translatePhrase()`  [EXTRACTED]
  apps/web/App.tsx → apps/web/utils/api.ts

## Import Cycles
- None detected.

## Communities (10 total, 1 thin omitted)

### Community 0 - "Core App Shell"
Cohesion: 0.06
Nodes (47): uid(), AssessmentPanel(), AssessmentPanelProps, Header(), Props, Props, Sidebar(), SidebarItemProps (+39 more)

### Community 1 - "Library & Progress UI"
Cohesion: 0.15
Nodes (43): App(), LibraryPanel(), Tab, MistakeEntry, ProgressDay, SessionRecord, VocabEntry, fetchMistakes() (+35 more)

### Community 2 - "Translation & Settings"
Cohesion: 0.09
Nodes (35): Props, Props, SelectionTranslator(), MODEL_SUGGESTIONS, Props, SettingsModal(), toggleCls(), TTS_MODEL_SUGGESTIONS (+27 more)

### Community 3 - "Web Dependencies"
Cohesion: 0.06
Nodes (37): dependencies, lucide-react, motion, react, react-dom, react-markdown, remark-gfm, name (+29 more)

### Community 4 - "Error & Correction Cards"
Cohesion: 0.08
Nodes (27): CorrectionCard(), Props, ErrorBoundary, Props, State, HoverableWord(), MessageMarkdown(), plainText() (+19 more)

### Community 5 - "Server Package"
Cohesion: 0.08
Nodes (22): dependencies, cors, express, name, private, scripts, dev, start (+14 more)

### Community 6 - "Web TypeScript Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, allowJs, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+14 more)

### Community 7 - "Web Dev Dependencies"
Cohesion: 0.11
Nodes (18): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+10 more)

### Community 8 - "Root Monorepo Config"
Cohesion: 0.13
Nodes (14): devDependencies, concurrently, name, private, scripts, build, dev, dev:server (+6 more)

## Knowledge Gaps
- **121 isolated node(s):** `name`, `private`, `version`, `type`, `start` (+116 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 140 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Error & Correction Cards` to `Core App Shell`, `Library & Progress UI`, `Translation & Settings`, `Web Dependencies`?**
  _High betweenness centrality (0.166) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `Core App Shell` to `Library & Progress UI`, `Translation & Settings`, `Web Dependencies`, `Error & Correction Cards`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Web Dev Dependencies` to `Web Dependencies`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _121 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core App Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.06174863387978142 - nodes in this community are weakly interconnected._
- **Should `Translation & Settings` be split into smaller, more focused modules?**
  _Cohesion score 0.08888888888888889 - nodes in this community are weakly interconnected._
- **Should `Web Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.057692307692307696 - nodes in this community are weakly interconnected._