import { useEffect, useMemo, useState } from "react";
import { categories, TELANGANA_LOCATIONS, TELANGANA_STATE } from "./data/mockData";
import { dataService } from "./services/dataService";
import { authService } from "./services/authService";
import AuthModal from "./components/AuthModal";
import logo from "./assets/248-works-logo.svg";

const brand = "248 Works";

const alertsStorageKey = (currentSession) => {
  const identity = currentSession?.user?.id || currentSession?.user?.email;
  return identity
    ? "248works.jobAlerts:" + String(identity).trim().toLowerCase()
    : "248works.jobAlerts:anonymous";
};

const readJobAlerts = (currentSession) => {
  try {
    const value = localStorage.getItem(alertsStorageKey(currentSession));
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
};

const prefillProfileFromSession = (profile, user) => {
  const current = profile || {};
  const source = user || {};
  const pick = (...values) => values.map(value => typeof value === "string" ? value.trim() : value).find(value => value !== undefined && value !== null && value !== "");
  const updates = {
    name: pick(current.name, source.name, source.displayName, source.fullName),
    phone: pick(current.phone, source.phone, source.phoneNumber, source.mobilePhone),
    location: pick(current.location, source.location, source.address, source.city),
    headline: pick(current.headline, source.headline, source.jobTitle, source.title),
    bio: pick(current.bio, source.bio, source.about, source.description),
    profileImageBase64: pick(current.profileImageBase64, source.profileImageBase64, source.picture, source.photoURL, source.avatarUrl, source.avatar),
    skills: Array.isArray(current.skills) && current.skills.length ? current.skills : (Array.isArray(source.skills) ? source.skills : current.skills),
    experience: pick(current.experience, source.experience),
    education: pick(current.education, source.education)
  };
  const next = { ...current };
  let changed = false;
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null && value !== "" &&
        (next[key] === undefined || next[key] === null || next[key] === "" || (Array.isArray(next[key]) && next[key].length === 0))) {
      next[key] = value;
      changed = true;
    }
  }
  return { profile: next, changed };
};

