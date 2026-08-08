import { checksum } from './deterministic.js';
import { UniverseCore } from './UniverseCore.js';
import { createInitialWorld } from './world-data.js';
import type { EntityId, SmokeAssertion, SmokeReport } from './types.js';

export class TestHarness {
  runSmokeSuite(): SmokeReport {
    const assertions: SmokeAssertion[] = [];
    let finalTick = 0;
    const record = (name: string, passed: boolean, detail: string): void => {
      assertions.push({ name, passed, detail });
    };

    try {
      const first = createInitialWorld('harness-seed');
      const second = createInitialWorld('harness-seed');
      record('deterministic seed', checksum(first) === checksum(second), 'Equal seeds produce byte-equivalent simulation state.');
      record('functional station', first.rooms.length >= 20 && first.rooms.every((room) => room.purpose.length > 12 && room.interactionPoints.length > 0), `${first.rooms.length} purposeful rooms expose interactions.`);
      record('persistent population', first.npcs.length >= 50 && first.npcs.every((npc) => npc.schedule.length > 0 && npc.goals.length > 0 && npc.relationships.length > 0 && npc.memories.length > 0), `${first.npcs.length} NPC records include schedules, goals, relationships, and memory.`);
      record('sovereign agents', first.agents.length >= 6 && first.agents.every((agent) => agent.permissions.length > 0 && agent.authorityScope.length > 0 && agent.deterministicFallback.length > 0), `${first.agents.length} bounded agents expose permissions and fallbacks.`);
      record('state-driven missions', first.missions.length >= 10 && first.missions.every((mission) => mission.trigger && mission.objectives.length > 0), `${first.missions.length} missions have triggers and objectives.`);
      record('galactic network', first.starSystems.length >= 3 && first.jumpConnections.some((connection) => connection.kind === 'jump-gate') && first.jumpConnections.some((connection) => connection.kind === 'wormhole'), `${first.starSystems.length} star systems and ${first.jumpConnections.length} explicit travel connections.`);
      record('procedural settlements and life', first.settlements.length >= 5 && first.settlements.every((settlement) => settlement.proceduralSeed > 0 && settlement.facilityKinds.length > 0) && first.lifeforms.some((life) => life.kind === 'wildlife') && first.lifeforms.some((life) => life.kind === 'synthetic-life'), `${first.settlements.length} settlements and ${first.lifeforms.length} persistent life populations.`);
    } catch (error) {
      record('initial world construction', false, this.errorDetail(error));
    }

    try {
      const core = new UniverseCore({ seed: 'airlock-eva-smoke' });
      this.walkTo(core, 'room-eva-prep');
      const entered = core.dispatch({ type: 'airlock-traverse', airlockId: 'airlock-cyan-01' });
      record('enter airlock', entered.ok && core.state.player.locationId === 'room-airlock-chamber', entered.message);
      const beforeRejected = checksum(core.state);
      const rejected = core.dispatch({ type: 'airlock-cycle', airlockId: 'airlock-cyan-01', direction: 'to-space' });
      record('airlock suit guard is atomic', !rejected.ok && checksum(core.state) === beforeRejected, rejected.message);
      core.dispatch({ type: 'suit', action: 'equip' });
      core.dispatch({ type: 'suit', action: 'seal' });
      const cycle = core.dispatch({ type: 'airlock-cycle', airlockId: 'airlock-cyan-01', direction: 'to-space' });
      core.tick(4_600);
      const airlock = core.state.airlocks[0];
      record('airlock pressure cycle', cycle.ok && airlock?.phase === 'idle-vacuum' && (airlock.pressureKpa < 5), `phase=${airlock?.phase}, pressure=${airlock?.pressureKpa}`);
      const inner = core.state.doors.find((door) => door.id === 'door-airlock-inner');
      const outer = core.state.doors.find((door) => door.id === 'door-airlock-outer');
      record('airlock interlock', inner?.position !== 'open' && outer?.position === 'open', `inner=${inner?.position}, outer=${outer?.position}`);
      const exited = core.dispatch({ type: 'airlock-traverse', airlockId: 'airlock-cyan-01' });
      const beforeEva = { ...core.state.player.transform.position };
      core.tick(1_000, { move: { x: 1, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 }, sprint: false, crouch: false, ascend: true, descend: false, brake: false });
      const afterEva = core.state.player.transform.position;
      record('seamless station to space', exited.ok && core.state.player.layer === 'station-exterior', exited.message);
      record('zero-gravity EVA physics', afterEva.x !== beforeEva.x || afterEva.y !== beforeEva.y || afterEva.z !== beforeEva.z, `position=${afterEva.x.toFixed(2)},${afterEva.y.toFixed(2)},${afterEva.z.toFixed(2)}`);
      const boots = core.dispatch({ type: 'suit', action: 'mag-boots-on' });
      core.tick(200);
      record('magnetic boots', boots.ok && core.state.player.traversalMode === 'magnetic-boots' && core.state.player.grounded, boots.message);
      finalTick += core.state.tick;
    } catch (error) {
      record('airlock and EVA workflow', false, this.errorDetail(error));
    }

    try {
      const core = new UniverseCore({ seed: 'ship-smoke' });
      this.walkTo(core, 'room-hangar');
      const board = core.dispatch({ type: 'ship-board', shipId: 'ship-player-kestrel' });
      const start = core.dispatch({ type: 'ship-start', shipId: 'ship-player-kestrel' });
      core.tick(3_100);
      const pilot = core.dispatch({ type: 'ship-pilot', shipId: 'ship-player-kestrel' });
      const undock = core.dispatch({ type: 'ship-undock', shipId: 'ship-player-kestrel' });
      core.tick(10_000);
      core.tick(10_000);
      core.tick(1_000);
      const ship = core.state.ships.find((candidate) => candidate.id === 'ship-player-kestrel');
      record('ship board and startup', board.ok && start.ok && pilot.ok && ship?.startupStage === 'ready', `${board.message} ${start.message}`);
      record('ship launch', undock.ok && ship?.flightMode === 'free-flight', `mode=${ship?.flightMode}`);
      if (!ship) throw new Error('Player ship was not found.');
      const beforeThrust = { ...ship.transform.position };
      core.dispatch({ type: 'ship-controls', shipId: ship.id, input: { thrust: { x: 0.2, y: 0, z: 1 }, rotation: { x: 0, y: 0.4, z: 0 }, brake: false, boost: false } });
      core.tick(1_000);
      record('ship physics', ship.transform.position.z !== beforeThrust.z && ship.fuel < 1, `velocity=${ship.transform.velocity.z.toFixed(2)}, fuel=${ship.fuel.toFixed(4)}`);
      ship.transform.position = { x: 210, y: -18, z: -30 };
      ship.transform.velocity = { x: 0, y: 0, z: 4 };
      const dock = core.dispatch({ type: 'ship-dock', shipId: ship.id, dockId: 'dock-hangar-01' });
      record('ship docking', dock.ok && ship.flightMode === 'docked' && ship.dockedAtId === 'dock-hangar-01', dock.message);
      core.dispatch({ type: 'ship-undock', shipId: ship.id });
      core.tick(10_000);
      core.tick(10_000);
      core.tick(1_000);
      const jump = core.dispatch({ type: 'ship-jump', shipId: ship.id, targetId: 'moon-nacre' });
      core.tick(5_100);
      const approach = core.planets.approachRegion(ship.id, 'region-nacre-landing');
      const land = core.dispatch({ type: 'ship-land', shipId: ship.id, regionId: 'region-nacre-landing' });
      record('jump and planetary approach', jump.ok && approach.ok, `${jump.message} ${approach.message}`);
      record('planetary landing', land.ok && ship.flightMode === 'landed' && ship.landedRegionId === 'region-nacre-landing', land.message);
      finalTick += core.state.tick;
    } catch (error) {
      record('ship workflow', false, this.errorDetail(error));
    }

    try {
      const core = new UniverseCore({ seed: 'social-economy-smoke', tickDurationMs: 60_000, maxCatchUpTicks: 100 });
      core.tick(60_000);
      const rescue = core.state.missions.find((mission) => mission.id === 'mission-rescue');
      record('mission reacts to traffic distress', rescue?.status === 'available', `status=${rescue?.status}`);
      const accept = core.dispatch({ type: 'mission-accept', missionId: 'mission-rescue' });
      const progress = core.missions.addProgress('mission-rescue', 'objective-rescue-board', 1);
      record('mission completion and consequence', accept.ok && progress.ok && rescue?.status === 'completed' && core.state.player.credits > 2_500, `status=${rescue?.status}, credits=${core.state.player.credits}`);

      const npc = core.state.npcs[0];
      if (!npc) throw new Error('No NPC generated.');
      this.walkTo(core, npc.currentLocationId);
      const dialogue = core.dispatch({ type: 'dialogue-start', npcId: npc.id });
      const session = core.state.dialogue.sessions.at(-1);
      const choice = session ? core.dispatch({ type: 'dialogue-choose', sessionId: session.id, choiceId: `choice-${npc.id}-work` }) : { ok: false, message: 'No session', eventIds: [] };
      record('dialogue changes persistent memory', dialogue.ok && choice.ok && npc.memories.some((memory) => memory.tags.includes('dialogue')), `${npc.name} memories=${npc.memories.length}`);

      const beforeLocation = npc.currentLocationId;
      core.tick(3_600_000);
      record('NPC schedules advance', npc.lastUpdatedTick > 0 && npc.behavior.shortTermTaskId !== null && (npc.currentLocationId !== beforeLocation || npc.taskQueue.length > 0), `${npc.name} location=${npc.currentLocationId}, task=${npc.behavior.shortTermTaskId}`);

      this.walkTo(core, 'room-market');
      const market = core.state.economy.markets.find((item) => item.id === 'market-station');
      const alloy = market?.listings.find((listing) => listing.commodityId === 'commodity-alloy');
      const beforeInventory = alloy?.inventory ?? 0;
      const buyAlloy = core.dispatch({ type: 'trade', marketId: 'market-station', commodityId: 'commodity-alloy', quantity: 8, side: 'buy' });
      const buyCircuit = core.dispatch({ type: 'trade', marketId: 'market-station', commodityId: 'commodity-circuit', quantity: 4, side: 'buy' });
      record('dynamic economy trade', buyAlloy.ok && buyCircuit.ok && (alloy?.inventory ?? beforeInventory) < beforeInventory, `market alloy=${alloy?.inventory}`);
      this.walkTo(core, 'room-quarters-b');
      const started = core.dispatch({ type: 'construction-start', projectId: 'project-player-workshop' });
      const deliveredAlloy = core.dispatch({ type: 'construction-deliver', projectId: 'project-player-workshop', commodityId: 'commodity-alloy', quantity: 8 });
      const deliveredCircuit = core.dispatch({ type: 'construction-deliver', projectId: 'project-player-workshop', commodityId: 'commodity-circuit', quantity: 4 });
      const worked = core.dispatch({ type: 'construction-work', projectId: 'project-player-workshop', labor: 10 });
      const project = core.state.construction.projects[0];
      record('owned-space construction', started.ok && deliveredAlloy.ok && deliveredCircuit.ok && worked.ok && project?.status === 'completed', `status=${project?.status}`);

      const engineering = core.state.rooms.find((room) => room.id === 'room-engineering');
      if (engineering) engineering.damage = 0.6;
      const denied = core.agents.enqueue('agent-003', { type: 'repair-room', requestedById: core.state.player.id, targetId: 'room-engineering', parameters: { amount: 0.4 }, requiredPermission: 'station-command.operate' });
      const acceptedAgent = core.agents.enqueue('agent-003', { type: 'repair-room', requestedById: core.state.player.id, targetId: 'room-engineering', parameters: { amount: 0.4 }, requiredPermission: 'engineering.operate' });
      core.tick(6 * 60_000);
      const agent = core.state.agents.find((item) => item.id === 'agent-003');
      record('agent permission boundary', !denied.ok && acceptedAgent.ok && Boolean(agent?.auditLog.some((entry) => entry.outcome === 'rejected')), `audit records=${agent?.auditLog.length}`);
      record('agent deterministic execution', (engineering?.damage ?? 1) < 0.6 && Boolean(agent?.auditLog.some((entry) => entry.outcome === 'completed')), `room damage=${engineering?.damage}`);

      const savedNpcMemoryCount = npc.memories.length;
      const savedCredits = core.state.player.credits;
      const serialized = core.serialize();
      core.state.player.credits = -1;
      npc.memories.length = 0;
      core.load(serialized);
      const restoredNpc = core.state.npcs.find((candidate) => candidate.id === npc.id);
      record('save and load restoration', core.state.player.credits === savedCredits && restoredNpc?.memories.length === savedNpcMemoryCount, `credits=${core.state.player.credits}, memories=${restoredNpc?.memories.length}`);
      finalTick += core.state.tick;
    } catch (error) {
      record('social, economy, mission, construction, persistence workflow', false, this.errorDetail(error));
    }

    return { passed: assertions.every((assertion) => assertion.passed), assertions, finalTick };
  }

