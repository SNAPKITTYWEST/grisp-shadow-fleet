import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChartNoAxesCombined,
  ChevronsUp,
  FolderOpen,
  Hand,
  Hammer,
  ListChecks,
  Maximize,
  MessageSquare,
  Play,
  Save,
  Scan,
  Terminal,
  Volume2,
  VolumeX,
  X,
  createIcons,
} from 'lucide';
import { AudioSystem } from './AudioSystem.js';
import { DeveloperConsole } from './DeveloperConsole.js';
import { GameRenderer, RENDERED_ROOM_LAYOUT } from './GameRenderer.js';
import type { RendererInput, RendererSnapshot, UniverseZone } from './GameRenderer.js';
import { UIHUD } from './UIHUD.js';
import type { HudPanel, HudSnapshot } from './UIHUD.js';
import { UniverseCore } from './UniverseCore.js';
import type { CommandResult, UniverseState } from './types.js';

const SAVE_KEY = 'snapkitty-universe:vertical-slice:v1';
const SAVE_FORMAT = 'snapkitty-universe-browser-save';
const PLAYER_SHIP_ID = 'ship-player-kestrel';
const AIRLOCK_ID = 'airlock-cyan-01';
const PLANET_REGION_ID = 'region-nacre-landing';
const STATION_MARKET_ID = 'market-station';
const PLANET_RENDER_ORIGIN = { x: 1700, y: -143, z: -4700 } as const;
const AUTOSAVE_INTERVAL_MS = 30_000;
const TELEPORT_TARGETS = ['interior', 'airlock', 'eva', 'ship', 'planet', 'airlock-interior', 'hull', 'ship-dock', 'landing'] as const;
type TeleportTarget = (typeof TELEPORT_TARGETS)[number];
type ActiveHudPanel = Exclude<HudPanel, null>;

const ROOM_BINDINGS = new Map<string, (typeof RENDERED_ROOM_LAYOUT)[number]>(RENDERED_ROOM_LAYOUT.map((room) => [room.visualId, room]));
const VISIBLE_NPC_IDS = new Set(Array.from({ length: 50 }, (_, index) => `npc-${String(index + 1).padStart(3, '0')}`));
const AGENT_BINDINGS: Readonly<Record<string, string>> = {
  'agent-command': 'agent-001',
  'agent-navigation': 'agent-002',
  'agent-engineering': 'agent-003',
  'agent-security': 'agent-004',
  'agent-medical': 'agent-005',
  'agent-commerce': 'agent-006',
  'agent-research': 'agent-007',
  'agent-diplomacy': 'agent-008',
  'agent-logistics': 'agent-009',
  'agent-exploration': 'agent-010',
  'agent-emergency': 'agent-011',
  'agent-environment': 'agent-012',
};

const TERMINAL_BINDINGS: Readonly<Record<string, { locationId: string; interactionId: string; panel: ActiveHudPanel }>> = {
  'mission-terminal': { locationId: 'room-operations', interactionId: 'interaction-operations', panel: 'missions' },
  'economy-terminal': { locationId: 'room-market', interactionId: 'interaction-market', panel: 'economy' },
  'diplomacy-terminal': { locationId: 'room-comms', interactionId: 'interaction-comms', panel: 'dialogue' },
  'construction-terminal': { locationId: 'room-quarters-b', interactionId: 'interaction-quarters-b', panel: 'construction' },
};

interface BrowserSave {
  format: typeof SAVE_FORMAT;
  version: 1;
  core: string;
  renderer: RendererSnapshot;
  activeDialogueSessionId: string | null;
  activeAgentId: string | null;
}

interface LogicalInteractionContext {
  locationId: string;
  panel: ActiveHudPanel;
}

export interface SnapKittyUniverseHandle {
  readonly ready: true;
  readonly core: UniverseCore;
  readonly renderer: GameRenderer;
  readonly hud: UIHUD;
  readonly audio: AudioSystem;
  readonly developerConsole: DeveloperConsole;
  diagnostics: () => Record<string, unknown>;
  teleport: (target: UniverseZone | 'airlock-interior' | 'hull' | 'ship-dock' | 'landing') => RendererSnapshot;
  interact: (interactionId?: string) => unknown;
  board: () => boolean;
  save: () => boolean;
  load: () => boolean;
  tick: (milliseconds?: number) => UniverseState;
}

declare global {
  interface Window {
    __SNAPKITTY_UNIVERSE__?: SnapKittyUniverseHandle;
  }
}

const app = document.querySelector<HTMLElement>('#app') ?? createAppRoot();
const canvasMount = document.querySelector<HTMLElement>('#canvas-mount') ?? createCanvasMount(app);
const core = new UniverseCore({ seed: 0x51a770 });
const audio = new AudioSystem();
const hud = new UIHUD(app);
const developerConsole = new DeveloperConsole(app);
let renderer: GameRenderer;
let activeDialogueSessionId: string | null = null;
let activeAgentId: string | null = null;
let logicalInteractionContext: LogicalInteractionContext | null = null;
let saveStatus = 'LIVE';
let audioEnabled = true;
let lastFrameInput: RendererInput | null = null;
let revertingZoneChange = false;

const report = (result: CommandResult): CommandResult => {
  hud.toast(result.message, result.ok ? 'success' : 'warning');
  developerConsole.log(result.message, result.ok ? 'success' : 'warning');
  return result;
};

const failure = (message: string): CommandResult => ({ ok: false, message, eventIds: [] });
const success = (message: string): CommandResult => ({ ok: true, message, eventIds: [] });

const movePlayerToInteriorLocation = (locationId: string): void => {
  const player = core.state.player;
  player.locationId = locationId;
  player.layer = 'sovereign-interior';
  player.traversalMode = 'walking';
  player.grounded = true;
};

