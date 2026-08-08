import { clamp } from './deterministic.js';
import { emitWorldEvent, findRequired, rebuildRoomOccupants } from './state-utils.js';
import type { AirlockDirection, CommandResult, DoorState, EntityId, UniverseState } from './types.js';

const STATION_PRESSURE_KPA = 101.3;
const VACUUM_PRESSURE_KPA = 0.4;

export class InteriorSystem {
  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
  }

  getRoom(roomId: EntityId) {
    return findRequired(this.state.rooms, roomId, 'Room');
  }

  getReachableRooms(roomId = this.state.player.locationId): string[] {
    return this.state.doors
      .filter((door) => door.fromRoomId === roomId || door.toRoomId === roomId)
      .map((door) => door.fromRoomId === roomId ? door.toRoomId : door.fromRoomId)
      .filter((id): id is string => id !== null);
  }

  setSuit(action: 'equip' | 'seal' | 'unseal' | 'mag-boots-on' | 'mag-boots-off'): CommandResult {
    const suit = this.state.player.suit;
    if (action === 'equip') suit.equipped = true;
    if (action === 'seal') {
      if (!suit.equipped) return this.failure('Suit must be equipped before it can be sealed.');
      if (suit.integrity < 0.5 || suit.oxygenSeconds <= 0) return this.failure('Suit cannot seal safely.');
      suit.sealed = true;
    }
    if (action === 'unseal') {
      if (this.state.player.layer !== 'sovereign-interior') return this.failure('Cannot unseal outside a breathable interior.');
      suit.sealed = false;
    }
    if (action === 'mag-boots-on') {
      if (!suit.equipped || suit.battery <= 0) return this.failure('Magnetic boots require a powered suit.');
      suit.magneticBoots = true;
      if (this.state.player.layer === 'station-exterior') this.state.player.traversalMode = 'magnetic-boots';
    }
    if (action === 'mag-boots-off') {
      suit.magneticBoots = false;
      if (this.state.player.layer === 'station-exterior') this.state.player.traversalMode = 'eva';
    }
    const event = emitWorldEvent(this.state, 'suit-state-changed', this.state.player.id, null, `Suit action '${action}' completed.`, { persistent: false, data: { action } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  operateDoor(doorId: EntityId, action: 'open' | 'close', actorPermissions: readonly string[] = []): CommandResult {
    const door = findRequired(this.state.doors, doorId, 'Door');
    if (!door.powered) return this.failure(`${door.name} has no power.`);
    if (action === 'open') {
      if (door.locked) return this.failure(`${door.name} is locked.`);
      if (door.requiredPermission && !actorPermissions.includes(door.requiredPermission)) {
        return this.failure(`${door.name} requires '${door.requiredPermission}'.`);
      }
      const interlockFailure = this.validateAirlockDoorOpening(door);
      if (interlockFailure) return this.failure(interlockFailure);
      door.position = 'open';
      door.openFraction = 1;
    } else {
      door.position = 'closed';
      door.openFraction = 0;
    }
    const event = emitWorldEvent(this.state, `door-${action}ed`, this.state.player.id, door.id, `${door.name} ${action === 'open' ? 'opened' : 'closed'}.`, { persistent: false });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  traverseDoor(doorId: EntityId): CommandResult {
    const door = findRequired(this.state.doors, doorId, 'Door');
    if (door.position !== 'open' || door.openFraction < 0.95) return this.failure(`${door.name} must be open.`);
    const player = this.state.player;
    let destination: string | null = null;
    if (player.locationId === door.fromRoomId) destination = door.toRoomId;
    else if (player.locationId === door.toRoomId) destination = door.fromRoomId;
    if (door.kind === 'airlock-outer' && player.locationId === 'hull-sunward') destination = door.fromRoomId;
    if (!destination && door.kind === 'airlock-outer' && player.locationId === door.fromRoomId) destination = 'hull-sunward';
    if (!destination) return this.failure(`${door.name} is not adjacent to the player.`);

    if (destination.startsWith('hull-')) {
      if (!player.suit.equipped || !player.suit.sealed) return this.failure('A sealed suit is required to enter vacuum.');
      player.locationId = destination;
      player.layer = 'station-exterior';
      player.traversalMode = player.suit.magneticBoots ? 'magnetic-boots' : 'eva';
      player.grounded = player.suit.magneticBoots;
      player.transform.position = { x: 0, y: 45, z: -132 };
    } else {
      player.locationId = destination;
      player.layer = 'sovereign-interior';
      player.traversalMode = 'walking';
      player.grounded = true;
      const room = this.getRoom(destination);
      player.transform.position = { ...room.bounds.center };
      player.transform.position.y += room.environment.gravityMps2 > 0 ? 1.7 : 0;
    }
    rebuildRoomOccupants(this.state);
    const event = emitWorldEvent(this.state, 'door-traversed', player.id, door.id, `Player traversed ${door.name} into ${destination}.`, { data: { destination } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  requestAirlockCycle(airlockId: EntityId, direction: AirlockDirection, emergencyOverride = false): CommandResult {
    const airlock = findRequired(this.state.airlocks, airlockId, 'Airlock');
    const player = this.state.player;
    if (airlock.phase !== 'idle-pressurized' && airlock.phase !== 'idle-vacuum') return this.failure(`${airlock.name} is already cycling.`);
    if (airlock.fault && !emergencyOverride) return this.failure(`${airlock.name} fault: ${airlock.fault}`);
    if (direction === 'to-space') {
      if (player.locationId !== airlock.chamberRoomId) return this.failure('Enter the airlock chamber before requesting depressurization.');
      if ((!player.suit.equipped || !player.suit.sealed || player.suit.integrity < 0.5) && !emergencyOverride) {
        return this.failure('A sealed, serviceable suit is required for depressurization.');
      }
    } else if (player.locationId !== airlock.chamberRoomId) {
      return this.failure('Enter the airlock chamber before requesting pressurization.');
    }

    const inner = findRequired(this.state.doors, airlock.innerDoorId, 'Airlock inner door');
    const outer = findRequired(this.state.doors, airlock.outerDoorId, 'Airlock outer door');
    this.closeAndLock(inner);
    this.closeAndLock(outer);
    airlock.requestedDirection = direction;
    airlock.phase = 'sealing';
    airlock.cycleElapsedMs = 0;
    airlock.emergencyOverride = emergencyOverride;
    airlock.alarmActive = emergencyOverride;
    const event = emitWorldEvent(this.state, 'airlock-cycle-started', player.id, airlock.id, `${airlock.name} began a ${direction} cycle.`, { severity: emergencyOverride ? 0.7 : 0.1, data: { direction, emergencyOverride } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  traverseAirlock(airlockId: EntityId): CommandResult {
    const airlock = findRequired(this.state.airlocks, airlockId, 'Airlock');
    const player = this.state.player;
    const inner = findRequired(this.state.doors, airlock.innerDoorId, 'Airlock inner door');
    const outer = findRequired(this.state.doors, airlock.outerDoorId, 'Airlock outer door');
    if (player.locationId === 'room-eva-prep') {
      if (airlock.phase !== 'idle-pressurized') return this.failure('The airlock chamber is not pressurized.');
      if (inner.position !== 'open') {
        inner.locked = false;
        const opened = this.operateDoor(inner.id, 'open');
        if (!opened.ok) return opened;
      }
      return this.traverseDoor(inner.id);
    }
    if (player.locationId === airlock.chamberRoomId && airlock.phase === 'idle-pressurized') {
      if (inner.position !== 'open') {
        inner.locked = false;
        const opened = this.operateDoor(inner.id, 'open');
        if (!opened.ok) return opened;
      }
      return this.traverseDoor(inner.id);
    }
    if (player.locationId === airlock.chamberRoomId && airlock.phase === 'idle-vacuum') {
      if (outer.position !== 'open') return this.failure('The outer airlock door is not open.');
      return this.traverseDoor(outer.id);
    }
    if (player.locationId === 'hull-sunward' && airlock.phase === 'idle-vacuum') {
      if (outer.position !== 'open') {
        outer.locked = false;
        const opened = this.operateDoor(outer.id, 'open');
        if (!opened.ok) return opened;
      }
      return this.traverseDoor(outer.id);
    }
    return this.failure('Player is not positioned for airlock traversal.');
  }

  requestElevator(elevatorId: EntityId, targetDeck: number): CommandResult {
    const elevator = findRequired(this.state.elevators, elevatorId, 'Elevator');
    if (!elevator.powered) return this.failure(`${elevator.name} is unpowered.`);
    if (!elevator.servedDecks.includes(targetDeck)) return this.failure(`${elevator.name} does not serve deck ${targetDeck}.`);
    if (elevator.targetDeck !== null) return this.failure(`${elevator.name} is already moving.`);
    elevator.targetDeck = targetDeck;
    elevator.progress = 0;
    elevator.doorOpen = false;
    if (this.state.player.locationId === elevator.roomId) {
      elevator.occupantIds = [this.state.player.id];
      this.state.player.traversalMode = 'elevator';
    }
    const event = emitWorldEvent(this.state, 'elevator-requested', this.state.player.id, elevator.id, `${elevator.name} requested for deck ${targetDeck}.`, { persistent: false, data: { targetDeck } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  interact(interactionId: EntityId): CommandResult {
    for (const room of this.state.rooms) {
      const interaction = room.interactionPoints.find((point) => point.id === interactionId);
      if (!interaction) continue;
      if (this.state.player.locationId !== room.id) return this.failure(`${interaction.name} is not in the player's current room.`);
      if (!interaction.enabled || !room.powerOnline) return this.failure(`${interaction.name} is unavailable.`);
      const uses = typeof interaction.state.uses === 'number' ? interaction.state.uses : 0;
      interaction.state.uses = uses + 1;
      interaction.state.lastUsedTick = this.state.tick;
      const event = emitWorldEvent(this.state, 'interaction-used', this.state.player.id, interaction.id, `${interaction.name} used for ${interaction.purpose}`, { data: { roomId: room.id, interactionKind: interaction.kind } });
      return { ok: true, message: event.summary, eventIds: [event.id] };
    }
    return this.failure(`Interaction '${interactionId}' does not exist.`);
  }

  tick(deltaMs: number): void {
    for (const airlock of this.state.airlocks) this.tickAirlock(airlock.id, deltaMs);
    for (const elevator of this.state.elevators) {
      if (elevator.targetDeck === null) continue;
      const deckDistance = Math.max(1, Math.abs(elevator.targetDeck - elevator.currentDeck));
      elevator.progress = clamp(elevator.progress + deltaMs / (2_000 * deckDistance), 0, 1);
      if (elevator.progress >= 1) {
        elevator.currentDeck = elevator.targetDeck;
        elevator.targetDeck = null;
        elevator.progress = 0;
        elevator.doorOpen = true;
        if (elevator.occupantIds.includes(this.state.player.id)) {
          this.state.player.transform.position.y = elevator.currentDeck * 18 + 1.7;
          this.state.player.traversalMode = 'walking';
        }
        elevator.occupantIds = [];
        emitWorldEvent(this.state, 'elevator-arrived', elevator.id, elevator.roomId, `${elevator.name} arrived at deck ${elevator.currentDeck}.`, { persistent: false, data: { deck: elevator.currentDeck } });
      }
    }
  }

  private tickAirlock(airlockId: EntityId, deltaMs: number): void {
    const airlock = findRequired(this.state.airlocks, airlockId, 'Airlock');
    if (!['sealing', 'depressurizing', 'pressurizing'].includes(airlock.phase)) return;
    airlock.cycleElapsedMs += deltaMs;
    if (airlock.phase === 'sealing') {
      if (airlock.cycleElapsedMs < 500) return;
      airlock.cycleElapsedMs = 0;
      airlock.phase = airlock.requestedDirection === 'to-space' ? 'depressurizing' : 'pressurizing';
    }
    const progress = clamp(airlock.cycleElapsedMs / airlock.cycleDurationMs, 0, 1);
    if (airlock.phase === 'depressurizing') airlock.pressureKpa = STATION_PRESSURE_KPA - (STATION_PRESSURE_KPA - VACUUM_PRESSURE_KPA) * progress;
    if (airlock.phase === 'pressurizing') airlock.pressureKpa = VACUUM_PRESSURE_KPA + (STATION_PRESSURE_KPA - VACUUM_PRESSURE_KPA) * progress;
    airlock.atmosphereMoles = 4_120 * (airlock.pressureKpa / STATION_PRESSURE_KPA);
    const chamber = this.getRoom(airlock.chamberRoomId);
    chamber.environment.pressureKpa = airlock.pressureKpa;
    chamber.environment.oxygenFraction = airlock.pressureKpa > 5 ? 0.209 : 0;
    chamber.environment.breathable = airlock.pressureKpa >= 80;
    if (progress < 1) return;

    const inner = findRequired(this.state.doors, airlock.innerDoorId, 'Airlock inner door');
    const outer = findRequired(this.state.doors, airlock.outerDoorId, 'Airlock outer door');
    airlock.cycleElapsedMs = 0;
    if (airlock.phase === 'depressurizing') {
      airlock.phase = 'idle-vacuum';
      airlock.pressureKpa = VACUUM_PRESSURE_KPA;
      inner.locked = true;
      outer.locked = false;
      outer.position = 'open';
      outer.openFraction = 1;
    } else {
      airlock.phase = 'idle-pressurized';
      airlock.pressureKpa = STATION_PRESSURE_KPA;
      outer.locked = true;
      inner.locked = false;
      inner.position = 'open';
      inner.openFraction = 1;
    }
    airlock.requestedDirection = null;
    emitWorldEvent(this.state, 'airlock-cycle-completed', airlock.id, airlock.chamberRoomId, `${airlock.name} completed its pressure cycle.`, { data: { phase: airlock.phase, pressureKpa: airlock.pressureKpa } });
  }

  private validateAirlockDoorOpening(door: DoorState): string | null {
    if (!door.airlockId) return null;
    const airlock = findRequired(this.state.airlocks, door.airlockId, 'Airlock');
    const otherDoorId = door.kind === 'airlock-inner' ? airlock.outerDoorId : airlock.innerDoorId;
    const other = findRequired(this.state.doors, otherDoorId, 'Interlocked airlock door');
    if (other.position !== 'closed' || other.openFraction > 0) return 'Airlock interlock prevents both doors opening together.';
    if (door.kind === 'airlock-inner' && airlock.pressureKpa < 80 && !airlock.emergencyOverride) return 'Airlock chamber pressure is too low to open the inner door.';
    if (door.kind === 'airlock-outer' && airlock.pressureKpa > 5 && !airlock.emergencyOverride) return 'Airlock chamber must be depressurized before opening the outer door.';
    return null;
  }

  private closeAndLock(door: DoorState): void {
    door.position = 'closed';
    door.openFraction = 0;
    door.locked = true;
  }

  private failure(message: string): CommandResult {
    return { ok: false, message, eventIds: [] };
  }
}
