import { jobs, initialApplications, TELANGANA_STATE, TELANGANA_LOCATIONS } from "../data/mockData";
import { authService } from "./authService";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const USE_API = import.meta.env.VITE_USE_MOCK_API !== "true";

async function apiRequest(path, options = {}, canRefresh = true) {
  const session = authService.getSession();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (session?.token) headers.Authorization = "Bearer " + session.token;

  const response = await fetch(API_BASE_URL + path, { ...options, headers });
  const body = await response.json().catch(() => ({}));

  if (response.status === 401 && canRefresh && session?.refreshToken) {
    try {
      await authService.refresh();
      return apiRequest(path, options, false);
    } catch {
      authService.clearSession();
    }
  }

  if (!response.ok) {
    const error = new Error(body.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
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
    if (USE_API) {
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

    if (USE_API) {
      return apiRequest("/api/applications", {
        method: "POST",
        body: JSON.stringify({ jobId })
      });
    }

    const job = jobs.find((item) => item.id === jobId);
    if (!job || job.state !== TELANGANA_STATE) throw new Error("Job not found.");
    const existing = applications.find(item => item.jobId === jobId);
    if (existing) return existing;
    const application = { id: "app-" + Date.now(), jobId, candidate: session.user.name || session.user.email, status: "Applied", appliedOn: "Just now" };
    applications.push(application);
    return application;
  },

  async getApplications() {
    if (USE_API) {
      const session = authService.getSession();
      if (!session?.token) return [];
      return apiRequest("/api/applications");
    }
    return applications.map(app => ({ ...app, job: jobs.find(job => job.id === app.jobId) })).filter(app => app.job?.state === TELANGANA_STATE);
  },

  async createJob(job) {
    assertTelanganaLocation(job.location);
    const session = authService.getSession();
    if (!session?.token || session.user?.role !== "Employer")
      throw new Error("Please sign in as an employer first.");

    if (USE_API) {
      return apiRequest("/api/jobs", {
        method: "POST",
        body: JSON.stringify({ ...job, jobType: job.type, state: TELANGANA_STATE })
      });
    }

    const newJob = { ...job, state: TELANGANA_STATE, id: "job-" + Date.now(), posted: "Just now", vacancies: Number(job.vacancies || 1) };
    jobs.unshift(newJob);
    return newJob;
  },

  async getProfile() { return apiRequest("/api/profile"); },
  async updateProfile(profile) { return apiRequest("/api/profile",{method:"PUT",body:JSON.stringify(profile)}); },
  async getSavedJobs() { return apiRequest("/api/saved-jobs"); },
  async saveJob(jobId) { return apiRequest("/api/saved-jobs",{method:"POST",body:JSON.stringify({jobId})}); },
  async removeSavedJob(jobId) { return apiRequest("/api/saved-jobs",{method:"DELETE",body:JSON.stringify({jobId})}); },
  async getEmployerJobs() { return apiRequest("/api/employer/jobs"); },
  async updateEmployerJob(jobId, action, fields={}) { return apiRequest("/api/employer/jobs",{method:"PATCH",body:JSON.stringify({jobId,action,...fields})}); },
  async getEmployerApplications() { return apiRequest("/api/employer/applications"); },
  async updateApplication(applicationId,status) { return apiRequest("/api/employer/applications",{method:"PATCH",body:JSON.stringify({applicationId,status})}); },
  async getAdminSummary() { return apiRequest("/api/admin/summary"); }

};
