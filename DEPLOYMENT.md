# Deployment Checklist — bc-procesos-rrhh

Quick reference for deploying the HR recruitment platform to Vercel.

## Pre-Deployment (5 min)

- [ ] Verify Notion integration exists at https://www.notion.com/my-integrations
- [ ] Copy the **secret token** from Notion integration
- [ ] Share the database (37c3e919a705410cae2430e8f33b99fc) with this integration
- [ ] Create GitHub repository (optional but recommended)
  ```bash
  git init
  git add .
  git commit -m "Initial: HR recruitment platform"
  git remote add origin https://github.com/yourname/bc-procesos-rrhh
  git push -u origin main
  ```

## Vercel Deployment (5 min)

### Option A: Via GitHub (Recommended)

1. Go to https://vercel.com/dashboard
2. Click "Add New" → "Project"
3. Connect GitHub account (authorize if needed)
4. Select **bc-procesos-rrhh** repository
5. Click "Import"
6. In "Environment Variables" section, add:
   - **Name:** `NOTION_TOKEN` → **Value:** [paste token]
   - **Name:** `NOTION_DATABASE_ID` → **Value:** `37c3e919a705410cae2430e8f33b99fc`
7. Click "Deploy"
8. Wait 2-3 minutes for build to complete

### Option B: Via Vercel CLI

```bash
# 1. Install Vercel CLI globally (if not done)
npm install -g vercel

# 2. In project directory
cd "/path/to/bc-procesos-rrhh"

# 3. Deploy (will prompt for setup)
vercel

# When prompted:
# - Link to existing project? → No
# - Project name? → bc-procesos-rrhh
# - Directory? → (default: current)

# 4. Configure environment variables in Vercel dashboard after deployment
```

## Post-Deployment (5 min)

### 1. Verify Endpoints

```bash
# Replace YOUR_URL with actual Vercel domain
URL="https://bc-procesos-rrhh.vercel.app"

# Health check (should return { ok: true, timestamp: "..." })
curl "$URL/api/health"

# Get procesos (should return empty array initially)
curl "$URL/api/procesos?status=active"
```

### 2. Test Full Flow

1. Open https://bc-procesos-rrhh.vercel.app in browser
2. Click "+ Nuevo Proceso" button
3. Fill form:
   - Candidato: "Test User"
   - Cargo: "Garzón/a"
   - Local: "BC1"
   - Notas: "Test process"
4. Click "Crear Proceso"
5. Verify:
   - Toast message appears: "Proceso creado: Test User"
   - New card appears in "Procesos Activos" bar
6. Click the new card
7. Check a few checkboxes in the Garzones tab
8. Refresh page → checkboxes should still be checked (proof Notion sync works)

### 3. Update Hub Reference

Go to bc-anonimo.vercel.app and update the Hub RRHH link to point to your new deployment:

If deploying at custom domain:
```
https://bc-procesos-rrhh.vercel.app
```

Or use Vercel's auto-generated URL if no custom domain.

## Configuration

### Environment Variables

Required in Vercel dashboard under "Settings" → "Environment Variables":

| Variable | Value | Notes |
|----------|-------|-------|
| `NOTION_TOKEN` | Your integration secret | From https://www.notion.com/my-integrations |
| `NOTION_DATABASE_ID` | `37c3e919a705410cae2430e8f33b99fc` | Database ID (constant) |

### Optional: Custom Domain

To use a custom domain (e.g., `procesos-rrhh.blackchicken.cl`):

1. In Vercel dashboard, go to Project Settings → Domains
2. Add custom domain
3. Update DNS at your registrar (follow Vercel instructions)
4. Wait 24-48 hours for propagation

## Troubleshooting

### "NOTION_TOKEN not configured" when accessing site

**Solution:**
1. Go to Vercel dashboard → Project Settings → Environment Variables
2. Verify `NOTION_TOKEN` is set and has a value (not blank)
3. Redeploy: click "Deployments" tab → select latest → click "..." → "Redeploy"

### POST /api/procesos returns 500 error

**Common causes:**
1. NOTION_TOKEN is missing or incorrect
2. Database ID is wrong
3. Notion integration doesn't have access to database

**Solution:**
1. Check Notion integration permissions
2. Verify database is shared with integration
3. Test token directly:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Notion-Version: 2022-06-28" \
     https://api.notion.com/v1/databases/37c3e919a705410cae2430e8f33b99fc
   ```

### Checkboxes don't persist after refresh

**Cause:** Items aren't saving to Notion

**Solution:**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Click a checkbox
4. Look for PATCH request to /api/proceso
5. If request fails, check network tab error details
6. If request succeeds but data doesn't save in Notion, check that:
   - The `Items Completados` property is `rich_text` type (not plain text)
   - Your Notion integration has write permissions

### Vercel deployment fails during build

**Typical error:** "Build failed"

**Solution:**
1. Check build logs in Vercel dashboard
2. Common issue: missing API key at build time
3. API keys aren't needed at build time (this is a static build)
4. Try redeploying from "Deployments" tab

## Rollback

If something breaks after deployment:

1. Go to Vercel dashboard → Deployments
2. Find the previous working deployment
3. Click "..." → "Promote to Production"
4. Current deployment will be reverted

## Monitoring

After successful deployment:

- **Daily:** Check that procesos are being created (visit dashboard)
- **Weekly:** Verify Notion database hasn't hit API rate limits (check Vercel logs)
- **Monthly:** Review completed procesos archive (Estado = "Listo")

## Next Steps

Once deployed:

1. Share deployment URL with RRHH team
2. Create training session on how to use platform
3. Set up Notion database backup (optional but recommended)
4. Monitor first week for issues

---

**Need Help?** Check README.md for detailed documentation.
