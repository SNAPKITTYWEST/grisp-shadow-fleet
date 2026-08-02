# SnapKitty Universe — Sovereign Station

**A persistent 3D life simulation running live in your browser.**
Walk a sovereign orbital station. Talk to 50 canon characters. Trade. Fly. Go EVA. Watch two armored cat-robots patrol the corridors and interact with the station's AI agents.

**Live →** [snapkittywest.github.io/grisp-shadow-fleet](https://snapkittywest.github.io/grisp-shadow-fleet/)

---

## What You're Looking At

You spawn inside **Sovereign Station** — a rotating orbital platform with 30 rooms across 6 decks, a functional economy, 50 named NPCs with real biographies, 12 sovereign AI agents, a player-owned ship, an EVA hull walk, and a planetary moon you can land on.

Everything is deterministic and WORM-sealed. Every NPC remembers what you do. Every trade, interaction, and social event gets appended to a SHA-256 chain.

```
Station interior → Airlock → EVA hull walk → Board ship → Undock → Fly → Land on Nacre Moon
```

---

## The Characters

### SnapKitty Users — Kitty-M and Kitty-C

Two fully-rigged armored cat-robot player characters patrol the station and interact with agents:

| | **Kitty-M** | **Kitty-C** |
|---|---|---|
| Fur | Orange tabby | Tuxedo black/white |
| Armor | Magenta/pink with chrome plates | Cyan/blue with chrome plates |
| Visor | Pink glow, purple eyes | Blue glow, green eyes |
| Helmet | Gray band, ear cups, camera | Gray band, ear cups, camera |
| Tail | Orange/white striped, 4-segment | Black/white striped, 4-segment |

Both characters animate across three states:
- **Patrol** — walk cycle with arm swing, leg swing, torso bob; navigate waypoints through the station
- **Interact** — stop at an agent, face them, nod head, gesture arm, visor pulses bright
- **Idle** — breathing bob, gentle arm sway, tail waving

Walk up to either character to open a dialogue channel.

### Canon NPCs — 50 named characters from the SnapKitty universe

Every NPC is seeded from the canon character roster with their real biography, personality, schedule, memories, and reaction weights. A few:

| Name | Role | Personality |
|---|---|---|
| **Asha Vey** | Civic architect | Patient, systems-minded — built the first pressure-safe commons |
| **Cael Rook** | Errant explorer | Fearless, irreverent — searching for a lost caravan beyond Nacre |
| **Pell Noor** | Memory archivist | Meticulous synthetic — fiercely protective of the audit chain |
| **Maren Sollis** | Station commander | Decisive, disciplined — kept the station alive through a pressure cascade |
| **Vera Mylaw** | Arbitration chair | Impartial judge — issued the first binding salvage ruling |
| **Ora Tannis** | Chief physician | Compassionate, overextended — triaged 22 crew in four hours |

NPCs run a layered behavior system: needs decay by personality (OCEAN traits), schedules update by world minute, social events seal into a per-character WORM chain.

### Sovereign Agents — 12 named AI custodians

| Agent | Domain | Presence |
|---|---|---|
| **BOB** | Station command / logistics | Command room hologram |
| **CARTO** | Navigation / route atlas | Navigation terminal |
| **ENKI** | Engineering / reactor | Engineering robot |
| **SENTINEL** | Security / investigation | Security body |
| **FORGE** | Fabrication / manufacturing | Cargo robot |
| **FLUX** | Market / trade routes | Market terminal |
| **NOVA** | Astronomy / anomaly tracking | Research terminal |
| **LEDGE** | History / event replay | Server archive terminal |

Every agent operates within bounded authority. Tasks outside their permission scope are rejected and audited. Fallback behaviors activate on failure.

---

## What You Can Do

| Action | How |
|---|---|
| Walk the station | WASD + mouse look |
| Open doors | Walk up, press E |
| Ride the elevator | Enter, select deck |
| Talk to an NPC or agent | Walk close, press E |
| Buy/sell commodities | Find Aurora Exchange, press E |
| Accept a mission | Mission bureau terminal |
| Equip EVA suit | EVA Sacristy locker |
| Cycle the airlock | Cyan Airlock A-01 panel |
| Walk the hull | After airlock depressurizes |
| Board your ship | Hangar, walk up to SKV Meridian |
| Undock and fly | Start engines, take control, undock |
| Land on Nacre Moon | Fly toward the moon, press land |
| Enter the settlement | Walk to Nyx operations habitat |
| Build a workshop | Deliver materials, work the project |
| Developer console | Press `` ` `` — `help` lists commands |

---

## The World

### Sovereign Station
30 functional rooms across 6 decks — command, navigation, reactor, engineering, medical, market, research, fabrication, hangar, hydroponics, quarters, observation, and more. Every room has a named interaction point, environmental state, and occupant tracking.

### The Economy
Live market with 8 commodities (water, nutrients, oxygen, alloy, medicine, fuel, circuits, artifacts). Prices move on trade. Production and consumption tick every game hour. Two markets: **Aurora Exchange** (station) and **Nacre Cooperative** (moon).

### Nacre Moon
Land on the Glass Plain, walk to the Nyx Meridian settlement, contact the operations habitat, survey wildlife habitats. The silica bloom opens its reflective fronds at stellar transit.

### Orbital Space
Traffic vessels on procedural routes, asteroid field, star systems, jump connections to distant systems. Everything streams in/out by proximity.

---

## Technology

| Layer | What it does |
|---|---|
| **Three.js** | Full 3D renderer — station geometry, orbital space, planetary region, animated characters |
| **UniverseCore** | Deterministic simulation engine — 13 subsystems, fixed-step tick loop, save/load with checksum |
| **WORM chain** | SHA-256 append-only event ledger — every NPC social event, trade, mission, and construction action is sealed |
| **Canon system** | 50 characters, 16 locations, 50 quests, 10 species, 24 equipment items — loaded from versioned JSON |
| **Tau Prolog gate** | Swarm dispatch governance — agent tasks consult Prolog rules before execution |
| **PopulationSystem** | OCEAN personality model — each character's need decay rate is tuned to their traits |
| **AgentSystem** | Bounded authority enforcement — permissions, audit log, deterministic fallback |

---

## Run Locally

```bash
git clone https://github.com/SNAPKITTYWEST/grisp-shadow-fleet
cd grisp-shadow-fleet
npm install
npm run dev
```

Open **http://localhost:5173**

```bash
npm test        # 24 tests — simulation, airlock, ship, NPC, economy, agents, construction
npm run build   # production bundle → _site/
```

---

## Architecture

```
universe/
├── app.ts              — entry point, wires renderer ↔ simulation ↔ HUD
├── UniverseCore.ts     — authoritative world state + system coordination
├── world-data.ts       — canon character seeding, world generation
├── GameRenderer.ts     — Three.js scenes, SnapKitty cat characters, animation
├── PopulationSystem.ts — NPC needs, WORM social sealing, OCEAN trait decay
├── AgentSystem.ts      — bounded authority, audit log, fallback
├── EconomySystem.ts    — live markets, price dynamics, trade routes
├── MissionSystem.ts    — state-driven missions, trigger conditions
├── DialogueSystem.ts   — trust-gated conversation, NPC memory
├── ShipSystem.ts       — flight, docking, landing, jump
├── InteriorSystem.ts   — doors, airlock interlocks, elevator, EVA
└── types.ts            — full type definitions for all entities
```

---

## Shadow Network

| Repo | Platform | |
|---|---|---|
| [grisp-shadow-fleet](https://github.com/SNAPKITTYWEST/grisp-shadow-fleet) | GitHub | **← you are here** |
| [shadow-orchestrator](https://gitlab.com/ahmad-parr-dev1-group/shadow-orchestrator) | GitLab | RANSOM.WORM sovereign page |
| [sovereign-emulator](https://github.com/SNAPKITTYWEST/sovereign-emulator) | GitHub | [Live](https://snapkittywest.github.io/sovereign-emulator/) |
| [sov-kernel-monster](https://github.com/SNAPKITTYWEST/sov-kernel-monster) | GitHub | Godot + canon bridge |

---

## License

Source-visible. Not open source.

- **License:** Sovereign Source License v3.0
- **Commercial use:** prohibited without written license
- **AI/model training:** prohibited without written license
- **Studying / judging:** allowed
- **Contact:** `jessicalw34@gmail.com` · subject `SK-LICENSE-REQUEST`

---

*Built by Ahmad Ali Parr · SnapKitty Collective · Bel Esprit D'Accord Irrevocable Trust*

![Canary](https://sovereign-analytics.snapkittywest.workers.dev/canary/grisp-shadow-fleet)
