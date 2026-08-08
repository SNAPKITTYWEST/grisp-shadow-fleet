import { clamp } from './deterministic.js';
import { emitWorldEvent, findRequired, trimHistory } from './state-utils.js';
import type { CommandResult, DialogueSessionState, EntityId, UniverseState } from './types.js';

export class DialogueSystem {
  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
  }

  start(npcId: EntityId): CommandResult {
    const npc = findRequired(this.state.npcs, npcId, 'NPC');
    if (!npc.alive) return this.failure(`${npc.name} cannot converse.`);
    if (npc.currentLocationId !== this.state.player.locationId) return this.failure(`${npc.name} is not in the player's location.`);
    const firstNode = this.state.dialogue.nodes.find((node) => node.id === npc.dialogueStateId);
    if (!firstNode) return this.failure(`${npc.name} has no reachable dialogue state.`);
    const session: DialogueSessionState = {
      id: `dialogue-session-${npc.id}-${this.state.tick}-${this.state.dialogue.sessions.length + 1}`,
      npcId: npc.id,
      currentNodeId: firstNode.id,
      visitedNodeIds: [firstNode.id],
      active: true,
    };
    this.state.dialogue.sessions.push(session);
    trimHistory(this.state.dialogue.sessions, 24);
    const event = emitWorldEvent(this.state, 'dialogue-started', this.state.player.id, npc.id, `Conversation started with ${npc.name}.`, { persistent: false, data: { sessionId: session.id } });
    return { ok: true, message: firstNode.text, eventIds: [event.id] };
  }

  getSession(sessionId: EntityId): DialogueSessionState {
    return findRequired(this.state.dialogue.sessions, sessionId, 'Dialogue session');
  }

  availableChoices(sessionId: EntityId) {
    const session = this.getSession(sessionId);
    const npc = findRequired(this.state.npcs, session.npcId, 'NPC');
    const node = findRequired(this.state.dialogue.nodes, session.currentNodeId, 'Dialogue node');
    const trust = npc.trustValues[this.state.player.id] ?? 0;
    return node.choices.filter((choice) => trust >= choice.requiredTrust);
  }

  choose(sessionId: EntityId, choiceId: EntityId): CommandResult {
    const session = this.getSession(sessionId);
    if (!session.active) return this.failure('Dialogue session is closed.');
    const npc = findRequired(this.state.npcs, session.npcId, 'NPC');
    const node = findRequired(this.state.dialogue.nodes, session.currentNodeId, 'Dialogue node');
    const choice = node.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) return this.failure(`Choice '${choiceId}' is unavailable at this dialogue node.`);
    const trust = npc.trustValues[this.state.player.id] ?? 0;
    if (trust < choice.requiredTrust) return this.failure(`${npc.name} does not trust the player enough for that response.`);
    const nextTrust = clamp(trust + choice.trustDelta, -100, 100);
    npc.trustValues[this.state.player.id] = nextTrust;
    npc.playerReaction = nextTrust <= -60 ? 'hostile' : nextTrust < -20 ? 'wary' : nextTrust >= 70 ? 'loyal' : nextTrust >= 25 ? 'friendly' : 'neutral';
    npc.memories.push({
      id: `memory-${npc.id}-dialogue-${this.state.tick}-${npc.memories.length + 1}`,
      tick: this.state.tick,
      subjectId: this.state.player.id,
      summary: `Player said: ${choice.text}`,
      emotionalWeight: clamp(choice.trustDelta / 10, -1, 1),
      confidence: 1,
      tags: ['dialogue', choice.eventType ?? 'conversation'],
    });
    trimHistory(npc.memories, 64);
    if (choice.nextNodeId) {
      const next = findRequired(this.state.dialogue.nodes, choice.nextNodeId, 'Next dialogue node');
      session.currentNodeId = next.id;
      session.visitedNodeIds.push(next.id);
    } else {
      session.active = false;
    }
    const event = emitWorldEvent(this.state, choice.eventType ?? 'dialogue-choice', this.state.player.id, npc.id, `${npc.name} responded to '${choice.text}'.`, { data: { choiceId, trustDelta: choice.trustDelta, sessionId } });
    const responseText = choice.nextNodeId ? findRequired(this.state.dialogue.nodes, choice.nextNodeId, 'Dialogue node').text : 'Conversation ended.';
    return { ok: true, message: responseText, eventIds: [event.id] };
  }

  private failure(message: string): CommandResult {
    return { ok: false, message, eventIds: [] };
  }
}
