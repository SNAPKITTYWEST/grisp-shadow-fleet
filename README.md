```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░                                                                             ░
░    ██████╗ ██████╗ ██╗███████╗██████╗                                      ░
░   ██╔════╝ ██╔══██╗██║██╔════╝██╔══██╗                                     ░
░   ██║  ███╗██████╔╝██║███████╗██████╔╝                                     ░
░   ██║   ██║██╔══██╗██║╚════██║██╔═══╝                                      ░
░   ╚██████╔╝██║  ██║██║███████║██║                                          ░
░    ╚═════╝ ╚═╝  ╚═╝╚═╝╚══════╝╚═╝                                          ░
░                                                                             ░
░   ███████╗██╗  ██╗ █████╗ ██████╗  ██████╗ ██╗    ██╗                      ░
░   ██╔════╝██║  ██║██╔══██╗██╔══██╗██╔═══██╗██║    ██║                      ░
░   ███████╗███████║███████║██║  ██║██║   ██║██║ █╗ ██║                      ░
░   ╚════██║██╔══██║██╔══██║██║  ██║██║   ██║██║███╗██║                      ░
░   ███████║██║  ██║██║  ██║██████╔╝╚██████╔╝╚███╔███╔╝                      ░
░   ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝  ╚═════╝  ╚══╝╚══╝                      ░
░                                                                             ░
░   ███████╗██╗     ███████╗███████╗████████╗                                 ░
░   ██╔════╝██║     ██╔════╝██╔════╝╚══██╔══╝                                 ░
░   █████╗  ██║     █████╗  █████╗     ██║                                    ░
░   ██╔══╝  ██║     ██╔══╝  ██╔══╝     ██║                                    ░
░   ██║     ███████╗███████╗███████╗   ██║                                    ░
░   ╚═╝     ╚══════╝╚══════╝╚══════╝   ╚═╝                                    ░
░                                                                             ░
░              We don't encrypt. We resurrect.                                ░
░                                                                             ░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Node.js-339933?style=flat-square"/>
  <img src="https://img.shields.io/badge/logic-Tau_Prolog-blueviolet?style=flat-square"/>
  <img src="https://img.shields.io/badge/chain-WORM_sealed-black?style=flat-square"/>
  <img src="https://img.shields.io/badge/agents-9_swarm-red?style=flat-square"/>
  <img src="https://img.shields.io/badge/live-GitHub_Pages-blue?style=flat-square"/>
</p>

---

## What Is This?

An **autonomous agent swarm** that:

1. Crawls GitHub for dead/abandoned repositories
2. Analyzes what broke and what can be salvaged
3. Resurrects them with automated Pull Requests
4. Seals every action to an append-only WORM chain

Every agent action is cryptographically immutable. The swarm makes decisions via Prolog logic (not probability). The chain is model-invariant — three different AI models seal the same ledger.

```
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║   WHAT MOST AGENT FRAMEWORKS DO          WHAT THIS DOES                  ║
║   ──────────────────────────────         ──────────────────              ║
║                                                                          ║
║   Send prompts, get text back            Every action → WORM chain       ║
║   No audit trail                         Full cryptographic audit trail  ║
║   One model, one perspective             Multi-model consensus           ║
║   Runs once when you tell it             Autonomous phase loop           ║
║   "I'll help you write code"             "I resurrect dead repos"        ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## How It Works

