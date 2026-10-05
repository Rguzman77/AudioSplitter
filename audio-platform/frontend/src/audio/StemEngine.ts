import workletUrl from "./soundtouch-worklet.js?url";
import { semitonesToRatio } from "./pitch";

/**
 * StemEngine — capa de reproducción multipista, agnóstica de React.
 *
 * Responsabilidad única: poseer el AudioContext, un GainNode por stem y el
 * "transporte" (play/pause/seek/loop). Usa DOS modos de reproducción según se
 * esté transformando el audio o no:
 *
 *   • MODO DIRECTO (pitch=0 y tempo=1) → un `AudioBufferSourceNode` nativo por
 *     stem, todos programados al mismo instante del reloj del AudioContext.
 *     Reproducción sample-exact, SIN pérdida y perfectamente sincronizada. Es
 *     el caso por defecto y el más común.
 *
 *   • MODO SHIFTED (pitch≠0 o tempo≠1) → un `AudioWorkletNode` (soundtouch /
 *     WSOLA) por stem, en el hilo de audio. Solo aquí se time-stretch, porque
 *     es la única forma de cambiar el tono sin alterar la duración. WSOLA tiene
 *     pérdida, pero solo se activa cuando el usuario lo pide explícitamente.
 *
 * Por qué híbrido: pasar SIEMPRE por WSOLA (incluso sin transponer) degradaba
 * la calidad y, al procesarse cada pista de forma independiente, las hacía
 * sonar desfasadas/"raras". La reproducción nativa elimina ambos problemas en
 * el caso normal.
 *
 * Separación pitch / tempo: `setPitch` y `setTempo` son operaciones totalmente
 * independientes — cada una toca su propio estado. Cambiar el tono NUNCA
 * modifica el tempo ni viceversa.
 */

export interface StemEngineCallbacks {
  /** Posición de reproducción (segundos). */
  onPosition?: (time: number) => void;
  /** El material llegó a su fin sin loop activo. */
  onEnded?: () => void;
}

/** Estado del metrónomo. La rejilla de beats vive en el tiempo de la CANCIÓN:
 *  un beat ocurre en `offset + n*(60/bpm)` segundos. El scheduler proyecta esos
 *  instantes al reloj del AudioContext, así que el click sigue al transporte
 *  (play/pausa/seek/loop) y a la velocidad de reproducción sin desincronizarse. */
export interface MetronomeState {
  enabled: boolean;
  /** Pulsos por minuto del click (normalmente = BPM detectado de la canción). */
  bpm: number;
  /** Pulsos por compás; el primero de cada compás se acentúa. 0 = sin acento. */
  beatsPerBar: number;
  /** Volumen del click (0–1). */
  volume: number;
  /** Desfase (s) del primer beat en el tiempo de la canción, para alinear la
   *  rejilla con el groove real (intro, anacrusa, detección imprecisa…). */
  offset: number;
}

const SCHEDULE_AHEAD = 0.03; // s — headroom para programar todos los stems a la vez

export class StemEngine {
  private ctx: AudioContext | null = null;
  private gains = new Map<string, GainNode>();
  private buffers = new Map<string, AudioBuffer>();

  // Fuentes activas según el modo.
  private directSources = new Map<string, AudioBufferSourceNode>();
  private workletNodes = new Map<string, AudioWorkletNode>();

  private masterName = "";
  private sampleRate = 44100;
  private duration = 0;
  private moduleAdded = false;

  private mode: "direct" | "shifted" = "direct";
  private playing = false;
  private position = 0; // segundos — fuente de verdad de la posición de transporte

  // Reloj del modo directo.
  private directStartCtxTime = 0;
  private directBaseOffset = 0;
  private rafId: number | null = null;

  // ── Estado de transformaciones (única fuente de verdad) ──────────────
  private pitchSemitones = 0;
  private tempoRate = 1;
  private loop: { start: number | null; end: number | null } = { start: null, end: null };

  // ── Estado de mezcla ─────────────────────────────────────────────────
  private mute = new Map<string, boolean>();
  private solo = new Set<string>();
  private volume = new Map<string, number>();

