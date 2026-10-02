import { jobs, initialApplications } from "../data/mockData";

let applications = [...initialApplications];

export const dataService = {
  async getJobs(filters = {}) {
    const query = (filters.query || "").trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesQuery =
        !query ||
        [job.title, job.company, job.location, job.category].some((value) =>
          value.toLowerCase().includes(query)
        );
      const matchesCategory =
        !filters.category || filters.category === "All" || job.category === filters.category;
      return matchesQuery && matchesCategory;
    });
  },

  async apply(jobId, candidateName = "Demo Candidate") {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) throw new Error("Job not found");
    const existing = applications.find(
      (item) => item.jobId === jobId && item.candidate === candidateName
    );
    if (existing) return existing;
    const application = {
      id: `app-${Date.now()}`,
      jobId,
      candidate: candidateName,
      status: "Applied",
      appliedOn: "Just now"
    };
    applications.push(application);
    return application;
  },

  async getApplications() {
    return applications.map((app) => ({
      ...app,
      job: jobs.find((job) => job.id === app.jobId)
    }));
  },

  async createJob(job) {
    const newJob = {
      ...job,
      id: `job-${Date.now()}`,
      posted: "Just now",
      vacancies: Number(job.vacancies || 1)
    };
    jobs.unshift(newJob);
    return newJob;
  }
};

// Replace this adapter with the .NET API once Cosmos DB integration is enabled.
// Browser code must never contain a Cosmos DB primary key.
