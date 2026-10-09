# 248 Works — Project Memory

## Engineering workflow
- Treat changes as production software: inspect the existing implementation before editing, preserve current UX, and avoid overwriting user data.
- Read this file before code changes and update it after implementation changes.
- Use a feature branch and pull request; rely on repository CI and existing PR auto-merge workflow where applicable.
- After merge, verify the Azure Static Web Apps GitHub Actions deployment and report the run URL, commit, and actual status. Do not claim the live site was smoke-tested unless it was.
- Production UI: https://248works.rajeevstech.in
- Repository: https://github.com/rajeevp727/248-Works

## Stack and integration
- React + Vite frontend under `src/`.
- Azure Functions API under `api/src/functions/index.js`, using Cosmos DB container `248WorksDB/248Data`.
- TriSend is the centralized authentication provider. Frontend social login exchanges the TriSend authorization code and stores the returned session.
- Existing Profile tab is role-aware and editable; profile reads/writes use `GET/PUT /api/profile`.

## Social sign-in profile prefill
- When Google/Microsoft authentication returns optional profile fields on the session user, copy them only into blank fields in the persisted 248 Works profile.
- Never replace user-entered profile data with empty or missing provider values.
- Profile fields remain editable and persist through the existing Save profile action.
- Identity providers may not return phone, address, bio, experience, education, or skills under basic sign-in scopes. Do not fabricate values; fill only fields actually returned.
- SWA principal claim mapping accepts optional name, phone, location, bio, and profile photo claims when available.
- Profile API returns/persists `profileImageBase64` so the existing photo control can load it.
- If more provider fields are needed, ensure TriSend's `/auth/exchange` response actually includes them; the 248 Works client cannot infer claims that TriSend does not send.

## Latest change
- Added optional social-claim extraction to the SWA principal, safe fill-only-missing logic for existing users, and profile API support for profile photo field.
- Added frontend session-to-profile prefill for name, phone, location, headline, bio, photo, skills, experience and education. Existing non-empty saved values take precedence.
- Validate via frontend build, API syntax/build checks, PR checks, and deployment workflow before reporting completion.


## Phone input fix (2026-10-09)
- Render India country code (+91) as a separate, non-editable prefix beside the phone input; users can edit or clear the 10-digit local number freely.
- Normalize stored values to a single +91 prefix and store an empty string when the local number is cleared.
- Regression-check empty, partial, complete, and pasted country-prefixed numbers.
