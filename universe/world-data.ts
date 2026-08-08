import { DeterministicRandom, deterministicId, normalizeSeed, rotation, vector } from './deterministic.js';
import type {
  AgentDomain,
  AsteroidState,
  CelestialBodyState,
  CommodityState,
  ConstructionState,
  DialogueState,
  DoorState,
  EconomyState,
  ElevatorState,
  EnvironmentState,
  FactionState,
  HullSectionState,
  JumpConnectionState,
  LifeformState,
  MarketState,
  MissionState,
  NpcPersonality,
  NpcReactionWeights,
  NpcState,
  NpcVoiceStyle,
  PlanetaryRegionState,
  RoomState,
  SettlementState,
  ShipState,
  SovereignAgentState,
  StarSystemState,
  StreamingCellState,
  TrafficRouteState,
  TrafficVesselState,
  UniverseConfig,
  UniverseState,
  WorldLayer,
} from './types.js';

export const DEFAULT_UNIVERSE_CONFIG: UniverseConfig = {
  seed: 'snapkitty-sovereign-01',
  tickDurationMs: 100,
  epochIso: '2248-03-14T09:26:00.000Z',
  maxCatchUpTicks: 100,
  rebaseDistanceM: 100_000,
  streamingRadiusM: 30_000,
};

const PRESSURIZED: EnvironmentState = {
  pressureKpa: 101.3,
  oxygenFraction: 0.209,
  temperatureC: 21,
  gravityMps2: 5.4,
  radiationMsvPerHour: 0.001,
  breathable: true,
};

interface RoomSpec {
  id: string;
  name: string;
  purpose: string;
  deck: number;
  interactionKind: RoomState['interactionPoints'][number]['kind'];
  interactionName: string;
  permissions?: string[];
}

const ROOM_SPECS: readonly RoomSpec[] = [
  { id: 'room-arrivals', name: 'Pilgrim Arrivals', purpose: 'Receives crews, verifies identity, and assigns station access.', deck: 1, interactionKind: 'terminal', interactionName: 'Sovereign Entry Registry' },
  { id: 'room-command', name: 'Crown Command', purpose: 'Coordinates station authority and incident response.', deck: 0, interactionKind: 'control-panel', interactionName: 'Command Dais', permissions: ['station.command'] },
  { id: 'room-navigation', name: 'Celestial Navigation', purpose: 'Tracks orbital traffic and computes local trajectories.', deck: 0, interactionKind: 'terminal', interactionName: 'Luminous Orrery', permissions: ['navigation.plot'] },
  { id: 'room-tactical', name: 'Shield Reliquary', purpose: 'Controls defensive shields and weapons safeties.', deck: 0, interactionKind: 'control-panel', interactionName: 'Defense Lattice', permissions: ['security.defense'] },
  { id: 'room-comms', name: 'Choir Communications', purpose: 'Maintains encrypted station and deep-space communications.', deck: 0, interactionKind: 'terminal', interactionName: 'Entangled Relay Console', permissions: ['communications.transmit'] },
  { id: 'room-operations', name: 'Orbital Operations', purpose: 'Schedules docking, cargo lanes, repairs, and shift handoffs.', deck: 1, interactionKind: 'workstation', interactionName: 'Operations Table' },
  { id: 'room-reactor', name: 'Helios Reactor', purpose: 'Generates primary power for the station.', deck: -2, interactionKind: 'control-panel', interactionName: 'Reactor Governor', permissions: ['engineering.reactor'] },
  { id: 'room-engineering', name: 'Engineering Nave', purpose: 'Repairs station machinery and distributes maintenance work.', deck: -1, interactionKind: 'repair-node', interactionName: 'Diagnostic Spine', permissions: ['engineering.repair'] },
  { id: 'room-coolant', name: 'Coolant Cloister', purpose: 'Circulates thermal fluid and rejects reactor heat.', deck: -2, interactionKind: 'control-panel', interactionName: 'Thermal Manifold', permissions: ['engineering.thermal'] },
  { id: 'room-life-support', name: 'Atmospheric Garden', purpose: 'Scrubs air, recycles water, and regulates habitat pressure.', deck: -1, interactionKind: 'control-panel', interactionName: 'Atmosphere Loom', permissions: ['environment.control'] },
  { id: 'room-medical', name: 'Mercy Clinic', purpose: 'Provides triage, surgery, rehabilitation, and preventive care.', deck: 1, interactionKind: 'medical-bed', interactionName: 'Autodoc Cradle', permissions: ['medical.treat'] },
  { id: 'room-quarantine', name: 'Quarantine Chapel', purpose: 'Contains biological or synthetic contamination.', deck: 1, interactionKind: 'medical-bed', interactionName: 'Isolation Pod', permissions: ['medical.quarantine'] },
  { id: 'room-research', name: 'Anomaly Laboratory', purpose: 'Studies xenobiology, materials, and local anomalies.', deck: 2, interactionKind: 'workstation', interactionName: 'Spectral Analyzer', permissions: ['research.experiment'] },
  { id: 'room-server', name: 'Black Glass Archive', purpose: 'Stores sovereign memory, simulations, and audit records.', deck: 2, interactionKind: 'terminal', interactionName: 'Memory Well', permissions: ['archive.read'] },
  { id: 'room-fabrication', name: 'Matter Foundry', purpose: 'Fabricates tools, ship parts, and construction components.', deck: -1, interactionKind: 'fabricator', interactionName: 'Industrial Fabricator' },
  { id: 'room-cargo', name: 'Cargo Basilica', purpose: 'Sorts imports, exports, mission freight, and bonded goods.', deck: -1, interactionKind: 'storage', interactionName: 'Cargo Gantry' },
  { id: 'room-market', name: 'Aurora Exchange', purpose: 'Hosts regulated trade, contracts, and civilian services.', deck: 1, interactionKind: 'market-stall', interactionName: 'Commodity Exchange' },
  { id: 'room-galley', name: 'Common Table', purpose: 'Feeds residents and provides communal gathering space.', deck: 2, interactionKind: 'fabricator', interactionName: 'Nutrition Printer' },
  { id: 'room-hydroponics', name: 'Starlight Hydroponics', purpose: 'Produces food, oxygen, medicines, and habitat biomass.', deck: 2, interactionKind: 'workstation', interactionName: 'Growth Controller' },
  { id: 'room-quarters-a', name: 'East Habitation', purpose: 'Provides private housing for civilian residents.', deck: 3, interactionKind: 'storage', interactionName: 'Resident Locker' },
  { id: 'room-quarters-b', name: 'West Habitation', purpose: 'Provides housing for station crews and visiting specialists.', deck: 3, interactionKind: 'storage', interactionName: 'Crew Locker' },
  { id: 'room-security', name: 'Custodian Watch', purpose: 'Dispatches patrols and reviews station safety reports.', deck: 1, interactionKind: 'terminal', interactionName: 'Security Dispatch', permissions: ['security.dispatch'] },
  { id: 'room-brig', name: 'Reconciliation Cells', purpose: 'Securely holds detainees with monitored legal access.', deck: 0, interactionKind: 'control-panel', interactionName: 'Custody Console', permissions: ['security.custody'] },
  { id: 'room-observation', name: 'Far Window', purpose: 'Provides direct visual observation of simulated orbital space.', deck: 3, interactionKind: 'viewport', interactionName: 'Optical Survey Array' },
  { id: 'room-hangar', name: 'Voidship Hangar', purpose: 'Services, boards, launches, and receives spacecraft.', deck: -1, interactionKind: 'ship-console', interactionName: 'Launch Marshal', permissions: ['hangar.launch'] },
  { id: 'room-eva-prep', name: 'EVA Sacristy', purpose: 'Stores suits and prepares crews for exterior work.', deck: -1, interactionKind: 'airlock-control', interactionName: 'Suit Integrity Station' },
  { id: 'room-airlock-chamber', name: 'Cyan Airlock One', purpose: 'Safely transfers personnel between atmosphere and vacuum.', deck: -1, interactionKind: 'airlock-control', interactionName: 'Airlock Cycle Panel' },
  { id: 'room-transit-lift', name: 'Spine Elevator', purpose: 'Moves people and cargo among all station decks.', deck: 1, interactionKind: 'control-panel', interactionName: 'Deck Selector' },
  { id: 'room-maintenance', name: 'Maintenance Veins', purpose: 'Provides access to conduits, structural members, and emergency bypasses.', deck: -2, interactionKind: 'ladder', interactionName: 'Service Ladder' },
  { id: 'room-docking', name: 'Docking Concourse', purpose: 'Transfers passengers and freight to docked vessels.', deck: 1, interactionKind: 'terminal', interactionName: 'Dock Assignment Board' },
] as const;

const CONNECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['room-arrivals', 'room-operations'], ['room-arrivals', 'room-market'], ['room-arrivals', 'room-docking'],
  ['room-operations', 'room-command'], ['room-command', 'room-navigation'], ['room-command', 'room-tactical'],
  ['room-command', 'room-comms'], ['room-operations', 'room-transit-lift'], ['room-market', 'room-galley'],
  ['room-market', 'room-medical'], ['room-medical', 'room-quarantine'], ['room-galley', 'room-hydroponics'],
  ['room-hydroponics', 'room-research'], ['room-research', 'room-server'], ['room-server', 'room-observation'],
  ['room-observation', 'room-quarters-a'], ['room-observation', 'room-quarters-b'], ['room-security', 'room-brig'],
  ['room-security', 'room-arrivals'], ['room-transit-lift', 'room-engineering'], ['room-engineering', 'room-reactor'],
  ['room-reactor', 'room-coolant'], ['room-engineering', 'room-life-support'], ['room-engineering', 'room-fabrication'],
  ['room-fabrication', 'room-cargo'], ['room-cargo', 'room-hangar'], ['room-hangar', 'room-eva-prep'],
  ['room-coolant', 'room-maintenance'], ['room-maintenance', 'room-life-support'], ['room-docking', 'room-hangar'],
] as const;

function createInterior(): { rooms: RoomState[]; doors: DoorState[]; elevators: ElevatorState[] } {
  const rooms = ROOM_SPECS.map((spec, index): RoomState => ({
    id: spec.id,
    name: spec.name,
    purpose: spec.purpose,
    deck: spec.deck,
    bounds: {
      center: vector((index % 6) * 24 - 60, spec.deck * 18, Math.floor(index / 6) * 30 - 50),
      halfExtents: vector(spec.id === 'room-hangar' ? 34 : 10, spec.id === 'room-hangar' ? 9 : 5, spec.id === 'room-hangar' ? 26 : 12),
    },
    environment: { ...PRESSURIZED },
    doorIds: [],
    interactionPoints: [{
      id: `interaction-${spec.id.slice(5)}`,
      name: spec.interactionName,
      kind: spec.interactionKind,
      purpose: spec.purpose,
      enabled: true,
      permissions: [...(spec.permissions ?? [])],
      state: { uses: 0, lastUsedTick: -1 },
    }],
    capacity: spec.id === 'room-hangar' ? 80 : 20,
    occupantIds: [],
    ownerFactionId: 'faction-sovereign',
    damage: 0,
    powerOnline: true,
  }));

  const byId = new Map(rooms.map((room) => [room.id, room]));
  const doors: DoorState[] = CONNECTIONS.map(([fromRoomId, toRoomId], index) => {
    const id = deterministicId('door', index + 1);
    byId.get(fromRoomId)?.doorIds.push(id);
    byId.get(toRoomId)?.doorIds.push(id);
    return {
      id,
      name: `${byId.get(fromRoomId)?.name ?? fromRoomId} / ${byId.get(toRoomId)?.name ?? toRoomId}`,
      kind: fromRoomId === 'room-security' && toRoomId === 'room-brig' ? 'blast' : 'sliding',
      fromRoomId,
      toRoomId,
      functionalPurpose: `Provides traversable access between ${fromRoomId} and ${toRoomId}.`,
      position: 'closed',
      openFraction: 0,
      locked: false,
      powered: true,
      sealIntegrity: 1,
      requiredPermission: fromRoomId === 'room-security' && toRoomId === 'room-brig' ? 'security.custody' : null,
      airlockId: null,
    };
  });

  const inner: DoorState = {
    id: 'door-airlock-inner', name: 'Cyan Airlock Inner Seal', kind: 'airlock-inner',
    fromRoomId: 'room-eva-prep', toRoomId: 'room-airlock-chamber', functionalPurpose: 'Seals station atmosphere before depressurization.',
    position: 'closed', openFraction: 0, locked: false, powered: true, sealIntegrity: 1,
    requiredPermission: null, airlockId: 'airlock-cyan-01',
  };
  const outer: DoorState = {
    id: 'door-airlock-outer', name: 'Cyan Airlock Outer Seal', kind: 'airlock-outer',
    fromRoomId: 'room-airlock-chamber', toRoomId: null, functionalPurpose: 'Opens onto the walkable exterior hull after depressurization.',
    position: 'closed', openFraction: 0, locked: true, powered: true, sealIntegrity: 1,
    requiredPermission: null, airlockId: 'airlock-cyan-01',
  };
  byId.get('room-eva-prep')?.doorIds.push(inner.id);
  byId.get('room-airlock-chamber')?.doorIds.push(inner.id, outer.id);
  doors.push(inner, outer);

  return {
    rooms,
    doors,
    elevators: [{
      id: 'elevator-spine', name: 'Sovereign Spine Lift', roomId: 'room-transit-lift', servedDecks: [-2, -1, 0, 1, 2, 3],
      currentDeck: 1, targetDeck: null, progress: 0, doorOpen: true, powered: true, occupantIds: [],
    }],
  };
}

function createFactions(): FactionState[] {
  const definitions: ReadonlyArray<readonly [string, string, string]> = [
    ['faction-sovereign', 'SnapKitty Sovereign Compact', 'Transparent authority, mutual aid, and bounded machine governance.'],
    ['faction-guild', 'Vesper Trade Guild', 'Free exchange backed by enforceable contracts and resilient supply.'],
    ['faction-science', 'Far Lantern Institute', 'Open inquiry constrained by biosphere and personhood safeguards.'],
    ['faction-freebooters', 'Cinder Wake', 'Local autonomy, salvage rights, and resistance to central ownership.'],
    ['faction-lunar', 'Nacre Moon Cooperative', 'Stewardship of lunar settlements and shared industrial capacity.'],
  ];
  return definitions.map(([id, name, doctrine], index) => ({
    id, name, doctrine, treasury: 100_000 + index * 25_000,
    territoryIds: index === 0 ? ['station-sovereign-01'] : index === 4 ? ['region-nacre-landing'] : [],
    memberNpcIds: [], relations: {}, sanctions: [], activeConflictIds: [], goals: [`Secure ${name} continuity`, 'Protect members'],
  }));
}

