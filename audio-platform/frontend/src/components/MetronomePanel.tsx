import { useState, useEffect } from "react";
import { Activity, ChevronDown, ChevronUp, Loader2, Download, Timer, Crosshair } from "lucide-react";
import { useAdjustTempo } from "../hooks/useJobs";
import type { TempoResult } from "../lib/api";

/** Estado del metrónomo elevado a DAWView (el motor genera el click). */
export interface MetroControls {
  enabled:     boolean;
  bpm:         number;
  beatsPerBar: number;
  volume:      number;
  offset:      number;
}

interface Props {
  jobId:         string;
  detectedBpm:   number;
  /** Posición/estado de reproducción — para el pulso visual sincronizado. */
  currentTime:   number;
  isPlaying:     boolean;
  onTempoChange: (rate: number) => void;
  onResult:      (result: TempoResult) => void;

  // ── Metrónomo (controlado desde DAWView) ──
  metro:                MetroControls;
  setMetroEnabled:      (v: boolean) => void;
  setMetroBpm:          (v: number) => void;
  setMetroBeatsPerBar:  (v: number) => void;
  setMetroVolume:       (v: number) => void;
  onAlignMetro:         () => void;
}

const SPEED_PRESETS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2] as const;
const BAR_PRESETS   = [0, 2, 3, 4, 6] as const;

