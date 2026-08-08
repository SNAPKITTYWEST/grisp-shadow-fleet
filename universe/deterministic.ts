import type { EulerRotation, Vector3 } from './types.js';

const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed: number | string): number {
  const normalized = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export class DeterministicRandom {
  private value: number;

  constructor(seed: number | string) {
    this.value = normalizeSeed(seed);
  }

  get state(): number {
    return this.value >>> 0;
  }

  set state(value: number) {
    this.value = normalizeSeed(value);
  }

  next(): number {
    let value = (this.value += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    this.value = this.value >>> 0;
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
  }

  int(minInclusive: number, maxInclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive) || maxInclusive < minInclusive) {
      throw new RangeError('Invalid deterministic integer range');
    }
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  float(minInclusive: number, maxExclusive: number): number {
    if (!Number.isFinite(minInclusive) || !Number.isFinite(maxExclusive) || maxExclusive < minInclusive) {
      throw new RangeError('Invalid deterministic float range');
    }
    return minInclusive + this.next() * (maxExclusive - minInclusive);
  }

  bool(probability = 0.5): boolean {
    if (probability < 0 || probability > 1) throw new RangeError('Probability must be between zero and one');
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new RangeError('Cannot choose from an empty collection');
    return values[this.int(0, values.length - 1)] as T;
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = this.int(0, index);
      [result[index], result[other]] = [result[other] as T, result[index] as T];
    }
    return result;
  }
}

export function deterministicId(namespace: string, index: number | string): string {
  return `${namespace}-${String(index).padStart(3, '0')}`;
}

export function vector(x = 0, y = 0, z = 0): Vector3 {
  return { x, y, z };
}

export function rotation(pitch = 0, yaw = 0, roll = 0): EulerRotation {
  return { pitch, yaw, roll };
}

export function addVector(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

export function subtractVector(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

export function scaleVector(value: Vector3, scalar: number): Vector3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

export function magnitude(value: Vector3): number {
  return Math.hypot(value.x, value.y, value.z);
}

export function normalizeVector(value: Vector3): Vector3 {
  const length = magnitude(value);
  return length <= Number.EPSILON ? vector() : scaleVector(value, 1 / length);
}

export function clampMagnitude(value: Vector3, maximum: number): Vector3 {
  const length = magnitude(value);
  return length > maximum && length > 0 ? scaleVector(value, maximum / length) : { ...value };
}

export function distance(left: Vector3, right: Vector3): number {
  return magnitude(subtractVector(left, right));
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const normalize = (entry: unknown): unknown => {
    if (entry === null || typeof entry !== 'object') return entry;
    if (seen.has(entry)) throw new TypeError('Cannot serialize cyclic simulation state');
    seen.add(entry);
    if (Array.isArray(entry)) return entry.map(normalize);
    const record = entry as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) normalized[key] = normalize(record[key]);
    return normalized;
  };
  return JSON.stringify(normalize(value));
}

export function checksum(value: unknown): string {
  return hashString(stableStringify(value)).toString(16).padStart(8, '0');
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
