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
  NpcState,
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

const FIRST_NAMES = ['Asha', 'Beren', 'Cato', 'Dara', 'Elian', 'Fia', 'Galen', 'Hana', 'Ivo', 'Juno'];
const LAST_NAMES = ['Vale', 'Okafor', 'Sato', 'Navarro', 'Kestrel', 'Chen'];
const OCCUPATIONS = [
  'command officer', 'navigator', 'reactor engineer', 'security custodian', 'physician', 'market broker',
  'xenobiologist', 'diplomatic envoy', 'cargo coordinator', 'survey pilot', 'emergency technician', 'atmosphere gardener',
];
const WORK_LOCATIONS = [
  'room-command', 'room-navigation', 'room-reactor', 'room-security', 'room-medical', 'room-market',
  'room-research', 'room-comms', 'room-cargo', 'room-hangar', 'room-engineering', 'room-life-support',
];

function createNpcs(rng: DeterministicRandom): NpcState[] {
  const npcs: NpcState[] = [];
  for (let index = 0; index < 60; index += 1) {
    const id = deterministicId('npc', index + 1);
    const first = FIRST_NAMES[index % FIRST_NAMES.length] as string;
    const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length)] as string;
    const workLocationId = WORK_LOCATIONS[index % WORK_LOCATIONS.length] as string;
    const homeLocationId = index % 2 === 0 ? 'room-quarters-a' : 'room-quarters-b';
    const factionId = index < 30 ? 'faction-sovereign' : index < 42 ? 'faction-guild' : index < 52 ? 'faction-science' : 'faction-lunar';
    npcs.push({
      id,
      name: `${first} ${last}`,
      species: index % 11 === 0 ? 'synthetic person' : index % 7 === 0 ? 'lunar-adapted human' : 'human',
      origin: index % 4 === 0 ? 'Nacre Moon' : index % 4 === 1 ? 'Sovereign Station' : index % 4 === 2 ? 'Cygnet Habitat' : 'Diaspora Fleet',
      occupation: OCCUPATIONS[index % OCCUPATIONS.length] as string,
      homeLocationId,
      workLocationId,
      currentLocationId: index % 3 === 0 ? workLocationId : homeLocationId,
      schedule: [
        { startMinute: 0, endMinute: 420, locationId: homeLocationId, activity: 'rest', priority: 70 },
        { startMinute: 420, endMinute: 480, locationId: 'room-galley', activity: 'breakfast and social contact', priority: 60 },
        { startMinute: 480, endMinute: 960, locationId: workLocationId, activity: OCCUPATIONS[index % OCCUPATIONS.length] as string, priority: 90 },
        { startMinute: 960, endMinute: 1080, locationId: index % 2 === 0 ? 'room-market' : 'room-observation', activity: 'personal time', priority: 45 },
        { startMinute: 1080, endMinute: 1440, locationId: homeLocationId, activity: 'rest', priority: 70 },
      ],
      goals: [{
        id: `goal-${id}-primary`,
        description: `Improve ${OCCUPATIONS[index % OCCUPATIONS.length] as string} outcomes for the station`,
        priority: 60 + (index % 30), progress: rng.float(0, 0.25), status: 'active',
      }],
      needs: {
        rest: rng.int(65, 100), nutrition: rng.int(65, 100), safety: rng.int(70, 100),
        belonging: rng.int(55, 100), purpose: rng.int(65, 100),
      },
      relationships: [],
      factionId,
      trustValues: { 'player-001': 0 },
      memories: [{ id: `memory-${id}-arrival`, tick: 0, subjectId: 'station-sovereign-01', summary: 'Began the current station rotation.', emotionalWeight: 0.2, confidence: 1, tags: ['station', 'arrival'] }],
      inventory: [{ itemId: 'item-comm-unit', name: 'Personal Communicator', quantity: 1, massKg: 0.2, tags: ['tool', 'communications'] }],
      dialogueStateId: `dialogue-${id}-greeting`,
      playerReaction: 'neutral',
      behavior: {
        immediateReaction: 'observe safely', shortTermTaskId: null, longTermGoalId: `goal-${id}-primary`,
        factionObligation: 'perform assigned duty', worldEventResponse: 'monitor local alerts', memoryBias: 0,
      },
      taskQueue: [], alive: true, health: 100, credits: 150 + index * 17, lastUpdatedTick: 0,
    });
  }
  for (let index = 0; index < npcs.length; index += 1) {
    const npc = npcs[index] as NpcState;
    const next = npcs[(index + 1) % npcs.length] as NpcState;
    const previous = npcs[(index + npcs.length - 1) % npcs.length] as NpcState;
    npc.relationships.push(
      { targetId: next.id, kind: 'colleague', trust: 20 + (index % 35), affinity: 15, conflict: 0, lastInteractionTick: 0 },
      { targetId: previous.id, kind: index % 9 === 0 ? 'rival' : 'friend', trust: index % 9 === 0 ? -15 : 35, affinity: index % 9 === 0 ? -10 : 40, conflict: index % 9 === 0 ? 35 : 0, lastInteractionTick: 0 },
    );
  }
  return npcs;
}

function createAgents(): SovereignAgentState[] {
  const domains: AgentDomain[] = [
    'station-command', 'navigation', 'engineering', 'security', 'medical', 'commerce', 'research',
    'diplomacy', 'logistics', 'exploration', 'emergency-response', 'environmental-control',
  ];
  const presences = ['room-command', 'room-navigation', 'room-engineering', 'room-security', 'room-medical', 'room-market', 'room-research', 'room-comms', 'room-cargo', 'ship-player-kestrel', 'room-operations', 'room-life-support'];
  const interfaces: SovereignAgentState['interactionInterface'][] = ['hologram', 'terminal', 'robot', 'body', 'hologram', 'terminal', 'terminal', 'hologram', 'robot', 'ship', 'robot', 'terminal'];
  return domains.map((domain, index) => ({
    id: deterministicId('agent', index + 1),
    name: `${domain.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ')} Custodian`,
    domain,
    authorityScope: [presences[index] as string, 'station-sovereign-01'],
    permissions: [`${domain}.observe`, `${domain}.operate`, `${domain}.request`],
    observableState: { heartbeat: true, workload: 0, lastDecisionTick: 0 },
    deterministicFallback: `Place ${domain} assets in safe state, preserve life, and request human review.`,
    auditLog: [],
    memory: [{ id: `agent-memory-${index + 1}-charter`, tick: 0, key: 'charter', value: `Bounded authority for ${domain}`, salience: 1 }],
    taskQueue: [], currentTaskId: null, failureCount: 0, status: 'idle',
    interactionInterface: interfaces[index] as SovereignAgentState['interactionInterface'], worldPresenceId: presences[index] as string,
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