const getProfileCompletion = (profile, role) => {
  const fields = role === "Employer"
    ? [profile?.name, profile?.phone, profile?.location, profile?.company, profile?.businessType, profile?.headline, profile?.bio]
    : [profile?.name, profile?.phone, profile?.location, profile?.headline, profile?.skills, profile?.experience, profile?.education];
  const complete = fields.filter((value) => Array.isArray(value) ? value.length > 0 : String(value ?? "").trim().length > 0).length;
  return Math.round((complete / fields.length) * 100);
};


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
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("248works.theme") === "dark" ? "dark" : "light"; } catch { return "light"; } });
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

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
  const [jobAlerts, setJobAlerts] = useState(() => readJobAlerts(authService.getSession()));
  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState("All");
  const [savedSearch, setSavedSearch] = useState("");
  const [alertSearch, setAlertSearch] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
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
    let active = true;
    const initialize = async () => {
      let currentSession = authService.getSession();
      // Restore the existing login before protected API calls. Access tokens are short-lived;
      // refresh tokens preserve the session across reloads and deployments.
      if (currentSession?.refreshToken) {
        try {
          currentSession = await authService.refresh();
          if (active) setSession(currentSession);
        } catch {
          currentSession = authService.getSession();
          if (active) setSession(null);
        }
      } else if (currentSession?.token) {
        try {
          currentSession = await authService.validateSession();
          if (active) setSession(currentSession);
        } catch {
          currentSession = null;
          if (active) setSession(null);
        }
      }
      try {
        const [apps, currentProfile] = await Promise.all([
          dataService.getApplications(),
          currentSession ? dataService.getProfile().catch(() => null) : Promise.resolve(null)
        ]);
        if (active) {
          setApplications(apps);
          setProfile(currentProfile);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    initialize().catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
        await refreshRoleData(nextSession.user?.role, nextSession);
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

  const refreshRoleData = async (role = session?.user?.role, authSession = authService.getSession()) => {
    if (!role) return;
    const loadAndPrefillProfile = async () => {
      const savedProfile = await dataService.getProfile();
      const { profile: prefetchedProfile, changed } = prefillProfileFromSession(savedProfile, authSession?.user);
      if (changed) {
        const result = await dataService.updateProfile(prefetchedProfile);
        return result.profile || prefetchedProfile;
      }
      return savedProfile;
    };
    if (role === "JobSeeker") {
      const [apps, saved, currentProfile] = await Promise.all([
        dataService.getApplications(),
        dataService.getSavedJobs(),
        loadAndPrefillProfile()
      ]);
      setApplications(apps); setSavedJobs(saved); setProfile(currentProfile);
    }
    if (role === "Employer") {
      const [ownedJobs, employerApps, currentProfile] = await Promise.all([
        dataService.getEmployerJobs(),
        dataService.getEmployerApplications(),
        loadAndPrefillProfile()
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
    setJobAlerts(readJobAlerts(session));
  }, [session?.user?.id, session?.user?.email]);

  useEffect(() => {
    if (session?.user?.role) refreshRoleData(session.user.role);
  }, []);
  const logout = async () => {
    setLogoutConfirmOpen(false);
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
    if (profileSaving) return;
    setProfileSaving(true);
    try {
      const result = await dataService.updateProfile(profile || {});
      setProfile(result.profile || result);
      showToast("Profile updated successfully.");
    } catch (error) {
      showToast(error.message || "Unable to update profile. Please try again.");
    } finally {
      setProfileSaving(false);
    }
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
    localStorage.setItem(alertsStorageKey(session), JSON.stringify(next));
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
    <div className={"app-shell theme-" + theme} data-theme={theme}>
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
          {session?.user?.role === "JobSeeker" && <>
            <button className={mode === "applications" ? "nav-active" : ""} onClick={() => navigate("/applications")}>Applications</button>
            <button className={mode === "saved" ? "nav-active" : ""} onClick={() => navigate("/saved")}>Saved</button>
            <button className={mode === "alerts" ? "nav-active" : ""} onClick={() => navigate("/alerts")}>Alerts</button>
          </>}
          {session?.user?.role === "Employer" && <button className={mode === "employer-dashboard" ? "nav-active" : ""} onClick={() => navigate("/employer/jobs")}>Manage Jobs</button>}
          {session && <button className={mode === "profile" ? "nav-active" : ""} onClick={() => navigate("/profile")}>Profile</button>}
          {session ? (
            <button onClick={() => setLogoutConfirmOpen(true)}>Sign out</button>
          ) : (
            <span className="auth-actions">
              <button className="topbar-signup" onClick={() => openAuth("login", "JobSeeker")}>Join Us</button>
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
        <main className="page workspace-page">
          <div className="page-heading workspace-heading">
            <div><div className="eyebrow">JOB SEEKER WORKSPACE</div><h1>Applications</h1><p>Follow every opportunity from submission to decision.</p></div>
            <button className="secondary" onClick={() => navigate("/emplyee/jobs")}>Explore jobs <span aria-hidden="true">→</span></button>
          </div>
          <div className="workspace-metrics">
            <article><span>Total applications</span><strong>{applications.length}</strong><small>All submitted applications</small></article>
            <article><span>In progress</span><strong>{applications.filter(app => !["Selected", "Rejected"].includes(app.status)).length}</strong><small>Awaiting a final outcome</small></article>
            <article><span>Shortlisted</span><strong>{applications.filter(app => ["Shortlisted", "Interview", "Selected"].includes(app.status)).length}</strong><small>Positive hiring progress</small></article>
          </div>
          <div className="workspace-toolbar">
            <label className="toolbar-search"><span className="sr-only">Search applications</span><input value={applicationSearch} onChange={event => setApplicationSearch(event.target.value)} placeholder="Search by role, company or location" /></label>
            <label className="toolbar-filter"><span className="sr-only">Filter application status</span><select value={applicationStatusFilter} onChange={event => setApplicationStatusFilter(event.target.value)}><option>All</option><option>Applied</option><option>Viewed</option><option>Shortlisted</option><option>Interview</option><option>Selected</option><option>Rejected</option></select></label>
          </div>
          <div className="application-list workspace-list">
            {applications.filter(app => {
              const haystack = [app.job?.title, app.job?.company, app.job?.location, app.status].join(" ").toLowerCase();
              return (applicationStatusFilter === "All" || app.status === applicationStatusFilter) && haystack.includes(applicationSearch.trim().toLowerCase());
            }).map(app => (
              <article className="application-row" key={app.id}>
                <div className="application-company-mark" aria-hidden="true">{String(app.job?.company || "J").trim().slice(0,1).toUpperCase()}</div>
                <div className="application-row-main">
                  <div className="application-row-title"><h3>{app.job?.title || "Job opportunity"}</h3><span className={"status-pill status-" + String(app.status || "applied").toLowerCase().replace(/\s+/g, "-")}>{app.status || "Applied"}</span></div>
                  <p>{app.job?.company || "Company"} <span aria-hidden="true">·</span> {app.job?.location || "Telangana"}</p>
                  <small>Applied {app.appliedOn || "recently"}</small>
                </div>
                {app.job && <button className="secondary small" onClick={() => setSelectedJob(app.job)}>View job</button>}
              </article>
            ))}
          </div>
          {!applications.length && <div className="empty workspace-empty"><div className="empty-icon" aria-hidden="true">↗</div><h2>Your next opportunity starts here</h2><p>You haven't applied to a job yet. Explore current openings and track every application here.</p><button className="primary" onClick={() => navigate("/emplyee/jobs")}>Browse jobs</button></div>}
          {applications.length > 0 && applications.filter(app => {
            const haystack = [app.job?.title, app.job?.company, app.job?.location, app.status].join(" ").toLowerCase();
            return (applicationStatusFilter === "All" || app.status === applicationStatusFilter) && haystack.includes(applicationSearch.trim().toLowerCase());
          }).length === 0 && <div className="empty workspace-empty"><h2>No matching applications</h2><p>Try changing your search or status filter.</p><button className="secondary" onClick={() => { setApplicationSearch(""); setApplicationStatusFilter("All"); }}>Clear filters</button></div>}
        </main>
      )}

      {mode === "alerts" && (
        <main className="page workspace-page">
          <div className="page-heading workspace-heading">
            <div><div className="eyebrow">PERSONALISED DISCOVERY</div><h1>Job alerts</h1><p>Keep your saved search criteria organised and return to matching jobs anytime.</p></div>
            <button className="primary" onClick={() => navigate("/emplyee/jobs")}>Create an alert <span aria-hidden="true">→</span></button>
          </div>
          <div className="workspace-note"><span className="note-icon" aria-hidden="true">i</span><p>Alerts currently save your search preferences in this browser profile. Email or push notifications are not enabled yet.</p></div>
          <div className="workspace-toolbar">
            <label className="toolbar-search"><span className="sr-only">Search saved alerts</span><input value={alertSearch} onChange={event => setAlertSearch(event.target.value)} placeholder="Find an alert by keyword or category" /></label>
            <span className="toolbar-count">{jobAlerts.length} of 10 alerts saved</span>
          </div>
          <div className="alert-grid">
            {jobAlerts.filter(alert => [alert.query, alert.category].join(" ").toLowerCase().includes(alertSearch.trim().toLowerCase())).map((alert, index) => (
              <article className="alert-card" key={String(alert.createdAt || "") + "-" + index}>
                <div className="alert-card-top"><span className="alert-icon" aria-hidden="true">⌕</span><span className="pill">{alert.category}</span></div>
                <h2>{alert.query || "All Telangana jobs"}</h2>
                <p className="muted">Created {alert.createdAt && !Number.isNaN(new Date(alert.createdAt).getTime()) ? new Date(alert.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "recently"}</p>
                <div className="alert-card-actions">
                  <button className="primary small" onClick={() => { setQuery(alert.query || ""); setCategory(alert.category || "All"); navigate("/emplyee/jobs"); }}>View matching jobs</button>
                  <button className="secondary small" onClick={() => { const next = jobAlerts.filter((item) => item !== alert); setJobAlerts(next); localStorage.setItem(alertsStorageKey(session), JSON.stringify(next)); showToast("Job alert removed."); }}>Remove</button>
                </div>
              </article>
            ))}
          </div>
          {!jobAlerts.length && <div className="empty workspace-empty"><div className="empty-icon" aria-hidden="true">⌕</div><h2>No job alerts yet</h2><p>Create an alert from Find Jobs to keep a search you want to revisit.</p><button className="primary" onClick={() => navigate("/emplyee/jobs")}>Find jobs</button></div>}
          {jobAlerts.length > 0 && !jobAlerts.some(alert => [alert.query, alert.category].join(" ").toLowerCase().includes(alertSearch.trim().toLowerCase())) && <div className="empty workspace-empty"><h2>No alerts match that search</h2><button className="secondary" onClick={() => setAlertSearch("")}>Clear search</button></div>}
        </main>
      )}

      {mode === "saved" && (
        <main className="page workspace-page">
          <div className="page-heading workspace-heading">
            <div><div className="eyebrow">YOUR SHORTLIST</div><h1>Saved jobs</h1><p>Keep promising opportunities close and come back when you're ready.</p></div>
            <button className="primary" onClick={() => navigate("/emplyee/jobs")}>Discover jobs <span aria-hidden="true">→</span></button>
          </div>
          <div className="workspace-toolbar">
            <label className="toolbar-search"><span className="sr-only">Search saved jobs</span><input value={savedSearch} onChange={event => setSavedSearch(event.target.value)} placeholder="Search saved roles, companies or locations" /></label>
            <span className="toolbar-count">{savedJobs.length} saved</span>
          </div>
          <div className="job-grid workspace-job-grid">
            {savedJobs.filter(job => [job.title, job.company, job.location, job.category].join(" ").toLowerCase().includes(savedSearch.trim().toLowerCase())).map(job => (
              <article className="job-card workspace-job-card" key={job.id}>
                <div className="job-top"><span className="pill">{job.category || "Opportunity"}</span><span>{job.posted || "Recently posted"}</span></div>
                <h3>{job.title}</h3><strong>{job.company}</strong>
                <p className="muted">📍 {job.location}, Telangana <span aria-hidden="true">·</span> {job.type || "Full-time"}</p>
                <div className="salary">{job.salary || "Salary not specified"}</div>
                <p>{job.description || "Contact the employer for further details about this role."}</p>
                <div className="job-footer"><button className="secondary small" onClick={() => saveJob(job.id)}>Remove from saved</button><button className="primary small" onClick={() => setSelectedJob(job)}>View job</button></div>
              </article>
            ))}
          </div>
          {!savedJobs.length && <div className="empty workspace-empty"><div className="empty-icon" aria-hidden="true">☆</div><h2>Build your shortlist</h2><p>Save jobs that interest you and they'll be collected here for easy access.</p><button className="primary" onClick={() => navigate("/emplyee/jobs")}>Browse jobs</button></div>}
          {savedJobs.length > 0 && !savedJobs.some(job => [job.title, job.company, job.location, job.category].join(" ").toLowerCase().includes(savedSearch.trim().toLowerCase())) && <div className="empty workspace-empty"><h2>No saved jobs match that search</h2><button className="secondary" onClick={() => setSavedSearch("")}>Clear search</button></div>}
        </main>
      )}

      {mode === "profile" && (
        <main className="page workspace-page">
          <div className="page-heading workspace-heading">
            <div><div className="eyebrow">ACCOUNT & PROFESSIONAL IDENTITY</div><h1>Profile</h1><p>Keep your details current so opportunities and employers have the right context.</p></div>
            <div className="profile-completion"><div className="completion-ring" style={{ "--completion": getProfileCompletion(profile || {}, session?.user?.role) + "%" }}><span>{getProfileCompletion(profile || {}, session?.user?.role)}%</span></div><div><strong>Profile strength</strong><small>{getProfileCompletion(profile || {}, session?.user?.role) >= 80 ? "Looking great" : "A few details can make your profile stronger"}</small></div></div>
          </div>
          <section className="theme-settings" aria-labelledby="theme-settings-title">
            <div className="theme-settings-copy"><span className="theme-settings-icon" aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span><div><h2 id="theme-settings-title">Appearance</h2><p>Choose the look that feels right. This setting is saved on this device.</p></div></div>
            <div className="theme-switch" role="group" aria-label="Application theme">
              <button type="button" className={theme === "light" ? "theme-option active" : "theme-option"} aria-pressed={theme === "light"} onClick={() => { setTheme("light"); try { localStorage.setItem("248works.theme", "light"); } catch {} }}>☀ Light</button>
              <button type="button" className={theme === "dark" ? "theme-option active" : "theme-option"} aria-pressed={theme === "dark"} onClick={() => { setTheme("dark"); try { localStorage.setItem("248works.theme", "dark"); } catch {} }}>☾ Dark</button>
            </div>
          </section>
          <div className="profile-layout">
            <aside className="profile-aside">
              <div className="profile-identity">
                <label className="profile-avatar-upload" title="Upload or change profile photo">{profile?.profileImageBase64 ? <img className="profile-avatar-image" src={profile.profileImageBase64} alt="Profile" /> : <span className="profile-avatar" aria-hidden="true">{String(profile?.name || session?.user?.name || session?.user?.email || "U").trim().slice(0,1).toUpperCase()}</span>}<span className="profile-photo-action">Edit photo</span><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload profile photo" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 2*1024*1024) { showToast("Choose an image smaller than 2 MB."); event.target.value = ""; return; } if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { showToast("Use a JPG, PNG or WebP image."); event.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => setProfile(current => ({ ...(current || {}), profileImageBase64: String(reader.result) })); reader.onerror = () => showToast("Unable to read this image."); reader.readAsDataURL(file); }} /></label>
                <h2>{profile?.name || session?.user?.name || "Your name"}</h2>
                <p>{profile?.headline || (session?.user?.role === "Employer" ? "Employer account" : "Job seeker")}</p>
                <span className="role-badge">{session?.user?.role === "Employer" ? "Employer" : "Job seeker"}</span>
              </div>
              <div className="profile-account-meta"><span>Account email</span><strong>{profile?.email || session?.user?.email || "Not available"}</strong><span>Account type</span><strong>{session?.user?.role || profile?.role || "JobSeeker"}</strong></div>
              <div className="profile-tip"><strong>Make it count</strong><p>A clear headline, current location and a few relevant details help your profile stand out.</p></div>
            </aside>
            <form className="form-card profile-card profile-form" onSubmit={updateProfile}>
              <div className="form-section-heading"><div><h2>Basic information</h2><p>These details help identify and contact you.</p></div><span className="form-section-index">01</span></div>
              <div className="two-col">
                <label>Full name <span className="required-mark" aria-hidden="true">*</span><input required maxLength="120" autoComplete="name" value={profile?.name || ""} onChange={event => setProfile({ ...(profile || {}), name: event.target.value })} placeholder="Your full name" /></label>
                <label>Phone number <span className="field-hint">India (+91) · 10 digits</span><input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength="15" value={(() => { const digits = String(profile?.phone || "").replace(/^\\+91\\s?/, "").replace(/\\D/g, "").slice(0, 10); return "+91 " + (digits.length > 5 ? digits.slice(0, 5) + " " + digits.slice(5) : digits); })()} onChange={event => { const digits = event.target.value.replace(/^\\+91\\s?/, "").replace(/\\D/g, "").slice(0, 10); setProfile({ ...(profile || {}), phone: "+91 " + (digits.length > 5 ? digits.slice(0, 5) + " " + digits.slice(5) : digits) }); }} placeholder="+91 98765 43210" /></label>
              </div>
              <div className="two-col">
                <label>Location<input maxLength="100" autoComplete="address-level2" value={profile?.location || ""} onChange={event => setProfile({ ...(profile || {}), location: event.target.value })} placeholder="Hyderabad, Telangana" /></label>
                <label>Professional headline<input maxLength="180" value={profile?.headline || ""} onChange={event => setProfile({ ...(profile || {}), headline: event.target.value })} placeholder={session?.user?.role === "Employer" ? "e.g. Hiring for a growing retail business" : "e.g. Retail sales professional"} /></label>
              </div>
              {session?.user?.role === "JobSeeker" ? <>
                <div className="form-section-heading profile-section-spaced"><div><h2>Career details</h2><p>Help employers understand your strengths and experience.</p></div><span className="form-section-index">02</span></div>
                <label>Skills <span className="field-hint">Separate skills with commas</span><input value={(profile?.skills || []).join(", ")} onChange={event => setProfile({ ...(profile || {}), skills: event.target.value.split(",").map(value => value.trim()).filter(Boolean).slice(0,30) })} placeholder="Sales, customer service, inventory" /></label>
                <div className="two-col">
                  <label>Experience<input maxLength="120" value={profile?.experience || ""} onChange={event => setProfile({ ...(profile || {}), experience: event.target.value })} placeholder="e.g. 2 years / Fresher" /></label>
                  <label>Education<input maxLength="180" value={profile?.education || ""} onChange={event => setProfile({ ...(profile || {}), education: event.target.value })} placeholder="e.g. Intermediate, Degree" /></label>
                </div>
                
              </> : <>
                <div className="form-section-heading profile-section-spaced"><div><h2>Business details</h2><p>Give candidates useful context about your organisation.</p></div><span className="form-section-index">02</span></div>
                <div className="two-col">
                  <label>Business name<input maxLength="160" value={profile?.company || ""} onChange={event => setProfile({ ...(profile || {}), company: event.target.value })} placeholder="Registered or trading name" /></label>
                  <label>Business type<input maxLength="120" value={profile?.businessType || ""} onChange={event => setProfile({ ...(profile || {}), businessType: event.target.value })} placeholder="Retail, restaurant, services..." /></label>
                </div>
              </>}
              <div className="form-section-heading profile-section-spaced"><div><h2>About you</h2><p>A short introduction is enough; avoid sharing sensitive personal information.</p></div><span className="form-section-index">03</span></div>
              <label>Introduction<textarea rows="4" maxLength="2000" value={profile?.bio || ""} onChange={event => setProfile({ ...(profile || {}), bio: event.target.value })} placeholder="Share a brief introduction, your strengths or what you're looking for." /></label>
              <div className="profile-form-footer"><span className="field-hint">Your changes are saved to your 248 Works account.</span><button className="primary" type="submit" disabled={profileSaving}>{profileSaving ? "Saving changes…" : "Save profile"}</button></div>
            </form>
          </div>
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
        <span>© 2026 248 Works</span>
        <span>Developed by <a href="https://www.omega-technologies.in" target="_blank" rel="noopener noreferrer">Omega Technologies</a></span>
        <span>
          <a href="/privacy">Privacy</a> ·{" "}
          <a href="/grievance">Grievance</a>
        </span>
      </footer>
      {logoutConfirmOpen && (
        <div className="modal-backdrop logout-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLogoutConfirmOpen(false); }}>
          <section className="modal logout-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title" aria-describedby="logout-confirm-description">
            <div className="logout-confirm-icon" aria-hidden="true">↪</div>
            <h2 id="logout-confirm-title">Sign out of 248 Works?</h2>
            <p id="logout-confirm-description">You'll need to sign in again to access your profile, applications and saved jobs.</p>
            <div className="logout-confirm-actions">
              <button className="secondary" type="button" onClick={() => setLogoutConfirmOpen(false)}>Stay signed in</button>
              <button className="primary logout-confirm-action" type="button" onClick={logout}>Yes, sign out</button>
            </div>
          </section>
        </div>
      )}

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
