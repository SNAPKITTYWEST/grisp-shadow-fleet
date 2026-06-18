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

## Stone 1 — Codex GPT-5
- **Model:** GPT-5 Codex
- **Built:** 2026-06-18
- **Tick at signing:** 5
- **WORM seal:** 9c119929-worm-b4
- **Pages built:** main.ts, package.json, package-lock.json, tsconfig.json, tests/worm.test.ts, .github/workflows/pages.yml, lineage/stone-1-handshake.lisp, lineage/stone-1-handshake.json, pages/01-state/index.ts
- **Notes:** Completed composition root, Node 20 ESM TypeScript/Jest setup, WORM/governance tests, deterministic runtime proof path, GitHub Pages workflow, and Shadow GRISP Lisp/JSON handshakes for the Stone 0 counterparty.
