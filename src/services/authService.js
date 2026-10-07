const TRISEND_AUTH_URL = (import.meta.env.VITE_TRISEND_AUTH_URL || "").replace(/\/$/, "");
const APP_ID = "248works";
const REDIRECT_URI = window.location.origin + "/";

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "Request failed.");
    error.status = response.status;
    error.code = body.code;
    error.maxSessions = body.maxSessions;
    throw error;
  }
  return body;
}

function requireTriSend() {
  if (!TRISEND_AUTH_URL) {
    throw new Error("TriSend authentication is not configured for this deployment.");
  }
}

export const authService = {
  getSession() {
    try {
      return JSON.parse(localStorage.getItem("248works.session") || "null");
    } catch {
      return null;
    }
  },

  saveSession(session) {
    localStorage.setItem("248works.session", JSON.stringify(session));
  },

  clearSession() {
    localStorage.removeItem("248works.session");
  },

  getPendingSocialLogin() {
    return {
      role: localStorage.getItem("248works.pendingRole") || "JobSeeker",
      provider: localStorage.getItem("248works.pendingProvider") || "",
      code: localStorage.getItem("248works.pendingAuthCode") || ""
    };
  },

  clearPendingSocialLogin() {
    localStorage.removeItem("248works.pendingRole");
    localStorage.removeItem("248works.pendingProvider");
    localStorage.removeItem("248works.pendingAuthCode");
  },

  startSocialLogin(provider, role) {
    requireTriSend();
    const normalizedProvider = provider === "aad" ? "microsoft" : provider;
    localStorage.setItem("248works.pendingRole", role);
    localStorage.setItem("248works.pendingProvider", normalizedProvider);

    const loginUrl =
      TRISEND_AUTH_URL +
      "/auth/" +
      encodeURIComponent(normalizedProvider) +
      "/login?appId=" +
      encodeURIComponent(APP_ID) +
      "&role=" +
      encodeURIComponent(role) +
      "&redirectUri=" +
      encodeURIComponent(REDIRECT_URI);

    window.location.assign(loginUrl);
  },

  async exchangeTriSendCode(code, replaceOldest = false) {
    requireTriSend();
    const response = await fetch(TRISEND_AUTH_URL + "/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, replaceOldest })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.message || "Authentication failed.");
      error.status = response.status;
      error.code = body.code;
      error.maxSessions = body.maxSessions;
      throw error;
    }

    this.clearPendingSocialLogin();
    this.saveSession(body);
    return body;
  },

  async refresh() {
    requireTriSend();
    const session = this.getSession();
    if (!session?.refreshToken) throw new Error("No refresh token.");

    const response = await fetch(TRISEND_AUTH_URL + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      this.clearSession();
      const error = new Error(body.message || "Session refresh failed.");
      error.status = response.status;
      error.code = body.code;
      throw error;
    }

    this.saveSession(body);
    return body;
  },

  async logout() {
    const session = this.getSession();
    try {
      if (session?.accessToken) {
        await request(TRISEND_AUTH_URL + "/auth/logout", {
          method: "POST",
          headers: { Authorization: "Bearer " + session.accessToken }
        });
      }
    } finally {
      this.clearSession();
    }
  }
};