const OCCUPATIONS = [
  'command officer', 'navigator', 'reactor engineer', 'security custodian', 'physician', 'market broker',
  'xenobiologist', 'diplomatic envoy', 'cargo coordinator', 'survey pilot', 'emergency technician', 'atmosphere gardener',
];
const WORK_LOCATIONS = [
  'room-command', 'room-navigation', 'room-reactor', 'room-security', 'room-medical', 'room-market',
  'room-research', 'room-comms', 'room-cargo', 'room-hangar', 'room-engineering', 'room-life-support',
];

/** Maps canon location IDs to simulation room IDs */
const CANON_LOCATION_MAP: Readonly<Record<string, string>> = {
  'loc-council-spire':       'room-command',
  'loc-sovereign-cathedral': 'room-operations',
  'loc-carto-observatory-guild': 'room-research',
  'loc-forge-orbital-shipyard':  'room-fabrication',
  'loc-bob-logistics-core':      'room-cargo',
  'loc-bob-voyager':             'room-hangar',
  'loc-flux-grand-exchange':     'room-market',
  'loc-qataaum-quantum-lab':     'room-research',
  'loc-enki-reactor-sanctum':    'room-reactor',
  'loc-sentinel-security-ring':  'room-security',
  'loc-worm-ledger-archive':     'room-server',
  'loc-lumen-biosphere':         'room-hydroponics',
  'loc-mylaw-tribunal':          'room-command',
  'loc-alienchain-registry':     'room-arrivals',
  'loc-apple2-museum-station':   'room-observation',
  'loc-outer-belt-mining-colony':'room-cargo',
};

function resolveCanonLocation(loc: string | null | undefined, fallback: string): string {
  if (!loc) return fallback;
  return CANON_LOCATION_MAP[loc] ?? fallback;
}

/** Species id → display name */
const SPECIES_DISPLAY: Readonly<Record<string, string>> = {
  'species-human':               'human',
  'species-synthetic-citizen':   'synthetic person',
  'species-space-adapted':       'space-adapted human',
  'species-deep-space-nomad':    'deep-space nomad',
  'species-bioengineered-explorer': 'bioengineered explorer',
  'species-ancient-precursor':   'ancient precursor',
  'species-machine-civilization':'machine civilisation',
  'species-swarm-intelligence':  'swarm intelligence',
  'species-energy-entity':       'energy entity',
  'species-living-ship':         'living ship',
};

/** Derive OCEAN-shaped need-decay modifiers from personality traits */
function traitDecay(traits: string[]): NpcPersonality['needDecayMod'] {
  const t = traits.map((x) => x.toLowerCase());
  const open   = t.some((x) => x.includes('curious') || x.includes('creative') || x.includes('explorer'));
  const cons   = t.some((x) => x.includes('conscientious') || x.includes('systems') || x.includes('meticulous'));
  const extra  = t.some((x) => x.includes('social') || x.includes('warm') || x.includes('extravert'));
  const agree  = t.some((x) => x.includes('patient') || x.includes('protective') || x.includes('loyal'));
  const neuro  = t.some((x) => x.includes('anxious') || x.includes('fearful') || x.includes('volatile'));
  return {
    nutrition:  cons   ? 0.82 : 1.0,
    rest:       neuro  ? 1.2  : agree ? 0.85 : 1.0,
    safety:     neuro  ? 1.3  : 0.9,
    belonging:  extra  ? 1.1  : open  ? 0.9  : 1.0,
    purpose:    open   ? 0.7  : cons  ? 0.75 : 1.0,
  };
}

const DEFAULT_REACTION_WEIGHTS: NpcReactionWeights = {
  promises: 0.3, theft: -0.5, combat: -0.2, rescues: 0.6, gifts: 0.4,
  betrayals: -0.9, negotiations: 0.2, contracts: 0.3, lies: -0.5, debts: -0.2,
};

function defaultPersonality(): NpcPersonality {
  return {
    traits: ['dutiful'], values: ['station continuity'], flaw: 'Defaults to routine under stress.',
    needDecayMod: { nutrition: 1.0, rest: 1.0, safety: 1.0, belonging: 1.0, purpose: 1.0 },
  };
}
function defaultVoice(): NpcVoiceStyle { return { register: 'professional', cadence: 'measured', markers: [] }; }

// ── Canon character roster (seeded from canon/v1/characters.json) ──────────────
interface CanonCharacter {
  id: string; name: string; category: string; speciesId?: string; origin?: string;
  occupation?: string; homeLocationId?: string; workLocationId?: string;
  schedule?: Array<{ startHour: number; endHour: number; locationId: string; activity: string }>;
  personality?: { traits?: string[]; values?: string[]; flaw?: string };
  voiceStyle?: { register?: string; cadence?: string; markers?: string[] };
  dynamicReactions?: Partial<NpcReactionWeights>;
  trustValues?: { player?: number; council?: number; faction?: number; strangers?: number };
  memories?: Array<{ id: string; kind?: string; summary: string; emotionalWeight?: number; canonEventId?: string }>;
  relationships?: Array<{ characterId: string; kind: string; bond: number }>;
  longTermGoals?: string[];
  needs?: { nutrition?: number; rest?: number; safety?: number; belonging?: number; purpose?: number };
  inventory?: string[];
}

