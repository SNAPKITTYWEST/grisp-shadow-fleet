import { addVector, clamp, clampMagnitude, normalizeVector, scaleVector, vector } from './deterministic.js';
import { emitWorldEvent, findRequired } from './state-utils.js';
import type { CommandResult, TraversalInput, UniverseState, Vector3 } from './types.js';

const EMPTY_INPUT: TraversalInput = {
  move: { x: 0, y: 0, z: 0 },
  look: { x: 0, y: 0, z: 0 },
  sprint: false,
  crouch: false,
  ascend: false,
  descend: false,
  brake: false,
};

export class SpaceTraversal {
  private input: TraversalInput = EMPTY_INPUT;

  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
    this.input = EMPTY_INPUT;
  }

  setInput(input: TraversalInput): CommandResult {
    this.input = {
      ...input,
      move: clampMagnitude(input.move, 1),
      look: clampMagnitude(input.look, 1),
    };
    return { ok: true, message: 'Traversal input queued.', eventIds: [] };
  }

  clearInput(): void {
    this.input = EMPTY_INPUT;
  }

  setZeroGravity(enabled: boolean): CommandResult {
    const player = this.state.player;
    if (enabled) {
      player.traversalMode = player.suit.equipped ? 'eva' : 'zero-g';
      player.grounded = false;
    } else {
      player.traversalMode = 'walking';
      player.grounded = true;
      player.transform.velocity = vector();
    }
    return { ok: true, message: enabled ? 'Zero-gravity movement enabled.' : 'Gravity traversal restored.', eventIds: [] };
  }

  tick(deltaMs: number): void {
    const deltaSeconds = deltaMs / 1_000;
    if (deltaSeconds <= 0) return;
    const player = this.state.player;
    if (player.traversalMode === 'piloting' || player.traversalMode === 'ship-boarded' || player.traversalMode === 'elevator') return;

    player.transform.rotation.pitch = clamp(player.transform.rotation.pitch + this.input.look.x * deltaSeconds * 1.8, -Math.PI / 2, Math.PI / 2);
    player.transform.rotation.yaw += this.input.look.y * deltaSeconds * 1.8;
    player.transform.rotation.roll += this.input.look.z * deltaSeconds * 1.2;

    if (player.traversalMode === 'eva' || player.traversalMode === 'zero-g') this.tickEva(deltaSeconds);
    else if (player.traversalMode === 'magnetic-boots') this.tickMagneticBoots(deltaSeconds);
    else this.tickInterior(deltaSeconds);

    if (player.layer !== 'sovereign-interior') this.tickSuit(deltaSeconds);
  }

  private tickInterior(deltaSeconds: number): void {
    const player = this.state.player;
    const room = findRequired(this.state.rooms, player.locationId, 'Player room');
    const requestedMode = this.input.crouch ? 'crouching' : this.input.sprint ? 'sprinting' : 'walking';
    if (!['climbing', 'ladder'].includes(player.traversalMode)) player.traversalMode = requestedMode;
    const speed = player.traversalMode === 'sprinting' ? 6.5 : player.traversalMode === 'crouching' ? 1.6 : 3.4;
    const local = normalizeVector({ x: this.input.move.x, y: 0, z: this.input.move.z });
    const yaw = player.transform.rotation.yaw;
    const direction: Vector3 = {
      x: local.x * Math.cos(yaw) - local.z * Math.sin(yaw),
      y: 0,
      z: local.x * Math.sin(yaw) + local.z * Math.cos(yaw),
    };
    player.transform.velocity = scaleVector(direction, speed);
    player.transform.position = addVector(player.transform.position, scaleVector(player.transform.velocity, deltaSeconds));
    const bounds = room.bounds;
    player.transform.position.x = clamp(player.transform.position.x, bounds.center.x - bounds.halfExtents.x, bounds.center.x + bounds.halfExtents.x);
    player.transform.position.y = bounds.center.y + 1.7;
    player.transform.position.z = clamp(player.transform.position.z, bounds.center.z - bounds.halfExtents.z, bounds.center.z + bounds.halfExtents.z);
    player.grounded = true;
  }

  private tickEva(deltaSeconds: number): void {
    const player = this.state.player;
    const suit = player.suit;
    if (!suit.equipped || !suit.sealed || suit.propellant <= 0 || suit.battery <= 0) {
      player.transform.position = addVector(player.transform.position, scaleVector(player.transform.velocity, deltaSeconds));
      return;
    }
    const vertical = (this.input.ascend ? 1 : 0) - (this.input.descend ? 1 : 0);
    const accelerationDirection = clampMagnitude({ x: this.input.move.x, y: vertical, z: this.input.move.z }, 1);
    const acceleration = scaleVector(accelerationDirection, 3.2);
    player.transform.velocity = addVector(player.transform.velocity, scaleVector(acceleration, deltaSeconds));
    if (this.input.brake) player.transform.velocity = scaleVector(player.transform.velocity, Math.max(0, 1 - deltaSeconds * 1.8));
    player.transform.velocity = clampMagnitude(player.transform.velocity, 14);
    player.transform.position = addVector(player.transform.position, scaleVector(player.transform.velocity, deltaSeconds));
    const thrustMagnitude = Math.hypot(accelerationDirection.x, accelerationDirection.y, accelerationDirection.z);
    suit.propellant = clamp(suit.propellant - thrustMagnitude * deltaSeconds * 0.0007, 0, 1);
    suit.battery = clamp(suit.battery - deltaSeconds * 0.00003, 0, 1);
    player.grounded = false;
  }

  private tickMagneticBoots(deltaSeconds: number): void {
    const player = this.state.player;
    const speed = this.input.sprint ? 3.2 : 1.9;
    const direction = normalizeVector({ x: this.input.move.x, y: 0, z: this.input.move.z });
    player.transform.velocity = scaleVector(direction, speed);
    player.transform.position = addVector(player.transform.position, scaleVector(player.transform.velocity, deltaSeconds));
    const hull = this.state.hullSections.find((section) => section.id === player.locationId) ?? this.state.hullSections[0];
    if (hull) {
      player.transform.position.x = clamp(player.transform.position.x, hull.bounds.center.x - hull.bounds.halfExtents.x, hull.bounds.center.x + hull.bounds.halfExtents.x);
      player.transform.position.y = hull.bounds.center.y + hull.bounds.halfExtents.y + 1.7;
      player.transform.position.z = clamp(player.transform.position.z, hull.bounds.center.z - hull.bounds.halfExtents.z, hull.bounds.center.z + hull.bounds.halfExtents.z);
    }
    player.grounded = true;
    player.suit.battery = clamp(player.suit.battery - deltaSeconds * 0.00002, 0, 1);
  }

  private tickSuit(deltaSeconds: number): void {
    const player = this.state.player;
    if (player.suit.sealed) player.suit.oxygenSeconds = Math.max(0, player.suit.oxygenSeconds - deltaSeconds);
    if (player.suit.oxygenSeconds <= 0 || !player.suit.sealed) {
      player.health = Math.max(0, player.health - deltaSeconds * 12);
      if (player.health === 0 && !this.state.events.some((event) => event.type === 'player-incapacitated' && !event.resolved)) {
        emitWorldEvent(this.state, 'player-incapacitated', player.id, null, 'Player was incapacitated by vacuum exposure.', { severity: 1 });
      }
    }
  }
}
