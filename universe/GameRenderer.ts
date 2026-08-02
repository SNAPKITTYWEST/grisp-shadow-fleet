import * as THREE from 'three';
import type { AudioSystem } from './AudioSystem.js';
import type { HudSnapshot, UIHUD } from './UIHUD.js';

export type UniverseZone = 'interior' | 'airlock' | 'eva' | 'ship' | 'planet';

export interface RendererInput {
  forward: number;
  right: number;
  ascend: number;
  boost: boolean;
  interact: boolean;
  flightMode: boolean;
  magneticBoots: boolean;
  zone: UniverseZone;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  orientation: { yaw: number; pitch: number; roll: number };
}

export interface RendererBridge {
  onInput?: (input: RendererInput, deltaSeconds: number) => void;
  onInteraction?: (id: string) => boolean | void;
  onZoneChange?: (zone: UniverseZone, previous: UniverseZone) => void;
  getHudSnapshot?: () => HudSnapshot;
}

export interface GameRendererOptions {
  seed?: number;
  hud?: UIHUD;
  audio?: AudioSystem;
  bridge?: RendererBridge;
  pixelRatio?: number;
}

export interface RendererSnapshot {
  running: boolean;
  zone: UniverseZone;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  orientation: { yaw: number; pitch: number; roll: number };
  flightMode: boolean;
  magneticBoots: boolean;
  suited: boolean;
  oxygen: number;
  airlock: {
    pressure: number;
    cycling: boolean;
    cycleDirection: 'depressurize' | 'pressurize';
    cycleElapsed: number;
    cycleDuration: number;
    innerDoorOpen: boolean;
    innerDoorTargetOpen: boolean;
    outerDoorOpen: boolean;
    outerDoorTargetOpen: boolean;
  };
  ship: {
    boarded: boolean;
    docked: boolean;
    planetLanded: boolean;
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    orientation: { yaw: number; pitch: number; roll: number };
    speed: number;
  };
  roomDoors: Array<{ id: string; open: boolean; targetOpen: boolean }>;
  traversal: {
    ladderActive: boolean;
    onUpperGantry: boolean;
    elevatorVelocity: { x: number; y: number; z: number };
    elevator: { positionY: number; targetY: number; moving: boolean; carryingPlayer: boolean } | null;
  };
  world: { rooms: number; npcs: number; agents: number; missions: number; traffic: number; asteroids: number };
}

export interface RendererAuthoritativeState {
  suit?: {
    equipped: boolean;
    sealed: boolean;
    oxygenPercent?: number;
    magneticBoots?: boolean;
  };
  airlock?: {
    pressureKpa: number;
    phase?: string;
    requestedDirection?: 'to-space' | 'to-interior' | null;
    cycleElapsedMs?: number;
    cycleDurationMs?: number;
    innerDoorOpen?: boolean;
    innerDoorTargetOpen?: boolean;
    outerDoorOpen?: boolean;
    outerDoorTargetOpen?: boolean;
  };
  ship?: {
    boarded?: boolean;
    docked?: boolean;
    planetLanded?: boolean;
    flightMode?: string;
    position?: { x: number; y: number; z: number };
    velocity?: { x: number; y: number; z: number };
    orientation?: { yaw: number; pitch: number; roll: number };
  };
}

export interface RendererDiagnostics extends RendererSnapshot {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  objects: number;
  pixelRatio: number;
}

interface DoorState {
  id: string;
  left: THREE.Mesh;
  right: THREE.Mesh;
  axis: 'x' | 'z';
  closedLeft: number;
  closedRight: number;
  travel: number;
  open: boolean;
  targetOpen: boolean;
}

interface WorldInteraction {
  id: string;
  label: () => string;
  position: THREE.Vector3;
  radius: number;
  action: () => void;
}

interface CitizenVisual {
  group: THREE.Group;
  base: THREE.Vector3;
  phase: number;
  route: number;
}

interface TrafficVisual {
  group: THREE.Group;
  center: THREE.Vector3;
  radius: number;
  speed: number;
  phase: number;
  height: number;
}

interface ElevatorVisual {
  car: THREE.Group;
  lowerY: number;
  upperY: number;
  targetY: number;
  moving: boolean;
  carryingPlayer: boolean;
}

class SeededRandom {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  public next(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  public range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}

const COLORS = {
  void: 0x020307,
  nearBlack: 0x070a0f,
  metal: 0x202831,
  lightMetal: 0x66717b,
  glass: 0x071118,
  cyan: 0x62eff4,
  magenta: 0xff2d91,
  gold: 0xf0bd4c,
  white: 0xeef7fb,
  green: 0x6ef3b8,
};

export const RENDERED_ROOM_LAYOUT = [
  { visualId: 'room-1', coreRoomId: 'room-command', coreInteractionId: 'interaction-command', name: 'Crown Command' },
  { visualId: 'room-2', coreRoomId: 'room-navigation', coreInteractionId: 'interaction-navigation', name: 'Celestial Navigation' },
  { visualId: 'room-3', coreRoomId: 'room-research', coreInteractionId: 'interaction-research', name: 'Anomaly Laboratory' },
  { visualId: 'room-4', coreRoomId: 'room-comms', coreInteractionId: 'interaction-comms', name: 'Choir Communications' },
  { visualId: 'room-5', coreRoomId: 'room-medical', coreInteractionId: 'interaction-medical', name: 'Mercy Clinic' },
  { visualId: 'room-6', coreRoomId: 'room-market', coreInteractionId: 'interaction-market', name: 'Aurora Exchange' },
  { visualId: 'room-7', coreRoomId: 'room-server', coreInteractionId: 'interaction-server', name: 'Black Glass Archive' },
  { visualId: 'room-8', coreRoomId: 'room-observation', coreInteractionId: 'interaction-observation', name: 'Far Window' },
  { visualId: 'room-9', coreRoomId: 'room-engineering', coreInteractionId: 'interaction-engineering', name: 'Engineering Nave' },
  { visualId: 'room-10', coreRoomId: 'room-security', coreInteractionId: 'interaction-security', name: 'Custodian Watch' },
  { visualId: 'room-11', coreRoomId: 'room-quarters-b', coreInteractionId: 'interaction-quarters-b', name: 'West Habitation' },
  { visualId: 'room-12', coreRoomId: 'room-hydroponics', coreInteractionId: 'interaction-hydroponics', name: 'Starlight Hydroponics' },
  { visualId: 'room-13', coreRoomId: 'room-arrivals', coreInteractionId: 'interaction-arrivals', name: 'Pilgrim Arrivals' },
  { visualId: 'room-14', coreRoomId: 'room-life-support', coreInteractionId: 'interaction-life-support', name: 'Atmospheric Garden' },
  { visualId: 'room-15', coreRoomId: 'room-cargo', coreInteractionId: 'interaction-cargo', name: 'Cargo Basilica' },
  { visualId: 'room-16', coreRoomId: 'room-quarantine', coreInteractionId: 'interaction-quarantine', name: 'Quarantine Chapel' },
  { visualId: 'room-17', coreRoomId: 'room-docking', coreInteractionId: 'interaction-docking', name: 'Docking Concourse' },
  { visualId: 'room-18', coreRoomId: 'room-fabrication', coreInteractionId: 'interaction-fabrication', name: 'Matter Foundry' },
  { visualId: 'room-19', coreRoomId: 'room-operations', coreInteractionId: 'interaction-operations', name: 'Orbital Operations' },
  { visualId: 'room-20', coreRoomId: 'room-tactical', coreInteractionId: 'interaction-tactical', name: 'Shield Reliquary' },
] as const;

const UP = new THREE.Vector3(0, 1, 0);

/** Full-scene first-person renderer. The simulation bridge remains headless and authoritative. */
export class GameRenderer {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(67, 1, 0.05, 24000);
  public readonly canvas: HTMLCanvasElement;

  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock(false);
  private readonly random: SeededRandom;
  private readonly hud?: UIHUD;
  private readonly audio?: AudioSystem;
  private readonly bridge?: RendererBridge;
  private readonly station = new THREE.Group();
  private readonly orbitalWorld = new THREE.Group();
  private readonly planetaryWorld = new THREE.Group();
  private readonly ship = new THREE.Group();
  private readonly shipVelocity = new THREE.Vector3();
  private readonly playerPosition = new THREE.Vector3(0, 1.72, 23);
  private readonly velocity = new THREE.Vector3();
  private readonly keys = new Set<string>();
  private readonly doors: DoorState[] = [];
  private readonly interactions: WorldInteraction[] = [];
  private readonly citizens: CitizenVisual[] = [];
  private readonly agents: THREE.Group[] = [];
  private readonly traffic: TrafficVisual[] = [];
  private readonly lifeforms: THREE.Group[] = [];
  private readonly animatedGlyphs: THREE.Mesh[] = [];
  private readonly cleanup: Array<() => void> = [];
  private readonly materials: Record<string, THREE.Material>;
  private animationFrame = 0;
  private running = false;
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private currentInteraction: WorldInteraction | null = null;
  private interactionLatch = false;
  private zone: UniverseZone = 'interior';
  private flightMode = false;
  private boarded = false;
  private docked = true;
  private magneticBoots = false;
  private suited = false;
  private oxygen = 0;
  private airlockPressure = 101.3;
  private airlockCycling = false;
  private airlockCycleDirection: 'depressurize' | 'pressurize' = 'depressurize';
  private airlockCycleElapsed = 0;
  private airlockCycleDuration = 4;
  private innerAirlock: DoorState | null = null;
  private outerAirlock: DoorState | null = null;
  private elapsed = 0;
  private frameSamples = 0;
  private frameSampleTime = 0;
  private fps = 60;
  private frameMs = 16.7;
  private footstepTimer = 0;
  private notification = '';
  private notificationUntil = 0;
  private planetLanded = false;
  private ladderActive = false;
  private onUpperGantry = false;
  private elevator: ElevatorVisual | null = null;
  private elevatorVelocity = new THREE.Vector3();
  private weatherParticles: THREE.Points | null = null;
  private cloudLayer: THREE.Group | null = null;
  private readonly landingCenter = new THREE.Vector3(1700, -143, -4700);
  private readonly dockPosition = new THREE.Vector3(24, 2.1, -151);

