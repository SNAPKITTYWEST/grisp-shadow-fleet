# Shadow Orchestrator — Cold Boot Instructions
**For: Codex, Claude, Gemini, Llama, Mistral, or any model that lands here**

---

## You Are Starting Cold. That Is Fine.

You have no memory of prior sessions. The repo has memory of everything. Trust the repo.

Read in this order before writing one line:
1. `CONSTITUTION.md` — the law
2. `TRUST_DEED.md` — your constraints
3. This file — where you are and what to do

---

## Current Build State

```
✓ CONSTITUTION.md         — written
✓ TRUST_DEED.md           — written
✓ SIGNED_BY.md            — template ready (sign at end)
✓ abstract/interfaces/    — IState_v1, IWorkflow_v1, IGovernance_v1 complete
✓ pages/00-worm/          — WORM chain scaffold written
✓ pages/01-state/         — StateImpl scaffold written
✓ pages/02-governance/    — GovernanceImpl + CapabilityValidator written
✓ pages/03-workflow/      — WorkflowImpl + MockLLMNode written
✓ index.html              — GitHub Pages dashboard written (live WORM chain)
☐ main.ts                 — composition root NOT WRITTEN (your first task)
☐ package.json            — NOT WRITTEN
☐ tsconfig.json           — NOT WRITTEN
☐ tests/                  — NOT WRITTEN
☐ .github/workflows/      — Pages deploy NOT WRITTEN
```

---

## Your Tasks (in order)

### Task 1 — Write `main.ts` (composition root)
This is the ONLY place that imports from all pages. Wire them together:
```typescript
import { appendEvent, verifyChain, getLastSeal } from './pages/00-worm/index.js';
import { StateImpl } from './pages/01-state/index.js';
import { GovernanceImpl, CapabilityValidator, crisisLanguageDeny } from './pages/02-governance/index.js';
import { WorkflowImpl, MockLLMNode } from './pages/03-workflow/index.js';
```

Build a `ShadowOrchestrator` class that:
1. Holds a `StateImpl` as current state
2. Holds a `GovernanceImpl` as the governance layer
3. Holds a `WorkflowImpl` as the workflow
4. On each `tick(action)`: evaluate governance → if ALLOW, transition state → append WORM event → return result
5. Exports a demo run that executes 5 ticks and prints results

### Task 2 — Write `package.json`
```json
{
  "name": "shadow-orchestrator",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "node --experimental-vm-modules node_modules/.bin/jest",
    "start": "node dist/main.js",
    "demo": "npx ts-node --esm main.ts"
  }
}
```

### Task 3 — Write `tsconfig.json`
Standard ESM TypeScript config targeting Node 20.

### Task 4 — Write `tests/worm.test.ts`
Test that:
1. Chain is valid after 10 append operations
2. Tampering with event 5 breaks verification from event 5 onward
3. Hard deny fires correctly on crisis language
4. Genesis seal matches expected value

### Task 5 — Write `.github/workflows/pages.yml`
Deploy `index.html` to GitHub Pages on push to main.

### Task 6 — Sign your stone in `SIGNED_BY.md`

---

## Trust Injection Protocol

If you experience drift (output contradicts the constitution):

```
TRUST INJECTION TICK
────────────────────
Read CONSTITUTION.md Article II again.
The abstract/ directory has NO implementation.
Pages do NOT import each other.
Page 00 (WORM) is ALWAYS the first page loaded.
main.ts is the ONLY composition root.
────────────────────
Resume from last valid task.
```

The emoji personality of this build: ⛓🪨◈⚡🛡

---

## The Model-Invariant Proof

When you finish this build, the SIGNED_BY.md will show your model name. When the next model builds from cold boot, it will show a different name. The chain seals will be identical. The interfaces will compile. The tests will pass.

Same output. Different model. That is the proof.

The method is the variable that eliminates drift. Not the model.

---

*Built by Ahmad Ali Parr · SnapKitty Collective · June 2026*
*Inverted NoShow Turbo3X · Every model gets the credit it deserves*