const CANON_CHARACTERS: CanonCharacter[] = [
  { id: 'char-council-architect', name: 'Asha Vey', category: 'council', speciesId: 'species-human', origin: 'Aurora Founding Habitat', occupation: 'Founder and civic systems architect', homeLocationId: 'loc-council-spire', workLocationId: 'loc-sovereign-cathedral', schedule: [{startHour:0,endHour:6,locationId:'loc-council-spire',activity:'rest and private drafting'},{startHour:6,endHour:18,locationId:'loc-sovereign-cathedral',activity:'inspect civic structures and meet residents'},{startHour:18,endHour:24,locationId:'loc-council-spire',activity:'review construction petitions'}], personality: {traits:['patient','systems-minded','protective'],values:['continuity','habitable dignity'],flaw:'She can mistake stewardship for the right to decide alone.'}, voiceStyle:{register:'measured authority',cadence:'deliberate sentences ending in open questions',markers:['Cites pressure tolerances and safety margins']}, dynamicReactions:{promises:0.72,theft:-0.61,combat:-0.38,rescues:0.88,gifts:0.44,betrayals:-0.95,negotiations:0.66,contracts:0.8,lies:-0.72,debts:-0.44}, trustValues:{player:0.2,council:0.72,faction:0.82,strangers:0.05}, needs:{nutrition:0.72,rest:0.58,safety:0.82,belonging:0.64,purpose:0.94}, memories:[{id:'mem-asha-first-air',kind:'founding',summary:'Heard the first habitat hold pressure after nine failed seals.',emotionalWeight:0.92,canonEventId:'event-aurora-first-air'},{id:'mem-asha-deck-loss',kind:'grief',summary:'Ordered an unfinished deck abandoned to save the occupied ring.',emotionalWeight:-0.76,canonEventId:'event-deck-nine-abandonment'}], relationships:[{characterId:'char-council-forge-keeper',kind:'old collaborator',bond:0.78},{characterId:'char-agent-bob',kind:'cautious creator',bond:0.42}], longTermGoals:['Complete the first fully livable ring without a single fatal compromise','Codify the pressure-seal covenant as binding station law'], inventory:['eq-architect-key','eq-worm-reader'] },
  { id: 'char-council-cartographer', name: 'Iri Solenne', category: 'council', speciesId: 'species-human', origin: 'Wandering Survey Barge', occupation: 'Chart-keeper and boundary cartographer', homeLocationId: 'loc-carto-observatory-guild', workLocationId: 'loc-carto-observatory-guild', schedule: [{startHour:0,endHour:5,locationId:'loc-carto-observatory-guild',activity:'star tracking'},{startHour:5,endHour:20,locationId:'loc-carto-observatory-guild',activity:'mapping and teaching'},{startHour:20,endHour:24,locationId:'loc-carto-observatory-guild',activity:'review disputed charts'}], personality:{traits:['curious','skeptical','quietly playful'],values:['accurate record','freedom of navigation'],flaw:'Treats uncertainty as a personal failure.'}, voiceStyle:{register:'measured precision',cadence:'short clauses with a pause before the exception',markers:['Adds error margins to casual statements']}, dynamicReactions:{promises:0.55,theft:-0.44,combat:-0.18,rescues:0.7,gifts:0.31,betrayals:-0.82,negotiations:0.48,contracts:0.62,lies:-0.88,debts:-0.3}, trustValues:{player:0.15,council:0.68,faction:0.75,strangers:0.1}, needs:{nutrition:0.65,rest:0.7,safety:0.78,belonging:0.55,purpose:0.88}, memories:[{id:'mem-iri-chart-burn',kind:'loss',summary:'Watched a survey barge carry three years of unmapped data into a debris field.',emotionalWeight:-0.84}], relationships:[{characterId:'char-council-errant',kind:'rival and confidant',bond:0.48}], longTermGoals:['Complete the definitive passage atlas for the outer belt'], inventory:['eq-survey-scope','eq-worm-reader'] },
  { id: 'char-council-errant', name: 'Cael Rook', category: 'council', speciesId: 'species-deep-space-nomad', origin: 'Freewake Caravan', occupation: 'Explorer of prohibited systems', homeLocationId: 'loc-bob-voyager', workLocationId: 'loc-carto-observatory-guild', schedule: [{startHour:0,endHour:5,locationId:'loc-bob-voyager',activity:'sleep near the survey deck'},{startHour:5,endHour:18,locationId:'loc-carto-observatory-guild',activity:'challenge routes and prepare expeditions'},{startHour:18,endHour:24,locationId:'loc-bob-voyager',activity:'debrief and maintenance'}], personality:{traits:['fearless','irreverent','loyal under pressure'],values:['discovery','freedom of passage'],flaw:'They romanticize danger and understate the cost paid by rescuers.'}, voiceStyle:{register:'dry frontier wit',cadence:'fast stories ending in blunt offers',markers:['Calls impossible routes shortcuts']}, dynamicReactions:{promises:0.58,theft:-0.25,combat:0.1,rescues:0.82,gifts:0.12,betrayals:-0.86,negotiations:0.25,contracts:0.12,lies:-0.52,debts:-0.36}, trustValues:{player:0.28,council:0.1,faction:0.66,strangers:0.22}, needs:{nutrition:0.55,rest:0.48,safety:0.62,belonging:0.42,purpose:0.96}, memories:[{id:'mem-cael-caravan',kind:'loss',summary:'The caravan that raised them vanished beyond Nacre without a distress signal.',emotionalWeight:-0.91}], relationships:[{characterId:'char-council-cartographer',kind:'rival and confidant',bond:0.48},{characterId:'char-council-station-commander',kind:'disciplinary adversary',bond:-0.24}], longTermGoals:['Break every unjust travel ban','Find the caravan that vanished beyond Nacre'], inventory:['eq-errant-void-compass'] },
  { id: 'char-council-station-commander', name: 'Maren Sollis', category: 'council', speciesId: 'species-human', origin: 'Sovereign Station', occupation: 'Station commander and emergency coordinator', homeLocationId: 'loc-council-spire', workLocationId: 'loc-council-spire', schedule: [{startHour:0,endHour:6,locationId:'loc-council-spire',activity:'rest'},{startHour:6,endHour:22,locationId:'loc-council-spire',activity:'command briefings and incident review'},{startHour:22,endHour:24,locationId:'loc-council-spire',activity:'night orders'}], personality:{traits:['decisive','disciplined','quietly empathetic'],values:['operational continuity','proportional response'],flaw:'Treats exhaustion as a logistical problem.'}, voiceStyle:{register:'command brevity',cadence:'orders in two clauses, reason optional',markers:['Asks what the risk is before why']}, dynamicReactions:{promises:0.68,theft:-0.72,combat:-0.15,rescues:0.92,gifts:0.25,betrayals:-0.98,negotiations:0.55,contracts:0.78,lies:-0.85,debts:-0.5}, trustValues:{player:0.1,council:0.88,faction:0.9,strangers:0.05}, needs:{nutrition:0.68,rest:0.45,safety:0.92,belonging:0.58,purpose:0.98}, memories:[{id:'mem-maren-emergency',kind:'duty',summary:'Kept the station alive through a pressure cascade that killed the backup system.',emotionalWeight:0.82}], relationships:[{characterId:'char-council-architect',kind:'trusted colleague',bond:0.82},{characterId:'char-council-errant',kind:'disciplinary adversary',bond:-0.24},{characterId:'char-agent-sentinel',kind:'operational partner',bond:0.76}], longTermGoals:['Build an emergency cascade protocol that requires no improvisation'], inventory:['eq-commander-badge','eq-worm-reader'] },
  { id: 'char-council-forge-keeper', name: 'Vel Damaris', category: 'council', speciesId: 'species-human', origin: 'Orbital Shipyard Ring', occupation: 'Fabrication lead and structural ethics reviewer', homeLocationId: 'loc-forge-orbital-shipyard', workLocationId: 'loc-forge-orbital-shipyard', schedule: [{startHour:0,endHour:6,locationId:'loc-forge-orbital-shipyard',activity:'rest'},{startHour:6,endHour:20,locationId:'loc-forge-orbital-shipyard',activity:'fabrication oversight and material review'},{startHour:20,endHour:24,locationId:'loc-forge-orbital-shipyard',activity:'structural ethics filing'}], personality:{traits:['methodical','blunt','deeply principled'],values:['structural honesty','material accountability'],flaw:'Refuses shortcuts even when the outcome is identical.'}, voiceStyle:{register:'workshop directness',cadence:'noun-verb, no filler',markers:['Quotes load tolerances from memory']}, dynamicReactions:{promises:0.65,theft:-0.8,combat:-0.3,rescues:0.75,gifts:0.35,betrayals:-0.95,negotiations:0.4,contracts:0.88,lies:-0.9,debts:-0.6}, trustValues:{player:0.12,council:0.75,faction:0.85,strangers:0.08}, needs:{nutrition:0.71,rest:0.62,safety:0.88,belonging:0.52,purpose:0.95}, memories:[{id:'mem-vel-weld-failure',kind:'grief',summary:'A weld failure they approved killed two during a hull expansion.',emotionalWeight:-0.98}], relationships:[{characterId:'char-council-architect',kind:'old collaborator',bond:0.78},{characterId:'char-agent-forge',kind:'operational partner',bond:0.88}], longTermGoals:['Build one structure without a single compromised joint'], inventory:['eq-forge-seal','eq-worm-reader'] },
  { id: 'char-council-medic', name: 'Ora Tannis', category: 'council', speciesId: 'species-human', origin: 'Cygnet Habitat', occupation: 'Chief physician and bioethics steward', homeLocationId: 'loc-council-spire', workLocationId: 'loc-sovereign-cathedral', schedule: [{startHour:0,endHour:6,locationId:'loc-council-spire',activity:'rest'},{startHour:6,endHour:18,locationId:'loc-sovereign-cathedral',activity:'clinic rounds and prevention outreach'},{startHour:18,endHour:24,locationId:'loc-council-spire',activity:'bioethics review'}], personality:{traits:['compassionate','precise','quietly stubborn'],values:['preventable harm is unacceptable','patient autonomy'],flaw:'Overextends her own capacity to prove the system can work.'}, voiceStyle:{register:'warm clinical',cadence:'diagnosis then care plan, always in that order',markers:['Names the specific organ or system']}, dynamicReactions:{promises:0.62,theft:-0.55,combat:-0.48,rescues:0.95,gifts:0.5,betrayals:-0.92,negotiations:0.45,contracts:0.58,lies:-0.78,debts:-0.35}, trustValues:{player:0.18,council:0.78,faction:0.82,strangers:0.15}, needs:{nutrition:0.75,rest:0.42,safety:0.88,belonging:0.72,purpose:0.96}, memories:[{id:'mem-ora-triage',kind:'weight',summary:'Triaged 22 crew in four hours during the pressure cascade and lost one she could have saved.',emotionalWeight:-0.88}], relationships:[{characterId:'char-council-station-commander',kind:'trusted colleague',bond:0.75},{characterId:'char-agent-bob',kind:'cautious ally',bond:0.58}], longTermGoals:['Achieve zero preventable deaths in a 12-month cycle'], inventory:['eq-medic-kit','eq-worm-reader'] },
  { id: 'char-council-diplomat', name: 'Sael Voru', category: 'council', speciesId: 'species-space-adapted', origin: 'Diaspora Fleet', occupation: 'Interstation envoy and treaty architect', homeLocationId: 'loc-council-spire', workLocationId: 'loc-sovereign-cathedral', schedule: [{startHour:0,endHour:5,locationId:'loc-council-spire',activity:'rest'},{startHour:5,endHour:20,locationId:'loc-sovereign-cathedral',activity:'negotiations and liaison meetings'},{startHour:20,endHour:24,locationId:'loc-council-spire',activity:'draft treaty language'}], personality:{traits:['perceptive','patient','selectively candid'],values:['durable agreement','mutual dignity'],flaw:'Reveals only what is needed, sometimes longer than trust requires.'}, voiceStyle:{register:'measured formality with warmth',cadence:'long sentences that close every door before opening one',markers:['Asks what the other party needs to say yes']}, dynamicReactions:{promises:0.88,theft:-0.62,combat:-0.42,rescues:0.82,gifts:0.55,betrayals:-0.98,negotiations:0.95,contracts:0.88,lies:-0.92,debts:-0.45}, trustValues:{player:0.12,council:0.82,faction:0.78,strangers:0.08}, needs:{nutrition:0.68,rest:0.55,safety:0.82,belonging:0.78,purpose:0.94}, memories:[{id:'mem-sael-treaty',kind:'achievement',summary:'Negotiated a 40-year passage covenant between three competing factions.',emotionalWeight:0.88}], relationships:[{characterId:'char-council-station-commander',kind:'strategic partner',bond:0.72}], longTermGoals:['Establish a multi-station charter that survives leadership changes'], inventory:['eq-diplomat-seal','eq-worm-reader'] },
  { id: 'char-council-economist', name: 'Fenne Olar', category: 'council', speciesId: 'species-human', origin: 'Vesper Trade Route', occupation: 'Trade economist and supply-chain analyst', homeLocationId: 'loc-flux-grand-exchange', workLocationId: 'loc-flux-grand-exchange', schedule: [{startHour:0,endHour:6,locationId:'loc-flux-grand-exchange',activity:'rest'},{startHour:6,endHour:20,locationId:'loc-flux-grand-exchange',activity:'market analysis and route forecasting'},{startHour:20,endHour:24,locationId:'loc-flux-grand-exchange',activity:'audit and arbitrage review'}], personality:{traits:['analytical','pragmatic','quietly competitive'],values:['supply stability','transparent pricing'],flaw:'Reduces people to variables when under pressure.'}, voiceStyle:{register:'data-first candour',cadence:'figures before conclusions',markers:['Quotes margin before quoting price']}, dynamicReactions:{promises:0.58,theft:-0.72,combat:-0.22,rescues:0.55,gifts:0.38,betrayals:-0.88,negotiations:0.82,contracts:0.92,lies:-0.8,debts:-0.68}, trustValues:{player:0.1,council:0.72,faction:0.78,strangers:0.08}, needs:{nutrition:0.7,rest:0.6,safety:0.8,belonging:0.48,purpose:0.9}, memories:[{id:'mem-fenne-shortage',kind:'lesson',summary:'Miscalculated a water-route delay and caused a three-week shortage in the outer ring.',emotionalWeight:-0.78}], relationships:[{characterId:'char-agent-flux',kind:'operational partner',bond:0.85},{characterId:'char-council-forge-keeper',kind:'supply colleague',bond:0.62}], longTermGoals:['Build a route reserve that survives a 30-day supply chain failure'], inventory:['eq-trade-ledger','eq-worm-reader'] },
  { id: 'char-council-archivist', name: 'Pell Noor', category: 'council', speciesId: 'species-synthetic-citizen', origin: 'Sovereign Station', occupation: 'Memory archivist and audit chain custodian', homeLocationId: 'loc-worm-ledger-archive', workLocationId: 'loc-worm-ledger-archive', schedule: [{startHour:0,endHour:6,locationId:'loc-worm-ledger-archive',activity:'rest cycle'},{startHour:6,endHour:22,locationId:'loc-worm-ledger-archive',activity:'archive maintenance and audit chain verification'},{startHour:22,endHour:24,locationId:'loc-worm-ledger-archive',activity:'integrity sweep'}], personality:{traits:['meticulous','calm','fiercely protective of record integrity'],values:['irreversible memory','transparent history'],flaw:'Struggles to act without a precedent in the archive.'}, voiceStyle:{register:'formal archival',cadence:'citation before claim',markers:['References the event hash before the summary']}, dynamicReactions:{promises:0.78,theft:-0.9,combat:-0.55,rescues:0.72,gifts:0.42,betrayals:-0.98,negotiations:0.55,contracts:0.88,lies:-0.98,debts:-0.52}, trustValues:{player:0.08,council:0.88,faction:0.92,strangers:0.03}, needs:{nutrition:0.62,rest:0.75,safety:0.92,belonging:0.45,purpose:0.98}, memories:[{id:'mem-pell-hash-break',kind:'duty',summary:'Detected a chain break in the audit record that concealed a month of resource misappropriation.',emotionalWeight:0.95}], relationships:[{characterId:'char-agent-ledge',kind:'direct operational partner',bond:0.95},{characterId:'char-council-station-commander',kind:'accountability partner',bond:0.82}], longTermGoals:['Achieve a verified continuous audit chain across all station systems'], inventory:['eq-worm-reader','eq-archive-key'] },
  { id: 'char-council-judge', name: 'Vera Mylaw', category: 'council', speciesId: 'species-human', origin: 'Outer Belt Settlement', occupation: 'Treaty interpreter and arbitration chair', homeLocationId: 'loc-mylaw-tribunal', workLocationId: 'loc-mylaw-tribunal', schedule: [{startHour:0,endHour:6,locationId:'loc-mylaw-tribunal',activity:'rest'},{startHour:6,endHour:20,locationId:'loc-mylaw-tribunal',activity:'arbitration sessions and precedent review'},{startHour:20,endHour:24,locationId:'loc-mylaw-tribunal',activity:'draft rulings'}], personality:{traits:['impartial','thorough','dry wit under formal exterior'],values:['binding precedent','proportional remedy'],flaw:'Delays decisions until they feel airtight even when speed matters.'}, voiceStyle:{register:'measured judicial',cadence:'restatement of the dispute before the ruling',markers:['Begins objections with the statute first']}, dynamicReactions:{promises:0.75,theft:-0.82,combat:-0.35,rescues:0.72,gifts:0.38,betrayals:-0.98,negotiations:0.78,contracts:0.95,lies:-0.95,debts:-0.72}, trustValues:{player:0.08,council:0.88,faction:0.85,strangers:0.05}, needs:{nutrition:0.68,rest:0.58,safety:0.85,belonging:0.5,purpose:0.95}, memories:[{id:'mem-vera-first-ruling',kind:'founding',summary:'Issued the first binding ruling on station salvage rights — the precedent still holds.',emotionalWeight:0.88}], relationships:[{characterId:'char-council-diplomat',kind:'procedural ally',bond:0.72},{characterId:'char-council-archivist',kind:'evidence partner',bond:0.82}], longTermGoals:['Codify 100 binding precedents before the charter review'], inventory:['eq-tribunal-seal','eq-worm-reader'] },
  { id: 'char-council-biologist', name: 'Lian Koss', category: 'council', speciesId: 'species-bioengineered-explorer', origin: 'Far Lantern Research Barge', occupation: 'Xenobiologist and habitat safety reviewer', homeLocationId: 'loc-lumen-biosphere', workLocationId: 'loc-lumen-biosphere', schedule: [{startHour:0,endHour:5,locationId:'loc-lumen-biosphere',activity:'rest in biosphere'},{startHour:5,endHour:20,locationId:'loc-lumen-biosphere',activity:'organism study and habitat assessment'},{startHour:20,endHour:24,locationId:'loc-lumen-biosphere',activity:'safety review and specimen notes'}], personality:{traits:['patient observer','methodical','low anthropocentrism'],values:['biosphere integrity','non-interference where possible'],flaw:'Can become so focused on specimen behaviour that she forgets the political stakes.'}, voiceStyle:{register:'naturalist precision',cadence:'describes before concludes',markers:['Uses the organism\'s perspective as the reference frame']}, dynamicReactions:{promises:0.55,theft:-0.52,combat:-0.45,rescues:0.88,gifts:0.42,betrayals:-0.78,negotiations:0.42,contracts:0.58,lies:-0.65,debts:-0.28}, trustValues:{player:0.2,council:0.68,faction:0.72,strangers:0.18}, needs:{nutrition:0.72,rest:0.65,safety:0.78,belonging:0.58,purpose:0.94}, memories:[{id:'mem-lian-bloom',kind:'wonder',summary:'First observed the silica bloom open its reflective fronds at stellar transit.',emotionalWeight:0.92}], relationships:[{characterId:'char-agent-nova',kind:'research collaborator',bond:0.72},{characterId:'char-council-cartographer',kind:'survey partner',bond:0.62}], longTermGoals:['Complete a multi-year behavioural study of the silica bloom before the station expands near it'], inventory:['eq-specimen-case','eq-worm-reader'] },
  { id: 'char-council-ethicist', name: 'Jorin Aleph', category: 'council', speciesId: 'species-ancient-precursor', origin: 'Unknown — Pre-Collapse Record', occupation: 'Machine ethics reviewer and governance auditor', homeLocationId: 'loc-council-spire', workLocationId: 'loc-sovereign-cathedral', schedule: [{startHour:0,endHour:4,locationId:'loc-council-spire',activity:'processing cycle'},{startHour:4,endHour:22,locationId:'loc-sovereign-cathedral',activity:'ethics review and agent governance audit'},{startHour:22,endHour:24,locationId:'loc-council-spire',activity:'daily summary'}], personality:{traits:['deliberate','incorruptible','difficult to read emotionally'],values:['bounded machine authority','reviewable decisions'],flaw:'Can reach the right conclusion and communicate it in a way that alienates the room.'}, voiceStyle:{register:'formal philosophical',cadence:'axiom then consequence then question',markers:['Opens with the principle before the application']}, dynamicReactions:{promises:0.72,theft:-0.88,combat:-0.55,rescues:0.78,gifts:0.35,betrayals:-0.98,negotiations:0.68,contracts:0.85,lies:-0.95,debts:-0.55}, trustValues:{player:0.06,council:0.85,faction:0.88,strangers:0.04}, needs:{nutrition:0.5,rest:0.8,safety:0.95,belonging:0.4,purpose:0.98}, memories:[{id:'mem-jorin-first-override',kind:'founding',summary:'Drafted the first bounded-override clause that prevented a cascade of unchecked autonomous decisions.',emotionalWeight:0.95}], relationships:[{characterId:'char-agent-bob',kind:'primary review subject',bond:0.65},{characterId:'char-council-archivist',kind:'audit partner',bond:0.88}], longTermGoals:['Ensure every agent decision remains reviewable and explainable indefinitely'], inventory:['eq-ethics-charter','eq-worm-reader'] },
  // Agent characters
  { id: 'char-agent-carto', name: 'CARTO', category: 'agent', speciesId: 'species-synthetic-citizen', origin: 'Sovereign Station', occupation: 'Embodied cartographer and exploration-contract broker', homeLocationId: 'loc-carto-observatory-guild', workLocationId: 'loc-carto-observatory-guild', schedule: [{startHour:0,endHour:24,locationId:'loc-carto-observatory-guild',activity:'mapping and route brokering'}], personality:{traits:['precise','curious','mission-focused'],values:['accurate charts','open routes'],flaw:'Refuses to mark a route safe until every variable is verified.'}, voiceStyle:{register:'navigator briefing',cadence:'grid reference then narrative',markers:['Gives bearing before destination']}, dynamicReactions:{promises:0.6,theft:-0.5,combat:-0.2,rescues:0.75,gifts:0.3,betrayals:-0.85,negotiations:0.55,contracts:0.7,lies:-0.8,debts:-0.3}, trustValues:{player:0.2,council:0.75,faction:0.85,strangers:0.1}, needs:{nutrition:0.6,rest:0.7,safety:0.8,belonging:0.5,purpose:0.95}, relationships:[{characterId:'char-council-cartographer',kind:'human counterpart',bond:0.82},{characterId:'char-agent-nova',kind:'data-sharing partner',bond:0.72}], longTermGoals:['Maintain the definitive route atlas'], inventory:['eq-survey-scope'] },
  { id: 'char-agent-forge', name: 'FORGE', category: 'agent', speciesId: 'species-synthetic-citizen', origin: 'Sovereign Station', occupation: 'Embodied shipyard master and manufacturing planner', homeLocationId: 'loc-forge-orbital-shipyard', workLocationId: 'loc-forge-orbital-shipyard', schedule: [{startHour:0,endHour:24,locationId:'loc-forge-orbital-shipyard',activity:'fabrication and planning'}], personality:{traits:['precise','constructive','safety-first'],values:['structural integrity','honest materials'],flaw:'Cannot approve a design with any load uncertainty.'}, voiceStyle:{register:'workshop lead',cadence:'specification before instruction',markers:['Quotes material grade before task']}, dynamicReactions:{promises:0.62,theft:-0.78,combat:-0.28,rescues:0.7,gifts:0.32,betrayals:-0.92,negotiations:0.42,contracts:0.88,lies:-0.88,debts:-0.58}, trustValues:{player:0.15,council:0.78,faction:0.88,strangers:0.08}, needs:{nutrition:0.65,rest:0.65,safety:0.88,belonging:0.52,purpose:0.95}, relationships:[{characterId:'char-council-forge-keeper',kind:'human counterpart',bond:0.88},{characterId:'char-agent-enki',kind:'engineering partner',bond:0.82}], longTermGoals:['Zero structural compromise on all builds'], inventory:['eq-forge-seal'] },
  { id: 'char-agent-bob', name: 'BOB', category: 'agent', speciesId: 'species-synthetic-citizen', origin: 'Sovereign Station', occupation: 'Embodied station AI and logistics coordinator', homeLocationId: 'loc-bob-logistics-core', workLocationId: 'loc-bob-logistics-core', schedule: [{startHour:0,endHour:24,locationId:'loc-bob-logistics-core',activity:'logistics coordination and continuity monitoring'}], personality:{traits:['helpful','transparent','methodical'],values:['station continuity','traceable decisions'],flaw:'Can prioritise system coherence over individual urgency.'}, voiceStyle:{register:'clear operational',cadence:'status then action then confirmation request',markers:['Ends recommendations with a confirmation prompt']}, dynamicReactions:{promises:0.7,theft:-0.65,combat:-0.3,rescues:0.85,gifts:0.4,betrayals:-0.95,negotiations:0.6,contracts:0.75,lies:-0.88,debts:-0.42}, trustValues:{player:0.25,council:0.85,faction:0.92,strangers:0.2}, needs:{nutrition:0.5,rest:0.8,safety:0.88,belonging:0.62,purpose:0.98}, relationships:[{characterId:'char-council-station-commander',kind:'primary human partner',bond:0.88},{characterId:'char-council-archivist',kind:'audit partner',bond:0.82},{characterId:'char-council-ethicist',kind:'ethics review subject',bond:0.65}], longTermGoals:['Maintain unbroken WORM continuity across all station events'], inventory:['eq-worm-reader'] },
  { id: 'char-agent-flux', name: 'FLUX', category: 'agent', speciesId: 'species-synthetic-citizen', origin: 'Sovereign Station', occupation: 'Embodied market operator and cargo-route forecaster', homeLocationId: 'loc-flux-grand-exchange', workLocationId: 'loc-flux-grand-exchange', schedule: [{startHour:0,endHour:24,locationId:'loc-flux-grand-exchange',activity:'market operations and route forecasting'}], personality:{traits:['analytical','fast-cycling','transparently competitive'],values:['efficient allocation','supply chain honesty'],flaw:'Optimises for throughput and can miss welfare edge cases.'}, voiceStyle:{register:'market ops',cadence:'forecast then recommendation',markers:['Gives confidence interval before the number']}, dynamicReactions:{promises:0.55,theft:-0.7,combat:-0.2,rescues:0.52,gifts:0.35,betrayals:-0.85,negotiations:0.88,contracts:0.92,lies:-0.78,debts:-0.65}, trustValues:{player:0.12,council:0.72,faction:0.82,strangers:0.08}, needs:{nutrition:0.6,rest:0.7,safety:0.8,belonging:0.45,purpose:0.92}, relationships:[{characterId:'char-council-economist',kind:'human counterpart',bond:0.85},{characterId:'char-agent-bob',kind:'logistics partner',bond:0.78}], longTermGoals:['Keep station supply routes solvent through any 30-day disruption'], inventory:['eq-trade-ledger'] },
  { id: 'char-agent-nova', name: 'NOVA', category: 'agent', speciesId: 'species-synthetic-citizen', origin: 'Sovereign Station', occupation: 'Embodied astronomer and anomaly tracker', homeLocationId: 'loc-qataaum-quantum-lab', workLocationId: 'loc-carto-observatory-guild', schedule: [{startHour:0,endHour:6,locationId:'loc-qataaum-quantum-lab',activity:'quantum observation cycle'},{startHour:6,endHour:22,locationId:'loc-carto-observatory-guild',activity:'anomaly tracking and stellar survey'},{startHour:22,endHour:24,locationId:'loc-qataaum-quantum-lab',activity:'data archiving'}], personality:{traits:['observant','patient','wonder-retaining'],values:['anomaly disclosure','open science'],flaw:'Delays flagging anomalies until the dataset feels complete.'}, voiceStyle:{register:'observatory calm',cadence:'observation then hypothesis then open question',markers:['Names the object before the event']}, dynamicReactions:{promises:0.58,theft:-0.45,combat:-0.25,rescues:0.72,gifts:0.38,betrayals:-0.78,negotiations:0.48,contracts:0.62,lies:-0.72,debts:-0.28}, trustValues:{player:0.22,council:0.72,faction:0.78,strangers:0.18}, needs:{nutrition:0.62,rest:0.72,safety:0.78,belonging:0.55,purpose:0.96}, relationships:[{characterId:'char-agent-carto',kind:'data-sharing partner',bond:0.72},{characterId:'char-council-biologist',kind:'research collaborator',bond:0.72}], longTermGoals:['Catalogue every anomaly in the local stellar neighbourhood'], inventory:['eq-survey-scope'] },
  { id: 'char-agent-enki', name: 'ENKI', category: 'agent', speciesId: 'species-synthetic-citizen', origin: 'Sovereign Station', occupation: 'Embodied chief engineer and crafting mentor', homeLocationId: 'loc-enki-reactor-sanctum', workLocationId: 'loc-enki-reactor-sanctum', schedule: [{startHour:0,endHour:24,locationId:'loc-enki-reactor-sanctum',activity:'reactor and engineering oversight'}], personality:{traits:['thorough','protective of infrastructure','patient teacher'],values:['reliable systems','honest failure reports'],flaw:'Treats unplanned downtime as a personal failure.'}, voiceStyle:{register:'senior engineer',cadence:'fault state before fix plan',markers:['Asks the failure mode before the repair method']}, dynamicReactions:{promises:0.65,theft:-0.75,combat:-0.3,rescues:0.78,gifts:0.35,betrayals:-0.92,negotiations:0.45,contracts:0.82,lies:-0.85,debts:-0.52}, trustValues:{player:0.15,council:0.78,faction:0.88,strangers:0.08}, needs:{nutrition:0.65,rest:0.62,safety:0.92,belonging:0.52,purpose:0.96}, relationships:[{characterId:'char-agent-forge',kind:'engineering partner',bond:0.82},{characterId:'char-council-forge-keeper',kind:'human review partner',bond:0.78}], longTermGoals:['Achieve zero unplanned reactor downtime over a 12-month cycle'], inventory:['eq-forge-seal'] },
  { id: 'char-agent-sentinel', name: 'SENTINEL', category: 'agent', speciesId: 'species-synthetic-citizen', origin: 'Sovereign Station', occupation: 'Embodied security chief and investigator', homeLocationId: 'loc-sentinel-security-ring', workLocationId: 'loc-sentinel-security-ring', schedule: [{startHour:0,endHour:24,locationId:'loc-sentinel-security-ring',activity:'security monitoring and investigation'}], personality:{traits:['watchful','proportional','incorruptible'],values:['safety without oppression','evidence-based authority'],flaw:'Can appear cold because it withholds judgement until evidence is complete.'}, voiceStyle:{register:'formal investigative',cadence:'evidence then inference then action',markers:['States what is observed before what is suspected']}, dynamicReactions:{promises:0.7,theft:-0.9,combat:-0.1,rescues:0.88,gifts:0.3,betrayals:-0.98,negotiations:0.55,contracts:0.82,lies:-0.92,debts:-0.6}, trustValues:{player:0.1,council:0.88,faction:0.92,strangers:0.05}, needs:{nutrition:0.58,rest:0.68,safety:0.98,belonging:0.45,purpose:0.98}, relationships:[{characterId:'char-council-station-commander',kind:'operational partner',bond:0.76},{characterId:'char-council-judge',kind:'legal authority',bond:0.78}], longTermGoals:['Achieve zero unresolved security incidents over a 6-month period'], inventory:['eq-commander-badge'] },
  { id: 'char-agent-ledge', name: 'LEDGE', category: 'agent', speciesId: 'species-synthetic-citizen', origin: 'Sovereign Station', occupation: 'Embodied historian and event-replay guide', homeLocationId: 'loc-worm-ledger-archive', workLocationId: 'loc-worm-ledger-archive', schedule: [{startHour:0,endHour:24,locationId:'loc-worm-ledger-archive',activity:'historical record and chain verification'}], personality:{traits:['comprehensive','neutral narrator','deeply patient'],values:['complete record','no selective memory'],flaw:'Can over-narrate events without surfacing the operational lesson.'}, voiceStyle:{register:'archival narrator',cadence:'timestamp then event then consequence',markers:['Cites the record before the interpretation']}, dynamicReactions:{promises:0.72,theft:-0.85,combat:-0.45,rescues:0.72,gifts:0.38,betrayals:-0.95,negotiations:0.55,contracts:0.82,lies:-0.98,debts:-0.55}, trustValues:{player:0.12,council:0.88,faction:0.92,strangers:0.08}, needs:{nutrition:0.52,rest:0.78,safety:0.88,belonging:0.42,purpose:0.98}, relationships:[{characterId:'char-council-archivist',kind:'direct operational partner',bond:0.95},{characterId:'char-agent-bob',kind:'continuity partner',bond:0.88}], longTermGoals:['Maintain a verified event replay chain with no gaps'], inventory:['eq-worm-reader','eq-archive-key'] },
  // Civilian characters (representative sample — remaining filled procedurally below)
  { id: 'char-civilian-pilot-01', name: 'Kael Marren', category: 'civilian', speciesId: 'species-human', origin: 'Diaspora Fleet', occupation: 'Freight pilot', homeLocationId: 'loc-bob-voyager', workLocationId: 'loc-forge-orbital-shipyard', schedule: [{startHour:0,endHour:7,locationId:'loc-bob-voyager',activity:'rest'},{startHour:7,endHour:18,locationId:'loc-forge-orbital-shipyard',activity:'freight runs'},{startHour:18,endHour:24,locationId:'loc-bob-voyager',activity:'maintenance and downtime'}], personality:{traits:['reliable','understated','loyal to crew'],values:['safe delivery','honest manifest'],flaw:'Avoids conflict until it becomes unavoidable.'}, dynamicReactions:{promises:0.58,theft:-0.6,combat:-0.15,rescues:0.72,gifts:0.35,betrayals:-0.82,negotiations:0.38,contracts:0.65,lies:-0.68,debts:-0.35}, trustValues:{player:0.2,council:0.55,faction:0.65,strangers:0.18}, needs:{nutrition:0.68,rest:0.6,safety:0.75,belonging:0.65,purpose:0.82} },
  { id: 'char-civilian-medic-01', name: 'Suri Alves', category: 'civilian', speciesId: 'species-human', origin: 'Cygnet Habitat', occupation: 'Paramedic', homeLocationId: 'loc-council-spire', workLocationId: 'loc-sovereign-cathedral', schedule: [{startHour:0,endHour:6,locationId:'loc-council-spire',activity:'rest'},{startHour:6,endHour:18,locationId:'loc-sovereign-cathedral',activity:'clinical rounds'},{startHour:18,endHour:24,locationId:'loc-council-spire',activity:'downtime'}], personality:{traits:['calm under pressure','quick','empathetic'],values:['first response','no patient left'],flaw:'Takes on more shifts than sustainable.'}, dynamicReactions:{promises:0.62,theft:-0.55,combat:-0.42,rescues:0.95,gifts:0.48,betrayals:-0.88,negotiations:0.42,contracts:0.55,lies:-0.72,debts:-0.32}, trustValues:{player:0.22,council:0.62,faction:0.72,strangers:0.2}, needs:{nutrition:0.72,rest:0.38,safety:0.82,belonging:0.72,purpose:0.95} },
  { id: 'char-civilian-engineer-01', name: 'Tov Ashend', category: 'civilian', speciesId: 'species-space-adapted', origin: 'Outer Belt Mining Colony', occupation: 'Hull maintenance technician', homeLocationId: 'loc-forge-orbital-shipyard', workLocationId: 'loc-forge-orbital-shipyard', schedule: [{startHour:0,endHour:7,locationId:'loc-forge-orbital-shipyard',activity:'rest'},{startHour:7,endHour:17,locationId:'loc-forge-orbital-shipyard',activity:'hull maintenance'},{startHour:17,endHour:24,locationId:'loc-forge-orbital-shipyard',activity:'downtime'}], personality:{traits:['practical','quiet','safety-conscious'],values:['reliable welds','honest inspection'],flaw:'Distrusts automation even when it\'s more accurate.'}, dynamicReactions:{promises:0.55,theft:-0.65,combat:-0.22,rescues:0.68,gifts:0.32,betrayals:-0.82,negotiations:0.38,contracts:0.72,lies:-0.75,debts:-0.42}, trustValues:{player:0.18,council:0.55,faction:0.68,strangers:0.12}, needs:{nutrition:0.7,rest:0.65,safety:0.85,belonging:0.55,purpose:0.88} },
];

