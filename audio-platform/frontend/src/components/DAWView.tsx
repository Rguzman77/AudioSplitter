import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Music2, Scissors, Download, Play, Pause,
  SkipBack, SkipForward, Repeat, Volume2, MoreVertical, Lock,
  X, Activity, Timer,
} from "lucide-react";
import { stemDownloadUrl, zipDownloadUrl } from "../lib/api";
import type { Job, TempoResult, TransposeResult } from "../lib/api";
import MetronomePanel from "./MetronomePanel";
import TransposePanel from "./TransposePanel";
import { useAudioEngine } from "../hooks/useAudioEngine";

const STEM_LABELS: Record<string, string> = {
  vocals:  "Voz",
  drums:   "Batería",
  bass:    "Bajo",
  guitar:  "Guitarra",
  piano:   "Piano",
  other:   "Otro",
};

interface TrackState {
  stemName: string;
  muted:    boolean;
  solo:     boolean;
  volume:   number;
}

type ActivePanel = null | "tempo" | "transpose";

interface Props {
  job: Job;
}

const WAVE_COLOR    = "#00cfc0";
const WAVE_PROGRESS = "#006b65";
const TRACK_HEIGHT  = 88;

export default function DAWView({ job }: Props) {
  const stemNames = Object.keys(job.stems ?? {});
  const masterStem = stemNames[0] ?? "";

  // ─── Audio engine (soundtouch en AudioWorklet) ──────────────────────
  const engine = useAudioEngine(masterStem);

  // ─── WaveSurfer (visualización solamente) ────────────────────────────
  const [activeStemUrls, setActiveStemUrls] = useState<Record<string, string> | null>(null);

  const getUrl = useCallback(
    (stemName: string) =>
      activeStemUrls?.[stemName] ?? stemDownloadUrl(job.id, stemName),
    [job.id, activeStemUrls],
  );

  const [tracks, setTracks] = useState<TrackState[]>(() =>
    stemNames.map(n => ({ stemName: n, muted: false, solo: false, volume: 1 })),
  );
  const [readyCount, setReadyCount] = useState(0);
  const [wsDuration, setWsDuration] = useState(0);

  // ─── Loop A-B ────────────────────────────────────────────────────────
  const [loopActive, setLoopActive] = useState(false);
  const [loopStart,  setLoopStart]  = useState<number | null>(null);
  const [loopEnd,    setLoopEnd]    = useState<number | null>(null);

  // ─── Metrónomo sincronizado ──────────────────────────────────────────
  // El estado vive aquí (no en MetronomePanel) para que el click siga sonando
  // aunque se cierre el panel. La generación del click la hace el StemEngine,
  // sobre el mismo AudioContext/reloj que el audio → siempre sincronizado.
  const [metroEnabled,     setMetroEnabled]     = useState(false);
  const [metroBpm,         setMetroBpm]         = useState(job.bpm ?? 120);
  const [metroBeatsPerBar, setMetroBeatsPerBar] = useState(4);
  const [metroVolume,      setMetroVolume]      = useState(0.4);
  const [metroOffset,      setMetroOffset]      = useState(0);

  // ─── UI state ────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  // ─── Refs ─────────────────────────────────────────────────────────────
  const wsMap         = useRef<Map<string, WaveSurfer>>(new Map());
  const containerMap  = useRef<Map<string, HTMLDivElement>>(new Map());
  const buffersRef    = useRef<Record<string, AudioBuffer>>({});
  const readyNamesRef = useRef<Set<string>>(new Set());
  // Contexto SOLO para decodificar a calidad nativa el audio del motor. No se
  // usa el buffer de WaveSurfer (decodifica a 8 kHz → suena "a tubo").
  const decodeCtxRef  = useRef<AudioContext | null>(null);

  const duration = engine.duration || wsDuration;
  const allReady = stemNames.length > 0 && readyCount >= stemNames.length && engine.isReady;

  // ─── Sync loop region to engine ──────────────────────────────────────
  // Depend on the STABLE function ref, not the whole `engine` object: `engine`
  // is a fresh literal every render, so depending on it would re-fire this
  // effect on every currentTime tick (~8×/s) and restart playback → stutter.
  const { setLoopRegion } = engine;
  useEffect(() => {
    if (loopActive) {
      setLoopRegion(loopStart, loopEnd);
    } else {
      setLoopRegion(null, null);
    }
  }, [loopActive, loopStart, loopEnd, setLoopRegion]);

  // ─── Sync metronome config to engine ────────────────────────────────
  // Función estable (no el objeto `engine`) en deps, igual que loop/mute, para
  // no re-disparar este efecto en cada tick de currentTime.
  const { setMetronome } = engine;
  useEffect(() => {
    setMetronome({
      enabled:     metroEnabled,
      bpm:         metroBpm,
      beatsPerBar: metroBeatsPerBar,
      volume:      metroVolume,
      offset:      metroOffset,
    });
  }, [metroEnabled, metroBpm, metroBeatsPerBar, metroVolume, metroOffset, setMetronome]);

  // ─── Sync waveform cursor with engine position (rAF) ─────────────────
  // WaveSurfer is muted — we move its cursor manually. We read the engine's
  // ref (not React state) inside a rAF loop so cursors stay smooth at 60fps
  // without forcing React re-renders that would starve the audio thread.
  useEffect(() => {
    if (!engine.isPlaying) return;
    let raf = 0;
    const tick = () => {
      const t = engine.currentTimeRef.current;
      wsMap.current.forEach(ws => ws.setTime(t));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine.isPlaying, engine.currentTimeRef]);

  // ─── Init WaveSurfer instances (visualization only) ──────────────────
  useEffect(() => {
    if (!stemNames.length) return;

    buffersRef.current = {};
    readyNamesRef.current = new Set();
    const created: WaveSurfer[] = [];

    stemNames.forEach((stemName, idx) => {
      const container = containerMap.current.get(stemName);
      if (!container) return;

      const ws = WaveSurfer.create({
        container,
        waveColor:     WAVE_COLOR,
        progressColor: WAVE_PROGRESS,
        cursorColor:   "#ffffff",
        cursorWidth:   2,
        height:        TRACK_HEIGHT,
        barWidth:      2,
        barGap:        1,
        barRadius:     2,
        normalize:     true,
        interact:      false,
        fillParent:    true,
        url:           getUrl(stemName),
      });

      ws.on("ready", async () => {
        if (idx === 0) setWsDuration(ws.getDuration());

        // Mute WaveSurfer — engine handles audio
        ws.setMuted(true);

        // Decodificar el stem a CALIDAD NATIVA para el motor. A propósito NO se
        // usa ws.getDecodedData(): WaveSurfer decodifica a 8 kHz (calidad de
        // teléfono) para dibujar la onda de forma eficiente, lo que haría sonar
        // la reproducción apagada / "a través de un tubo". El motor necesita el
        // audio a su tasa nativa.
        try {
          const ctx = (decodeCtxRef.current ??= new AudioContext());
          const resp = await fetch(getUrl(stemName));
          const arr = await resp.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr);
          buffersRef.current[stemName] = buf;
          readyNamesRef.current.add(stemName);

          if (readyNamesRef.current.size === stemNames.length) {
            engine.loadStems({ ...buffersRef.current });
          }
        } catch (err) {
          console.error("[audio] fallo al decodificar stem", stemName, err);
        }

        setReadyCount(prev => prev + 1);
      });

      wsMap.current.set(stemName, ws);
      created.push(ws);
    });

    return () => {
      created.forEach(ws => ws.destroy());
      wsMap.current.clear();
      decodeCtxRef.current?.close().catch(() => {});
      decodeCtxRef.current = null;
      setReadyCount(0);
      setWsDuration(0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemNames.join(","), JSON.stringify(activeStemUrls)]);

  // ─── Apply mute / solo / volume via engine ────────────────────────────
  // Use stable function refs (not the whole engine object) to avoid firing
  // this effect on every currentTime tick — which would produce audio artifacts.
  const { setStemVolume, setStemMuted, setStemSolo } = engine;
  useEffect(() => {
    const hasSolo = tracks.some(t => t.solo);
    tracks.forEach(({ stemName, muted, solo, volume }) => {
      setStemVolume(stemName, volume);
      setStemMuted(stemName, hasSolo ? !solo : muted);
      setStemSolo(stemName, solo);
    });
  }, [tracks, setStemVolume, setStemMuted, setStemSolo]);

  // ─── Transport controls ───────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    if (!allReady) return;
    if (engine.isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
  }, [allReady, engine]);

  const handleSkipBack = useCallback(() => {
    engine.pause();
    engine.seek(0);
    wsMap.current.forEach(ws => ws.setTime(0));
  }, [engine]);

  const handleSeek = useCallback((val: number) => {
    engine.seek(val);
    wsMap.current.forEach(ws => ws.setTime(val));
  }, [engine]);

  const handleSkipForward = useCallback(() => {
    handleSeek(Math.min(engine.currentTime + 10, duration));
  }, [engine.currentTime, duration, handleSeek]);

  // Avanza/retrocede la reproducción una cantidad de segundos (con clamp).
  const handleSeekRelative = useCallback((delta: number) => {
    if (!duration) return;
    handleSeek(Math.max(0, Math.min(engine.currentTime + delta, duration)));
  }, [engine.currentTime, duration, handleSeek]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────
  // Espacio → play/pausa · ←/→ → retroceder/avanzar 5 s.
  // Se ignora cuando el foco está en un control de formulario para no pisar
  // su comportamiento nativo (sliders, inputs, etc.).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        handlePlayPause();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSeekRelative(5);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleSeekRelative(-5);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePlayPause, handleSeekRelative]);

  // ─── Waveform interaction: click = seek · drag = set loop region ──────
  // Live drag selection (fractions 0-1) rendered as an overlay while dragging.
  const [dragSel, setDragSel] = useState<{ a: number; b: number } | null>(null);

  const handleWaveformMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!duration || e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect.width) return;

      const toFrac = (clientX: number) =>
        Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));

      const startFrac = toFrac(e.clientX);
      let lastFrac = startFrac;
      let moved = false;
      setDragSel({ a: startFrac, b: startFrac });

      const onMove = (ev: MouseEvent) => {
        lastFrac = toFrac(ev.clientX);
        if (Math.abs(lastFrac - startFrac) * rect.width > 4) moved = true;
        setDragSel({ a: startFrac, b: lastFrac });
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setDragSel(null);

        if (!moved) {
          // Plain click → seek to that point
          handleSeek(startFrac * duration);
          return;
        }
        // Drag → set loop region A→B
        const lo = Math.min(startFrac, lastFrac) * duration;
        const hi = Math.max(startFrac, lastFrac) * duration;
        setLoopStart(lo);
        setLoopEnd(hi);
        setLoopActive(true);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [duration, handleSeek],
  );

  // ─── Track controls ───────────────────────────────────────────────────
  const toggleMute   = (name: string) =>
    setTracks(p => p.map(t => t.stemName === name ? { ...t, muted: !t.muted } : t));
  const toggleSolo   = (name: string) =>
    setTracks(p => p.map(t => t.stemName === name ? { ...t, solo: !t.solo } : t));
  const changeVolume = (name: string, vol: number) =>
    setTracks(p => p.map(t => t.stemName === name ? { ...t, volume: vol } : t));

  // ─── Panel handlers ───────────────────────────────────────────────────
  const togglePanel = (panel: "tempo" | "transpose") =>
    setActivePanel(p => p === panel ? null : panel);

  const handleTempoResult = (r: TempoResult) => setActiveStemUrls(r.stem_urls);
  const handleTransposeResult = (r: TransposeResult) => setActiveStemUrls(r.stem_urls);

  // ─── Loop A-B helpers ─────────────────────────────────────────────────
  const handleSetLoopA = () => {
    setLoopStart(engine.currentTime);
    setLoopActive(true);
  };
  const handleSetLoopB = () => {
    setLoopEnd(engine.currentTime);
    setLoopActive(true);
  };
  const handleClearLoop = () => {
    setLoopStart(null);
    setLoopEnd(null);
    setLoopActive(false);
  };

  // ─── Metrónomo: alinear la rejilla con el momento actual ──────────────
  // Coloca el "tiempo 1" en la posición de reproducción actual ajustando el
  // desfase: útil cuando hay intro/anacrusa o el BPM detectado va corrido.
  const handleAlignMetro = useCallback(() => {
    const beatLen = 60 / (metroBpm || 120);
    const off = ((engine.currentTime % beatLen) + beatLen) % beatLen;
    setMetroOffset(off);
  }, [metroBpm, engine.currentTime]);

  // ─── Helpers ──────────────────────────────────────────────────────────
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const setContainerRef = (stemName: string) => (el: HTMLDivElement | null) => {
    if (el) containerMap.current.set(stemName, el);
  };

  const rulerMarks = duration > 0
    ? Array.from({ length: 9 }, (_, i) => ({ pct: (i + 1) / 10, t: ((i + 1) / 10) * duration }))
    : [];

  // ─── Click track visuals ──────────────────────────────────────────────
  const beatDurationSecs = 60 / (metroBpm || 120);
  const beatPct          = duration > 0 ? Math.max(0.3, (beatDurationSecs / duration) * 100) : 0;
  const measurePct       = beatPct * (metroBeatsPerBar > 0 ? metroBeatsPerBar : 4);
  const adjustedTime     = engine.currentTime - metroOffset;
  const beatPhase        = beatDurationSecs > 0
    ? ((adjustedTime % beatDurationSecs) + beatDurationSecs) % beatDurationSecs / beatDurationSecs
    : 0;
  const isOnBeat = beatPhase < 0.12 && engine.isPlaying && metroEnabled;

  // Loop region + live drag overlays (shared across all waveform tracks)
  const loopOverlay =
    loopActive && loopStart !== null && loopEnd !== null && duration > 0 ? (
      <div
        className="daw-loop-region"
        style={{
          left:  `${(loopStart / duration) * 100}%`,
          width: `${((loopEnd - loopStart) / duration) * 100}%`,
        }}
      />
    ) : null;

  const dragOverlay =
    dragSel && duration > 0 ? (
      <div
        className="daw-loop-region daw-loop-region-drag"
        style={{
          left:  `${Math.min(dragSel.a, dragSel.b) * 100}%`,
          width: `${Math.abs(dragSel.a - dragSel.b) * 100}%`,
        }}
      />
    ) : null;

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="daw-root">

      {/* ═══ Top header ═══════════════════════════════════════════════════ */}
      <div className="daw-header">
        <Link to="/" className="daw-btn-icon" title="Volver al inicio">
          <ArrowLeft size={17} />
        </Link>
        <Music2 size={17} className="text-gray-500 flex-shrink-0" />
        <h1 className="flex-1 min-w-0 font-semibold text-sm truncate">{job.title}</h1>

        <Link to="/" className="daw-pill">
          <Scissors size={13} />
          Separar pistas
        </Link>

        <button
          onClick={() => togglePanel("tempo")}
          title="Ajustar tempo"
          className={`daw-pill font-mono gap-1 ${activePanel === "tempo" ? "border-[#a855f7] text-[#a855f7]" : ""}`}
        >
          <Activity size={12} />
          <span className="font-bold">{job.bpm ? Math.round(job.bpm) : "—"}</span>
          <span className="text-gray-500 text-[10px]">BPM</span>
        </button>

        <button
          onClick={() => togglePanel("transpose")}
          title="Transposición de tono"
          className={`daw-pill font-mono ${activePanel === "transpose" ? "border-[#a855f7] text-[#a855f7]" : ""}`}
        >
          {activeStemUrls ? "✓ Exportado" : "Tono ♪"}
        </button>

        <a href={zipDownloadUrl(job.id)} download className="daw-pill">
          <Download size={13} />
          Exportar
        </a>

        <button className="daw-btn-icon text-gray-500">
          <MoreVertical size={16} />
        </button>
      </div>

      {/* ═══ Track area ════════════════════════════════════════════════════ */}
      <div className="daw-tracks-area">

        {/* Timeline ruler */}
        <div className="flex h-6 border-b border-[#252525] bg-[#181818] flex-shrink-0">
          <div className="daw-track-label-col border-r border-[#252525]" />
          <div className="flex-1 relative overflow-hidden">
            {rulerMarks.map(({ pct, t }) => (
              <div
                key={pct}
                className="absolute top-0 bottom-0 border-l border-[#2e2e2e] flex items-end pb-0.5 pl-0.5"
                style={{ left: `${pct * 100}%` }}
              >
                <span className="text-[9px] text-gray-600 select-none">{fmt(t)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stem tracks */}
        {tracks.map(track => (
          <div key={track.stemName} className="daw-track">

            {/* Left control panel */}
            <div className="daw-track-label-col daw-track-controls">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => toggleMute(track.stemName)}
                  title={track.muted ? "Activar pista" : "Mutear pista"}
                  className={`daw-ms-btn ${track.muted ? "daw-ms-btn-active-m" : ""}`}
                >M</button>
                <button
                  onClick={() => toggleSolo(track.stemName)}
                  title={track.solo ? "Quitar solo" : "Solo"}
                  className={`daw-ms-btn ${track.solo ? "daw-ms-btn-active-s" : ""}`}
                >S</button>
                <span className="text-sm font-medium text-gray-200">
                  {STEM_LABELS[track.stemName] ?? track.stemName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0} max={1} step={0.01}
                  value={track.volume}
                  onChange={e => changeVolume(track.stemName, parseFloat(e.target.value))}
                  className="flex-1 daw-vol-slider"
                  title={`Volumen: ${Math.round(track.volume * 100)}%`}
                />
                <div className="flex flex-col items-center gap-0.5">
                  <div className="daw-pan-knob" title="Pan (próximamente)">
                    <div className="daw-pan-indicator" />
                  </div>
                  <div className="flex justify-between w-full text-[8px] text-gray-600 leading-none">
                    <span>L</span><span>R</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Waveform — click to seek · drag to set loop region */}
            <div
              className="flex-1 relative bg-[#0a0a0a] cursor-crosshair overflow-hidden"
              ref={setContainerRef(track.stemName)}
              onMouseDown={handleWaveformMouseDown}
            >
              {loopOverlay}
              {dragOverlay}
            </div>
          </div>
        ))}

        {/* ─── Click / Metronome track ──────────────────────────────── */}
        <div className="daw-track">
          <div className="daw-track-label-col daw-track-controls">
            {/* M toggle: off = muted (M lit), on = active */}
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setMetroEnabled(v => !v)}
                title={metroEnabled ? "Silenciar click" : "Activar click"}
                className={`daw-ms-btn ${!metroEnabled ? "daw-ms-btn-active-m" : ""}`}
              >M</button>
              <Timer
                size={11}
                className={`flex-shrink-0 transition-colors duration-75 ${isOnBeat ? "text-[#a855f7]" : "text-gray-500"}`}
              />
              <span className="text-sm font-medium text-gray-200">Click</span>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0} max={1} step={0.01}
                value={metroVolume}
                onChange={e => setMetroVolume(parseFloat(e.target.value))}
                className="flex-1 daw-vol-slider"
                title={`Volumen click: ${Math.round(metroVolume * 100)}%`}
                disabled={!metroEnabled}
              />
              <div className="w-6 flex-shrink-0" />
            </div>

            {/* BPM control */}
            <div className="flex items-center gap-1 mt-1.5">
              <button
                onClick={() => setMetroBpm(v => Math.max(40, v - 1))}
                className="w-5 h-5 rounded bg-[#1e1e1e] hover:bg-[#2a2a2a] text-gray-400 hover:text-white text-xs flex items-center justify-center leading-none"
                title="−1 BPM"
              >−</button>
              <span className="text-[10px] tabular-nums font-mono text-gray-300 w-9 text-center">
                {Math.round(metroBpm)}
              </span>
              <button
                onClick={() => setMetroBpm(v => Math.min(240, v + 1))}
                className="w-5 h-5 rounded bg-[#1e1e1e] hover:bg-[#2a2a2a] text-gray-400 hover:text-white text-xs flex items-center justify-center leading-none"
                title="+1 BPM"
              >+</button>
              <span className="text-[9px] text-gray-600 ml-0.5">BPM</span>
            </div>
          </div>

          {/* Beat grid area — click to seek · drag to loop */}
          <div
            className="flex-1 bg-[#0a0a0a] relative overflow-hidden cursor-crosshair"
            onMouseDown={handleWaveformMouseDown}
            style={{
              backgroundImage: duration > 0 && beatPct > 0
                ? [
                    `repeating-linear-gradient(90deg, transparent, transparent calc(${measurePct}% - 1px), rgba(168,85,247,0.18) calc(${measurePct}% - 1px), rgba(168,85,247,0.18) ${measurePct}%)`,
                    `repeating-linear-gradient(90deg, transparent, transparent calc(${beatPct}% - 1px), rgba(255,255,255,0.05) calc(${beatPct}% - 1px), rgba(255,255,255,0.05) ${beatPct}%)`,
                  ].join(", ")
                : undefined,
            }}
          >
            {loopOverlay}
            {dragOverlay}
            {/* Playhead */}
            {duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-px pointer-events-none"
                style={{
                  left: `${(engine.currentTime / duration) * 100}%`,
                  background: isOnBeat ? "rgba(168,85,247,0.7)" : "rgba(255,255,255,0.3)",
                  transition: "background 60ms",
                }}
              />
            )}
            {/* Muted overlay */}
            {!metroEnabled && (
              <div className="absolute inset-0 bg-[#0a0a0a]/65 flex items-center justify-center pointer-events-none">
                <span className="text-[10px] text-gray-700 tracking-widest uppercase select-none">
                  Silenciado — presiona M para activar
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Velocity track */}
        <div className="daw-track" style={{ minHeight: 56, maxHeight: 56 }}>
          <div
            className="daw-track-label-col daw-track-controls"
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <button className="daw-ms-btn">M</button>
            <button className="daw-ms-btn daw-ms-btn-active-s">S</button>
            <span className="text-xs font-medium text-gray-300 leading-tight">
              Velocidad<br />reproducción
            </span>
          </div>
          <div className="flex-1 bg-[#141414] flex items-center px-4 gap-3">
            {([0.5, 0.75, 1, 1.25, 1.5, 2] as const).map(r => (
              <button
                key={r}
                onClick={() => engine.setTempo(r)}
                className="daw-speed-btn"
              >
                {r}x
              </button>
            ))}
            <div className="ml-auto text-gray-600">
              <Lock size={14} />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Collapsible panel ════════════════════════════════════════════ */}
      {activePanel && (
        <div className="border-t border-[#2a2a2a] bg-[#131313] overflow-y-auto flex-shrink-0 max-h-80">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {activePanel === "tempo" ? "Velocidad & Tempo" : "Transposición de Tono"}
            </span>
            <button
              onClick={() => setActivePanel(null)}
              className="daw-btn-icon text-gray-500"
            >
              <X size={14} />
            </button>
          </div>
          {activeStemUrls && (
            <div className="mx-4 mb-2 px-3 py-1.5 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-xs text-yellow-300 flex items-center justify-between">
              <span>Mostrando versión exportada</span>
              <button
                onClick={() => setActiveStemUrls(null)}
                className="text-yellow-400 hover:text-yellow-200 underline"
              >
                Restaurar original
              </button>
            </div>
          )}
          <div className="px-4 pb-4">
            {activePanel === "tempo" && (
              <MetronomePanel
                jobId={job.id}
                detectedBpm={job.bpm ?? 120}
                currentTime={engine.currentTime}
                isPlaying={engine.isPlaying}
                onTempoChange={engine.setTempo}
                onResult={handleTempoResult}
                metro={{
                  enabled:     metroEnabled,
                  bpm:         metroBpm,
                  beatsPerBar: metroBeatsPerBar,
                  volume:      metroVolume,
                  offset:      metroOffset,
                }}
                setMetroEnabled={setMetroEnabled}
                setMetroBpm={setMetroBpm}
                setMetroBeatsPerBar={setMetroBeatsPerBar}
                setMetroVolume={setMetroVolume}
                onAlignMetro={handleAlignMetro}
              />
            )}
            {activePanel === "transpose" && (
              <TransposePanel
                jobId={job.id}
                onPitchChange={engine.setPitch}
                onResult={handleTransposeResult}
              />
            )}
          </div>
        </div>
      )}

      {/* ═══ Transport bar ════════════════════════════════════════════════ */}
      <div className="daw-transport">
        <button className="daw-btn-icon text-gray-500" title="Volumen global (próximamente)">
          <Volume2 size={17} />
        </button>

        <div className="flex items-center gap-1">
          <button onClick={handleSkipBack} title="Ir al inicio" className="daw-btn-icon">
            <SkipBack size={17} />
          </button>

          <button
            onClick={handlePlayPause}
            disabled={!allReady}
            title={!allReady ? "Cargando audio…" : engine.isPlaying ? "Pausar" : "Reproducir"}
            className={`daw-play-btn ${allReady ? "daw-play-btn-ready" : "daw-play-btn-loading"}`}
          >
            {!allReady ? (
              <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
            ) : engine.isPlaying ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <button onClick={handleSkipForward} title="Avanzar 10s" className="daw-btn-icon">
            <SkipForward size={17} />
          </button>

          {/* Metrónomo sincronizado */}
          <button
            onClick={() => setMetroEnabled(v => !v)}
            title={metroEnabled ? "Desactivar metrónomo" : "Activar metrónomo (sincronizado)"}
            className={`daw-btn-icon ${metroEnabled ? "text-[#a855f7]" : ""}`}
          >
            <Timer size={17} />
          </button>

          {/* Loop toggle */}
          <button
            onClick={() => setLoopActive(v => !v)}
            title={loopActive ? "Desactivar bucle" : "Activar bucle"}
            className={`daw-btn-icon ${loopActive ? "text-[#00cfc0]" : ""}`}
          >
            <Repeat size={17} />
          </button>

          {/* Loop A-B markers */}
          <button
            onClick={handleSetLoopA}
            title={loopStart !== null ? `A fijado en ${fmt(loopStart)} — clic para mover` : "Fijar inicio del bucle (A)"}
            className={`daw-ab-btn ${loopStart !== null ? "daw-ab-btn-set" : ""}`}
          >
            A
          </button>
          <button
            onClick={handleSetLoopB}
            title={loopEnd !== null ? `B fijado en ${fmt(loopEnd)} — clic para mover` : "Fijar fin del bucle (B)"}
            className={`daw-ab-btn ${loopEnd !== null ? "daw-ab-btn-set" : ""}`}
          >
            B
          </button>
          {(loopStart !== null || loopEnd !== null) && (
            <button
              onClick={handleClearLoop}
              title="Limpiar marcadores A-B"
              className="daw-btn-icon text-gray-500 hover:text-red-400"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* A-B region display */}
        {(loopStart !== null || loopEnd !== null) && (
          <span className="text-[10px] text-[#00cfc0] font-mono whitespace-nowrap hidden sm:inline">
            {loopStart !== null ? fmt(loopStart) : "—"}
            {" → "}
            {loopEnd !== null ? fmt(loopEnd) : "—"}
          </span>
        )}

        <span className="daw-time">{fmt(engine.currentTime)}</span>

        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.05}
          value={engine.currentTime}
          onChange={e => handleSeek(parseFloat(e.target.value))}
          className="flex-1 daw-progress-slider"
          title="Posición de reproducción"
        />

        <span className="daw-time">{fmt(duration)}</span>
      </div>
    </div>
  );
}