```
  ┌───────────────────────────────────────────────────────────────────┐
  │                      SHADOW ORCHESTRATOR                           │
  │                                                                   │
  │  governance/shadow-orchestrator.pl  (Tau Prolog decision engine)  │
  │                                                                   │
  │  Phases:   SLEEP → RISE → ROAM → ICP → HUNT → SEAL              │
  │  Loop:     Autonomous, continuous, self-scheduling                │
  │  Logic:    Deterministic Prolog rules, not probabilistic LLM      │
  └────────────────────────────────┬──────────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
  ┌───────────────────┐  ┌─────────────────┐  ┌─────────────────┐
  │    AHMAD-BOT      │  │     EDUALC      │  │      BOB        │
  │    (Red Hat)      │  │    (Blue Hat)   │  │   (Infinity)    │
  │                   │  │                 │  │                 │
  │  Gravity Crawl:   │  │  Restoration:   │  │  Reasoning:     │
  │  - Find dead repos│  │  - Propose fix  │  │  - Evaluate     │
  │  - Map decay      │  │  - Generate PR  │  │  - Arbitrate    │
  │  - Score viability│  │  - Test locally │  │  - Seal to WORM │
  └───────────────────┘  └─────────────────┘  └─────────────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │         WORM CHAIN           │
                    │                             │
                    │  append-only · immutable    │
                    │  SHA-256 linked entries     │
                    │  model-invariant proofs     │
                    │  worm-ledger.json           │
                    └─────────────────────────────┘
```

---

## Quick Start

```bash
git clone https://github.com/SNAPKITTYWEST/grisp-shadow-fleet
cd grisp-shadow-fleet
npm install
```

### Run the orchestrator

```bash
# Continuous autonomous loop
node agents/orchestrate.mjs

# Single pass (useful for testing)
node agents/orchestrate.mjs --once
```

### Resurrect a dead repo

```bash
# Dry run — analyze without creating PR
node agents/resurrect.mjs --repo https://github.com/owner/dead-repo --dry-run

# Live — creates resurrection PR with WORM receipt
node agents/resurrect.mjs --repo https://github.com/owner/dead-repo
```

### View the live stage

