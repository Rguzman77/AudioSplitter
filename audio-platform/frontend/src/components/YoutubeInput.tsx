import { useState } from "react";
import { Youtube, Loader2 } from "lucide-react";
import { useDownloadYoutube } from "../hooks/useJobs";
import { useNavigate } from "react-router-dom";

interface Props {
  aiModel: string;
}

export default function YoutubeInput({ aiModel }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { mutate, isPending } = useDownloadYoutube();

  const handleSubmit = () => {
    if (!url.trim()) return setError("Introduce una URL de YouTube");
    if (!url.includes("youtube.com") && !url.includes("youtu.be"))
      return setError("URL de YouTube inválida");

    setError("");
    mutate(
      { url, aiModel },
      {
        onSuccess: (job) => {
          setUrl("");
          navigate(`/jobs/${job.id}`);
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Error al descargar";
          setError(msg);
        },
      }
    );
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-400">URL del video de YouTube</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Youtube size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500" />
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={isPending}
            className="w-full pl-9 pr-4 py-2.5 bg-surface-2 border border-surface-3 rounded-lg text-sm focus:outline-none focus:border-accent disabled:opacity-50"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={isPending || !url.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
        >
          {isPending ? <Loader2 size={15} className="animate-spin" /> : <Youtube size={15} />}
          {isPending ? "Descargando…" : "Procesar"}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