const renderedRoomAt = (position: RendererInput['position']) => {
  if (Math.abs(position.x) < 5.7) return undefined;
  const bay = Math.round((18 - position.z) / 11);
  if (bay < 0 || bay >= 10 || Math.abs(position.z - (18 - bay * 11)) > 4.5) return undefined;
  const visualIndex = bay * 2 + (position.x > 0 ? 2 : 1);
  return ROOM_BINDINGS.get(`room-${visualIndex}`);
};

const fallbackInteriorLocation = (z: number): string => {
  if (z < -92) return 'room-eva-prep';
  if (z < -64) return 'room-engineering';
  if (z < -28) return 'room-operations';
  return 'room-arrivals';
};

const lockedInteractionLocation = (): string | undefined => logicalInteractionContext?.locationId;

const mapPlanetPosition = (position: RendererInput['position']) => {
  const region = core.state.planetaryRegions.find((candidate) => candidate.id === PLANET_REGION_ID);
  if (!region) return { ...position };
  return {
    x: region.center.x + position.x - PLANET_RENDER_ORIGIN.x,
    y: region.center.y + position.y - PLANET_RENDER_ORIGIN.y,
    z: region.center.z + position.z - PLANET_RENDER_ORIGIN.z,
  };
};

const applyAuthoritativeState = (): void => {
  const state = core.state;
  const airlock = state.airlocks.find((candidate) => candidate.id === AIRLOCK_ID);
  const ship = state.ships.find((candidate) => candidate.id === PLAYER_SHIP_ID);
  const inner = airlock ? state.doors.find((door) => door.id === airlock.innerDoorId) : undefined;
  const outer = airlock ? state.doors.find((door) => door.id === airlock.outerDoorId) : undefined;
  renderer.applyAuthoritativeState({
    suit: {
      equipped: state.player.suit.equipped,
      sealed: state.player.suit.sealed,
      oxygenPercent: Math.max(0, Math.min(100, state.player.suit.oxygenSeconds / 7200 * 100)),
      magneticBoots: state.player.suit.magneticBoots,
    },
    ...(airlock ? {
      airlock: {
        pressureKpa: airlock.pressureKpa,
        phase: airlock.phase,
        requestedDirection: airlock.requestedDirection,
        cycleElapsedMs: airlock.cycleElapsedMs,
        cycleDurationMs: airlock.cycleDurationMs,
        innerDoorOpen: inner?.position === 'open',
        innerDoorTargetOpen: inner?.position === 'open',
        outerDoorOpen: outer?.position === 'open',
        outerDoorTargetOpen: outer?.position === 'open',
      },
    } : {}),
    ...(ship ? {
      ship: {
        boarded: state.player.boardedShipId === ship.id,
        docked: ship.flightMode === 'docked',
        planetLanded: ship.flightMode === 'landed',
        flightMode: ship.flightMode,
        velocity: { ...ship.transform.velocity },
      },
    } : {}),
  });
};

const syncCoreFromRenderer = (input: RendererInput): void => {
  const state = core.state;
  const player = state.player;
  if (input.zone !== 'ship') {
    player.transform.position = input.zone === 'planet' ? mapPlanetPosition(input.position) : { ...input.position };
    player.transform.velocity = { ...input.velocity };
    player.transform.rotation = { pitch: input.orientation.pitch, yaw: input.orientation.yaw, roll: input.orientation.roll };
  }

  if (input.zone === 'interior') {
    const renderedRoom = renderedRoomAt(input.position);
    movePlayerToInteriorLocation(lockedInteractionLocation() ?? renderedRoom?.coreRoomId ?? fallbackInteriorLocation(input.position.z));
    player.traversalMode = input.position.y < 1.4 ? 'crouching' : input.boost ? 'sprinting' : 'walking';
  } else if (input.zone === 'eva') {
    player.traversalMode = input.magneticBoots ? 'magnetic-boots' : 'eva';
    player.grounded = input.magneticBoots;
  } else if (input.zone === 'planet') {
    player.traversalMode = input.boost ? 'sprinting' : 'walking';
    player.grounded = true;
  }
};

const tickSimulation = (input: RendererInput, deltaSeconds: number): void => {
  lastFrameInput = input;
  const state = core.state;
  const renderState = renderer.getSnapshot();
  const ship = state.ships.find((candidate) => candidate.id === PLAYER_SHIP_ID);
  if (state.player.suit.magneticBoots !== input.magneticBoots) {
    core.dispatch({ type: 'suit', action: input.magneticBoots ? 'mag-boots-on' : 'mag-boots-off' });
  }
  if (renderState.ship.boarded && state.player.boardedShipId !== PLAYER_SHIP_ID) boardCoreShip();
  if (renderState.ship.boarded && state.player.pilotedShipId === PLAYER_SHIP_ID && ship) {
    if (!renderState.ship.docked && ship.flightMode === 'docked') core.ships.undock(PLAYER_SHIP_ID);
    if (ship.flightMode === 'launching' || ship.flightMode === 'free-flight') {
      core.ships.setControls(PLAYER_SHIP_ID, {
        thrust: { x: input.right, y: input.ascend, z: -input.forward },
        rotation: { x: 0, y: 0, z: input.right * -0.15 },
        brake: input.forward === 0 && input.right === 0 && input.ascend === 0,
        boost: input.boost,
      });
    }
    core.tick(deltaSeconds * 1000);
  } else {
    if (!renderState.ship.boarded && state.player.boardedShipId === PLAYER_SHIP_ID) core.ships.exit(PLAYER_SHIP_ID);
    core.tick(deltaSeconds * 1000, {
      move: { x: input.right, y: 0, z: -input.forward },
      look: { x: 0, y: 0, z: 0 },
      sprint: input.boost,
      crouch: input.zone === 'interior' && input.position.y < 1.4,
      ascend: input.ascend > 0,
      descend: input.ascend < 0,
      brake: input.forward === 0 && input.right === 0 && input.ascend === 0,
    });
  }
  syncCoreFromRenderer(input);
  if (input.zone === 'ship' && ship && state.player.pilotedShipId === ship.id) {
    ship.transform.velocity = { ...input.velocity };
    state.player.transform.velocity = { ...input.velocity };
  }
  applyAuthoritativeState();
};

