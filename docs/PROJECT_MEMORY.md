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


## Dark-mode profile form contrast (2026-10-09)
- Explicitly set readable light text for profile labels and hints, dark input surfaces with visible borders, readable placeholders, visible focus rings, and muted section dividers when `.theme-dark` is active.
- Preserve existing layout and light-mode styling.


## Phone input usability follow-up (2026-10-09)
- Do not use `maxLength` on the local phone field because it prevents pasting an international number such as `+91 9876543210` before normalization.
- Accept typing or pasting digits with or without `+91`; normalize to one country code in stored profile data while showing only the 10-digit local number in the editable input.
- Keep a stable flex layout for the fixed country-code prefix and editable input in both light and dark themes.


## Auth cancel button dark mode (2026-10-09)
- The active-session confirmation Cancel button receives an explicit class and dark-theme styling so its background, text, border, hover, and keyboard focus remain visible against the modal.


## Profile completion and close button dark mode (2026-10-09)
- Give the profile completion card explicit dark surface, readable text and hint colors, and a legible progress-ring label when dark theme is active.
- Style modal close controls for dark background, readable icon, hover and keyboard focus states without changing light mode.


## Phone input numeric UX fix (2026-10-09)
- Use `type="number"`, numeric input mode, and a maximum of 10 local digits while keeping +91 in a separate fixed prefix.
- Normalize pasted values with or without country code and remove native number spinners for a cleaner aligned input.
- Profile completion card should size responsively without overflowing the profile heading area.
