import axios from "axios";

const api = axios.create({ baseURL: "/api/v1" });

export interface Job {
  id: string;
  title: string;
  source: "upload" | "youtube";
  source_url?: string;
  status: "pending" | "downloading" | "processing" | "done" | "failed";
  progress: number;
  error_message?: string;
  ai_model: string;
  stems?: Record<string, string>;
  bpm?: number;
  duration_seconds?: number;
  created_at: string;
  updated_at: string;
}

export interface TempoResult {
  adjusted_stems: Record<string, string>;
  stem_urls: Record<string, string>;
  original_bpm: number;
  new_bpm: number;
  rate: number;
}

export interface TransposeResult {
  transposed_stems: Record<string, string>;
  stem_urls: Record<string, string>;
  semitones: number;
}

// Jobs
export const fetchJobs = (): Promise<Job[]> =>
  api.get("/jobs/").then((r) => r.data);

export const fetchJob = (id: string): Promise<Job> =>
  api.get(`/jobs/${id}`).then((r) => r.data);

export const deleteJob = (id: string): Promise<void> =>
  api.delete(`/jobs/${id}`).then(() => undefined);

export const uploadAudio = (file: File, aiModel: string): Promise<Job> => {
  const form = new FormData();
  form.append("file", file);
  form.append("ai_model", aiModel);
  return api.post("/jobs/upload", form).then((r) => r.data);
};

export const downloadYoutube = (url: string, aiModel: string): Promise<Job> =>
  api.post("/youtube/", { url, ai_model: aiModel }).then((r) => r.data);

export const adjustTempo = (
  jobId: string,
  params: { shift_bpm?: number; target_bpm?: number }
): Promise<TempoResult> =>
  api.post(`/jobs/${jobId}/tempo`, params).then((r) => r.data);

export const transposeAudio = (
  jobId: string,
  semitones: number
): Promise<TransposeResult> =>
  api.post(`/jobs/${jobId}/transpose`, { semitones }).then((r) => r.data);

// Stem URL helpers
export const stemUrl = (path: string): string => {
  // path is an absolute local path – convert to /storage URL
  // The backend mounts storage at /storage/<relative>
  // We store absolute paths in DB, so we serve via the direct stem endpoint
  return path;
};

export const stemDownloadUrl = (jobId: string, stemName: string): string =>
  `/api/v1/jobs/${jobId}/stems/${stemName}`;

export const zipDownloadUrl = (jobId: string): string =>
  `/api/v1/jobs/${jobId}/download`;