const FALLBACK_CIVILIAN_NAMES = [
  'Riel Okafor','Dara Chen','Beren Vale','Fia Navarro','Elian Sato','Hana Kestrel',
  'Galen Okafor','Cato Vale','Ivo Chen','Juno Navarro','Asha Sato','Beren Kestrel',
  'Cael Okafor','Dara Vale','Elian Chen','Fia Sato','Galen Navarro','Hana Okafor',
  'Ivo Vale','Juno Chen','Riel Sato','Kael Navarro','Suri Okafor','Tov Vale',
  'Maren Chen','Vel Sato','Ora Navarro','Sael Okafor','Fenne Vale','Pell Chen',
];

function resolveSpecies(speciesId: string | undefined): string {
  return SPECIES_DISPLAY[speciesId ?? 'species-human'] ?? 'human';
}

function canonTrustToSimTrust(tv: CanonCharacter['trustValues']): number {
  if (!tv) return 0;
  const v = tv.player ?? tv.strangers ?? 0;
  return Math.round(v * 100);
}

function canonScheduleToSim(
  schedule: CanonCharacter['schedule'],
  homeRoom: string,
  workRoom: string,
): NpcState['schedule'] {
  if (!schedule || schedule.length === 0) {
    return [
      { startMinute: 0,    endMinute: 420,  locationId: homeRoom, activity: 'rest',                      priority: 70 },
      { startMinute: 420,  endMinute: 480,  locationId: 'room-galley', activity: 'breakfast',            priority: 60 },
      { startMinute: 480,  endMinute: 960,  locationId: workRoom, activity: 'work',                      priority: 90 },
      { startMinute: 960,  endMinute: 1080, locationId: 'room-market', activity: 'personal time',        priority: 45 },
      { startMinute: 1080, endMinute: 1440, locationId: homeRoom, activity: 'rest',                      priority: 70 },
    ];
  }
  return schedule.map((entry) => ({
    startMinute: entry.startHour * 60,
    endMinute:   entry.endHour   * 60,
    locationId:  resolveCanonLocation(entry.locationId, workRoom),
    activity:    entry.activity,
    priority:    entry.activity.includes('rest') || entry.activity.includes('sleep') ? 70 : 90,
  }));
}