  // ── Metrónomo ─────────────────────────────────────────────────────────
  private readonly METRO_LOOKAHEAD = 0.12; // s — ventana de programación adelantada
  private readonly METRO_INTERVAL = 25;    // ms — periodo del scheduler (setInterval)
  private metro: MetronomeState = { enabled: false, bpm: 120, beatsPerBar: 4, volume: 0.4, offset: 0 };
  private metroTimer: ReturnType<typeof setInterval> | null = null;
  private metroNextBeat = 0;       // índice del próximo beat a programar
  private metroNextCtxTime = 0;    // instante (reloj ctx) del próximo beat
  private metroAnchorCtx = 0;      // ancla del modelo: ctx.currentTime en el resync
  private metroAnchorSong = 0;     // ancla del modelo: posición de canción en el resync

  constructor(
    private masterStem: string,
    private cb: StemEngineCallbacks = {},
  ) {}

  getDuration(): number {
    return this.duration;
  }

  /** Construye el contexto y los GainNode. Idempotente. Resuelve cuando todo
   *  está listo para sonar (el worklet queda registrado por si se transpone). */
  async load(buffers: Record<string, AudioBuffer>): Promise<void> {
    await this.teardown();

    const names = Object.keys(buffers);
    if (!names.length) return;

    const masterName = names.includes(this.masterStem) ? this.masterStem : names[0];
    this.masterName = masterName;
    this.sampleRate = buffers[masterName].sampleRate;
    this.duration = buffers[masterName].duration;

    // Igualar el sample rate del contexto al de los buffers decodificados.
    const ctx = new AudioContext({ sampleRate: this.sampleRate });
    this.ctx = ctx;
    await ctx.audioWorklet.addModule(workletUrl);
    this.moduleAdded = true;

    for (const name of names) {
      this.buffers.set(name, buffers[name]);
      const gain = ctx.createGain();
      gain.gain.value = this.volume.get(name) ?? 1;
      gain.connect(ctx.destination);
      this.gains.set(name, gain);
    }

    this.position = 0;
    this.playing = false;
    this.mode = this.needsShift() ? "shifted" : "direct";
    this.applyMixStates();

    // En modo shifted preparamos los nodos worklet ya (en pausa). En directo no
    // creamos fuentes hasta el play (los AudioBufferSourceNode son de un solo uso).
    if (this.mode === "shifted") this.createWorkletNodes(this.position);
  }

  // ── Transporte ────────────────────────────────────────────────────────
  play(): void {
    if (!this.ctx || this.playing) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.playing = true;

    if (this.mode === "direct") {
      this.startDirectSources(this.position);
      this.startRaf();
    } else {
      this.broadcastWorklet({ type: "play" });
    }
    if (this.metro.enabled) this.metroStart();
  }

  pause(): void {
    if (!this.playing) return;
    this.position = this.currentPosition();
    this.playing = false;
    this.metroStop();

    if (this.mode === "direct") {
      this.stopRaf();
      this.stopDirectSources();
    } else {
      this.broadcastWorklet({ type: "pause" });
    }
    this.cb.onPosition?.(this.position);
  }

  seek(time: number): void {
    this.position = this.clampTime(time);

    if (this.mode === "direct") {
      if (this.playing) {
        this.stopDirectSources();
        this.startDirectSources(this.position);
      }
    } else {
      this.broadcastWorklet({ type: "seek", sourcePosition: this.timeToSource(this.position) });
    }
    if (this.metroTimer !== null) this.metroResync();
    this.cb.onPosition?.(this.position);
  }

  // ── Transformaciones — pitch y tempo INDEPENDIENTES ──────────────────
  setPitch(semitones: number): void {
    this.pitchSemitones = semitones;
    this.reconcileMode();
    if (this.mode === "shifted") {
      this.broadcastWorklet({ type: "pitch", value: semitonesToRatio(semitones) });
    }
    // El cambio de modo pudo reiniciar las fuentes (nuevo ancla de reloj).
    if (this.metroTimer !== null) this.metroResync();
  }

