import { clamp } from './deterministic.js';
import { emitWorldEvent, findRequired } from './state-utils.js';
import type { CommandResult, EntityId, UniverseState } from './types.js';

export class FactionSystem {
  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
  }

  changePlayerReputation(factionId: EntityId, delta: number, reason: string): CommandResult {
    const faction = findRequired(this.state.factions, factionId, 'Faction');
    const previous = this.state.player.factionReputation[faction.id] ?? 0;
    const next = clamp(previous + delta, -100, 100);
    this.state.player.factionReputation[faction.id] = next;
    const event = emitWorldEvent(this.state, 'faction-reputation-changed', faction.id, this.state.player.id, `${faction.name} reputation changed by ${delta}: ${reason}`, { data: { previous, next, delta } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  setRelation(firstFactionId: EntityId, secondFactionId: EntityId, value: number, reason: string): CommandResult {
    if (firstFactionId === secondFactionId) return { ok: false, message: 'A faction cannot set a relation with itself.', eventIds: [] };
    const first = findRequired(this.state.factions, firstFactionId, 'Faction');
    const second = findRequired(this.state.factions, secondFactionId, 'Faction');
    const normalized = clamp(value, -100, 100);
    first.relations[second.id] = normalized;
    second.relations[first.id] = normalized;
    const event = emitWorldEvent(this.state, normalized >= 25 ? 'faction-agreement' : 'faction-relation-changed', first.id, second.id, `${first.name} and ${second.name} relation set to ${normalized}: ${reason}`, { data: { value: normalized } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  declareConflict(firstFactionId: EntityId, secondFactionId: EntityId, reason: string): CommandResult {
    const first = findRequired(this.state.factions, firstFactionId, 'Faction');
    const second = findRequired(this.state.factions, secondFactionId, 'Faction');
    if (!first.activeConflictIds.includes(second.id)) first.activeConflictIds.push(second.id);
    if (!second.activeConflictIds.includes(first.id)) second.activeConflictIds.push(first.id);
    first.relations[second.id] = -80;
    second.relations[first.id] = -80;
    const event = emitWorldEvent(this.state, 'faction-conflict-declared', first.id, second.id, `${first.name} entered conflict with ${second.name}: ${reason}`, { severity: 0.8 });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  sanction(factionId: EntityId, targetId: EntityId, active: boolean): CommandResult {
    const faction = findRequired(this.state.factions, factionId, 'Faction');
    faction.sanctions = active ? [...new Set([...faction.sanctions, targetId])] : faction.sanctions.filter((id) => id !== targetId);
    for (const market of this.state.economy.markets.filter((candidate) => candidate.factionId === faction.id)) {
      market.sanctions = active ? [...new Set([...market.sanctions, targetId])] : market.sanctions.filter((id) => id !== targetId);
    }
    const event = emitWorldEvent(this.state, active ? 'faction-sanction-imposed' : 'faction-sanction-lifted', faction.id, targetId, `${faction.name} ${active ? 'imposed' : 'lifted'} sanctions on ${targetId}.`);
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }
}
