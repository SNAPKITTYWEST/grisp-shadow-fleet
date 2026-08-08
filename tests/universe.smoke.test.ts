import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UniverseCore,
  createInitialWorld,
  getPurposefulRoomCount,
  magnitude,
  type CommandResult,
} from '../universe/index.js';
import { RENDERED_ROOM_LAYOUT } from '../universe/GameRenderer.js';

const TEST_ROOT = dirname(fileURLToPath(import.meta.url));

function createCore(): UniverseCore {
  return new UniverseCore({
    seed: 'snapkitty-universe-smoke',
    maxCatchUpTicks: 1_000,
  });
}

function byId<T extends { id: string }>(items: readonly T[], id: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Expected entity '${id}' to exist.`);
  return item;
}

function expectOk(result: CommandResult): void {
  expect(result).toEqual(expect.objectContaining({ ok: true }));
}

describe('SnapKitty Universe vertical slice', () => {
  test('builds a deterministic, populated, functional universe instead of a backdrop', () => {
    const state = createInitialWorld('content-contract');
    expect(createInitialWorld('content-contract')).toStrictEqual(state);

    expect(getPurposefulRoomCount()).toBeGreaterThanOrEqual(20);
    expect(state.rooms).toHaveLength(getPurposefulRoomCount());
    expect(new Set(state.rooms.map((room) => room.id)).size).toBe(state.rooms.length);
    expect(new Set(state.rooms.map((room) => room.purpose)).size).toBe(state.rooms.length);
    for (const room of state.rooms) {
      expect(room.purpose.length).toBeGreaterThan(12);
      expect(room.interactionPoints.length).toBeGreaterThan(0);
      expect(room.interactionPoints.every((point) => point.enabled && point.purpose.length > 0)).toBe(true);
    }
    expect(state.doors.every((door) => door.functionalPurpose.length > 0)).toBe(true);
    expect(state.elevators.some((elevator) => elevator.servedDecks.length >= 6)).toBe(true);

    expect(state.airlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'airlock-cyan-01', phase: 'idle-pressurized' }),
    ]));
    expect(state.hullSections.some((section) => section.magneticSurface && section.repairNodeIds.length > 0)).toBe(true);
    expect(state.ships.some((ship) => ship.ownerId === state.player.id && ship.flightMode === 'docked')).toBe(true);
    expect(state.celestialBodies.some((body) => body.kind === 'moon')).toBe(true);
    expect(state.celestialBodies.some((body) => body.kind === 'planet')).toBe(true);
    expect(state.celestialBodies.some((body) => body.kind === 'star')).toBe(true);
    expect(state.planetaryRegions.some((region) => region.landingPadIds.length > 0 && region.settlementIds.length > 0)).toBe(true);
    expect(state.asteroids.length).toBeGreaterThanOrEqual(50);
    expect(state.traffic.length).toBeGreaterThan(0);
    expect(state.discoveries.some((item) => item.kind === 'wildlife-habitat')).toBe(true);
    expect(state.streaming.cells.some((cell) => cell.layer === 'orbital-space')).toBe(true);
    expect(state.streaming.cells.some((cell) => cell.layer === 'interplanetary-space')).toBe(true);
    expect(state.streaming.cells.some((cell) => cell.layer === 'galactic-space')).toBe(true);

    expect(state.npcs.length).toBeGreaterThanOrEqual(50);
    expect(state.npcs.some((npc) => npc.species === 'human')).toBe(true);
    expect(state.npcs.some((npc) => npc.species.includes('synthetic'))).toBe(true);
    for (const npc of state.npcs) {
      expect(npc).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        species: expect.any(String),
        origin: expect.any(String),
        occupation: expect.any(String),
        homeLocationId: expect.any(String),
        workLocationId: expect.any(String),
        factionId: expect.any(String),
        dialogueStateId: expect.any(String),
      }));
      expect(npc.schedule.length).toBeGreaterThan(0);
      expect(npc.goals.length).toBeGreaterThan(0);
      expect(npc.relationships.length).toBeGreaterThan(0);
      expect(npc.memories.length).toBeGreaterThan(0);
      expect(npc.inventory.length).toBeGreaterThan(0);
      expect(npc.trustValues).toHaveProperty(state.player.id);
      expect(npc.behavior).toEqual(expect.objectContaining({
        immediateReaction: expect.any(String),
        shortTermTaskId: null,
        longTermGoalId: expect.any(String),
        factionObligation: expect.any(String),
        worldEventResponse: expect.any(String),
        memoryBias: expect.any(Number),
      }));
    }

    expect(state.agents.length).toBeGreaterThanOrEqual(6);
    for (const agent of state.agents) {
      expect(agent.authorityScope.length).toBeGreaterThan(0);
      expect(agent.permissions.length).toBeGreaterThan(0);
      expect(agent.deterministicFallback.length).toBeGreaterThan(0);
      expect(agent.memory.length).toBeGreaterThan(0);
      expect(agent.worldPresenceId.length).toBeGreaterThan(0);
      expect(agent.observableState).toHaveProperty('heartbeat');
    }
    expect(state.economy.markets.length).toBeGreaterThan(0);
    expect(state.economy.tradeRoutes.length).toBeGreaterThan(0);
    expect(state.missions.length).toBeGreaterThanOrEqual(10);
    expect(new Set(state.missions.map((mission) => mission.category)).size).toBeGreaterThanOrEqual(10);
    expect(state.construction.ownedSpaces.length).toBeGreaterThan(0);
    expect(state.events.some((event) => event.persistent)).toBe(true);
  });

  test('maps every rendered room to one unique functional simulation room', () => {
    const state = createInitialWorld('rendered-room-contract');
    expect(RENDERED_ROOM_LAYOUT).toHaveLength(20);
    expect(new Set(RENDERED_ROOM_LAYOUT.map((room) => room.visualId)).size).toBe(20);
    expect(new Set(RENDERED_ROOM_LAYOUT.map((room) => room.coreRoomId)).size).toBe(20);
    for (const rendered of RENDERED_ROOM_LAYOUT) {
      const room = byId(state.rooms, rendered.coreRoomId);
      expect(room.name).toBe(rendered.name);
      expect(room.interactionPoints).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: rendered.coreInteractionId, enabled: true }),
      ]));
    }
  });

  test('enforces airlock interlocks, pressure, suit safety, alarms, and playable EVA', () => {
    const core = createCore();
    const airlock = byId(core.state.airlocks, 'airlock-cyan-01');
    const inner = byId(core.state.doors, airlock.innerDoorId);
    const outer = byId(core.state.doors, airlock.outerDoorId);
    core.state.player.locationId = airlock.chamberRoomId;

    outer.locked = false;
    expectOk(core.dispatch({ type: 'door', doorId: inner.id, action: 'open' }));
    const interlockRejection = core.dispatch({ type: 'door', doorId: outer.id, action: 'open' });
    expect(interlockRejection.ok).toBe(false);
    expect(interlockRejection.message).toMatch(/interlock/i);
    expect(outer.position).toBe('closed');
    expectOk(core.dispatch({ type: 'door', doorId: inner.id, action: 'close' }));
    outer.locked = true;

    const unsafeCycle = core.dispatch({ type: 'airlock-cycle', airlockId: airlock.id, direction: 'to-space' });
    expect(unsafeCycle.ok).toBe(false);
    expect(unsafeCycle.message).toMatch(/sealed.+suit/i);
    expect(airlock.phase).toBe('idle-pressurized');

    expectOk(core.dispatch({ type: 'mission-accept', missionId: 'mission-political' }));
    expectOk(core.dispatch({ type: 'suit', action: 'equip' }));
    expectOk(core.dispatch({ type: 'suit', action: 'seal' }));
    const inventoryBefore = core.snapshot().player.inventory;
    const missionsBefore = [...core.state.player.activeMissionIds];
    const orientationBefore = { ...core.state.player.transform.rotation };
    const timeBefore = core.state.worldTimeIso;

    expectOk(core.dispatch({ type: 'airlock-cycle', airlockId: airlock.id, direction: 'to-space' }));
    expect(inner.position).toBe('closed');
    expect(outer.position).toBe('closed');
    core.tick(500);
    expect(airlock.phase).toBe('depressurizing');
    core.tick(4_000);
    expect(airlock.phase).toBe('idle-vacuum');
    expect(airlock.pressureKpa).toBeCloseTo(0.4, 4);
    expect(byId(core.state.rooms, airlock.chamberRoomId).environment.breathable).toBe(false);
    expect(inner.position).toBe('closed');
    expect(outer.position).toBe('open');

    expectOk(core.dispatch({ type: 'airlock-traverse', airlockId: airlock.id }));
    expect(core.state.player.locationId).toBe('hull-sunward');
    expect(core.state.player.layer).toBe('station-exterior');
    expect(core.state.player.traversalMode).toBe('eva');
    expect(core.state.player.inventory).toStrictEqual(inventoryBefore);
    expect(core.state.player.activeMissionIds).toStrictEqual(missionsBefore);
    expect(core.state.player.transform.rotation).toStrictEqual(orientationBefore);
    expect(core.state.worldTimeIso > timeBefore).toBe(true);

    const positionBeforeEva = { ...core.state.player.transform.position };
    const oxygenBeforeEva = core.state.player.suit.oxygenSeconds;
    expectOk(core.dispatch({
      type: 'player-move',
      input: {
        move: { x: 1, y: 0, z: 0 },
        look: { x: 0, y: 0, z: 0 },
        sprint: false,
        crouch: false,
        ascend: true,
        descend: false,
        brake: false,
      },
    }));
    core.tick(1_000);
    expect(core.state.player.transform.position).not.toStrictEqual(positionBeforeEva);
    expect(magnitude(core.state.player.transform.velocity)).toBeGreaterThan(0);
    expect(core.state.player.suit.oxygenSeconds).toBeLessThan(oxygenBeforeEva);

    const emergency = createCore();
    emergency.state.player.locationId = 'room-airlock-chamber';
    expectOk(emergency.dispatch({
      type: 'airlock-cycle',
      airlockId: 'airlock-cyan-01',
      direction: 'to-space',
      emergencyOverride: true,
    }));
    expect(byId(emergency.state.airlocks, 'airlock-cyan-01').alarmActive).toBe(true);
  });

  test('boards, starts, pilots, flies, docks, lands, and exits the player ship', () => {
    const core = createCore();
    const ship = byId(core.state.ships, 'ship-player-kestrel');
    core.state.player.locationId = 'room-hangar';

    expectOk(core.dispatch({ type: 'ship-board', shipId: ship.id }));
    expect(core.state.player.boardedShipId).toBe(ship.id);
    expect(core.state.player.traversalMode).toBe('ship-boarded');

    expectOk(core.dispatch({ type: 'ship-start', shipId: ship.id }));
    core.tick(3_000);
    expect(ship.startupStage).toBe('ready');
    expect(Object.values(ship.subsystems).every((subsystem) => subsystem.online)).toBe(true);
    expectOk(core.dispatch({ type: 'ship-pilot', shipId: ship.id }));
    expect(core.state.player.pilotedShipId).toBe(ship.id);

    expectOk(core.dispatch({ type: 'ship-undock', shipId: ship.id }));
    core.tick(20_100);
    expect(ship.flightMode).toBe('free-flight');
    const flightPosition = { ...ship.transform.position };
    const fuelBefore = ship.fuel;
    expectOk(core.dispatch({
      type: 'ship-controls',
      shipId: ship.id,
      input: {
        thrust: { x: 0, y: 0, z: 1 },
        rotation: { x: 0, y: 0.25, z: 0 },
        brake: false,
        boost: true,
      },
    }));
    core.tick(1_000);
    expect(ship.transform.position).not.toStrictEqual(flightPosition);
    expect(magnitude(ship.transform.velocity)).toBeGreaterThan(0);
    expect(ship.fuel).toBeLessThan(fuelBefore);

    ship.transform.position = { x: 170, y: -18, z: -30 };
    ship.transform.velocity = { x: 0, y: 0, z: 0 };
    expectOk(core.dispatch({ type: 'ship-dock', shipId: ship.id, dockId: 'dock-hangar-01' }));
    expect(ship.flightMode).toBe('docked');
    expect(ship.dockedAtId).toBe('dock-hangar-01');

    expectOk(core.dispatch({ type: 'ship-undock', shipId: ship.id }));
    core.tick(20_100);
    expect(ship.flightMode).toBe('free-flight');
    const landingRegion = byId(core.state.planetaryRegions, 'region-nacre-landing');
    ship.transform.position = { ...landingRegion.center, y: landingRegion.center.y + 500 };
    ship.transform.velocity = { x: 0, y: 0, z: 0 };
    expectOk(core.dispatch({ type: 'ship-land', shipId: ship.id, regionId: landingRegion.id }));
    expect(ship.flightMode).toBe('landed');
    expect(ship.landedRegionId).toBe(landingRegion.id);
    expect(core.state.player.layer).toBe('planet-surface');

    expectOk(core.dispatch({ type: 'ship-exit', shipId: ship.id }));
    expect(core.state.player.boardedShipId).toBeNull();
    expect(core.state.player.locationId).toBe(landingRegion.id);
    expect(core.state.player.traversalMode).toBe('walking');
  });

  test('updates NPC schedules and memory and restores them exactly from a checked save', () => {
    const core = createCore();
    const npc = byId(core.state.npcs, 'npc-001');
    expect(npc.currentLocationId).not.toBe(npc.homeLocationId);

    core.tick(100);
    expect(npc.lastUpdatedTick).toBe(core.state.tick);
    expect(npc.currentLocationId).toBe(npc.homeLocationId);
    expect(npc.taskQueue.some((task) => task.status === 'active')).toBe(true);
    core.state.player.locationId = npc.currentLocationId;

    const memoryCount = npc.memories.length;
    const trustBefore = npc.trustValues[core.state.player.id] ?? 0;
    expectOk(core.dispatch({ type: 'dialogue-start', npcId: npc.id }));
    const session = core.state.dialogue.sessions.at(-1);
    if (!session) throw new Error('Dialogue did not create a session.');
    expectOk(core.dispatch({
      type: 'dialogue-choose',
      sessionId: session.id,
      choiceId: `choice-${npc.id}-work`,
    }));
    expect(npc.memories).toHaveLength(memoryCount + 1);
    expect(npc.memories.at(-1)).toEqual(expect.objectContaining({
      subjectId: core.state.player.id,
      tags: expect.arrayContaining(['dialogue']),
    }));
    expect(npc.trustValues[core.state.player.id]).toBeGreaterThan(trustBefore);

    const saved = core.save();
    const restored = createCore();
    restored.load(saved);
    expect(restored.getState()).toStrictEqual(core.getState());
    const restoredNpc = byId(restored.state.npcs, npc.id);
    expect(restoredNpc.schedule).toStrictEqual(npc.schedule);
    expect(restoredNpc.memories).toStrictEqual(npc.memories);
    expect(restoredNpc.relationships).toStrictEqual(npc.relationships);
    expect(restoredNpc.trustValues).toStrictEqual(npc.trustValues);

    const tampered = JSON.parse(saved) as { state: { player: { credits: number } } };
    tampered.state.player.credits += 1;
    expect(() => restored.load(JSON.stringify(tampered))).toThrow(/checksum/i);
  });

  test('persists a player inside a planetary settlement', () => {
    const core = createCore();
    core.state.player.locationId = 'settlement-nacre';
    core.state.player.layer = 'planet-surface';
    core.state.player.traversalMode = 'walking';

    const restored = createCore();
    restored.load(core.save());
    expect(restored.state.player.locationId).toBe('settlement-nacre');
    expect(restored.state.player.layer).toBe('planet-surface');
  });

  test('reacts to world state with missions and changes real market inventory and prices', () => {
    const core = createCore();
    const rescue = byId(core.state.missions, 'mission-rescue');
    const distressedTraffic = byId(core.state.traffic, 'traffic-003');
    distressedTraffic.status = 'transit';
    core.tick(100);
    expect(rescue.status).toBe('locked');

    distressedTraffic.status = 'distress';
    core.tick(100);
    expect(rescue.status).toBe('available');
    expect(core.state.events.some((event) => event.type === 'mission-available' && event.targetId === rescue.id)).toBe(true);
    expectOk(core.dispatch({ type: 'mission-accept', missionId: rescue.id }));
    expect(rescue.status).toBe('active');
    expect(core.state.player.activeMissionIds).toContain(rescue.id);

    const market = byId(core.state.economy.markets, 'market-station');
    const water = market.listings.find((listing) => listing.commodityId === 'commodity-water');
    if (!water) throw new Error('Station water listing is missing.');
    const inventoryBefore = water.inventory;
    const priceBefore = water.sellPrice;
    const creditsBefore = core.state.player.credits;
    core.state.player.locationId = market.locationId;
    expectOk(core.dispatch({
      type: 'trade',
      marketId: market.id,
      commodityId: water.commodityId,
      quantity: 3,
      side: 'buy',
    }));
    expect(water.inventory).toBe(inventoryBefore - 3);
    expect(water.sellPrice).not.toBe(priceBefore);
    expect(core.state.player.credits).toBeLessThan(creditsBefore);
    const waterStack = core.state.player.inventory.find((item) => item.itemId === water.commodityId);
    expect(waterStack?.quantity).toBe(3);

    const inventoryAfterTrade = water.inventory;
    core.economy.tick(3_600_000);
    expect(water.inventory).toBeCloseTo(inventoryAfterTrade + 9, 5);
  });

  test('keeps sovereign agents inside permissions and records accepted work and fallbacks', () => {
    const core = createCore();
    const engineer = byId(core.state.agents, 'agent-003');
    const reactor = byId(core.state.rooms, 'room-reactor');
    reactor.damage = 0.8;

    const rejected = core.dispatch({
      type: 'agent-task',
      agentId: engineer.id,
      task: {
        type: 'repair-room',
        requestedById: core.state.player.id,
        targetId: reactor.id,
        parameters: { amount: 0.25 },
        requiredPermission: 'security.operate',
      },
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.message).toMatch(/outside bounded authority/i);
    expect(engineer.auditLog.at(-1)?.outcome).toBe('rejected');

    expectOk(core.dispatch({
      type: 'agent-task',
      agentId: engineer.id,
      task: {
        type: 'repair-room',
        requestedById: core.state.player.id,
        targetId: reactor.id,
        parameters: { amount: 0.25 },
        requiredPermission: 'engineering.operate',
      },
    }));
    for (let index = 0; index < 6; index += 1) core.tick(100);
    expect(reactor.damage).toBeCloseTo(0.55, 5);
    expect(engineer.taskQueue.some((task) => task.status === 'completed')).toBe(true);
    expect(engineer.auditLog.map((record) => record.outcome)).toEqual(expect.arrayContaining(['accepted', 'completed']));
    expect(engineer.memory.some((memory) => memory.key === 'repair-room' && memory.value === 'completed')).toBe(true);
    expect(engineer.deterministicFallback.length).toBeGreaterThan(0);

    expectOk(core.dispatch({
      type: 'agent-task',
      agentId: engineer.id,
      task: {
        type: 'unsupported-operation',
        requestedById: core.state.player.id,
        targetId: reactor.id,
        parameters: {},
        requiredPermission: 'engineering.operate',
      },
    }));
    for (let index = 0; index < 6; index += 1) core.tick(100);
    expect(engineer.taskQueue.some((task) => task.type === 'unsupported-operation' && task.status === 'failed')).toBe(true);
    expect(engineer.auditLog.map((record) => record.outcome)).toContain('fallback');
    expect(engineer.observableState.fallbackActive).toBe(true);
    expect(core.state.events.some((event) => event.type === 'agent-fallback' && event.sourceId === engineer.id)).toBe(true);
  });

  test('constructs a functional modification in owned space and completes its state-driven mission', () => {
    const core = createCore();
    core.tick(100);
    const mission = byId(core.state.missions, 'mission-construction');
    expect(mission.status).toBe('available');
    expectOk(core.dispatch({ type: 'mission-accept', missionId: mission.id }));

    core.state.player.locationId = 'room-market';
    expectOk(core.dispatch({ type: 'trade', marketId: 'market-station', commodityId: 'commodity-alloy', quantity: 8, side: 'buy' }));
    expectOk(core.dispatch({ type: 'trade', marketId: 'market-station', commodityId: 'commodity-circuit', quantity: 4, side: 'buy' }));
    core.state.player.locationId = 'room-quarters-b';
    const project = byId(core.state.construction.projects, 'project-player-workshop');
    expectOk(core.dispatch({ type: 'construction-start', projectId: project.id }));
    expectOk(core.dispatch({ type: 'construction-deliver', projectId: project.id, commodityId: 'commodity-alloy', quantity: 8 }));
    expectOk(core.dispatch({ type: 'construction-deliver', projectId: project.id, commodityId: 'commodity-circuit', quantity: 4 }));
    expectOk(core.dispatch({ type: 'construction-work', projectId: project.id, labor: project.laborRequired }));

    expect(project.status).toBe('completed');
    expect(project.progress).toBe(1);
    expect(core.state.construction.completedBlueprintIds).toContain(project.blueprintId);
    const ownedRoom = byId(core.state.construction.ownedSpaces, 'owned-room-player');
    expect(ownedRoom.modificationIds).toContain(project.id);
    const room = byId(core.state.rooms, project.locationId);
    expect(room.interactionPoints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `interaction-${project.id}`,
        kind: 'fabricator',
        enabled: true,
      }),
    ]));

    core.tick(100);
    expect(mission.status).toBe('completed');
    expect(core.state.events.some((event) => event.type === 'construction-completed' && event.targetId === project.id)).toBe(true);
  });

  test('returns a defined failure for an unknown object command type', () => {
    const core = createCore();
    const result = core.interact({ type: 'not-a-universe-command', payload: 42 });

    expect(result).toEqual({
      ok: false,
      message: "Unknown universe command 'not-a-universe-command'.",
      eventIds: [],
    });
  });

  test('preserves effective configuration overrides when resetting state', () => {
    const epochIso = '2301-06-07T08:09:10.000Z';
    const core = new UniverseCore({
      seed: 'custom-seed',
      tickDurationMs: 250,
      epochIso,
      maxCatchUpTicks: 17,
      rebaseDistanceM: 42_000,
      streamingRadiusM: 9_000,
    });
    core.tick(750);
    expect(core.state.tick).toBe(3);

    core.reset('replacement-seed');

    expect(core.state.tick).toBe(0);
    expect(core.state.elapsedMs).toBe(0);
    expect(core.state.accumulatorMs).toBe(0);
    expect(core.state.worldTimeIso).toBe(epochIso);
    expect(core.state.config).toEqual({
      seed: 'replacement-seed',
      tickDurationMs: 250,
      epochIso,
      maxCatchUpTicks: 17,
      rebaseDistanceM: 42_000,
      streamingRadiusM: 9_000,
    });

    core.tick(249);
    expect(core.state.tick).toBe(0);
    core.tick(1);
    expect(core.state.tick).toBe(1);
    core.reset();
    expect(core.state.config.seed).toBe('replacement-seed');
    expect(core.state.config.tickDurationMs).toBe(250);
  });

  test('ships an accessible, asset-local browser shell for the renderer and diagnostic overlays', () => {
    const html = readFileSync(join(TEST_ROOT, '..', 'universe', 'index.template.html'), 'utf8');
    const css = readFileSync(join(TEST_ROOT, '..', 'universe', 'styles.css'), 'utf8');
    const runtimeHud = readFileSync(join(TEST_ROOT, '..', 'universe', 'UIHUD.ts'), 'utf8');
    const runtimeConsole = readFileSync(join(TEST_ROOT, '..', 'universe', 'DeveloperConsole.ts'), 'utf8');
    for (const id of ['app', 'viewport', 'canvas-mount', 'loading-screen']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).not.toContain('id="hud-status"');
    expect(runtimeHud).toContain('id="hud-status"');
    expect(runtimeHud).toContain('id="context-prompt"');
    expect(runtimeHud).toContain('data-hud-panel');
    expect(runtimeHud).toMatch(/missions|economy|dialogue/);
    expect(runtimeConsole).toContain('developer-console');
    expect(html).toContain('<script type="module" src="./universe/app.ts"></script>');
    expect(html).not.toMatch(/https?:\/\//i);
    expect(css).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
