import { clamp, distance, hashString, vector } from './deterministic.js';
import { emitWorldEvent, findRequired } from './state-utils.js';
import type { CommandResult, EntityId, PlanetaryRegionState, UniverseState, Vector3, WeatherState } from './types.js';

export interface AtmosphericSample {
  bodyId: EntityId;
  altitudeM: number;
  density: number;
  pressureKpa: number;
  temperatureC: number;
  gravityMps2: number;
}

export interface TerrainSample {
  regionId: EntityId;
  position: Vector3;
  elevationM: number;
  slope: number;
  material: 'rock' | 'regolith' | 'ice' | 'water' | 'vegetation';
  landable: boolean;
}

export class PlanetSystem {
  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
  }

  sampleAtmosphere(bodyId: EntityId, position: Vector3): AtmosphericSample {
    const body = findRequired(this.state.celestialBodies, bodyId, 'Celestial body');
    const altitudeM = Math.max(0, distance(position, body.position) - body.radiusM);
    const normalizedAltitude = body.atmosphereHeightM > 0 ? clamp(altitudeM / body.atmosphereHeightM, 0, 1) : 1;
    const density = body.atmosphereHeightM > 0 ? Math.exp(-normalizedAltitude * 6) * (altitudeM <= body.atmosphereHeightM ? 1 : 0) : 0;
    return {
      bodyId,
      altitudeM,
      density,
      pressureKpa: density * (body.kind === 'planet' ? 88 : 2.4),
      temperatureC: body.kind === 'planet' ? 14 - normalizedAltitude * 55 : -18 - normalizedAltitude * 40,
      gravityMps2: body.gravityMps2 * (body.radiusM / Math.max(body.radiusM, body.radiusM + altitudeM)) ** 2,
    };
  }

  sampleTerrain(regionId: EntityId, localPosition: Vector3): TerrainSample {
    const region = findRequired(this.state.planetaryRegions, regionId, 'Planetary region');
    const seedPhase = (region.terrainSeed % 10_000) / 10_000 * Math.PI * 2;
    const broad = Math.sin(localPosition.x * 0.00035 + seedPhase) * 82 + Math.cos(localPosition.z * 0.00029 - seedPhase) * 61;
    const detail = Math.sin((localPosition.x + localPosition.z) * 0.0021 + seedPhase * 2) * 9;
    const elevationM = broad + detail;
    const dx = Math.cos(localPosition.x * 0.00035 + seedPhase) * 0.0287 + Math.cos((localPosition.x + localPosition.z) * 0.0021 + seedPhase * 2) * 0.0189;
    const dz = -Math.sin(localPosition.z * 0.00029 - seedPhase) * 0.0177 + Math.cos((localPosition.x + localPosition.z) * 0.0021 + seedPhase * 2) * 0.0189;
    const slope = Math.atan(Math.hypot(dx, dz));
    const material = this.terrainMaterial(region, elevationM);
    return { regionId, position: { ...localPosition }, elevationM, slope, material, landable: slope < 0.18 && material !== 'water' };
  }

  approachRegion(shipId: EntityId, regionId: EntityId): CommandResult {
    const ship = findRequired(this.state.ships, shipId, 'Ship');
    const region = findRequired(this.state.planetaryRegions, regionId, 'Planetary region');
    if (ship.pilotId !== this.state.player.id || ship.flightMode !== 'free-flight') {
      return { ok: false, message: 'Active piloting in free flight is required for planetary approach.', eventIds: [] };
    }
    const body = findRequired(this.state.celestialBodies, region.planetId, 'Region celestial body');
    const altitude = distance(ship.transform.position, body.position) - body.radiusM;
    if (altitude > body.atmosphereHeightM + 80_000) {
      return { ok: false, message: `${ship.name} is not within planetary approach range.`, eventIds: [] };
    }
    this.state.player.layer = 'planetary-space';
    const event = emitWorldEvent(this.state, 'planetary-approach-started', ship.id, region.id, `${ship.name} entered the approach corridor for ${region.name}.`, { data: { altitudeM: altitude } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  discoverRegion(regionId: EntityId): CommandResult {
    const region = findRequired(this.state.planetaryRegions, regionId, 'Planetary region');
    const focus = this.state.player.pilotedShipId
      ? findRequired(this.state.ships, this.state.player.pilotedShipId, 'Piloted ship').transform.position
      : this.state.player.transform.position;
    if (distance(focus, region.center) > region.radiusM + 50_000) return { ok: false, message: `${region.name} is outside sensor range.`, eventIds: [] };
    region.discovered = true;
    if (!this.state.player.discoveredLocationIds.includes(region.id)) this.state.player.discoveredLocationIds.push(region.id);
    const event = emitWorldEvent(this.state, 'planetary-region-discovered', this.state.player.id, region.id, `${region.name} was charted.`, { persistent: true });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  tick(deltaMs: number): void {
    if (deltaMs <= 0 || this.state.tick % 600 !== 0) return;
    for (const region of this.state.planetaryRegions) this.advanceWeather(region);
    const shipId = this.state.player.pilotedShipId;
    if (!shipId) return;
    const ship = findRequired(this.state.ships, shipId, 'Piloted ship');
    const nearestBody = this.state.celestialBodies
      .filter((body) => body.kind === 'planet' || body.kind === 'moon')
      .sort((left, right) => distance(ship.transform.position, left.position) - distance(ship.transform.position, right.position))[0];
    if (!nearestBody) return;
    const sample = this.sampleAtmosphere(nearestBody.id, ship.transform.position);
    if (sample.altitudeM <= nearestBody.atmosphereHeightM && sample.density > 0.001) {
      this.state.player.layer = 'planetary-space';
      const drag = clamp(sample.density * deltaMs / 50_000, 0, 0.2);
      ship.transform.velocity.x *= 1 - drag;
      ship.transform.velocity.y *= 1 - drag;
      ship.transform.velocity.z *= 1 - drag;
    }
  }

  private advanceWeather(region: PlanetaryRegionState): void {
    const phase = hashString(`${this.state.seed}:${region.id}:${Math.floor(this.state.tick / 600)}`) % 100;
    const condition: WeatherState['condition'] = phase < 50 ? 'clear' : phase < 70 ? 'cloudy' : phase < 85 ? 'dust' : phase < 96 ? 'storm' : 'electrical';
    region.weather.condition = condition;
    region.weather.windMps = vector((phase % 13) - 6, 0, ((phase * 7) % 11) - 5);
    region.weather.precipitation = condition === 'storm' ? 0.8 : condition === 'cloudy' ? 0.2 : 0;
    region.weather.visibilityM = condition === 'clear' ? 25_000 : condition === 'cloudy' ? 9_000 : condition === 'dust' ? 3_000 : 1_500;
  }

  private terrainMaterial(region: PlanetaryRegionState, elevationM: number): TerrainSample['material'] {
    if (elevationM <= region.oceanLevelM) return 'water';
    if (region.planetId === 'moon-nacre') return elevationM > 80 ? 'ice' : 'regolith';
    return elevationM < 25 ? 'vegetation' : 'rock';
  }
}
