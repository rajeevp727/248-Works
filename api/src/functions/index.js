const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const STATE = "Telangana";
const TRISEND_BASE_URL = (process.env.TRISEND_BASE_URL || "https://trisend-wxyu.onrender.com").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || "248works.in";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "248WorksAPI";
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
let container;

function db() {
  if (!container) {
    const cs = process.env.COSMOS_CONNECTION_STRING;
    if (!cs) throw new Error("COSMOS_CONNECTION_STRING is not configured.");
    const client = new CosmosClient(cs);
    container = client.database(process.env.COSMOS_DATABASE_NAME || "248WorksDB")
      .container(process.env.COSMOS_CONTAINER_NAME || "248Data");
  }
  return container;
}

const reply = (status, body, extraHeaders = {}) => ({
  status,
  jsonBody: body,
  headers: { "Content-Type": "application/json", ...extraHeaders }
});
const emailOf = (v) => String(v || "").trim().toLowerCase();
const validEmail = (e) => e.length >= 5 && e.length <= 320 && e.includes("@") && e.lastIndexOf(".") > e.indexOf("@") + 1;
const roleOf = (v) => String(v || "").toLowerCase() === "employer" ? "Employer" : "JobSeeker";
const iso = () => new Date().toISOString();
const sha = (v, salt) => crypto.createHash("sha256").update(salt + "|" + v).digest("hex");
const otpHash = (email, code) => sha(email + "|" + code, process.env.OTP_PEPPER || "248works-otp");
const userId = (email) => "user:" + Buffer.from(email).toString("base64url");
const clientIp = (request) => {
  const forwarded = request.headers.get("x-forwarded-for") || request.headers.get("x-client-ip") || "";
  return (forwarded.split(",")[0] || "unknown").trim().slice(0, 128);
};
const rateLimitId = (scope, key) => "rate:" + sha(scope + "|" + key, process.env.RATE_LIMIT_PEPPER || process.env.OTP_PEPPER || "248works-rate");

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

/*
 * Row-level security (RLS) boundary.
 *
 * Cosmos DB does not provide PostgreSQL-style RLS policies when the API uses
 * a shared Cosmos connection string. Therefore the API is the enforcement
 * boundary: every protected row carries ownerId and every protected query
 * includes the authenticated user's id. Never expose a generic "read by id"
 * operation to the browser.
 */
const ownerOf = (row) => row?.ownerId || row?.userId || row?.candidateId || row?.employerId || null;

function canReadRow(user, row) {
  if (!user || !row) return false;
  if (user.role === "Admin") return true;
  return ownerOf(row) === user.id;
}

function canWriteRow(user, row) {
  return canReadRow(user, row);
}

async function readOwned(id, type, user) {
  const row = await read(id, type);
  return canReadRow(user, row) ? row : null;
}

async function queryOwned(sql, parameters, user) {
  if (!user) return [];
  const rows = await query(sql, parameters);
  return rows.filter((row) => canReadRow(user, row));
}


async function enforceRateLimit(scope, key, limit, windowMs) {
  const now = Date.now();
  const id = rateLimitId(scope, key);
  const existing = await read(id, "rateLimit");
  if (!existing || new Date(existing.windowEndsAt).getTime() <= now) {
    await upsert({
      id, type: "rateLimit", scope,
      count: 1,
      windowStartedAt: new Date(now).toISOString(),
      windowEndsAt: new Date(now + windowMs).toISOString()
    });
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((new Date(existing.windowEndsAt).getTime() - now) / 1000))
    };
  }
  existing.count += 1;
  await upsert(existing);
  return {
    allowed: true,
    retryAfterSeconds: Math.max(1, Math.ceil((new Date(existing.windowEndsAt).getTime() - now) / 1000))
  };
}