  public constructor(host: HTMLElement, options: GameRendererOptions = {}) {
    this.host = host;
    this.random = new SeededRandom(options.seed ?? 0x51a770);
    this.hud = options.hud;
    this.audio = options.audio;
    this.bridge = options.bridge;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'universe-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'SnapKitty Universe playable viewport');
    this.canvas.setAttribute('role', 'application');
    this.renderer.setClearColor(COLORS.void, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(options.pixelRatio ?? window.devicePixelRatio ?? 1, 2));
    this.host.replaceChildren(this.canvas);

    this.materials = this.createMaterials();
    this.scene.fog = new THREE.FogExp2(COLORS.void, 0.000045);
    this.scene.add(this.station, this.orbitalWorld, this.planetaryWorld, this.ship);
    this.buildLighting();
    this.buildPlayableUniverse();
    this.bindControls();
    this.resize();
    this.updateCamera();
    this.renderOnce();
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  public stop(): void {
    if (!this.running) return;
    this.running = false;
    window.cancelAnimationFrame(this.animationFrame);
    this.clock.stop();
  }

  public renderOnce(): void {
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  }

  public requestPointerLock(): void {
    if (document.pointerLockElement !== this.canvas && this.canvas.requestPointerLock) {
      void this.canvas.requestPointerLock();
    }
  }

  public unlockPointer(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  public resize(): void {
    const width = Math.max(1, this.host.clientWidth || window.innerWidth);
    const height = Math.max(1, this.host.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  public interact(): string | null {
    this.findInteraction();
    const interaction = this.currentInteraction;
    if (!interaction) {
      this.notify('No reachable system in focus', 'warning');
      return null;
    }
    const accepted = this.bridge?.onInteraction?.(interaction.id);
    if (accepted === false) {
      this.notify('Authoritative simulation rejected that action', 'warning');
      this.audio?.playCue('deny');
      return null;
    }
    interaction.action();
    this.audio?.playCue('terminal');
    return interaction.id;
  }

  public teleport(target: UniverseZone | 'airlock-interior' | 'hull' | 'ship-dock' | 'landing', position?: Partial<THREE.Vector3>): RendererSnapshot {
    if (target === 'interior') this.playerPosition.set(0, 1.72, 23);
    else if (target === 'airlock' || target === 'airlock-interior') this.playerPosition.set(0, 1.72, -109);
    else if (target === 'eva' || target === 'hull') this.playerPosition.set(0, 1.72, -128);
    else if (target === 'ship-dock') this.playerPosition.set(20, 1.72, -151);
    else if (target === 'ship') {
      if (!this.boarded) this.boardShip();
      this.playerPosition.copy(this.ship.position);
    } else if (target === 'planet' || target === 'landing') {
      this.playerPosition.copy(this.landingCenter).add(new THREE.Vector3(0, 1.72, 18));
      this.setZone('planet');
      this.flightMode = false;
      this.boarded = false;
      this.planetLanded = true;
    }
    if (position) {
      if (typeof position.x === 'number') this.playerPosition.x = position.x;
      if (typeof position.y === 'number') this.playerPosition.y = position.y;
      if (typeof position.z === 'number') this.playerPosition.z = position.z;
    }
    if (target === 'interior') this.setZone('interior');
    else if (target === 'airlock' || target === 'airlock-interior') this.setZone('airlock');
    else if (target === 'eva' || target === 'hull' || target === 'ship-dock') this.setZone('eva');
    this.velocity.set(0, 0, 0);
    this.updateCamera();
    this.renderOnce();
    return this.getSnapshot();
  }

  public boardShip(): boolean {
    if (this.boarded) return true;
    if (this.playerPosition.distanceTo(this.ship.position) > 18 && this.zone !== 'ship') {
      this.notify('Move closer to the docked courier', 'warning');
      return false;
    }
    this.boarded = true;
    this.flightMode = true;
    this.docked = this.ship.position.distanceTo(this.dockPosition) < 4;
    this.playerPosition.copy(this.ship.position);
    this.velocity.set(0, 0, 0);
    this.setZone('ship');
    this.audio?.playCue('confirm');
    this.notify('Courier command accepted · flight controls online', 'success');
    return true;
  }

  public leaveShip(): boolean {
    if (!this.boarded) return true;
    if (!this.docked && !this.planetLanded) {
      this.notify('Dock or land before leaving the flight deck', 'warning');
      return false;
    }
    this.boarded = false;
    this.flightMode = false;
    this.shipVelocity.set(0, 0, 0);
    if (this.planetLanded) {
      this.playerPosition.copy(this.landingCenter).add(new THREE.Vector3(4, 1.72, 12));
      this.setZone('planet');
    } else {
      this.playerPosition.copy(this.ship.position).add(new THREE.Vector3(-7, -0.38, 0));
      this.setZone('eva');
    }
    this.notify('Egress complete', 'success');
    return true;
  }

  public setFlightMode(enabled: boolean): void {
    if (enabled && !this.boarded) {
      if (this.zone === 'eva') {
        this.magneticBoots = false;
        this.flightMode = true;
      } else {
        this.notify('Flight controls require EVA or a pilot seat', 'warning');
      }
      return;
    }
    this.flightMode = enabled;
  }

  public setMagneticBoots(enabled: boolean): void {
    if (enabled && !this.suited) {
      this.notify('Equip and seal an EVA suit first', 'warning');
      this.audio?.playCue('deny');
      return;
    }
    this.magneticBoots = enabled;
    if (enabled && this.zone === 'eva' && this.isAboveHull()) {
      this.playerPosition.y = 1.72;
      this.velocity.y = 0;
    }
    this.notify(`Magnetic boots ${enabled ? 'engaged' : 'released'}`, 'info');
  }

  public getSnapshot(): RendererSnapshot {
    return {
      running: this.running,
      zone: this.zone,
      position: this.vectorRecord(this.playerPosition),
      velocity: this.vectorRecord(this.boarded ? this.shipVelocity : this.velocity),
      orientation: { yaw: this.yaw, pitch: this.pitch, roll: this.roll },
      flightMode: this.flightMode,
      magneticBoots: this.magneticBoots,
      suited: this.suited,
      oxygen: this.oxygen,
      airlock: {
        pressure: this.airlockPressure,
        cycling: this.airlockCycling,
        cycleDirection: this.airlockCycleDirection,
        cycleElapsed: this.airlockCycleElapsed,
        cycleDuration: this.airlockCycleDuration,
        innerDoorOpen: this.innerAirlock?.open ?? false,
        innerDoorTargetOpen: this.innerAirlock?.targetOpen ?? false,
        outerDoorOpen: this.outerAirlock?.open ?? false,
        outerDoorTargetOpen: this.outerAirlock?.targetOpen ?? false,
      },
      ship: {
        boarded: this.boarded,
        docked: this.docked,
        planetLanded: this.planetLanded,
        position: this.vectorRecord(this.ship.position),
        velocity: this.vectorRecord(this.shipVelocity),
        orientation: { yaw: this.ship.rotation.y, pitch: this.ship.rotation.x, roll: this.ship.rotation.z },
        speed: this.shipVelocity.length(),
      },
      roomDoors: this.doors.filter((door) => door.id.startsWith('room-')).map((door) => ({ id: door.id, open: door.open, targetOpen: door.targetOpen })),
      traversal: {
        ladderActive: this.ladderActive,
        onUpperGantry: this.onUpperGantry,
        elevatorVelocity: this.vectorRecord(this.elevatorVelocity),
        elevator: this.elevator ? {
          positionY: this.elevator.car.position.y,
          targetY: this.elevator.targetY,
          moving: this.elevator.moving,
          carryingPlayer: this.elevator.carryingPlayer,
        } : null,
      },
      world: { rooms: 20, npcs: this.citizens.length, agents: this.agents.length, missions: 10, traffic: this.traffic.length, asteroids: 96 },
    };
  }

  public getDiagnostics(): RendererDiagnostics {
    let objects = 0;
    this.scene.traverse(() => { objects += 1; });
    return {
      ...this.getSnapshot(),
      fps: this.fps,
      frameMs: this.frameMs,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      objects,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }

  public applySnapshot(snapshot: Partial<RendererSnapshot>): void {
    if (snapshot.position) this.applyFiniteVector(this.playerPosition, snapshot.position);
    if (snapshot.velocity) this.applyFiniteVector(this.velocity, snapshot.velocity);
    if (snapshot.orientation) {
      this.yaw = this.finite(snapshot.orientation.yaw, this.yaw);
      this.pitch = THREE.MathUtils.clamp(this.finite(snapshot.orientation.pitch, this.pitch), -Math.PI * 0.5, Math.PI * 0.5);
      this.roll = THREE.MathUtils.clamp(this.finite(snapshot.orientation.roll, this.roll), -Math.PI, Math.PI);
    }
    if (snapshot.zone && this.isUniverseZone(snapshot.zone)) this.setZone(snapshot.zone);
    if (typeof snapshot.flightMode === 'boolean') this.flightMode = snapshot.flightMode;
    if (typeof snapshot.magneticBoots === 'boolean') this.magneticBoots = snapshot.magneticBoots;
    if (typeof snapshot.suited === 'boolean') this.suited = snapshot.suited;
    this.oxygen = THREE.MathUtils.clamp(this.finite(snapshot.oxygen, this.oxygen), 0, 100);
    if (snapshot.airlock) {
      this.airlockPressure = THREE.MathUtils.clamp(this.finite(snapshot.airlock.pressure, this.airlockPressure), 0, 110);
      if (typeof snapshot.airlock.cycling === 'boolean') this.airlockCycling = snapshot.airlock.cycling;
      if (snapshot.airlock.cycleDirection === 'depressurize' || snapshot.airlock.cycleDirection === 'pressurize') this.airlockCycleDirection = snapshot.airlock.cycleDirection;
      this.airlockCycleDuration = THREE.MathUtils.clamp(this.finite(snapshot.airlock.cycleDuration, this.airlockCycleDuration), 0.1, 30);
      this.airlockCycleElapsed = THREE.MathUtils.clamp(this.finite(snapshot.airlock.cycleElapsed, this.airlockCycleElapsed), 0, this.airlockCycleDuration + 0.5);
      if (this.innerAirlock) this.applyDoorSnapshot(this.innerAirlock, snapshot.airlock.innerDoorOpen, snapshot.airlock.innerDoorTargetOpen, true);
      if (this.outerAirlock) this.applyDoorSnapshot(this.outerAirlock, snapshot.airlock.outerDoorOpen, snapshot.airlock.outerDoorTargetOpen, true);
    }
    if (snapshot.ship) {
      if (snapshot.ship.position) this.applyFiniteVector(this.ship.position, snapshot.ship.position);
      if (snapshot.ship.velocity) this.applyFiniteVector(this.shipVelocity, snapshot.ship.velocity);
      if (snapshot.ship.orientation) {
        this.ship.rotation.set(
          THREE.MathUtils.clamp(this.finite(snapshot.ship.orientation.pitch, this.ship.rotation.x), -Math.PI, Math.PI),
          this.finite(snapshot.ship.orientation.yaw, this.ship.rotation.y),
          THREE.MathUtils.clamp(this.finite(snapshot.ship.orientation.roll, this.ship.rotation.z), -Math.PI, Math.PI),
          'YXZ',
        );
      }
      if (typeof snapshot.ship.boarded === 'boolean') this.boarded = snapshot.ship.boarded;
      if (typeof snapshot.ship.docked === 'boolean') this.docked = snapshot.ship.docked;
      if (typeof snapshot.ship.planetLanded === 'boolean') this.planetLanded = snapshot.ship.planetLanded;
      if (this.boarded) this.playerPosition.copy(this.ship.position);
    }
    if (Array.isArray(snapshot.roomDoors)) {
      for (const savedDoor of snapshot.roomDoors) {
        if (!savedDoor || typeof savedDoor.id !== 'string') continue;
        const door = this.doors.find((candidate) => candidate.id === savedDoor.id && candidate.id.startsWith('room-'));
        if (door) this.applyDoorSnapshot(door, savedDoor.open, savedDoor.targetOpen, true);
      }
    }
    if (snapshot.traversal) {
      if (typeof snapshot.traversal.ladderActive === 'boolean') this.ladderActive = snapshot.traversal.ladderActive;
      if (typeof snapshot.traversal.onUpperGantry === 'boolean') this.onUpperGantry = snapshot.traversal.onUpperGantry;
      if (snapshot.traversal.elevatorVelocity) this.applyFiniteVector(this.elevatorVelocity, snapshot.traversal.elevatorVelocity);
      const savedElevator = snapshot.traversal.elevator;
      if (this.elevator && savedElevator) {
        this.elevator.car.position.y = THREE.MathUtils.clamp(this.finite(savedElevator.positionY, this.elevator.car.position.y), this.elevator.lowerY, this.elevator.upperY);
        this.elevator.targetY = THREE.MathUtils.clamp(this.finite(savedElevator.targetY, this.elevator.targetY), this.elevator.lowerY, this.elevator.upperY);
        if (typeof savedElevator.moving === 'boolean') this.elevator.moving = savedElevator.moving;
        if (typeof savedElevator.carryingPlayer === 'boolean') this.elevator.carryingPlayer = savedElevator.carryingPlayer;
      }
    }
    this.updateCamera();
    this.renderOnce();
  }

  public applyAuthoritativeState(state: RendererAuthoritativeState): void {
    if (state.suit) {
      this.suited = state.suit.equipped && state.suit.sealed;
      if (!this.suited) this.magneticBoots = false;
      else if (typeof state.suit.magneticBoots === 'boolean') this.magneticBoots = state.suit.magneticBoots;
      this.oxygen = THREE.MathUtils.clamp(this.finite(state.suit.oxygenPercent, this.oxygen), 0, 100);
    }
    if (state.airlock) {
      const airlock = state.airlock;
      this.airlockPressure = THREE.MathUtils.clamp(this.finite(airlock.pressureKpa, this.airlockPressure), 0, 110);
      this.airlockCycleDuration = THREE.MathUtils.clamp(this.finite(airlock.cycleDurationMs, this.airlockCycleDuration * 1000) / 1000, 0.1, 30);
      const phase = airlock.phase;
      if (typeof phase === 'string') this.airlockCycling = phase === 'sealing' || phase === 'depressurizing' || phase === 'pressurizing';
      if (phase === 'pressurizing' || airlock.requestedDirection === 'to-interior') this.airlockCycleDirection = 'pressurize';
      else if (phase === 'depressurizing' || airlock.requestedDirection === 'to-space') this.airlockCycleDirection = 'depressurize';
      if (typeof airlock.cycleElapsedMs === 'number' && Number.isFinite(airlock.cycleElapsedMs)) {
        const authoritativeElapsed = Math.max(0, airlock.cycleElapsedMs / 1000);
        this.airlockCycleElapsed = THREE.MathUtils.clamp(phase === 'sealing' ? authoritativeElapsed : this.airlockCycling ? 0.5 + authoritativeElapsed : 0, 0, this.airlockCycleDuration + 0.5);
      }
      if (this.innerAirlock) this.applyDoorSnapshot(this.innerAirlock, airlock.innerDoorOpen, airlock.innerDoorTargetOpen ?? airlock.innerDoorOpen, true);
      if (this.outerAirlock) this.applyDoorSnapshot(this.outerAirlock, airlock.outerDoorOpen, airlock.outerDoorTargetOpen ?? airlock.outerDoorOpen, true);
    }
    if (state.ship) {
      const ship = state.ship;
      if (ship.position) this.applyFiniteVector(this.ship.position, ship.position);
      if (ship.velocity) this.applyFiniteVector(this.shipVelocity, ship.velocity);
      if (ship.orientation) {
        this.ship.rotation.set(
          THREE.MathUtils.clamp(this.finite(ship.orientation.pitch, this.ship.rotation.x), -Math.PI, Math.PI),
          this.finite(ship.orientation.yaw, this.ship.rotation.y),
          THREE.MathUtils.clamp(this.finite(ship.orientation.roll, this.ship.rotation.z), -Math.PI, Math.PI),
          'YXZ',
        );
      }
      if (typeof ship.boarded === 'boolean') this.boarded = ship.boarded;
      if (typeof ship.docked === 'boolean') this.docked = ship.docked;
      else if (ship.flightMode) this.docked = ship.flightMode === 'docked';
      if (typeof ship.planetLanded === 'boolean') this.planetLanded = ship.planetLanded;
      else if (ship.flightMode) this.planetLanded = ship.flightMode === 'landed';
      if (this.boarded) {
        this.playerPosition.copy(this.ship.position);
        this.setZone('ship');
      }
    }
    this.updateCamera();
  }

  public dispose(): void {
    this.stop();
    this.unlockPointer();
    for (const remove of this.cleanup) remove();
    this.cleanup.length = 0;
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const map = (material as THREE.MeshStandardMaterial).map;
        map?.dispose();
        material.dispose();
      }
    });
    this.renderer.dispose();
    this.canvas.remove();
  }

  private readonly animate = (): void => {
    if (!this.running) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;
    this.frameSampleTime += delta;
    this.frameSamples += 1;
    if (this.frameSampleTime >= 0.5) {
      this.fps = this.frameSamples / this.frameSampleTime;
      this.frameMs = 1000 / Math.max(1, this.fps);
      this.frameSamples = 0;
      this.frameSampleTime = 0;
    }
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(this.animate);
  };

  private update(delta: number): void {
    const input = this.readInput();
    if (this.boarded) this.updateShip(delta, input);
    else this.updatePlayer(delta, input);
    this.updateAirlock(delta);
    this.updateElevator(delta);
    this.updateDoors(delta);
    this.updateCitizens(delta);
    this.updateTraffic();
    this.updateWorldAnimation(delta);
    this.updatePlanetWeather(delta);
    this.updateZoneTransitions();
    this.findInteraction();
    this.updateCamera();
    this.updateHud();
    this.bridge?.onInput?.(this.inputSnapshot(input), delta);
  }

  private readInput(): { forward: number; right: number; ascend: number; boost: boolean; interact: boolean } {
    const mobile = this.hud?.getMobileInput();
    const forward = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) + (mobile?.forward ?? 0);
    const right = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) + (mobile?.right ?? 0);
    const ascend = (this.keys.has('Space') ? 1 : 0) - (this.keys.has('KeyC') || this.keys.has('ControlLeft') ? 1 : 0) + (mobile?.ascend ?? 0);
    const interact = this.keys.has('KeyE');
    if (interact && !this.interactionLatch) this.interact();
    this.interactionLatch = interact;
    const look = this.hud?.consumeLookDelta();
    if (look && (look.x !== 0 || look.y !== 0)) this.applyLookDelta(look.x, look.y, 0.0042);
    return {
      forward: THREE.MathUtils.clamp(forward, -1, 1),
      right: THREE.MathUtils.clamp(right, -1, 1),
      ascend: THREE.MathUtils.clamp(ascend, -1, 1),
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Boolean(mobile?.boost),
      interact,
    };
  }

