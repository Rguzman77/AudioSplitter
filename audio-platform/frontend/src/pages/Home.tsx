import { useState } from "react";
import { Upload, Youtube } from "lucide-react";
import FileUpload from "../components/FileUpload";
import YoutubeInput from "../components/YoutubeInput";
import JobCard from "../components/JobCard";
import { useJobs } from "../hooks/useJobs";

const MODELS = [
  { value: "demucs", label: "Demucs htdemucs (4 pistas)" },
  { value: "demucs-htdemucs_6s", label: "Demucs htdemucs_6s (6 pistas)" },
];

type Tab = "upload" | "youtube";

export default function Home() {
  const [tab, setTab] = useState<Tab>("upload");
  const [aiModel, setAiModel] = useState("demucs");
  const { data: jobs = [], isLoading } = useJobs();

  return (
    <div className="space-y-6">
      {/* Input card */}
      <div style={{ background: '#141414', border: '1px solid #252525' }} className="rounded-2xl p-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold">Separar pistas de audio</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
            Sube un archivo o pega una URL de YouTube. La IA separará voz, batería, bajo y otros instrumentos.
          </p>
        </div>

        {/* Model selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs whitespace-nowrap" style={{ color: '#6b7280' }}>Modelo IA:</label>
          <select
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            className="text-sm focus:outline-none cursor-pointer rounded-lg px-3 py-1.5"
            style={{ background: '#1e1e1e', border: '1px solid #3a3a3a', color: '#f1f1f1' }}
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          {(["upload", "youtube"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: tab === t ? '#2e2e2e' : 'transparent',
                color: tab === t ? '#f1f1f1' : '#6b7280',
              }}
            >
              {t === "upload" ? <Upload size={14} /> : <Youtube size={14} />}
              {t === "upload" ? "Subir archivo" : "YouTube"}
            </button>
          ))}
        </div>

        {/* Input form */}
        <div>
          {tab === "upload" ? (
            <FileUpload aiModel={aiModel} />
          ) : (
            <YoutubeInput aiModel={aiModel} />
          )}
        </div>
      </div>

      {/* Job history */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#4b5563' }}>
          Trabajos recientes {jobs.length > 0 && `(${jobs.length})`}
        </h2>

        {isLoading && (
          <div className="text-center py-8 text-sm" style={{ color: '#4b5563' }}>Cargando…</div>
        )}

        {!isLoading && jobs.length === 0 && (
          <div
            className="text-center py-12 text-sm rounded-xl"
            style={{ color: '#4b5563', border: '1px dashed #252525' }}
          >
            Todavía no hay trabajos. Sube un audio para empezar.
          </div>
        )}

        {jobs.length > 0 && (
          <div style={{ border: '1px solid #252525', borderRadius: 12, overflow: 'hidden' }}>
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
