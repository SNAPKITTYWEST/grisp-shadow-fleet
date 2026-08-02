import { addVector, distance, scaleVector, subtractVector, vector } from './deterministic.js';
import { emitWorldEvent } from './state-utils.js';
import type { StreamingCellState, UniverseState, Vector3, WorldLayer } from './types.js';

export interface RenderEntitySnapshot {
  id: string;
  kind: 'room' | 'ship' | 'celestial' | 'asteroid' | 'traffic' | 'discovery' | 'hull' | 'npc' | 'settlement' | 'lifeform' | 'jump-connection';
  position: Vector3;
  visible: boolean;
}

export class WorldStreaming {
  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
  }

  update(): string[] {
    const focus = this.focusPosition();
    const focusLayer = this.focusLayer();
    const candidates = this.state.streaming.cells.filter((cell) => this.shouldLoad(cell, focusLayer, focus));
    const loaded = new Set([...this.state.streaming.pinnedCellIds, ...candidates.map((cell) => cell.id)]);
    this.state.streaming.loadedCellIds = [...loaded].sort();
    if (distance(focus, this.state.streaming.origin) > this.state.config.rebaseDistanceM) {
      this.state.streaming.origin = {
        x: Math.round(focus.x / 10_000) * 10_000,
        y: Math.round(focus.y / 10_000) * 10_000,
        z: Math.round(focus.z / 10_000) * 10_000,
      };
      this.state.streaming.originRebaseCount += 1;
      this.state.streaming.lastRebaseTick = this.state.tick;
      emitWorldEvent(this.state, 'origin-rebased', 'universe-core', null, 'Render origin rebased around the active focus.', { persistent: false, data: { x: this.state.streaming.origin.x, y: this.state.streaming.origin.y, z: this.state.streaming.origin.z } });
    }
    this.discoverNearby(focus);
    return this.state.streaming.loadedCellIds;
  }

  tick(deltaMs: number): void {
    this.tickTraffic(deltaMs);
    this.tickAsteroids(deltaMs);
    this.update();
  }

  toRenderPosition(absolute: Vector3): Vector3 {
    return subtractVector(absolute, this.state.streaming.origin);
  }

  getRenderEntities(): RenderEntitySnapshot[] {
    const loadedContent = new Set(this.state.streaming.cells
      .filter((cell) => this.state.streaming.loadedCellIds.includes(cell.id))
      .flatMap((cell) => cell.contentIds));
    const entities: RenderEntitySnapshot[] = [];
    for (const room of this.state.rooms) entities.push({ id: room.id, kind: 'room', position: this.toRenderPosition(room.bounds.center), visible: loadedContent.has(room.id) });
    for (const hull of this.state.hullSections) entities.push({ id: hull.id, kind: 'hull', position: this.toRenderPosition(hull.bounds.center), visible: loadedContent.has(hull.id) });
    for (const ship of this.state.ships) entities.push({ id: ship.id, kind: 'ship', position: this.toRenderPosition(ship.transform.position), visible: loadedContent.has(ship.id) || distance(ship.transform.position, this.focusPosition()) < this.state.config.streamingRadiusM });
    for (const body of this.state.celestialBodies) entities.push({ id: body.id, kind: 'celestial', position: this.toRenderPosition(body.position), visible: loadedContent.has(body.id) });
    for (const asteroid of this.state.asteroids) entities.push({ id: asteroid.id, kind: 'asteroid', position: this.toRenderPosition(asteroid.transform.position), visible: loadedContent.has(asteroid.id) });
    for (const traffic of this.state.traffic) entities.push({ id: traffic.id, kind: 'traffic', position: this.toRenderPosition(traffic.position), visible: distance(traffic.position, this.focusPosition()) < this.state.config.streamingRadiusM });
    for (const discovery of this.state.discoveries) entities.push({ id: discovery.id, kind: 'discovery', position: this.toRenderPosition(discovery.position), visible: discovery.discovered && distance(discovery.position, this.focusPosition()) < this.state.config.streamingRadiusM });
    for (const settlement of this.state.settlements) entities.push({ id: settlement.id, kind: 'settlement', position: this.toRenderPosition(settlement.position), visible: settlement.discovered && distance(settlement.position, this.focusPosition()) < this.state.config.streamingRadiusM });
    for (const lifeform of this.state.lifeforms) entities.push({ id: lifeform.id, kind: 'lifeform', position: this.toRenderPosition(lifeform.position), visible: lifeform.discovered && distance(lifeform.position, this.focusPosition()) < this.state.config.streamingRadiusM });
    for (const connection of this.state.jumpConnections) entities.push({ id: connection.id, kind: 'jump-connection', position: this.toRenderPosition(connection.entryPosition), visible: connection.active && distance(connection.entryPosition, this.focusPosition()) < this.state.config.streamingRadiusM });
    const currentRoom = this.state.rooms.find((room) => room.id === this.state.player.locationId);
    for (const npc of this.state.npcs) {
      const room = this.state.rooms.find((candidate) => candidate.id === npc.currentLocationId);
      entities.push({ id: npc.id, kind: 'npc', position: this.toRenderPosition(room?.bounds.center ?? vector()), visible: Boolean(currentRoom && npc.currentLocationId === currentRoom.id) });
    }
    return entities;
  }

  private focusPosition(): Vector3 {
    const piloted = this.state.player.pilotedShipId ? this.state.ships.find((ship) => ship.id === this.state.player.pilotedShipId) : undefined;
    return piloted ? piloted.transform.position : this.state.player.transform.position;
  }

  private focusLayer(): WorldLayer {
    return this.state.player.layer;
  }

  private shouldLoad(cell: StreamingCellState, focusLayer: WorldLayer, focus: Vector3): boolean {
    if (cell.layer === focusLayer && distance(cell.center, focus) <= cell.radiusM + this.state.config.streamingRadiusM) return true;
    if (focusLayer === 'sovereign-interior') return cell.id === 'cell-station-interior';
    if (focusLayer === 'station-exterior') return ['cell-station-exterior', 'cell-local-orbit'].includes(cell.id);
    return distance(cell.center, focus) <= cell.radiusM + this.state.config.streamingRadiusM;
  }

  private discoverNearby(focus: Vector3): void {
    for (const discovery of this.state.discoveries) {
      if (discovery.discovered || distance(discovery.position, focus) > 2_500) continue;
      discovery.discovered = true;
      if (!this.state.player.discoveredLocationIds.includes(discovery.id)) this.state.player.discoveredLocationIds.push(discovery.id);
      emitWorldEvent(this.state, 'location-discovered', this.state.player.id, discovery.id, `${discovery.name} was discovered.`, { persistent: true, data: { kind: discovery.kind } });
    }
  }

  private tickTraffic(deltaMs: number): void {
    const deltaSeconds = deltaMs / 1_000;
    for (const traffic of this.state.traffic) {
      if (traffic.status === 'docked' || traffic.status === 'distress') continue;
      traffic.routeProgress = (traffic.routeProgress + traffic.speedMps * deltaSeconds / 1_000_000) % 1;
      const route = this.state.trafficRoutes.find((candidate) => candidate.id === traffic.routeId);
      const start = this.waypointPosition(route?.waypointIds[0] ?? 'station-sovereign-01');
      const end = this.waypointPosition(route?.waypointIds[route.waypointIds.length - 1] ?? 'moon-nacre');
      traffic.position = addVector(start, scaleVector(subtractVector(end, start), traffic.routeProgress));
    }
  }

  private tickAsteroids(deltaMs: number): void {
    const deltaSeconds = deltaMs / 1_000;
    for (const asteroid of this.state.asteroids) {
      asteroid.transform.position = addVector(asteroid.transform.position, scaleVector(asteroid.transform.velocity, deltaSeconds));
      asteroid.transform.rotation.pitch += asteroid.transform.angularVelocity.x * deltaSeconds;
      asteroid.transform.rotation.yaw += asteroid.transform.angularVelocity.y * deltaSeconds;
      asteroid.transform.rotation.roll += asteroid.transform.angularVelocity.z * deltaSeconds;
    }
  }

  private waypointPosition(id: string): Vector3 {
    if (id === 'station-sovereign-01') return vector();
    const body = this.state.celestialBodies.find((candidate) => candidate.id === id);
    if (body) return body.position;
    if (id === 'waypoint-lagrange-1') return vector(420_000, 60_000, 210_000);
    if (id === 'waypoint-patrol-a') return vector(5_000, 0, 0);
    if (id === 'waypoint-patrol-b') return vector(-2_500, 0, 4_330);
    if (id === 'waypoint-patrol-c') return vector(-2_500, 0, -4_330);
    return vector();
  }
}
