import { jobs, initialApplications, TELANGANA_STATE, TELANGANA_LOCATIONS } from "../data/mockData";

let applications = [...initialApplications];

const assertTelanganaLocation = (location) => {
  if (!TELANGANA_LOCATIONS.includes(location)) {
    throw new Error("248 Works currently accepts jobs only within Telangana.");
  }
};

export const dataService = {
  async getJobs(filters = {}) {
    const query = (filters.query || "").trim().toLowerCase();
    const state = filters.state || TELANGANA_STATE;

    return jobs.filter((job) => {
      const matchesState = job.state === state;
      const matchesQuery =
        !query ||
        [job.title, job.company, job.location, job.category].some((value) =>
          value.toLowerCase().includes(query)
        );
      const matchesCategory =
        !filters.category || filters.category === "All" || job.category === filters.category;

      return matchesState && matchesQuery && matchesCategory;
    });
  },

  async apply(jobId, candidateName = "Demo Candidate") {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) throw new Error("Job not found");
    if (job.state !== TELANGANA_STATE) {
      throw new Error("Applications are currently limited to Telangana jobs.");
    }

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
    return applications
      .map((app) => ({
        ...app,
        job: jobs.find((job) => job.id === app.jobId)
      }))
      .filter((app) => app.job?.state === TELANGANA_STATE);
  },

  async createJob(job) {
    assertTelanganaLocation(job.location);

    const newJob = {
      ...job,
      state: TELANGANA_STATE,
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
