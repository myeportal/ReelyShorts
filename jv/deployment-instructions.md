# ReelyShorts White-Label Package Deployment Instructions

This document is meant to travel with the finished ZIP package.

## What the buyer receives

- ReelyShorts source code and framework files
- Frontend application folder
- Supabase schema and notes
- White-label JV splash page
- Deployment instructions

## Simple deployment path

### 1. Unzip the package
Open the delivered ZIP and review the included folders.

### 2. Create a GitHub repository
Upload the project or push it into a new repo.

### 3. Deploy the frontend with Vercel
- Sign in to Vercel
- Import the repository
- Set the root directory to `frontend/`
- Deploy

### 4. Set up Supabase
- Create a Supabase project
- Run the SQL from `supabase/schema.sql`
- Add the frontend environment variables

### 5. Add environment variables in Vercel
At minimum:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional if using analytics/monitoring later:
- `VITE_SENTRY_DSN`
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`

### 6. Rebrand the app
Update:
- logo
- colors
- app name
- content metadata
- episodes / media

### 7. Launch
Once the environment variables are saved and the project is redeployed, the buyer can begin loading their content and running the app under their own brand.

## Important note
This package is designed as a starting framework and white-label asset, not a guarantee of every third-party integration already being in final live-production mode.