const boardCoreShip = (): CommandResult => {
  const state = core.state;
  if (state.player.boardedShipId === PLAYER_SHIP_ID) return { ok: true, message: 'Sovereign Kestrel already boarded.', eventIds: [] };
  movePlayerToInteriorLocation('room-hangar');
  const boarded = core.ships.board(PLAYER_SHIP_ID);
  if (!boarded.ok) return report(boarded);
  const started = core.ships.start(PLAYER_SHIP_ID);
  if (!started.ok) return report(started);
  core.tick(3100);
  const piloted = core.ships.takeControl(PLAYER_SHIP_ID);
  report(piloted);
  return piloted;
};

const activateRoomInteraction = (locationId: string, interactionId: string): CommandResult => {
  movePlayerToInteriorLocation(locationId);
  return core.interior.interact(interactionId);
};

const startNpcDialogue = (npcId: string): CommandResult => {
  const npc = VISIBLE_NPC_IDS.has(npcId) ? core.state.npcs.find((candidate) => candidate.id === npcId) : undefined;
  if (!npc) return failure(`Visible citizen '${npcId}' has no persistent population record.`);
  if (npc.currentLocationId.startsWith('room-')) movePlayerToInteriorLocation(npc.currentLocationId);
  else core.state.player.locationId = npc.currentLocationId;
  const result = core.dialogue.start(npcId);
  if (result.ok) {
    activeAgentId = null;
    activeDialogueSessionId = [...core.state.dialogue.sessions].reverse().find((session) => session.npcId === npcId && session.active)?.id ?? null;
    logicalInteractionContext = { locationId: npc.currentLocationId, panel: 'dialogue' };
  }
  return result;
};

const contactAgent = (visualAgentId: string, locationOverride?: string): CommandResult => {
  const agentId = AGENT_BINDINGS[visualAgentId];
  const agent = agentId ? core.state.agents.find((candidate) => candidate.id === agentId) : undefined;
  if (!agent) return failure(`Visible sovereign presence '${visualAgentId}' has no bounded agent record.`);
  const result = core.agents.enqueue(agent.id, {
    type: 'request-review',
    requestedById: core.state.player.id,
    targetId: null,
    parameters: { interface: agent.interactionInterface, worldPresenceId: agent.worldPresenceId },
    requiredPermission: `${agent.domain}.request`,
  });
  if (result.ok) {
    const interactionLocationId = locationOverride ?? (agent.worldPresenceId.startsWith('room-') ? agent.worldPresenceId : core.state.player.locationId);
    if (interactionLocationId.startsWith('room-')) movePlayerToInteriorLocation(interactionLocationId);
    else core.state.player.locationId = interactionLocationId;
    activeDialogueSessionId = null;
    activeAgentId = agent.id;
    logicalInteractionContext = { locationId: interactionLocationId, panel: 'dialogue' };
  }
  return result;
};