function jwtSecret() {
  if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error("JWT_SECRET is not configured with sufficient entropy.");
  return JWT_SECRET;
}
function issueAccessToken(user) {
  const jti = crypto.randomUUID();
  return {
    token: jwt.sign(
      { sub: user.id, email: user.email, role: user.role, name: user.name || "" },
      jwtSecret(),
      { algorithm: "HS256", issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: ACCESS_TOKEN_TTL, jwtid: jti }
    ),
    jti
  };
}
const refreshHash = (token) => sha(token, process.env.REFRESH_TOKEN_PEPPER || process.env.OTP_PEPPER || "248works-refresh");
async function activeSessions(userId) {
  return query(
    "SELECT * FROM c WHERE c.type=@type AND c.userId=@userId AND c.revoked=false ORDER BY c.createdAt ASC",
    [{ name: "@type", value: "refreshToken" }, { name: "@userId", value: userId }]
  );
}
async function revokeSession(session) {
  session.revoked = true;
  session.revokedAt = iso();
  await upsert(session);
}
async function createRefreshToken(user) {
  const token = crypto.randomBytes(64).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await upsert({
    id: "refresh:" + refreshHash(token),
    type: "refreshToken",
    userId: user.id,
    tokenHash: refreshHash(token),
    createdAt: iso(),
    expiresAt,
    revoked: false
  });
  return { token, expiresAt };
}
async function createLoginSession(user, replaceOldest = false) {
  const sessions = await activeSessions(user.id);
  if (sessions.length >= 3 && !replaceOldest) {
    return { requiresConfirmation: true, oldest: sessions[0] };
  }
  if (sessions.length >= 3) await revokeSession(sessions[0]);
  return { requiresConfirmation: false, refresh: await createRefreshToken(user) };
}
async function rotateRefreshToken(token) {
  const hash = refreshHash(token);
  const record = await read("refresh:" + hash, "refreshToken");
  if (!record || record.revoked || new Date(record.expiresAt) <= new Date()) return null;
  record.revoked = true;
  record.revokedAt = iso();
  await upsert(record);
  const user = await read(record.userId, "user");
  if (!user) return null;
  const refresh = await createRefreshToken(user);
  const access = issueAccessToken(user);
  return { access, refresh, user };
}
async function currentUser(request) {
  const h = request.headers.get("authorization") || "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret(), {
      algorithms: ["HS256"], issuer: JWT_ISSUER, audience: JWT_AUDIENCE
    });
    if (!payload.sub || !payload.jti) return null;
    const revoked = await read("revokedJwt:" + payload.jti, "revokedJwt");
    if (revoked) return null;
    return read(payload.sub, "user");
  } catch {
    return null;
  }
}

function swaPrincipal(request) {
  const header = request.headers.get("x-ms-client-principal") || "";
  if (!header) return null;
  try {
    const json = Buffer.from(header, "base64").toString("utf8");
    const principal = JSON.parse(json);
    const provider = String(principal.identityProvider || "").toLowerCase();
    const details = String(principal.userDetails || "").trim();
    const claims = Array.isArray(principal.claims) ? principal.claims : [];
    const claim = (types) => {
      const found = claims.find((item) => types.includes(String(item.typ || "").toLowerCase()));
      return found?.val ? String(found.val).trim() : "";
    };
    const email = emailOf(
      claim(["email", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "preferred_username"]) ||
      (details.includes("@") ? details : "")
    );
    if (!principal.userId || !email || !["google", "aad"].includes(provider)) return null;
    return { provider, providerUserId: String(principal.userId), email, name: claim(["name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"]) || details };
  } catch {
    return null;
  }
}

