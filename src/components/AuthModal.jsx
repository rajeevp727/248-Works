import { useState } from "react";
import { authService } from "../services/authService";

export default function AuthModal({ role, onClose, onAuthenticated, socialPending = false }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sessionWarning, setSessionWarning] = useState(socialPending);

  const socialLogin = (provider) => {
    try {
      authService.startSocialLogin(provider, role);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const confirmReplaceOldest = async () => {
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
  };

  const cancelReplacement = () => {
    authService.clearPendingSocialLogin();
    setSessionWarning(false);
    setMessage("Login cancelled. Your existing sessions are unchanged.");
  };

  return (
    <div className="modal-backdrop">
      <div className="modal auth-modal" onClick={(event) => event.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close sign-in dialog">×</button>
        <div className="eyebrow">248 WORKS ACCOUNT</div>
        <h2>{role === "Employer" ? "Employer sign in" : "Job seeker sign in"}</h2>

        {sessionWarning ? (
          <div className="session-warning">
            <h3>3 active sessions reached</h3>
            <p>
              You already have three active sessions. You can replace the oldest
              session and continue signing in on this device.
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
            <p className="muted">
              Sign in securely with your Google or Microsoft account. Authentication
              is managed centrally by TriSend.
            </p>
            <div className="social-auth">
              <button className="primary full social-button" type="button" onClick={() => socialLogin("google")}>
                Continue with Google
              </button>
              <button className="secondary full social-button" type="button" onClick={() => socialLogin("microsoft")}>
                Continue with Microsoft
              </button>
            </div>
          </>
        )}

        {message && <div className="auth-message" role="status">{message}</div>}
      </div>
    </div>
  );
}
