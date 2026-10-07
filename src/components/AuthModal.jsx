import { useEffect, useState } from "react";
import { authService } from "../services/authService";

const ROLE_OPTIONS = [
  {
    value: "JobSeeker",
    label: "Employee",
    description: "Find jobs, save opportunities and manage applications."
  },
  {
    value: "Employer",
    label: "Employer",
    description: "Post jobs, manage listings and review candidates."
  }
];

export default function AuthModal({
  role,
  initialMode = "login",
  onClose,
  onAuthenticated,
  socialPending = false
}) {
  const [mode, setMode] = useState(initialMode);
  const [selectedRole, setSelectedRole] = useState(role === "Employer" ? "Employer" : "JobSeeker");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sessionWarning, setSessionWarning] = useState(socialPending);
  const [pendingAction, setPendingAction] = useState(socialPending ? "social" : null);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    setSessionWarning(socialPending);
    if (socialPending) setPendingAction("social");
  }, [socialPending]);

  const socialLogin = (provider) => {
    try {
      setBusy(true);
      authService.startSocialLogin(provider, selectedRole);
    } catch (error) {
      setBusy(false);
      setMessage(error.message);
    }
  };

  const submitCredentials = async (replaceOldest = false) => {
    setBusy(true);
    setMessage("");

    try {
      const result = mode === "signup"
        ? await authService.passwordRegister({
            email,
            password,
            name,
            role: selectedRole,
            replaceOldest
          })
        : await authService.passwordLogin({
            email,
            password,
            replaceOldest
          });

      onAuthenticated(result);
    } catch (error) {
      if (error.status === 409 && error.code === "MAX_SESSIONS") {
        setPendingAction("credentials");
        setSessionWarning(true);
      } else {
        setMessage(error.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmReplaceOldest = async () => {
    setSessionWarning(false);

    if (pendingAction === "social") {
      setBusy(true);
      setMessage("");

      try {
        const pending = authService.getPendingSocialLogin();
        if (!pending.code) {
          setMessage("The sign-in request has expired. Please start again.");
          return;
        }

        const result = await authService.exchangeTriSendCode(pending.code, true);
        onAuthenticated(result);
      } catch (error) {
        setMessage(error.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    await submitCredentials(true);
  };

  const cancelReplacement = () => {
    authService.clearPendingSocialLogin();
    setSessionWarning(false);
    setPendingAction(null);
    setMessage("Login cancelled. Your existing sessions are unchanged.");
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage("");
    setSessionWarning(false);
    setPendingAction(null);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal auth-modal" onClick={(event) => event.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close authentication dialog">×</button>

        <div className="eyebrow">248 WORKS ACCOUNT</div>
        <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        <p className="muted">
          {mode === "signup"
            ? "Create one 248 Works account and choose how you want to use the platform."
            : "Sign in securely through TriSend. Your role controls the workspace you see."}
        </p>

        <div className="auth-mode-label" aria-live="polite">
          {mode === "signup" ? "Sign up" : "Log in"}
        </div>

        {sessionWarning ? (
          <div className="session-warning">
            <h3>3 active sessions reached</h3>
            <p>
              You already have three active sessions. Replace the oldest session
              to continue on this device.
            </p>
            <div className="hero-actions">
              <button className="primary full" disabled={busy} onClick={confirmReplaceOldest}>
                {busy ? "Updating sessions…" : "Confirm & log out oldest"}
              </button>
              <button className="secondary full" disabled={busy} onClick={cancelReplacement}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {mode === "signup" && (
              <div className="role-picker">
                <div className="auth-section-label">I want to use 248 Works as</div>
                <div className="role-options">
                  {ROLE_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={selectedRole === option.value ? "role-option selected" : "role-option"}
                      onClick={() => setSelectedRole(option.value)}
                    >
                      <span className="role-option-radio" aria-hidden="true">
                        {selectedRole === option.value ? "✓" : ""}
                      </span>
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitCredentials(false);
              }}
            >
              {mode === "signup" && (
                <label>
                  Full name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    placeholder="Your name"
                    required
                  />
                </label>
              )}

              <label>
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />
              </label>

              {mode === "signup" && (
                <div className="auth-password-hint">
                  Use at least 8 characters with at least one letter and one number.
                </div>
              )}

              <button className="primary full" type="submit" disabled={busy}>
                {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
              </button>
            </form>

            <div className="social-auth">
              <div className="social-divider"><span>or continue with</span></div>
              <button className="secondary full social-button" type="button" disabled={busy} onClick={() => socialLogin("google")}>
                Continue with Google
              </button>
              <button className="secondary full social-button" type="button" disabled={busy} onClick={() => socialLogin("microsoft")}>
                Continue with Microsoft
              </button>
              <small className="auth-provider-note">Google and Microsoft authentication are securely handled by TriSend.</small>
            </div>

            <div className="auth-mode-switch">
              <span>{mode === "signup" ? "Already have an account?" : "Don't have an account?"}</span>
              <button
                type="button"
                className="auth-mode-link"
                onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
              >
                {mode === "signup" ? "Log in" : "Sign up"}
              </button>
            </div>
          </>
        )}

        {message && <div className="auth-message" role="status">{message}</div>}
      </div>
    </div>
  );
}
