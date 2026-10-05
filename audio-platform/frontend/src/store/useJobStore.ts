import { create } from "zustand";
import type { Job } from "../lib/api";

interface JobStore {
  jobs: Job[];
  setJobs: (jobs: Job[]) => void;
  upsertJob: (job: Job) => void;
  removeJob: (id: string) => void;
}

export const useJobStore = create<JobStore>((set) => ({
  jobs: [],
  setJobs: (jobs) => set({ jobs }),
  upsertJob: (job) =>
    set((state) => {
      const idx = state.jobs.findIndex((j) => j.id === job.id);
      if (idx === -1) return { jobs: [job, ...state.jobs] };
      const next = [...state.jobs];
      next[idx] = job;
      return { jobs: next };
    }),
  removeJob: (id) =>
    set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) })),
}));
