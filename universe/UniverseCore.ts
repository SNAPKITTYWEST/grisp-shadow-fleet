import { AgentSystem } from './AgentSystem.js';
import { ConstructionSystem } from './ConstructionSystem.js';
import { deepClone } from './deterministic.js';
import { DialogueSystem } from './DialogueSystem.js';
import { EconomySystem } from './EconomySystem.js';
import { FactionSystem } from './FactionSystem.js';
import { InteriorSystem } from './InteriorSystem.js';
import { MissionSystem } from './MissionSystem.js';
import { PersistenceSystem } from './PersistenceSystem.js';
import { PlanetSystem } from './PlanetSystem.js';
import { PopulationSystem } from './PopulationSystem.js';
import { ShipSystem } from './ShipSystem.js';
import { SpaceTraversal } from './SpaceTraversal.js';
import { WorldStreaming } from './WorldStreaming.js';
import { DEFAULT_UNIVERSE_CONFIG, createInitialWorld } from './world-data.js';
import type {
  CommandResult,
  SaveEnvelope,
  TickResult,
  TraversalInput,
  UniverseCommand,
  UniverseConfig,
  UniverseState,
} from './types.js';

export type UniverseCoreOptions = Partial<UniverseConfig> & { state?: UniverseState };

export class UniverseCore {
  private mutableState: UniverseState;

  readonly interior: InteriorSystem;
  readonly traversal: SpaceTraversal;
  readonly ships: ShipSystem;
  readonly planets: PlanetSystem;
  readonly streaming: WorldStreaming;
  readonly population: PopulationSystem;
  readonly agents: AgentSystem;
  readonly missions: MissionSystem;
  readonly economy: EconomySystem;
  readonly dialogue: DialogueSystem;
  readonly factions: FactionSystem;
  readonly construction: ConstructionSystem;
  readonly persistence: PersistenceSystem;

  constructor(options: UniverseCoreOptions | UniverseState = {}) {
    const providedState = this.looksLikeState(options) ? options : options.state;
    if (providedState) {
      this.mutableState = deepClone(providedState);
    } else {
      const config = { ...DEFAULT_UNIVERSE_CONFIG, ...options };
      this.mutableState = createInitialWorld(config.seed);
      this.mutableState.config = config;
      this.mutableState.worldTimeIso = new Date(config.epochIso).toISOString();
    }
    this.interior = new InteriorSystem(this.mutableState);
    this.traversal = new SpaceTraversal(this.mutableState);
    this.ships = new ShipSystem(this.mutableState);
    this.planets = new PlanetSystem(this.mutableState);
    this.streaming = new WorldStreaming(this.mutableState);
    this.population = new PopulationSystem(this.mutableState);
    this.agents = new AgentSystem(this.mutableState);
    this.missions = new MissionSystem(this.mutableState);
    this.economy = new EconomySystem(this.mutableState);
    this.dialogue = new DialogueSystem(this.mutableState);
    this.factions = new FactionSystem(this.mutableState);
    this.construction = new ConstructionSystem(this.mutableState);
    this.persistence = new PersistenceSystem(this.mutableState);
    this.persistence.validate(this.mutableState);
  }

  get state(): UniverseState {
    return this.mutableState;
  }

  getState(): UniverseState {
    return deepClone(this.mutableState);
  }

  snapshot(): UniverseState {
    return this.getState();
  }

