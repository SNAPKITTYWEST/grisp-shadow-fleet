import { checksum, deepClone, stableStringify } from './deterministic.js';
import type { EntityId, SaveEnvelope, UniverseState } from './types.js';

export class PersistenceSystem {
  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
  }

  createEnvelope(): SaveEnvelope {
    this.validate(this.state);
    const snapshot = deepClone(this.state);
    return {
      format: 'snapkitty-universe-save',
      schemaVersion: 1,
      createdAtIso: snapshot.worldTimeIso,
      checksum: checksum(snapshot),
      state: snapshot,
    };
  }

  serialize(): string {
    return stableStringify(this.createEnvelope());
  }

  deserialize(serialized: string | SaveEnvelope | UniverseState): UniverseState {
    const parsed: unknown = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
    if (this.isUniverseState(parsed)) {
      const state = deepClone(parsed);
      this.validate(state);
      return state;
    }
    if (!this.isSaveEnvelope(parsed)) throw new Error('Unsupported or malformed SnapKitty save envelope.');
    if (checksum(parsed.state) !== parsed.checksum) throw new Error('Save checksum mismatch; state was altered or corrupted.');
    const state = deepClone(parsed.state);
    this.validate(state);
    return state;
  }

  validate(state: UniverseState): void {
    if (state.schemaVersion !== 1) throw new Error(`Unsupported universe schema version '${String(state.schemaVersion)}'.`);
    if (!Number.isInteger(state.tick) || state.tick < 0) throw new Error('Universe tick must be a non-negative integer.');
    if (!Number.isFinite(state.elapsedMs) || state.elapsedMs < 0 || !Number.isFinite(state.accumulatorMs) || state.accumulatorMs < 0) throw new Error('Universe time state is invalid.');
    if (Number.isNaN(Date.parse(state.worldTimeIso))) throw new Error('Universe worldTimeIso is invalid.');
    if (state.rooms.length < 20) throw new Error('A playable station requires at least twenty rooms.');
    if (state.npcs.length < 50) throw new Error('Persistent population requires at least fifty NPCs.');
    if (state.agents.length < 6) throw new Error('At least six sovereign agents are required.');
    if (state.missions.length < 10) throw new Error('At least ten state-driven missions are required.');
    this.assertUnique(state.rooms, 'room');
    this.assertUnique(state.doors, 'door');
    this.assertUnique(state.airlocks, 'airlock');
    this.assertUnique(state.ships, 'ship');
    this.assertUnique(state.npcs, 'NPC');
    this.assertUnique(state.agents, 'agent');
    this.assertUnique(state.missions, 'mission');
    this.assertUnique(state.factions, 'faction');
    this.assertUnique(state.starSystems, 'star system');
    this.assertUnique(state.jumpConnections, 'jump connection');
    this.assertUnique(state.settlements, 'settlement');
    this.assertUnique(state.lifeforms, 'lifeform');
    this.assertFiniteNumbers(state);

    const roomIds = new Set(state.rooms.map((room) => room.id));
    const doorIds = new Set(state.doors.map((door) => door.id));
    const factionIds = new Set(state.factions.map((faction) => faction.id));
    const bodyIds = new Set(state.celestialBodies.map((body) => body.id));
    const systemIds = new Set(state.starSystems.map((system) => system.id));
    for (const door of state.doors) {
      if (!roomIds.has(door.fromRoomId) || (door.toRoomId !== null && !roomIds.has(door.toRoomId))) throw new Error(`Door '${door.id}' references a missing room.`);
    }
    for (const airlock of state.airlocks) {
      if (!roomIds.has(airlock.chamberRoomId) || !doorIds.has(airlock.innerDoorId) || !doorIds.has(airlock.outerDoorId)) throw new Error(`Airlock '${airlock.id}' has an invalid room or door reference.`);
      const inner = state.doors.find((door) => door.id === airlock.innerDoorId);
      const outer = state.doors.find((door) => door.id === airlock.outerDoorId);
      if (inner?.position === 'open' && outer?.position === 'open') throw new Error(`Airlock '${airlock.id}' violates the door interlock.`);
      if (airlock.pressureKpa < 0 || airlock.pressureKpa > 110) throw new Error(`Airlock '${airlock.id}' pressure is outside supported limits.`);
    }
    for (const npc of state.npcs) {
      if (!roomIds.has(npc.homeLocationId) || !roomIds.has(npc.workLocationId) || !roomIds.has(npc.currentLocationId)) throw new Error(`NPC '${npc.id}' references a missing station location.`);
      if (!factionIds.has(npc.factionId)) throw new Error(`NPC '${npc.id}' references a missing faction.`);
      if (npc.schedule.length === 0 || npc.goals.length === 0) throw new Error(`NPC '${npc.id}' is missing schedule or goal state.`);
    }
    for (const agent of state.agents) {
      if (agent.permissions.length === 0 || agent.authorityScope.length === 0 || !agent.deterministicFallback) throw new Error(`Agent '${agent.id}' lacks bounded authority or fallback behavior.`);
    }
    for (const system of state.starSystems) {
      if (!bodyIds.has(system.starId) || system.bodyIds.some((id) => !bodyIds.has(id))) throw new Error(`Star system '${system.id}' references a missing celestial body.`);
    }
    for (const connection of state.jumpConnections) {
      if (!systemIds.has(connection.fromSystemId) || !systemIds.has(connection.toSystemId)) throw new Error(`Jump connection '${connection.id}' references a missing star system.`);
    }
    for (const settlement of state.settlements) {
      if (!systemIds.has(settlement.systemId) || !factionIds.has(settlement.factionId)) throw new Error(`Settlement '${settlement.id}' references a missing system or faction.`);
    }
    if (!roomIds.has(state.player.locationId) && !state.ships.some((ship) => ship.id === state.player.locationId) && !state.hullSections.some((hull) => hull.id === state.player.locationId) && !state.planetaryRegions.some((region) => region.id === state.player.locationId) && !state.settlements.some((settlement) => settlement.id === state.player.locationId)) {
      throw new Error(`Player location '${state.player.locationId}' does not exist.`);
    }
    stableStringify(state);
  }

  private assertUnique(items: ReadonlyArray<{ id: EntityId }>, kind: string): void {
    const ids = new Set<EntityId>();
    for (const item of items) {
      if (!item.id || ids.has(item.id)) throw new Error(`Duplicate or empty ${kind} id '${item.id}'.`);
      ids.add(item.id);
    }
  }

  private assertFiniteNumbers(value: unknown, path = 'state', seen = new WeakSet<object>()): void {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}.`);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) throw new Error(`Cyclic data at ${path}.`);
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => this.assertFiniteNumbers(entry, `${path}[${index}]`, seen));
    } else {
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) this.assertFiniteNumbers(entry, `${path}.${key}`, seen);
    }
  }

  private isUniverseState(value: unknown): value is UniverseState {
    return Boolean(value && typeof value === 'object' && (value as { schemaVersion?: unknown }).schemaVersion === 1 && 'player' in value && 'rooms' in value);
  }

  private isSaveEnvelope(value: unknown): value is SaveEnvelope {
    return Boolean(value && typeof value === 'object' && (value as { format?: unknown }).format === 'snapkitty-universe-save' && 'checksum' in value && 'state' in value);
  }
}