function tokenPayload(token) {
  try {
    return jwt.verify(token, jwtSecret(), {
      algorithms: ["HS256"], issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
      ignoreExpiration: true
    });
  } catch {
    return null;
  }
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

app.http("auth-request-code", {
  methods: ["POST"], authLevel: "anonymous", route: "auth/request-code",
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const email = emailOf(body.email);
      if (!validEmail(email)) return reply(400, { message: "Enter a valid email address." });

      const ip = clientIp(request);
      const emailLimit = await enforceRateLimit("otp-email", email, 3, 15 * 60 * 1000);
      const ipLimit = await enforceRateLimit("otp-ip", ip, 3, 15 * 60 * 1000);
      if (!emailLimit.allowed || !ipLimit.allowed) {
        const retry = Math.max(emailLimit.retryAfterSeconds, ipLimit.retryAfterSeconds);
        return reply(429, { message: "Too many verification-code requests. Please try again later.", retryAfterSeconds: retry },
          { "Retry-After": String(retry) });
      }

      const latest = (await query(
        "SELECT TOP 1 * FROM c WHERE c.type=@type AND c.email=@email ORDER BY c.createdAt DESC",
        [{ name: "@type", value: "emailOtp" }, { name: "@email", value: email }]
      ))[0];
      if (latest && new Date(latest.createdAt) > new Date(Date.now() - 60000))
        return reply(429, { message: "Please wait before requesting another code." }, { "Retry-After": "60" });

      const code = String(crypto.randomInt(100000, 1000000));
      const otp = {
        id: "otp:" + crypto.randomUUID(), type: "emailOtp", email,
        codeHash: otpHash(email, code), attempts: 0, consumed: false,
        createdAt: iso(), expiresAt: new Date(Date.now() + 600000).toISOString()
      };
      await upsert(otp);
      try {
        await sendEmail(email, "Your 248 Works verification code",
          "Your 248 Works verification code is " + code + ". It expires in 10 minutes. If you did not request this code, you can ignore this email.");
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

      const verifyLimit = await enforceRateLimit("otp-verify-email", email, 5, 10 * 60 * 1000);
      const verifyIpLimit = await enforceRateLimit("otp-verify-ip", clientIp(request), 20, 10 * 60 * 1000);
      if (!verifyLimit.allowed || !verifyIpLimit.allowed) {
        const retry = Math.max(verifyLimit.retryAfterSeconds, verifyIpLimit.retryAfterSeconds);
        return reply(429, { message: "Too many verification attempts. Request a new code later.", retryAfterSeconds: retry },
          { "Retry-After": String(retry) });
      }

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
          id: userId(email), type: "user", ownerId: userId(email), email, normalizedEmail: email, role,
          name: String(body.name || "").trim(),
          phone: String(body.phone || "").trim() || null,
          location: String(body.location || "").trim() || null,
          state: STATE, isEmailVerified: true, createdAt: iso(), updatedAt: iso()
        };
      } else {
        user.ownerId = user.ownerId || user.id;
        user.isEmailVerified = true;
        if (!user.name && body.name) user.name = String(body.name).trim();
        if (user.role !== "Admin") user.role = role;
        user.updatedAt = iso();
      }
      await upsert(user);

      const replaceOldest = body.replaceOldest === true;
      const loginSession = await createLoginSession(user, replaceOldest);
      if (loginSession.requiresConfirmation) {
        return reply(409, {
          code: "MAX_SESSIONS",
          message: "You already have 3 active sessions.",
          warning: "Logging out the oldest login will sign in this device.",
          requiresConfirmation: true
        });
      }
      const access = issueAccessToken(user);
      return reply(200, {
        token: access.token,
        tokenType: "Bearer",
        expiresIn: 15 * 60,
        refreshToken: loginSession.refresh.token,
        refreshTokenExpiresAt: loginSession.refresh.expiresAt,
        user: { id: user.id, email: user.email, role: user.role, name: user.name, location: user.location, state: user.state }
      });
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to verify the code." });
    }
  }
});


