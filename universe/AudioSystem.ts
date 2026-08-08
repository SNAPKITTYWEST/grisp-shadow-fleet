export type AudioCue =
  | 'airlock'
  | 'alarm'
  | 'confirm'
  | 'deny'
  | 'dock'
  | 'engine'
  | 'footstep'
  | 'mission'
  | 'terminal'
  | 'thruster';

type Zone = 'interior' | 'airlock' | 'eva' | 'ship' | 'planet';

/** Procedural WebAudio bed and cues. It remains silent until a user gesture unlocks audio. */
export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private ambienceNodes: AudioNode[] = [];
  private zone: Zone = 'interior';
  private enabled = true;
  private volume = 0.45;

  public async start(): Promise<void> {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.context) return;
    if (this.context.state === 'suspended') await this.context.resume();
    this.rebuildAmbience();
  }

  public stop(): void {
    this.clearAmbience();
    if (this.context && this.context.state !== 'closed') void this.context.suspend();
  }

  public dispose(): void {
    this.clearAmbience();
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null;
    this.master = null;
    this.ambience = null;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master) this.master.gain.setTargetAtTime(enabled ? this.volume : 0, this.now(), 0.04);
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.now(), 0.04);
  }

  public setZone(zone: Zone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    if (this.context?.state === 'running') this.rebuildAmbience();
  }

  public playCue(cue: AudioCue, intensity = 1): void {
    if (!this.enabled || !this.context || this.context.state !== 'running' || !this.master) return;
    const now = this.now();
    const amount = Math.max(0.1, Math.min(1.5, intensity));
    switch (cue) {
      case 'footstep':
        this.noiseBurst(now, 0.055, 0.07 * amount, 170, 620);
        break;
      case 'thruster':
      case 'engine':
        this.tone(now, cue === 'engine' ? 54 : 82, 0.18, 0.09 * amount, 'sawtooth', -18);
        this.noiseBurst(now, 0.16, 0.035 * amount, 80, 360);
        break;
      case 'airlock':
        this.tone(now, 92, 0.48, 0.1 * amount, 'sine', 42);
        this.noiseBurst(now + 0.05, 0.35, 0.045 * amount, 110, 900);
        break;
      case 'alarm':
        this.tone(now, 210, 0.12, 0.12 * amount, 'square', 0);
        this.tone(now + 0.18, 170, 0.16, 0.1 * amount, 'square', 0);
        break;
      case 'dock':
        this.tone(now, 68, 0.22, 0.12 * amount, 'triangle', 28);
        this.tone(now + 0.2, 136, 0.32, 0.08 * amount, 'sine', 18);
        break;
      case 'deny':
        this.tone(now, 150, 0.1, 0.09 * amount, 'square', -45);
        this.tone(now + 0.1, 104, 0.15, 0.08 * amount, 'square', -30);
        break;
      case 'mission':
        this.tone(now, 294, 0.13, 0.07 * amount, 'sine', 12);
        this.tone(now + 0.11, 440, 0.24, 0.07 * amount, 'sine', 18);
        break;
      case 'terminal':
        this.tone(now, 640, 0.045, 0.045 * amount, 'square', 0);
        break;
      case 'confirm':
      default:
        this.tone(now, 420, 0.08, 0.06 * amount, 'sine', 45);
        break;
    }
  }

  private ensureContext(): void {
    if (this.context) return;
    const AudioContextCtor = window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    this.context = new AudioContextCtor();
    this.master = this.context.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(this.context.destination);
    this.ambience = this.context.createGain();
    this.ambience.gain.value = 0.12;
    this.ambience.connect(this.master);
  }

  private rebuildAmbience(): void {
    if (!this.context || !this.ambience) return;
    this.clearAmbience(false);
    const zoneConfig: Record<Zone, { frequency: number; gain: number; wobble: number; noise: number }> = {
      interior: { frequency: 46, gain: 0.12, wobble: 0.08, noise: 0.015 },
      airlock: { frequency: 61, gain: 0.13, wobble: 0.14, noise: 0.022 },
      eva: { frequency: 32, gain: 0.035, wobble: 0.03, noise: 0.003 },
      ship: { frequency: 72, gain: 0.11, wobble: 0.18, noise: 0.012 },
      planet: { frequency: 38, gain: 0.07, wobble: 0.05, noise: 0.028 },
    };
    const config = zoneConfig[this.zone];
    const oscillator = this.context.createOscillator();
    const oscillatorGain = this.context.createGain();
    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = config.frequency;
    oscillatorGain.gain.value = config.gain;
    lfo.frequency.value = config.wobble;
    lfoGain.gain.value = config.frequency * 0.025;
    lfo.connect(lfoGain).connect(oscillator.frequency);
    oscillator.connect(oscillatorGain).connect(this.ambience);

    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer(2);
    noise.loop = true;
    const lowPass = this.context.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = this.zone === 'planet' ? 1050 : 240;
    const noiseGain = this.context.createGain();
    noiseGain.gain.value = config.noise;
    noise.connect(lowPass).connect(noiseGain).connect(this.ambience);
    oscillator.start();
    lfo.start();
    noise.start();
    this.ambienceNodes.push(oscillator, oscillatorGain, lfo, lfoGain, noise, lowPass, noiseGain);
  }

  private clearAmbience(disconnectBus = true): void {
    for (const node of this.ambienceNodes) {
      if ('stop' in node) {
        try { (node as OscillatorNode | AudioBufferSourceNode).stop(); } catch { /* already stopped */ }
      }
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    this.ambienceNodes = [];
    if (disconnectBus && this.ambience) this.ambience.gain.value = 0;
  }

  private tone(
    at: number,
    frequency: number,
    duration: number,
    gain: number,
    type: OscillatorType,
    glide: number,
  ): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + glide), at + duration);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.02, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private noiseBurst(at: number, duration: number, gain: number, low: number, high: number): void {
    if (!this.context || !this.master) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer(Math.max(0.1, duration));
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = (low + high) / 2;
    filter.Q.value = Math.max(0.2, filter.frequency.value / Math.max(1, high - low));
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(envelope).connect(this.master);
    source.start(at);
    source.stop(at + duration);
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    if (!this.context) throw new Error('Audio context unavailable');
    const frames = Math.ceil(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < frames; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      data[index] = previous;
    }
    return buffer;
  }

  private now(): number {
    return this.context?.currentTime ?? 0;
  }
}

export default AudioSystem;