const handleWorldInteraction = (interactionId: string): CommandResult | null => {
  const roomBinding = ROOM_BINDINGS.get(interactionId);
  if (roomBinding) return report(activateRoomInteraction(roomBinding.coreRoomId, roomBinding.coreInteractionId));

  const terminal = TERMINAL_BINDINGS[interactionId];
  if (terminal) {
    const result = activateRoomInteraction(terminal.locationId, terminal.interactionId);
    if (!result.ok) return report(result);
    logicalInteractionContext = { locationId: terminal.locationId, panel: terminal.panel };
    if (interactionId === 'diplomacy-terminal') {
      const diplomat = core.state.npcs.find((npc) => npc.workLocationId === 'room-comms' && npc.occupation.includes('diplomatic'));
      if (!diplomat) return report(failure('No persistent diplomatic representative is available.'));
      const dialogue = startNpcDialogue(diplomat.id);
      return report(dialogue.ok
        ? { ok: true, message: `${result.message} ${dialogue.message}`, eventIds: [...result.eventIds, ...dialogue.eventIds] }
        : dialogue);
    }
    activeDialogueSessionId = null;
    activeAgentId = null;
    return report(result);
  }

  if (interactionId === 'eva-suit-locker') {
    movePlayerToInteriorLocation('room-eva-prep');
    const equipped = core.dispatch({ type: 'suit', action: 'equip' });
    if (!equipped.ok) return report(equipped);
    return report(core.dispatch({ type: 'suit', action: 'seal' }));
  }
  if (interactionId === 'airlock-cycle') {
    const airlock = core.state.airlocks.find((candidate) => candidate.id === AIRLOCK_ID);
    return report(core.dispatch({ type: 'airlock-cycle', airlockId: AIRLOCK_ID, direction: (airlock?.pressureKpa ?? 101) > 50 ? 'to-space' : 'to-interior' }));
  }
  if (interactionId === 'airlock-inner') {
    const airlock = core.state.airlocks.find((candidate) => candidate.id === AIRLOCK_ID);
    if (airlock && airlock.pressureKpa < 80) return report(core.dispatch({ type: 'airlock-cycle', airlockId: AIRLOCK_ID, direction: 'to-interior' }));
    return report(core.dispatch({ type: 'door', doorId: 'door-airlock-inner', action: core.state.doors.find((door) => door.id === 'door-airlock-inner')?.position === 'open' ? 'close' : 'open' }));
  }
  if (interactionId === 'airlock-outer') {
    const airlock = core.state.airlocks.find((candidate) => candidate.id === AIRLOCK_ID);
    if (airlock && airlock.pressureKpa > 5) return report(core.dispatch({ type: 'airlock-cycle', airlockId: AIRLOCK_ID, direction: 'to-space' }));
    return report(core.dispatch({ type: 'door', doorId: 'door-airlock-outer', action: core.state.doors.find((door) => door.id === 'door-airlock-outer')?.position === 'open' ? 'close' : 'open' }));
  }
  if (interactionId === 'board-skv-meridian') return boardCoreShip();
  if (interactionId === 'dock-courier') {
    const ship = core.state.ships.find((candidate) => candidate.id === PLAYER_SHIP_ID);
    if (ship) {
      if (!['launching', 'free-flight', 'docking'].includes(ship.flightMode)) return report(failure(`${ship.name} is not in a dockable flight mode.`));
      ship.flightMode = 'free-flight';
      ship.transform.position = { x: 170, y: -18, z: -30 };
      ship.transform.velocity = { x: 0, y: 0, z: 0 };
    }
    return report(core.ships.dock(PLAYER_SHIP_ID, 'dock-hangar-01'));
  }
  if (interactionId === 'land-nyx') {
    const ship = core.state.ships.find((candidate) => candidate.id === PLAYER_SHIP_ID);
    const region = core.state.planetaryRegions.find((candidate) => candidate.id === PLANET_REGION_ID);
    if (ship && region) {
      ship.flightMode = 'free-flight';
      ship.transform.position = { ...region.center };
      ship.transform.velocity = { x: 0, y: 0, z: 0 };
    }
    return report(core.ships.land(PLAYER_SHIP_ID, PLANET_REGION_ID));
  }
  if (interactionId === 'ship-flight-computer' && core.state.player.boardedShipId) {
    const ship = core.state.ships.find((candidate) => candidate.id === PLAYER_SHIP_ID);
    if (!ship || (ship.flightMode !== 'docked' && ship.flightMode !== 'landed')) return report(failure('Dock or land before leaving the flight deck.'));
    return report(core.ships.exit(PLAYER_SHIP_ID));
  }
  if (VISIBLE_NPC_IDS.has(interactionId)) return report(startNpcDialogue(interactionId));
  if (AGENT_BINDINGS[interactionId]) return report(contactAgent(interactionId));
  if (interactionId === 'repair-node-sunward') {
    const result = core.missions.addProgress('mission-repair', 'objective-repair-array', 1);
    const hull = core.state.hullSections.find((section) => section.id === 'hull-sunward');
    if (hull) hull.hazardLevel = Math.max(0, hull.hazardLevel - 0.2);
    return report(result);
  }
  if (interactionId === 'discovery-wreck') {
    const discovery = core.state.discoveries.find((candidate) => candidate.id === 'discovery-wreck');
    if (discovery) discovery.discovered = true;
    core.missions.tick();
    return report(core.missions.addProgress('mission-investigation', 'objective-scan-wreck', 1));
  }
  if (interactionId === 'discovery-life') {
    const discovery = core.state.discoveries.find((candidate) => candidate.id === 'discovery-life');
    if (discovery) discovery.discovered = true;
    return report({ ok: true, message: 'Silica bloom habitat recorded in the persistent discovery ledger.', eventIds: [] });
  }
  if (interactionId === 'ladder-observation-01') {
    movePlayerToInteriorLocation('room-observation');
    core.state.player.traversalMode = 'climbing';
    return report(core.interior.interact('interaction-observation'));
  }
  if (interactionId === 'elevator-observation-01' || interactionId === 'elevator-observation-upper') {
    movePlayerToInteriorLocation('room-transit-lift');
    return report(core.interior.requestElevator('elevator-spine', interactionId.endsWith('upper') ? 1 : 3));
  }
  if (interactionId === 'settlement-nacre' || interactionId === 'nyx-settlement-uplink') {
    core.state.player.locationId = 'settlement-nacre';
    core.state.player.layer = 'planet-surface';
    core.state.player.traversalMode = 'walking';
    return report(contactAgent('agent-logistics', 'settlement-nacre'));
  }
  if (interactionId.startsWith('interaction-')) return report(core.interior.interact(interactionId));
  return null;
};