  dispatch(command: UniverseCommand): CommandResult {
    try {
      switch (command.type) {
        case 'player-move': return this.traversal.setInput(command.input);
        case 'door': return this.interior.operateDoor(command.doorId, command.action);
        case 'door-traverse': return this.interior.traverseDoor(command.doorId);
        case 'interact': return this.interior.interact(command.interactionId);
        case 'airlock-cycle': return this.interior.requestAirlockCycle(command.airlockId, command.direction, command.emergencyOverride ?? false);
        case 'airlock-traverse': return this.interior.traverseAirlock(command.airlockId);
        case 'elevator': return this.interior.requestElevator(command.elevatorId, command.targetDeck);
        case 'suit': return this.interior.setSuit(command.action);
        case 'ship-board': return this.ships.board(command.shipId);
        case 'ship-start': return this.ships.start(command.shipId);
        case 'ship-pilot': return this.ships.takeControl(command.shipId);
        case 'ship-controls': return this.ships.setControls(command.shipId, command.input);
        case 'ship-dock': return this.ships.dock(command.shipId, command.dockId);
        case 'ship-undock': return this.ships.undock(command.shipId);
        case 'ship-land': return this.ships.land(command.shipId, command.regionId);
        case 'ship-jump': return this.ships.beginJump(command.shipId, command.targetId);
        case 'ship-exit': return this.ships.exit(command.shipId);
        case 'mission-accept': return this.missions.accept(command.missionId);
        case 'dialogue-start': return this.dialogue.start(command.npcId);
        case 'dialogue-choose': return this.dialogue.choose(command.sessionId, command.choiceId);
        case 'trade': return this.economy.trade(command.marketId, command.commodityId, command.quantity, command.side);
        case 'agent-task': return this.agents.enqueue(command.agentId, command.task);
        case 'construction-start': return this.construction.start(command.projectId);
        case 'construction-deliver': return this.construction.deliver(command.projectId, command.commodityId, command.quantity);
        case 'construction-work': return this.construction.work(command.projectId, command.labor);
        default: {
          const unknownType = (command as { type?: unknown }).type;
          return { ok: false, message: `Unknown universe command '${String(unknownType)}'.`, eventIds: [] };
        }
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error), eventIds: [] };
    }
  }

  dispatchMany(commands: readonly UniverseCommand[]): CommandResult[] {
    return commands.map((command) => this.dispatch(command));
  }

  interact(action: UniverseCommand | string | { type?: string; [key: string]: unknown }): CommandResult {
    if (typeof action === 'object' && action !== null && typeof action.type === 'string') return this.dispatch(action as UniverseCommand);
    if (typeof action !== 'string') return { ok: false, message: 'Unsupported interaction request.', eventIds: [] };
    if (action.startsWith('interaction-')) return this.interior.interact(action);
    if (action.startsWith('door-')) {
      const door = this.mutableState.doors.find((candidate) => candidate.id === action);
      if (!door) return { ok: false, message: `Door '${action}' does not exist.`, eventIds: [] };
      return door.position === 'open' ? this.interior.traverseDoor(door.id) : this.interior.operateDoor(door.id, 'open');
    }
    if (action === 'airlock') return this.interior.traverseAirlock('airlock-cyan-01');
    if (action === 'board-ship') return this.ships.board('ship-player-kestrel');
    return { ok: false, message: `Unknown interaction '${action}'.`, eventIds: [] };
  }

  tick(deltaMs = this.mutableState.config.tickDurationMs, commandsOrInput?: readonly UniverseCommand[] | TraversalInput): TickResult {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Tick delta must be a non-negative finite number.');
    const startEventIndex = this.mutableState.events.length;
    if (Array.isArray(commandsOrInput)) this.dispatchMany(commandsOrInput);
    else if (commandsOrInput) this.traversal.setInput(commandsOrInput as TraversalInput);
    this.mutableState.accumulatorMs += deltaMs;
    const stepMs = this.mutableState.config.tickDurationMs;
    let completed = 0;
    while (this.mutableState.accumulatorMs >= stepMs && completed < this.mutableState.config.maxCatchUpTicks) {
      this.mutableState.accumulatorMs -= stepMs;
      this.runFixedStep(stepMs);
      completed += 1;
    }
    if (completed >= this.mutableState.config.maxCatchUpTicks) this.mutableState.accumulatorMs = Math.min(this.mutableState.accumulatorMs, stepMs * this.mutableState.config.maxCatchUpTicks);
    return {
      tick: this.mutableState.tick,
      elapsedMs: this.mutableState.elapsedMs,
      worldTimeIso: this.mutableState.worldTimeIso,
      emittedEvents: this.mutableState.events.slice(startEventIndex),
      loadedCellIds: [...this.mutableState.streaming.loadedCellIds],
    };
  }

  serialize(): string {
    return this.persistence.serialize();
  }

  save(): string {
    return this.serialize();
  }

  load(serialized: string | SaveEnvelope | UniverseState): void {
    this.mutableState = this.persistence.deserialize(serialized);
    this.rebindState();
  }

  deserialize(serialized: string | SaveEnvelope | UniverseState): void {
    this.load(serialized);
  }

  reset(seed: number | string = this.mutableState.config.seed): void {
    const config: UniverseConfig = { ...this.mutableState.config, seed };
    this.mutableState = createInitialWorld(seed);
    this.mutableState.config = config;
    this.mutableState.worldTimeIso = new Date(config.epochIso).toISOString();
    this.rebindState();
  }

  private runFixedStep(stepMs: number): void {
    this.mutableState.tick += 1;
    this.mutableState.elapsedMs += stepMs;
    this.mutableState.worldTimeIso = new Date(Date.parse(this.mutableState.config.epochIso) + this.mutableState.elapsedMs).toISOString();
    this.interior.tick(stepMs);
    this.traversal.tick(stepMs);
    this.ships.tick(stepMs);
    this.planets.tick(stepMs);
    this.population.tick(stepMs);
    this.agents.tick();
    this.economy.tick(stepMs);
    this.construction.tick(stepMs);
    this.streaming.tick(stepMs);
    this.missions.tick();
  }

  private rebindState(): void {
    this.interior.replaceState(this.mutableState);
    this.traversal.replaceState(this.mutableState);
    this.ships.replaceState(this.mutableState);
    this.planets.replaceState(this.mutableState);
    this.streaming.replaceState(this.mutableState);
    this.population.replaceState(this.mutableState);
    this.agents.replaceState(this.mutableState);
    this.missions.replaceState(this.mutableState);
    this.economy.replaceState(this.mutableState);
    this.dialogue.replaceState(this.mutableState);
    this.factions.replaceState(this.mutableState);
    this.construction.replaceState(this.mutableState);
    this.persistence.replaceState(this.mutableState);
  }

  private looksLikeState(value: UniverseCoreOptions | UniverseState): value is UniverseState {
    return 'schemaVersion' in value && value.schemaVersion === 1 && 'player' in value;
  }
}
