import { useEffect, useMemo, useState } from "react";
import { categories, TELANGANA_LOCATIONS, TELANGANA_STATE } from "./data/mockData";
import { dataService } from "./services/dataService";
import { authService } from "./services/authService";
import AuthModal from "./components/AuthModal";
import logo from "./assets/248-works-logo.svg";

const brand = "248 Works";

const formatInrInput = (value) => {
  const digits = String(value ?? "").replace(/\\D/g, "");
  if (!digits) return "";

  // Format as Indian currency without relying on Number(), which can produce
  // NaN/Infinity for malformed or very large intermediate input values.
  return digits.replace(/\\B(?=(\\d{2})+(\\d)(?!\\d))/g, ",");
};

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
  const [session, setSession] = useState(() => authService.getSession());
  const [authOpen, setAuthOpen] = useState(false);
  const [authPurpose, setAuthPurpose] = useState("JobSeeker");
  const [socialPending, setSocialPending] = useState(false);
  const [form, setForm] = useState({
    title: "",
    company: "",
    location: "Hyderabad",
    salary: "",
    category: "Sales",
    type: "Full-time",
    vacancies: 1,
    description: ""
  });

  const loadJobs = async () => {
    setJobs(await dataService.getJobs({ query, category, state: TELANGANA_STATE }));
  };

  useEffect(() => {
    loadJobs();
  }, [query, category]);

  useEffect(() => {
    dataService.getApplications()
      .then(setApplications)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const authCode = params.get("auth_code");
    const pending = authService.getPendingSocialLogin();

    if (authCode) {
      localStorage.setItem("248works.pendingAuthCode", authCode);
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }

    const current = authService.getPendingSocialLogin();
    if (!current.code) return undefined;

    authService.exchangeTriSendCode(current.code)
      .then((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setSocialPending(false);
        showToast("Signed in successfully. Welcome to 248 Works.");
      })
      .catch((error) => {
        if (!active) return;
        if (error.status === 409 && error.code === "MAX_SESSIONS") {
          setAuthPurpose(current.role);
          setSocialPending(true);
          setAuthOpen(true);
        } else {
          authService.clearPendingSocialLogin();
          showToast(error.message || "Social sign-in could not be completed.");
        }
      });

    return () => { active = false; };
  }, []);



  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const requireAuth = (purpose) => {
    if (session) return true;
    setAuthPurpose(purpose);
    setAuthOpen(true);
    return false;
  };

  const apply = async (jobId) => {
    if (!requireAuth("JobSeeker")) return;

    await dataService.apply(jobId);
    setApplications(await dataService.getApplications());
    setSelectedJob(null);
    showToast("Application submitted successfully.");
  };

  const submitJob = async (event) => {
    // Always prevent the native form submission before auth/business logic.
    // Otherwise an unauthenticated submit can fall through to the browser's
    // default navigation and reload the SPA at "/".
    event.preventDefault();

    if (!requireAuth("Employer")) return;

    if (!TELANGANA_LOCATIONS.includes(form.location)) {
      showToast("248 Works currently accepts jobs only within Telangana.");
      return;
    }

    const job = await dataService.createJob({
      ...form,
      state: TELANGANA_STATE
    });

    setProviderJobs((current) => [job, ...current]);
    setForm({
      title: "",
      company: "",
      location: "Hyderabad",
      salary: "",
      category: "Sales",
      type: "Full-time",
      vacancies: 1,
      description: ""
    });
    showToast("Telangana job listing saved.");
  };

  const stats = useMemo(() => ({
    jobs: jobs.length,
    applications: applications.length
  }), [jobs, applications]);

  return (
    <div className="app-shell">
      {loading && (
        <div className="app-loader" role="status" aria-label="Loading 248 Works">
          <img className="loader-logo" src={logo} alt="248 Works" />
          <div className="loader-ring" aria-hidden="true"></div>
          <span>Loading Telangana opportunities...</span>
        </div>
      )}

      <header className="topbar">
        <button className="brand" onClick={() => setMode("home")} aria-label="248 Works home">
          <img className="brand-logo" src={logo} alt="248 Works" />
        </button>
        <nav>
          <button className={mode === "seeker" ? "nav-active" : ""} onClick={() => setMode("seeker")}>Find Jobs</button>
          <button className={mode === "provider" ? "nav-active" : ""} onClick={() => setMode("provider")}>For Employers</button>
          <button className={mode === "applications" ? "nav-active" : ""} onClick={() => setMode("applications")}>Applications</button>
        </nav>
      </header>

      {mode === "home" && (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">TELANGANA'S LOCAL HIRING PLATFORM</div>
              <h1>Find the right people.<br /><span>Find the right work.</span></h1>
              <p>248 Works connects job seekers with businesses across Telangana — simply, quickly and transparently.</p>
              <div className="hero-actions">
                <button className="primary" onClick={() => setMode("seeker")}>Find Jobs →</button>
                <button className="secondary" onClick={() => setMode("provider")}>Post a Job</button>
              </div>
              <div className="trust-row">
                <span>✓ Free job-seeker registration</span>
                <span>✓ Telangana jobs only</span>
                <span>✓ Local-first matching</span>
              </div>
            </div>

            <div className="hero-card">
              <div className="card-glow"></div>
              <div className="mini-label">TELANGANA MVP</div>
              <h3>Workforce dashboard</h3>
              <div className="metric-grid">
                <div><strong>{stats.jobs}</strong><span>Open jobs</span></div>
                <div><strong>{stats.applications}</strong><span>Applications</span></div>
              </div>
              <div className="match-preview">
                <div className="avatar">RK</div>
                <div><strong>Retail Sales Executive</strong><small>Nizampet · ₹14k–₹18k</small></div>
                <span className="match">TELANGANA</span>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div><div className="eyebrow">HOW IT WORKS</div><h2>Built for Telangana's local job market.</h2></div>
            </div>
            <div className="steps">
              <article><b>01</b><h3>Job seekers</h3><p>Create a profile for free, discover opportunities near you and apply in a few taps.</p></article>
              <article><b>02</b><h3>Employers</h3><p>Create a business profile, publish Telangana openings and review suitable candidates.</p></article>
              <article><b>03</b><h3>248 Works</h3><p>Connect local people and businesses while keeping the hiring process simple and transparent.</p></article>
            </div>
          </section>

          <section className="section launch-note">
            <div className="section-heading">
              <div>
                <div className="eyebrow">TELANGANA FIRST</div>
                <h2>Starting local. Expanding later.</h2>
              </div>
            </div>
            <p className="muted">248 Works currently accepts job listings and applications only for locations within Telangana. Any future expansion to other states will be announced separately.</p>
          </section>
        </main>
      )}

      {mode === "seeker" && (
        <main className="page">
          <div className="page-heading">
            <div><div className="eyebrow">TELANGANA JOB SEEKER</div><h1>Find your next opportunity.</h1><p>Search Telangana openings and apply without a joining fee.</p></div>
            <button className="secondary" onClick={() => setMode("applications")}>Applications ({applications.length})</button>
          </div>

          <div className="search-panel">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search jobs by role, company or location..." />
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
                <p className="muted">📍 {job.location}, Telangana &nbsp; · &nbsp; {job.type}</p>
                <div className="salary">{job.salary}</div>
                <p>{job.description}</p>
                <div className="job-footer"><span>{job.vacancies} opening{job.vacancies > 1 ? "s" : ""}</span><button className="primary small" onClick={() => setSelectedJob(job)}>View Job</button></div>
              </article>
            ))}
          </div>
          {!jobs.length && <div className="empty">No Telangana jobs match your search. Try another location or category.</div>}
        </main>
      )}

      {mode === "provider" && (
        <main className="page">
          <div className="page-heading">
            <div><div className="eyebrow">TELANGANA EMPLOYER</div><h1>Build your team.</h1><p>Publish local openings for candidates in Telangana.</p></div>
            <div className="fee-card"><span>Launch model</span><strong>Employer</strong><small>Verification required</small></div>
          </div>

          <div className="provider-layout">
            <form className="form-card" onSubmit={submitJob}>
              <h2>Post a Telangana job</h2>
              <p className="muted">Job listings are currently restricted to Telangana locations. Employer verification and payment workflows will be enabled before commercial launch.</p>

              <label>Job title <span className="required-mark" aria-hidden="true">*</span>
                <input required value={form.title} onChange={(e) => setForm({...form, title:e.target.value})} placeholder="e.g. Store Assistant" />
              </label>

              <label>Business name <span className="required-mark" aria-hidden="true">*</span>
                <input required value={form.company} onChange={(e) => setForm({...form, company:e.target.value})} placeholder="Your shop / business" />
              </label>

              <div className="two-col">
                <label>Telangana location <span className="required-mark" aria-hidden="true">*</span>
                  <select required value={form.location} onChange={(e) => setForm({...form, location:e.target.value})}>
                    {TELANGANA_LOCATIONS.map((location) => <option key={location}>{location}</option>)}
                  </select>
                </label>
                <label>Salary <span className="required-mark" aria-hidden="true">*</span>
                  <input required inputMode="numeric" value={form.salary} onChange={(e) => setForm({...form, salary: formatInrInput(e.target.value)})} placeholder="₹12,000–₹16,000" />
                </label>
              </div>

              <div className="two-col">
                <label>Category
                  <select value={form.category} onChange={(e) => setForm({...form, category:e.target.value})}>
                    {categories.filter(x => x !== "All").map(x => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <label>Vacancies
                  <input type="number" min="1" value={form.vacancies} onChange={(e) => setForm({...form, vacancies:e.target.value})} />
                </label>
              </div>

              <label>Description
                <textarea rows="4" value={form.description} onChange={(e) => setForm({...form, description:e.target.value})} placeholder="Describe the role, timings, salary and expectations (optional)..." />
              </label>

              <button className="primary" type="submit">Publish Job →</button>
            </form>

            <div className="side-panel">
              <h2>Employer onboarding</h2>
              <div className="onboard-item"><span>01</span><div><strong>Create business profile</strong><p>Business name, contact details and Telangana operating location.</p></div></div>
              <div className="onboard-item"><span>02</span><div><strong>Complete verification</strong><p>Employer verification will be required before public job publishing.</p></div></div>
              <div className="onboard-item"><span>03</span><div><strong>Post & manage jobs</strong><p>Review applicants and move suitable candidates through your hiring process.</p></div></div>
              {providerJobs.length > 0 && <div className="provider-list"><h3>Listings created this session</h3>{providerJobs.map(j=><div key={j.id}><strong>{j.title}</strong><small>{j.location}, Telangana · {j.salary}</small></div>)}</div>}
            </div>
          </div>
        </main>
      )}

      {mode === "applications" && (
        <main className="page">
          <div className="page-heading"><div><div className="eyebrow">TELANGANA JOB SEEKER</div><h1>My applications.</h1><p>Track the jobs you have applied for.</p></div></div>
          <div className="application-list">
            {applications.map((app) => (
              <article key={app.id}>
                <div><span className="pill">{app.status}</span><h3>{app.job?.title || "Job"}</h3><p className="muted">{app.job?.company} · {app.job?.location}, Telangana</p></div>
                <span>{app.appliedOn}</span>
              </article>
            ))}
            {!applications.length && <div className="empty">You have not applied to any Telangana jobs yet.</div>}
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
            <p className="muted">📍 {selectedJob.location}, Telangana · {selectedJob.type}</p>
            <div className="salary big">{selectedJob.salary}</div>
            <p>{selectedJob.description}</p>
            <h4>Skills</h4>
            <div className="skill-row">{selectedJob.skills.map(skill => <span key={skill}>{skill}</span>)}</div>
            <button className="primary full" onClick={() => apply(selectedJob.id)}>Apply Now</button>
          </div>
        </div>
      )}

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} 248 Works</span>
        <span>Telangana-first local hiring platform</span>
        <span>
          Terms · <a href="/privacy" style={{ color: "inherit" }}>Privacy</a> ·{" "}
          <a href="/grievance" style={{ color: "inherit" }}>Grievance</a>
        </span>
      </footer>

      {authOpen && (
        <AuthModal
          role={authPurpose}
          socialPending={socialPending}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={(nextSession) => {
            authService.saveSession(nextSession);
            setSession(nextSession);
            setAuthOpen(false);
            setSocialPending(false);
            showToast("Signed in successfully. Welcome to 248 Works.");
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
