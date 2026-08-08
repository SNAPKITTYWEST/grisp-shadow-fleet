import type { EntityId, UniverseState, WorldEventState } from './types.js';

export function findRequired<T extends { id: EntityId }>(items: readonly T[], id: EntityId, kind: string): T {
  const value = items.find((item) => item.id === id);
  if (!value) throw new Error(`${kind} '${id}' does not exist`);
  return value;
}

export function emitWorldEvent(
  state: UniverseState,
  type: string,
  sourceId: EntityId,
  targetId: EntityId | null,
  summary: string,
  options: {
    severity?: number;
    persistent?: boolean;
    data?: Record<string, string | number | boolean | null>;
  } = {},
): WorldEventState {
  const event: WorldEventState = {
    id: `event-${state.tick}-${state.events.length + 1}`,
    type,
    tick: state.tick,
    sourceId,
    targetId,
    severity: options.severity ?? 0,
    summary,
    persistent: options.persistent ?? true,
    resolved: false,
    data: options.data ?? {},
  };
  state.events.push(event);
  return event;
}

export function rebuildRoomOccupants(state: UniverseState): void {
  for (const room of state.rooms) room.occupantIds = [];
  for (const npc of state.npcs) {
    state.rooms.find((room) => room.id === npc.currentLocationId)?.occupantIds.push(npc.id);
  }
  const playerRoom = state.rooms.find((room) => room.id === state.player.locationId);
  if (playerRoom && !playerRoom.occupantIds.includes(state.player.id)) playerRoom.occupantIds.push(state.player.id);
}

export function trimHistory<T>(history: T[], maximum: number): void {
  if (history.length > maximum) history.splice(0, history.length - maximum);
}
