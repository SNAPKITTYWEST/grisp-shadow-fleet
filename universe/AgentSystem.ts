import { clamp } from './deterministic.js';
import { emitWorldEvent, findRequired, trimHistory } from './state-utils.js';
import type { AgentTaskState, CommandResult, EntityId, SovereignAgentState, UniverseState } from './types.js';

export type NewAgentTask = Omit<AgentTaskState, 'id' | 'status' | 'createdTick' | 'startedTick' | 'completedTick' | 'failureReason'>;

export class AgentSystem {
  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
  }

  enqueue(agentId: EntityId, requested: NewAgentTask): CommandResult {
    const agent = findRequired(this.state.agents, agentId, 'Sovereign agent');
    const task: AgentTaskState = {
      ...requested,
      id: `agent-task-${agent.id}-${this.state.tick}-${agent.taskQueue.length + 1}`,
      status: 'queued', createdTick: this.state.tick, startedTick: null, completedTick: null, failureReason: null,
    };
    if (!agent.permissions.includes(requested.requiredPermission)) {
      task.status = 'rejected';
      task.failureReason = `Permission '${requested.requiredPermission}' is outside bounded authority.`;
      agent.taskQueue.push(task);
      this.audit(agent, task.id, requested.type, 'rejected', task.failureReason);
      return { ok: false, message: task.failureReason, eventIds: [] };
    }
    if (requested.targetId && !this.targetIsWithinScope(agent, requested.targetId)) {
      task.status = 'rejected';
      task.failureReason = `Target '${requested.targetId}' is outside ${agent.domain} authority scope.`;
      agent.taskQueue.push(task);
      this.audit(agent, task.id, requested.type, 'rejected', task.failureReason);
      return { ok: false, message: task.failureReason, eventIds: [] };
    }
    agent.taskQueue.push(task);
    this.audit(agent, task.id, requested.type, 'accepted', 'Task admitted to deterministic queue.');
    const event = emitWorldEvent(this.state, 'agent-task-queued', requested.requestedById, agent.id, `${agent.name} accepted task '${requested.type}'.`, { persistent: false, data: { taskId: task.id } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  setStatus(agentId: EntityId, status: SovereignAgentState['status'], reason: string): void {
    const agent = findRequired(this.state.agents, agentId, 'Sovereign agent');
    agent.status = status;
    agent.observableState.statusReason = reason;
    if (status === 'offline' || status === 'degraded') this.applyFallback(agent, reason);
  }

  tick(): void {
    for (const agent of this.state.agents) {
      agent.observableState.heartbeat = agent.status !== 'offline';
      agent.observableState.workload = agent.taskQueue.filter((task) => task.status === 'queued' || task.status === 'running').length;
      if (agent.status === 'offline') {
        if (this.state.tick % 100 === 0) this.applyFallback(agent, 'Agent is offline.');
        continue;
      }
      let current = agent.currentTaskId ? agent.taskQueue.find((task) => task.id === agent.currentTaskId) : undefined;
      if (!current) {
        current = agent.taskQueue.find((task) => task.status === 'queued');
        if (current) {
          current.status = 'running';
          current.startedTick = this.state.tick;
          agent.currentTaskId = current.id;
          agent.status = 'working';
        }
      }
      if (!current || current.status !== 'running') {
        if (agent.status !== 'degraded') agent.status = 'idle';
        continue;
      }
      if (this.state.tick - (current.startedTick ?? this.state.tick) < 5) continue;
      try {
        this.execute(agent, current);
        current.status = 'completed';
        current.completedTick = this.state.tick;
        this.audit(agent, current.id, current.type, 'completed', 'Task completed within bounded authority.');
        agent.memory.push({ id: `agent-memory-${agent.id}-${this.state.tick}`, tick: this.state.tick, key: current.type, value: 'completed', salience: 0.5 });
        trimHistory(agent.memory, 48);
      } catch (error) {
        current.status = 'failed';
        current.completedTick = this.state.tick;
        current.failureReason = error instanceof Error ? error.message : String(error);
        agent.failureCount += 1;
        agent.status = agent.failureCount >= 3 ? 'degraded' : 'idle';
        this.audit(agent, current.id, current.type, 'failed', current.failureReason);
        this.applyFallback(agent, current.failureReason);
      } finally {
        agent.currentTaskId = null;
        agent.observableState.lastDecisionTick = this.state.tick;
      }
    }
  }

  private execute(agent: SovereignAgentState, task: AgentTaskState): void {
    const amount = typeof task.parameters.amount === 'number' ? task.parameters.amount : 0.1;
    if (task.type === 'repair-room' && task.targetId) {
      const room = findRequired(this.state.rooms, task.targetId, 'Repair target room');
      room.damage = clamp(room.damage - amount, 0, 1);
      room.powerOnline = true;
    } else if (task.type === 'stabilize-pressure' && task.targetId) {
      const room = findRequired(this.state.rooms, task.targetId, 'Environmental target room');
      room.environment.pressureKpa = 101.3;
      room.environment.oxygenFraction = 0.209;
      room.environment.breathable = true;
    } else if (task.type === 'medical-triage' && task.targetId) {
      const npc = findRequired(this.state.npcs, task.targetId, 'Triage target');
      npc.health = clamp(npc.health + amount * 100, 0, 100);
    } else if (task.type === 'reroute-traffic' && task.targetId) {
      const traffic = findRequired(this.state.traffic, task.targetId, 'Traffic target');
      traffic.routeId = String(task.parameters.routeId ?? traffic.routeId);
      traffic.status = 'transit';
    } else if (task.type === 'issue-market-credit' && task.targetId) {
      const market = findRequired(this.state.economy.markets, task.targetId, 'Market target');
      market.credits += Math.max(0, amount);
    } else if (task.type === 'scan-discovery' && task.targetId) {
      const discovery = findRequired(this.state.discoveries, task.targetId, 'Discovery target');
      discovery.discovered = true;
    } else if (task.type === 'broadcast' || task.type === 'plot-route' || task.type === 'dispatch-patrol' || task.type === 'request-review') {
      agent.observableState.lastOperation = task.type;
    } else {
      throw new Error(`Unsupported deterministic agent task '${task.type}'.`);
    }
    emitWorldEvent(this.state, 'agent-task-completed', agent.id, task.targetId, `${agent.name} completed '${task.type}'.`, { data: { taskId: task.id } });
  }

  private targetIsWithinScope(agent: SovereignAgentState, targetId: EntityId): boolean {
    if (agent.authorityScope.includes(targetId)) return true;
    const stationScoped = agent.authorityScope.includes('station-sovereign-01');
    if (!stationScoped) return false;
    if (agent.domain === 'engineering') return this.state.rooms.some((room) => room.id === targetId && ['room-engineering', 'room-reactor', 'room-coolant', 'room-fabrication', 'room-maintenance'].includes(room.id));
    if (agent.domain === 'environmental-control') return this.state.rooms.some((room) => room.id === targetId);
    if (agent.domain === 'medical') return this.state.npcs.some((npc) => npc.id === targetId);
    if (agent.domain === 'navigation' || agent.domain === 'logistics') return this.state.traffic.some((traffic) => traffic.id === targetId) || this.state.trafficRoutes.some((route) => route.id === targetId);
    if (agent.domain === 'commerce') return this.state.economy.markets.some((market) => market.id === targetId);
    if (agent.domain === 'research' || agent.domain === 'exploration') return this.state.discoveries.some((discovery) => discovery.id === targetId);
    return agent.domain === 'station-command' || agent.domain === 'emergency-response';
  }

  private applyFallback(agent: SovereignAgentState, reason: string): void {
    agent.observableState.fallbackActive = true;
    this.audit(agent, null, 'deterministic-fallback', 'fallback', `${agent.deterministicFallback} Cause: ${reason}`);
    emitWorldEvent(this.state, 'agent-fallback', agent.id, agent.worldPresenceId, `${agent.name}: ${agent.deterministicFallback}`, { severity: 0.5, persistent: true, data: { reason } });
  }

  private audit(agent: SovereignAgentState, taskId: EntityId | null, action: string, outcome: SovereignAgentState['auditLog'][number]['outcome'], detail: string): void {
    agent.auditLog.push({ id: `audit-${agent.id}-${this.state.tick}-${agent.auditLog.length + 1}`, tick: this.state.tick, taskId, action, outcome, detail });
    trimHistory(agent.auditLog, 128);
  }
}