  setTempo(rate: number): void {
    this.tempoRate = rate;
    this.reconcileMode();
    if (this.mode === "shifted") {
      this.broadcastWorklet({ type: "tempo", value: rate });
    }
    // El rate canción↔reloj cambió: el modelo de beats debe reanclar.
    if (this.metroTimer !== null) this.metroResync();
  }

  setLoopRegion(start: number | null, end: number | null): void {
    // Idempotente: si la región no cambia, no tocar nada. Reprogramar las
    // fuentes sin necesidad las reiniciaría y provocaría cortes en el audio.
    if (this.loop.start === start && this.loop.end === end) return;
    this.loop = { start, end };
    // En modo directo el loop es nativo (loopStart/loopEnd del source); hay que
    // reprogramar las fuentes para que tome efecto durante la reproducción.
    if (this.mode === "direct" && this.playing) {
      const pos = this.currentPosition();
      this.position = pos;
      this.stopDirectSources();
      this.startDirectSources(pos);
    }
    if (this.metroTimer !== null) this.metroResync();
  }

  // ── Mezcla (volumen / mute / solo) ───────────────────────────────────
  setVolume(name: string, vol: number): void {
    this.volume.set(name, vol);
    this.applyMixStates();
  }

  setMuted(name: string, muted: boolean): void {
    this.mute.set(name, muted);
    this.applyMixStates();
  }

  setSolo(name: string, solo: boolean): void {
    if (solo) this.solo.add(name);
    else this.solo.delete(name);
    this.applyMixStates();
  }

  private applyMixStates(): void {
    const hasSolo = this.solo.size > 0;
    this.gains.forEach((gain, name) => {
      const muted = this.mute.get(name) ?? false;
      const isSolo = this.solo.has(name);
      const vol = this.volume.get(name) ?? 1;
      gain.gain.value = (hasSolo ? !isSolo : muted) ? 0 : vol;
    });
  }

  // ── Cambio de modo (directo ↔ shifted) ───────────────────────────────
  private needsShift(): boolean {
    return this.pitchSemitones !== 0 || Math.abs(this.tempoRate - 1) > 1e-6;
  }

  private reconcileMode(): void {
    const want: "direct" | "shifted" = this.needsShift() ? "shifted" : "direct";
    if (want === this.mode) return;

    const pos = this.currentPosition();
    const wasPlaying = this.playing;

    // Desmontar las fuentes del modo actual (los GainNode se conservan).
    this.stopRaf();
    this.stopDirectSources();
    this.destroyWorkletNodes();

    this.mode = want;
    this.position = pos;

    if (want === "shifted") {
      this.createWorkletNodes(pos);
      if (wasPlaying) this.broadcastWorklet({ type: "play" });
    } else if (wasPlaying) {
      this.startDirectSources(pos);
      this.startRaf();
    }
  }

  // ── Modo directo: AudioBufferSourceNode nativos ──────────────────────
  private startDirectSources(offset: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const when = ctx.currentTime + SCHEDULE_AHEAD;
    this.directStartCtxTime = when;
    this.directBaseOffset = offset;

    const { start, end } = this.loop;
    const looping = start !== null && end !== null && end > start;

    this.gains.forEach((gain, name) => {
      const buffer = this.buffers.get(name);
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      if (looping) {
        src.loop = true;
        src.loopStart = start!;
        src.loopEnd = end!;
      }
      src.connect(gain);
      if (name === this.masterName && !looping) {
        src.onended = () => this.onDirectEnded();
      }
      src.start(when, offset);
      this.directSources.set(name, src);
    });
  }

