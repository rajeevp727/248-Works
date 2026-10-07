import { useState } from "react";
import { authService } from "../services/authService";

export default function AuthModal({ role, onClose, onAuthenticated, socialPending = false }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sessionWarning, setSessionWarning] = useState(socialPending);

  const requestCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await authService.requestCode(email);
      setStep("code");
      setMessage("Verification code sent to your email. It expires in 10 minutes.");
    } catch (error) {
      if (error.status === 409 && error.code === "MAX_SESSIONS") {
        setSessionWarning(true);
        setMessage("You already have 3 active sessions.");
      } else {
        setMessage(error.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await authService.verifyCode({ email, code, role });
      onAuthenticated(result);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmReplaceOldest = async () => {
    setBusy(true);
    setMessage("");
    try {
      const pending = authService.getPendingSocialLogin();
      const result = socialPending
        ? await authService.exchangeTriSendCode(pending.code, true)
        : await authService.verifyCode({ email, code, role, replaceOldest: true });
      onAuthenticated(result);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const socialLogin = (provider) => {
    authService.startSocialLogin(provider, role);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal auth-modal" onClick={(event) => event.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <div className="eyebrow">248 WORKS ACCOUNT</div>
        <h2>{role === "Employer" ? "Employer sign in" : "Job seeker sign in"}</h2>
        <p className="muted">We'll send a one-time verification code to your email using TriSend.</p>
        {sessionWarning ? (
          <div className="session-warning">
            <h3>3 active sessions reached</h3>
            <p>Logging out the oldest login and signing in on this device will close your oldest active session.</p>
            <div className="hero-actions">
              <button className="primary full" disabled={busy} onClick={confirmReplaceOldest}>
                {busy ? "Updating sessions…" : "Confirm & log out oldest"}
              </button>
              <button className="secondary full" disabled={busy} onClick={() => {
                setSessionWarning(false);
                authService.clearPendingSocialLogin();
                setMessage("Login cancelled. Your existing sessions are unchanged.");
              }}>
                Cancel
              </button>
            </div>
          </div>
        ) : step === "email" ? (

          <form onSubmit={requestCode}>
            <label>Email address
              <input required type="email" autoComplete="email" value={email}
                onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>
            <button className="primary full" disabled={busy} type="submit">
              {busy ? "Sending…" : "Send verification code →"}
            </button>
            <div className="social-auth">
            <div className="social-divider"><span>or continue with</span></div>
            <button className="secondary full social-button" type="button" onClick={() => socialLogin("google")}>
              Continue with Google
            </button>
            <button className="secondary full social-button" type="button" onClick={() => socialLogin("aad")}>
              Continue with Microsoft
            </button>
          </div>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <label>6-digit verification code
              <input required inputMode="numeric" pattern="[0-9]{6}" maxLength="6"
                value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456" />
            </label>
            <button className="primary full" disabled={busy} type="submit">
              {busy ? "Verifying…" : "Verify & continue →"}
            </button>
            <button className="secondary full auth-back" type="button"
              onClick={() => { setStep("email"); setMessage(""); }}>
              Use a different email
            </button>
          </form>
        )}
        {message && <div className="auth-message" role="status">{message}</div>}
      </div>
    </div>
  );
}
