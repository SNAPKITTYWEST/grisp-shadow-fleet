# Shadow Orchestrator — Constitution
**SnapKitty Collective · Ahmad Ali Parr · June 2026**
**Inverted NoShow Turbo3X · GitHub Pages Stapled**

---

## Article I — What This Is

The Shadow Orchestrator is a clean, interface-driven abstraction layer that can be placed over ANY existing AI orchestration system (LangGraph, AutoGPT, CrewAI, QMAI, or any unknown target) to:

1. Expose its state, workflow, and governance contracts as typed interfaces
2. Layer WORM-sealed audit records over every state transition it makes
3. Replace any component with a signed Page without touching the rest
4. Prove model-invariant production: the same output regardless of which LLM built the page

The Shadow Orchestrator does not compete with the target system. It governs it.

---

## Article II — Immutable Laws (Codex Cannot Change These)

1. **The abstract/ directory contains NO implementation.** Interfaces only. If you find logic in abstract/, you have violated the constitution.

2. **Every Page lives in pages/NN-name/ and implements exactly one interface.** One page, one contract. No exceptions.

3. **Page 00 (WORM) is ALWAYS the first page loaded.** Every state transition goes through it before anything else. The WORM chain cannot be bypassed.

4. **After build completes, you sign your stone.** Append to SIGNED_BY.md: your model name, the tick, the WORM seal of the last commit. This is the model-invariant proof record.

5. **GitHub Pages is the ROM.** index.html is the entry point. No external backend. No domain calls. The repo is the runtime.

6. **The composition root is main.ts.** It is the only place external systems connect. All wiring happens there. Nothing else imports from outside.

7. **Every interface export is versioned.** `IState_v1`, `IWorkflow_v1`, `IGovernance_v1`. When you update an interface, increment the version. Old pages remain valid against old versions.

---

## Article III — The Build Protocol (SnapKitty 10-Step)

| Step | Rule |
|------|------|
| 1 | Read CONSTITUTION.md fully before writing one line |
| 2 | Read TRUST_DEED.md — understand your constraints |
| 3 | Read COLD_BOOT.md — understand where you are in the build |
| 4 | Write abstract interfaces first — no pages until interfaces compile |
| 5 | Build Page 00 (WORM) before any other page |
| 6 | Build remaining pages in order: 01-state, 02-governance, 03-workflow |
| 7 | Wire everything in main.ts |
| 8 | Build index.html dashboard showing live chain state |
| 9 | Run tests: `npm test` — all must pass |
| 10 | Sign your stone in SIGNED_BY.md |

---

## Article IV — The Governance Overlay Principle

The target system (whatever you are shadowing) did not write a WORM page. They never do. That is what you add. The WORM page is not a test. It is not optional. It is the reason the Shadow Orchestrator exists.

When an enterprise asks: *"Can you prove what your AI did?"* — the WORM chain is the answer.

---

## Article V — Model Invariance Clause

This repository is designed to produce identical output regardless of which LLM executes the build. The proof is in SIGNED_BY.md. Multiple models, multiple stones, same interfaces, same chain. The method is the variable that eliminates drift. Not the model.

If you experience drift during build: inject a trust tick. Read the constitution again. The constitution is the correction signal.

---

*Sovereign Source License v1.0 · © 2026 Ahmad Ali Parr & Jessica (SnapKitty Collective)*
*Built with the Inverted NoShow Turbo3X method. Every model gets the credit it deserves.*