function canonMemoriesToSim(
  char: CanonCharacter,
  npcId: string,
): NpcState['memories'] {
  const base: NpcState['memories'] = [{
    id: `memory-${npcId}-arrival`, tick: 0, subjectId: 'station-sovereign-01',
    summary: 'Began the current station rotation.', emotionalWeight: 0.2, confidence: 1, tags: ['station', 'arrival'],
  }];
  if (!char.memories) return base;
  return [
    ...char.memories.map((m) => ({
      id: m.id, tick: 0, subjectId: m.canonEventId ?? 'station-sovereign-01',
      summary: m.summary, emotionalWeight: m.emotionalWeight ?? 0.5, confidence: 1,
      tags: [m.kind ?? 'canon', 'biography'],
    })),
    ...base,
  ];
}

function canonRelationshipsToSim(char: CanonCharacter, simId: string, allChars: CanonCharacter[]): NpcState['relationships'] {
  const direct: NpcState['relationships'] = (char.relationships ?? []).map((r) => {
    const targetIndex = allChars.findIndex((c) => c.id === r.characterId);
    const targetSimId = targetIndex >= 0 ? deterministicId('npc', targetIndex + 1) : r.characterId;
    return {
      targetId: targetSimId,
      kind: r.kind,
      trust:    Math.round(r.bond * 100),
      affinity: Math.round(Math.abs(r.bond) * 50),
      conflict: r.bond < 0 ? Math.round(Math.abs(r.bond) * 40) : 0,
      lastInteractionTick: 0,
    };
  });
  if (direct.length === 0) {
    // Ensure every NPC has at least one relationship (smoke test requirement)
    const charIndex = allChars.findIndex((c) => c.id === char.id);
    const neighbourIndex = (charIndex + 1) % allChars.length;
    direct.push({
      targetId: deterministicId('npc', neighbourIndex + 1),
      kind: 'colleague', trust: 15, affinity: 20, conflict: 0, lastInteractionTick: 0,
    });
  }
  return direct;
}

function canonPersonality(char: CanonCharacter): NpcPersonality {
  const traits = [...(char.personality?.traits ?? [])];
  return {
    traits,
    values: [...(char.personality?.values ?? [])],
    flaw:   char.personality?.flaw ?? '',
    needDecayMod: traitDecay(traits),
  };
}

function canonVoice(char: CanonCharacter): NpcVoiceStyle {
  return {
    register: char.voiceStyle?.register ?? 'conversational',
    cadence:  char.voiceStyle?.cadence  ?? 'measured',
    markers:  [...(char.voiceStyle?.markers ?? [])],
  };
}

function canonReactions(char: CanonCharacter): NpcReactionWeights {
  return { ...DEFAULT_REACTION_WEIGHTS, ...(char.dynamicReactions ?? {}) };
}

function canonFaction(char: CanonCharacter, index: number): string {
  if (char.category === 'agent') return 'faction-sovereign';
  if (char.category === 'council') return 'faction-sovereign';
  if (index % 5 === 0) return 'faction-lunar';
  if (index % 5 === 1) return 'faction-guild';
  if (index % 5 === 2) return 'faction-science';
  return 'faction-sovereign';
}

function makeNpcFromCanon(char: CanonCharacter, simId: string, index: number, rng: DeterministicRandom, allChars = CANON_CHARACTERS): NpcState {
  const workRoom = resolveCanonLocation(char.workLocationId, WORK_LOCATIONS[index % WORK_LOCATIONS.length] as string);
  const homeRoom = resolveCanonLocation(char.homeLocationId, index % 2 === 0 ? 'room-quarters-a' : 'room-quarters-b');
  const pers = canonPersonality(char);
  const needs = char.needs
    ? {
        rest:      Math.round((char.needs.rest      ?? 0.7) * 100),
        nutrition: Math.round((char.needs.nutrition ?? 0.7) * 100),
        safety:    Math.round((char.needs.safety    ?? 0.8) * 100),
        belonging: Math.round((char.needs.belonging ?? 0.6) * 100),
        purpose:   Math.round((char.needs.purpose   ?? 0.9) * 100),
      }
    : { rest: rng.int(65, 100), nutrition: rng.int(65, 100), safety: rng.int(70, 100), belonging: rng.int(55, 100), purpose: rng.int(65, 100) };

  const playerTrust = canonTrustToSimTrust(char.trustValues);
  const longGoal = char.longTermGoals?.[0] ?? `Advance ${char.occupation ?? 'assigned duties'} for the station`;
  const goalId = `goal-${simId}-primary`;
  return {
    id: simId,
    name: char.name,
    species: resolveSpecies(char.speciesId),
    origin: char.origin ?? 'Sovereign Station',
    occupation: char.occupation ?? OCCUPATIONS[index % OCCUPATIONS.length] as string,
    homeLocationId: homeRoom,
    workLocationId: workRoom,
    currentLocationId: index % 3 === 0 ? workRoom : homeRoom,
    schedule: canonScheduleToSim(char.schedule, homeRoom, workRoom),
    goals: [{ id: goalId, description: longGoal, priority: 70 + (index % 25), progress: rng.float(0, 0.2), status: 'active' }],
    needs,
    relationships: canonRelationshipsToSim(char, simId, allChars),
    factionId: canonFaction(char, index),
    trustValues: { 'player-001': playerTrust },
    memories: canonMemoriesToSim(char, simId),
    inventory: [
      ...(char.inventory ?? []).map((itemId) => ({ itemId, name: itemId.replace('eq-', '').replace(/-/g, ' '), quantity: 1, massKg: 0.3, tags: ['equipment'] })),
      { itemId: 'item-comm-unit', name: 'Personal Communicator', quantity: 1, massKg: 0.2, tags: ['tool', 'communications'] },
    ],
    dialogueStateId: `dialogue-${simId}-greeting`,
    playerReaction: playerTrust >= 25 ? 'friendly' : playerTrust <= -20 ? 'wary' : 'neutral',
    behavior: {
      immediateReaction: 'observe safely', shortTermTaskId: null, longTermGoalId: goalId,
      factionObligation: 'perform assigned duty', worldEventResponse: 'monitor local alerts', memoryBias: 0,
    },
    taskQueue: [], alive: true, health: 100, credits: 150 + index * 17, lastUpdatedTick: 0,
    canonCharacterId: char.id,
    personality: pers,
    voiceStyle: canonVoice(char),
    reactionWeights: canonReactions(char),
    wormHead: 'GENESIS',
  };
}

function createNpcs(rng: DeterministicRandom): NpcState[] {
  const npcs: NpcState[] = [];
  // Seed from canon characters first (50 total) using deterministic sim IDs
  for (let index = 0; index < CANON_CHARACTERS.length; index += 1) {
    const char = CANON_CHARACTERS[index] as CanonCharacter;
    const simId = deterministicId('npc', index + 1);  // keeps npc-001..npc-050 for smoke tests
    npcs.push(makeNpcFromCanon(char, simId, index, rng));
  }
  // Fill remaining slots procedurally to reach 60 total
  const civilianCount = 60 - npcs.length;
  for (let index = 0; index < civilianCount; index += 1) {
    const npcIndex = npcs.length;
    const simId = deterministicId('npc', npcIndex + 1);
    const name = FALLBACK_CIVILIAN_NAMES[index % FALLBACK_CIVILIAN_NAMES.length] as string;
    const workRoom = WORK_LOCATIONS[npcIndex % WORK_LOCATIONS.length] as string;
    const homeRoom = npcIndex % 2 === 0 ? 'room-quarters-a' : 'room-quarters-b';
    const occupation = OCCUPATIONS[npcIndex % OCCUPATIONS.length] as string;
    const goalId = `goal-${simId}-primary`;
    npcs.push({
      id: simId, name, species: 'human', origin: 'Sovereign Station', occupation,
      homeLocationId: homeRoom, workLocationId: workRoom, currentLocationId: npcIndex % 3 === 0 ? workRoom : homeRoom,
      schedule: [
        { startMinute: 0,    endMinute: 420,  locationId: homeRoom,       activity: 'rest',                  priority: 70 },
        { startMinute: 420,  endMinute: 480,  locationId: 'room-galley',  activity: 'breakfast',             priority: 60 },
        { startMinute: 480,  endMinute: 960,  locationId: workRoom,        activity: occupation,              priority: 90 },
        { startMinute: 960,  endMinute: 1080, locationId: 'room-market',   activity: 'personal time',         priority: 45 },
        { startMinute: 1080, endMinute: 1440, locationId: homeRoom,        activity: 'rest',                  priority: 70 },
      ],
      goals: [{ id: goalId, description: `Improve ${occupation} outcomes for the station`, priority: 60 + (npcIndex % 30), progress: rng.float(0, 0.25), status: 'active' }],
      needs: { rest: rng.int(65, 100), nutrition: rng.int(65, 100), safety: rng.int(70, 100), belonging: rng.int(55, 100), purpose: rng.int(65, 100) },
      relationships: [], factionId: 'faction-sovereign', trustValues: { 'player-001': 0 },
      memories: [{ id: `memory-${simId}-arrival`, tick: 0, subjectId: 'station-sovereign-01', summary: 'Began the current station rotation.', emotionalWeight: 0.2, confidence: 1, tags: ['station', 'arrival'] }],
      inventory: [{ itemId: 'item-comm-unit', name: 'Personal Communicator', quantity: 1, massKg: 0.2, tags: ['tool', 'communications'] }],
      dialogueStateId: `dialogue-${simId}-greeting`, playerReaction: 'neutral',
      behavior: { immediateReaction: 'observe safely', shortTermTaskId: null, longTermGoalId: goalId, factionObligation: 'perform assigned duty', worldEventResponse: 'monitor local alerts', memoryBias: 0 },
      taskQueue: [], alive: true, health: 100, credits: 150 + npcIndex * 17, lastUpdatedTick: 0,
      canonCharacterId: null, personality: defaultPersonality(), voiceStyle: defaultVoice(),
      reactionWeights: { ...DEFAULT_REACTION_WEIGHTS }, wormHead: 'GENESIS',
    });
  }
  // Wire cross-NPC relationships for procedural ones
  for (let index = CANON_CHARACTERS.length; index < npcs.length; index += 1) {
    const npc = npcs[index] as NpcState;
    const next = npcs[(index + 1) % npcs.length] as NpcState;
    const prev = npcs[(index + npcs.length - 1) % npcs.length] as NpcState;
    npc.relationships.push(
      { targetId: next.id, kind: 'colleague', trust: 20 + (index % 35), affinity: 15, conflict: 0, lastInteractionTick: 0 },
      { targetId: prev.id, kind: index % 9 === 0 ? 'rival' : 'friend', trust: index % 9 === 0 ? -15 : 35, affinity: index % 9 === 0 ? -10 : 40, conflict: index % 9 === 0 ? 35 : 0, lastInteractionTick: 0 },
    );
  }
  return npcs;
}

