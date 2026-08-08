export type EntityId = string;

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface EulerRotation {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface TransformState {
  position: Vector3;
  rotation: EulerRotation;
  velocity: Vector3;
  angularVelocity: Vector3;
}

export interface Bounds3 {
  center: Vector3;
  halfExtents: Vector3;
}

export type WorldLayer =
  | 'sovereign-interior'
  | 'station-exterior'
  | 'orbital-space'
  | 'planetary-space'
  | 'planet-surface'
  | 'interplanetary-space'
  | 'galactic-space';

export interface EnvironmentState {
  pressureKpa: number;
  oxygenFraction: number;
  temperatureC: number;
  gravityMps2: number;
  radiationMsvPerHour: number;
  breathable: boolean;
}

export type InteractionKind =
  | 'terminal'
  | 'control-panel'
  | 'fabricator'
  | 'medical-bed'
  | 'market-stall'
  | 'storage'
  | 'workstation'
  | 'ladder'
  | 'viewport'
  | 'repair-node'
  | 'airlock-control'
  | 'ship-console'
  | 'construction-anchor';

export interface InteractionPoint {
  id: EntityId;
  name: string;
  kind: InteractionKind;
  purpose: string;
  enabled: boolean;
  permissions: string[];
  state: Record<string, string | number | boolean | null>;
}

export interface RoomState {
  id: EntityId;
  name: string;
  purpose: string;
  deck: number;
  bounds: Bounds3;
  environment: EnvironmentState;
  doorIds: EntityId[];
  interactionPoints: InteractionPoint[];
  capacity: number;
  occupantIds: EntityId[];
  ownerFactionId: EntityId;
  damage: number;
  powerOnline: boolean;
}

export type DoorKind = 'sliding' | 'pressure' | 'blast' | 'airlock-inner' | 'airlock-outer';
export type DoorPosition = 'open' | 'closed' | 'opening' | 'closing';

export interface DoorState {
  id: EntityId;
  name: string;
  kind: DoorKind;
  fromRoomId: EntityId;
  toRoomId: EntityId | null;
  functionalPurpose: string;
  position: DoorPosition;
  openFraction: number;
  locked: boolean;
  powered: boolean;
  sealIntegrity: number;
  requiredPermission: string | null;
  airlockId: EntityId | null;
}

export type AirlockPhase =
  | 'idle-pressurized'
  | 'sealing'
  | 'depressurizing'
  | 'idle-vacuum'
  | 'pressurizing'
  | 'fault';

export type AirlockDirection = 'to-space' | 'to-interior';

export interface AirlockState {
  id: EntityId;
  name: string;
  chamberRoomId: EntityId;
  innerDoorId: EntityId;
  outerDoorId: EntityId;
  phase: AirlockPhase;
  requestedDirection: AirlockDirection | null;
  pressureKpa: number;
  atmosphereMoles: number;
  cycleElapsedMs: number;
  cycleDurationMs: number;
  emergencyOverride: boolean;
  alarmActive: boolean;
  fault: string | null;
}

export interface ElevatorState {
  id: EntityId;
  name: string;
  roomId: EntityId;
  servedDecks: number[];
  currentDeck: number;
  targetDeck: number | null;
  progress: number;
  doorOpen: boolean;
  powered: boolean;
  occupantIds: EntityId[];
}

export interface HullSectionState {
  id: EntityId;
  name: string;
  bounds: Bounds3;
  connectedAirlockId: EntityId;
  magneticSurface: boolean;
  repairNodeIds: EntityId[];
  hazardLevel: number;
}

export type TraversalMode =
  | 'walking'
  | 'sprinting'
  | 'crouching'
  | 'climbing'
  | 'ladder'
  | 'elevator'
  | 'zero-g'
  | 'eva'
  | 'magnetic-boots'
  | 'ship-boarded'
  | 'piloting';

export interface SuitState {
  equipped: boolean;
  sealed: boolean;
  oxygenSeconds: number;
  propellant: number;
  battery: number;
  integrity: number;
  magneticBoots: boolean;
}

export interface InventoryStack {
  itemId: EntityId;
  name: string;
  quantity: number;
  massKg: number;
  tags: string[];
}

export interface PlayerState {
  id: EntityId;
  name: string;
  transform: TransformState;
  layer: WorldLayer;
  locationId: EntityId;
  traversalMode: TraversalMode;
  grounded: boolean;
  health: number;
  suit: SuitState;
  inventory: InventoryStack[];
  credits: number;
  activeMissionIds: EntityId[];
  discoveredLocationIds: EntityId[];
  boardedShipId: EntityId | null;
  pilotedShipId: EntityId | null;
  ownedSpaceIds: EntityId[];
  factionReputation: Record<EntityId, number>;
}

export type ShipFlightMode = 'docked' | 'landed' | 'launching' | 'free-flight' | 'docking' | 'jumping';

export interface ShipSubsystemState {
  power: number;
  health: number;
  online: boolean;
  priority: number;
}

export interface ShipState {
  id: EntityId;
  name: string;
  className: string;
  ownerId: EntityId;
  transform: TransformState;
  flightMode: ShipFlightMode;
  dockedAtId: EntityId | null;
  landedRegionId: EntityId | null;
  pilotId: EntityId | null;
  passengerIds: EntityId[];
  massKg: number;
  maxThrustN: number;
  maneuverThrustN: number;
  fuel: number;
  hullIntegrity: number;
  shield: number;
  cargoCapacityKg: number;
  cargo: InventoryStack[];
  subsystems: Record<'reactor' | 'engines' | 'thrusters' | 'shields' | 'sensors' | 'communications' | 'lifeSupport', ShipSubsystemState>;
  startupStage: 'cold' | 'powering' | 'ready';
  startupElapsedMs: number;
  targetDockId: EntityId | null;
  jumpTargetId: EntityId | null;
  jumpElapsedMs: number;
}

export type CelestialKind = 'star' | 'planet' | 'moon' | 'asteroid-belt' | 'anomaly';

export interface CelestialBodyState {
  id: EntityId;
  name: string;
  kind: CelestialKind;
  parentId: EntityId | null;
  position: Vector3;
  velocity: Vector3;
  radiusM: number;
  massKg: number;
  atmosphereHeightM: number;
  gravityMps2: number;
  rotationPeriodSeconds: number;
  orbitalPeriodSeconds: number;
  discoverable: boolean;
  discovered: boolean;
}

export interface WeatherState {
  condition: 'clear' | 'cloudy' | 'storm' | 'dust' | 'electrical';
  windMps: Vector3;
  precipitation: number;
  visibilityM: number;
  temperatureC: number;
}

export interface PlanetaryRegionState {
  id: EntityId;
  name: string;
  planetId: EntityId;
  center: Vector3;
  radiusM: number;
  landingPadIds: EntityId[];
  settlementIds: EntityId[];
  terrainSeed: number;
  oceanLevelM: number;
  weather: WeatherState;
  undergroundStructureIds: EntityId[];
  discovered: boolean;
}

export interface AsteroidState {
  id: EntityId;
  fieldId: EntityId;
  transform: TransformState;
  radiusM: number;
  resource: string;
  resourceUnits: number;
  hazard: number;
}

export interface TrafficRouteState {
  id: EntityId;
  name: string;
  waypointIds: EntityId[];
  laneRadiusM: number;
  factionId: EntityId;
}

export interface TrafficVesselState {
  id: EntityId;
  callsign: string;
  shipClass: string;
  factionId: EntityId;
  routeId: EntityId;
  routeProgress: number;
  speedMps: number;
  position: Vector3;
  cargoCommodityId: EntityId | null;
  status: 'transit' | 'docking' | 'docked' | 'distress' | 'patrol';
}

export interface DiscoveryState {
  id: EntityId;
  name: string;
  kind: 'abandoned-ship' | 'anomaly' | 'ruin' | 'cache' | 'settlement' | 'wildlife-habitat';
  position: Vector3;
  layer: WorldLayer;
  discovered: boolean;
  persistentEffects: string[];
}

export interface StarSystemState {
  id: EntityId;
  name: string;
  starId: EntityId;
  galacticPosition: Vector3;
  bodyIds: EntityId[];
  settlementIds: EntityId[];
  jumpConnectionIds: EntityId[];
  discovered: boolean;
}

export interface JumpConnectionState {
  id: EntityId;
  name: string;
  kind: 'jump-gate' | 'wormhole' | 'engineered-corridor';
  fromSystemId: EntityId;
  toSystemId: EntityId;
  entryPosition: Vector3;
  exitPosition: Vector3;
  travelTimeMs: number;
  active: boolean;
  requiredDiscoveryId: EntityId | null;
}

export interface SettlementState {
  id: EntityId;
  name: string;
  systemId: EntityId;
  regionId: EntityId | null;
  position: Vector3;
  kind: 'station' | 'surface-city' | 'mining-camp' | 'research-outpost' | 'freeport';
  proceduralSeed: number;
  population: number;
  residentNpcIds: EntityId[];
  factionId: EntityId;
  facilityKinds: string[];
  marketId: EntityId | null;
  discovered: boolean;
}

export interface LifeformState {
  id: EntityId;
  name: string;
  kind: 'wildlife' | 'synthetic-life' | 'microbial-ecosystem';
  species: string;
  locationId: EntityId;
  position: Vector3;
  behavior: string;
  population: number;
  persistent: boolean;
  discovered: boolean;
}

export interface StreamingCellState {
  id: EntityId;
  layer: WorldLayer;
  center: Vector3;
  radiusM: number;
  contentIds: EntityId[];
  priority: number;
}

export interface WorldStreamingState {
  cells: StreamingCellState[];
  loadedCellIds: EntityId[];
  pinnedCellIds: EntityId[];
  origin: Vector3;
  originRebaseCount: number;
  lastRebaseTick: number;
}

export interface ScheduleEntry {
  startMinute: number;
  endMinute: number;
  locationId: EntityId;
  activity: string;
  priority: number;
}

export interface PersonalGoal {
  id: EntityId;
  description: string;
  priority: number;
  progress: number;
  status: 'active' | 'blocked' | 'completed' | 'abandoned';
}

export interface NeedState {
  rest: number;
  nutrition: number;
  safety: number;
  belonging: number;
  purpose: number;
}

export interface RelationshipState {
  targetId: EntityId;
  kind: 'family' | 'friend' | 'colleague' | 'rival' | 'command' | 'acquaintance' | string;
  trust: number;
  affinity: number;
  conflict: number;
  lastInteractionTick: number;
}

export interface MemoryRecord {
  id: EntityId;
  tick: number;
  subjectId: EntityId;
  summary: string;
  emotionalWeight: number;
  confidence: number;
  tags: string[];
}

export interface NpcTaskState {
  id: EntityId;
  kind: string;
  targetId: EntityId | null;
  locationId: EntityId;
  priority: number;
  progress: number;
  status: 'queued' | 'active' | 'completed' | 'failed';
}

export interface LayeredBehaviorState {
  immediateReaction: string;
  shortTermTaskId: EntityId | null;
  longTermGoalId: EntityId;
  factionObligation: string;
  worldEventResponse: string;
  memoryBias: number;
}

export interface NpcPersonality {
  traits: string[];
  values: string[];
  flaw: string;
  /** OCEAN-mapped decay rates: 0.0 = min decay, 1.0 = max decay per field */
  needDecayMod: {
    nutrition: number;
    rest: number;
    safety: number;
    belonging: number;
    purpose: number;
  };
}

export interface NpcVoiceStyle {
  register: string;
  cadence: string;
  markers: string[];
}

export interface NpcReactionWeights {
  promises: number;
  theft: number;
  combat: number;
  rescues: number;
  gifts: number;
  betrayals: number;
  negotiations: number;
  contracts: number;
  lies: number;
  debts: number;
}

export interface NpcState {
  id: EntityId;
  name: string;
  species: string;
  origin: string;
  occupation: string;
  homeLocationId: EntityId;
  workLocationId: EntityId;
  currentLocationId: EntityId;
  schedule: ScheduleEntry[];
  goals: PersonalGoal[];
  needs: NeedState;
  relationships: RelationshipState[];
  factionId: EntityId;
  trustValues: Record<EntityId, number>;
  memories: MemoryRecord[];
  inventory: InventoryStack[];
  dialogueStateId: EntityId;
  playerReaction: 'hostile' | 'wary' | 'neutral' | 'friendly' | 'loyal';
  behavior: LayeredBehaviorState;
  taskQueue: NpcTaskState[];
  alive: boolean;
  health: number;
  credits: number;
  lastUpdatedTick: number;
  /** Canon character id this NPC was seeded from, if any */
  canonCharacterId: EntityId | null;
  /** OCEAN-derived personality used for need simulation */
  personality: NpcPersonality;
  voiceStyle: NpcVoiceStyle;
  /** Trust deltas for different action categories (from canon dynamicReactions) */
  reactionWeights: NpcReactionWeights;
  /** SHA-256 WORM chain head — updated each time a social event is sealed */
  wormHead: string;
}

export type AgentDomain =
  | 'station-command'
  | 'navigation'
  | 'engineering'
  | 'security'
  | 'medical'
  | 'commerce'
  | 'research'
  | 'diplomacy'
  | 'logistics'
  | 'exploration'
  | 'emergency-response'
  | 'environmental-control';

export interface AgentTaskState {
  id: EntityId;
  type: string;
  requestedById: EntityId;
  targetId: EntityId | null;
  parameters: Record<string, string | number | boolean | null>;
  requiredPermission: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'rejected';
  createdTick: number;
  startedTick: number | null;
  completedTick: number | null;
  failureReason: string | null;
}

export interface AgentAuditRecord {
  id: EntityId;
  tick: number;
  taskId: EntityId | null;
  action: string;
  outcome: 'accepted' | 'completed' | 'rejected' | 'failed' | 'fallback';
  detail: string;
}

export interface AgentMemoryRecord {
  id: EntityId;
  tick: number;
  key: string;
  value: string;
  salience: number;
}

export interface SovereignAgentState {
  id: EntityId;
  name: string;
  domain: AgentDomain;
  authorityScope: EntityId[];
  permissions: string[];
  observableState: Record<string, string | number | boolean | null>;
  deterministicFallback: string;
  auditLog: AgentAuditRecord[];
  memory: AgentMemoryRecord[];
  taskQueue: AgentTaskState[];
  currentTaskId: EntityId | null;
  failureCount: number;
  status: 'idle' | 'working' | 'degraded' | 'offline';
  interactionInterface: 'terminal' | 'robot' | 'hologram' | 'ship' | 'body';
  worldPresenceId: EntityId;
}

export interface CommodityState {
  id: EntityId;
  name: string;
  unitMassKg: number;
  basePrice: number;
  category: 'food' | 'industrial' | 'medical' | 'fuel' | 'technology' | 'luxury';
}

export interface MarketListingState {
  commodityId: EntityId;
  inventory: number;
  targetInventory: number;
  productionPerHour: number;
  consumptionPerHour: number;
  buyPrice: number;
  sellPrice: number;
  shortage: boolean;
}

export interface MarketState {
  id: EntityId;
  name: string;
  locationId: EntityId;
  factionId: EntityId;
  listings: MarketListingState[];
  tariffRate: number;
  sanctions: EntityId[];
  credits: number;
}

export interface TradeRouteEconomicState {
  id: EntityId;
  originMarketId: EntityId;
  destinationMarketId: EntityId;
  commodityId: EntityId;
  cargoUnits: number;
  travelProgress: number;
  risk: number;
  assignedTrafficId: EntityId;
}

export interface JobState {
  id: EntityId;
  employerId: EntityId;
  occupation: string;
  locationId: EntityId;
  wagePerHour: number;
  filledByNpcId: EntityId | null;
}

export interface EconomyState {
  commodities: CommodityState[];
  markets: MarketState[];
  tradeRoutes: TradeRouteEconomicState[];
  jobs: JobState[];
  priceHistory: Record<EntityId, number[]>;
  lastUpdateTick: number;
}

export interface MissionObjectiveState {
  id: EntityId;
  description: string;
  kind: 'visit' | 'interact' | 'deliver' | 'repair' | 'rescue' | 'scan' | 'defend' | 'negotiate' | 'construct' | 'trade';
  targetId: EntityId;
  requiredAmount: number;
  currentAmount: number;
  completed: boolean;
}

export interface MissionTriggerState {
  kind: 'shortage' | 'damage' | 'discovery' | 'relationship' | 'traffic-distress' | 'always' | 'construction' | 'conflict';
  targetId: EntityId | null;
  threshold: number;
}

export interface MissionState {
  id: EntityId;
  title: string;
  description: string;
  category: 'rescue' | 'transport' | 'investigation' | 'diplomacy' | 'repair' | 'defense' | 'exploration' | 'construction' | 'trade' | 'political';
  issuerId: EntityId;
  factionId: EntityId;
  status: 'locked' | 'available' | 'active' | 'completed' | 'failed';
  trigger: MissionTriggerState;
  objectives: MissionObjectiveState[];
  rewardCredits: number;
  reputationReward: number;
  acceptedTick: number | null;
  completedTick: number | null;
  expiresTick: number | null;
  consequences: string[];
}

export interface FactionState {
  id: EntityId;
  name: string;
  doctrine: string;
  treasury: number;
  territoryIds: EntityId[];
  memberNpcIds: EntityId[];
  relations: Record<EntityId, number>;
  sanctions: EntityId[];
  activeConflictIds: EntityId[];
  goals: string[];
}

export interface DialogueChoiceState {
  id: EntityId;
  text: string;
  requiredTrust: number;
  trustDelta: number;
  nextNodeId: EntityId | null;
  eventType: string | null;
}

export interface DialogueNodeState {
  id: EntityId;
  speakerId: EntityId;
  text: string;
  choices: DialogueChoiceState[];
}

export interface DialogueSessionState {
  id: EntityId;
  npcId: EntityId;
  currentNodeId: EntityId;
  visitedNodeIds: EntityId[];
  active: boolean;
}

export interface DialogueState {
  nodes: DialogueNodeState[];
  sessions: DialogueSessionState[];
}

export type ConstructionTargetKind = 'room' | 'ship' | 'station' | 'outpost' | 'machine' | 'terminal' | 'defense' | 'production';

export interface ConstructionProjectState {
  id: EntityId;
  ownerId: EntityId;
  targetKind: ConstructionTargetKind;
  targetId: EntityId;
  name: string;
  blueprintId: EntityId;
  locationId: EntityId;
  requiredResources: Record<EntityId, number>;
  deliveredResources: Record<EntityId, number>;
  laborRequired: number;
  laborCompleted: number;
  progress: number;
  status: 'planned' | 'building' | 'paused' | 'completed' | 'cancelled';
  resultingInteractionKind: InteractionKind | null;
}

export interface OwnedSpaceState {
  id: EntityId;
  ownerId: EntityId;
  targetKind: 'room' | 'ship' | 'outpost';
  targetId: EntityId;
  modificationIds: EntityId[];
  accessList: EntityId[];
}

export interface ConstructionState {
  projects: ConstructionProjectState[];
  ownedSpaces: OwnedSpaceState[];
  completedBlueprintIds: EntityId[];
}

export interface WorldEventState {
  id: EntityId;
  type: string;
  tick: number;
  sourceId: EntityId;
  targetId: EntityId | null;
  severity: number;
  summary: string;
  persistent: boolean;
  resolved: boolean;
  data: Record<string, string | number | boolean | null>;
}

export interface UniverseConfig {
  seed: number | string;
  tickDurationMs: number;
  epochIso: string;
  maxCatchUpTicks: number;
  rebaseDistanceM: number;
  streamingRadiusM: number;
}

export interface UniverseState {
  schemaVersion: 1;
  seed: number;
  rngState: number;
  tick: number;
  elapsedMs: number;
  accumulatorMs: number;
  worldTimeIso: string;
  config: UniverseConfig;
  player: PlayerState;
  rooms: RoomState[];
  doors: DoorState[];
  airlocks: AirlockState[];
  elevators: ElevatorState[];
  hullSections: HullSectionState[];
  ships: ShipState[];
  celestialBodies: CelestialBodyState[];
  starSystems: StarSystemState[];
  jumpConnections: JumpConnectionState[];
  planetaryRegions: PlanetaryRegionState[];
  settlements: SettlementState[];
  lifeforms: LifeformState[];
  asteroids: AsteroidState[];
  trafficRoutes: TrafficRouteState[];
  traffic: TrafficVesselState[];
  discoveries: DiscoveryState[];
  streaming: WorldStreamingState;
  npcs: NpcState[];
  agents: SovereignAgentState[];
  economy: EconomyState;
  missions: MissionState[];
  factions: FactionState[];
  dialogue: DialogueState;
  construction: ConstructionState;
  events: WorldEventState[];
}

export interface TraversalInput {
  move: Vector3;
  look: Vector3;
  sprint: boolean;
  crouch: boolean;
  ascend: boolean;
  descend: boolean;
  brake: boolean;
}

export interface ShipControlInput {
  thrust: Vector3;
  rotation: Vector3;
  brake: boolean;
  boost: boolean;
}

export type UniverseCommand =
  | { type: 'player-move'; input: TraversalInput }
  | { type: 'door'; doorId: EntityId; action: 'open' | 'close' }
  | { type: 'door-traverse'; doorId: EntityId }
  | { type: 'interact'; interactionId: EntityId }
  | { type: 'airlock-cycle'; airlockId: EntityId; direction: AirlockDirection; emergencyOverride?: boolean }
  | { type: 'airlock-traverse'; airlockId: EntityId }
  | { type: 'elevator'; elevatorId: EntityId; targetDeck: number }
  | { type: 'suit'; action: 'equip' | 'seal' | 'unseal' | 'mag-boots-on' | 'mag-boots-off' }
  | { type: 'ship-board'; shipId: EntityId }
  | { type: 'ship-start'; shipId: EntityId }
  | { type: 'ship-pilot'; shipId: EntityId }
  | { type: 'ship-controls'; shipId: EntityId; input: ShipControlInput }
  | { type: 'ship-dock'; shipId: EntityId; dockId: EntityId }
  | { type: 'ship-undock'; shipId: EntityId }
  | { type: 'ship-land'; shipId: EntityId; regionId: EntityId }
  | { type: 'ship-jump'; shipId: EntityId; targetId: EntityId }
  | { type: 'ship-exit'; shipId: EntityId }
  | { type: 'mission-accept'; missionId: EntityId }
  | { type: 'dialogue-start'; npcId: EntityId }
  | { type: 'dialogue-choose'; sessionId: EntityId; choiceId: EntityId }
  | { type: 'trade'; marketId: EntityId; commodityId: EntityId; quantity: number; side: 'buy' | 'sell' }
  | { type: 'agent-task'; agentId: EntityId; task: Omit<AgentTaskState, 'id' | 'status' | 'createdTick' | 'startedTick' | 'completedTick' | 'failureReason'> }
  | { type: 'construction-start'; projectId: EntityId }
  | { type: 'construction-deliver'; projectId: EntityId; commodityId: EntityId; quantity: number }
  | { type: 'construction-work'; projectId: EntityId; labor: number };

export interface CommandResult {
  ok: boolean;
  message: string;
  eventIds: EntityId[];
}

export interface TickResult {
  tick: number;
  elapsedMs: number;
  worldTimeIso: string;
  emittedEvents: WorldEventState[];
  loadedCellIds: EntityId[];
}

export interface SaveEnvelope {
  format: 'snapkitty-universe-save';
  schemaVersion: 1;
  createdAtIso: string;
  checksum: string;
  state: UniverseState;
}

export interface SmokeAssertion {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SmokeReport {
  passed: boolean;
  assertions: SmokeAssertion[];
  finalTick: number;
}
