# Proceso De Reclutamiento Y Onboarding — BC-Procesos-RRHH

Complete HR recruitment tracking platform for BlackChicken. Manages candidate pipelines across 5 phases (Captación, Entrevista, Día Prueba, Contratación, Onboarding) with real-time sync to Notion database.

## Project Structure

```
bc-procesos-rrhh/
├── api/
│   ├── procesos.js         # GET all procesos / POST new proceso
│   ├── proceso.js          # PATCH update specific proceso
│   └── health.js           # GET health check
├── public/
│   ├── index.html          # Main platform: Proceso De Reclutamiento Y Onboarding
│   └── hub-index.html      # Updated Hub RRHH index page
├── package.json
├── vercel.json
├── .env.example
└── README.md (this file)
```

## Features

### Core Platform (index.html)

- **Organigrama Tab**: Visual organizational hierarchy of leadership and teams at both locations (BC1, BC2)
- **Garzones Track**: Full recruitment pipeline for service staff with 5-phase checklist
  - F1: Captación y filtro inicial
  - F2: Entrevista online
  - F3: Día de prueba
  - F4: Seguimiento de contratación
  - F5: Progresión de roles en sala (Runner→Mesas→Delivery→Puerta)

- **Jefatura Track**: Leadership role recruitment with evaluation pautas
  - Special handling: presential group interviews (3-4 candidates)
  - Reference calls mandatory
  - Structured evaluation matrix

- **Cocineros Track**: Kitchen staff recruitment
  - Separate profiles: Cocinero/a and Jefe de Cocina
  - Kitchen-specific evaluation pautas

### Active Processes Bar

- Real-time list of active candidate processes
- Progress bars per candidate
- Click to load saved checklist state from Notion
- Auto-syncs tab based on candidate's role (cargo)

### Modal: New Proceso

- Create candidate process with: name, role, location, notes
- Auto-initializes: Fase=F1, Estado=En curso, Avance=0, Fecha Inicio=today
- Generates unique ID (RC-prefixed) via Notion's UNIQUE_ID property

### Notion Sync

- **No localStorage**: All state persists in Notion
- **Debounced saves**: 500ms delay after checkbox changes
- **JSON storage**: Checklist items stored as JSON string in rich_text field
- **Real-time sync**: Open a process → loads saved checkboxes → edit → auto-saves

## API Endpoints

### POST /api/procesos — Create new proceso

**Body:**
```json
{
  "candidato": "Juan Pérez",
  "cargo": "Garzón/a",
  "local": "BC1",
  "notas": "Referencia de Felipe..."
}
```

**Returns:** New proceso object with all properties

**Auto-set properties:**
- Fase: "F1 Captación"
- Estado: "En curso"
- Avance %: 0
- Fecha Inicio: Today (ISO date)
- Items Completados: "[]" (empty JSON array)

---

### GET /api/procesos — Fetch procesos

**Query params:**
- `status=active` (default) — Returns only processes where Estado ≠ "Listo"
- `status=all` — Returns all processes
- `status=completed` — Returns only Estado="Listo"

**Returns:** Array of proceso objects sorted by Fecha Inicio (descending)

---

### PATCH /api/proceso — Update specific proceso

**Query param:** `?id=<page_id>` (Notion page ID)

**Body (all optional):**
```json
{
  "fase": "F2 Entrevista",
  "estado": "En curso",
  "avance": 45,
  "items_completados": "[\"garzon-f1-0\",\"garzon-f1-1\"]",
  "notas": "Updated notes..."
}
```

**Returns:** Updated proceso object

---

### GET /api/health — Health check

**Returns:**
```json
{
  "ok": true,
  "timestamp": "2026-04-09T12:34:56.789Z"
}
```

## Notion Database Schema

**Database ID:** 37c3e919a705410cae2430e8f33b99fc  
**Data Source ID:** 641fb3f3-3929-4e93-b4fa-7fd71bd447ba

### Properties

| Property | Type | Options |
|----------|------|---------|
| Candidato | Title | — |
| Cargo | Select | Garzón/a, Jefe de Local, Sub Jefe, Jefe de Cocina, Sous Chef, Cocinero/a, Copero/a, Entrenador/a |
| Local | Select | BC1, BC2 |
| Fase | Select | F1 Captación, F2 Entrevista, F3 Día Prueba, F4 Contratación, F5 Onboarding |
| Estado | Status | Sin empezar, En curso, Listo |
| Avance % | Number | — |
| Fecha Inicio | Date | — |
| Items Completados | Rich Text | JSON string: `["item-id-1","item-id-2"]` |
| Notas | Rich Text | — |
| ID Proceso | Unique ID | Prefix: RC |
| Responsable | People | — |

## Checklist Item IDs

All checklist items follow the pattern: `${track}-f${phase}-${index}`

### Garzones
- F1: garzon-f1-0 through garzon-f1-3
- F2: garzon-f2-0 through garzon-f2-2
- F3: garzon-f3-0 through garzon-f3-3
- F4: garzon-f4-0 through garzon-f4-3
- F5: garzon-f5-0 through garzon-f5-6
- Evaluations: garzon-eval-0 through garzon-eval-5