  private walkTo(core: UniverseCore, targetRoomId: EntityId): void {
    const start = core.state.player.locationId;
    if (start === targetRoomId) return;
    if (!start.startsWith('room-') || !targetRoomId.startsWith('room-')) throw new Error(`Cannot walk between '${start}' and '${targetRoomId}'.`);
    const queue = [start];
    const previous = new Map<string, { roomId: string; doorId: string }>();
    const visited = new Set([start]);
    while (queue.length > 0 && !visited.has(targetRoomId)) {
      const current = queue.shift() as string;
      for (const door of core.state.doors) {
        if (door.kind === 'airlock-outer' || door.locked || door.requiredPermission) continue;
        const adjacent = door.fromRoomId === current ? door.toRoomId : door.toRoomId === current ? door.fromRoomId : null;
        if (!adjacent || visited.has(adjacent)) continue;
        visited.add(adjacent);
        previous.set(adjacent, { roomId: current, doorId: door.id });
        queue.push(adjacent);
      }
    }
    if (!visited.has(targetRoomId)) throw new Error(`No traversable route from '${start}' to '${targetRoomId}'.`);
    const route: string[] = [];
    let cursor = targetRoomId;
    while (cursor !== start) {
      const step = previous.get(cursor);
      if (!step) throw new Error(`Broken route at '${cursor}'.`);
      route.unshift(step.doorId);
      cursor = step.roomId;
    }
    for (const doorId of route) {
      const door = core.state.doors.find((candidate) => candidate.id === doorId);
      if (door?.position !== 'open') {
        const opened = core.dispatch({ type: 'door', doorId, action: 'open' });
        if (!opened.ok) throw new Error(opened.message);
      }
      const traversed = core.dispatch({ type: 'door-traverse', doorId });
      if (!traversed.ok) throw new Error(traversed.message);
    }
  }

  private errorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
