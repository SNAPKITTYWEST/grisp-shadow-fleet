import { clamp } from './deterministic.js';
import { emitWorldEvent, findRequired, rebuildRoomOccupants, trimHistory } from './state-utils.js';
import type { CommandResult, EntityId, MemoryRecord, NpcState, UniverseState, WorldEventState } from './types.js';

export class PopulationSystem {
  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
  }

  getNpc(npcId: EntityId): NpcState {
    return findRequired(this.state.npcs, npcId, 'NPC');
  }

  remember(npcId: EntityId, subjectId: EntityId, summary: string, emotionalWeight: number, tags: string[] = []): MemoryRecord {
    const npc = this.getNpc(npcId);
    const memory: MemoryRecord = {
      id: `memory-${npc.id}-${this.state.tick}-${npc.memories.length + 1}`,
      tick: this.state.tick,
      subjectId,
      summary,
      emotionalWeight: clamp(emotionalWeight, -1, 1),
      confidence: 1,
      tags: [...tags],
    };
    npc.memories.push(memory);
    trimHistory(npc.memories, 64);
    return memory;
  }

  recordPlayerAction(npcId: EntityId, action: string, trustDelta: number): CommandResult {
    const npc = this.getNpc(npcId);
    if (!npc.alive) return { ok: false, message: `${npc.name} is dead.`, eventIds: [] };
    const existing = npc.trustValues[this.state.player.id] ?? 0;
    npc.trustValues[this.state.player.id] = clamp(existing + trustDelta, -100, 100);
    npc.playerReaction = this.reactionForTrust(npc.trustValues[this.state.player.id] as number);
    this.remember(npc.id, this.state.player.id, action, clamp(trustDelta / 20, -1, 1), ['player-action']);
    npc.behavior.immediateReaction = trustDelta < -10 ? 'seek safety and notify security' : trustDelta > 10 ? 'offer immediate assistance' : 'update social assessment';
    const event = emitWorldEvent(this.state, 'npc-player-reaction', npc.id, this.state.player.id, `${npc.name} remembers: ${action}`, { severity: Math.abs(trustDelta) / 100, data: { trustDelta, reaction: npc.playerReaction } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  setAlive(npcId: EntityId, alive: boolean, cause: string): void {
    const npc = this.getNpc(npcId);
    if (npc.alive === alive) return;
    npc.alive = alive;
    npc.health = alive ? Math.max(1, npc.health) : 0;
    npc.taskQueue = alive ? npc.taskQueue : [];
    emitWorldEvent(this.state, alive ? 'npc-revived' : 'npc-died', npc.id, null, `${npc.name} ${alive ? 'returned to active life' : `died: ${cause}`}.`, { severity: alive ? 0.5 : 1, persistent: true, data: { cause } });
    rebuildRoomOccupants(this.state);
  }

  tick(deltaMs: number): void {
    const elapsedHours = deltaMs / 3_600_000;
    const worldMinute = Math.floor((this.state.elapsedMs / 60_000) % 1_440);
    const recentEvents = this.state.events.filter((event) => !event.resolved && event.tick >= this.state.tick - 100);
    for (const npc of this.state.npcs) {
      if (!npc.alive) continue;
      this.updateNeeds(npc, elapsedHours);
      this.updateScheduleAndPlan(npc, worldMinute);
      this.updateLayeredBehavior(npc, recentEvents);
      this.advanceTask(npc, elapsedHours);
      npc.lastUpdatedTick = this.state.tick;
    }
    rebuildRoomOccupants(this.state);
  }

  private updateNeeds(npc: NpcState, elapsedHours: number): void {
    npc.needs.rest = clamp(npc.needs.rest - elapsedHours * 2.8, 0, 100);
    npc.needs.nutrition = clamp(npc.needs.nutrition - elapsedHours * 4.2, 0, 100);
    npc.needs.belonging = clamp(npc.needs.belonging - elapsedHours * 0.6, 0, 100);
    const room = this.state.rooms.find((candidate) => candidate.id === npc.currentLocationId);
    npc.needs.safety = clamp(npc.needs.safety + elapsedHours * (room?.damage || !room?.environment.breathable ? -8 : 0.8), 0, 100);
    if (npc.currentLocationId === npc.homeLocationId) npc.needs.rest = clamp(npc.needs.rest + elapsedHours * 10, 0, 100);
    if (npc.currentLocationId === 'room-galley') npc.needs.nutrition = clamp(npc.needs.nutrition + elapsedHours * 18, 0, 100);
    if (npc.health < 40 && npc.currentLocationId !== 'room-medical') {
      npc.taskQueue.unshift({ id: `task-${npc.id}-medical-${this.state.tick}`, kind: 'seek-medical-care', targetId: 'interaction-medical', locationId: 'room-medical', priority: 100, progress: 0, status: 'queued' });
    }
  }

  private updateScheduleAndPlan(npc: NpcState, worldMinute: number): void {
    const scheduled = npc.schedule.find((entry) => worldMinute >= entry.startMinute && worldMinute < entry.endMinute) ?? npc.schedule[0];
    if (!scheduled) return;
    const urgent = npc.taskQueue.find((task) => task.status === 'active' || task.priority > scheduled.priority);
    if (!urgent) {
      const scheduledTask = npc.taskQueue.find((task) => task.kind === scheduled.activity && task.status !== 'completed');
      if (!scheduledTask) {
        npc.taskQueue.push({ id: `task-${npc.id}-${this.state.tick}`, kind: scheduled.activity, targetId: null, locationId: scheduled.locationId, priority: scheduled.priority, progress: 0, status: 'queued' });
      }
    }
    npc.taskQueue.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
    const active = npc.taskQueue.find((task) => task.status === 'active') ?? npc.taskQueue.find((task) => task.status === 'queued');
    if (active && active.status === 'queued') {
      active.status = 'active';
      npc.currentLocationId = active.locationId;
    }
    npc.behavior.shortTermTaskId = active?.id ?? null;
  }

  private updateLayeredBehavior(npc: NpcState, events: WorldEventState[]): void {
    const relevant = events
      .filter((event) => event.targetId === npc.id || event.targetId === npc.currentLocationId || event.targetId === null)
      .sort((left, right) => right.severity - left.severity || right.tick - left.tick)[0];
    npc.behavior.immediateReaction = relevant && relevant.severity >= 0.7 ? 'react to immediate hazard' : 'continue local task';
    npc.behavior.worldEventResponse = relevant ? `respond to ${relevant.type}` : 'monitor local alerts';
    const faction = this.state.factions.find((candidate) => candidate.id === npc.factionId);
    npc.behavior.factionObligation = faction?.activeConflictIds.length ? 'support faction emergency posture' : `advance ${faction?.goals[0] ?? 'assigned duty'}`;
    const playerMemories = npc.memories.filter((memory) => memory.subjectId === this.state.player.id);
    npc.behavior.memoryBias = playerMemories.length === 0 ? 0 : playerMemories.reduce((sum, memory) => sum + memory.emotionalWeight * memory.confidence, 0) / playerMemories.length;
    const goal = npc.goals.find((candidate) => candidate.id === npc.behavior.longTermGoalId);
    if (goal && npc.currentLocationId === npc.workLocationId) goal.progress = clamp(goal.progress + 0.0005, 0, 1);
    if (goal?.progress === 1) goal.status = 'completed';
  }

  private advanceTask(npc: NpcState, elapsedHours: number): void {
    const active = npc.taskQueue.find((task) => task.status === 'active');
    if (!active) return;
    active.progress = clamp(active.progress + Math.max(0.01, elapsedHours * 2), 0, 1);
    if (active.progress < 1) return;
    active.status = 'completed';
    if (active.kind.includes('rest')) npc.needs.rest = clamp(npc.needs.rest + 12, 0, 100);
    if (active.kind.includes('breakfast')) npc.needs.nutrition = clamp(npc.needs.nutrition + 18, 0, 100);
    npc.needs.purpose = clamp(npc.needs.purpose + 0.5, 0, 100);
    npc.taskQueue = npc.taskQueue.filter((task) => task.status !== 'completed' || task.id === active.id).slice(-12);
  }

  private reactionForTrust(trust: number): NpcState['playerReaction'] {
    if (trust <= -60) return 'hostile';
    if (trust <= -20) return 'wary';
    if (trust >= 70) return 'loyal';
    if (trust >= 25) return 'friendly';
    return 'neutral';
  }
}
