import { useEffect, useMemo, useState } from "react";
import { categories, TELANGANA_LOCATIONS, TELANGANA_STATE } from "./data/mockData";
import { dataService } from "./services/dataService";
import { authService } from "./services/authService";
import AuthModal from "./components/AuthModal";
import logo from "./assets/248-works-logo.svg";

const brand = "248 Works";

const getRouteFromPathname = (pathname) => {
  switch (pathname) {
    case "/":
      return "home";
    case "/emplyee/jobs":
      return "seeker";
    case "/employer/jobs/post":
      return "provider";
    case "/applications":
      return "applications";
    case "/saved":
      return "saved";
    case "/alerts":
      return "alerts";
    case "/profile":
      return "profile";
    case "/employer/jobs":
      return "employer-dashboard";
    case "/admin":
      return "admin";
    case "/privacy":
      return "privacy";
    case "/grievance":
      return "grievance";
    default:
      return "not-found";
  }
};

const formatInrInput = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";

  // Format Indian numbering without Number(), preserving large salary values.
  const lastThree = digits.slice(-3);
  const leading = digits.slice(0, -3);
  if (!leading) return lastThree;

  return leading.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
};

function App() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(() => getRouteFromPathname(window.location.pathname));

  const navigate = (path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setMode(getRouteFromPathname(path));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedJob, setSelectedJob] = useState(null);
  const [toast, setToast] = useState("");
  const [providerJobs, setProviderJobs] = useState([]);
  const [employerApplications, setEmployerApplications] = useState([]);
  const [savedJobs, setSavedJobs] = useState([]);
  const [jobAlerts, setJobAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("248works.jobAlerts") || "[]"); } catch { return []; }
  });
  const [profile, setProfile] = useState(null);
  const [adminSummary, setAdminSummary] = useState(null);
  const [session, setSession] = useState(() => authService.getSession());
  const [authOpen, setAuthOpen] = useState(false);
  const [authPurpose, setAuthPurpose] = useState("JobSeeker");
  const [authMode, setAuthMode] = useState("login");
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
    const handlePopState = () => {
      setMode(getRouteFromPathname(window.location.pathname));
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!selectedJob) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") setSelectedJob(null);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedJob]);

  useEffect(() => {
    Promise.all([
      dataService.getApplications(),
      authService.getSession() ? dataService.getProfile().catch(() => null) : Promise.resolve(null)
    ])
      .then(([apps, currentProfile]) => {
        setApplications(apps);
        setProfile(currentProfile);
      })
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
       .then(async (nextSession) => {
        if (!active) return;
        setSession(nextSession);
        await refreshRoleData(nextSession.user?.role);
        setSocialPending(false);
        showToast("Signed in successfully. Welcome to 248 Works.");
      })
      .catch((error) => {
        if (!active) return;
        if (error.status === 409 && error.code === "MAX_SESSIONS") {
          setAuthPurpose(current.role);
          setAuthMode("login");
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

  const refreshRoleData = async (role = session?.user?.role) => {
    if (!role) return;
    if (role === "JobSeeker") {
      const [apps, saved, currentProfile] = await Promise.all([
        dataService.getApplications(),
        dataService.getSavedJobs(),
        dataService.getProfile()
      ]);
      setApplications(apps); setSavedJobs(saved); setProfile(currentProfile);
    }
    if (role === "Employer") {
      const [ownedJobs, employerApps, currentProfile] = await Promise.all([
        dataService.getEmployerJobs(),
        dataService.getEmployerApplications(),
        dataService.getProfile()
      ]);
      setProviderJobs(ownedJobs); setEmployerApplications(employerApps); setProfile(currentProfile);
    }
    if (role === "Admin") setAdminSummary(await dataService.getAdminSummary());
  };

  const handleAuthenticated = async (nextSession) => {
    setSession(nextSession);
    setAuthOpen(false);
    setSocialPending(false);
    await refreshRoleData(nextSession.user?.role);
    showToast("Signed in successfully. Welcome to 248 Works.");
  };

  useEffect(() => {
    const protectedModes = ["applications","saved","alerts","profile","employer-dashboard","admin"];
    if (protectedModes.includes(mode) && !session) {
      openAuth("login", mode === "employer-dashboard" ? "Employer" : "JobSeeker");
      navigate("/");
      return;
    }

    if (mode === "provider" && !session) {
      openAuth("login", "Employer");
      navigate("/");
      return;
    }

    if (mode === "provider" && session?.user?.role === "JobSeeker") {
      navigate("/emplyee/jobs");
      return;
    }

    if (mode === "seeker" && session?.user?.role === "Employer") {
      navigate("/employer/jobs");
    }
  }, [mode, session]);

  useEffect(() => {
    if (session?.user?.role) refreshRoleData(session.user.role);
  }, []);
  const logout = async () => {
    await authService.logout();
    setSession(null);
    setApplications([]);
    setSavedJobs([]);
    setProviderJobs([]);
    setEmployerApplications([]);
    setProfile(null);
    navigate("/");
    showToast("You have been signed out.");
  };

  const saveJob = async (jobId) => {
    if (!requireAuth("JobSeeker")) return;
    try {
      const exists = savedJobs.some((job) => job.id === jobId);
      if (exists) {
        await dataService.removeSavedJob(jobId);
        setSavedJobs((items) => items.filter((job) => job.id !== jobId));
        showToast("Job removed from saved jobs.");
      } else {
        await dataService.saveJob(jobId);
        const job = jobs.find((item) => item.id === jobId);
        if (job) setSavedJobs((items) => [job, ...items]);
        showToast("Job saved.");
      }
    } catch (error) { showToast(error.message || "Unable to save this job."); }
  };

  const updateApplicationStatus = async (applicationId, status) => {
    try {
      await dataService.updateApplication(applicationId, status);
      setEmployerApplications(await dataService.getEmployerApplications());
      showToast("Application status updated.");
    } catch (error) { showToast(error.message || "Unable to update application."); }
  };

  const updateProfile = async (event) => {
    event.preventDefault();
    try {
      const result = await dataService.updateProfile(profile || {});
      setProfile(result.profile);
      showToast("Profile updated successfully.");
    } catch (error) { showToast(error.message || "Unable to update profile."); }
  };


  const toggleJobAlert = () => {
    if (!requireAuth("JobSeeker")) return;
    const normalized = { query: query.trim(), category, createdAt: new Date().toISOString() };
    const key = JSON.stringify({ query: normalized.query.toLowerCase(), category: normalized.category });
    const exists = jobAlerts.some(a => JSON.stringify({query:a.query.toLowerCase(),category:a.category}) === key);
    const next = exists
      ? jobAlerts.filter(a => JSON.stringify({query:a.query.toLowerCase(),category:a.category}) !== key)
      : [normalized, ...jobAlerts].slice(0, 10);
    setJobAlerts(next);
    localStorage.setItem("248works.jobAlerts", JSON.stringify(next));
    showToast(exists ? "Job alert removed." : "Job alert created for this search.");
  };

  const openAuth = (mode = "login", purpose = "JobSeeker") => {
    setAuthMode(mode);
    setAuthPurpose(purpose);
    setSocialPending(false);
    setAuthOpen(true);
  };

  const requireAuth = (purpose) => {
    if (session) return true;
    openAuth("login", purpose);
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
        <button className="brand" onClick={() => navigate("/")} aria-label="248 Works home">
          <img className="brand-logo" src={logo} alt="248 Works" />
        </button>
        <nav>
          {(!session || session.user?.role === "JobSeeker") && (
            <button className={mode === "seeker" ? "nav-active" : ""} onClick={() => navigate("/emplyee/jobs")}>Find Jobs</button>
          )}
          {(!session || session.user?.role === "Employer") && (
            <button className={mode === "provider" ? "nav-active" : ""} onClick={() => session ? navigate("/employer/jobs/post") : openAuth("signup", "Employer")}>Post a Job</button>
          )}
          {session?.user?.role === "JobSeeker" && <>
            <button className={mode === "applications" ? "nav-active" : ""} onClick={() => navigate("/applications")}>Applications</button>
            <button className={mode === "saved" ? "nav-active" : ""} onClick={() => navigate("/saved")}>Saved</button>
            <button className={mode === "alerts" ? "nav-active" : ""} onClick={() => navigate("/alerts")}>Alerts</button>
          </>}
          {session?.user?.role === "Employer" && <button className={mode === "employer-dashboard" ? "nav-active" : ""} onClick={() => navigate("/employer/jobs")}>Manage Jobs</button>}
          {session && <button className={mode === "profile" ? "nav-active" : ""} onClick={() => navigate("/profile")}>Profile</button>}
          {session ? (
            <button onClick={logout}>Sign out</button>
          ) : (
            <span className="auth-actions">
              <button className="topbar-login" onClick={() => openAuth("login", "JobSeeker")}>Log in</button>
              <button className="topbar-signup" onClick={() => openAuth("signup", "JobSeeker")}>Sign up</button>
            </span>
          )}
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
                {(!session || session.user?.role === "JobSeeker") && (
                  <button className="primary" onClick={() => navigate("/emplyee/jobs")}>Find Jobs →</button>
                )}
                {(!session || session.user?.role === "Employer") && (
                  <button
                    className="secondary"
                    onClick={() => session ? navigate("/employer/jobs/post") : openAuth("signup", "Employer")}
                  >
                    Post a Job
                  </button>
                )}
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
            <button className="secondary" onClick={() => navigate("/applications")}>Applications ({applications.length})</button>
          </div>

          <div className="search-panel">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search jobs by role, company or location..." />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
            <button className="secondary alert-button" onClick={toggleJobAlert}>
              {jobAlerts.some(a => a.query.toLowerCase() === query.trim().toLowerCase() && a.category === category) ? "Alert enabled" : "Create job alert"}
            </button>
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
                <div className="job-footer"><span>{job.vacancies} opening{job.vacancies > 1 ? "s" : ""}</span><div className="job-actions">
                  <button className="secondary small" onClick={() => saveJob(job.id)}>{savedJobs.some((item) => item.id === job.id) ? "Saved" : "Save"}</button>
                  <button className="primary small" onClick={() => setSelectedJob(job)}>View Job</button>
                </div></div>
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
                  <input required type="text" inputMode="numeric" pattern="[0-9,]*" value={form.salary} onKeyDown={(e) => { if (!/[0-9]/.test(e.key) && !["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault(); }} onChange={(e) => setForm({...form, salary: formatInrInput(e.target.value)})} onBlur={(e) => setForm({...form, salary: formatInrInput(e.target.value)})} placeholder="₹12,000–₹16,000" />
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



      {mode === "alerts" && (
        <main className="page">
          <div className="page-heading"><div><div className="eyebrow">JOB SEEKER</div><h1>Job alerts.</h1><p>Save searches so you can return to the same hiring criteria quickly.</p></div></div>
          <div className="management-list">
            {jobAlerts.map((alert,index)=><article key={index}><div><span className="pill">{alert.category}</span><h3>{alert.query || "All Telangana jobs"}</h3><p className="muted">Search alert created {new Date(alert.createdAt).toLocaleDateString("en-IN")}</p></div><button className="secondary small" onClick={()=>{const next=jobAlerts.filter((_,i)=>i!==index);setJobAlerts(next);localStorage.setItem("248works.jobAlerts",JSON.stringify(next));}}>Remove</button></article>)}
          </div>
          {!jobAlerts.length && <div className="empty">No job alerts yet. Create one from Find Jobs after entering your preferred search.</div>}
        </main>
      )}

      {mode === "saved" && (
        <main className="page">
          <div className="page-heading"><div><div className="eyebrow">JOB SEEKER</div><h1>Saved jobs.</h1><p>Keep interesting Telangana opportunities in one place.</p></div></div>
          <div className="job-grid">
            {savedJobs.map((job) => (
              <article className="job-card" key={job.id}>
                <div className="job-top"><span className="pill">{job.category}</span><span>{job.posted}</span></div>
                <h3>{job.title}</h3><strong>{job.company}</strong>
                <p className="muted">📍 {job.location}, Telangana · {job.type}</p>
                <div className="salary">{job.salary}</div>
                <p>{job.description}</p>
                <div className="job-footer"><button className="secondary small" onClick={() => saveJob(job.id)}>Remove</button><button className="primary small" onClick={() => setSelectedJob(job)}>View Job</button></div>
              </article>
            ))}
          </div>
          {!savedJobs.length && <div className="empty">No saved jobs yet. Save jobs from Find Jobs to see them here.</div>}
        </main>
      )}

      {mode === "profile" && profile && (
        <main className="page">
          <div className="page-heading"><div><div className="eyebrow">{session?.user?.role === "Employer" ? "EMPLOYER PROFILE" : "JOB SEEKER PROFILE"}</div><h1>Your profile.</h1><p>Keep your information current so the right people can find you.</p></div></div>
          <form className="form-card profile-card" onSubmit={updateProfile}>
            <div className="two-col">
              <label>Full name<input value={profile.name || ""} onChange={e=>setProfile({...profile,name:e.target.value})} /></label>
              <label>Phone<input value={profile.phone || ""} onChange={e=>setProfile({...profile,phone:e.target.value})} /></label>
            </div>
            <div className="two-col">
              <label>Location<input value={profile.location || ""} onChange={e=>setProfile({...profile,location:e.target.value})} placeholder="Hyderabad" /></label>
              <label>Headline<input value={profile.headline || ""} onChange={e=>setProfile({...profile,headline:e.target.value})} placeholder="e.g. Retail Sales Professional" /></label>
            </div>
            {session?.user?.role === "JobSeeker" ? <>
              <label>Skills<input value={(profile.skills || []).join(", ")} onChange={e=>setProfile({...profile,skills:e.target.value.split(",").map(v=>v.trim()).filter(Boolean)})} placeholder="Sales, Customer service, POS" /></label>
              <div className="two-col">
                <label>Experience<input value={profile.experience || ""} onChange={e=>setProfile({...profile,experience:e.target.value})} placeholder="2 years" /></label>
                <label>Education<input value={profile.education || ""} onChange={e=>setProfile({...profile,education:e.target.value})} placeholder="Intermediate / Degree" /></label>
              </div>
              <label>Resume link<input value={profile.resumeUrl || ""} onChange={e=>setProfile({...profile,resumeUrl:e.target.value})} placeholder="https://..." /></label>
            </> : <>
              <div className="two-col">
                <label>Business name<input value={profile.company || ""} onChange={e=>setProfile({...profile,company:e.target.value})} /></label>
                <label>Business type<input value={profile.businessType || ""} onChange={e=>setProfile({...profile,businessType:e.target.value})} placeholder="Retail, Restaurant, Services..." /></label>
              </div>
            </>}
            <label>About<input value={profile.bio || ""} onChange={e=>setProfile({...profile,bio:e.target.value})} placeholder="A short introduction" /></label>
            <button className="primary" type="submit">Save Profile</button>
          </form>
        </main>
      )}

      {mode === "employer-dashboard" && (
        <main className="page">
          <div className="page-heading"><div><div className="eyebrow">EMPLOYER DASHBOARD</div><h1>Manage hiring.</h1><p>Manage job status and move applicants through your hiring pipeline.</p></div><button className="primary" onClick={()=>navigate("/employer/jobs/post")}>Post a Job</button></div>
          <div className="dashboard-stats">
            <div><strong>{providerJobs.length}</strong><span>Total jobs</span></div>
            <div><strong>{providerJobs.filter(j=>j.isActive !== false).length}</strong><span>Open jobs</span></div>
            <div><strong>{employerApplications.length}</strong><span>Applications</span></div>
          </div>
          <section className="dashboard-section"><h2>Your jobs</h2>
            <div className="management-list">
              {providerJobs.map(job=><article key={job.id}><div><span className="pill">{job.status || (job.isActive === false ? "Closed" : "Open")}</span><h3>{job.title}</h3><p className="muted">{job.location} · {job.salary} · {job.vacancies} opening(s)</p></div><div className="management-actions"><button className="secondary small" onClick={async()=>{const next=await dataService.updateEmployerJob(job.id,job.isActive===false?"reopen":"close");setProviderJobs(providerJobs.map(x=>x.id===job.id?next:x));}}> {job.isActive===false?"Reopen":"Close"} </button></div></article>)}
            </div>
            {!providerJobs.length && <div className="empty">No jobs yet. Publish your first Telangana opening.</div>}
          </section>
          <section className="dashboard-section"><h2>Applicants</h2>
            <div className="management-list">
              {employerApplications.map(app=><article key={app.id}><div><span className="pill">{app.status}</span><h3>{app.candidateName}</h3><p className="muted">{app.job?.title} · Applied {app.appliedOn}</p></div><select value={app.status} onChange={e=>updateApplicationStatus(app.id,e.target.value)}><option>Applied</option><option>Viewed</option><option>Shortlisted</option><option>Interview</option><option>Selected</option><option>Rejected</option></select></article>)}
            </div>
            {!employerApplications.length && <div className="empty">No applications have arrived yet.</div>}
          </section>
        </main>
      )}

      {mode === "admin" && adminSummary && (
        <main className="page"><div className="page-heading"><div><div className="eyebrow">ADMIN</div><h1>Platform overview.</h1><p>Core 248 Works operating metrics.</p></div></div>
          <div className="dashboard-stats">
            <div><strong>{adminSummary.users}</strong><span>Users</span></div><div><strong>{adminSummary.jobSeekers}</strong><span>Job seekers</span></div><div><strong>{adminSummary.employers}</strong><span>Employers</span></div><div><strong>{adminSummary.openJobs}</strong><span>Open jobs</span></div><div><strong>{adminSummary.applications}</strong><span>Applications</span></div>
          </div>
        </main>
      )}

      {mode === "privacy" && (
        <main className="page legal-page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">248 WORKS · LEGAL</div>
              <h1>Privacy Policy</h1>
              <p>How 248 Works handles information when you use the platform.</p>
            </div>
          </div>

          <section className="legal-card">
            <p className="legal-updated">Last updated: 7 October 2026</p>
            <h2>1. Information we collect</h2>
            <p>248 Works may collect information you provide when creating an account, building a job-seeker profile, posting a job, applying for a job, or contacting us. This can include your name, contact details, professional information, job listing information and account activity.</p>

            <h2>2. How we use information</h2>
            <p>We use information to provide and secure the platform, display relevant job opportunities, process applications, support employer and job-seeker workflows, prevent abuse, and improve the service.</p>

            <h2>3. Authentication</h2>
            <p>248 Works uses TriSend for centralized authentication. Authentication credentials and provider secrets are handled by the authentication service rather than being embedded in the 248 Works browser application.</p>

            <h2>4. Sharing</h2>
            <p>Information may be displayed to other platform users where it is necessary for the job-seeking or hiring workflow. We do not sell personal information as part of the core 248 Works service.</p>

            <h2>5. Security and retention</h2>
            <p>We use reasonable technical and organizational safeguards and retain information only as long as reasonably necessary for the relevant account, operational, legal or security purpose.</p>

            <h2>6. Your choices</h2>
            <p>You may request access, correction or deletion of personal information, subject to applicable legal and operational requirements. Additional account controls will be introduced as the platform moves beyond the MVP.</p>

            <h2>7. Changes to this policy</h2>
            <p>We may update this policy as 248 Works evolves. Material changes will be reflected on this page with an updated date.</p>
          </section>
        </main>
      )}

      {mode === "grievance" && (
        <main className="page legal-page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">248 WORKS · SUPPORT</div>
              <h1>Grievance Redressal</h1>
              <p>A clear route for reporting platform, account, job-listing or hiring concerns.</p>
            </div>
          </div>

          <section className="legal-card">
            <h2>Raise a concern</h2>
            <p>If you have a concern about an account, job listing, application, employer interaction, privacy matter, impersonation, misleading information or other platform abuse, please report it through the official 248 Works support channel made available to you during onboarding or account support.</p>

            <h2>What to include</h2>
            <div className="legal-list">
              <div><strong>1. Identify the issue</strong><span>Explain what happened and when it occurred.</span></div>
              <div><strong>2. Provide context</strong><span>Include the relevant job title, business or account details where applicable.</span></div>
              <div><strong>3. Add supporting evidence</strong><span>Where appropriate, provide screenshots or other information that helps us investigate.</span></div>
            </div>

            <h2>Review process</h2>
            <p>We will review complaints based on the information available and may request additional details when necessary. Where appropriate, we may restrict listings, accounts or platform access while an issue is investigated.</p>

            <h2>Important</h2>
            <p>248 Works is currently an MVP focused on Telangana. A dedicated published grievance-officer contact and formal commercial support workflow will be added before full commercial launch.</p>
          </section>
        </main>
      )}

      {mode === "not-found" && (
        <main className="page legal-page">
          <div className="legal-card not-found-card">
            <div className="eyebrow">404 · PAGE NOT FOUND</div>
            <h1>We couldn't find that page.</h1>
            <p className="muted">The URL may be incorrect, or the page may have moved.</p>
            <button className="primary" onClick={() => navigate("/")}>Back to 248 Works</button>
          </div>
        </main>
      )}

      {selectedJob && (
        <div className="modal-backdrop">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setSelectedJob(null)} aria-label="Close job details">×</button>
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
          <a href="/privacy" style={{ color: "inherit" }}>Privacy</a> ·{" "}
          <a href="/grievance" style={{ color: "inherit" }}>Grievance</a>
        </span>
      </footer>

      {authOpen && (
        <AuthModal
          role={authPurpose}
          initialMode={authMode}
          socialPending={socialPending}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
