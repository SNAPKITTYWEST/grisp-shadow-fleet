import { addVector, clamp, clampMagnitude, distance, magnitude, scaleVector, vector } from './deterministic.js';
import { emitWorldEvent, findRequired } from './state-utils.js';
import type { CommandResult, EntityId, ShipControlInput, ShipState, UniverseState, Vector3 } from './types.js';

const EMPTY_CONTROLS: ShipControlInput = { thrust: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, brake: false, boost: false };

export class ShipSystem {
  private readonly controls = new Map<EntityId, ShipControlInput>();

  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
    this.controls.clear();
  }

  board(shipId: EntityId): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    const player = this.state.player;
    if (player.boardedShipId) return this.failure('Player is already aboard a ship.');
    const accessible = (ship.flightMode === 'docked' && ['room-hangar', 'room-docking'].includes(player.locationId))
      || (ship.flightMode === 'landed' && player.locationId === ship.landedRegionId)
      || (player.traversalMode === 'eva' && distance(player.transform.position, ship.transform.position) <= 12);
    if (!accessible) return this.failure(`${ship.name} is not within boarding access.`);
    player.boardedShipId = ship.id;
    player.locationId = ship.id;
    player.layer = 'sovereign-interior';
    player.traversalMode = 'ship-boarded';
    player.grounded = true;
    player.transform.position = { ...ship.transform.position };
    if (!ship.passengerIds.includes(player.id)) ship.passengerIds.push(player.id);
    const event = emitWorldEvent(this.state, 'ship-boarded', player.id, ship.id, `Player boarded ${ship.name}.`);
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  start(shipId: EntityId): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    if (this.state.player.boardedShipId !== ship.id) return this.failure('Board the ship before startup.');
    if (ship.startupStage === 'ready') return { ok: true, message: `${ship.name} is already ready.`, eventIds: [] };
    if (ship.fuel <= 0 || ship.subsystems.reactor.health <= 0.2) return this.failure(`${ship.name} cannot start: reactor or fuel unavailable.`);
    ship.startupStage = 'powering';
    ship.startupElapsedMs = 0;
    ship.subsystems.reactor.online = true;
    ship.subsystems.reactor.power = 0.2;
    const event = emitWorldEvent(this.state, 'ship-startup-began', this.state.player.id, ship.id, `${ship.name} startup sequence began.`, { persistent: false });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  takeControl(shipId: EntityId): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    if (this.state.player.boardedShipId !== ship.id) return this.failure('Player must be aboard the ship.');
    if (ship.startupStage !== 'ready') return this.failure('Ship startup must complete before taking control.');
    ship.pilotId = this.state.player.id;
    this.state.player.pilotedShipId = ship.id;
    this.state.player.traversalMode = 'piloting';
    const event = emitWorldEvent(this.state, 'ship-control-assumed', this.state.player.id, ship.id, `Player assumed control of ${ship.name}.`);
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  setControls(shipId: EntityId, input: ShipControlInput): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    if (ship.pilotId !== this.state.player.id || this.state.player.pilotedShipId !== ship.id) return this.failure('Player is not piloting this ship.');
    if (ship.flightMode !== 'free-flight' && ship.flightMode !== 'launching') return this.failure('Flight controls require a free-flight ship.');
    this.controls.set(ship.id, {
      thrust: clampMagnitude(input.thrust, 1), rotation: clampMagnitude(input.rotation, 1),
      brake: input.brake, boost: input.boost,
    });
    return { ok: true, message: 'Ship control input queued.', eventIds: [] };
  }

  undock(shipId: EntityId): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    if (ship.pilotId !== this.state.player.id) return this.failure('Only the active pilot can undock.');
    if (ship.startupStage !== 'ready') return this.failure('Ship is not flight ready.');
    if (ship.flightMode !== 'docked' && ship.flightMode !== 'landed') return this.failure('Ship is not docked or landed.');
    ship.flightMode = 'launching';
    ship.dockedAtId = null;
    ship.landedRegionId = null;
    ship.transform.velocity = vector(0, 0, 4);
    const event = emitWorldEvent(this.state, 'ship-undocked', this.state.player.id, ship.id, `${ship.name} released clamps and entered the launch corridor.`);
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  dock(shipId: EntityId, dockId: EntityId): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    if (ship.pilotId !== this.state.player.id) return this.failure('Only the active pilot can dock.');
    if (ship.flightMode !== 'free-flight' && ship.flightMode !== 'docking' && ship.flightMode !== 'launching') return this.failure('Ship is not in a dockable flight mode.');
    const dockPosition = this.dockPosition(dockId);
    if (!dockPosition) return this.failure(`Dock '${dockId}' does not exist.`);
    if (distance(ship.transform.position, dockPosition) > 250) return this.failure('Ship is outside docking capture range.');
    if (magnitude(ship.transform.velocity) > 25) return this.failure('Ship relative velocity is too high for docking.');
    ship.flightMode = 'docked';
    ship.dockedAtId = dockId;
    ship.landedRegionId = null;
    ship.targetDockId = null;
    ship.transform.position = { ...dockPosition };
    ship.transform.velocity = vector();
    const event = emitWorldEvent(this.state, 'ship-docked', this.state.player.id, ship.id, `${ship.name} docked at ${dockId}.`);
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  requestDocking(shipId: EntityId, dockId: EntityId): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    if (ship.flightMode !== 'free-flight') return this.failure('Docking request requires free flight.');
    if (!this.dockPosition(dockId)) return this.failure(`Dock '${dockId}' does not exist.`);
    ship.flightMode = 'docking';
    ship.targetDockId = dockId;
    const event = emitWorldEvent(this.state, 'docking-clearance-granted', 'agent-002', ship.id, `${ship.name} received docking guidance for ${dockId}.`, { persistent: false });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  land(shipId: EntityId, regionId: EntityId): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    const region = findRequired(this.state.planetaryRegions, regionId, 'Planetary region');
    if (ship.pilotId !== this.state.player.id) return this.failure('Only the active pilot can land.');
    if (ship.flightMode !== 'free-flight') return this.failure('Ship must be in free flight to land.');
    if (distance(ship.transform.position, region.center) > region.radiusM + 20_000) return this.failure('Ship has not approached the landing region.');
    if (magnitude(ship.transform.velocity) > 160) return this.failure('Ship velocity is too high for landing approach.');
    ship.flightMode = 'landed';
    ship.landedRegionId = region.id;
    ship.dockedAtId = null;
    ship.transform.position = { ...region.center, y: region.center.y + 3 };
    ship.transform.velocity = vector();
    this.state.player.layer = 'planet-surface';
    const event = emitWorldEvent(this.state, 'ship-landed', this.state.player.id, ship.id, `${ship.name} landed in ${region.name}.`, { data: { regionId } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  beginJump(shipId: EntityId, targetId: EntityId): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    const targetExists = this.state.celestialBodies.some((body) => body.id === targetId)
      || this.state.discoveries.some((discovery) => discovery.id === targetId)
      || this.state.settlements.some((settlement) => settlement.id === targetId)
      || this.state.jumpConnections.some((connection) => connection.id === targetId);
    if (!targetExists) return this.failure(`Jump target '${targetId}' does not exist.`);
    if (ship.pilotId !== this.state.player.id || ship.flightMode !== 'free-flight') return this.failure('Active piloting in free flight is required for jump travel.');
    if (ship.fuel < 0.08 || ship.subsystems.engines.health < 0.5) return this.failure('Insufficient jump capability.');
    const connection = this.state.jumpConnections.find((candidate) => candidate.id === targetId);
    if (connection?.requiredDiscoveryId && !this.state.discoveries.find((discovery) => discovery.id === connection.requiredDiscoveryId)?.discovered) {
      return this.failure(`${connection.name} has not been discovered and calibrated.`);
    }
    ship.flightMode = 'jumping';
    ship.jumpTargetId = targetId;
    ship.jumpElapsedMs = 0;
    ship.fuel = clamp(ship.fuel - 0.08, 0, 1);
    const event = emitWorldEvent(this.state, 'ship-jump-began', this.state.player.id, ship.id, `${ship.name} entered a continuous travel corridor toward ${targetId}.`);
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  exit(shipId: EntityId): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    const player = this.state.player;
    if (player.boardedShipId !== ship.id) return this.failure('Player is not aboard this ship.');
    if (ship.flightMode !== 'docked' && ship.flightMode !== 'landed' && (!player.suit.equipped || !player.suit.sealed)) {
      return this.failure('A sealed suit is required to exit a ship in space.');
    }
    if (ship.pilotId === player.id) ship.pilotId = null;
    player.pilotedShipId = null;
    player.boardedShipId = null;
    ship.passengerIds = ship.passengerIds.filter((id) => id !== player.id);
    if (ship.flightMode === 'docked') {
      player.locationId = ship.dockedAtId === 'dock-hangar-01' ? 'room-hangar' : 'room-docking';
      player.layer = 'sovereign-interior';
      player.traversalMode = 'walking';
      player.grounded = true;
    } else if (ship.flightMode === 'landed' && ship.landedRegionId) {
      player.locationId = ship.landedRegionId;
      player.layer = 'planet-surface';
      player.traversalMode = 'walking';
      player.grounded = true;
    } else {
      player.locationId = ship.id;
      player.layer = 'orbital-space';
      player.traversalMode = 'eva';
      player.grounded = false;
    }
    player.transform.position = addVector(ship.transform.position, vector(0, 0, -6));
    player.transform.velocity = { ...ship.transform.velocity };
    const event = emitWorldEvent(this.state, 'ship-exited', player.id, ship.id, `Player exited ${ship.name}.`);
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  repair(shipId: EntityId, subsystem: keyof ShipState['subsystems'], amount: number): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    if (this.state.player.boardedShipId !== ship.id && distance(this.state.player.transform.position, ship.transform.position) > 10) return this.failure('Ship is outside repair reach.');
    const tool = this.state.player.inventory.find((item) => item.tags.includes('repair'));
    if (!tool) return this.failure('A repair tool is required.');
    ship.subsystems[subsystem].health = clamp(ship.subsystems[subsystem].health + Math.max(0, amount), 0, 1);
    const event = emitWorldEvent(this.state, 'ship-subsystem-repaired', this.state.player.id, ship.id, `${ship.name} ${subsystem} repaired.`, { data: { subsystem, amount } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  applyDamage(shipId: EntityId, amount: number, subsystem?: keyof ShipState['subsystems']): void {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    const residual = Math.max(0, amount - ship.shield);
    ship.shield = clamp(ship.shield - amount, 0, 1);
    ship.hullIntegrity = clamp(ship.hullIntegrity - residual, 0, 1);
    if (subsystem) ship.subsystems[subsystem].health = clamp(ship.subsystems[subsystem].health - residual, 0, 1);
    emitWorldEvent(this.state, 'ship-damaged', 'environment', ship.id, `${ship.name} sustained damage.`, { severity: amount, data: { amount, subsystem: subsystem ?? null } });
  }

  tick(deltaMs: number): void {
    const deltaSeconds = deltaMs / 1_000;
    for (const ship of this.state.ships) {
      this.tickStartup(ship, deltaMs);
      if (ship.flightMode === 'jumping') {
        this.tickJump(ship, deltaMs);
        continue;
      }
      if (ship.flightMode === 'launching' && ship.startupStage === 'ready') {
        ship.transform.position = addVector(ship.transform.position, scaleVector(ship.transform.velocity, deltaSeconds));
        if (distance(ship.transform.position, this.dockPosition('dock-hangar-01') ?? vector()) > 80) ship.flightMode = 'free-flight';
      } else if (ship.flightMode === 'free-flight' || ship.flightMode === 'docking') {
        this.tickFlight(ship, deltaSeconds);
      }
      if (ship.flightMode === 'docking' && ship.targetDockId) this.tickAutodock(ship, deltaSeconds);
      if (this.state.player.boardedShipId === ship.id) {
        this.state.player.transform.position = { ...ship.transform.position };
        this.state.player.transform.velocity = { ...ship.transform.velocity };
      }
    }
  }

  private tickStartup(ship: ShipState, deltaMs: number): void {
    if (ship.startupStage !== 'powering') return;
    ship.startupElapsedMs += deltaMs;
    const progress = clamp(ship.startupElapsedMs / 3_000, 0, 1);
    ship.subsystems.reactor.power = progress;
    if (progress < 0.25) return;
    for (const [name, subsystem] of Object.entries(ship.subsystems)) {
      if (name === 'reactor') continue;
      subsystem.online = subsystem.health > 0.2;
      subsystem.power = subsystem.online ? progress : 0;
    }
    if (progress >= 1) {
      ship.startupStage = 'ready';
      emitWorldEvent(this.state, 'ship-startup-completed', ship.id, null, `${ship.name} is flight ready.`, { persistent: false });
    }
  }

  private tickFlight(ship: ShipState, deltaSeconds: number): void {
    const input = this.controls.get(ship.id) ?? EMPTY_CONTROLS;
    if (ship.startupStage === 'ready' && ship.subsystems.engines.online && ship.fuel > 0) {
      const boost = input.boost ? 1.5 : 1;
      const acceleration = ship.maxThrustN / ship.massKg * boost;
      ship.transform.velocity = addVector(ship.transform.velocity, scaleVector(input.thrust, acceleration * deltaSeconds));
      ship.transform.angularVelocity = scaleVector(input.rotation, ship.maneuverThrustN / ship.massKg * 0.08);
      ship.transform.rotation.pitch += ship.transform.angularVelocity.x * deltaSeconds;
      ship.transform.rotation.yaw += ship.transform.angularVelocity.y * deltaSeconds;
      ship.transform.rotation.roll += ship.transform.angularVelocity.z * deltaSeconds;
      const thrustAmount = magnitude(input.thrust);
      ship.fuel = clamp(ship.fuel - thrustAmount * deltaSeconds * 0.00025 * boost, 0, 1);
    }
    if (input.brake && ship.subsystems.thrusters.online) ship.transform.velocity = scaleVector(ship.transform.velocity, Math.max(0, 1 - deltaSeconds * 0.7));
    ship.transform.velocity = clampMagnitude(ship.transform.velocity, 12_000);
    ship.transform.position = addVector(ship.transform.position, scaleVector(ship.transform.velocity, deltaSeconds));
    ship.shield = clamp(ship.shield + deltaSeconds * 0.002 * ship.subsystems.shields.health, 0, 1);
  }

  private tickAutodock(ship: ShipState, deltaSeconds: number): void {
    const target = ship.targetDockId ? this.dockPosition(ship.targetDockId) : null;
    if (!target) return;
    const offset = { x: target.x - ship.transform.position.x, y: target.y - ship.transform.position.y, z: target.z - ship.transform.position.z };
    const range = magnitude(offset);
    if (range <= 4 && magnitude(ship.transform.velocity) <= 25) {
      this.dock(ship.id, ship.targetDockId as string);
      return;
    }
    const desired = scaleVector(offset, Math.min(12, range * 0.25) / Math.max(range, 1));
    ship.transform.velocity = addVector(scaleVector(ship.transform.velocity, Math.max(0, 1 - deltaSeconds * 1.4)), scaleVector(desired, deltaSeconds));
  }

  private tickJump(ship: ShipState, deltaMs: number): void {
    ship.jumpElapsedMs += deltaMs;
    const connection = ship.jumpTargetId ? this.state.jumpConnections.find((candidate) => candidate.id === ship.jumpTargetId) : undefined;
    const travelTimeMs = connection?.travelTimeMs ?? 5_000;
    if (ship.jumpElapsedMs < travelTimeMs || !ship.jumpTargetId) return;
    const celestial = this.state.celestialBodies.find((body) => body.id === ship.jumpTargetId);
    const discovery = this.state.discoveries.find((item) => item.id === ship.jumpTargetId);
    const settlement = this.state.settlements.find((item) => item.id === ship.jumpTargetId);
    const target = celestial?.position ?? discovery?.position ?? settlement?.position ?? connection?.exitPosition;
    if (!target) {
      ship.flightMode = 'free-flight';
      ship.jumpTargetId = null;
      return;
    }
    const approachRegion = celestial ? this.state.planetaryRegions.find((region) => region.planetId === celestial.id) : undefined;
    ship.transform.position = approachRegion
      ? addVector(approachRegion.center, vector(0, 0, approachRegion.radiusM + 5_000))
      : connection
        ? { ...target }
        : addVector(target, vector(0, 0, (celestial?.radiusM ?? 1_000) + 15_000));
    ship.transform.velocity = vector();
    ship.flightMode = 'free-flight';
    const targetId = ship.jumpTargetId;
    ship.jumpTargetId = null;
    ship.jumpElapsedMs = 0;
    emitWorldEvent(this.state, 'ship-jump-completed', ship.id, targetId, `${ship.name} emerged near ${targetId}.`);
  }

  private dockPosition(dockId: EntityId): Vector3 | null {
    if (dockId === 'dock-hangar-01') return vector(170, -18, -30);
    if (dockId === 'dock-ring-01') return vector(260, 0, 0);
    return null;
  }

  private failure(message: string): CommandResult {
    return { ok: false, message, eventIds: [] };
  }
}