const buildHudSnapshot = (): HudSnapshot => {
  const state = core.state;
  const activeMission = state.missions.find((mission) => mission.status === 'active') ?? state.missions.find((mission) => mission.status === 'available');
  const market = state.economy.markets.find((candidate) => candidate.id === STATION_MARKET_ID);
  let session = activeDialogueSessionId ? state.dialogue.sessions.find((candidate) => candidate.id === activeDialogueSessionId) : undefined;
  if (session && !session.active) {
    activeDialogueSessionId = null;
    session = undefined;
  }
  const node = session ? state.dialogue.nodes.find((candidate) => candidate.id === session.currentNodeId) : undefined;
  const npc = session ? state.npcs.find((candidate) => candidate.id === session.npcId) : undefined;
  const agent = activeAgentId ? state.agents.find((candidate) => candidate.id === activeAgentId) : undefined;
  const airlock = state.airlocks[0];
  const suitCapacity = 7200;
  const dialogue = node
    ? [{ id: node.id, speaker: npc?.name ?? node.speakerId, text: node.text, choices: session ? core.dialogue.availableChoices(session.id).map((choice) => ({ id: choice.id, text: choice.text })) : [] }]
    : agent
      ? [{ id: `agent-channel-${agent.id}`, speaker: agent.name, text: `${agent.status.toUpperCase()}: ${agent.auditLog.at(-1)?.detail ?? agent.deterministicFallback}`, choices: [] }]
      : [];
  const snapshot: HudSnapshot = {
    credits: state.player.credits,
    worldTime: new Date(state.worldTimeIso).toISOString().slice(11, 16),
    npcCount: state.npcs.length,
    agentCount: state.agents.length,
    missionCount: state.missions.length,
    oxygen: state.player.suit.equipped ? Math.max(0, Math.min(100, state.player.suit.oxygenSeconds / suitCapacity * 100)) : 0,
    integrity: state.player.suit.integrity * 100,
    suited: state.player.suit.equipped && state.player.suit.sealed,
    magneticBoots: state.player.suit.magneticBoots,
    objective: activeMission?.objectives.find((objective) => !objective.completed)?.description ?? 'Reach Airlock A-01 and begin an EVA survey',
    saveStatus,
    missions: state.missions.map((mission) => {
      const required = mission.objectives.reduce((sum, objective) => sum + objective.requiredAmount, 0);
      const current = mission.objectives.reduce((sum, objective) => sum + objective.currentAmount, 0);
      return { id: mission.id, title: mission.title, status: mission.status, objective: mission.description, reward: mission.rewardCredits, progress: required > 0 ? current / required * 100 : 0 };
    }),
    market: market?.listings.map((listing) => {
      const commodity = state.economy.commodities.find((candidate) => candidate.id === listing.commodityId);
      const history = state.economy.priceHistory[listing.commodityId] ?? [];
      const previous = history.at(-2) ?? listing.sellPrice;
      const trend = previous === 0 ? 0 : (listing.sellPrice - previous) / previous * 100;
      return { id: listing.commodityId, marketId: market.id, commodity: commodity?.name ?? listing.commodityId, price: listing.sellPrice, trend, supply: listing.inventory };
    }) ?? [],
    dialogue,
    construction: state.construction.projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      progress: project.progress * 100,
      description: Object.entries(project.requiredResources)
        .map(([commodityId, required]) => `${commodityId.replace('commodity-', '')} ${project.deliveredResources[commodityId] ?? 0}/${required}`)
        .join(' | '),
    })),
  };
  if (renderer?.getSnapshot().zone === 'airlock' && airlock) snapshot.pressure = airlock.pressureKpa;
  if (airlock?.alarmActive) snapshot.alarm = true;
  return snapshot;
};

const rollbackRendererZone = (previous: UniverseZone): void => {
  revertingZoneChange = true;
  try {
    renderer.applySnapshot({ zone: previous, ...(lastFrameInput ? { position: lastFrameInput.position } : {}) });
  } finally {
    revertingZoneChange = false;
  }
};

const handleZoneChange = (zone: UniverseZone, previous: UniverseZone): void => {
  if (revertingZoneChange) return;
  logicalInteractionContext = null;
  hud.showPanel(null);
  let result: CommandResult | null = null;
  if (previous === 'interior' && zone === 'airlock') {
    movePlayerToInteriorLocation('room-eva-prep');
    result = core.interior.traverseAirlock(AIRLOCK_ID);
  } else if ((previous === 'airlock' && (zone === 'interior' || zone === 'eva')) || (previous === 'eva' && zone === 'airlock')) {
    result = core.interior.traverseAirlock(AIRLOCK_ID);
  } else if (zone === 'ship' && core.state.player.boardedShipId !== PLAYER_SHIP_ID) {
    result = boardCoreShip();
  } else if (previous === 'ship' && (zone === 'eva' || zone === 'planet') && core.state.player.boardedShipId === PLAYER_SHIP_ID) {
    result = core.ships.exit(PLAYER_SHIP_ID);
  }
  if (result && !result.ok) {
    report(result);
    rollbackRendererZone(previous);
    applyAuthoritativeState();
    return;
  }
  if (result) developerConsole.log(result.message, 'success');
  applyAuthoritativeState();
};

renderer = new GameRenderer(canvasMount, {
  seed: core.state.seed,
  hud,
  audio,
  bridge: {
    onInput: tickSimulation,
    onInteraction: (id) => {
      const result = handleWorldInteraction(id);
      if (!result) {
        report(failure(`World interaction '${id}' has no authoritative subsystem mapping.`));
        return false;
      }
      hud.update(buildHudSnapshot());
      return result.ok;
    },
    onZoneChange: handleZoneChange,
    getHudSnapshot: buildHudSnapshot,
  },
});

const initializeIcons = (): void => {
  createIcons({ icons: { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChartNoAxesCombined, ChevronsUp, FolderOpen, Hand, Hammer, ListChecks, Maximize, MessageSquare, Play, Save, Scan, Terminal, Volume2, VolumeX, X } });
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isVectorRecord = (value: unknown): value is { x: number; y: number; z: number } => isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z);
const isTeleportTarget = (value: string): value is TeleportTarget => (TELEPORT_TARGETS as readonly string[]).includes(value);

const isRendererSnapshot = (value: unknown): value is RendererSnapshot => {
  if (!isRecord(value) || typeof value.running !== 'boolean' || !['interior', 'airlock', 'eva', 'ship', 'planet'].includes(String(value.zone))) return false;
  if (!isVectorRecord(value.position) || !isVectorRecord(value.velocity) || !isRecord(value.orientation)) return false;
  if (!isFiniteNumber(value.orientation.yaw) || !isFiniteNumber(value.orientation.pitch) || !isFiniteNumber(value.orientation.roll)) return false;
  if (typeof value.flightMode !== 'boolean' || typeof value.magneticBoots !== 'boolean' || typeof value.suited !== 'boolean' || !isFiniteNumber(value.oxygen)) return false;
  if (!isRecord(value.airlock) || !isFiniteNumber(value.airlock.pressure) || typeof value.airlock.cycling !== 'boolean') return false;
  if (!isRecord(value.ship) || typeof value.ship.boarded !== 'boolean' || typeof value.ship.docked !== 'boolean' || typeof value.ship.planetLanded !== 'boolean') return false;
  if (!isVectorRecord(value.ship.position) || !isVectorRecord(value.ship.velocity) || !Array.isArray(value.roomDoors) || !isRecord(value.traversal) || !isRecord(value.world)) return false;
  return true;
};

