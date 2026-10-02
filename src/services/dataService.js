import { jobs, initialApplications, TELANGANA_STATE, TELANGANA_LOCATIONS } from "../data/mockData";
import { authService } from "./authService";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function apiRequest(path, options = {}) {
  const session = authService.getSession();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Request failed.");
  return body;
}

let applications = [...initialApplications];

const assertTelanganaLocation = (location) => {
  if (!TELANGANA_LOCATIONS.includes(location)) {
    throw new Error("248 Works currently accepts jobs only within Telangana.");
  }
};

export const dataService = {
  async getJobs(filters = {}) {
    if (API_BASE_URL) {
      const data = await apiRequest("/api/jobs");
      const query = (filters.query || "").trim().toLowerCase();
      return data.filter((job) => {
        const matchesQuery = !query || [job.title, job.company, job.location, job.category].some(v => (v || "").toLowerCase().includes(query));
        const matchesCategory = !filters.category || filters.category === "All" || job.category === filters.category;
        return job.state === TELANGANA_STATE && matchesQuery && matchesCategory;
      });
    }

    const query = (filters.query || "").trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesState = job.state === TELANGANA_STATE;
      const matchesQuery = !query || [job.title, job.company, job.location, job.category].some(v => v.toLowerCase().includes(query));
      const matchesCategory = !filters.category || filters.category === "All" || job.category === filters.category;
      return matchesState && matchesQuery && matchesCategory;
    });
  },

  async apply(jobId) {
    const session = authService.getSession();
    if (!session?.token || session.user?.role !== "JobSeeker")
      throw new Error("Please sign in as a job seeker first.");

    if (API_BASE_URL) {
      const result = await apiRequest("/api/applications", {
        method: "POST",
        body: JSON.stringify({ jobId, candidateId: session.user.id, candidateName: session.user.name || "" })
      });
      return result;
    }

    const job = jobs.find((item) => item.id === jobId);
    if (!job || job.state !== TELANGANA_STATE) throw new Error("Job not found.");
    const existing = applications.find(item => item.jobId === jobId);
    if (existing) return existing;
    const application = { id: `app-${Date.now()}`, jobId, candidate: session.user.name || session.user.email, status: "Applied", appliedOn: "Just now" };
    applications.push(application);
    return application;
  },

  async getApplications() {
    if (API_BASE_URL) return [];
    return applications.map(app => ({ ...app, job: jobs.find(job => job.id === app.jobId) })).filter(app => app.job?.state === TELANGANA_STATE);
  },

  async createJob(job) {
    assertTelanganaLocation(job.location);
    const session = authService.getSession();
    if (!session?.token || session.user?.role !== "Employer")
      throw new Error("Please sign in as an employer first.");

    if (API_BASE_URL) {
      return apiRequest("/api/jobs", {
        method: "POST",
        body: JSON.stringify({ ...job, state: TELANGANA_STATE })
      });
    }

    const newJob = { ...job, state: TELANGANA_STATE, id: `job-${Date.now()}`, posted: "Just now", vacancies: Number(job.vacancies || 1) };
    jobs.unshift(newJob);
    return newJob;
  }
};