export default function MetronomePanel({
  jobId, detectedBpm, currentTime, isPlaying, onTempoChange, onResult,
  metro, setMetroEnabled, setMetroBpm, setMetroBeatsPerBar, setMetroVolume, onAlignMetro,
}: Props) {
  const [speed, setSpeed]         = useState(1);
  const [targetBpm, setTargetBpm] = useState(detectedBpm); // solo para exportar
  const { mutate, isPending }     = useAdjustTempo(jobId);

  useEffect(() => { setTargetBpm(detectedBpm); }, [detectedBpm]);

  const bpmChanged = Math.abs(targetBpm - detectedBpm) > 0.1;

  const handleSpeedChange = (val: number) => {
    setSpeed(val);
    onTempoChange(val);
  };

  const handleExport = () => {
    mutate({ target_bpm: targetBpm }, { onSuccess: (r) => onResult(r) });
  };

  // ── Pulso visual: derivado de la posición real de reproducción ──────────
  // Comparte la misma rejilla que el motor (offset + n·60/bpm) → el destello
  // coincide con el click audible. currentTime se refresca ~8×/s, suficiente.
  const beatLen   = 60 / (metro.bpm || 120);
  const beatIndex = metro.enabled && isPlaying
    ? Math.floor((currentTime - metro.offset) / beatLen)
    : -1;
  const isDownbeat = metro.beatsPerBar > 0
    && (((beatIndex % metro.beatsPerBar) + metro.beatsPerBar) % metro.beatsPerBar === 0);

  return (
    <div className="bg-surface-1 border border-surface-3 rounded-xl p-5 space-y-4">

      {/* ── Velocidad de reproducción (tiempo real) ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-accent" />
          <h3 className="font-semibold text-sm">Velocidad de reproducción</h3>
          <span className="ml-auto text-[10px] text-[#00cfc0] font-mono bg-[#00cfc0]/10 px-2 py-0.5 rounded-full">
            En tiempo real
          </span>
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums">{speed.toFixed(2)}x</div>
            <div className="text-xs text-gray-500">velocidad</div>
          </div>
          <div className="flex-1">
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={speed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>0.25x</span><span>1x</span><span>2x</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {SPEED_PRESETS.map((r) => (
            <button
              key={r}
              onClick={() => handleSpeedChange(r)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors
                ${Math.abs(speed - r) < 0.01
                  ? "bg-accent text-white"
                  : "bg-surface-2 hover:bg-surface-3 text-gray-400"}`}
            >
              {r}x
            </button>
          ))}
          <button
            onClick={() => handleSpeedChange(1)}
            className="ml-auto text-xs text-gray-500 hover:text-white transition-colors"
          >
            Resetear
          </button>
        </div>
      </div>

      <div className="border-t border-surface-3" />

      {/* ── Metrónomo sincronizado ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Timer size={16} className={metro.enabled ? "text-[#a855f7]" : "text-gray-500"} />
          <h3 className="font-semibold text-sm">Metrónomo</h3>
          <span className="ml-auto text-[10px] text-[#a855f7] font-mono bg-[#a855f7]/10 px-2 py-0.5 rounded-full">
            Sincronizado
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div
              key={beatIndex}
              className="w-5 h-5 rounded-full"
              style={{
                background: isDownbeat ? "#a855f7" : "#00cfc0",
                animation: beatIndex >= 0 ? "metroFlash 0.18s ease-out" : "none",
                opacity: beatIndex >= 0 ? 1 : 0.3,
              }}
            />
            <div>
              <div className="text-3xl font-bold tabular-nums">{Math.round(metro.bpm)}</div>
              <div className="text-xs text-gray-500">BPM</div>
            </div>
          </div>

          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">Detectado: {Math.round(detectedBpm)} BPM</div>
            <input
              type="range"
              min={40}
              max={240}
              step={0.5}
              value={metro.bpm}
              onChange={(e) => setMetroBpm(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>40</span><span>240</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-3">
          {[-5, -1].map((d) => (
            <button
              key={d}
              onClick={() => setMetroBpm(Math.max(40, metro.bpm + d))}
              className="flex items-center gap-0.5 px-2.5 py-1 bg-surface-2 hover:bg-surface-3 rounded-lg text-xs transition-colors"
            >
              <ChevronDown size={12} /> {Math.abs(d)}
            </button>
          ))}
          {[1, 5].map((d) => (
            <button
              key={d}
              onClick={() => setMetroBpm(Math.min(240, metro.bpm + d))}
              className="flex items-center gap-0.5 px-2.5 py-1 bg-surface-2 hover:bg-surface-3 rounded-lg text-xs transition-colors"
            >
              <ChevronUp size={12} /> {d}
            </button>
          ))}
          <button
            onClick={() => setMetroBpm(detectedBpm)}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            = detectado
          </button>
        </div>

        {/* Compás (acento del primer tiempo) */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-gray-500">Compás</span>
          {BAR_PRESETS.map((b) => (
            <button
              key={b}
              onClick={() => setMetroBeatsPerBar(b)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors
                ${metro.beatsPerBar === b
                  ? "bg-[#a855f7] text-white"
                  : "bg-surface-2 hover:bg-surface-3 text-gray-400"}`}
              title={b === 0 ? "Sin acento" : `${b}/4`}
            >
              {b === 0 ? "—" : `${b}/4`}
            </button>
          ))}
        </div>

        {/* Volumen del click */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs text-gray-500 w-16">Volumen</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={metro.volume}
            onChange={(e) => setMetroVolume(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs text-gray-500 w-10 text-right tabular-nums">
            {Math.round(metro.volume * 100)}%
          </span>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setMetroEnabled(!metro.enabled)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors
              ${metro.enabled
                ? "bg-[#a855f7]/20 border border-[#a855f7] text-[#a855f7]"
                : "bg-surface-2 hover:bg-surface-3"}`}
          >
            {metro.enabled ? "Detener metrónomo" : "Activar metrónomo"}
          </button>
          <button
            onClick={onAlignMetro}
            title="Coloca el tiempo 1 en la posición actual de reproducción"
            className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface-3 border border-surface-3 rounded-lg text-sm font-medium transition-colors"
          >
            <Crosshair size={14} />
            Alinear con beat actual
          </button>
        </div>
      </div>

      <div className="border-t border-surface-3" />

      {/* ── Tempo (exportar versión modificada) ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-gray-500" />
          <h3 className="font-semibold text-sm text-gray-400">Exportar con otro tempo</h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold tabular-nums w-16">{Math.round(targetBpm)}</div>
          <input
            type="range"
            min={40}
            max={240}
            step={0.5}
            value={targetBpm}
            onChange={(e) => setTargetBpm(parseFloat(e.target.value))}
            className="flex-1"
          />
          <button
            onClick={() => setTargetBpm(detectedBpm)}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            Resetear
          </button>
        </div>

        <button
          onClick={handleExport}
          disabled={!bpmChanged || isPending}
          className="flex items-center gap-2 px-4 py-2 mt-3 bg-surface-2 hover:bg-surface-3 border border-surface-3 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Exportar tempo modificado
        </button>
      </div>

      <style>{`
        @keyframes metroFlash {
          0%   { transform: scale(1.7); filter: brightness(1.8); }
          100% { transform: scale(1);   filter: brightness(1); }
        }
      `}</style>
    </div>
  );
}