const validateBrowserSave = (raw: string): { save: BrowserSave; state: UniverseState } => {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.format !== SAVE_FORMAT || parsed.version !== 1 || typeof parsed.core !== 'string') throw new Error('Unsupported universe browser save envelope.');
  if (!isRendererSnapshot(parsed.renderer)) throw new Error('Browser save contains an invalid renderer snapshot.');
  if (parsed.activeDialogueSessionId !== null && typeof parsed.activeDialogueSessionId !== 'string') throw new Error('Browser save contains an invalid dialogue session reference.');
  if (parsed.activeAgentId !== null && typeof parsed.activeAgentId !== 'string') throw new Error('Browser save contains an invalid agent reference.');
  const candidate = new UniverseCore({ seed: 0x51a770 });
  candidate.load(parsed.core);
  const state = candidate.getState();
  if (parsed.activeDialogueSessionId && !state.dialogue.sessions.some((session) => session.id === parsed.activeDialogueSessionId && session.active)) throw new Error('Browser save references an inactive dialogue session.');
  if (parsed.activeAgentId && !state.agents.some((agent) => agent.id === parsed.activeAgentId)) throw new Error('Browser save references an unknown sovereign agent.');
  return { save: parsed as unknown as BrowserSave, state };
};

const persist = (notify = true): boolean => {
  try {
    const session = activeDialogueSessionId ? core.state.dialogue.sessions.find((candidate) => candidate.id === activeDialogueSessionId && candidate.active) : undefined;
    if (!session) activeDialogueSessionId = null;
    const save: BrowserSave = {
      format: SAVE_FORMAT,
      version: 1,
      core: core.serialize(),
      renderer: renderer.getSnapshot(),
      activeDialogueSessionId,
      activeAgentId,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    saveStatus = 'SAVED';
    if (notify) {
      hud.toast('Persistent universe saved', 'success');
      audio.playCue('confirm');
    }
    return true;
  } catch (error) {
    saveStatus = 'ERROR';
    if (notify) hud.toast(error instanceof Error ? error.message : 'Save failed', 'warning');
    return false;
  }
};

const restore = (notify = true): boolean => {
  let previous: { core: string; renderer: RendererSnapshot; dialogue: string | null; agent: string | null } | null = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) throw new Error('No persistent universe save found');
    const { save, state } = validateBrowserSave(raw);
    previous = { core: core.serialize(), renderer: renderer.getSnapshot(), dialogue: activeDialogueSessionId, agent: activeAgentId };
    renderer.applySnapshot(save.renderer);
    core.load(state);
    activeDialogueSessionId = save.activeDialogueSessionId;
    activeAgentId = save.activeAgentId;
    logicalInteractionContext = null;
    applyAuthoritativeState();
    saveStatus = 'RESTORED';
    hud.update(buildHudSnapshot());
    if (notify) {
      hud.toast('Persistent universe restored', 'success');
      audio.playCue('confirm');
    }
    return true;
  } catch (error) {
    if (previous) {
      try {
        core.load(previous.core);
        renderer.applySnapshot(previous.renderer);
        activeDialogueSessionId = previous.dialogue;
        activeAgentId = previous.agent;
        applyAuthoritativeState();
      } catch (rollbackError) {
        developerConsole.log(`Restore rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`, 'error');
      }
    }
    saveStatus = 'ERROR';
    if (notify) hud.toast(error instanceof Error ? error.message : 'Load failed', 'warning');
    return false;
  }
};

const chooseDialogue = (choiceId: string): void => {
  if (!activeDialogueSessionId) { hud.toast('No active communication session', 'warning'); return; }
  const sessionId = activeDialogueSessionId;
  report(core.dialogue.choose(sessionId, choiceId));
  const session = core.state.dialogue.sessions.find((candidate) => candidate.id === sessionId);
  if (!session?.active) {
    activeDialogueSessionId = null;
    logicalInteractionContext = null;
  }
  hud.update(buildHudSnapshot());
};

const toggleAudio = (): void => {
  audioEnabled = !audioEnabled;
  audio.setEnabled(audioEnabled);
  if (audioEnabled) void audio.start();
  const button = app.querySelector<HTMLButtonElement>('[data-action="audio"]');
  if (button) {
    button.setAttribute('aria-pressed', String(!audioEnabled));
    button.innerHTML = `<i data-lucide="${audioEnabled ? 'volume-2' : 'volume-x'}" aria-hidden="true"></i>`;
    initializeIcons();
  }
};

const performConstructionAction = (projectId: string, action: 'start' | 'work'): void => {
  const project = core.state.construction.projects.find((candidate) => candidate.id === projectId);
  if (!project) { report(failure(`Construction project '${projectId}' does not exist.`)); return; }
  if (logicalInteractionContext?.panel === 'construction') movePlayerToInteriorLocation(project.locationId);
  if (core.state.player.locationId !== project.locationId) {
    report(failure(`Use the owned-space fabricator at ${project.locationId} to modify this project.`));
    return;
  }
  if (action === 'start') {
    report(core.construction.start(projectId));
    hud.update(buildHudSnapshot());
    return;
  }

  const missing = Object.entries(project.requiredResources).map(([commodityId, required]) => ({
    commodityId,
    quantity: Math.max(0, required - (project.deliveredResources[commodityId] ?? 0)),
  })).filter((entry) => entry.quantity > 0);
  const shortage = missing.find((entry) => (core.state.player.inventory.find((item) => item.itemId === entry.commodityId)?.quantity ?? 0) < entry.quantity);
  if (shortage) {
    report(failure(`Acquire ${shortage.quantity} ${shortage.commodityId.replace('commodity-', '')} units at Aurora Exchange before fabrication.`));
    return;
  }
  for (const entry of missing) {
    const delivered = core.construction.deliver(projectId, entry.commodityId, entry.quantity);
    if (!delivered.ok) { report(delivered); return; }
  }
  report(core.construction.work(projectId, 10));
  hud.update(buildHudSnapshot());
};