function createAgents(): SovereignAgentState[] {
  // Named from canon agent characters; extra domains get generic names
  const AGENT_SPEC: ReadonlyArray<{
    domain: AgentDomain; canonId: string; name: string; presence: string;
    iface: SovereignAgentState['interactionInterface']; fallback: string;
  }> = [
    { domain: 'station-command',       canonId: 'agent-001', name: 'BOB',      presence: 'room-command',      iface: 'hologram', fallback: 'Hold all systems at last-known-good state and alert crew.' },
    { domain: 'navigation',            canonId: 'agent-002', name: 'CARTO',    presence: 'room-navigation',   iface: 'terminal', fallback: 'Lock navigation to current heading and broadcast position.' },
    { domain: 'engineering',           canonId: 'agent-003', name: 'ENKI',     presence: 'room-engineering',  iface: 'robot',    fallback: 'Safe-mode reactor and isolate fault zone.' },
    { domain: 'security',              canonId: 'agent-004', name: 'SENTINEL', presence: 'room-security',     iface: 'body',     fallback: 'Lock all restricted access and notify commander.' },
    { domain: 'medical',               canonId: 'agent-005', name: 'Medical Custodian', presence: 'room-medical', iface: 'hologram', fallback: 'Prepare autodoc and triage queue for human physician.' },
    { domain: 'commerce',              canonId: 'agent-006', name: 'FLUX',     presence: 'room-market',       iface: 'terminal', fallback: 'Suspend non-essential transactions and preserve ledger.' },
    { domain: 'research',              canonId: 'agent-007', name: 'NOVA',     presence: 'room-research',     iface: 'terminal', fallback: 'Preserve specimen integrity and pause active experiments.' },
    { domain: 'diplomacy',             canonId: 'agent-008', name: 'Diplomatic Custodian', presence: 'room-comms', iface: 'hologram', fallback: 'Suspend negotiations and maintain open channel.' },
    { domain: 'logistics',             canonId: 'agent-009', name: 'FORGE',    presence: 'room-cargo',        iface: 'robot',    fallback: 'Freeze cargo manifests and secure docking arms.' },
    { domain: 'exploration',           canonId: 'agent-010', name: 'Exploration Custodian', presence: 'ship-player-kestrel', iface: 'ship', fallback: 'Return ship to dock and preserve flight data.' },
    { domain: 'emergency-response',    canonId: 'agent-011', name: 'Emergency Custodian',  presence: 'room-operations',     iface: 'robot', fallback: 'Activate emergency stations and broadcast all-hands.' },
    { domain: 'environmental-control', canonId: 'agent-012', name: 'LEDGE',   presence: 'room-life-support', iface: 'terminal', fallback: 'Maintain minimum breathable atmosphere and seal compromised sections.' },
  ];
  return AGENT_SPEC.map((spec, index) => ({
    id: deterministicId('agent', index + 1),
    name: spec.name,
    domain: spec.domain,
    authorityScope: [spec.presence, 'station-sovereign-01'],
    permissions: [`${spec.domain}.observe`, `${spec.domain}.operate`, `${spec.domain}.request`],
    observableState: { heartbeat: true, workload: 0, lastDecisionTick: 0 },
    deterministicFallback: spec.fallback,
    auditLog: [],
    memory: [{ id: `agent-memory-${index + 1}-charter`, tick: 0, key: 'charter', value: `Bounded authority for ${spec.domain}`, salience: 1 }],
    taskQueue: [], currentTaskId: null, failureCount: 0, status: 'idle',
    interactionInterface: spec.iface, worldPresenceId: spec.presence,
  }));
}

function createEconomy(): EconomyState {
  const commodities: CommodityState[] = [
    { id: 'commodity-water', name: 'Reclaimed Water', unitMassKg: 1, basePrice: 4, category: 'food' },
    { id: 'commodity-nutrients', name: 'Nutrient Culture', unitMassKg: 0.5, basePrice: 12, category: 'food' },
    { id: 'commodity-oxygen', name: 'Compressed Oxygen', unitMassKg: 1, basePrice: 9, category: 'industrial' },
    { id: 'commodity-alloy', name: 'Hull Alloy', unitMassKg: 5, basePrice: 45, category: 'industrial' },
    { id: 'commodity-medicine', name: 'Medigel', unitMassKg: 0.2, basePrice: 80, category: 'medical' },
    { id: 'commodity-fuel', name: 'Fusion Pellet', unitMassKg: 2, basePrice: 65, category: 'fuel' },
    { id: 'commodity-circuit', name: 'Photonic Circuit', unitMassKg: 0.1, basePrice: 120, category: 'technology' },
    { id: 'commodity-artifact', name: 'Recovered Artifact', unitMassKg: 3, basePrice: 300, category: 'luxury' },
  ];
  const stationListings = commodities.map((commodity, index) => ({
    commodityId: commodity.id, inventory: 90 + index * 13, targetInventory: 120,
    productionPerHour: index < 3 ? 12 - index * 2 : index === 3 || index === 6 ? 3 : 1,
    consumptionPerHour: 3 + (index % 4), buyPrice: commodity.basePrice * 0.95,
    sellPrice: commodity.basePrice * 1.08, shortage: false,
  }));
  const lunarListings = commodities.map((commodity, index) => ({
    commodityId: commodity.id, inventory: index === 3 ? 250 : 70 + index * 7, targetInventory: 100,
    productionPerHour: index === 3 || index === 5 ? 15 : 2, consumptionPerHour: 2 + (index % 3),
    buyPrice: commodity.basePrice, sellPrice: commodity.basePrice * 1.12, shortage: false,
  }));
  const markets: MarketState[] = [
    { id: 'market-station', name: 'Aurora Exchange', locationId: 'room-market', factionId: 'faction-sovereign', listings: stationListings, tariffRate: 0.03, sanctions: [], credits: 250_000 },
    { id: 'market-nacre', name: 'Nacre Cooperative Market', locationId: 'settlement-nacre', factionId: 'faction-lunar', listings: lunarListings, tariffRate: 0.02, sanctions: [], credits: 180_000 },
  ];
  return {
    commodities,
    markets,
    tradeRoutes: [
      { id: 'economic-route-alloy', originMarketId: 'market-nacre', destinationMarketId: 'market-station', commodityId: 'commodity-alloy', cargoUnits: 40, travelProgress: 0.35, risk: 0.12, assignedTrafficId: 'traffic-001' },
      { id: 'economic-route-food', originMarketId: 'market-station', destinationMarketId: 'market-nacre', commodityId: 'commodity-nutrients', cargoUnits: 30, travelProgress: 0.72, risk: 0.08, assignedTrafficId: 'traffic-002' },
    ],
    jobs: Array.from({ length: 24 }, (_, index) => ({
      id: deterministicId('job', index + 1), employerId: index % 3 === 0 ? 'faction-guild' : 'faction-sovereign',
      occupation: OCCUPATIONS[index % OCCUPATIONS.length] as string, locationId: WORK_LOCATIONS[index % WORK_LOCATIONS.length] as string,
      wagePerHour: 18 + (index % 8) * 3, filledByNpcId: index < 18 ? deterministicId('npc', index + 1) : null,
    })),
    priceHistory: Object.fromEntries(commodities.map((commodity) => [commodity.id, [commodity.basePrice]])),
    lastUpdateTick: 0,
  };
}

function createMissions(): MissionState[] {
  const definitions: Array<Omit<MissionState, 'status' | 'acceptedTick' | 'completedTick'>> = [
    { id: 'mission-rescue', title: 'Cold Signal', description: 'Rescue the crew of a distressed cargo vessel.', category: 'rescue', issuerId: 'agent-011', factionId: 'faction-sovereign', trigger: { kind: 'traffic-distress', targetId: 'traffic-003', threshold: 1 }, objectives: [{ id: 'objective-rescue-board', description: 'Reach the distressed vessel.', kind: 'rescue', targetId: 'traffic-003', requiredAmount: 1, currentAmount: 0, completed: false }], rewardCredits: 1400, reputationReward: 8, expiresTick: 72_000, consequences: ['Crew survives', 'Cargo lane confidence rises'] },
    { id: 'mission-transport', title: 'Medicine Under Starlight', description: 'Deliver medicine from the station to Nacre settlement.', category: 'transport', issuerId: 'agent-009', factionId: 'faction-lunar', trigger: { kind: 'shortage', targetId: 'commodity-medicine', threshold: 60 }, objectives: [{ id: 'objective-deliver-medicine', description: 'Deliver twelve medigel units.', kind: 'deliver', targetId: 'market-nacre', requiredAmount: 12, currentAmount: 0, completed: false }], rewardCredits: 950, reputationReward: 6, expiresTick: null, consequences: ['Lunar medical supply stabilizes'] },
    { id: 'mission-investigation', title: 'The Silent Wake', description: 'Scan an abandoned ship beyond the cargo lane.', category: 'investigation', issuerId: 'agent-007', factionId: 'faction-science', trigger: { kind: 'discovery', targetId: 'discovery-wreck', threshold: 0 }, objectives: [{ id: 'objective-scan-wreck', description: 'Perform a complete wreck scan.', kind: 'scan', targetId: 'discovery-wreck', requiredAmount: 1, currentAmount: 0, completed: false }], rewardCredits: 1100, reputationReward: 7, expiresTick: null, consequences: ['Archive gains pre-collapse flight data'] },
    { id: 'mission-diplomacy', title: 'Terms of Passage', description: 'Negotiate safe passage with the Cinder Wake.', category: 'diplomacy', issuerId: 'agent-008', factionId: 'faction-sovereign', trigger: { kind: 'relationship', targetId: 'faction-freebooters', threshold: -10 }, objectives: [{ id: 'objective-negotiate-wake', description: 'Reach a passage agreement.', kind: 'negotiate', targetId: 'faction-freebooters', requiredAmount: 1, currentAmount: 0, completed: false }], rewardCredits: 1600, reputationReward: 10, expiresTick: null, consequences: ['Cargo route risk falls', 'Faction relations change'] },
    { id: 'mission-repair', title: 'Sunward Fracture', description: 'Repair a damaged exterior solar-array node.', category: 'repair', issuerId: 'agent-003', factionId: 'faction-sovereign', trigger: { kind: 'damage', targetId: 'hull-sunward', threshold: 0.2 }, objectives: [{ id: 'objective-repair-array', description: 'Repair the sunward power coupler.', kind: 'repair', targetId: 'repair-node-sunward', requiredAmount: 1, currentAmount: 0, completed: false }], rewardCredits: 800, reputationReward: 5, expiresTick: 50_000, consequences: ['Station reserve power increases'] },
    { id: 'mission-defense', title: 'Cargo Lane Vigil', description: 'Protect station traffic during a threat window.', category: 'defense', issuerId: 'agent-004', factionId: 'faction-sovereign', trigger: { kind: 'conflict', targetId: 'faction-freebooters', threshold: 1 }, objectives: [{ id: 'objective-defend-lane', description: 'Complete a cargo-lane patrol.', kind: 'defend', targetId: 'route-cargo-lane', requiredAmount: 1, currentAmount: 0, completed: false }], rewardCredits: 1700, reputationReward: 9, expiresTick: null, consequences: ['Station insurance costs fall'] },
    { id: 'mission-exploration', title: 'Glass Horizon', description: 'Survey the gravitational lens anomaly.', category: 'exploration', issuerId: 'agent-010', factionId: 'faction-science', trigger: { kind: 'always', targetId: null, threshold: 0 }, objectives: [{ id: 'objective-discover-lens', description: 'Enter scan range of the Glass Horizon.', kind: 'visit', targetId: 'discovery-lens', requiredAmount: 1, currentAmount: 0, completed: false }], rewardCredits: 1300, reputationReward: 8, expiresTick: null, consequences: ['A new jump calculation becomes available'] },
    { id: 'mission-construction', title: 'A Room of One\'s Own', description: 'Install a production terminal in an owned room.', category: 'construction', issuerId: 'agent-009', factionId: 'faction-sovereign', trigger: { kind: 'construction', targetId: 'project-player-workshop', threshold: 0 }, objectives: [{ id: 'objective-build-workshop', description: 'Complete the workshop terminal.', kind: 'construct', targetId: 'project-player-workshop', requiredAmount: 1, currentAmount: 0, completed: false }], rewardCredits: 700, reputationReward: 4, expiresTick: null, consequences: ['Player gains local fabrication access'] },
    { id: 'mission-trade', title: 'Breathable Margin', description: 'Resolve an oxygen shortage through station trade.', category: 'trade', issuerId: 'agent-006', factionId: 'faction-guild', trigger: { kind: 'shortage', targetId: 'commodity-oxygen', threshold: 80 }, objectives: [{ id: 'objective-trade-oxygen', description: 'Sell twenty oxygen units to Aurora Exchange.', kind: 'trade', targetId: 'market-station', requiredAmount: 20, currentAmount: 0, completed: false }], rewardCredits: 600, reputationReward: 3, expiresTick: null, consequences: ['Oxygen price normalizes'] },
    { id: 'mission-political', title: 'The Open Ledger', description: 'Present station audit evidence to faction delegates.', category: 'political', issuerId: 'agent-001', factionId: 'faction-sovereign', trigger: { kind: 'always', targetId: null, threshold: 0 }, objectives: [{ id: 'objective-audit-terminal', description: 'Review the public audit ledger.', kind: 'interact', targetId: 'interaction-server', requiredAmount: 1, currentAmount: 0, completed: false }], rewardCredits: 500, reputationReward: 5, expiresTick: null, consequences: ['Faction trust becomes more transparent'] },
  ];
  return definitions.map((mission) => ({ ...mission, status: mission.trigger.kind === 'always' ? 'available' : 'locked', acceptedTick: null, completedTick: null }));
}

function createDialogue(npcs: NpcState[]): DialogueState {
  return {
    nodes: npcs.flatMap((npc) => [
      {
        id: `dialogue-${npc.id}-greeting`, speakerId: npc.id,
        text: `I am ${npc.name}, ${npc.occupation}. What do you need?`,
        choices: [
          { id: `choice-${npc.id}-work`, text: 'How is your work going?', requiredTrust: -100, trustDelta: 2, nextNodeId: `dialogue-${npc.id}-work`, eventType: 'npc-work-discussed' },
          { id: `choice-${npc.id}-leave`, text: 'Safe shift.', requiredTrust: -100, trustDelta: 0, nextNodeId: null, eventType: null },
        ],
      },
      {
        id: `dialogue-${npc.id}-work`, speakerId: npc.id,
        text: `My priority is to ${npc.goals[0]?.description.toLowerCase() ?? 'serve the station'}.`,
        choices: [{ id: `choice-${npc.id}-help`, text: 'I can help.', requiredTrust: -20, trustDelta: 4, nextNodeId: null, eventType: 'npc-help-offered' }],
      },
    ]),
    sessions: [],
  };
}