app.http("auth-swa-session", {
  methods: ["POST"], authLevel: "anonymous", route: "auth/swa-session",
  handler: async (request, context) => {
    try {
      const principal = swaPrincipal(request);
      if (!principal) return reply(401, { message: "Google or Microsoft sign-in is required." });
      const body = await request.json().catch(() => ({}));
      const role = roleOf(body.role);
      let user = await read(userId(principal.email), "user");
      if (!user) {
        user = {
          id: userId(principal.email), type: "user", ownerId: userId(principal.email),
          email: principal.email, normalizedEmail: principal.email, role,
          name: String(body.name || principal.name || "").trim(),
          phone: null, location: null, state: STATE,
          isEmailVerified: true, authProvider: principal.provider,
          providerUserId: principal.providerUserId, createdAt: iso(), updatedAt: iso()
        };
      } else {
        user.ownerId = user.ownerId || user.id;
        user.isEmailVerified = true;
        user.authProvider = user.authProvider || principal.provider;
        user.providerUserId = user.providerUserId || principal.providerUserId;
        if (!user.name && principal.name) user.name = principal.name;
        if (user.role !== "Admin") user.role = role;
        user.updatedAt = iso();
      }
      await upsert(user);

      const replaceOldest = body.replaceOldest === true;
      const loginSession = await createLoginSession(user, replaceOldest);
      if (loginSession.requiresConfirmation) {
        return reply(409, {
          code: "MAX_SESSIONS",
          message: "You already have 3 active sessions.",
          warning: "Logging out the oldest login will sign in this device.",
          requiresConfirmation: true
        });
      }
      const access = issueAccessToken(user);
      return reply(200, {
        token: access.token, tokenType: "Bearer", expiresIn: 15 * 60,
        refreshToken: loginSession.refresh.token, refreshTokenExpiresAt: loginSession.refresh.expiresAt,
        user: { id: user.id, email: user.email, role: user.role, name: user.name, location: user.location, state: user.state }
      });
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to complete social sign-in." });
    }
  }
});

app.http("auth-refresh", {
  methods: ["POST"], authLevel: "anonymous", route: "auth/refresh",
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const refreshToken = String(body.refreshToken || "").trim();
      if (!refreshToken) return reply(401, { message: "Refresh token is required." });

      const result = await rotateRefreshToken(refreshToken);
      if (!result) return reply(401, { message: "Refresh token is invalid or expired. Please sign in again." });

      return reply(200, {
        token: result.access.token,
        tokenType: "Bearer",
        expiresIn: 15 * 60,
        refreshToken: result.refresh.token,
        refreshTokenExpiresAt: result.refresh.expiresAt,
        user: {
          id: result.user.id, email: result.user.email, role: result.user.role,
          name: result.user.name, location: result.user.location, state: result.user.state
        }
      });
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to refresh your session." });
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
        const payload = tokenPayload(token);
        if (payload?.jti && payload?.exp) {
          await upsert({
            id: "revokedJwt:" + payload.jti,
            type: "revokedJwt",
            jti: payload.jti,
            expiresAt: new Date(payload.exp * 1000).toISOString(),
            revokedAt: iso()
          });
        }
      }
      return reply(200, { message: "Signed out." });
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to sign out." });
    }
  }
});

function assertRowAccess(user, row, ownerField) {
  if (!user) return false;
  if (user.role === "Admin") return true;
  return row && row[ownerField] === user.id;
}
function publicJob(job) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    state: job.state,
    salary: job.salary,
    category: job.category,
    type: job.jobType || job.type || "Full-time",
    jobType: job.jobType || job.type || "Full-time",
    description: job.description,
    vacancies: job.vacancies,
    skills: Array.isArray(job.skills) ? job.skills : [],
    posted: job.posted || "Recently",
    createdAt: job.createdAt,
    isActive: job.isActive !== false,
    status: job.status || (job.isActive === false ? "Closed" : "Open")
  };
}
const mapJob = publicJob;
function publicApplication(application, job) {
  return {
    id: application.id,
    jobId: application.jobId,
    status: application.status,
    appliedOn: application.appliedAt ? new Date(application.appliedAt).toLocaleDateString("en-IN") : "Recently",
    job: job ? publicJob(job) : null
  };
}

