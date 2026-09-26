# Graph Report - app-english-speaking  (2026-09-26)

## Corpus Check
- Corpus is ~30,393 words - fits in a single context window. You may not need a graph.

## Summary
- 205 nodes · 312 edges · 22 communities (12 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core App & AI Gateway
- Build Tooling & Deps
- TypeScript Config
- Assessment & Transcription Types
- Translation & TTS Pipeline
- Dev Dependencies
- Session Modes & Sidebar
- Entry & Error Boundary
- npm Scripts
- Coach Output Format (README)
- Copilot Instructions (Graphify)
- Translation LRU Cache
- HTML Entry Point
- Engineering Report: Longer Coach Replies
- VN-to-EN Mode Helper
- OmniRoute LLM Gateway
- Settings Modal (README)
- STT Gateway
- TTS Gateway
- Turn-Based Voice Architecture
- utils/api Layer
- Web Speech API Usage

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 20 edges
2. `react` - 12 edges
3. `AppMode` - 10 edges
4. `AIConfig` - 10 edges
5. `App()` - 9 edges
6. `speech()` - 9 edges
7. `scripts` - 8 edges
8. `lucide-react` - 8 edges
9. `ErrorBoundary` - 6 edges
10. `translatePhrase()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Props` --references--> `AIConfig`  [EXTRACTED]
  components/HoverableWord.tsx → utils/api.ts
- `Props` --references--> `AIConfig`  [EXTRACTED]
  components/SelectionTranslator.tsx → utils/api.ts
- `Props` --references--> `AIConfig`  [EXTRACTED]
  components/SettingsModal.tsx → utils/api.ts
- `SidebarItemProps` --references--> `AppMode`  [EXTRACTED]
  components/Sidebar.tsx → types.ts
- `SidebarProps` --references--> `AppMode`  [EXTRACTED]
  components/Sidebar.tsx → types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Turn-based voice loop (STT -> model chat -> TTS)** — readme_turn_based_voice_architecture, readme_web_speech_api, readme_stt_gateway, readme_omniroute_gateway, readme_tts_gateway [INFERRED 0.85]
- **Model output blocks parsed by the app** — readme_model_output_format, readme_correction_block, readme_assessment_block, readme_insight_block [EXTRACTED 1.00]

## Communities (22 total, 10 thin omitted)

### Community 0 - "Core App & AI Gateway"
Cohesion: 0.15
Nodes (24): App(), uid(), Header(), Props, SelectionTranslator(), MODEL_SUGGESTIONS, SettingsModal(), toggleCls() (+16 more)

### Community 1 - "Build Tooling & Deps"
Cohesion: 0.08
Nodes (26): dependencies, lucide-react, motion, react, react-dom, name, private, type (+18 more)

### Community 2 - "TypeScript Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, allowJs, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+14 more)

### Community 3 - "Assessment & Transcription Types"
Cohesion: 0.13
Nodes (15): AssessmentPanel(), AssessmentPanelProps, Correction, SessionAssessment, SessionState, SpeechRecognition, SpeechRecognitionAlternative, SpeechRecognitionErrorEvent (+7 more)

### Community 4 - "Translation & TTS Pipeline"
Cohesion: 0.17
Nodes (15): CorrectionCard(), Props, HoverableWord(), Props, Props, Props, AIConfigContext, AIConfigProvider() (+7 more)

### Community 5 - "Dev Dependencies"
Cohesion: 0.12
Nodes (17): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+9 more)

### Community 6 - "Session Modes & Sidebar"
Cohesion: 0.18
Nodes (11): Sidebar(), SidebarItemProps, SidebarProps, MODE_INFO, SYSTEM_INSTRUCTION, AppMode, CUSTOM, DAILY (+3 more)

### Community 7 - "Entry & Error Boundary"
Cohesion: 0.18
Nodes (7): ErrorBoundary, Props, State, root, rootElement, react, react-dom

### Community 8 - "npm Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, format:check, lint, lint:eslint, preview, typecheck

### Community 9 - "Coach Output Format (README)"
Cohesion: 0.33
Nodes (7): Longer Coach Replies Behavior, FluentDev README (AI English Speaking Coach for software developers), [Assessment] Block, [Correction] Block, [Insight] Block, Model Output Format (text blocks parsed by the app), SYSTEM_INSTRUCTION (coach system prompt in constants.ts)

### Community 10 - "Copilot Instructions (Graphify)"
Cohesion: 0.33
Nodes (6): Copilot Instructions (graphify workflow), GRAPH_REPORT.md (broad architecture review), graphify explain command, graphify path command, graphify query command, graphify-out/wiki/index.md (broad navigation)

### Community 12 - "HTML Entry Point"
Cohesion: 0.67
Nodes (3): index.html (Vite HTML entry), React entry script (/index.tsx), #root mount point

## Knowledge Gaps
- **101 isolated node(s):** `Props`, `Props`, `State`, `Props`, `MODEL_SUGGESTIONS` (+96 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 115 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Entry & Error Boundary` to `Core App & AI Gateway`, `Build Tooling & Deps`, `Assessment & Transcription Types`, `Translation & TTS Pipeline`, `Session Modes & Sidebar`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Dev Dependencies` to `Build Tooling & Deps`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `Core App & AI Gateway` to `Build Tooling & Deps`, `Assessment & Transcription Types`, `Translation & TTS Pipeline`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **What connects `Props`, `Props`, `State` to the rest of the system?**
  _101 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Build Tooling & Deps` be split into smaller, more focused modules?**
  _Cohesion score 0.08374384236453201 - nodes in this community are weakly interconnected._
- **Should `TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Assessment & Transcription Types` be split into smaller, more focused modules?**
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._