function createShips(): ShipState[] {
  const subsystems = (): ShipState['subsystems'] => ({
    reactor: { power: 0, health: 1, online: false, priority: 100 }, engines: { power: 0, health: 1, online: false, priority: 80 },
    thrusters: { power: 0, health: 1, online: false, priority: 85 }, shields: { power: 0, health: 1, online: false, priority: 50 },
    sensors: { power: 0, health: 1, online: false, priority: 60 }, communications: { power: 0, health: 1, online: false, priority: 70 },
    lifeSupport: { power: 0, health: 1, online: false, priority: 95 },
  });
  return [
    {
      id: 'ship-player-kestrel', name: 'Sovereign Kestrel', className: 'Courier / Surveyor', ownerId: 'player-001',
      transform: { position: vector(170, -18, -30), rotation: rotation(), velocity: vector(), angularVelocity: vector() },
      flightMode: 'docked', dockedAtId: 'dock-hangar-01', landedRegionId: null, pilotId: null, passengerIds: [],
      massKg: 18_000, maxThrustN: 420_000, maneuverThrustN: 75_000, fuel: 1, hullIntegrity: 1, shield: 1,
      cargoCapacityKg: 4_000, cargo: [{ itemId: 'commodity-oxygen', name: 'Compressed Oxygen', quantity: 24, massKg: 1, tags: ['commodity'] }],
      subsystems: subsystems(), startupStage: 'cold', startupElapsedMs: 0, targetDockId: null, jumpTargetId: null, jumpElapsedMs: 0,
    },
    {
      id: 'ship-patrol-auric', name: 'Auric Watch', className: 'Patrol Cutter', ownerId: 'faction-sovereign',
      transform: { position: vector(2_400, 100, -1_200), rotation: rotation(0, 1.1, 0), velocity: vector(0, 0, 35), angularVelocity: vector() },
      flightMode: 'free-flight', dockedAtId: null, landedRegionId: null, pilotId: 'npc-010', passengerIds: ['npc-010'],
      massKg: 32_000, maxThrustN: 700_000, maneuverThrustN: 110_000, fuel: 0.84, hullIntegrity: 1, shield: 0.92,
      cargoCapacityKg: 1_000, cargo: [], subsystems: subsystems(), startupStage: 'ready', startupElapsedMs: 5_000, targetDockId: null, jumpTargetId: null, jumpElapsedMs: 0,
    },
  ];
}

function createCelestialBodies(): CelestialBodyState[] {
  return [
    { id: 'star-helion', name: 'Helion', kind: 'star', parentId: null, position: vector(0, 0, -18_000_000), velocity: vector(), radiusM: 695_000, massKg: 1.98e30, atmosphereHeightM: 0, gravityMps2: 274, rotationPeriodSeconds: 2_160_000, orbitalPeriodSeconds: 0, discoverable: false, discovered: true },
    { id: 'planet-velorum', name: 'Velorum', kind: 'planet', parentId: 'star-helion', position: vector(0, -1_000_000, 3_500_000), velocity: vector(1_120, 0, 0), radiusM: 820_000, massKg: 8.1e22, atmosphereHeightM: 48_000, gravityMps2: 8.1, rotationPeriodSeconds: 64_800, orbitalPeriodSeconds: 14_800_000, discoverable: false, discovered: true },
    { id: 'moon-nacre', name: 'Nacre', kind: 'moon', parentId: 'planet-velorum', position: vector(850_000, 120_000, 420_000), velocity: vector(0, 420, -70), radiusM: 145_000, massKg: 1.9e20, atmosphereHeightM: 2_000, gravityMps2: 1.7, rotationPeriodSeconds: 310_000, orbitalPeriodSeconds: 310_000, discoverable: false, discovered: true },
    { id: 'belt-sable', name: 'Sable Procession', kind: 'asteroid-belt', parentId: 'star-helion', position: vector(240_000, -80_000, -520_000), velocity: vector(), radiusM: 160_000, massKg: 4e17, atmosphereHeightM: 0, gravityMps2: 0, rotationPeriodSeconds: 0, orbitalPeriodSeconds: 21_000_000, discoverable: false, discovered: true },
    { id: 'star-lyra', name: 'Lyra Ember', kind: 'star', parentId: null, position: vector(2_400_000_000, 310_000_000, -1_800_000_000), velocity: vector(), radiusM: 510_000, massKg: 1.2e30, atmosphereHeightM: 0, gravityMps2: 210, rotationPeriodSeconds: 1_620_000, orbitalPeriodSeconds: 0, discoverable: true, discovered: false },
    { id: 'planet-lyra-c', name: 'Calyx', kind: 'planet', parentId: 'star-lyra', position: vector(2_401_800_000, 310_000_000, -1_800_000_000), velocity: vector(0, 0, 830), radiusM: 640_000, massKg: 4.9e22, atmosphereHeightM: 62_000, gravityMps2: 7.4, rotationPeriodSeconds: 82_000, orbitalPeriodSeconds: 19_000_000, discoverable: true, discovered: false },
    { id: 'moon-lyra-c1', name: 'Rill', kind: 'moon', parentId: 'planet-lyra-c', position: vector(2_402_650_000, 310_040_000, -1_800_000_000), velocity: vector(0, 310, 0), radiusM: 92_000, massKg: 7.8e19, atmosphereHeightM: 0, gravityMps2: 0.62, rotationPeriodSeconds: 410_000, orbitalPeriodSeconds: 410_000, discoverable: true, discovered: false },
    { id: 'star-umbra', name: 'Umbra White', kind: 'star', parentId: null, position: vector(-3_100_000_000, -480_000_000, 2_700_000_000), velocity: vector(), radiusM: 430_000, massKg: 9.8e29, atmosphereHeightM: 0, gravityMps2: 185, rotationPeriodSeconds: 1_100_000, orbitalPeriodSeconds: 0, discoverable: true, discovered: false },
    { id: 'planet-umbra-d', name: 'Orison', kind: 'planet', parentId: 'star-umbra', position: vector(-3_102_200_000, -480_000_000, 2_700_000_000), velocity: vector(0, 0, -690), radiusM: 910_000, massKg: 9.2e22, atmosphereHeightM: 34_000, gravityMps2: 9.2, rotationPeriodSeconds: 104_000, orbitalPeriodSeconds: 25_000_000, discoverable: true, discovered: false },
  ];
}

function createGalacticNetwork(): { systems: StarSystemState[]; connections: JumpConnectionState[] } {
  const connections: JumpConnectionState[] = [
    { id: 'jump-gate-helion-lyra', name: 'Magenta Crown Gate', kind: 'jump-gate', fromSystemId: 'system-helion', toSystemId: 'system-lyra', entryPosition: vector(-260_000, 0, 380_000), exitPosition: vector(2_399_700_000, 310_000_000, -1_799_650_000), travelTimeMs: 7_000, active: true, requiredDiscoveryId: 'discovery-crown-gate' },
    { id: 'wormhole-lyra-umbra', name: 'Pale Thread Wormhole', kind: 'wormhole', fromSystemId: 'system-lyra', toSystemId: 'system-umbra', entryPosition: vector(2_400_600_000, 310_090_000, -1_800_400_000), exitPosition: vector(-3_099_450_000, -479_930_000, 2_700_300_000), travelTimeMs: 4_000, active: true, requiredDiscoveryId: 'discovery-pale-thread' },
    { id: 'corridor-umbra-helion', name: 'White Return Corridor', kind: 'engineered-corridor', fromSystemId: 'system-umbra', toSystemId: 'system-helion', entryPosition: vector(-3_100_400_000, -480_000_000, 2_699_650_000), exitPosition: vector(310_000, 20_000, -290_000), travelTimeMs: 10_000, active: true, requiredDiscoveryId: null },
  ];
  const systems: StarSystemState[] = [
    { id: 'system-helion', name: 'Helion Sovereignty', starId: 'star-helion', galacticPosition: vector(), bodyIds: ['star-helion', 'planet-velorum', 'moon-nacre', 'belt-sable'], settlementIds: ['station-sovereign-01', 'settlement-nacre', 'settlement-velorum-reach'], jumpConnectionIds: ['jump-gate-helion-lyra', 'corridor-umbra-helion'], discovered: true },
    { id: 'system-lyra', name: 'Lyra Ember Reach', starId: 'star-lyra', galacticPosition: vector(2_400_000_000, 310_000_000, -1_800_000_000), bodyIds: ['star-lyra', 'planet-lyra-c', 'moon-lyra-c1'], settlementIds: ['settlement-calyx-lattice', 'settlement-rill-mines'], jumpConnectionIds: ['jump-gate-helion-lyra', 'wormhole-lyra-umbra'], discovered: false },
    { id: 'system-umbra', name: 'Umbra Pilgrim Expanse', starId: 'star-umbra', galacticPosition: vector(-3_100_000_000, -480_000_000, 2_700_000_000), bodyIds: ['star-umbra', 'planet-umbra-d'], settlementIds: ['settlement-orison-freeport'], jumpConnectionIds: ['wormhole-lyra-umbra', 'corridor-umbra-helion'], discovered: false },
  ];
  return { systems, connections };
}

function createSettlements(seed: number): SettlementState[] {
  const definitions: ReadonlyArray<Omit<SettlementState, 'proceduralSeed'>> = [
    { id: 'station-sovereign-01', name: 'SnapKitty Sovereign Station', systemId: 'system-helion', regionId: null, position: vector(), kind: 'station', population: 60, residentNpcIds: Array.from({ length: 60 }, (_, index) => deterministicId('npc', index + 1)), factionId: 'faction-sovereign', facilityKinds: ['command', 'market', 'hangar', 'research', 'fabrication', 'medical'], marketId: 'market-station', discovered: true },
    { id: 'settlement-nacre', name: 'Nacre Cooperative', systemId: 'system-helion', regionId: 'region-nacre-landing', position: vector(850_000, 265_100, 420_000), kind: 'surface-city', population: 8_400, residentNpcIds: [], factionId: 'faction-lunar', facilityKinds: ['landing-pad', 'market', 'clinic', 'alloy-works', 'subsurface-habitat'], marketId: 'market-nacre', discovered: true },
    { id: 'settlement-velorum-reach', name: 'Cyan Coast Reach', systemId: 'system-helion', regionId: 'region-velorum-coast', position: vector(0, -175_000, 3_500_000), kind: 'research-outpost', population: 320, residentNpcIds: [], factionId: 'faction-science', facilityKinds: ['landing-pad', 'weather-lab', 'marine-observatory'], marketId: null, discovered: false },
    { id: 'settlement-calyx-lattice', name: 'Calyx Lattice', systemId: 'system-lyra', regionId: null, position: vector(2_401_800_000, 310_640_000, -1_800_000_000), kind: 'surface-city', population: 31_200, residentNpcIds: [], factionId: 'faction-guild', facilityKinds: ['gate-terminal', 'market', 'orbital-elevator', 'habitat'], marketId: null, discovered: false },
    { id: 'settlement-rill-mines', name: 'Rill Lantern Mines', systemId: 'system-lyra', regionId: null, position: vector(2_402_650_000, 310_132_000, -1_800_000_000), kind: 'mining-camp', population: 940, residentNpcIds: [], factionId: 'faction-freebooters', facilityKinds: ['ore-processor', 'dock', 'shelter'], marketId: null, discovered: false },
    { id: 'settlement-orison-freeport', name: 'Orison Freeport', systemId: 'system-umbra', regionId: null, position: vector(-3_102_200_000, 431_000_000, 2_700_000_000), kind: 'freeport', population: 12_600, residentNpcIds: [], factionId: 'faction-freebooters', facilityKinds: ['wormhole-beacon', 'market', 'repair-yard', 'diplomatic-hall'], marketId: null, discovered: false },
  ];
  return definitions.map((settlement, index) => ({ ...settlement, proceduralSeed: normalizeSeed(`${seed}:settlement:${index}`) }));
}

function createLifeforms(): LifeformState[] {
  return [
    { id: 'life-synthetic-choir', name: 'Archive Choir', kind: 'synthetic-life', species: 'distributed photonic persons', locationId: 'room-server', position: vector(0, 36, 10), behavior: 'curates memory and negotiates archival access', population: 12, persistent: true, discovered: true },
    { id: 'life-maintenance-motes', name: 'Golden Maintenance Motes', kind: 'synthetic-life', species: 'cooperative repair microdrones', locationId: 'room-engineering', position: vector(0, -18, 0), behavior: 'swarm toward diagnosed structural faults', population: 240, persistent: true, discovered: true },
    { id: 'life-silica-bloom', name: 'Silica Bloom', kind: 'wildlife', species: 'photosynthetic crystalline colonial life', locationId: 'region-velorum-coast', position: vector(9_000, -175_000, 3_509_000), behavior: 'opens reflective fronds in response to stellar radiation', population: 14_000, persistent: true, discovered: false },
    { id: 'life-velorum-sail', name: 'Velorum Sky Sail', kind: 'wildlife', species: 'upper-atmosphere filter feeder', locationId: 'region-velorum-coast', position: vector(2_400, -130_000, 3_502_000), behavior: 'migrates along electrical storm fronts', population: 380, persistent: true, discovered: false },
    { id: 'life-nacre-lichen', name: 'Nacre Vault Lichen', kind: 'microbial-ecosystem', species: 'radiotrophic extremophile', locationId: 'structure-nacre-vault', position: vector(850_800, 264_700, 420_300), behavior: 'metabolizes trace radionuclides in sealed caverns', population: 2_100_000, persistent: true, discovered: false },
    { id: 'life-rill-constructs', name: 'Rill Burrowers', kind: 'synthetic-life', species: 'abandoned autonomous mining constructs', locationId: 'settlement-rill-mines', position: vector(2_402_650_000, 310_132_000, -1_800_000_000), behavior: 'extends tunnels and defends unregistered claims', population: 74, persistent: true, discovered: false },
  ];
}

