const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");

const STATE = "Telangana";
const TRISEND_BASE_URL = (process.env.TRISEND_BASE_URL || "https://trisend-wxyu.onrender.com").replace(/\/$/, "");
let container;

function db() {
  if (!container) {
    const cs = process.env.COSMOS_CONNECTION_STRING;
    if (!cs) throw new Error("COSMOS_CONNECTION_STRING is not configured.");
    const client = new CosmosClient(cs);
    container = client
      .database(process.env.COSMOS_DATABASE_NAME || "248WorksDB")
      .container(process.env.COSMOS_CONTAINER_NAME || "248Data");
  }
  return container;
}
const reply = (status, body) => ({ status, jsonBody: body, headers: { "Content-Type": "application/json" } });
const emailOf = (v) => String(v || "").trim().toLowerCase();
const validEmail = (e) => e.length >= 5 && e.length <= 320 && e.includes("@") && e.lastIndexOf(".") > e.indexOf("@") + 1;
const roleOf = (v) => String(v || "").toLowerCase() === "employer" ? "Employer" : "JobSeeker";
const iso = () => new Date().toISOString();
const sha = (v, salt) => crypto.createHash("sha256").update(salt + "|" + v).digest("hex");
const otpHash = (email, code) => sha(email + "|" + code, process.env.OTP_PEPPER || "248works-otp");
const sessionHash = (token) => sha(token, process.env.SESSION_PEPPER || "248works-session");
const userId = (email) => "user:" + Buffer.from(email).toString("base64url");

async function query(sql, parameters) {
  const { resources } = await db().items.query({ query: sql, parameters: parameters || [] }).fetchAll();
  return resources;
}
async function read(id, type) {
  try { return (await db().item(id, type).read()).resource; }
  catch (e) { if (e.code === 404 || e.statusCode === 404) return null; throw e; }
}
async function upsert(item) { return (await db().items.upsert(item)).resource; }
async function remove(id, type) {
  try { await db().item(id, type).delete(); }
  catch (e) { if (e.code !== 404 && e.statusCode !== 404) throw e; }
}
async function currentUser(request) {
  const h = request.headers.get("authorization") || "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  const session = await read("session:" + sessionHash(token), "authSession");
  if (!session || session.revoked || new Date(session.expiresAt) <= new Date()) return null;
  return read(session.userId, "user");
}
async function sendEmail(recipient, subject, body) {
  const key = process.env.TRISEND_API_KEY;
  if (!key) throw new Error("TRISEND_API_KEY is not configured.");
  const response = await fetch(TRISEND_BASE_URL + "/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ channel: "email", recipient, subject, body })
  });
  if (!response.ok) throw new Error("TriSend rejected email: " + response.status + " " + await response.text());
}

app.http("health", {
  methods: ["GET"], authLevel: "anonymous", route: "health",
  handler: async () => reply(200, { ok: true, service: "248 Works API" })
});

app.http("auth-request-code", {
  methods: ["POST"], authLevel: "anonymous", route: "auth/request-code",
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const email = emailOf(body.email);
      if (!validEmail(email)) return reply(400, { message: "Enter a valid email address." });

      const latest = (await query(
        "SELECT TOP 1 * FROM c WHERE c.type=@type AND c.email=@email ORDER BY c.createdAt DESC",
        [{ name: "@type", value: "emailOtp" }, { name: "@email", value: email }]
      ))[0];
      if (latest && new Date(latest.createdAt) > new Date(Date.now() - 60000))
        return reply(429, { message: "Please wait before requesting another code." });

      const code = String(crypto.randomInt(100000, 1000000));
      const otp = {
        id: "otp:" + crypto.randomUUID(), type: "emailOtp", email,
        codeHash: otpHash(email, code), attempts: 0, consumed: false,
        createdAt: iso(), expiresAt: new Date(Date.now() + 600000).toISOString()
      };
      await upsert(otp);
      try {
        await sendEmail(
          email,
          "Your 248 Works verification code",
          "Your 248 Works verification code is " + code + ". It expires in 10 minutes. If you did not request this code, you can ignore this email."
        );
      } catch (error) {
        await remove(otp.id, otp.type);
        context.error(error);
        return reply(502, { message: "We could not send the verification email. Please try again." });
      }
      return reply(200, { message: "Verification code sent.", expiresInSeconds: 600 });
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to request a verification code." });
    }
  }
});