hud.bindActions({
  interact: () => renderer.interact(),
  save: () => { persist(); },
  load: restore,
  togglePanel: (panel) => {
    if (!panel || logicalInteractionContext?.panel !== panel) logicalInteractionContext = null;
  },
  toggleAudio,
  toggleFullscreen: () => { if (document.fullscreenElement) void document.exitFullscreen(); else void app.requestFullscreen(); },
  toggleConsole: () => developerConsole.toggle(),
  requestPointerLock: () => renderer.requestPointerLock(),
  acceptMission: (missionId) => { report(core.missions.accept(missionId)); hud.update(buildHudSnapshot()); },
  trade: (marketId, commodityId, side, quantity) => { report(core.economy.trade(marketId, commodityId, quantity, side)); hud.update(buildHudSnapshot()); },
  chooseDialogue,
  constructionAction: performConstructionAction,
});

const vectorDistance = (left: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }): number => Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);

const buildDiagnostics = (): Record<string, unknown> => {
  const visual = renderer.getDiagnostics();
  const state = core.state;
  const ship = state.ships.find((candidate) => candidate.id === PLAYER_SHIP_ID);
  const airlock = state.airlocks.find((candidate) => candidate.id === AIRLOCK_ID);
  const innerDoor = airlock ? state.doors.find((door) => door.id === airlock.innerDoorId) : undefined;
  const outerDoor = airlock ? state.doors.find((door) => door.id === airlock.outerDoorId) : undefined;
  const expectedPlanetPosition = visual.zone === 'planet' ? mapPlanetPosition(visual.position) : null;
  const expectedLocations: Record<UniverseZone, readonly string[]> = {
    interior: state.rooms.map((room) => room.id),
    airlock: ['room-airlock-chamber'],
    eva: ['hull-sunward'],
    ship: [PLAYER_SHIP_ID],
    planet: [PLANET_REGION_ID, 'settlement-nacre'],
  };
  const agreement = {
    allRenderedRoomsMapped: visual.world.rooms === ROOM_BINDINGS.size && [...ROOM_BINDINGS.values()].every((binding) => state.rooms.some((room) => room.id === binding.coreRoomId && room.interactionPoints.some((point) => point.id === binding.coreInteractionId))),
    allVisibleNpcsPersistent: visual.world.npcs === VISIBLE_NPC_IDS.size && [...VISIBLE_NPC_IDS].every((id) => state.npcs.some((npc) => npc.id === id)),
    allVisibleAgentsBounded: visual.world.agents === Object.keys(AGENT_BINDINGS).length && Object.values(AGENT_BINDINGS).every((id) => state.agents.some((agent) => agent.id === id)),
    missionCountsAgree: visual.world.missions === state.missions.length,
    playerLocationMatchesZone: expectedLocations[visual.zone].includes(state.player.locationId),
    suitStateAgrees: visual.suited === (state.player.suit.equipped && state.player.suit.sealed) && visual.magneticBoots === state.player.suit.magneticBoots,
    airlockPressureAgrees: !airlock || Math.abs(visual.airlock.pressure - airlock.pressureKpa) < 0.6,
    airlockDoorsAgree: !airlock || (visual.airlock.innerDoorTargetOpen === (innerDoor?.position === 'open') && visual.airlock.outerDoorTargetOpen === (outerDoor?.position === 'open')),
    planetCoordinatesMapped: !expectedPlanetPosition || vectorDistance(expectedPlanetPosition, state.player.transform.position) < 1,
    shipAbsolutePositionOwnedByCore: !ship || visual.zone !== 'ship' || state.player.boardedShipId !== ship.id || vectorDistance(state.player.transform.position, ship.transform.position) < 0.01,
    shipModeAgrees: !ship || (visual.ship.boarded === (state.player.boardedShipId === ship.id) && visual.ship.docked === (ship.flightMode === 'docked') && visual.ship.planetLanded === (ship.flightMode === 'landed')),
    shipCorePositionFinite: !ship || Object.values(ship.transform.position).every(Number.isFinite),
  };
  return {
    ...visual,
    simulationTick: state.tick,
    worldTime: state.worldTimeIso,
    events: state.events.length,
    counts: {
      core: {
        rooms: state.rooms.length,
        npcs: state.npcs.length,
        agents: state.agents.length,
        missions: state.missions.length,
        traffic: state.traffic.length,
        asteroids: state.asteroids.length,
      },
      visual: { ...visual.world },
      bindings: { rooms: ROOM_BINDINGS.size, npcs: VISIBLE_NPC_IDS.size, agents: Object.keys(AGENT_BINDINGS).length },
    },
    milestones: {
      rooms: state.rooms.length,
      npcs: state.npcs.length,
      agents: state.agents.length,
      missions: state.missions.length,
      airlocks: state.airlocks.length,
      ships: state.ships.length,
      planetRegions: state.planetaryRegions.length,
      persistentEvents: state.events.filter((event) => event.persistent).length,
    },
    coordinatePolicy: { ship: 'core-absolute; renderer-local position never copied', planet: 'region center plus renderer landing offset' },
    invariantAgreement: { ...agreement, all: Object.values(agreement).every(Boolean) },
  };
};

