import { clamp } from './deterministic.js';
import { emitWorldEvent, findRequired } from './state-utils.js';
import type { CommandResult, ConstructionProjectState, EntityId, UniverseState } from './types.js';

export class ConstructionSystem {
  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
  }

  start(projectId: EntityId): CommandResult {
    const project = findRequired(this.state.construction.projects, projectId, 'Construction project');
    if (project.ownerId !== this.state.player.id) return this.failure('Player does not own this construction project.');
    if (!this.isOwnedTarget(project)) return this.failure('Construction target is not within an owned space.');
    if (project.status !== 'planned' && project.status !== 'paused') return this.failure(`${project.name} cannot be started from '${project.status}'.`);
    project.status = 'building';
    const event = emitWorldEvent(this.state, 'construction-started', this.state.player.id, project.id, `Construction started: ${project.name}.`, { data: { locationId: project.locationId } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  deliver(projectId: EntityId, commodityId: EntityId, quantity: number): CommandResult {
    const project = findRequired(this.state.construction.projects, projectId, 'Construction project');
    if (project.status === 'completed' || project.status === 'cancelled') return this.failure(`${project.name} cannot accept resources.`);
    const required = project.requiredResources[commodityId];
    if (required === undefined) return this.failure(`${commodityId} is not required by ${project.name}.`);
    if (!Number.isInteger(quantity) || quantity <= 0) return this.failure('Delivery quantity must be a positive integer.');
    const stack = this.state.player.inventory.find((item) => item.itemId === commodityId);
    if (!stack || stack.quantity < quantity) return this.failure(`Player lacks ${quantity} units of ${commodityId}.`);
    const delivered = project.deliveredResources[commodityId] ?? 0;
    const accepted = Math.min(quantity, required - delivered);
    if (accepted <= 0) return this.failure(`${project.name} already has all required ${commodityId}.`);
    stack.quantity -= accepted;
    project.deliveredResources[commodityId] = delivered + accepted;
    this.state.player.inventory = this.state.player.inventory.filter((item) => item.quantity > 0);
    this.recalculate(project);
    const event = emitWorldEvent(this.state, 'construction-resource-delivered', this.state.player.id, project.id, `Delivered ${accepted} ${commodityId} to ${project.name}.`, { data: { commodityId, quantity: accepted } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  work(projectId: EntityId, labor: number): CommandResult {
    const project = findRequired(this.state.construction.projects, projectId, 'Construction project');
    if (project.status !== 'building') return this.failure(`${project.name} is not actively building.`);
    if (this.state.player.locationId !== project.locationId) return this.failure('Player must be at the construction location.');
    if (!this.hasAllResources(project)) return this.failure(`${project.name} is waiting for resources.`);
    if (!Number.isFinite(labor) || labor <= 0) return this.failure('Labor must be positive.');
    project.laborCompleted = clamp(project.laborCompleted + labor, 0, project.laborRequired);
    this.recalculate(project);
    const eventIds: string[] = [];
    if (project.progress >= 1) eventIds.push(this.complete(project).id);
    return { ok: true, message: `${project.name} is ${Math.round(project.progress * 100)}% complete.`, eventIds };
  }

  tick(deltaMs: number): void {
    const labor = deltaMs / 3_600_000;
    for (const project of this.state.construction.projects.filter((candidate) => candidate.status === 'building')) {
      const assignedWorkers = this.state.npcs.filter((npc) => npc.alive && npc.currentLocationId === project.locationId && (npc.occupation.includes('engineer') || npc.occupation.includes('technician'))).length;
      if (assignedWorkers <= 0 || !this.hasAllResources(project)) continue;
      project.laborCompleted = clamp(project.laborCompleted + labor * assignedWorkers, 0, project.laborRequired);
      this.recalculate(project);
      if (project.progress >= 1) this.complete(project);
    }
  }

  private complete(project: ConstructionProjectState) {
    project.status = 'completed';
    project.progress = 1;
    if (!this.state.construction.completedBlueprintIds.includes(project.blueprintId)) this.state.construction.completedBlueprintIds.push(project.blueprintId);
    const owned = this.state.construction.ownedSpaces.find((space) => space.ownerId === project.ownerId && space.targetId === project.locationId);
    if (owned && !owned.modificationIds.includes(project.id)) owned.modificationIds.push(project.id);
    const room = this.state.rooms.find((candidate) => candidate.id === project.locationId);
    if (room && project.resultingInteractionKind && !room.interactionPoints.some((interaction) => interaction.id === `interaction-${project.id}`)) {
      room.interactionPoints.push({
        id: `interaction-${project.id}`,
        name: project.name,
        kind: project.resultingInteractionKind,
        purpose: `Player-constructed ${project.targetKind}.`,
        enabled: true,
        permissions: [],
        state: { constructedTick: this.state.tick, uses: 0 },
      });
    }
    return emitWorldEvent(this.state, 'construction-completed', project.ownerId, project.id, `Construction completed: ${project.name}.`, { data: { blueprintId: project.blueprintId, locationId: project.locationId } });
  }

  private recalculate(project: ConstructionProjectState): void {
    const resourceEntries = Object.entries(project.requiredResources);
    const resourceProgress = resourceEntries.length === 0 ? 1 : resourceEntries.reduce((sum, [commodityId, required]) => sum + clamp((project.deliveredResources[commodityId] ?? 0) / Math.max(1, required), 0, 1), 0) / resourceEntries.length;
    const laborProgress = clamp(project.laborCompleted / Math.max(1, project.laborRequired), 0, 1);
    project.progress = resourceProgress * 0.4 + laborProgress * 0.6;
  }

  private hasAllResources(project: ConstructionProjectState): boolean {
    return Object.entries(project.requiredResources).every(([commodityId, required]) => (project.deliveredResources[commodityId] ?? 0) >= required);
  }

  private isOwnedTarget(project: ConstructionProjectState): boolean {
    return this.state.construction.ownedSpaces.some((space) => space.ownerId === project.ownerId && (space.targetId === project.locationId || space.targetId === project.targetId));
  }

  private failure(message: string): CommandResult {
    return { ok: false, message, eventIds: [] };
  }
}