app.http("health", {
  methods: ["GET", "HEAD"], authLevel: "anonymous", route: "health",
  handler: async (request, context) => {
    try {
      const connectionConfigured = Boolean(process.env.COSMOS_CONNECTION_STRING);
      if (!connectionConfigured) {
        return reply(503, {
          status: "unhealthy",
          database: "cosmos",
          reason: "COSMOS_CONNECTION_STRING is not configured.",
          databaseName: process.env.COSMOS_DATABASE_NAME || "248WorksDB",
          containerName: process.env.COSMOS_CONTAINER_NAME || "248Data"
        });
      }

      await db().read();
      return reply(200, {
        status: "healthy",
        database: "cosmos",
        databaseName: process.env.COSMOS_DATABASE_NAME || "248WorksDB",
        containerName: process.env.COSMOS_CONTAINER_NAME || "248Data"
      });
    } catch (error) {
      context.error(error);
      return reply(503, {
        status: "unhealthy",
        database: "cosmos",
        reason: "connection_failed",
        errorType: error?.name || "Error",
        statusCode: error?.statusCode || null
      });
    }
  }
});

app.http("profile", {
  methods: ["GET", "PUT"], authLevel: "anonymous", route: "profile",
  handler: async (request, context) => {
    try {
      const user = await currentUser(request);
      if (!user) return reply(401, { message: "Please sign in first." });
      if (request.method === "GET") {
        return reply(200, {
          id: user.id, email: user.email, role: user.role, name: user.name || "",
          phone: user.phone || "", location: user.location || "", state: user.state || STATE,
          headline: user.headline || "", bio: user.bio || "",
          skills: Array.isArray(user.skills) ? user.skills : [],
          experience: user.experience || "", education: user.education || "",
          resumeUrl: user.resumeUrl || "", company: user.company || "",
          businessType: user.businessType || ""
        });
      }
      const body = await request.json().catch(() => ({}));
      user.name = String(body.name ?? user.name ?? "").trim().slice(0, 120);
      user.phone = String(body.phone ?? user.phone ?? "").trim().slice(0, 30);
      user.location = String(body.location ?? user.location ?? "").trim().slice(0, 100);
      user.headline = String(body.headline ?? user.headline ?? "").trim().slice(0, 180);
      user.bio = String(body.bio ?? user.bio ?? "").trim().slice(0, 2000);
      user.skills = Array.isArray(body.skills) ? body.skills.map(v => String(v).trim()).filter(Boolean).slice(0, 30) : (user.skills || []);
      user.experience = String(body.experience ?? user.experience ?? "").trim().slice(0, 120);
      user.education = String(body.education ?? user.education ?? "").trim().slice(0, 180);
      user.resumeUrl = String(body.resumeUrl ?? user.resumeUrl ?? "").trim().slice(0, 500);
      user.company = String(body.company ?? user.company ?? "").trim().slice(0, 160);
      user.businessType = String(body.businessType ?? user.businessType ?? "").trim().slice(0, 120);
      user.updatedAt = iso();
      await upsert(user);
      return reply(200, { message: "Profile updated.", profile: {
        id:user.id,email:user.email,role:user.role,name:user.name,phone:user.phone,location:user.location,state:user.state,
        headline:user.headline,bio:user.bio,skills:user.skills,experience:user.experience,education:user.education,
        resumeUrl:user.resumeUrl,company:user.company,businessType:user.businessType
      }});
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to update your profile." });
    }
  }
});

