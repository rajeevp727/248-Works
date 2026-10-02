import { useEffect, useMemo, useState } from "react";
import { categories } from "./data/mockData";
import { dataService } from "./services/dataService";
import logo from "./assets/248-works-logo.svg";

const brand = "248 Works";

function App() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("home");
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedJob, setSelectedJob] = useState(null);
  const [toast, setToast] = useState("");
  const [providerJobs, setProviderJobs] = useState([]);
  const [form, setForm] = useState({
    title: "",
    company: "",
    location: "Nizampet",
    salary: "",
    category: "Sales",
    type: "Full-time",
    vacancies: 1,
    description: ""
  });

  const loadJobs = async () => {
    setJobs(await dataService.getJobs({ query, category }));
  };

  useEffect(() => {
    loadJobs();
  }, [query, category]);

  useEffect(() => {
    dataService.getApplications().then(setApplications);
  }, []);

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const apply = async (jobId) => {
    await dataService.apply(jobId);
    setApplications(await dataService.getApplications());
    setSelectedJob(null);
    showToast("Application submitted successfully.");
  };

  const submitJob = async (event) => {
    event.preventDefault();
    const job = await dataService.createJob(form);
    setProviderJobs((current) => [job, ...current]);
    setForm({
      title: "",
      company: "",
      location: "Nizampet",
      salary: "",
      category: "Sales",
      type: "Full-time",
      vacancies: 1,
      description: ""
    });
    showToast("Job saved. Provider payment/auth will be connected next.");
  };

  const stats = useMemo(() => ({
    jobs: jobs.length,
    applications: applications.length
  }), [jobs, applications]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setMode("home")} aria-label="248 Works home">
          <span className="brand-mark">248</span>
          <span><strong>Works</strong><small>Connecting People, Empowering Businesses</small></span>
        </button>
        <nav>
          <button className={mode === "seeker" ? "nav-active" : ""} onClick={() => setMode("seeker")}>Find Work</button>
          <button className={mode === "provider" ? "nav-active" : ""} onClick={() => setMode("provider")}>Hire People</button>
          <button className={mode === "applications" ? "nav-active" : ""} onClick={() => setMode("applications")}>My Applications</button>
        </nav>
      </header>

      {mode === "home" && (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">HYDERABAD'S WORKFORCE CONNECTION PLATFORM</div>
              <h1>Find the right people.<br /><span>Find the right work.</span></h1>
              <p>248 Works connects local job seekers with businesses that need reliable people — simply, quickly and transparently.</p>
              <div className="hero-actions">
                <button className="primary" onClick={() => setMode("seeker")}>I’m looking for work →</button>
                <button className="secondary" onClick={() => setMode("provider")}>I’m hiring people</button>
              </div>
              <div className="trust-row">
                <span>✓ Job seekers join free</span>
                <span>✓ Job providers ₹100 joining fee</span>
                <span>✓ Local-first matching</span>
              </div>
            </div>
            <div className="hero-card">
              <div className="card-glow"></div>
              <div className="mini-label">LIVE MVP</div>
              <h3>Workforce dashboard</h3>
              <div className="metric-grid">
                <div><strong>{stats.jobs}</strong><span>Open jobs</span></div>
                <div><strong>{stats.applications}</strong><span>Applications</span></div>
              </div>
              <div className="match-preview">
                <div className="avatar">RK</div>
                <div><strong>Retail Sales Executive</strong><small>Nizampet · ₹14k–₹18k</small></div>
                <span className="match">MATCH</span>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div><div className="eyebrow">HOW IT WORKS</div><h2>Built for both sides of the market.</h2></div>
            </div>
            <div className="steps">
              <article><b>01</b><h3>Job seekers</h3><p>Create a profile for free, discover nearby opportunities and apply in a few taps.</p></article>
              <article><b>02</b><h3>Job providers</h3><p>Join for ₹100, publish openings and review suitable candidates.</p></article>
              <article><b>03</b><h3>248 Works</h3><p>Bring the right people and businesses together while keeping the process simple.</p></article>
            </div>
          </section>
        </main>
      )}

      {mode === "seeker" && (
        <main className="page">
          <div className="page-heading">
            <div><div className="eyebrow">JOB SEEKER</div><h1>Find your next opportunity.</h1><p>Search local openings and apply without a joining fee.</p></div>
            <button className="secondary" onClick={() => setMode("applications")}>My applications ({applications.length})</button>
          </div>

          <div className="search-panel">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search role, company or location..." />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>

          <div className="job-grid">
            {jobs.map((job) => (
              <article className="job-card" key={job.id}>
                <div className="job-top"><span className="pill">{job.category}</span><span>{job.posted}</span></div>
                <h3>{job.title}</h3>
                <strong>{job.company}</strong>
                <p className="muted">📍 {job.location} &nbsp; · &nbsp; {job.type}</p>
                <div className="salary">{job.salary}</div>
                <p>{job.description}</p>
                <div className="job-footer"><span>{job.vacancies} opening{job.vacancies > 1 ? "s" : ""}</span><button className="primary small" onClick={() => setSelectedJob(job)}>View & Apply</button></div>
              </article>
            ))}
          </div>
          {!jobs.length && <div className="empty">No jobs match your search. Try another location or category.</div>}
        </main>
      )}

      {mode === "provider" && (
        <main className="page">
          <div className="page-heading">
            <div><div className="eyebrow">JOB PROVIDER</div><h1>Build your team.</h1><p>Provider onboarding is ₹100. Job seekers are free.</p></div>
            <div className="fee-card"><span>Joining fee</span><strong>₹100</strong><small>Payment gateway placeholder</small></div>
          </div>
          <div className="provider-layout">
            <form className="form-card" onSubmit={submitJob}>
              <h2>Post a job</h2>
              <p className="muted">This MVP saves the listing locally. Secure payment, authentication and Cosmos persistence come next.</p>
              <label>Job title<input required value={form.title} onChange={(e) => setForm({...form, title:e.target.value})} placeholder="e.g. Store Assistant" /></label>
              <label>Business name<input required value={form.company} onChange={(e) => setForm({...form, company:e.target.value})} placeholder="Your shop / business" /></label>
              <div className="two-col">
                <label>Location<input required value={form.location} onChange={(e) => setForm({...form, location:e.target.value})} /></label>
                <label>Salary<input required value={form.salary} onChange={(e) => setForm({...form, salary:e.target.value})} placeholder="₹12,000–₹16,000" /></label>
              </div>
              <div className="two-col">
                <label>Category<select value={form.category} onChange={(e) => setForm({...form, category:e.target.value})}>{categories.filter(x=>x!=="All").map(x=><option key={x}>{x}</option>)}</select></label>
                <label>Vacancies<input type="number" min="1" value={form.vacancies} onChange={(e) => setForm({...form, vacancies:e.target.value})} /></label>
              </div>
              <label>Description<textarea required rows="4" value={form.description} onChange={(e) => setForm({...form, description:e.target.value})} placeholder="Describe the role, timings and expectations..." /></label>
              <button className="primary" type="submit">Save job listing →</button>
            </form>
            <div className="side-panel">
              <h2>Provider onboarding</h2>
              <div className="onboard-item"><span>01</span><div><strong>Create business profile</strong><p>Business name, contact and operating location.</p></div></div>
              <div className="onboard-item"><span>02</span><div><strong>Pay ₹100 joining fee</strong><p>Razorpay/payment integration will be connected in the next phase.</p></div></div>
              <div className="onboard-item"><span>03</span><div><strong>Post & manage jobs</strong><p>Review applicants and move suitable candidates through your hiring process.</p></div></div>
              {providerJobs.length > 0 && <div className="provider-list"><h3>Listings created this session</h3>{providerJobs.map(j=><div key={j.id}><strong>{j.title}</strong><small>{j.location} · {j.salary}</small></div>)}</div>}
            </div>
          </div>
        </main>
      )}

      {mode === "applications" && (
        <main className="page">
          <div className="page-heading"><div><div className="eyebrow">JOB SEEKER</div><h1>My applications.</h1><p>Track the jobs you have applied for.</p></div></div>
          <div className="application-list">
            {applications.map((app) => (
              <article key={app.id}>
                <div><span className="pill">{app.status}</span><h3>{app.job?.title || "Job"}</h3><p className="muted">{app.job?.company} · {app.job?.location}</p></div>
                <span>{app.appliedOn}</span>
              </article>
            ))}
            {!applications.length && <div className="empty">You have not applied to any jobs yet.</div>}
          </div>
        </main>
      )}

      {selectedJob && (
        <div className="modal-backdrop" onClick={() => setSelectedJob(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setSelectedJob(null)}>×</button>
            <span className="pill">{selectedJob.category}</span>
            <h2>{selectedJob.title}</h2>
            <strong>{selectedJob.company}</strong>
            <p className="muted">📍 {selectedJob.location} · {selectedJob.type}</p>
            <div className="salary big">{selectedJob.salary}</div>
            <p>{selectedJob.description}</p>
            <h4>Skills</h4>
            <div className="skill-row">{selectedJob.skills.map(skill => <span key={skill}>{skill}</span>)}</div>
            <button className="primary full" onClick={() => apply(selectedJob.id)}>Apply for this job</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
