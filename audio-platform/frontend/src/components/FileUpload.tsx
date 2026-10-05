import { useCallback, useState } from "react";
import { Upload, Loader2, Music } from "lucide-react";
import { useUploadAudio } from "../hooks/useJobs";
import { useNavigate } from "react-router-dom";

interface Props {
  aiModel: string;
}

const ACCEPTED = [".mp3", ".wav", ".flac", ".m4a"];

export default function FileUpload({ aiModel }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { mutate, isPending } = useUploadAudio();

  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ACCEPTED.includes(ext)) {
        setError(`Formato no soportado. Usa: ${ACCEPTED.join(", ")}`);
        return;
      }
      setError("");
      mutate(
        { file, aiModel },
        {
          onSuccess: (job) => navigate(`/jobs/${job.id}`),
          onError: (err: unknown) => {
            const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Error al subir";
            setError(msg);
          },
        }
      );
    },
    [aiModel, mutate, navigate]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl p-10 cursor-pointer transition-colors
          ${isPending ? "opacity-50 pointer-events-none" : ""}`}
        style={{
          border: dragging ? '1px dashed #a855f7' : '1px dashed #2e2e2e',
          background: dragging ? 'rgba(168,85,247,0.06)' : '#181818',
        }}
      >
        {isPending ? (
          <Loader2 size={32} className="animate-spin text-accent" />
        ) : dragging ? (
          <Music size={32} className="text-accent" />
        ) : (
          <Upload size={32} className="text-gray-500" />
        )}
        <div className="text-center">
          <p className="text-sm font-medium">
            {isPending ? "Subiendo…" : "Arrastra un archivo o haz clic para seleccionar"}
          </p>
          <p className="text-xs text-gray-500 mt-1">{ACCEPTED.join(" · ")}</p>
        </div>
        <input
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={onInputChange}
          disabled={isPending}
        />
      </label>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
