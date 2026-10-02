const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Request failed.");
  return body;
}

export const authService = {
  getSession() {
    try { return JSON.parse(localStorage.getItem("248works.session") || "null"); }
    catch { return null; }
  },
  saveSession(session) { localStorage.setItem("248works.session", JSON.stringify(session)); },
  logout() { localStorage.removeItem("248works.session"); },
  async requestCode(email) {
    return request("/api/auth/request-code", { method: "POST", body: JSON.stringify({ email }) });
  },
  async verifyCode(payload) {
    return request("/api/auth/verify-code", { method: "POST", body: JSON.stringify(payload) });
  }
};