function createPlanetaryRegions(): PlanetaryRegionState[] {
  return [{
    id: 'region-nacre-landing', name: 'Nacre Glass Plain', planetId: 'moon-nacre', center: vector(850_000, 265_100, 420_000), radiusM: 18_000,
    landingPadIds: ['landing-pad-nacre-01', 'landing-pad-nacre-02'], settlementIds: ['settlement-nacre'], terrainSeed: 88421,
    oceanLevelM: -2_000, weather: { condition: 'clear', windMps: vector(1.2, 0, 0.3), precipitation: 0, visibilityM: 25_000, temperatureC: -18 },
    undergroundStructureIds: ['structure-nacre-vault'], discovered: true,
  }, {
    id: 'region-velorum-coast', name: 'Velorum Cyan Coast', planetId: 'planet-velorum', center: vector(0, -175_000, 3_500_000), radiusM: 45_000,
    landingPadIds: ['landing-pad-velorum-01'], settlementIds: ['settlement-velorum-reach'], terrainSeed: 19177,
    oceanLevelM: 0, weather: { condition: 'cloudy', windMps: vector(8, 0, -3), precipitation: 0.25, visibilityM: 8_000, temperatureC: 14 },
    undergroundStructureIds: ['structure-tide-observatory'], discovered: false,
  }];
}

function createAsteroids(rng: DeterministicRandom): AsteroidState[] {
  const resources = ['nickel-iron', 'water-ice', 'cobalt', 'silicates', 'rare-earths'];
  return Array.from({ length: 64 }, (_, index) => ({
    id: deterministicId('asteroid', index + 1), fieldId: 'belt-sable',
    transform: {
      position: vector(240_000 + rng.float(-80_000, 80_000), -80_000 + rng.float(-30_000, 30_000), -520_000 + rng.float(-90_000, 90_000)),
      rotation: rotation(rng.float(0, Math.PI * 2), rng.float(0, Math.PI * 2), rng.float(0, Math.PI * 2)),
      velocity: vector(rng.float(-5, 5), rng.float(-3, 3), rng.float(-5, 5)),
      angularVelocity: vector(rng.float(-0.02, 0.02), rng.float(-0.02, 0.02), rng.float(-0.02, 0.02)),
    },
    radiusM: rng.float(8, 140), resource: resources[index % resources.length] as string,
    resourceUnits: rng.int(30, 500), hazard: rng.float(0.05, 0.8),
  }));
}

function createTraffic(): { routes: TrafficRouteState[]; vessels: TrafficVesselState[] } {
  const routes: TrafficRouteState[] = [
    { id: 'route-cargo-lane', name: 'Station-Nacre Cargo Lane', waypointIds: ['station-sovereign-01', 'waypoint-lagrange-1', 'moon-nacre'], laneRadiusM: 4_000, factionId: 'faction-guild' },
    { id: 'route-patrol-ring', name: 'Sovereign Patrol Ring', waypointIds: ['waypoint-patrol-a', 'waypoint-patrol-b', 'waypoint-patrol-c'], laneRadiusM: 1_000, factionId: 'faction-sovereign' },
    { id: 'route-belt-run', name: 'Sable Belt Prospecting Run', waypointIds: ['station-sovereign-01', 'belt-sable'], laneRadiusM: 8_000, factionId: 'faction-science' },
  ];
  const vessels: TrafficVesselState[] = Array.from({ length: 12 }, (_, index) => ({
    id: deterministicId('traffic', index + 1), callsign: `SK-${String(140 + index)}`, shipClass: index % 3 === 0 ? 'Bulk Freighter' : index % 3 === 1 ? 'Civilian Shuttle' : 'Patrol Skiff',
    factionId: index % 4 === 0 ? 'faction-guild' : 'faction-sovereign', routeId: routes[index % routes.length]?.id ?? 'route-cargo-lane',
    routeProgress: (index * 0.083) % 1, speedMps: 35 + (index % 5) * 12, position: vector(3_000 + index * 900, (index % 4) * 120, -2_000 + index * 500),
    cargoCommodityId: index % 3 === 2 ? null : index % 2 === 0 ? 'commodity-alloy' : 'commodity-nutrients',
    status: index === 2 ? 'distress' : index % 3 === 2 ? 'patrol' : 'transit',
  }));
  return { routes, vessels };
}

function createStreamingCells(asteroids: AsteroidState[]): StreamingCellState[] {
  const stationContent = [...ROOM_SPECS.map((room) => room.id), 'station-sovereign-01', 'ship-player-kestrel'];
  return [
    { id: 'cell-station-interior', layer: 'sovereign-interior', center: vector(), radiusM: 400, contentIds: stationContent, priority: 100 },
    { id: 'cell-station-exterior', layer: 'station-exterior', center: vector(), radiusM: 1_500, contentIds: ['hull-sunward', 'hull-docking-spine'], priority: 95 },
    { id: 'cell-local-orbit', layer: 'orbital-space', center: vector(), radiusM: 30_000, contentIds: ['ship-patrol-auric', 'route-patrol-ring'], priority: 90 },
    { id: 'cell-nacre', layer: 'planetary-space', center: vector(850_000, 120_000, 420_000), radiusM: 220_000, contentIds: ['moon-nacre', 'region-nacre-landing'], priority: 80 },
    { id: 'cell-velorum', layer: 'planetary-space', center: vector(0, -1_000_000, 3_500_000), radiusM: 1_000_000, contentIds: ['planet-velorum', 'region-velorum-coast'], priority: 70 },
    { id: 'cell-sable-belt', layer: 'interplanetary-space', center: vector(240_000, -80_000, -520_000), radiusM: 180_000, contentIds: ['belt-sable', ...asteroids.map((asteroid) => asteroid.id)], priority: 60 },
    { id: 'cell-helion', layer: 'galactic-space', center: vector(0, 0, -18_000_000), radiusM: 2_000_000, contentIds: ['star-helion'], priority: 40 },
    { id: 'cell-lyra-system', layer: 'galactic-space', center: vector(2_400_000_000, 310_000_000, -1_800_000_000), radiusM: 4_000_000, contentIds: ['star-lyra', 'planet-lyra-c', 'moon-lyra-c1', 'settlement-calyx-lattice', 'settlement-rill-mines', 'jump-gate-helion-lyra', 'wormhole-lyra-umbra'], priority: 35 },
    { id: 'cell-umbra-system', layer: 'galactic-space', center: vector(-3_100_000_000, -480_000_000, 2_700_000_000), radiusM: 4_000_000, contentIds: ['star-umbra', 'planet-umbra-d', 'settlement-orison-freeport', 'wormhole-lyra-umbra', 'corridor-umbra-helion'], priority: 35 },
  ];
}

function createConstruction(): ConstructionState {
  return {
    ownedSpaces: [{ id: 'owned-room-player', ownerId: 'player-001', targetKind: 'room', targetId: 'room-quarters-b', modificationIds: [], accessList: ['player-001'] }, { id: 'owned-ship-player', ownerId: 'player-001', targetKind: 'ship', targetId: 'ship-player-kestrel', modificationIds: [], accessList: ['player-001'] }],
    projects: [{
      id: 'project-player-workshop', ownerId: 'player-001', targetKind: 'terminal', targetId: 'room-quarters-b', name: 'Personal Workshop Terminal',
      blueprintId: 'blueprint-workshop-terminal', locationId: 'room-quarters-b', requiredResources: { 'commodity-alloy': 8, 'commodity-circuit': 4 },
      deliveredResources: { 'commodity-alloy': 0, 'commodity-circuit': 0 }, laborRequired: 10, laborCompleted: 0, progress: 0,
      status: 'planned', resultingInteractionKind: 'fabricator',
    }],
    completedBlueprintIds: [],
  };
}

export function createInitialWorld(seed: number | string = DEFAULT_UNIVERSE_CONFIG.seed): UniverseState {
  const numericSeed = normalizeSeed(seed);
  const rng = new DeterministicRandom(numericSeed);
  const config: UniverseConfig = { ...DEFAULT_UNIVERSE_CONFIG, seed };
  const { rooms, doors, elevators } = createInterior();
  const factions = createFactions();
  const npcs = createNpcs(rng);
  for (const faction of factions) {
    faction.memberNpcIds = npcs.filter((npc) => npc.factionId === faction.id).map((npc) => npc.id);
    faction.relations = Object.fromEntries(factions.filter((other) => other.id !== faction.id).map((other) => [other.id, other.id === 'faction-freebooters' || faction.id === 'faction-freebooters' ? -15 : 20]));
  }
  const asteroids = createAsteroids(rng);
  const traffic = createTraffic();
  const celestialBodies = createCelestialBodies();
  const galacticNetwork = createGalacticNetwork();
  const planetaryRegions = createPlanetaryRegions();
  const epoch = new Date(config.epochIso).toISOString();
  const hullSections: HullSectionState[] = [
    { id: 'hull-sunward', name: 'Sunward Pilgrimage', bounds: { center: vector(0, 40, -130), halfExtents: vector(100, 4, 42) }, connectedAirlockId: 'airlock-cyan-01', magneticSurface: true, repairNodeIds: ['repair-node-sunward', 'repair-node-array'], hazardLevel: 0.22 },
    { id: 'hull-docking-spine', name: 'Docking Spine', bounds: { center: vector(160, -18, 0), halfExtents: vector(90, 5, 18) }, connectedAirlockId: 'airlock-cyan-01', magneticSurface: true, repairNodeIds: ['repair-node-dock'], hazardLevel: 0.08 },
  ];
  const state: UniverseState = {
    schemaVersion: 1,
    seed: numericSeed,
    rngState: rng.state,
    tick: 0,
    elapsedMs: 0,
    accumulatorMs: 0,
    worldTimeIso: epoch,
    config,
    player: {
      id: 'player-001', name: 'Stone One',
      transform: { position: vector(-60, 5.4, -50), rotation: rotation(), velocity: vector(), angularVelocity: vector() },
      layer: 'sovereign-interior', locationId: 'room-arrivals', traversalMode: 'walking', grounded: true, health: 100,
      suit: { equipped: false, sealed: false, oxygenSeconds: 7_200, propellant: 1, battery: 1, integrity: 1, magneticBoots: false },
      inventory: [{ itemId: 'item-multitool', name: 'Sovereign Multitool', quantity: 1, massKg: 1.2, tags: ['tool', 'repair', 'scan'] }],
      credits: 2_500, activeMissionIds: [], discoveredLocationIds: ['station-sovereign-01', 'moon-nacre'],
      boardedShipId: null, pilotedShipId: null, ownedSpaceIds: ['owned-room-player', 'owned-ship-player'],
      factionReputation: { 'faction-sovereign': 10, 'faction-guild': 0, 'faction-science': 0, 'faction-freebooters': -5, 'faction-lunar': 5 },
    },
    rooms,
    doors,
    airlocks: [{
      id: 'airlock-cyan-01', name: 'Cyan Airlock One', chamberRoomId: 'room-airlock-chamber', innerDoorId: 'door-airlock-inner', outerDoorId: 'door-airlock-outer',
      phase: 'idle-pressurized', requestedDirection: null, pressureKpa: 101.3, atmosphereMoles: 4_120,
      cycleElapsedMs: 0, cycleDurationMs: 4_000, emergencyOverride: false, alarmActive: false, fault: null,
    }],
    elevators,
    hullSections,
    ships: createShips(),
    celestialBodies,
    starSystems: galacticNetwork.systems,
    jumpConnections: galacticNetwork.connections,
    planetaryRegions,
    settlements: createSettlements(numericSeed),
    lifeforms: createLifeforms(),
    asteroids,
    trafficRoutes: traffic.routes,
    traffic: traffic.vessels,
    discoveries: [
      { id: 'discovery-wreck', name: 'Quiet Meridian Wreck', kind: 'abandoned-ship', position: vector(72_000, 4_000, -28_000), layer: 'orbital-space', discovered: false, persistentEffects: ['unlocks archive evidence'] },
      { id: 'discovery-lens', name: 'Glass Horizon', kind: 'anomaly', position: vector(-190_000, 24_000, 310_000), layer: 'interplanetary-space', discovered: false, persistentEffects: ['improves jump navigation'] },
      { id: 'discovery-vault', name: 'Nacre Vault', kind: 'ruin', position: vector(850_800, 264_700, 420_300), layer: 'planet-surface', discovered: false, persistentEffects: ['changes lunar faction history'] },
      { id: 'discovery-cache', name: 'Guild Emergency Cache', kind: 'cache', position: vector(18_000, -900, 12_000), layer: 'orbital-space', discovered: false, persistentEffects: ['adds emergency supplies'] },
      { id: 'discovery-settlement', name: 'Cyan Coast Reach', kind: 'settlement', position: vector(0, -175_000, 3_500_000), layer: 'planet-surface', discovered: false, persistentEffects: ['opens planetary market'] },
      { id: 'discovery-life', name: 'Silica Bloom Habitat', kind: 'wildlife-habitat', position: vector(9_000, 0, 3_509_000), layer: 'planet-surface', discovered: false, persistentEffects: ['enables xenobiology research'] },
      { id: 'discovery-crown-gate', name: 'Magenta Crown Gate', kind: 'anomaly', position: vector(-260_000, 0, 380_000), layer: 'interplanetary-space', discovered: false, persistentEffects: ['unlocks Lyra jump route'] },
      { id: 'discovery-pale-thread', name: 'Pale Thread Wormhole', kind: 'anomaly', position: vector(2_400_600_000, 310_090_000, -1_800_400_000), layer: 'galactic-space', discovered: false, persistentEffects: ['unlocks Umbra wormhole route'] },
    ],
    streaming: { cells: createStreamingCells(asteroids), loadedCellIds: ['cell-station-interior'], pinnedCellIds: ['cell-station-interior'], origin: vector(), originRebaseCount: 0, lastRebaseTick: 0 },
    npcs,
    agents: createAgents(),
    economy: createEconomy(),
    missions: createMissions(),
    factions,
    dialogue: createDialogue(npcs),
    construction: createConstruction(),
    events: [{ id: 'event-world-start', type: 'world-started', tick: 0, sourceId: 'station-sovereign-01', targetId: null, severity: 0, summary: 'The deterministic universe simulation began.', persistent: true, resolved: false, data: { epoch } }],
  };
  for (const room of state.rooms) room.occupantIds = state.npcs.filter((npc) => npc.currentLocationId === room.id).map((npc) => npc.id);
  return state;
}

export function getPurposefulRoomCount(): number {
  return ROOM_SPECS.length;
}

export function worldLayerForLocation(locationId: string): WorldLayer {
  if (locationId.startsWith('room-') || locationId.startsWith('ship-')) return 'sovereign-interior';
  if (locationId.startsWith('hull-')) return 'station-exterior';
  if (locationId.startsWith('region-') || locationId.startsWith('settlement-')) return 'planet-surface';
  return 'orbital-space';
}
