import { clamp } from './deterministic.js';
import { emitWorldEvent, findRequired } from './state-utils.js';
import type { CommandResult, EntityId, MissionObjectiveState, MissionState, UniverseState, WorldEventState } from './types.js';

export class MissionSystem {
  private lastProcessedEventIndex: number;

  constructor(private state: UniverseState) {
    this.lastProcessedEventIndex = state.events.length;
  }

  replaceState(state: UniverseState): void {
    this.state = state;
    this.lastProcessedEventIndex = state.events.length;
  }

  accept(missionId: EntityId): CommandResult {
    const mission = findRequired(this.state.missions, missionId, 'Mission');
    if (mission.status !== 'available') return this.failure(`${mission.title} is not available.`);
    mission.status = 'active';
    mission.acceptedTick = this.state.tick;
    if (!this.state.player.activeMissionIds.includes(mission.id)) this.state.player.activeMissionIds.push(mission.id);
    const event = emitWorldEvent(this.state, 'mission-accepted', this.state.player.id, mission.id, `Mission accepted: ${mission.title}.`);
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  addProgress(missionId: EntityId, objectiveId: EntityId, amount = 1): CommandResult {
    const mission = findRequired(this.state.missions, missionId, 'Mission');
    if (mission.status !== 'active') return this.failure(`${mission.title} is not active.`);
    const objective = findRequired(mission.objectives, objectiveId, 'Mission objective');
    this.progressObjective(objective, amount);
    const events: string[] = [];
    if (mission.objectives.every((item) => item.completed)) events.push(this.complete(mission).id);
    return { ok: true, message: `${objective.description}: ${objective.currentAmount}/${objective.requiredAmount}`, eventIds: events };
  }

  tick(): void {
    for (const mission of this.state.missions) {
      if (mission.status === 'locked' && this.triggered(mission)) {
        mission.status = 'available';
        emitWorldEvent(this.state, 'mission-available', mission.issuerId, mission.id, `New mission available: ${mission.title}.`, { persistent: true });
      }
      if (mission.status === 'active' && mission.expiresTick !== null && this.state.tick >= mission.expiresTick) {
        mission.status = 'failed';
        this.state.player.activeMissionIds = this.state.player.activeMissionIds.filter((id) => id !== mission.id);
        emitWorldEvent(this.state, 'mission-failed', this.state.player.id, mission.id, `Mission expired: ${mission.title}.`, { severity: 0.5 });
      }
    }
    const newEvents = this.state.events.slice(this.lastProcessedEventIndex);
    this.lastProcessedEventIndex = this.state.events.length;
    for (const event of newEvents) this.applyEventProgress(event);
  }

  private triggered(mission: MissionState): boolean {
    const trigger = mission.trigger;
    if (trigger.kind === 'always') return true;
    if (trigger.kind === 'traffic-distress') return this.state.traffic.some((traffic) => traffic.id === trigger.targetId && traffic.status === 'distress');
    if (trigger.kind === 'shortage' && trigger.targetId) {
      return this.state.economy.markets.some((market) => {
        const listing = market.listings.find((candidate) => candidate.commodityId === trigger.targetId);
        return Boolean(listing && (listing.shortage || listing.inventory <= trigger.threshold));
      });
    }
    if (trigger.kind === 'damage' && trigger.targetId) {
      const hull = this.state.hullSections.find((candidate) => candidate.id === trigger.targetId);
      const room = this.state.rooms.find((candidate) => candidate.id === trigger.targetId);
      return (hull?.hazardLevel ?? room?.damage ?? 0) >= trigger.threshold;
    }
    if (trigger.kind === 'discovery' && trigger.targetId) {
      const discovery = this.state.discoveries.find((candidate) => candidate.id === trigger.targetId);
      return Boolean(discovery && !discovery.discovered);
    }
    if (trigger.kind === 'relationship' && trigger.targetId) return (this.state.player.factionReputation[trigger.targetId] ?? 0) <= trigger.threshold;
    if (trigger.kind === 'construction' && trigger.targetId) return this.state.construction.projects.some((project) => project.id === trigger.targetId && project.status !== 'completed');
    if (trigger.kind === 'conflict' && trigger.targetId) {
      const targetId = trigger.targetId;
      return this.state.factions.some((faction) => faction.activeConflictIds.includes(targetId));
    }
    return false;
  }

  private applyEventProgress(event: WorldEventState): void {
    for (const mission of this.state.missions.filter((candidate) => candidate.status === 'active')) {
      for (const objective of mission.objectives.filter((candidate) => !candidate.completed)) {
        if (!this.eventMatchesObjective(event, objective)) continue;
        const eventAmount = typeof event.data.quantity === 'number' ? event.data.quantity : 1;
        this.progressObjective(objective, eventAmount);
      }
      if (mission.objectives.every((objective) => objective.completed)) this.complete(mission);
    }
  }

  private eventMatchesObjective(event: WorldEventState, objective: MissionObjectiveState): boolean {
    if (objective.kind === 'interact') return event.type === 'interaction-used' && event.targetId === objective.targetId;
    if (objective.kind === 'repair') return event.type.includes('repaired') && (event.targetId === objective.targetId || event.data.repairNodeId === objective.targetId);
    if (objective.kind === 'rescue') return event.type === 'traffic-rescued' && event.targetId === objective.targetId;
    if (objective.kind === 'scan') return (event.type === 'location-discovered' || event.type === 'agent-task-completed') && event.targetId === objective.targetId;
    if (objective.kind === 'visit') return (event.type === 'location-discovered' || event.type === 'ship-jump-completed') && event.targetId === objective.targetId;
    if (objective.kind === 'deliver') return event.type === 'cargo-delivered' && event.targetId === objective.targetId;
    if (objective.kind === 'trade') return event.type === 'market-trade' && event.targetId === objective.targetId && event.data.side === 'sell';
    if (objective.kind === 'construct') return event.type === 'construction-completed' && event.targetId === objective.targetId;
    if (objective.kind === 'defend') return event.type === 'patrol-completed' && event.targetId === objective.targetId;
    if (objective.kind === 'negotiate') return event.type === 'faction-agreement' && event.targetId === objective.targetId;
    return false;
  }

  private progressObjective(objective: MissionObjectiveState, amount: number): void {
    objective.currentAmount = clamp(objective.currentAmount + Math.max(0, amount), 0, objective.requiredAmount);
    objective.completed = objective.currentAmount >= objective.requiredAmount;
  }

  private complete(mission: MissionState): WorldEventState {
    mission.status = 'completed';
    mission.completedTick = this.state.tick;
    this.state.player.activeMissionIds = this.state.player.activeMissionIds.filter((id) => id !== mission.id);
    this.state.player.credits += mission.rewardCredits;
    this.state.player.factionReputation[mission.factionId] = clamp((this.state.player.factionReputation[mission.factionId] ?? 0) + mission.reputationReward, -100, 100);
    return emitWorldEvent(this.state, 'mission-completed', this.state.player.id, mission.id, `Mission completed: ${mission.title}.`, { data: { rewardCredits: mission.rewardCredits, reputationReward: mission.reputationReward } });
  }

  private failure(message: string): CommandResult {
    return { ok: false, message, eventIds: [] };
  }
}