  private stopDirectSources(): void {
    this.directSources.forEach((src) => {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        /* ya detenido */
      }
    });
    this.directSources.clear();
  }

  private onDirectEnded(): void {
    if (!this.playing) return;
    this.stopRaf();
    this.stopDirectSources();
    this.metroStop();
    this.playing = false;
    this.position = this.duration;
    this.cb.onEnded?.();
  }

  private startRaf(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      this.position = this.directPosition();
      this.cb.onPosition?.(this.position);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private directPosition(): number {
    if (!this.ctx) return this.position;
    const elapsed = Math.max(0, this.ctx.currentTime - this.directStartCtxTime);
    let pos = this.directBaseOffset + elapsed;
    const { start, end } = this.loop;
    if (start !== null && end !== null && end > start && pos >= end) {
      // El source hace loop nativo en [start,end]; espejamos el cálculo.
      pos = start + ((pos - start) % (end - start));
    }
    return pos;
  }

  // ── Modo shifted: AudioWorkletNode (soundtouch) ──────────────────────
  private createWorkletNodes(position: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.moduleAdded) return;
    const pitchRatio = semitonesToRatio(this.pitchSemitones);
    const sourcePosition = this.timeToSource(position);

    this.gains.forEach((gain, name) => {
      const buf = this.buffers.get(name);
      if (!buf) return;
      const dual = buf.numberOfChannels > 1;
      // Copia fresca de los canales en cada construcción: transferirlos al
      // worklet desconecta el ArrayBuffer, así que nunca tocamos el original.
      const left = buf.getChannelData(0).slice();
      const right = dual ? buf.getChannelData(1).slice() : null;

      const node = new AudioWorkletNode(ctx, "soundtouch-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.connect(gain);

      const isMaster = name === this.masterName;
      const transfer = right ? [left.buffer, right.buffer] : [left.buffer];
      node.port.postMessage(
        { type: "load", left, right, duration: buf.duration, isMaster },
        transfer,
      );
      node.port.postMessage({ type: "pitch", value: pitchRatio });
      node.port.postMessage({ type: "tempo", value: this.tempoRate });
      if (sourcePosition > 0) node.port.postMessage({ type: "seek", sourcePosition });
      if (isMaster) node.port.onmessage = (e) => this.onMasterMessage(e.data);

      this.workletNodes.set(name, node);
    });
  }

  private destroyWorkletNodes(): void {
    this.workletNodes.forEach((node) => {
      try {
        node.port.onmessage = null;
        node.disconnect();
      } catch {
        /* ignore */
      }
    });
    this.workletNodes.clear();
  }

  private onMasterMessage(msg: { type: string; sourcePosition?: number }): void {
    if (msg.type === "position") {
      let t = (msg.sourcePosition ?? 0) / this.sampleRate;
      const { start, end } = this.loop;
      if (end !== null && t >= end) {
        // Loop A-B: el setter de sourcePosition del worklet limpia sus buffers.
        const target = start ?? 0;
        this.broadcastWorklet({ type: "seek", sourcePosition: this.timeToSource(target) });
        t = target;
      }
      this.position = t;
      this.cb.onPosition?.(t);
    } else if (msg.type === "ended") {
      this.metroStop();
      this.playing = false;
      this.position = this.duration;
      this.cb.onEnded?.();
    }
  }

  private broadcastWorklet(msg: Record<string, unknown>): void {
    this.workletNodes.forEach((node) => node.port.postMessage(msg));
  }

  // ── Metrónomo ─────────────────────────────────────────────────────────
  /** Actualiza la configuración del metrónomo. Arranca/detiene/resincroniza el
   *  scheduler según el estado de reproducción. El click solo suena en play. */
  setMetronome(opts: Partial<MetronomeState>): void {
    this.metro = { ...this.metro, ...opts };
    if (!(this.metro.bpm > 0)) this.metro.bpm = 1;

    if (this.metro.enabled && this.playing) {
      if (this.metroTimer === null) this.metroStart();
      else this.metroResync(); // pudo cambiar bpm/offset/compás → reanclar
    } else {
      this.metroStop();
    }
  }

  /** Rate del tiempo de canción frente al reloj de pared: 1 en modo directo,
   *  `tempoRate` en modo shifted (la canción avanza más rápido/lento). */
  private rate(): number {
    return this.mode === "shifted" ? this.tempoRate : 1;
  }

  private metroStart(): void {
    if (this.metroTimer !== null || !this.ctx) return;
    this.metroResync();
    this.metroTimer = setInterval(this.metroSchedule, this.METRO_INTERVAL);
  }

  private metroStop(): void {
    if (this.metroTimer !== null) {
      clearInterval(this.metroTimer);
      this.metroTimer = null;
    }
  }

  /** Reancla el modelo de beats a la posición/instante actuales. Se llama al
   *  arrancar y tras cualquier salto del transporte (seek, loop, tempo). */
  private metroResync(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const rate = this.rate();
    const beatLen = 60 / this.metro.bpm; // segundos de canción por beat
    const ctxNow = ctx.currentTime;
    const songNow = this.currentPosition();
    this.metroAnchorCtx = ctxNow;
    this.metroAnchorSong = songNow;
    // Primer beat estrictamente posterior a la posición actual.
    let n = beatLen > 0 ? Math.ceil((songNow - this.metro.offset - 1e-4) / beatLen) : 0;
    if (!Number.isFinite(n) || n < 0) n = Math.max(0, n || 0);
    const beatSong = this.metro.offset + n * beatLen;
    this.metroNextBeat = n;
    this.metroNextCtxTime = ctxNow + (beatSong - songNow) / rate;
  }

  /** Scheduler de lookahead (patrón "two clocks"): cada tick programa en el
   *  reloj de audio todos los beats que caen dentro de la ventana de adelanto.
   *  La proyección es una extrapolación lineal local válida en cualquier modo;
   *  si el transporte salta (seek/loop/cambio de tempo) se detecta la deriva y
   *  se reancla, de modo que el click no se desincroniza del audio. */
  private metroSchedule = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.metro.enabled || !this.playing) return;
    const rate = this.rate();
    const beatLen = 60 / this.metro.bpm;
    if (!(beatLen > 0)) return;

    const ctxNow = ctx.currentTime;
    const songNow = this.currentPosition();
    // ¿El transporte saltó respecto a nuestro modelo? → reanclar.
    const expectedSong = this.metroAnchorSong + (ctxNow - this.metroAnchorCtx) * rate;
    if (Math.abs(songNow - expectedSong) > 0.05) this.metroResync();

    const horizon = ctxNow + this.METRO_LOOKAHEAD;
    const bpb = this.metro.beatsPerBar;
    while (this.metroNextCtxTime < horizon) {
      if (this.metroNextCtxTime >= ctxNow - 0.005) {
        const accent = bpb > 0 && (((this.metroNextBeat % bpb) + bpb) % bpb === 0);
        this.metroClickAt(Math.max(this.metroNextCtxTime, ctxNow), accent);
      }
      this.metroNextBeat++;
      this.metroNextCtxTime += beatLen / rate;
    }
  };

  /** Programa un click en el instante `when` del reloj de audio. Se conecta
   *  directo al destino (NO pasa por los GainNode de los stems): el click guía
   *  no debe verse afectado por mute/solo/volumen de las pistas. */
  private metroClickAt(when: number, accent: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = accent ? 1600 : 1000;
    const peak = Math.max(this.metro.volume * (accent ? 1 : 0.7), 0.0002);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.start(when);
    osc.stop(when + 0.06);
  }

  // ── Internos ──────────────────────────────────────────────────────────
  private currentPosition(): number {
    if (this.mode === "direct" && this.playing) return this.directPosition();
    return this.position;
  }

  private clampTime(time: number): number {
    if (!this.duration) return 0;
    return Math.max(0, Math.min(time, this.duration));
  }

  private timeToSource(time: number): number {
    const frac = this.duration ? Math.min(time / this.duration, 0.999999) : 0;
    return Math.floor(frac * this.duration * this.sampleRate);
  }

  async teardown(): Promise<void> {
    this.stopRaf();
    this.metroStop();
    this.stopDirectSources();
    this.destroyWorkletNodes();
    this.gains.forEach((gain) => {
      try {
        gain.disconnect();
      } catch {
        /* ignore */
      }
    });
    this.gains.clear();
    this.buffers.clear();
    this.moduleAdded = false;
    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }
}
