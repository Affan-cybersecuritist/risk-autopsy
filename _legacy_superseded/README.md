# Superseded — not the current build

These two folders are earlier iterations, kept for history, **not the demo to run**:

- `streamlit_dashboard/` — the original Streamlit-based dashboard with CSS/JS injected via `components.html`. Fully working, but architecturally fragile (had to work around Streamlit's DOM internals, which changed between versions and caused two real bugs during development — see git history).
- `vanilla_js_login/` — the original single-file HTML/CSS/JS login page (real Supabase auth + real face-api.js verification). Fully working, but not integrated with the dashboard as one app.

**The current, real build is `webapp/` (React) + `backend/` (FastAPI).** Same real auth, same real face verification, same real ML pipeline results — properly architected instead of DOM-injection workarounds. See the top-level `README.md`.
