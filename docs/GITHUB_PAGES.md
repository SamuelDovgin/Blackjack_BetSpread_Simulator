# GitHub Pages (Frontend Deployment)

This repo includes a GitHub Actions workflow that builds the React/Vite frontend and publishes it to **GitHub Pages** on every push to `main`.

## What Gets Deployed

- Frontend only: `frontend/`
- Output: `frontend/dist/`
- Workflow: `.github/workflows/deploy-frontend.yml`

Important: GitHub Pages is static hosting. The Python/FastAPI backend is **not** deployed by this workflow.

For GitHub Pages builds we set:

- `VITE_DEFAULT_PAGE=training` (opens Training Mode by default)
- `VITE_DISABLE_BACKEND=1` (skips backend API calls)

## One-Time GitHub Setup

1. Push this repository to GitHub.
2. In GitHub: **Settings → Pages**
3. Under **Build and deployment**, choose **Source: GitHub Actions**.

After the workflow runs, your site URL will be:

`https://<your-username>.github.io/<your-repo>/`

## Notes

- Vite is configured to automatically set the correct `base` path for GitHub Pages project sites (it detects `GITHUB_REPOSITORY` in Actions).
- If you want the deployed site to open the simulator instead of Training Mode, change `VITE_DEFAULT_PAGE` in `.github/workflows/deploy-frontend.yml`.
- If you later deploy the backend somewhere public, set `VITE_API_BASE` in the workflow environment to point to it and remove `VITE_DISABLE_BACKEND`.
