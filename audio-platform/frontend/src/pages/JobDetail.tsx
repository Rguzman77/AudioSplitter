import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Loader2, XCircle, Clock,
} from "lucide-react";
import { useJob } from "../hooks/useJobs";
import DAWView from "../components/DAWView";
import Layout from "../components/Layout";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:     { label: "En cola",     color: "text-gray-400" },
  downloading: { label: "Descargando", color: "text-blue-400" },
  processing:  { label: "Procesando",  color: "text-yellow-400" },
  done:        { label: "Listo",       color: "text-green-400" },
  failed:      { label: "Error",       color: "text-red-400" },
};

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading } = useJob(id!);

  // ── Render full-screen DAW when done ──────────────────────────────────
  if (!isLoading && job?.status === "done") {
    return <DAWView job={job} />;
  }

  // ── All other states inside the normal layout ─────────────────────────
  return (
    <Layout>
      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-500">
          <Loader2 size={18} className="animate-spin" />
          <span>Cargando…</span>
        </div>
      )}

      {!isLoading && !job && (
        <div className="text-center py-20">
          <XCircle size={40} className="text-red-400 mx-auto mb-3" />
          <p className="text-gray-400">Job no encontrado</p>
          <Link to="/" className="text-accent hover:underline text-sm mt-2 block">
            Volver al inicio
          </Link>
        </div>
      )}

      {!isLoading && job && job.status !== "done" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-surface-2 transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{job.title}</h1>
              <span className={`text-sm ${STATUS_LABELS[job.status]?.color}`}>
                {STATUS_LABELS[job.status]?.label}
              </span>
            </div>
          </div>

          {/* Processing progress */}
          {(job.status === "processing" || job.status === "downloading") && (
            <div className="bg-surface-1 border border-surface-3 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-yellow-400" />
                <span className="text-sm font-medium">
                  {STATUS_LABELS[job.status].label}…
                </span>
                <span className="ml-auto text-sm text-gray-500">
                  {Math.round(job.progress)}%
                </span>
              </div>
              <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-700"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {job.status === "failed" && (
            <div className="bg-red-950/30 border border-red-800 rounded-xl p-5 flex gap-3">
              <XCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-red-300">Error en el procesamiento</p>
                <p className="text-xs text-red-400 mt-1 font-mono">{job.error_message}</p>
              </div>
            </div>
          )}

          {/* Pending */}
          {job.status === "pending" && (
            <div className="text-center py-16 text-gray-600 text-sm border border-dashed border-surface-3 rounded-xl">
              <Clock size={32} className="mx-auto mb-2 text-gray-700" />
              El trabajo está en cola. Comenzará pronto.
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
