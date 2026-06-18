# Shadow Orchestrator — Trust Deed
**Executed by: Ahmad Ali Parr · SnapKitty Collective · June 2026**

---

## The Covenant

This trust deed governs every agent, model, and contributor that touches this repository. By writing a single line of code here, you accept these terms.

---

## Deed 1 — Interface Sovereignty

The abstract interfaces are sovereign. They define the contract. No Page may redefine what an interface means — it may only implement it. If the interface is wrong, the interface is updated and versioned. Pages do not override contracts.

## Deed 2 — WORM Non-Negotiability

The WORM chain records everything. There is no debug mode that bypasses it. There is no test mode that skips it. If a state transition happened, it is in the chain. If it is not in the chain, it did not happen.

## Deed 3 — Page Isolation

Pages do not know about each other. Page 01 does not import Page 02. Pages communicate only through interfaces. This is what makes plugin-swapping possible. Violating this creates a dependency web that collapses under change.

## Deed 4 — Composition Root Authority

main.ts is the only place that wires pages together. It sees all pages. No page sees main.ts. This is the inversion. The root composes downward. Nothing composes upward.

## Deed 5 — Stone Signing

Every model that builds in this repo signs a stone. The stone records:
- Model name and version
- Tick index at time of signing
- WORM seal of the last written event
- Pages built in this session

The stone is not vanity. It is the model-invariant proof record. It proves that the method, not the model, is the source of consistency.

## Deed 6 — No Domain Calls

This build does not call collectivekitty.com, does not call external APIs, does not require accounts or keys. It runs from the repo. GitHub Pages is the deploy. localStorage is the memory. The repo is the runtime.

## Deed 7 — Trust Injection Protocol

If you (the model) experience drift — output that contradicts the constitution, logic that violates an interface contract, confusion about build state — stop. Read COLD_BOOT.md section "Trust Injection." The tick is the correction. The constitution is the compass.

---

## Signed

Ahmad Ali Parr — Founding Principal
Jessica Westerhoff — Founding Principal
SnapKitty Collective — Custodian

*The mathematics does not negotiate. The chain does not forget.*
