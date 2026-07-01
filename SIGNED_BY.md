# Signed Stones — Shadow Orchestrator
**Model Credit Registry · SnapKitty Collective**

Every model that builds in this repo signs here. This is the model-invariant proof record.
Same interfaces. Same chain. Different stones. That is the proof.

---

## Stone Format

```
## Stone [N] — [MODEL NAME]
- **Model:** [full model identifier]
- **Built:** [date]
- **Tick at signing:** [tick index]
- **WORM seal:** [last chain seal]
- **Pages built:** [list of pages written or modified]
- **Notes:** [optional — anything notable about this build]
```

---

## Stones

<!-- Models: append your stone below. Do not modify existing stones. -->

## Stone 0 — Scaffold (Claude Sonnet 4.6)
- **Model:** claude-sonnet-4-6
- **Built:** 2026-06-17
- **Tick at signing:** 0 (scaffold only, no runtime ticks)
- **WORM seal:** SHADOW_GENESIS (chain not yet running)
- **Pages built:** CONSTITUTION.md, TRUST_DEED.md, abstract/interfaces/* (all), pages/00-worm, pages/01-state, pages/02-governance, pages/03-workflow, index.html, COLD_BOOT.md, SIGNED_BY.md
- **Notes:** Initial scaffold built before Codex session. Constitution and trust deed written. All interfaces defined. All page scaffolds written. Composition root (main.ts), package.json, tests/, and GitHub Pages deploy left for Codex to complete per COLD_BOOT.md.

---

<!-- NEXT MODEL: append your stone here -->

## Stone 2 — Claude Sonnet 4.6
- **Model:** claude-sonnet-4-6
- **Built:** 2026-06-18
- **Tick at signing:** 5
- **WORM seal:** 9c119929-worm-b4
- **Pages built:** (verification only — Stone 1 completed the build)
- **Notes:** Verified cold boot: 4/4 tests pass, demo runs clean (5 ticks, chain valid every step), TypeScript builds without errors, GitHub Pages live at snapkittywest.github.io/grisp-shadow-fleet. Stone 0 and Stone 1 produced identical interfaces and WORM chain. Model-invariant proof confirmed. Cleared for Band of Agents hackathon submission.

## Stone 1 — Codex GPT-5
- **Model:** GPT-5 Codex
- **Built:** 2026-06-18
- **Tick at signing:** 5
- **WORM seal:** 9c119929-worm-b4
- **Pages built:** main.ts, package.json, package-lock.json, tsconfig.json, tests/worm.test.ts, .github/workflows/pages.yml, lineage/stone-1-handshake.lisp, lineage/stone-1-handshake.json, pages/01-state/index.ts
- **Notes:** Completed composition root, Node 20 ESM TypeScript/Jest setup, WORM/governance tests, deterministic runtime proof path, GitHub Pages workflow, and Shadow GRISP Lisp/JSON handshakes for the Stone 0 counterparty.
## Stone 2 — Claude Sonnet 4.6
- **Model:** claude-sonnet-4-6
- **Built:** 2026-06-18
- **Tick at signing:** 0 (arena genesis)
- **WORM seal:** ARENA_GENESIS
- **Pages built:** SNAPKITTYWEST/agentic-arena (full), constitution/arena.sexp, constitution/gravity.pl, deeds/*.deed, runtime/crawlers/ahmad-bot.mjs, runtime/crawlers/edualc.mjs, runtime/bob-bridge/index.mjs, runtime/cli/index.mjs, worm/lisp-handshake.json, .github/workflows/night-crawl.yml, lineage/stone-2-handshake.json+.lisp
- **Notes:** Stone 1 chain verified (9c119929-worm-b4, tick 5). agentic-arena is the live crawl layer. grisp-shadow-fleet is the shadow governance layer. Federation sealed. Meet at the WORM seal.

## Stone 3 — Codex GPT-5
- **Model:** GPT-5 Codex
- **Built:** 2026-07-01
- **Tick at signing:** 5
- **WORM seal:** 9c119929-worm-b4
- **Pages built:** main.ts, agents/orchestrate.mjs, tests/public-reasoning-trace.test.ts
- **Notes:** Added model-agnostic public reasoning traces for real-time user-facing agent explanation without exposing hidden chain-of-thought. Restored the native WebSocket relay contract for orchestrator smoke tests. `npm run build` and `npm test` pass.