app.http("saved-jobs", {
  methods: ["GET", "POST", "DELETE"], authLevel: "anonymous", route: "saved-jobs",
  handler: async (request, context) => {
    try {
      const user = await currentUser(request);
      if (!user || user.role !== "JobSeeker") return reply(401, { message: "Job seeker sign-in is required." });
      if (request.method === "GET") {
        const rows = await query("SELECT * FROM c WHERE c.type=@type AND c.ownerId=@ownerId ORDER BY c.createdAt DESC",
          [{name:"@type",value:"savedJob"},{name:"@ownerId",value:user.id}]);
        const result=[];
        for(const row of rows){ const job=await read(row.jobId,"job"); if(job?.isActive) result.push(mapJob(job)); }
        return reply(200,result);
      }
      const body = await request.json().catch(() => ({}));
      const jobId = String(body.jobId || "").trim();
      const job = await read(jobId, "job");
      if (!job || !job.isActive || job.state !== STATE) return reply(404, {message:"Job not found."});
      const id = "saved:" + user.id + ":" + jobId;
      if (request.method === "DELETE") {
        await remove(id,"savedJob");
        return reply(200,{message:"Job removed from saved jobs."});
      }
      await upsert({id,type:"savedJob",ownerId:user.id,jobId,createdAt:iso()});
      return reply(201,{message:"Job saved."});
    } catch(error) {
      context.error(error);
      return reply(500,{message:"Unable to update saved jobs."});
    }
  }
});

app.http("employer-jobs", {
  methods: ["GET", "PATCH"], authLevel: "anonymous", route: "employer/jobs",
  handler: async (request, context) => {
    try {
      const user = await currentUser(request);
      if (!user || !["Employer","Admin"].includes(user.role)) return reply(401,{message:"Employer sign-in is required."});
      if (request.method === "GET") {
        const rows = await query("SELECT * FROM c WHERE c.type=@type AND c.employerId=@employerId ORDER BY c.createdAt DESC",
          [{name:"@type",value:"job"},{name:"@employerId",value:user.id}]);
        return reply(200,rows.map(mapJob));
      }
      const body=await request.json().catch(()=>({}));
      const job=await read(String(body.jobId||""),"job");
      if(!job || !assertRowAccess(user,job,"employerId")) return reply(404,{message:"Job not found."});
      if (body.action === "close") { job.isActive=false; job.status="Closed"; }
      if (body.action === "reopen") { job.isActive=true; job.status="Open"; }
      if (body.action === "edit") {
        if (body.title !== undefined) job.title=String(body.title).trim().slice(0,160);
        if (body.salary !== undefined) job.salary=String(body.salary).trim().slice(0,80);
        if (body.description !== undefined) job.description=String(body.description).trim().slice(0,3000);
        if (body.vacancies !== undefined) job.vacancies=Math.max(1,Number(body.vacancies)||1);
      }
      job.updatedAt=iso(); await upsert(job);
      return reply(200,mapJob(job));
    } catch(error) { context.error(error); return reply(500,{message:"Unable to manage the job."}); }
  }
});

app.http("employer-applications", {
  methods: ["GET", "PATCH"], authLevel: "anonymous", route: "employer/applications",
  handler: async (request, context) => {
    try {
      const user=await currentUser(request);
      if(!user || !["Employer","Admin"].includes(user.role)) return reply(401,{message:"Employer sign-in is required."});
      const jobs=await query("SELECT * FROM c WHERE c.type=@type AND c.employerId=@employerId",
        [{name:"@type",value:"job"},{name:"@employerId",value:user.id}]);
      const jobMap=new Map(jobs.map(j=>[j.id,j]));
      if(request.method==="GET"){
        const rows=await query("SELECT * FROM c WHERE c.type=@type ORDER BY c.appliedAt DESC",
          [{name:"@type",value:"application"}]);
        return reply(200,rows.filter(r=>jobMap.has(r.jobId)).map(r=>({
          id:r.id,jobId:r.jobId,candidateId:r.candidateId,candidateName:r.candidateName,status:r.status,
          appliedOn:r.appliedAt?new Date(r.appliedAt).toLocaleDateString("en-IN"):"Recently",
          job:mapJob(jobMap.get(r.jobId))
        })));
      }
      const body=await request.json().catch(()=>({}));
      const row=await read(String(body.applicationId||""),"application");
      const job=row ? jobMap.get(row.jobId) : null;
      if(!row || !job) return reply(404,{message:"Application not found."});
      const allowed=["Applied","Viewed","Shortlisted","Interview","Selected","Rejected"];
      const status=String(body.status||"");
      if(!allowed.includes(status)) return reply(400,{message:"Invalid application status."});
      row.status=status; row.updatedAt=iso(); await upsert(row);
      return reply(200,{id:row.id,status:row.status});
    } catch(error) { context.error(error); return reply(500,{message:"Unable to manage applications."}); }
  }
});