  private updatePlayer(delta: number, input: ReturnType<GameRenderer['readInput']>): void {
    if (this.elevator?.moving && this.elevator.carryingPlayer) {
      this.velocity.set(0, 0, 0);
      return;
    }
    if (this.ladderActive) {
      const climb = THREE.MathUtils.clamp(input.forward + Math.max(0, input.ascend), -1, 1);
      this.velocity.set(0, climb * 2.3, 0);
      this.playerPosition.set(-4.55, THREE.MathUtils.clamp(this.playerPosition.y + this.velocity.y * delta, 1.25, 5.72), 4.5);
      if (this.playerPosition.y >= 5.68 && climb > 0) {
        this.ladderActive = false;
        this.onUpperGantry = true;
        this.playerPosition.set(-3.8, 5.72, 4.5);
        this.notify('Observation gantry reached', 'success');
      } else if (this.playerPosition.y <= 1.3 && climb < 0) {
        this.ladderActive = false;
        this.onUpperGantry = false;
        this.playerPosition.set(-4.1, 1.72, 4.5);
      }
      return;
    }
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, this.yaw);
    const moving = Math.abs(input.forward) + Math.abs(input.right) + Math.abs(input.ascend) > 0.01;
    if (this.zone === 'eva' && (!this.magneticBoots || this.flightMode)) {
      const viewForward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      const acceleration = (input.boost ? 13 : 7) * delta;
      this.velocity.addScaledVector(viewForward, input.forward * acceleration);
      this.velocity.addScaledVector(right, input.right * acceleration);
      this.velocity.addScaledVector(UP, input.ascend * acceleration);
      this.velocity.multiplyScalar(Math.pow(0.992, delta * 60));
      this.velocity.clampLength(0, input.boost ? 28 : 12);
    } else {
      const crouching = this.zone === 'interior' && (this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.keys.has('ControlRight'));
      const speed = crouching ? 1.65 : this.zone === 'planet' ? (input.boost ? 9 : 4.6) : (input.boost ? 8.5 : 4.2);
      const target = forward.multiplyScalar(input.forward * speed).add(right.multiplyScalar(input.right * speed));
      this.velocity.lerp(target, 1 - Math.exp(-delta * 12));
      this.velocity.y = 0;
    }
    this.playerPosition.addScaledVector(this.velocity, delta);
    this.constrainPlayer();
    if (moving && !(this.zone === 'eva' && !this.magneticBoots)) {
      this.footstepTimer -= delta;
      if (this.footstepTimer <= 0) {
        this.audio?.playCue('footstep', input.boost ? 1.2 : 0.7);
        this.footstepTimer = input.boost ? 0.31 : 0.48;
      }
    }
    if (this.zone === 'eva') this.oxygen = Math.max(0, this.oxygen - delta * 0.018);
    else this.oxygen = Math.min(100, this.oxygen + delta * 0.08);
  }