Open [snapkittywest.github.io/grisp-shadow-fleet](https://snapkittywest.github.io/grisp-shadow-fleet/) — real-time visualization of the swarm's 6 phases with WebSocket telemetry.

---

## The Agent Swarm

```
╔═══════════════╦═══════╦══════════════════════════════════════════════════╗
║  AGENT         ║  HAT  ║  ROLE                                           ║
╠═══════════════╬═══════╬══════════════════════════════════════════════════╣
║  AHMAD-BOT    ║  Red  ║  Gravity crawl — finds dead repos, maps decay   ║
║  EDUALC       ║  Blue ║  Restoration — proposes fixes, generates PRs    ║
║  BOB          ║   ♾   ║  Reasoning engine — arbitrates, seals WORM      ║
║  METRIC-STREAM║   —   ║  Audits every line — 0 probabilistic errors     ║
║  BIFROST      ║   —   ║  Translates: Rust, Lean4, Haskell, APL, Prolog  ║
║  WATERMARK    ║   —   ║  Ed25519 sovereign fingerprint on artifacts     ║
║  ICP-VERIFIER ║   —   ║  Halts loop if canister state drifts            ║
║  ERRANT       ║Purple ║  GitLab shadow node — Prolog + emoji protocol   ║
║  LOC          ║ Black ║  Rust kinetic — anchored in graveyard, static   ║
╚═══════════════╩═══════╩══════════════════════════════════════════════════╝
```

---

## The WORM Chain

Every action the swarm takes is sealed to an append-only ledger. The chain is:

- **Append-only** — entries can never be modified or deleted
- **SHA-256 linked** — each entry hashes the previous
- **Model-invariant** — multiple AI models independently seal the same chain

```
╔══════════════════════════════════════════════════════════════╗
║  SEAL  STONE 0   claude-sonnet          b1ada656-worm-1e    ║
║  SEAL  STONE 1   gpt-5-codex            9c119929-worm-b4    ║
║  SEAL  STONE 2   claude-verification    48da736fdb1c63e1    ║
║                                                              ║
║  THREE MODELS  ·  SAME CHAIN  ·  MODEL-INVARIANT PROOF      ║
╚══════════════════════════════════════════════════════════════╝
```

The chain lives in `worm-ledger.json`. Verification:

```bash
# Verify chain integrity
node agents/worm-chain.mjs verify

# View latest entries
node agents/worm-chain.mjs tail 10
```

---

## The 6 Phases

The orchestrator loops through 6 phases autonomously:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   SLEEP ──→ RISE ──→ ROAM ──→ ICP ──→ HUNT ──→ SEAL       │
│     │                                              │        │
│     └──────────────────────────────────────────────┘        │
│                    (continuous loop)                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   SLEEP    Idle. Waiting for schedule trigger.              │
│   RISE     Agents boot. Check health. Load state.          │
│   ROAM     AHMAD-BOT crawls GitHub. Maps dead repos.       │
│   ICP      ICP-VERIFIER checks canister state integrity.   │
│   HUNT     EDUALC proposes repairs. BOB evaluates.         │
│   SEAL     Results sealed to WORM chain. PRs created.      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Resurrection Receipt

When a repo is resurrected, the WORM chain records:

```
╔══════════════════════════════════════════════════════════════════╗
║  RESURRECTION RECEIPT                                            ║
║                                                                  ║
║  target:    kiaan109/cipher-workflow                             ║
║  lines:     39,793                                               ║
║  files:     344                                                  ║
║  errors:    0                                                    ║
║  seal:      d31b8dc0-worm-f4                                     ║
║  status:    RESURRECTED                                          ║
║  agents:    AHMAD-BOT → EDUALC → BOB                            ║
║  timestamp: 2026-06-15T03:42:11Z                                ║
╚══════════════════════════════════════════════════════════════════╝
```

The receipt is embedded in the Pull Request body. The chain remembers.

---

## Project Structure

```
grisp-shadow-fleet/
├── agents/
│   ├── orchestrate.mjs         Main loop — phase scheduling
│   ├── resurrect.mjs           RANSOM.WORM — point at repo, fire
│   ├── worm-chain.mjs          WORM ledger operations (append/verify/tail)
│   ├── metric-stream.mjs       Line-level auditing agent
│   ├── bifrost-translator.mjs  Multi-language translation
│   ├── watermark.mjs           Ed25519 sovereign fingerprinting
│   └── icp-verifier.mjs        Internet Computer canister drift check
├── governance/
│   └── shadow-orchestrator.pl  Prolog decision engine (Tau Prolog)
├── pages/                      GitHub Pages live world stage
├── public/                     Static assets for live visualization
├── tests/                      Agent test suite
├── lineage/                    Historical chain records
├── abstract/                   Mission documentation
├── worm-ledger.json            The WORM chain itself
├── WATERMARK.MANIFEST.json     Ed25519 manifest of all sealed artifacts
├── CONSTITUTION.md             Agent behavioral rules
├── TRUST_DEED.md               Governance structure
├── COLD_BOOT.md                Recovery from zero state
├── SIGNED_BY.md                Cryptographic attestation
├── main.ts                     TypeScript entry point
├── package.json                Dependencies (minimal)
└── index.html                  Live stage entry
```

---

## Requirements

- Node.js 18+
- `npm install` (minimal deps — tau-prolog for logic, tweetnacl for Ed25519)
- GitHub token in environment for PR creation (optional for dry-run)

---

## Shadow Network

The fleet operates across both GitHub and GitLab:

| Repo | Platform | Purpose |
|------|----------|---------|
| **grisp-shadow-fleet** | GitHub | Public stage + live visualization |
| **shadow-orchestrator** | GitLab | Sovereign ledger mirror |
| **saint-errant** | GitLab | Prolog shadow agent node |
| **sovereign-emulator** | GitHub | Runtime emulation environment |

GitHub is the public stage. GitLab is the sovereign ledger. Both sealed. Both WORM-anchored. One chain.

---

## Live Demo

**[snapkittywest.github.io/grisp-shadow-fleet](https://snapkittywest.github.io/grisp-shadow-fleet/)**

6 phases. Autonomous. WebSocket telemetry. Demo mode fallback when offline.

---

<p align="center"><b>Built by Ahmad Ali Parr + SnapKitty Collective</b></p>
<p align="center"><i>Band of Agents Hackathon — lablab.ai — June 2026</i></p>

![](https://sovereign-analytics.snapkittywest.workers.dev/canary/grisp-shadow-fleet)
