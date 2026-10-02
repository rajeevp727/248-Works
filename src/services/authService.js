const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(API_BASE_URL + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return body;
}

export const authService = {
  getSession() {
    try { return JSON.parse(localStorage.getItem("248works.session") || "null"); }
    catch { return null; }
  },
  saveSession(session) {
    localStorage.setItem("248works.session", JSON.stringify(session));
  },
  clearSession() {
    localStorage.removeItem("248works.session");
  },
  async refresh() {
    const session = this.getSession();
    if (!session?.refreshToken) throw new Error("No refresh token.");
    const next = await request("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: session.refreshToken })
    });
    this.saveSession(next);
    return next;
  },
  async logout() {
    const session = this.getSession();
    try {
      if (session?.token) {
        await request("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: "Bearer " + session.token }
        });
      }
    } finally {
      this.clearSession();
    }
  },
  async requestCode(email) {
    return request("/api/auth/request-code", { method: "POST", body: JSON.stringify({ email }) });
  },
  async verifyCode(payload) {
    return request("/api/auth/verify-code", { method: "POST", body: JSON.stringify(payload) });
  }
};