app.http("auth-verify-code", {
  methods: ["POST"], authLevel: "anonymous", route: "auth/verify-code",
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const email = emailOf(body.email);
      const code = String(body.code || "").trim();
      if (!validEmail(email) || !/^\d{6}$/.test(code))
        return reply(400, { message: "Email and a 6-digit code are required." });

      const otp = (await query(
        "SELECT TOP 1 * FROM c WHERE c.type=@type AND c.email=@email ORDER BY c.createdAt DESC",
        [{ name: "@type", value: "emailOtp" }, { name: "@email", value: email }]
      ))[0];
      if (!otp || otp.consumed || new Date(otp.expiresAt) <= new Date())
        return reply(401, { message: "The code is invalid or expired." });
      if ((otp.attempts || 0) >= 5)
        return reply(401, { message: "Too many attempts. Request a new code." });

      const expected = Buffer.from(otp.codeHash, "hex");
      const actual = Buffer.from(otpHash(email, code), "hex");
      if (!crypto.timingSafeEqual(expected, actual)) {
        otp.attempts = (otp.attempts || 0) + 1;
        await upsert(otp);
        return reply(401, { message: "The code is invalid or expired." });
      }

      otp.consumed = true; otp.consumedAt = iso(); await upsert(otp);
      const role = roleOf(body.role);
      let user = await read(userId(email), "user");
      if (!user) {
        user = {
          id: userId(email), type: "user", email, normalizedEmail: email, role,
          name: String(body.name || "").trim(),
          phone: String(body.phone || "").trim() || null,
          location: String(body.location || "").trim() || null,
          state: STATE, isEmailVerified: true, createdAt: iso(), updatedAt: iso()
        };
      } else {
        user.isEmailVerified = true;
        if (!user.name && body.name) user.name = String(body.name).trim();
        if (user.role !== "Admin") user.role = role;
        user.updatedAt = iso();
      }
      await upsert(user);

      const token = crypto.randomBytes(48).toString("base64url");
      await upsert({
        id: "session:" + sessionHash(token), type: "authSession", userId: user.id,
        tokenHash: sessionHash(token), createdAt: iso(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), revoked: false
      });
      return reply(200, {
        token,
        user: { id: user.id, email: user.email, role: user.role, name: user.name, location: user.location, state: user.state }
      });
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to verify the code." });
    }
  }
});

app.http("auth-logout", {
  methods: ["POST"], authLevel: "anonymous", route: "auth/logout",
  handler: async (request, context) => {
    try {
      const h = request.headers.get("authorization") || "";
      if (h.toLowerCase().startsWith("bearer ")) {
        const token = h.slice(7).trim();
        const session = await read("session:" + sessionHash(token), "authSession");
        if (session) { session.revoked = true; session.revokedAt = iso(); await upsert(session); }
      }
      return reply(200, { message: "Signed out." });
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to sign out." });
    }
  }
});

const mapJob = (job) => ({
  ...job,
  type: job.jobType || job.type || "Full-time",
  jobType: job.jobType || job.type || "Full-time",
  posted: job.posted || "Recently"
});

app.http("jobs", {
  methods: ["GET", "POST"], authLevel: "anonymous", route: "jobs",
  handler: async (request, context) => {
    try {
      if (request.method === "GET") {
        const jobs = await query(
          "SELECT * FROM c WHERE c.type=@type AND c.isActive=true ORDER BY c.createdAt DESC",
          [{ name: "@type", value: "job" }]
        );
        return reply(200, jobs.map(mapJob));
      }
      const user = await currentUser(request);
      if (!user || !["Employer", "Admin"].includes(user.role))
        return reply(401, { message: "Employer sign-in is required." });

      const body = await request.json().catch(() => ({}));
      const location = String(body.location || "").trim();
      if (!location || !String(body.title || "").trim() || !String(body.company || "").trim())
        return reply(400, { message: "Title, business name and Telangana location are required." });

      const job = {
        id: "job:" + crypto.randomUUID(), type: "job",
        title: String(body.title).trim(), company: String(body.company).trim(),
        location, state: STATE, salary: String(body.salary || "").trim(),
        category: String(body.category || "Other").trim(),
        jobType: String(body.jobType || body.type || "Full-time").trim(),
        description: String(body.description || "").trim(),
        vacancies: Math.max(1, Number(body.vacancies || 1)),
        skills: Array.isArray(body.skills) ? body.skills : [],
        isActive: true, employerId: user.id, createdAt: iso(), updatedAt: iso()
      };
      await upsert(job);
      return reply(201, mapJob(job));
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to load or save jobs." });
    }
  }
});

app.http("applications", {
  methods: ["GET", "POST"], authLevel: "anonymous", route: "applications",
  handler: async (request, context) => {
    try {
      const user = await currentUser(request);
      if (!user) return reply(401, { message: "Please sign in first." });

      if (request.method === "GET") {
        if (user.role !== "JobSeeker") return reply(200, []);
        const rows = await query(
          "SELECT * FROM c WHERE c.type=@type AND c.candidateId=@candidateId ORDER BY c.appliedAt DESC",
          [{ name: "@type", value: "application" }, { name: "@candidateId", value: user.id }]
        );
        const result = [];
        for (const row of rows) {
          const job = await read(row.jobId, "job");
          result.push({
            ...row, appliedOn: row.appliedAt ? new Date(row.appliedAt).toLocaleDateString("en-IN") : "Recently",
            job: job ? mapJob(job) : null
          });
        }
        return reply(200, result);
      }

      if (user.role !== "JobSeeker") return reply(403, { message: "Job seeker sign-in is required." });
      const body = await request.json().catch(() => ({}));
      const jobId = String(body.jobId || "").trim();
      const job = await read(jobId, "job");
      if (!job || !job.isActive || job.state !== STATE) return reply(404, { message: "Job not found." });

      const existing = (await query(
        "SELECT TOP 1 * FROM c WHERE c.type=@type AND c.jobId=@jobId AND c.candidateId=@candidateId",
        [
          { name: "@type", value: "application" },
          { name: "@jobId", value: jobId },
          { name: "@candidateId", value: user.id }
        ]
      ))[0];
      if (existing) return reply(200, { ...existing, appliedOn: "Already applied", job: mapJob(job) });

      const application = {
        id: "application:" + crypto.randomUUID(), type: "application",
        jobId, candidateId: user.id, candidateName: user.name || user.email,
        status: "Applied", appliedAt: iso()
      };
      await upsert(application);
      return reply(201, { ...application, appliedOn: "Just now", job: mapJob(job) });
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to process the application." });
    }
  }
});
