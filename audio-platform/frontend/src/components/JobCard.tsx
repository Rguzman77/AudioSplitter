import { Link } from "react-router-dom";
import { Trash2, Music, Youtube, Clock, CheckCircle2, XCircle, Loader2, ChevronRight } from "lucide-react";
import type { Job } from "../lib/api";
import { useDeleteJob } from "../hooks/useJobs";

const statusConfig = {
  pending:     { label: "En cola",     color: '#9ca3af', accent: '#3a3a3a', icon: Clock },
  downloading: { label: "Descargando", color: '#3b82f6', accent: '#3b82f6', icon: Loader2 },
  processing:  { label: "Procesando",  color: '#eab308', accent: '#eab308', icon: Loader2 },
  done:        { label: "Listo",       color: '#00cfc0', accent: '#00cfc0', icon: CheckCircle2 },
  failed:      { label: "Error",       color: '#ef4444', accent: '#ef4444', icon: XCircle },
};

export default function JobCard({ job }: { job: Job }) {
  const { mutate: remove, isPending: deleting } = useDeleteJob();
  const cfg = statusConfig[job.status];
  const StatusIcon = cfg.icon;
  const isActive = job.status === "processing" || job.status === "downloading";

  return (
    <div
      className="flex items-stretch group transition-colors"
      style={{ background: '#141414', borderBottom: '1px solid #1e1e1e' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#181818'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#141414'; }}
    >
      {/* Status accent bar */}
      <div style={{ width: 3, background: cfg.accent, flexShrink: 0 }} />

      {/* Icon — like daw-track-controls */}
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 52, background: '#181818', borderRight: '1px solid #252525' }}
      >
        {job.source === "youtube" ? (
          <Youtube size={16} style={{ color: '#ef4444' }} />
        ) : (
          <Music size={16} className="text-accent" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 px-4 py-3">
        <p className="text-sm font-medium truncate">{job.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <StatusIcon
            size={11}
            style={{ color: cfg.color }}
            className={isActive ? "animate-spin" : ""}
          />
          <span className="text-xs" style={{ color: cfg.color }}>{cfg.label}</span>
          {job.bpm && (
            <>
              <span style={{ color: '#3a3a3a' }}>·</span>
              <span className="text-xs" style={{ color: '#6b7280' }}>{Math.round(job.bpm)} BPM</span>
            </>
          )}
          {job.duration_seconds && (
            <>
              <span style={{ color: '#3a3a3a' }}>·</span>
              <span className="text-xs font-mono" style={{ color: '#6b7280' }}>
                {Math.floor(job.duration_seconds / 60)}:{String(Math.floor(job.duration_seconds % 60)).padStart(2, "0")}
              </span>
            </>
          )}
        </div>

        {isActive && (
          <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: '#252525' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%`, background: cfg.accent }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 flex-shrink-0">
        <button
          onClick={() => remove(job.id)}
          disabled={deleting}
          className="daw-btn-icon opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: '#6b7280' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#6b7280'; }}
        >
          <Trash2 size={14} />
        </button>
        {job.status === "done" && (
          <Link to={`/jobs/${job.id}`} className="daw-btn-icon" style={{ color: '#6b7280' }}>
            <ChevronRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}