### Jefatura
- F1: jefatura-f1-0 through jefatura-f1-3
- F2: jefatura-f2-0 through jefatura-f2-6
- F3: jefatura-f3-0 through jefatura-f3-3
- F4: jefatura-f4-0 through jefatura-f4-3
- F5: jefatura-f5-0 through jefatura-f5-3
- Evaluations: jefatura-eval-0 through jefatura-eval-5

### Cocineros
- F1: cocinero-f1-0 through cocinero-f1-3
- F2: cocinero-f2-0 through cocinero-f2-2
- F3: cocinero-f3-0 through cocinero-f3-3
- F4: cocinero-f4-0 through cocinero-f4-3
- F5: cocinero-f5-0 through cocinero-f5-4
- Evaluations: cocinero-eval-0 through cocinero-eval-4

## Deployment to Vercel

### Prerequisites

1. **Notion API Token**
   - Go to https://www.notion.com/my-integrations
   - Create new integration (or use existing)
   - Copy the secret token
   - Share the database with this integration

2. **Git Repository** (if deploying from GitHub)
   ```bash
   cd /path/to/bc-procesos-rrhh
   git init
   git add .
   git commit -m "Initial commit: HR recruitment platform"
   git remote add origin https://github.com/yourusername/bc-procesos-rrhh.git
   git push -u origin main
   ```

### Vercel CLI Deployment

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy (will prompt for project setup)
vercel

# 4. Add environment variables when prompted:
# NOTION_TOKEN = <your integration token>
# NOTION_DATABASE_ID = 37c3e919a705410cae2430e8f33b99fc
```

### Vercel Dashboard Deployment

1. Go to https://vercel.com/dashboard
2. Click "Add New" → "Project"
3. Select your GitHub repository (or import without git)
4. Configure:
   - Framework: "Other" (static files + serverless)
   - Build Command: `echo 'Build successful'`
   - Output Directory: (leave empty)
5. Add environment variables in "Environment Variables":
   - `NOTION_TOKEN` = your token
   - `NOTION_DATABASE_ID` = 37c3e919a705410cae2430e8f33b99fc
6. Click "Deploy"

### Post-Deployment

Once deployed, verify:

```bash
# Test health endpoint
curl https://your-project.vercel.app/api/health

# Test GET procesos
curl https://your-project.vercel.app/api/procesos?status=active
```

## Environment Variables

Create a `.env.local` file in the project root (Vercel will use this locally):

```
NOTION_TOKEN=your_notion_integration_token
NOTION_DATABASE_ID=37c3e919a705410cae2430e8f33b99fc
```

For production on Vercel, add these in the dashboard under "Settings" → "Environment Variables".

## Design System

Matches bc-anonimo.vercel.app design:

- **Background:** #0f0f0f (dark)
- **Cards:** #1a1a1a background, #2a2a2a borders
- **Primary Gold:** #d4af37
- **Text Primary:** #e8e8e8
- **Text Secondary:** #777
- **Text Headings:** #fff
- **Font:** Inter (Google Fonts)
- **Accent Colors:**
  - Green (BC1): #4a8a4a
  - Purple (BC2): #8a4a8a
  - Blue: #4a6a8a
  - Red: #8a4a4a

## Error Handling

### Client-side

- Failed API calls show a subtle toast notification (bottom-right corner)
- Doesn't block UI — continues allowing edits
- Network errors are logged to console

### Server-side (API)

- All endpoints return 500 if NOTION_TOKEN is missing
- Notion API errors are caught and returned as JSON
- 400 errors for missing required fields
- 405 for unsupported HTTP methods

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive (tested at 375px breakpoint)
- No polyfills needed (ES6+ supported natively)

## Security

- **Secrets:** NOTION_TOKEN stored in Vercel env vars (never committed)
- **CORS:** All API endpoints allow cross-origin requests
- **Input:** Form validation on client side; Notion handles server-side validation
- **No auth:** Platform is private (assumes RRHH team access is controlled via Vercel deployment URL)

## Troubleshooting

### "NOTION_TOKEN not configured" error

1. Verify the environment variable is set in Vercel dashboard
2. Check variable name: must be exactly `NOTION_TOKEN`
3. Redeploy after adding the variable
4. Notion integrations can take 30 seconds to propagate

### Checkboxes don't save

1. Check browser console (F12) for network errors
2. Verify Notion database ID is correct in env vars
3. Ensure the integration has read/write permissions on the database
4. Check that Items Completados is a rich_text property (not plain text)

### Procesos list is empty

1. Manually create a test proceso via the modal
2. If POST works but GET returns nothing, check the Notion database ID
3. Try visiting `https://your-project.vercel.app/api/procesos?status=all` to see all statuses

## Local Development

```bash
# Install Vercel CLI if not done
npm install -g vercel

# Run dev server (watches for changes)
vercel dev

# This will start at http://localhost:3000
# Public files served from /public
# API functions from /api
```

## Future Enhancements

- PDF export of completed processes
- Bulk operations (archive multiple procesos)
- Advanced filtering (date ranges, by responsable, etc.)
- Email notifications on process stage changes
- Attachment support (resumes, background checks)
- Integration with HR management system for final contracts

## Support & Contact

- **RRHH Team:** Talentos@BlackChicken.cl
- **Platform:** bc-procesos-rrhh.vercel.app
- **Database:** Notion (shared workspace)

---

**Last Updated:** 2026-04-09  
**Version:** 1.0.0  
**Status:** Production Ready