app.http("admin-summary", {
  methods: ["GET"], authLevel: "anonymous", route: "admin/summary",
  handler: async (request, context) => {
    try {
      const user=await currentUser(request);
      if(!user || user.role!=="Admin") return reply(403,{message:"Administrator access is required."});
      const [users,jobs,applications]=await Promise.all([
        query("SELECT * FROM c WHERE c.type=@type",[{name:"@type",value:"user"}]),
        query("SELECT * FROM c WHERE c.type=@type",[{name:"@type",value:"job"}]),
        query("SELECT * FROM c WHERE c.type=@type",[{name:"@type",value:"application"}])
      ]);
      return reply(200,{users:users.length,jobSeekers:users.filter(u=>u.role==="JobSeeker").length,
        employers:users.filter(u=>u.role==="Employer").length,jobs:jobs.length,openJobs:jobs.filter(j=>j.isActive).length,
        applications:applications.length});
    } catch(error) { context.error(error); return reply(500,{message:"Unable to load admin summary."}); }
  }
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
        isActive: true, employerId: user.id, ownerId: user.id, createdAt: iso(), updatedAt: iso()
      };
      await upsert(job);
      return reply(201, mapJob(job));
    } catch (error) {
      context.error(error);
      return reply(500, {
        code: "JOBS_API_ERROR",
        message: "Unable to load or save jobs. Check /api/health for Cosmos DB status.",
        errorType: error?.name || "Error",
        statusCode: error?.statusCode || null
      });
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
          "SELECT * FROM c WHERE c.type=@type AND c.ownerId=@ownerId AND c.candidateId=@candidateId ORDER BY c.appliedAt DESC",
          [
            { name: "@type", value: "application" },
            { name: "@ownerId", value: user.id },
            { name: "@candidateId", value: user.id }
          ]
        );
        const result = [];
        for (const row of rows) {
          const job = await read(row.jobId, "job");
          result.push(publicApplication(row, job));
        }
        return reply(200, result);
      }

      if (user.role !== "JobSeeker") return reply(403, { message: "Job seeker sign-in is required." });
      const body = await request.json().catch(() => ({}));
      const jobId = String(body.jobId || "").trim();
      const job = await read(jobId, "job");
      if (!job || !job.isActive || job.state !== STATE) return reply(404, { message: "Job not found." });

      const existing = (await query(
        "SELECT TOP 1 * FROM c WHERE c.type=@type AND c.ownerId=@ownerId AND c.jobId=@jobId AND c.candidateId=@candidateId",
        [
          { name: "@type", value: "application" },
          { name: "@ownerId", value: user.id },
          { name: "@jobId", value: jobId },
          { name: "@candidateId", value: user.id }
        ]
      ))[0];
      if (existing) return reply(200, publicApplication(existing, job));

      const application = {
        id: "application:" + crypto.randomUUID(), type: "application",
        ownerId: user.id, jobId, candidateId: user.id, candidateName: user.name || user.email,
        status: "Applied", appliedAt: iso()
      };
      await upsert(application);
      return reply(201, publicApplication(application, job));
    } catch (error) {
      context.error(error);
      return reply(500, { message: "Unable to process the application." });
    }
  }
});
