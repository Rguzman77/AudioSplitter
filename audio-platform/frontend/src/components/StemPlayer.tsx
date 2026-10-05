import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download, Volume2, VolumeX } from "lucide-react";
import { stemDownloadUrl } from "../lib/api";

interface Props {
  jobId: string;
  stemName: string;
  overrideUrl?: string; // URL to transposed / tempo-shifted version
}

const STEM_COLORS: Record<string, string> = {
  vocals:  "bg-purple-500",
  drums:   "bg-orange-500",
  bass:    "bg-blue-500",
  guitar:  "bg-yellow-500",
  piano:   "bg-pink-500",
  other:   "bg-green-500",
};

const STEM_LABELS: Record<string, string> = {
  vocals:  "Voz",
  drums:   "Batería",
  bass:    "Bajo",
  guitar:  "Guitarra",
  piano:   "Piano",
  other:   "Otros",
};

export default function StemPlayer({ jobId, stemName, overrideUrl }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const srcUrl = overrideUrl ?? stemDownloadUrl(jobId, stemName);

  // Reset when src changes
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
  }, [srcUrl]);

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      await el.play();
    }
    setPlaying(!playing);
  };

  const handleTimeUpdate = () => {
    setCurrentTime(audioRef.current?.currentTime ?? 0);
  };

  const handleLoaded = () => {
    setDuration(audioRef.current?.duration ?? 0);
  };

  const handleEnded = () => setPlaying(false);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setMuted(v === 0);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const dot = STEM_COLORS[stemName] ?? "bg-gray-500";

  return (
    <div className="bg-surface-2 rounded-xl p-4 space-y-3">
      <audio
        ref={audioRef}
        src={srcUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoaded}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
          <span className="text-sm font-semibold capitalize">
            {STEM_LABELS[stemName] ?? stemName}
          </span>
        </div>
        <a
          href={stemDownloadUrl(jobId, stemName)}
          download={`${stemName}.wav`}
          className="p-1.5 rounded-lg text-gray-500 hover:text-accent hover:bg-surface-3 transition-colors"
          title="Descargar stem"
        >
          <Download size={14} />
        </a>
      </div>

      {/* Scrubber */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="w-8 text-right">{fmt(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={seek}
          className="flex-1"
        />
        <span className="w-8">{fmt(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="w-9 h-9 rounded-full bg-accent hover:bg-accent-hover flex items-center justify-center transition-colors"
        >
          {playing ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" />}
        </button>

        <button onClick={toggleMute} className="text-gray-500 hover:text-white transition-colors">
          {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={changeVolume}
          className="w-20"
        />
      </div>
    </div>
  );
}
