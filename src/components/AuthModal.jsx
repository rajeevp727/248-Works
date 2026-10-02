import { useState } from "react";
import { authService } from "../services/authService";

export default function AuthModal({ role, onClose, onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const requestCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await authService.requestCode(email);
      setStep("code");
      setMessage("Verification code sent to your email. It expires in 10 minutes.");
    } catch (error) {
      setMessage(error.message);
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal auth-modal" onClick={(event) => event.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <div className="eyebrow">248 WORKS ACCOUNT</div>
        <h2>{role === "Employer" ? "Employer sign in" : "Job seeker sign in"}</h2>
        <p className="muted">We'll send a one-time verification code to your email using TriSend.</p>
        {step === "email" ? (
          <form onSubmit={requestCode}>
            <label>Email address
              <input required type="email" autoComplete="email" value={email}
                onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>
            <button className="primary full" disabled={busy} type="submit">
              {busy ? "Sending…" : "Send verification code →"}
            </button>
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
