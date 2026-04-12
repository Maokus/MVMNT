# Development Scripts

Build, deployment, and utility scripts for MVMNT.

## Deployment Scripts

### `deploy.sh`
Builds and deploys MVMNT to production.

```bash
./devscripts/deploy.sh
```

**Environment:**
- Automatically uses `.env.production` for Supabase keys
- Uses production Hugo site path (configurable via `PROFILE_SITE_PATH`)

### `deploy_beta.sh`
Builds and deploys MVMNT to beta.

```bash
./devscripts/deploy_beta.sh
```

**Environment:**
- Automatically uses `.env.beta` for Supabase keys and `VITE_APP_MODE=beta`
- Uses beta Hugo site path (configurable via `PROFILE_SITE_PATH`)

### Configuring deployment paths

If your Hugo profile site is in a non-standard location, set `PROFILE_SITE_PATH` before running:

```bash
export PROFILE_SITE_PATH=/path/to/hugo/site
./devscripts/deploy.sh
```

Or create `devscripts/.env.deploy` from the template:

```bash
cp devscripts/.env.example devscripts/.env.deploy
# Edit devscripts/.env.deploy with your paths
source devscripts/.env.deploy
./devscripts/deploy.sh
```

## Utility Scripts

### `count_lines.sh`
Count lines of code across the project.

```bash
./devscripts/count_lines.sh [directory]    # Default: src/
./devscripts/count_lines.sh src/core       # Count only core/
```

### Build modes

- **Production** (`npm run build -- --mode production`)
  - Uses `.env.production` (production Supabase URL + publishable key)
- **Beta** (`npm run build -- --mode beta`)
  - Uses `.env.beta` (production Supabase URL + `VITE_APP_MODE=beta`)
- **Development** (`npm run dev`)
  - Uses `.env.local` if it exists (local Supabase), falls back to `.env`

See root `README.md` for local development setup with Supabase.