developerConsole.setDiagnosticsProvider(buildDiagnostics);
developerConsole.register({
  name: 'teleport',
  description: 'Move to a deterministic test location.',
  usage: 'teleport interior|airlock|eva|ship|planet|airlock-interior|hull|ship-dock|landing',
  execute: ({ args }) => {
    const target = args[0] ?? 'interior';
    return isTeleportTarget(target) ? testHandle.teleport(target) : failure(`Unknown teleport target '${target}'.`);
  },
});
developerConsole.register({ name: 'interact', description: 'Execute a world interaction.', usage: 'interact [interaction-id]', execute: ({ args }) => testHandle.interact(args[0]) });
developerConsole.register({ name: 'board', description: 'Board the player-owned courier.', execute: () => testHandle.board() });
developerConsole.register({ name: 'save', description: 'Persist simulation and spatial state.', execute: () => persist() });
developerConsole.register({ name: 'load', description: 'Restore simulation and spatial state.', execute: () => restore() });
developerConsole.register({ name: 'state', description: 'Print the current player state.', execute: () => core.getState().player });
developerConsole.register({ name: 'tick', description: 'Advance deterministic simulation time.', usage: 'tick [milliseconds]', execute: ({ args }) => testHandle.tick(Number(args[0] ?? 1000)) });
developerConsole.register({ name: 'suit', description: 'Equip and seal the EVA suit.', execute: () => handleWorldInteraction('eva-suit-locker') });
developerConsole.register({ name: 'airlock', description: 'Cycle the station airlock.', execute: () => handleWorldInteraction('airlock-cycle') });

const alignCoreWithDeveloperTeleport = (snapshot: RendererSnapshot): void => {
  const player = core.state.player;
  const ship = core.state.ships.find((candidate) => candidate.id === PLAYER_SHIP_ID);
  logicalInteractionContext = null;
  if (snapshot.zone === 'ship') {
    boardCoreShip();
    return;
  }
  if (player.boardedShipId === PLAYER_SHIP_ID && ship) {
    if (snapshot.zone === 'planet') {
      const region = core.state.planetaryRegions.find((candidate) => candidate.id === PLANET_REGION_ID);
      if (region) {
        ship.flightMode = 'landed';
        ship.landedRegionId = region.id;
        ship.dockedAtId = null;
        ship.transform.position = { ...region.center, y: region.center.y + 3 };
        ship.transform.velocity = { x: 0, y: 0, z: 0 };
      }
    }
    core.ships.exit(PLAYER_SHIP_ID);
  }
  if (snapshot.zone === 'interior') movePlayerToInteriorLocation(fallbackInteriorLocation(snapshot.position.z));
  else if (snapshot.zone === 'airlock') movePlayerToInteriorLocation('room-airlock-chamber');
  else if (snapshot.zone === 'eva') {
    core.dispatch({ type: 'suit', action: 'equip' });
    core.dispatch({ type: 'suit', action: 'seal' });
    player.locationId = 'hull-sunward';
    player.layer = 'station-exterior';
    player.traversalMode = player.suit.magneticBoots ? 'magnetic-boots' : 'eva';
    player.grounded = player.suit.magneticBoots;
  } else if (snapshot.zone === 'planet') {
    player.locationId = PLANET_REGION_ID;
    player.layer = 'planet-surface';
    player.traversalMode = 'walking';
    player.grounded = true;
  }
  syncCoreFromRenderer({
    forward: 0,
    right: 0,
    ascend: 0,
    boost: false,
    interact: false,
    flightMode: snapshot.flightMode,
    magneticBoots: snapshot.magneticBoots,
    zone: snapshot.zone,
    position: snapshot.position,
    velocity: snapshot.velocity,
    orientation: snapshot.orientation,
  });
  applyAuthoritativeState();
};

const testHandle: SnapKittyUniverseHandle = {
  ready: true,
  core,
  renderer,
  hud,
  audio,
  developerConsole,
  diagnostics: buildDiagnostics,
  teleport: (target) => {
    revertingZoneChange = true;
    let snapshot: RendererSnapshot;
    try {
      snapshot = renderer.teleport(target);
    } finally {
      revertingZoneChange = false;
    }
    alignCoreWithDeveloperTeleport(snapshot);
    return snapshot;
  },
  interact: (interactionId) => {
    if (!interactionId) return renderer.interact();
    const result = handleWorldInteraction(interactionId);
    applyAuthoritativeState();
    hud.update(buildHudSnapshot());
    return result;
  },
  board: () => {
    renderer.teleport('ship-dock');
    const boarded = renderer.boardShip();
    if (boarded) boardCoreShip();
    return boarded;
  },
  save: () => persist(false),
  load: restore,
  tick: (milliseconds = core.state.config.tickDurationMs) => {
    core.tick(milliseconds);
    applyAuthoritativeState();
    hud.update(buildHudSnapshot());
    return core.getState();
  },
};

window.__SNAPKITTY_UNIVERSE__ = testHandle;
initializeIcons();
hud.update(buildHudSnapshot());
applyAuthoritativeState();
renderer.start();
app.dataset.gameState = 'running';
const loading = document.querySelector<HTMLElement>('#loading-screen');
if (loading) {
  loading.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => { loading.hidden = true; }, 260);
}

const unlockAudio = (): void => { if (audioEnabled) void audio.start(); };
const autosaveTimer = window.setInterval(() => { persist(false); }, AUTOSAVE_INTERVAL_MS);
app.addEventListener('click', (event) => {
  if ((event.target as Element | null)?.closest('[data-action="close"]')) logicalInteractionContext = null;
});
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
window.addEventListener('beforeunload', () => {
  window.clearInterval(autosaveTimer);
  persist(false);
});

function createAppRoot(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'app';
  document.body.append(root);
  return root;
}

function createCanvasMount(root: HTMLElement): HTMLElement {
  let viewport = document.querySelector<HTMLElement>('#viewport');
  if (!viewport) {
    viewport = document.createElement('main');
    viewport.id = 'viewport';
    root.prepend(viewport);
  }
  const mount = document.createElement('div');
  mount.id = 'canvas-mount';
  mount.style.position = 'absolute';
  mount.style.inset = '0';
  viewport.append(mount);
  return mount;
}
