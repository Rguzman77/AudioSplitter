import { useState } from "react";
import { Music2, Loader2, Download } from "lucide-react";
import { useTranspose } from "../hooks/useJobs";
import type { TransposeResult } from "../lib/api";

interface Props {
  jobId:         string;
  onPitchChange: (semitones: number) => void;
  onResult:      (result: TransposeResult) => void;
}

export default function TransposePanel({ jobId, onPitchChange, onResult }: Props) {
  const [semitones, setSemitones] = useState(0);
  const { mutate, isPending } = useTranspose(jobId);

  const handleChange = (val: number) => {
    setSemitones(val);
    onPitchChange(val);
  };

  const handleExport = () => {
    if (semitones === 0) return;
    mutate(semitones, { onSuccess: (r) => onResult(r) });
  };

  return (
    <div className="bg-surface-1 border border-surface-3 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Music2 size={16} className="text-accent" />
        <h3 className="font-semibold text-sm">Transposición de Tono</h3>
        <span className="ml-auto text-[10px] text-[#00cfc0] font-mono bg-[#00cfc0]/10 px-2 py-0.5 rounded-full">
          En tiempo real
        </span>
      </div>

      {/* Semitone display */}
      <div className="text-center">
        <div className="text-4xl font-bold tabular-nums">
          {semitones > 0 && "+"}
          {semitones}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          semitonos{semitones === 0 ? " · Original" : semitones === 12 ? " · +1 octava" : semitones === -12 ? " · -1 octava" : ""}
        </div>
      </div>

      {/* Slider — instantaneous */}
      <input
        type="range"
        min={-12}
        max={12}
        step={1}
        value={semitones}
        onChange={(e) => handleChange(parseInt(e.target.value))}
        className="w-full"
      />

      <div className="flex justify-between text-xs text-gray-600">
        <span>-12 (octava ↓)</span>
        <span>0</span>
        <span>+12 (octava ↑)</span>
      </div>

      {/* Quick buttons */}
      <div className="grid grid-cols-7 gap-1">
        {[-6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 7, 12].map((v) => (
          <button
            key={v}
            onClick={() => handleChange(v)}
            className={`py-1.5 rounded text-xs font-mono transition-colors
              ${semitones === v
                ? "bg-accent text-white"
                : "bg-surface-2 hover:bg-surface-3 text-gray-400"}`}
          >
            {v > 0 ? `+${v}` : v}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleChange(0)}
          className="py-2 px-3 bg-surface-2 hover:bg-surface-3 rounded-lg text-sm transition-colors"
        >
          Resetear
        </button>
        <button
          onClick={handleExport}
          disabled={semitones === 0 || isPending}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-surface-2 hover:bg-surface-3 border border-surface-3 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
        >
          {isPending
            ? <Loader2 size={14} className="animate-spin" />
            : <Download size={14} />
          }
          Exportar con cambios aplicados
        </button>
      </div>
    </div>
  );
}