  private updateShip(delta: number, input: ReturnType<GameRenderer['readInput']>): void {
    if (this.docked && (Math.abs(input.forward) > 0.05 || Math.abs(input.ascend) > 0.05)) {
      this.docked = false;
      this.planetLanded = false;
      this.notify('Docking clamps released', 'info');
      this.audio?.playCue('dock');
    }
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, this.roll, 'YXZ'));
    const thrust = input.boost ? 150 : 72;
    this.shipVelocity.addScaledVector(forward, input.forward * thrust * delta);
    this.shipVelocity.addScaledVector(right, input.right * thrust * 0.55 * delta);
    this.shipVelocity.addScaledVector(UP, input.ascend * thrust * 0.55 * delta);
    this.shipVelocity.multiplyScalar(Math.pow(0.997, delta * 60));
    this.shipVelocity.clampLength(0, input.boost ? 440 : 180);
    if (this.docked || this.planetLanded) this.shipVelocity.set(0, 0, 0);
    this.ship.position.addScaledVector(this.shipVelocity, delta);
    this.ship.rotation.set(this.pitch * 0.35, this.yaw, -input.right * 0.12, 'YXZ');
    this.roll = THREE.MathUtils.lerp(this.roll, -input.right * 0.12, 1 - Math.exp(-delta * 5));
    this.playerPosition.copy(this.ship.position);
    if (input.forward !== 0 || input.ascend !== 0) this.audio?.playCue('engine', Math.min(1, Math.abs(input.forward) + Math.abs(input.ascend)));
    this.checkShipDestinations();
  }

  private checkShipDestinations(): void {
    const dockDistance = this.ship.position.distanceTo(this.dockPosition);
    if (!this.docked && dockDistance < 9 && this.shipVelocity.length() < 12) {
      this.currentInteraction = {
        id: 'dock-courier', label: () => 'Dock courier with Station Vesper', position: this.ship.position.clone(), radius: 100,
        action: () => this.dockShip(),
      };
    }
    const planetDistance = this.ship.position.distanceTo(this.landingCenter.clone().add(new THREE.Vector3(0, 70, 0)));
    if (planetDistance < 190 && this.shipVelocity.length() < 36 && this.ship.position.y < this.landingCenter.y + 120) {
      this.currentInteraction = {
        id: 'land-nyx', label: () => 'Commit landing at Nyx Basin', position: this.ship.position.clone(), radius: 100,
        action: () => this.landShip(),
      };
    }
  }

  private dockShip(): void {
    this.ship.position.copy(this.dockPosition);
    this.shipVelocity.set(0, 0, 0);
    this.docked = true;
    this.planetLanded = false;
    this.audio?.playCue('dock');
    this.notify('Docking solution locked · umbilical connected', 'success');
  }

  private landShip(): void {
    this.ship.position.copy(this.landingCenter).add(new THREE.Vector3(-13, 3.2, 8));
    this.ship.rotation.set(0, Math.PI * 0.58, 0);
    this.shipVelocity.set(0, 0, 0);
    this.docked = false;
    this.planetLanded = true;
    this.audio?.playCue('dock');
    this.notify('Landed · Nyx Basin sovereign survey region', 'success');
  }

  private constrainPlayer(): void {
    if (this.zone === 'interior') {
      if (this.onUpperGantry) {
        this.playerPosition.x = THREE.MathUtils.clamp(this.playerPosition.x, -5.2, -2.1);
        this.playerPosition.z = THREE.MathUtils.clamp(this.playerPosition.z, -18, 13);
        this.playerPosition.y = 5.72;
        return;
      }
      const nearestDoor = Math.round((18 - this.playerPosition.z) / 11);
      const doorZ = 18 - nearestDoor * 11;
      const besideRoom = nearestDoor >= 0 && nearestDoor < 10 && Math.abs(this.playerPosition.z - doorZ) < 4.1;
      this.playerPosition.x = THREE.MathUtils.clamp(this.playerPosition.x, besideRoom ? -17.2 : -5.25, besideRoom ? 17.2 : 5.25);
      this.playerPosition.z = THREE.MathUtils.clamp(this.playerPosition.z, -103, 27);
      const crouching = this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.keys.has('ControlRight');
      this.playerPosition.y = crouching ? 1.16 : 1.72;
    } else if (this.zone === 'airlock') {
      this.playerPosition.x = THREE.MathUtils.clamp(this.playerPosition.x, -4.2, 4.2);
      this.playerPosition.z = THREE.MathUtils.clamp(this.playerPosition.z, -120.5, -100.5);
      this.playerPosition.y = 1.72;
    } else if (this.zone === 'eva' && this.magneticBoots && this.isAboveHull()) {
      this.playerPosition.y = 1.72;
      this.playerPosition.x = THREE.MathUtils.clamp(this.playerPosition.x, -45, 45);
      this.playerPosition.z = THREE.MathUtils.clamp(this.playerPosition.z, -191, -118);
    } else if (this.zone === 'planet') {
      const dx = this.playerPosition.x - this.landingCenter.x;
      const dz = this.playerPosition.z - this.landingCenter.z;
      const terrainHeight = Math.sin(dx * 0.035) * 1.2 + Math.cos(dz * 0.028) * 0.8;
      this.playerPosition.y = this.landingCenter.y + 1.72 + terrainHeight;
      this.playerPosition.x = THREE.MathUtils.clamp(this.playerPosition.x, this.landingCenter.x - 140, this.landingCenter.x + 140);
      this.playerPosition.z = THREE.MathUtils.clamp(this.playerPosition.z, this.landingCenter.z - 140, this.landingCenter.z + 140);
    }
  }

  private updateAirlock(delta: number): void {
    if (!this.airlockCycling) return;
    this.airlockCycleElapsed += delta;
    if (this.airlockCycleElapsed < 0.5) {
      if (this.innerAirlock) this.innerAirlock.targetOpen = false;
      if (this.outerAirlock) this.outerAirlock.targetOpen = false;
      return;
    }
    const progress = THREE.MathUtils.clamp((this.airlockCycleElapsed - 0.5) / this.airlockCycleDuration, 0, 1);
    this.airlockPressure = this.airlockCycleDirection === 'depressurize' ? 101 * (1 - progress) : 101 * progress;
    if (progress < 1) return;
    this.airlockCycling = false;
    if (this.airlockCycleDirection === 'depressurize') {
      if (this.outerAirlock) this.outerAirlock.targetOpen = true;
      this.notify('Airlock vacuum achieved · exterior seal released', 'success');
    } else {
      if (this.innerAirlock) this.innerAirlock.targetOpen = true;
      this.notify('Atmosphere restored · interior seal released', 'success');
    }
    this.audio?.playCue('airlock');
  }

  private cycleAirlock(): void {
    if (this.airlockCycling) {
      this.notify('Pressure cycle already active', 'warning');
      return;
    }
    if (!this.suited && this.airlockPressure > 5) {
      this.notify('EVA suit seal required', 'warning');
      this.audio?.playCue('deny');
      return;
    }
    this.airlockCycleDirection = this.airlockPressure > 50 ? 'depressurize' : 'pressurize';
    this.airlockCycleElapsed = 0;
    this.airlockCycling = true;
    this.audio?.playCue('alarm', 0.45);
    this.notify(`${this.airlockCycleDirection === 'depressurize' ? 'Depressurizing' : 'Pressurizing'} chamber`, 'info');
  }

  private updateDoors(delta: number): void {
    const rate = 1 - Math.exp(-delta * 7);
    for (const door of this.doors) {
      const leftTarget = door.targetOpen ? door.closedLeft - door.travel : door.closedLeft;
      const rightTarget = door.targetOpen ? door.closedRight + door.travel : door.closedRight;
      if (door.axis === 'x') {
        door.left.position.x = THREE.MathUtils.lerp(door.left.position.x, leftTarget, rate);
        door.right.position.x = THREE.MathUtils.lerp(door.right.position.x, rightTarget, rate);
        door.open = Math.abs(door.left.position.x - leftTarget) < 0.08 && door.targetOpen;
      } else {
        door.left.position.z = THREE.MathUtils.lerp(door.left.position.z, leftTarget, rate);
        door.right.position.z = THREE.MathUtils.lerp(door.right.position.z, rightTarget, rate);
        door.open = Math.abs(door.left.position.z - leftTarget) < 0.08 && door.targetOpen;
      }
    }
  }

  private updateZoneTransitions(): void {
    if (this.boarded) return;
    if (this.zone === 'interior' && this.playerPosition.z <= -101.8 && (this.innerAirlock?.open || this.innerAirlock?.targetOpen)) this.setZone('airlock');
    else if (this.zone === 'airlock' && this.playerPosition.z >= -101.3 && (this.innerAirlock?.open || this.innerAirlock?.targetOpen)) this.setZone('interior');
    else if (this.zone === 'airlock' && this.playerPosition.z <= -119.4 && (this.outerAirlock?.open || this.outerAirlock?.targetOpen)) this.setZone('eva');
    else if (this.zone === 'eva' && this.playerPosition.z >= -119.2 && Math.abs(this.playerPosition.x) < 4.5 && (this.outerAirlock?.open || this.outerAirlock?.targetOpen)) this.setZone('airlock');
  }

  private setZone(next: UniverseZone): void {
    if (next === this.zone) return;
    const previous = this.zone;
    this.zone = next;
    this.audio?.setZone(next === 'ship' ? 'ship' : next === 'planet' ? 'planet' : next === 'eva' ? 'eva' : next === 'airlock' ? 'airlock' : 'interior');
    this.bridge?.onZoneChange?.(next, previous);
    this.notify(`${next.toUpperCase()} environment active`, 'info');
  }

  private findInteraction(): void {
    if (this.boarded) {
      this.checkShipDestinations();
      if (!this.currentInteraction || !['dock-courier', 'land-nyx'].includes(this.currentInteraction.id)) {
        this.currentInteraction = { id: 'ship-flight-computer', label: () => this.docked || this.planetLanded ? 'Leave pilot seat' : 'Flight computer · B to leave after docking', position: this.ship.position.clone(), radius: 100, action: () => { if (this.docked || this.planetLanded) this.leaveShip(); } };
      }
      return;
    }
    let best: WorldInteraction | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    for (const interaction of this.interactions) {
      const offset = interaction.position.clone().sub(this.playerPosition);
      const distance = offset.length();
      if (distance > interaction.radius) continue;
      const alignment = distance < 0.01 ? 1 : direction.dot(offset.normalize());
      if (alignment < -0.15 && distance > 1.5) continue;
      const score = distance * (1.6 - Math.max(0, alignment));
      if (score < bestScore) {
        best = interaction;
        bestScore = score;
      }
    }
    this.currentInteraction = best;
  }

  private updateCamera(): void {
    if (this.boarded) {
      const rotation = new THREE.Euler(this.pitch * 0.55, this.yaw, this.roll, 'YXZ');
      const cockpit = new THREE.Vector3(0, 1.65, -1.5).applyEuler(rotation).add(this.ship.position);
      this.camera.position.copy(cockpit);
      this.camera.rotation.copy(rotation);
      return;
    }
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private inputSnapshot(input: ReturnType<GameRenderer['readInput']>): RendererInput {
    return {
      ...input,
      flightMode: this.flightMode,
      magneticBoots: this.magneticBoots,
      zone: this.zone,
      position: this.vectorRecord(this.playerPosition),
      velocity: this.vectorRecord(this.boarded ? this.shipVelocity : this.velocity),
      orientation: { yaw: this.yaw, pitch: this.pitch, roll: this.roll },
    };
  }

  private updateHud(): void {
    if (!this.hud) return;
    const external = this.bridge?.getHudSnapshot?.() ?? {};
    const labels: Record<UniverseZone, string> = {
      interior: 'Vesper Station · Sovereign Nave',
      airlock: 'Vesper Station · Airlock A-01',
      eva: 'Vesper Station · Exterior Hull',
      ship: 'SKV Meridian · Flight Deck',
      planet: 'Nyx · Meridian Basin',
    };
    const speed = (this.boarded ? this.shipVelocity : this.velocity).length();
    const pressure = this.zone === 'airlock' ? this.airlockPressure : this.zone === 'eva' || this.zone === 'ship' ? 0 : this.zone === 'planet' ? 72 : 101;
    this.hud.update({
      zone: this.zone,
      location: labels[this.zone],
      speed,
      oxygen: this.oxygen,
      pressure,
      integrity: 100,
      flightMode: this.flightMode,
      magneticBoots: this.magneticBoots,
      suited: this.suited,
      alarm: this.airlockCycling,
      contextPrompt: this.currentInteraction?.label() ?? '',
      objective: this.zone === 'interior' ? 'Reach Airlock A-01 and begin an EVA survey' : this.zone === 'airlock' ? 'Cycle chamber pressure and cross the exterior seal' : this.zone === 'eva' ? 'Traverse the hull or board the docked SKV Meridian' : this.zone === 'ship' ? 'Undock, navigate local orbit, and approach Nyx Basin' : 'Survey the landing region and contact the settlement',
      ...external,
    });
  }

  private updateCitizens(delta: number): void {
    for (let index = 0; index < this.citizens.length; index += 1) {
      const citizen = this.citizens[index];
      citizen.phase += delta * (0.22 + citizen.route * 0.025);
      const corridorCitizen = index < 22;
      if (corridorCitizen) {
        citizen.group.position.z = citizen.base.z + Math.sin(citizen.phase) * 4.2;
        citizen.group.position.x = citizen.base.x + Math.sin(citizen.phase * 0.37) * 0.35;
        citizen.group.rotation.y = Math.cos(citizen.phase) > 0 ? 0 : Math.PI;
      } else {
        citizen.group.position.x = citizen.base.x + Math.sin(citizen.phase) * 1.5;
        citizen.group.position.z = citizen.base.z + Math.cos(citizen.phase * 0.71) * 1.1;
        citizen.group.rotation.y += delta * 0.12;
      }
    }
  }

  private updateTraffic(): void {
    for (const craft of this.traffic) {
      const angle = this.elapsed * craft.speed + craft.phase;
      craft.group.position.set(
        craft.center.x + Math.cos(angle) * craft.radius,
        craft.center.y + Math.sin(angle * 0.53) * craft.height,
        craft.center.z + Math.sin(angle) * craft.radius,
      );
      craft.group.rotation.y = -angle + Math.PI * 0.5;
      craft.group.rotation.z = Math.sin(angle * 0.7) * 0.08;
    }
  }

  private updateWorldAnimation(delta: number): void {
    for (let index = 0; index < this.animatedGlyphs.length; index += 1) {
      const glyph = this.animatedGlyphs[index];
      glyph.rotation.z += delta * (index % 2 === 0 ? 0.25 : -0.18);
      const material = glyph.material as THREE.MeshBasicMaterial;
      material.opacity = 0.45 + Math.sin(this.elapsed * 1.7 + index) * 0.22;
    }
    for (let index = 0; index < this.agents.length; index += 1) {
      const agent = this.agents[index];
      agent.position.y = 1.1 + Math.sin(this.elapsed * 1.3 + index) * 0.08;
      agent.rotation.y += delta * (index % 2 ? 0.1 : -0.1);
    }
    for (let index = 0; index < this.lifeforms.length; index += 1) {
      const life = this.lifeforms[index];
      const phase = Number(life.userData.phase ?? 0) + this.elapsed * 0.7;
      life.rotation.y += delta * (0.08 + (index % 4) * 0.025);
      life.position.y = this.landingCenter.y + Math.sin(phase) * 0.18;
      for (let childIndex = 1; childIndex < life.children.length; childIndex += 1) {
        life.children[childIndex].rotation.y = Math.sin(phase + childIndex) * 0.32;
      }
    }
  }

  private updatePlanetWeather(delta: number): void {
    const approachDistance = this.camera.position.distanceTo(this.landingCenter);
    const atmosphereBlend = this.zone === 'planet'
      ? 1
      : this.boarded
        ? THREE.MathUtils.clamp(1 - approachDistance / 1400, 0, 1)
        : 0;
    if (this.scene.fog instanceof THREE.FogExp2) {
      const targetDensity = THREE.MathUtils.lerp(0.000045, 0.0031, atmosphereBlend);
      this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, targetDensity, 1 - Math.exp(-delta * 1.8));
      this.scene.fog.color.lerpColors(new THREE.Color(COLORS.void), new THREE.Color(0x24383d), atmosphereBlend * 0.72);
    }
    if (this.cloudLayer) {
      this.cloudLayer.position.x = Math.sin(this.elapsed * 0.012) * 35;
      this.cloudLayer.position.z = Math.cos(this.elapsed * 0.009) * 18;
      this.cloudLayer.visible = approachDistance < 3200 || this.zone === 'planet';
    }
    if (this.weatherParticles) {
      this.weatherParticles.rotation.y += delta * 0.012;
      this.weatherParticles.position.x = Math.sin(this.elapsed * 0.18) * 2.5;
      this.weatherParticles.visible = approachDistance < 900 || this.zone === 'planet';
    }
  }

  private bindControls(): void {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.target as HTMLElement | null)?.matches('input, textarea, [contenteditable="true"]')) return;
      this.keys.add(event.code);
      if (event.repeat) return;
      if (event.code === 'KeyB') this.boarded ? this.leaveShip() : this.boardShip();
      else if (event.code === 'KeyM') this.setMagneticBoots(!this.magneticBoots);
      else if (event.code === 'KeyF') this.setFlightMode(!this.flightMode);
    };
    const onKeyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code); };
    const onPointerMove = (event: PointerEvent): void => {
      if (document.pointerLockElement === this.canvas) this.applyLookDelta(event.movementX, event.movementY, 0.0021);
      else if (this.dragging) {
        this.applyLookDelta(event.clientX - this.lastPointer.x, event.clientY - this.lastPointer.y, 0.0032);
        this.lastPointer = { x: event.clientX, y: event.clientY };
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      this.dragging = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.canvas.focus();
    };
    const onPointerUp = (): void => { this.dragging = false; };
    const onDoubleClick = (): void => this.requestPointerLock();
    const onResize = (): void => this.resize();
    const onBlur = (): void => { this.keys.clear(); this.dragging = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', onResize);
    window.addEventListener('blur', onBlur);
    this.canvas.addEventListener('pointerdown', onPointerDown);
    this.canvas.addEventListener('dblclick', onDoubleClick);
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.cleanup.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('pointermove', onPointerMove),
      () => window.removeEventListener('pointerup', onPointerUp),
      () => window.removeEventListener('resize', onResize),
      () => window.removeEventListener('blur', onBlur),
      () => this.canvas.removeEventListener('pointerdown', onPointerDown),
      () => this.canvas.removeEventListener('dblclick', onDoubleClick),
    );
  }

  private applyLookDelta(x: number, y: number, sensitivity: number): void {
    this.yaw -= x * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - y * sensitivity, -Math.PI * 0.48, Math.PI * 0.48);
  }

  private buildPlayableUniverse(): void {
    this.buildStars();
    this.buildStationInterior();
    this.buildVerticalTraversal();
    this.buildAirlock();
    this.buildHull();
    this.buildShip();
    this.buildOrbitalSpace();
    this.buildPlanetaryRegion();
    this.buildPopulation();
    this.buildAgents();
    this.buildTerminals();
  }

  private buildLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0x6688a0, 0x040508, 0.32));
    const sun = new THREE.DirectionalLight(0xddeeff, 2.2);
    sun.position.set(-900, 1200, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -110;
    sun.shadow.camera.right = 110;
    sun.shadow.camera.top = 110;
    sun.shadow.camera.bottom = -110;
    sun.shadow.camera.far = 2500;
    this.scene.add(sun);
    const naveLight = new THREE.PointLight(COLORS.gold, 72, 150, 1.55);
    naveLight.position.set(0, 8, -32);
    this.scene.add(naveLight);
    const cyanLight = new THREE.PointLight(COLORS.cyan, 55, 120, 1.7);
    cyanLight.position.set(0, 4, -94);
    this.scene.add(cyanLight);
  }

  private createMaterials(): Record<string, THREE.Material> {
    const brushedMap = this.brushedMetalTexture();
    return {
      black: new THREE.MeshStandardMaterial({ color: COLORS.nearBlack, roughness: 0.33, metalness: 0.82, map: brushedMap }),
      metal: new THREE.MeshStandardMaterial({ color: COLORS.metal, roughness: 0.42, metalness: 0.9, map: brushedMap }),
      lightMetal: new THREE.MeshStandardMaterial({ color: COLORS.lightMetal, roughness: 0.28, metalness: 0.92, map: brushedMap }),
      gold: new THREE.MeshStandardMaterial({ color: 0x6d5420, emissive: COLORS.gold, emissiveIntensity: 0.38, roughness: 0.25, metalness: 0.88 }),
      cyan: new THREE.MeshStandardMaterial({ color: 0x103f45, emissive: COLORS.cyan, emissiveIntensity: 1.8, roughness: 0.3, metalness: 0.45 }),
      magenta: new THREE.MeshStandardMaterial({ color: 0x4a0b2c, emissive: COLORS.magenta, emissiveIntensity: 1.65, roughness: 0.3, metalness: 0.52 }),
      white: new THREE.MeshStandardMaterial({ color: COLORS.white, emissive: 0x9ed8e5, emissiveIntensity: 0.18, roughness: 0.23, metalness: 0.58 }),
      glass: new THREE.MeshPhysicalMaterial({ color: COLORS.glass, metalness: 0.3, roughness: 0.12, transmission: 0.28, transparent: true, opacity: 0.48, side: THREE.DoubleSide }),
      darkGlass: new THREE.MeshPhysicalMaterial({ color: 0x02060a, metalness: 0.52, roughness: 0.16, transparent: true, opacity: 0.77, side: THREE.DoubleSide }),
      hull: new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.6, metalness: 0.88, map: brushedMap }),
      regolith: new THREE.MeshStandardMaterial({ color: 0x353943, roughness: 0.98, metalness: 0.08 }),
    };
  }

  private brushedMetalTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#59616a';
      context.fillRect(0, 0, 256, 256);
      for (let index = 0; index < 900; index += 1) {
        const tone = Math.floor(this.random.range(58, 116));
        context.fillStyle = `rgba(${tone},${tone + 4},${tone + 7},${this.random.range(0.025, 0.12)})`;
        context.fillRect(0, this.random.range(0, 256), 256, this.random.range(0.2, 1.1));
      }
      context.strokeStyle = 'rgba(7,10,15,.42)';
      context.lineWidth = 2;
      for (let position = 0; position <= 256; position += 64) {
        context.beginPath(); context.moveTo(position, 0); context.lineTo(position, 256); context.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildStars(): void {
    const count = 7200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color(0xffffff), new THREE.Color(0xb9efff), new THREE.Color(0xffe0a4), new THREE.Color(0xffb0d5)];
    for (let index = 0; index < count; index += 1) {
      const radius = this.random.range(1700, 18000);
      const theta = this.random.range(0, Math.PI * 2);
      const phi = Math.acos(this.random.range(-1, 1));
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const color = palette[Math.floor(this.random.next() * palette.length)];
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false }));
    points.name = 'Navigable star volume';
    this.orbitalWorld.add(points);
  }

  private buildStationInterior(): void {
    this.station.name = 'Sovereign Orbital Station Vesper';
    this.addBox(this.station, [12, 0.5, 132], [0, -0.3, -38], this.materials.metal, true);
    this.addBox(this.station, [12, 0.35, 132], [0, 10.3, -38], this.materials.black);
    this.addBox(this.station, [0.35, 3.6, 132], [-5.85, 8.4, -38], this.materials.glass);
    this.addBox(this.station, [0.35, 3.6, 132], [5.85, 8.4, -38], this.materials.glass);

    for (let index = 0; index < 17; index += 1) {
      const z = 26 - index * 8;
      this.addBox(this.station, [0.42, 7, 0.42], [-5.45, 3.4, z], this.materials.gold);
      this.addBox(this.station, [0.42, 7, 0.42], [5.45, 3.4, z], this.materials.gold);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(5.45, 0.18, 8, 36, Math.PI), this.materials.gold);
      arch.position.set(0, 3.45, z);
      this.station.add(arch);
      this.addBox(this.station, [8.6, 0.08, 0.65], [0, 0.02, z], index % 2 ? this.materials.cyan : this.materials.magenta);
    }

    for (let bay = 0; bay < 10; bay += 1) {
      const z = 18 - bay * 11;
      this.buildRoom(-1, bay, z, RENDERED_ROOM_LAYOUT[bay * 2]);
      this.buildRoom(1, bay, z, RENDERED_ROOM_LAYOUT[bay * 2 + 1]);
      const light = new THREE.PointLight(bay % 2 ? COLORS.magenta : COLORS.cyan, 12, 22, 2);
      light.position.set(0, 3.2, z);
      this.station.add(light);
    }

    const rose = this.createGlyphDisc(4.2, COLORS.magenta);
    rose.position.set(0, 5.4, 29.7);
    this.station.add(rose);
    this.animatedGlyphs.push(rose);
    this.addBox(this.station, [11.2, 10, 0.18], [0, 5, 29.9], this.materials.darkGlass);
    this.addLabel(this.station, 'SOVEREIGN NAVE // VESPER', [0, 3.35, 28.9], [5.4, 0.72], COLORS.gold, [0, Math.PI, 0]);
  }

  private buildRoom(side: -1 | 1, bay: number, z: number, definition: (typeof RENDERED_ROOM_LAYOUT)[number]): void {
    const centerX = side * 11.7;
    const room = new THREE.Group();
    room.name = `${definition.coreRoomId} · ${definition.name}`;
    room.userData.coreRoomId = definition.coreRoomId;
    room.userData.coreInteractionId = definition.coreInteractionId;
    this.addBox(room, [11.2, 0.35, 8.8], [0, -0.18, 0], this.materials.metal, true);
    this.addBox(room, [11.2, 0.3, 8.8], [0, 6.4, 0], this.materials.black);
    this.addBox(room, [0.32, 6.5, 8.8], [side * 5.6, 3.1, 0], this.materials.darkGlass);
    this.addBox(room, [11.2, 6.5, 0.3], [0, 3.1, -4.35], this.materials.black);
    this.addBox(room, [11.2, 6.5, 0.3], [0, 3.1, 4.35], this.materials.black);
    this.addBox(room, [0.4, 2.6, 2.1], [-side * 4.7, 1.25, 0], this.materials.black);
    this.addBox(room, [0.45, 0.1, 6.8], [0, 0.02, 0], bay % 2 ? this.materials.magenta : this.materials.cyan);

    const equipmentMaterial = bay % 3 === 0 ? this.materials.gold : bay % 3 === 1 ? this.materials.cyan : this.materials.magenta;
    for (let item = 0; item < 3; item += 1) {
      const equipment = this.addBox(room, [1.25 + item * 0.15, 1.1, 1.5], [side * (0.5 + item * 1.6), 0.55, -2.2 + item * 2.15], this.materials.black);
      const screen = this.addBox(equipment, [0.8, 0.4, 0.035], [-side * 0.635, 0.2, 0], equipmentMaterial);
      screen.rotation.y = Math.PI * 0.5;
    }
    room.position.set(centerX, 0, z);
    this.station.add(room);

    const door = this.createDoor(definition.visualId, new THREE.Vector3(side * 5.72, 2.05, z), 'z', 3.1, false);
    this.addLabel(this.station, `${String(bay * 2 + (side > 0 ? 2 : 1)).padStart(2, '0')} // ${definition.name.toUpperCase()}`, [side * 5.66, 4.8, z], [4.0, 0.48], bay % 2 ? COLORS.magenta : COLORS.cyan, [0, side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5, 0]);
    this.interactions.push({
      id: door.id,
      label: () => `${door.targetOpen ? 'Close' : 'Open'} ${definition.name}`,
      position: new THREE.Vector3(side * 5.2, 1.7, z),
      radius: 4.2,
      action: () => { door.targetOpen = !door.targetOpen; this.audio?.playCue('airlock', 0.34); },
    });
  }

  private buildVerticalTraversal(): void {
    const gantry = new THREE.Group();
    gantry.name = 'Upper observation gantry';
    this.addBox(gantry, [3.4, 0.28, 32], [-3.65, 4.02, -2.5], this.materials.lightMetal, true);
    this.addBox(gantry, [0.12, 1.1, 32], [-2.05, 4.58, -2.5], this.materials.gold);
    this.addBox(gantry, [0.12, 1.1, 32], [-5.25, 4.58, -2.5], this.materials.cyan);
    for (let z = -17; z <= 12; z += 4) {
      this.addBox(gantry, [3.1, 0.05, 0.18], [-3.65, 4.18, z], z % 8 === 0 ? this.materials.magenta : this.materials.cyan);
    }
    const ladder = new THREE.Group();
    ladder.name = 'Functional maintenance ladder';
    for (const x of [-4.92, -4.18]) this.addBox(ladder, [0.12, 4.2, 0.12], [x, 2.1, 4.5], this.materials.lightMetal);
    for (let y = 0.4; y <= 4; y += 0.42) this.addBox(ladder, [0.9, 0.08, 0.14], [-4.55, y, 4.5], this.materials.gold);
    gantry.add(ladder);
    this.station.add(gantry);
    this.interactions.push({
      id: 'ladder-observation-01',
      label: () => this.onUpperGantry ? 'Descend maintenance ladder' : 'Climb to observation gantry',
      position: new THREE.Vector3(-4.35, this.onUpperGantry ? 5.4 : 1.5, 4.5),
      radius: 3.8,
      action: () => {
        this.ladderActive = true;
        this.playerPosition.set(-4.55, this.onUpperGantry ? 5.65 : 1.3, 4.5);
        this.notify('Ladder grip engaged · move forward to climb', 'info');
      },
    });

    const car = new THREE.Group();
    car.name = 'Powered observation lift';
    this.addBox(car, [2.3, 0.26, 2.3], [4.15, 0.08, 4.4], this.materials.lightMetal, true);
    this.addBox(car, [0.1, 2.1, 2.3], [5.3, 1.05, 4.4], this.materials.darkGlass);
    this.addBox(car, [2.1, 0.05, 0.12], [4.15, 0.24, 4.4], this.materials.magenta);
    this.station.add(car);
    this.addBox(this.station, [0.22, 6.4, 0.22], [5.5, 3.1, 3.1], this.materials.gold);
    this.addBox(this.station, [0.22, 6.4, 0.22], [5.5, 3.1, 5.7], this.materials.gold);
    this.elevator = { car, lowerY: 0, upperY: 4, targetY: 0, moving: false, carryingPlayer: false };
    const callLift = (): void => this.useElevator();
    this.interactions.push({ id: 'elevator-observation-01', label: () => this.elevator?.moving ? 'Powered lift in transit' : `Ride lift ${this.onUpperGantry ? 'down' : 'to observation gantry'}`, position: new THREE.Vector3(3.8, 1.5, 4.4), radius: 4, action: callLift });
    this.interactions.push({ id: 'elevator-observation-upper', label: () => this.elevator?.moving ? 'Powered lift in transit' : 'Ride lift to nave deck', position: new THREE.Vector3(3.8, 5.5, 4.4), radius: 4, action: callLift });
  }

  private useElevator(): void {
    const elevator = this.elevator;
    if (!elevator || elevator.moving) return;
    const targetUpper = !this.onUpperGantry;
    elevator.targetY = targetUpper ? elevator.upperY : elevator.lowerY;
    elevator.moving = true;
    elevator.carryingPlayer = true;
    this.elevatorVelocity.copy(this.velocity);
    this.velocity.set(0, 0, 0);
    this.playerPosition.set(4.15, elevator.car.position.y + 1.72, 4.4);
    this.notify(`Powered lift ${targetUpper ? 'ascending' : 'descending'}`, 'info');
  }

  private updateElevator(delta: number): void {
    const elevator = this.elevator;
    if (!elevator?.moving) return;
    const direction = Math.sign(elevator.targetY - elevator.car.position.y);
    elevator.car.position.y += direction * delta * 2.1;
    if ((direction > 0 && elevator.car.position.y >= elevator.targetY) || (direction < 0 && elevator.car.position.y <= elevator.targetY)) {
      elevator.car.position.y = elevator.targetY;
      elevator.moving = false;
      this.onUpperGantry = elevator.targetY === elevator.upperY;
      this.velocity.copy(this.elevatorVelocity);
      this.notify(this.onUpperGantry ? 'Observation gantry reached' : 'Sovereign nave deck reached', 'success');
    }
    if (elevator.carryingPlayer) {
      this.playerPosition.set(4.15, elevator.car.position.y + 1.72, 4.4);
      if (!elevator.moving) elevator.carryingPlayer = false;
    }
  }

  private buildAirlock(): void {
    const locker = new THREE.Group();
    locker.name = 'Reachable EVA suit locker';
    this.addBox(locker, [1.35, 3.25, 0.72], [4.95, 1.62, -96.3], this.materials.black);
    this.addBox(locker, [0.92, 2.65, 0.08], [4.95, 1.58, -96.68], this.materials.darkGlass);
    const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.25, 6, 10), this.materials.white);
    suit.position.set(4.95, 1.42, -96.78);
    suit.scale.set(0.85, 1, 0.45);
    locker.add(suit);
    this.addBox(locker, [0.08, 2.8, 0.12], [4.32, 1.6, -96.78], this.materials.magenta);
    this.station.add(locker);
    this.interactions.push({
      id: 'eva-suit-locker',
      label: () => this.suited ? 'EVA suit seal verified' : 'Equip and seal sovereign EVA suit',
      position: new THREE.Vector3(4.55, 1.55, -95.8),
      radius: 4.2,
      action: () => {
        if (this.suited) { this.notify('Suit pressure and oxygen reserves nominal', 'success'); return; }
        this.suited = true;
        this.oxygen = 100;
        this.notify('EVA suit equipped and pressure seal verified', 'success');
        this.audio?.playCue('confirm');
      },
    });
    this.addBox(this.station, [9.5, 0.5, 20], [0, -0.28, -111], this.materials.lightMetal, true);
    this.addBox(this.station, [9.5, 0.4, 20], [0, 6.2, -111], this.materials.black);
    this.addBox(this.station, [0.4, 6.5, 20], [-4.7, 3, -111], this.materials.black);
    this.addBox(this.station, [0.4, 6.5, 20], [4.7, 3, -111], this.materials.black);
    for (let z = -103; z >= -119; z -= 4) {
      this.addBox(this.station, [8.3, 0.07, 0.35], [0, 0.03, z], this.materials.magenta);
    }
    this.innerAirlock = this.createDoor('airlock-inner', new THREE.Vector3(0, 2.2, -101.4), 'x', 4.5, false);
    this.outerAirlock = this.createDoor('airlock-outer', new THREE.Vector3(0, 2.2, -120.3), 'x', 4.5, false);
    this.addLabel(this.station, 'AIRLOCK A-01 // EVA', [0, 4.8, -100.95], [4.3, 0.55], COLORS.magenta, [0, 0, 0]);
    const consoleBody = this.addBox(this.station, [0.7, 1.5, 0.55], [-3.8, 1.1, -110.7], this.materials.black);
    const consoleScreen = this.addBox(consoleBody, [0.5, 0.52, 0.03], [0, 0.28, 0.29], this.materials.cyan);
    consoleScreen.rotation.x = -0.12;
    this.interactions.push({
      id: 'airlock-cycle',
      label: () => this.airlockCycling ? `Pressure cycle ${Math.round((this.airlockCycleElapsed / (this.airlockCycleDuration + 0.5)) * 100)}%` : `${this.airlockPressure > 50 ? 'Depressurize' : 'Pressurize'} Airlock A-01`,
      position: new THREE.Vector3(-3.5, 1.4, -110.2),
      radius: 4,
      action: () => this.cycleAirlock(),
    });
    this.interactions.push({
      id: 'airlock-inner', label: () => `${this.innerAirlock?.targetOpen ? 'Close' : 'Open'} interior seal`, position: new THREE.Vector3(0, 1.7, -100.4), radius: 3.5,
      action: () => {
        if (this.airlockPressure < 95 || this.outerAirlock?.targetOpen) { this.notify('Interlock denies unsafe pressure differential', 'warning'); this.audio?.playCue('deny'); return; }
        if (this.innerAirlock) this.innerAirlock.targetOpen = !this.innerAirlock.targetOpen;
      },
    });
    this.interactions.push({
      id: 'airlock-outer', label: () => this.airlockPressure > 5 ? 'Cycle exterior airlock' : `${this.outerAirlock?.targetOpen ? 'Close' : 'Open'} exterior seal`, position: new THREE.Vector3(0, 1.7, -119.2), radius: 4,
      action: () => {
        if (this.airlockPressure > 5) this.cycleAirlock();
        else if (this.outerAirlock) this.outerAirlock.targetOpen = !this.outerAirlock.targetOpen;
      },
    });
  }

  private buildHull(): void {
    this.addBox(this.station, [90, 1.2, 76], [0, -0.85, -156], this.materials.hull, true);
    for (let x = -40; x <= 40; x += 10) this.addBox(this.station, [0.12, 0.05, 72], [x, -0.18, -156], this.materials.cyan);
    for (let z = -122; z >= -190; z -= 8) this.addBox(this.station, [86, 0.05, 0.12], [0, -0.17, z], z % 16 === 0 ? this.materials.gold : this.materials.magenta);
    for (const x of [-43, 43]) {
      this.addBox(this.station, [0.7, 2.2, 72], [x, 0.25, -156], this.materials.metal);
      for (let z = -124; z >= -188; z -= 8) this.addBox(this.station, [2.8, 0.18, 0.18], [x, 1.6, z], this.materials.lightMetal);
    }

    const stationCore = new THREE.Mesh(new THREE.CylinderGeometry(24, 32, 118, 20, 4), this.materials.hull);
    stationCore.rotation.x = Math.PI * 0.5;
    stationCore.position.set(0, -19, -87);
    stationCore.castShadow = true;
    this.station.add(stationCore);
    const dockingRing = new THREE.Mesh(new THREE.TorusGeometry(34, 3.4, 8, 48), this.materials.lightMetal);
    dockingRing.position.set(0, -10, -145);
    dockingRing.rotation.x = Math.PI * 0.5;
    this.station.add(dockingRing);
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(34.1, 0.22, 5, 64), this.materials.cyan);
    ringGlow.position.copy(dockingRing.position);
    ringGlow.rotation.copy(dockingRing.rotation);
    this.station.add(ringGlow);

    for (const side of [-1, 1]) {
      const solar = new THREE.Group();
      for (let panel = 0; panel < 6; panel += 1) {
        const plate = this.addBox(solar, [13, 0.3, 8], [side * (52 + panel * 13.5), -8, -154], this.materials.darkGlass);
        const cells = this.addBox(solar, [12.5, 0.05, 0.12], [plate.position.x, -7.78, -154], this.materials.cyan);
        cells.rotation.y = Math.PI * 0.5;
      }
      this.station.add(solar);
    }

    for (let index = 0; index < 9; index += 1) {
      const antenna = new THREE.Group();
      const x = this.random.range(-36, 36);
      const z = this.random.range(-184, -128);
      this.addBox(antenna, [0.35, this.random.range(3, 8), 0.35], [x, 2.5, z], this.materials.lightMetal);
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 2.2, 0.55, 16), this.materials.lightMetal);
      dish.position.set(x, 5.2, z);
      dish.rotation.x = this.random.range(-0.6, 0.6);
      antenna.add(dish);
      this.station.add(antenna);
    }

    const repairNode = new THREE.Group();
    repairNode.name = 'Functional sunward repair node';
    this.addBox(repairNode, [2.2, 0.42, 2.2], [-22, 0.12, -163], this.materials.black);
    const coupler = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.16, 8, 20), this.materials.magenta);
    coupler.position.set(-22, 0.62, -163);
    coupler.rotation.x = Math.PI * 0.5;
    repairNode.add(coupler);
    this.station.add(repairNode);
    this.animatedGlyphs.push(coupler);
    this.interactions.push({ id: 'repair-node-sunward', label: () => 'Repair sunward solar-array coupler', position: new THREE.Vector3(-22, 1.2, -163), radius: 4.5, action: () => { this.notify('Power coupler repaired · reserve grid restored', 'success'); this.audio?.playCue('confirm'); } });

    const wreck = new THREE.Group();
    wreck.name = 'Discoverable Quiet Meridian wreck';
    const wreckHull = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 12, 7), this.materials.hull);
    wreckHull.rotation.set(0.55, 0.2, 1.1);
    wreckHull.position.set(-38, 8, -186);
    wreck.add(wreckHull);
    for (let shard = 0; shard < 12; shard += 1) {
      const debris = new THREE.Mesh(new THREE.BoxGeometry(this.random.range(0.2, 1.4), this.random.range(0.1, 0.5), this.random.range(0.5, 2.2)), this.materials.metal);
      debris.position.set(-38 + this.random.range(-8, 8), 8 + this.random.range(-5, 5), -186 + this.random.range(-7, 7));
      debris.rotation.set(this.random.next() * Math.PI, this.random.next() * Math.PI, this.random.next() * Math.PI);
      wreck.add(debris);
    }
    this.station.add(wreck);
    this.interactions.push({ id: 'discovery-wreck', label: () => 'Scan Quiet Meridian wreck', position: new THREE.Vector3(-38, 8, -186), radius: 13, action: () => { this.notify('Wreck scan complete · archive telemetry recovered', 'success'); this.audio?.playCue('mission'); } });
  }

  private buildShip(): void {
    this.ship.name = 'SKV Meridian pilotable courier';
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 13, 8), this.materials.lightMetal);
    hull.rotation.x = Math.PI * 0.5;
    hull.castShadow = true;
    this.ship.add(hull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.25, 5.5, 8), this.materials.black);
    nose.rotation.x = -Math.PI * 0.5;
    nose.position.z = -8.9;
    this.ship.add(nose);
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(2.05, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), this.materials.darkGlass);
    cockpit.scale.set(1, 0.72, 1.4);
    cockpit.rotation.x = Math.PI * 0.5;
    cockpit.position.set(0, 1.4, -3.8);
    this.ship.add(cockpit);
    for (const side of [-1, 1]) {
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0); wingShape.lineTo(side * 8, 1.2); wingShape.lineTo(side * 6.8, 4.5); wingShape.lineTo(side * 1.2, 3.1); wingShape.closePath();
      const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), this.materials.hull);
      wing.rotation.x = -Math.PI * 0.5;
      wing.position.set(0, -0.4, -1.5);
      this.ship.add(wing);
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 4.6, 12), this.materials.black);
      engine.rotation.x = Math.PI * 0.5;
      engine.position.set(side * 4.7, 0, 3.4);
      this.ship.add(engine);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.72, 20), this.materials.magenta);
      glow.position.set(side * 4.7, 0, 5.72);
      glow.rotation.y = Math.PI;
      this.ship.add(glow);
    }
    this.addBox(this.ship, [0.3, 1.9, 9], [0, 1.15, 1.3], this.materials.gold);
    this.ship.position.copy(this.dockPosition);
    this.ship.rotation.y = Math.PI * 0.5;
    this.interactions.push({ id: 'board-skv-meridian', label: () => 'Board SKV Meridian courier', position: new THREE.Vector3(19, 1.7, -151), radius: 7, action: () => { this.boardShip(); } });
  }

  private buildOrbitalSpace(): void {
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(165, 5), new THREE.MeshStandardMaterial({ color: 0x88939e, roughness: 1, metalness: 0.02 }));
    moon.name = 'Thales nearby moon';
    moon.position.set(-920, 270, -2380);
    moon.receiveShadow = true;
    this.orbitalWorld.add(moon);
    for (let crater = 0; crater < 28; crater += 1) {
      const marker = new THREE.Mesh(new THREE.TorusGeometry(this.random.range(3, 16), this.random.range(0.6, 2.4), 5, 18), new THREE.MeshBasicMaterial({ color: 0x3d454c, transparent: true, opacity: 0.48 }));
      const direction = new THREE.Vector3(this.random.range(-1, 1), this.random.range(-1, 1), this.random.range(-1, 1)).normalize();
      marker.position.copy(direction.multiplyScalar(165.4)).add(moon.position);
      marker.lookAt(moon.position.clone().add(direction.multiplyScalar(300)));
      this.orbitalWorld.add(marker);
    }

    const asteroidGeometry = new THREE.DodecahedronGeometry(1, 1);
    const asteroidMaterial = new THREE.MeshStandardMaterial({ color: 0x4d5054, roughness: 0.96, metalness: 0.16 });
    const asteroids = new THREE.InstancedMesh(asteroidGeometry, asteroidMaterial, 96);
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 96; index += 1) {
      const angle = this.random.range(0, Math.PI * 2);
      const radius = this.random.range(330, 920);
      dummy.position.set(Math.cos(angle) * radius, this.random.range(-150, 230), -900 + Math.sin(angle) * radius * 0.42);
      dummy.rotation.set(this.random.range(0, Math.PI), this.random.range(0, Math.PI), this.random.range(0, Math.PI));
      dummy.scale.set(this.random.range(2.5, 22), this.random.range(1.8, 14), this.random.range(2.2, 18));
      dummy.updateMatrix();
      asteroids.setMatrixAt(index, dummy.matrix);
    }
    asteroids.name = 'Traversable asteroid field';
    this.orbitalWorld.add(asteroids);

    for (let index = 0; index < 9; index += 1) {
      const craft = this.createTrafficCraft(index);
      this.traffic.push({ group: craft, center: new THREE.Vector3(this.random.range(-120, 130), this.random.range(30, 160), this.random.range(-650, -260)), radius: this.random.range(130, 460), speed: this.random.range(0.018, 0.055), phase: this.random.range(0, Math.PI * 2), height: this.random.range(20, 120) });
      this.orbitalWorld.add(craft);
    }

    const beacon = this.createGlyphDisc(22, COLORS.cyan);
    beacon.position.set(0, 64, -420);
    this.orbitalWorld.add(beacon);
    this.animatedGlyphs.push(beacon);
  }

  private buildPlanetaryRegion(): void {
    const planetCenter = new THREE.Vector3(1700, -843, -4700);
    const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(700, 6), new THREE.MeshStandardMaterial({ color: 0x26363d, roughness: 0.94, metalness: 0.04 }));
    planet.name = 'Nyx landable planet';
    planet.position.copy(planetCenter);
    planet.receiveShadow = true;
    this.planetaryWorld.add(planet);
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(718, 48, 32), new THREE.MeshPhysicalMaterial({ color: 0x4adbe9, transparent: true, opacity: 0.055, side: THREE.BackSide, depthWrite: false }));
    atmosphere.position.copy(planetCenter);
    this.planetaryWorld.add(atmosphere);

    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(300, 300, 42, 42), this.materials.regolith);
    const positions = terrain.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      positions.setZ(index, Math.sin(x * 0.037) * 1.2 + Math.cos(y * 0.029) * 0.8 + this.random.range(-0.35, 0.35));
    }
    positions.needsUpdate = true;
    terrain.geometry.computeVertexNormals();
    terrain.rotation.x = -Math.PI * 0.5;
    terrain.position.copy(this.landingCenter);
    terrain.receiveShadow = true;
    this.planetaryWorld.add(terrain);

    const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xb7d5da, transparent: true, opacity: 0.1, depthWrite: false });
    this.cloudLayer = new THREE.Group();
    this.cloudLayer.name = 'Procedural atmospheric cloud layer';
    for (let index = 0; index < 18; index += 1) {
      const cloud = new THREE.Mesh(new THREE.IcosahedronGeometry(this.random.range(8, 20), 2), cloudMaterial);
      cloud.scale.set(this.random.range(1.8, 4), this.random.range(0.18, 0.38), this.random.range(0.7, 1.8));
      cloud.position.set(this.landingCenter.x + this.random.range(-180, 180), this.landingCenter.y + this.random.range(38, 86), this.landingCenter.z + this.random.range(-180, 180));
      this.cloudLayer.add(cloud);
    }
    this.planetaryWorld.add(this.cloudLayer);
    const weatherPositions = new Float32Array(720 * 3);
    for (let index = 0; index < 720; index += 1) {
      weatherPositions[index * 3] = this.landingCenter.x + this.random.range(-160, 160);
      weatherPositions[index * 3 + 1] = this.landingCenter.y + this.random.range(1, 72);
      weatherPositions[index * 3 + 2] = this.landingCenter.z + this.random.range(-160, 160);
    }
    const weatherGeometry = new THREE.BufferGeometry();
    weatherGeometry.setAttribute('position', new THREE.BufferAttribute(weatherPositions, 3));
    this.weatherParticles = new THREE.Points(weatherGeometry, new THREE.PointsMaterial({ color: 0xa7d0d3, size: 0.48, transparent: true, opacity: 0.26, depthWrite: false }));
    this.weatherParticles.name = 'Nyx windborne mineral weather';
    this.planetaryWorld.add(this.weatherParticles);

    for (let index = 0; index < 38; index += 1) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(this.random.range(0.8, 4.6), 0), this.materials.regolith);
      const x = this.random.range(-135, 135);
      const z = this.random.range(-135, 135);
      rock.position.set(this.landingCenter.x + x, this.landingCenter.y + this.random.range(0.1, 1.4), this.landingCenter.z + z);
      rock.scale.y = this.random.range(0.45, 1.5);
      rock.rotation.set(this.random.next(), this.random.next(), this.random.next());
      rock.castShadow = true;
      this.planetaryWorld.add(rock);
    }

    const settlement = new THREE.Group();
    settlement.name = 'Nyx Meridian procedural settlement';
    settlement.position.copy(this.landingCenter).add(new THREE.Vector3(42, 0, -34));
    for (let module = 0; module < 9; module += 1) {
      const angle = (module / 9) * Math.PI * 2;
      const x = Math.cos(angle) * 24;
      const z = Math.sin(angle) * 24;
      const habitat = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 4.3, 8), this.materials.hull);
      habitat.position.set(x, 2.1, z);
      habitat.castShadow = true;
      settlement.add(habitat);
      const window = this.addBox(settlement, [2.5, 0.7, 0.08], [x, 2.4, z - 4.05], module % 2 ? this.materials.cyan : this.materials.magenta);
      window.lookAt(new THREE.Vector3(0, 2.4, 0));
    }
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.4, 28, 10), this.materials.lightMetal);
    tower.position.y = 14;
    settlement.add(tower);
    const settlementGlyph = this.createGlyphDisc(4.8, COLORS.gold);
    settlementGlyph.position.y = 24;
    settlementGlyph.rotation.x = Math.PI * 0.5;
    settlement.add(settlementGlyph);
    this.animatedGlyphs.push(settlementGlyph);
    this.planetaryWorld.add(settlement);

    const facility = new THREE.Group();
    facility.name = 'Enterable Nyx settlement operations habitat';
    facility.position.copy(this.landingCenter).add(new THREE.Vector3(-46, 0, -34));
    this.addBox(facility, [15, 0.3, 13], [0, 0, 0], this.materials.metal, true);
    this.addBox(facility, [15, 0.35, 13], [0, 5.2, 0], this.materials.hull);
    this.addBox(facility, [0.35, 5.2, 13], [-7.3, 2.5, 0], this.materials.black);
    this.addBox(facility, [0.35, 5.2, 13], [7.3, 2.5, 0], this.materials.black);
    this.addBox(facility, [15, 5.2, 0.35], [0, 2.5, -6.3], this.materials.darkGlass);
    this.addBox(facility, [5.4, 5.2, 0.35], [-4.8, 2.5, 6.3], this.materials.black);
    this.addBox(facility, [5.4, 5.2, 0.35], [4.8, 2.5, 6.3], this.materials.black);
    this.addBox(facility, [2.8, 1.05, 1.2], [0, 0.52, -2.4], this.materials.black);
    this.addBox(facility, [1.8, 0.5, 0.05], [0, 1, -1.78], this.materials.cyan);
    this.addLabel(facility, 'NYX OPERATIONS', [0, 4.05, 6.48], [5.2, 0.62], COLORS.gold, [0, Math.PI, 0]);
    this.planetaryWorld.add(facility);
    const facilityEntry = facility.position.clone().add(new THREE.Vector3(0, 1.5, 8));
    this.interactions.push({ id: 'settlement-nacre', label: () => 'Enter Nyx operations habitat', position: facilityEntry, radius: 5.5, action: () => { this.hud?.showPanel('dialogue'); this.notify('Settlement operations channel connected', 'success'); } });

    const habitatCenter = this.landingCenter.clone().add(new THREE.Vector3(58, 0, 46));
    for (let index = 0; index < 14; index += 1) {
      const life = new THREE.Group();
      life.name = `Silica bloom organism ${String(index + 1).padStart(2, '0')}`;
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(this.random.range(0.35, 0.82), 1), index % 3 === 0 ? this.materials.magenta : this.materials.cyan);
      core.position.y = this.random.range(0.5, 1.4);
      life.add(core);
      for (let frond = 0; frond < 5; frond += 1) {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.12, this.random.range(0.8, 1.8), 5), this.materials.lightMetal);
        const angle = (frond / 5) * Math.PI * 2;
        blade.position.set(Math.cos(angle) * 0.35, 0.5, Math.sin(angle) * 0.35);
        blade.rotation.z = Math.cos(angle) * 0.7;
        blade.rotation.x = Math.sin(angle) * 0.7;
        life.add(blade);
      }
      life.position.set(habitatCenter.x + this.random.range(-16, 16), habitatCenter.y, habitatCenter.z + this.random.range(-14, 14));
      life.userData.phase = this.random.range(0, Math.PI * 2);
      this.lifeforms.push(life);
      this.planetaryWorld.add(life);
    }
    this.interactions.push({ id: 'discovery-life', label: () => 'Scan silica bloom habitat', position: habitatCenter.clone().add(new THREE.Vector3(0, 1.2, 0)), radius: 18, action: () => { this.notify('Synthetic ecology catalogued · persistent discovery recorded', 'success'); this.audio?.playCue('mission'); } });

    this.interactions.push({ id: 'nyx-settlement-uplink', label: () => 'Contact Nyx settlement logistics', position: settlement.position.clone().add(new THREE.Vector3(0, 1.7, 20)), radius: 6, action: () => { this.hud?.togglePanel('dialogue'); this.notify('Settlement uplink established', 'success'); } });
  }

  private buildPopulation(): void {
    const bodyGeometry = new THREE.CapsuleGeometry(0.27, 0.8, 5, 8);
    const headGeometry = new THREE.SphereGeometry(0.22, 10, 7);
    for (let index = 0; index < 50; index += 1) {
      const group = new THREE.Group();
      group.name = `Persistent citizen NPC-${String(index + 1).padStart(3, '0')}`;
      const accent = index % 5 === 0 ? this.materials.gold : index % 3 === 0 ? this.materials.magenta : this.materials.cyan;
      const body = new THREE.Mesh(bodyGeometry, index % 2 ? this.materials.black : this.materials.metal);
      body.position.y = 0.82;
      body.castShadow = true;
      const head = new THREE.Mesh(headGeometry, this.materials.lightMetal);
      head.position.y = 1.58;
      const chest = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.03), accent);
      chest.position.set(0, 1.05, -0.29);
      group.add(body, head, chest);
      let base: THREE.Vector3;
      if (index < 22) base = new THREE.Vector3(this.random.range(-3.8, 3.8), 0, this.random.range(-92, 22));
      else {
        const room = index % 20;
        const side = room % 2 === 0 ? -1 : 1;
        const bay = Math.floor(room / 2);
        base = new THREE.Vector3(side * this.random.range(8, 15.5), 0, 18 - bay * 11 + this.random.range(-2.8, 2.8));
      }
      group.position.copy(base);
      this.station.add(group);
      this.citizens.push({ group, base, phase: this.random.range(0, Math.PI * 2), route: index % 7 });
      const npcId = `npc-${String(index + 1).padStart(3, '0')}`;
      this.interactions.push({
        id: npcId,
        label: () => `Speak with ${group.name.replace(/^Persistent citizen /, '')}`,
        position: base.clone().add(new THREE.Vector3(0, 1.1, 0)),
        radius: 3.4,
        action: () => { this.hud?.showPanel('dialogue'); this.notify(`Secure channel opened with ${npcId}`, 'success'); },
      });
    }
  }

  private buildAgents(): void {
    const roles = ['COMMAND', 'NAVIGATION', 'ENGINEERING', 'SECURITY', 'MEDICAL', 'COMMERCE', 'RESEARCH', 'DIPLOMACY', 'LOGISTICS', 'EXPLORATION', 'EMERGENCY', 'ENVIRONMENT'];
    for (let index = 0; index < roles.length; index += 1) {
      const bay = index % 10;
      const side = index % 2 === 0 ? -1 : 1;
      const group = new THREE.Group();
      group.name = `Sovereign Agent ${String(index + 1).padStart(2, '0')} · ${roles[index]}`;
      const material = index % 3 === 0 ? this.materials.gold : index % 2 ? this.materials.magenta : this.materials.cyan;
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.38, 12), this.materials.black);
      const presence = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.7, 8, 1, true), material);
      presence.position.y = 1.15;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 5, 22), material);
      halo.position.y = 1.82;
      halo.rotation.x = Math.PI * 0.5;
      group.add(pedestal, presence, halo);
      group.position.set(side * 9.2, 1.1, 18 - bay * 11 + (index >= 10 ? -2.1 : 0));
      this.station.add(group);
      this.agents.push(group);
      this.interactions.push({ id: `agent-${roles[index].toLowerCase()}`, label: () => `Open channel · ${roles[index]} sovereign agent`, position: group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), radius: 4.8, action: () => { this.hud?.togglePanel('dialogue'); this.notify(`${roles[index]} agent channel opened`, 'success'); } });
    }
  }

  private buildTerminals(): void {
    const terminals: Array<{ id: string; label: string; position: THREE.Vector3; panel: 'missions' | 'economy' | 'dialogue' | 'construction'; material: THREE.Material }> = [
      { id: 'mission-terminal', label: 'Access state-driven mission bureau', position: new THREE.Vector3(4.3, 1.2, 7), panel: 'missions', material: this.materials.gold },
      { id: 'economy-terminal', label: 'Access Vesper commodity exchange', position: new THREE.Vector3(-4.3, 1.2, -15), panel: 'economy', material: this.materials.cyan },
      { id: 'diplomacy-terminal', label: 'Open faction communication lattice', position: new THREE.Vector3(4.3, 1.2, -37), panel: 'dialogue', material: this.materials.magenta },
      { id: 'construction-terminal', label: 'Open owned-space fabricator', position: new THREE.Vector3(-4.3, 1.2, -70), panel: 'construction', material: this.materials.gold },
    ];
    for (const terminal of terminals) {
      const body = this.addBox(this.station, [0.8, 1.8, 0.65], [terminal.position.x, 0.9, terminal.position.z], this.materials.black);
      const screen = this.addBox(body, [0.58, 0.64, 0.035], [0, 0.28, terminal.position.x > 0 ? -0.34 : 0.34], terminal.material);
      screen.rotation.y = terminal.position.x > 0 ? 0 : Math.PI;
      this.interactions.push({ id: terminal.id, label: () => terminal.label, position: terminal.position, radius: 4.3, action: () => { this.hud?.togglePanel(terminal.panel); this.notify(`${terminal.panel.toUpperCase()} system online`, 'success'); } });
    }
  }

  private createDoor(id: string, center: THREE.Vector3, axis: 'x' | 'z', width: number, open: boolean): DoorState {
    const frame = new THREE.Group();
    frame.name = `Functional door ${id}`;
    frame.position.copy(center);
    const horizontal = axis === 'x';
    this.addBox(frame, [horizontal ? width + 1.1 : 0.5, 0.35, horizontal ? 0.5 : width + 1.1], [0, 2.45, 0], this.materials.gold);
    this.addBox(frame, [horizontal ? 0.35 : 0.5, 4.8, horizontal ? 0.5 : 0.35], [horizontal ? -(width * 0.5 + 0.4) : 0, 0, horizontal ? 0 : -(width * 0.5 + 0.4)], this.materials.lightMetal);
    this.addBox(frame, [horizontal ? 0.35 : 0.5, 4.8, horizontal ? 0.5 : 0.35], [horizontal ? width * 0.5 + 0.4 : 0, 0, horizontal ? 0 : width * 0.5 + 0.4], this.materials.lightMetal);
    const panelSize: [number, number, number] = horizontal ? [width * 0.5, 4.25, 0.32] : [0.32, 4.25, width * 0.5];
    const left = this.addBox(frame, panelSize, horizontal ? [-width * 0.25, 0, 0] : [0, 0, -width * 0.25], this.materials.black);
    const right = this.addBox(frame, panelSize, horizontal ? [width * 0.25, 0, 0] : [0, 0, width * 0.25], this.materials.black);
    const stripSize: [number, number, number] = horizontal ? [0.05, 3.2, 0.04] : [0.04, 3.2, 0.05];
    this.addBox(left, stripSize, horizontal ? [width * 0.23, 0, -0.18] : [-0.18, 0, width * 0.23], this.materials.magenta);
    this.addBox(right, stripSize, horizontal ? [-width * 0.23, 0, -0.18] : [-0.18, 0, -width * 0.23], this.materials.cyan);
    this.station.add(frame);
    const door: DoorState = {
      id,
      left,
      right,
      axis,
      closedLeft: horizontal ? left.position.x : left.position.z,
      closedRight: horizontal ? right.position.x : right.position.z,
      travel: width * 0.47,
      open,
      targetOpen: open,
    };
    if (open) {
      if (horizontal) { left.position.x -= door.travel; right.position.x += door.travel; }
      else { left.position.z -= door.travel; right.position.z += door.travel; }
    }
    this.doors.push(door);
    return door;
  }

  private createTrafficCraft(index: number): THREE.Group {
    const craft = new THREE.Group();
    craft.name = `Autonomous orbital traffic ${index + 1}`;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.8, 7, 6), index % 2 ? this.materials.metal : this.materials.black);
    body.rotation.x = Math.PI * 0.5;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.5, 6), this.materials.lightMetal);
    nose.rotation.x = -Math.PI * 0.5;
    nose.position.z = -4.7;
    const drive = new THREE.Mesh(new THREE.CircleGeometry(1, 12), index % 2 ? this.materials.cyan : this.materials.magenta);
    drive.position.z = 3.55;
    drive.rotation.y = Math.PI;
    craft.add(body, nose, drive);
    craft.scale.setScalar(this.random.range(0.7, 2.2));
    return craft;
  }

  private createGlyphDisc(radius: number, color: number): THREE.Mesh {
    const geometry = new THREE.RingGeometry(radius * 0.55, radius, 6, 2, 0, Math.PI * 2);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
    return new THREE.Mesh(geometry, material);
  }

  private addBox(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], material: THREE.Material, receiveShadow = false): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = !receiveShadow;
    mesh.receiveShadow = receiveShadow;
    parent.add(mesh);
    return mesh;
  }

  private addLabel(parent: THREE.Object3D, text: string, position: [number, number, number], size: [number, number], color: number, rotation: [number, number, number]): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = 'rgba(2,4,8,.88)';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
      context.lineWidth = 4;
      context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
      context.fillStyle = '#f3f8fa';
      context.font = '700 42px Arial Narrow, Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 52);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  }

  private notify(message: string, tone: 'info' | 'success' | 'warning'): void {
    if (this.notification === message && this.notificationUntil > this.elapsed) return;
    this.notification = message;
    this.notificationUntil = this.elapsed + 2.5;
    this.hud?.toast(message, tone);
  }

  private isAboveHull(): boolean {
    return this.playerPosition.x >= -46 && this.playerPosition.x <= 46 && this.playerPosition.z <= -117 && this.playerPosition.z >= -192 && this.playerPosition.y < 8;
  }

  private applyDoorSnapshot(door: DoorState, open: unknown, targetOpen: unknown, snapPosition: boolean): void {
    const actualOpen = typeof open === 'boolean' ? open : door.open;
    const desiredOpen = typeof targetOpen === 'boolean' ? targetOpen : actualOpen;
    door.open = actualOpen;
    door.targetOpen = desiredOpen;
    if (!snapPosition) return;
    if (door.axis === 'x') {
      door.left.position.x = door.closedLeft - (actualOpen ? door.travel : 0);
      door.right.position.x = door.closedRight + (actualOpen ? door.travel : 0);
    } else {
      door.left.position.z = door.closedLeft - (actualOpen ? door.travel : 0);
      door.right.position.z = door.closedRight + (actualOpen ? door.travel : 0);
    }
  }

  private applyFiniteVector(target: THREE.Vector3, value: { x?: unknown; y?: unknown; z?: unknown }): void {
    target.set(
      this.finite(value.x, target.x),
      this.finite(value.y, target.y),
      this.finite(value.z, target.z),
    );
  }

  private finite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private isUniverseZone(value: unknown): value is UniverseZone {
    return value === 'interior' || value === 'airlock' || value === 'eva' || value === 'ship' || value === 'planet';
  }

  private vectorRecord(vector: THREE.Vector3): { x: number; y: number; z: number } {
    return { x: vector.x, y: vector.y, z: vector.z };
  }
}

export default GameRenderer;
