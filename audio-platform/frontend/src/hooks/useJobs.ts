import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adjustTempo,
  deleteJob,
  downloadYoutube,
  fetchJob,
  fetchJobs,
  transposeAudio,
  uploadAudio,
} from "../lib/api";

export function useJobs() {
  return useQuery({ queryKey: ["jobs"], queryFn: fetchJobs });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ["job", id],
    queryFn: () => fetchJob(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "done" || status === "failed" ? false : 2000;
    },
  });
}

export function useUploadAudio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, aiModel }: { file: File; aiModel: string }) =>
      uploadAudio(file, aiModel),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useDownloadYoutube() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, aiModel }: { url: string; aiModel: string }) =>
      downloadYoutube(url, aiModel),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useAdjustTempo(jobId: string) {
  return useMutation({
    mutationFn: (params: { shift_bpm?: number; target_bpm?: number }) =>
      adjustTempo(jobId, params),
  });
}

export function useTranspose(jobId: string) {
  return useMutation({
    mutationFn: (semitones: number) => transposeAudio(jobId, semitones),
  });
}
