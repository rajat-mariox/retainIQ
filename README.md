# RetainIQ — AI Workforce Intelligence Platform

> A privacy-first, multi-tenant SaaS that combines **employee retention risk detection** with a **non-invasive workforce intelligence & productivity engine**. Decision-support, never surveillance.

**🎨 Design language:** Dark, glossy, glassmorphic UI. Deep navy-to-black gradient base, frosted translucent surfaces with subtle inset highlights, soft pastel "diamond" stat tiles for headline metrics, electric iris-blue as the primary action color, gold/amber for warnings. Inter typeface throughout. All charts (Recharts) themed for the dark surface.

**⚠️ Important:** RetainIQ is a decision-support tool. Its outputs — risk scores, productivity scores, burnout signals, and ROI estimates — are probabilistic indicators based on signals the organization already owns through its HR, project-management, and calendar systems. They must **never** be the sole basis for any employment decision (termination, compensation, promotion). The platform deliberately does **not** capture keystrokes, screen content, browsing URLs, or private messages.

---

## What's Inside

| Layer | Stack |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Zustand, React Router, Recharts, Axios, lucide-react |
| Backend | Node.js, Express, Mongoose, JWT (access + refresh), Zod validation, bcrypt, helmet, rate-limit |
| AI | Rule-based scoring engine (ML-swappable) + OpenAI integration with deterministic fallback |
| Data | MongoDB (multi-tenant via `organizationId` on every collection) |
| Jobs | BullMQ-ready architecture, Redis, plus a runnable batch job |
| Deploy | Docker, docker-compose, nginx reverse proxy |

---

## Project Structure

```
retainiq/
├── backend/
│   ├── src/
│   │   ├── config/         # db.js, constants.js
│   │   ├── models/         # 9 Mongoose schemas
│   │   ├── routes/         # Express routers per resource
│   │   ├── controllers/    # Request handlers
│   │   ├── services/       # riskScoringService, aiRecommendationService
│   │   ├── middlewares/    # auth, validate, errorHandler
│   │   ├── utils/          # tokens, asyncHandler
│   │   ├── jobs/           # scoreAllJob (BullMQ-ready)
│   │   ├── seed/           # seed.js (run via npm run seed)
│   │   └── server.js
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/     # Sidebar, Topbar, RiskBadge, StatCard, Modal, UIStates
│   │   ├── pages/          # Login, Register, Dashboard, EmployeeList, EmployeeDetail,
│   │   │                   # Interventions, PulseInsights, Settings, Notifications,
│   │   │                   # ManagerDashboard, EmployeePortal, SuperAdminOrgs
│   │   ├── layouts/        # AppLayout, AuthLayout
│   │   ├── routes/         # guards.jsx (ProtectedRoute, RoleRoute)
│   │   ├── store/          # authStore (Zustand + persist)
│   │   ├── services/       # api.js (axios + interceptors), index.js (typed services)
│   │   └── utils/          # format.js
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## Architecture Overview

```
            ┌──────────────────────────────────────────────────────┐
            │ Frontend (React + Tailwind + Zustand)                │
            │   Login / Dashboard / Employees / Risk / Pulse / etc │
            └──────────┬───────────────────────────────────────────┘
                       │ HTTPS (Bearer JWT)
            ┌──────────▼───────────────────────────────────────────┐
            │ Nginx (SPA + /api proxy in production)               │
            └──────────┬───────────────────────────────────────────┘
                       │
            ┌──────────▼───────────────────────────────────────────┐
            │ Express API                                          │
            │  • authenticate (JWT) → req.user + req.organizationId│
            │  • requireRoles (RBAC)                               │
            │  • validate (Zod)                                    │
            └──────────┬───────────────────────────────────────────┘
                       │
            ┌──────────▼─────────────────┐    ┌────────────────────┐
            │ Service Layer              │    │ AI Service         │
            │  riskScoringService        │───▶│  OpenAI (optional) │
            │  (rule-based, ML-ready)    │    │  Static fallback   │
            └──────────┬─────────────────┘    └────────────────────┘
                       │
            ┌──────────▼─────────────────────────────────────────┐
            │ MongoDB (multi-tenant via organizationId)          │
            │  Org · User · Department · Employee · Signal       │
            │  RiskAssessment · Intervention · PulseSurvey       │
            │  Notification · AuditLog · Plan                    │
            └────────────────────────────────────────────────────┘
                       │
            ┌──────────▼─────────────────┐
            │ Redis + BullMQ (scheduled  │
            │ batch scoring, daily jobs) │
            └────────────────────────────┘
```

**Multi-tenancy:** every query is scoped by `req.organizationId`, injected by the auth middleware. There is no path that lets one tenant read another's data.

**RBAC:**
- `SUPER_ADMIN` — manages tenants
- `ORG_ADMIN` — full org access
- `HR_ADMIN` — full org access except billing/super features
- `MANAGER` — restricted to direct reports (enforced server-side via `scopeFilter`)
- `EMPLOYEE` — only own pulse profile

---

## Risk Scoring Engine

Located at [`backend/src/services/riskScoringService.js`](backend/src/services/riskScoringService.js).

The engine has a **stable input/output contract** so that an ML model can drop in without changing any callers.

```js
calculateRisk({ employee, signals, pulses, priorAssessments, weights }) → {
  riskScore: 0..100,
  category:  'Low' | 'Medium' | 'High' | 'Critical',
  confidence: 0..1,
  trend: 'Improving' | 'Stable' | 'Worsening',
  componentScores: { attendance, performance, engagement, hr, behavioral },
  topFactors: string[],
  recommendedAction: string,
  engineVersion: 'rule-v1'
}
```

**Default weights** (configurable per-org in Settings):
- Attendance 20% · Performance 25% · Engagement 25% · HR 20% · Behavioral 10%

**Categorization:** 0-30 Low · 31-55 Medium · 56-75 High · 76-100 Critical.

**Trend:** Δ vs previous assessment — ≥+8 worsening, ≤-8 improving.

**Confidence:** rises with diversity of signal categories present and recency of pulse data.

---

## AI Recommendation Service

Located at [`backend/src/services/aiRecommendationService.js`](backend/src/services/aiRecommendationService.js).

- If `OPENAI_API_KEY` is set, generates contextualized explanations + 1:1 talking points
- Otherwise returns a deterministic, well-written static recommendation per category
- **Privacy:** only sends the structured assessment + role context (no name, no email, no raw comments)

---

## Quick Start (Docker)

```bash
# 1. Clone & enter
cd retainiq

# 2. Copy env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. (Optional) Set OPENAI_API_KEY in backend/.env

# 4. Boot everything
docker-compose up --build

# 5. Seed demo data (in another terminal)
docker-compose exec backend npm run seed
```

Then open [http://localhost](http://localhost).

---

## Quick Start (Local Dev)

**Prerequisites:** Node 20+, MongoDB 6+ running on `mongodb://localhost:27017`.

```bash
# Backend
cd backend
cp .env.example .env
npm install
npm run seed     # creates demo org, users, employees, signals
npm run dev      # http://localhost:5000

# Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev      # http://localhost:5173
```

---

## Demo Accounts (after `npm run seed`)

| Role | Email | Password |
|---|---|---|
| Super Admin | `super@retainiq.dev` | `SuperPass!234` |
| Org Admin | `admin@acme.test` | `AdminPass!234` |
| HR Admin | `hr@acme.test` | `HrPass!234` |
| Manager | `manager1@acme.test` | `ManagerPass!234` |
| Employee | `emp1@acme.test` | `EmployeePass!234` |

The seed creates 12 employees with mixed risk profiles — 3 Critical, 3 Medium, 6 Low — so the dashboard, charts, and intervention flows have real-looking data to render.

---

## REST API Reference

All routes are prefixed with `/api`. All non-auth routes require `Authorization: Bearer <accessToken>`.

### Auth
| Method | Path | Body / Notes |
|---|---|---|
| POST | `/auth/register-org` | `{ organizationName, adminName, adminEmail, password }` |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/refresh` | `{ refreshToken }` |
| POST | `/auth/logout` | (clears client-side state) |
| GET | `/auth/me` | Returns current user + organization |

### Employees
| Method | Path | Notes |
|---|---|---|
| GET | `/employees` | `?search=&riskCategory=&departmentId=&status=&page=&limit=` |
| POST | `/employees` | ORG_ADMIN/HR_ADMIN only |
| GET | `/employees/:id` | |
| PUT | `/employees/:id` | ORG_ADMIN/HR_ADMIN only |
| DELETE | `/employees/:id` | Soft delete (sets status `inactive`) |
| POST | `/employees/bulk-import` | `{ items: [...] }` |

### Signals
| Method | Path | Notes |
|---|---|---|
| POST | `/signals` | `{ employeeId, category, metric, value, ... }` |
| POST | `/signals/bulk` | `{ items: [...] }` |
| GET | `/signals/:employeeId` | |

### Risk
| Method | Path | Notes |
|---|---|---|
| POST | `/risk/calculate/:employeeId` | Computes + persists assessment, runs AI recommendation |
| POST | `/risk/calculate-all` | Org-wide batch recompute |
| GET | `/risk/:employeeId` | Latest + 12-point history |
| GET | `/risk/dashboard` | Totals, distribution, dept breakdown, trend, top-at-risk |

### Interventions
| Method | Path | Notes |
|---|---|---|
| GET | `/interventions` | `?status=&employeeId=` |
| GET | `/interventions/employee/:employeeId` | |
| POST | `/interventions` | |
| PUT | `/interventions/:id` | |

### Pulse
| Method | Path | Notes |
|---|---|---|
| POST | `/pulse` | EMPLOYEE submits own check-in |
| GET | `/pulse/me` | Submitter's own history |
| GET | `/pulse/dashboard` | HR aggregate view (90d) |

### Notifications
| Method | Path | |
|---|---|---|
| GET | `/notifications` | |
| PUT | `/notifications/:id/read` | |
| PUT | `/notifications/read-all` | |

### Settings
| Method | Path | Notes |
|---|---|---|
| GET | `/settings` | |
| PUT | `/settings` | ORG_ADMIN only; weights must sum to 1.0 |

### Organizations
| Method | Path | Notes |
|---|---|---|
| GET | `/organizations` | SUPER_ADMIN only |
| PUT | `/organizations/:id/toggle-active` | SUPER_ADMIN only |
| GET | `/organizations/departments/list` | |
| POST | `/organizations/departments` | |

---

## Privacy & Compliance

- **No surveillance.** No keystroke logging, screen capture, or message reading.
- **Data minimization.** Only HR-domain signals (attendance, task completion %, survey scores, manager-entered observations) — data the org already owns through standard HRMS/PM systems.
- **Anonymized AI calls.** When OpenAI is enabled, only the structured assessment + role/department/tenure are sent. Name, email, and free-text comments are never transmitted.
- **Configurable visibility.** Org settings control whether employees see their own score (default: off).
- **Audit trail.** `AuditLog` collection ready for write-on-action expansion.
- **Tenant isolation.** Every collection has `organizationId`; middleware injects it on every query.
- **Right-to-be-forgotten readiness.** Soft-delete via status flag; data-retention setting placeholder.

In every relevant UI: *"Decision-support insights only — never the sole basis for employment decisions."*

---

## Future ML Upgrade Roadmap

The rule engine returns the same shape an ML model would. To swap in:

**Phase 1 — Data foundation (months 1–3)**
1. Add a daily snapshot job that writes labeled training rows: `{ features, willLeaveIn90d }`
2. Deploy enough RetainIQ tenants to accumulate ~500–2,000 attrition events
3. Standardize signal metric vocabulary across customers

**Phase 2 — First model (months 3–6)**
1. Train a gradient-boosted classifier (XGBoost / LightGBM) per industry vertical on aggregated, opted-in data
2. Calibrate output to 0–100 with Platt/isotonic scaling
3. Use SHAP for `topFactors` (replaces hand-coded factor rules)
4. Wrap as a Python microservice (FastAPI), deploy on the same VPC as the API
5. Replace `riskScoringService.calculateRisk` with an HTTP call — keep the same shape; raise `engineVersion` to `ml-v1`

**Phase 3 — Per-tenant fine-tuning (months 6–12)**
1. Allow large customers to train tenant-specific weights on their own labels
2. Build feedback loop: HR marks "this prediction was right/wrong" → retrain monthly
3. A/B test rule engine vs ML engine in production, measure precision@K

**Phase 4 — Beyond classification**
1. Survival analysis (time-to-attrition, not just binary)
2. Counterfactual recommendations ("if we did X, predicted risk drops to Y")
3. Cohort drift detection — alert when a department's risk distribution shifts

The architecture supports all of this without touching the API surface.

---

## Workforce Intelligence & Productivity Engine

A second engine alongside risk scoring. Same multi-tenancy, same RBAC, same decision-support principles — focused on productivity, focus, burnout, and ROI.

### Architecture extension

```
ActivityLog ──▶ ProductivityScoringService ──▶ ProductivityScore
                              │
                              ├──▶ BurnoutService ──▶ Alert
                              ├──▶ ROIService ──▶ ROIData
                              ├──▶ WorkPatternService ──▶ WorkPattern
                              ├──▶ ReportService ──▶ Report
                              └──▶ Signal (behavioral) ──▶ Risk Engine
                                                          (feeds attrition risk)
```

### What we track (and what we never collect)

**Used (aggregates the org already produces):**
- Login/logout times from HRMS
- Active vs. idle minutes (no content)
- App *category* usage — coding / communication / docs / design / meeting / idle / other (never the app name beyond a category)
- Tasks completed, commits, PRs, tickets resolved (from PM / source control)
- Calendar meeting durations
- Self-reported pulse surveys
- App switch counts and contiguous deep-work block counts (counts only, no content)

**Never collected:**
- Screen recordings, screenshots, or window titles
- Keystroke logs
- Email or chat message contents
- Browsing URLs
- Webcam, microphone, or clipboard

### Productivity Scoring Engine

Located at [`backend/src/services/productivityScoringService.js`](backend/src/services/productivityScoringService.js). Same stable contract pattern as the risk engine:

```js
calculateProductivity({ employee, activity, historical, weights }) → {
  score: 0..100,
  band: 'High Performer' | 'Stable' | 'Needs Attention',
  subScores: { timeUtilization, taskCompletion, meetingEfficiency, engagement, consistency, focus },
  efficiency: { tasksPerActiveHour, normalized },
  flags: ['overwork', 'burnout_risk', 'low_focus', 'meeting_overload', 'high_idle', 'productivity_drop'],
  insights: string[],
  engineVersion: 'prod-v1'
}
```

**Default sub-score weights** (per-org configurable):
- Time utilization 20% · Task completion 30% · Meeting efficiency 10%
- Engagement 10% · Consistency 15% · Focus 15%

**Bands:** ≥75 High Performer · ≥50 Stable · <50 Needs Attention.

### How productivity feeds attrition risk

When `calculateProductivity` produces a `productivity_drop` flag or burnout is detected, the system writes a **behavioral signal** (`activity_decline_pct`) into the existing `Signal` collection. That signal is consumed by the existing `riskScoringService` on the next risk recompute — so a sustained productivity dip increases attrition risk automatically. Two engines, one cohesive view.

### Burnout detection

`backend/src/services/burnoutService.js` flags burnout from sustained patterns (not single-day spikes):

- 5+ consecutive days >9h logged → 35 points
- Working >30% of weekends → 20 points
- Output dropping ≥15% despite long hours → 25 points
- Almost no breaks across 14 days → 15 points
- Meeting overload (>50% of time in meetings on 4+ days/week) → 10 points

Levels: ≥60 critical · ≥35 high · ≥15 moderate · else none.

### ROI calculator

`backend/src/services/roiService.js` produces a coarse trend signal:

```
estimatedOutputValue = Σ(active hours × score/100 × roleValuePerHour)
roiRatio = estimatedOutputValue / cost
```

Bands by ratio: ≥2 Strong Positive · ≥1.2 Positive · ≥0.8 Neutral · else Negative. Disabled by default — must be explicitly turned on per org, requires `monthlyCost` on each employee. Comes with a UI disclaimer that this is **a coarse signal for spotting outliers, not a basis for compensation or termination decisions**.

### New REST APIs

All under `/api`, all multi-tenant scoped, all require `Authorization: Bearer <token>`.

#### Activity ingestion
| Method | Path | Notes |
|---|---|---|
| POST | `/activity` | Upsert one day's aggregate for an employee |
| POST | `/activity/bulk` | Bulk upsert from HRMS / PM-tool integration |
| GET | `/activity/:employeeId?days=30` | History |

#### Productivity
| Method | Path | Notes |
|---|---|---|
| POST | `/productivity/calculate/:employeeId?date=YYYY-MM-DD` | Compute & persist one day's score; emits signals + alerts |
| POST | `/productivity/calculate-all` | Org-wide batch |
| GET | `/productivity/dashboard` | Stats, distribution, dept comparison, trend, top/bottom |
| GET | `/productivity/leaderboard` | Ranked list with streaks + badges |
| GET | `/productivity/:employeeId/scores?days=30` | Daily scores |
| GET | `/productivity/:employeeId/work-pattern` | Day-of-week / hour-of-day profile, consistency |
| GET | `/productivity/:employeeId/burnout-check` | 14-day burnout signals |

#### Reports
| Method | Path | Notes |
|---|---|---|
| GET | `/reports?scope=&period=&employeeId=` | List |
| POST | `/reports/generate` | `{ scope, period, employeeId?, departmentId?, managerId? }` |
| GET | `/reports/preview/:employeeId?period=weekly` | Live preview without saving |
| GET | `/reports/:id` | Single report |

#### ROI
| Method | Path | Notes |
|---|---|---|
| GET | `/roi/dashboard?period=monthly` | Per-employee + totals (returns `enabled:false` if disabled) |
| POST | `/roi/calculate/:employeeId` | Compute & persist one snapshot |

#### Alerts
| Method | Path | Notes |
|---|---|---|
| GET | `/alerts?type=&acknowledged=false` | List, manager-scoped |
| GET | `/alerts/summary` | Counts by type for last 7d |
| PUT | `/alerts/:id/acknowledge` | Mark acknowledged |

### New collections

`ActivityLog` · `ProductivityScore` · `WorkPattern` · `Report` · `Alert` · `ROIData`. Plus extensions to `Employee` (`monthlyCost`, `roleValuePerHour`, `currency`, `currentProductivityScore`, `currentProductivityBand`) and `Organization.settings.productivity` (weights, burnout thresholds, ROI/gamification/transparency toggles).

### New UI pages

- **Workforce Intelligence dashboard** (`/productivity`) — band distribution, dept comparison, trend, top + low performers, alert summary
- **Productivity detail** (`/employees/:id/productivity`) — radial gauge, sub-score bars, burnout panel, 30-day trend, day-of-week pattern, AI insights with daily/weekly/monthly toggle
- **Reports** (`/reports`) — list + generate modal with scope/period selector
- **ROI** (`/roi`) — totals (cost / value / net / company ROI) + per-employee ROI table, weekly/monthly toggle
- **Leaderboard** (`/leaderboard`) — ranked list with medals (top 3), streak badges, recognition badges
- **Alerts** (`/alerts`) — filterable inbox with acknowledge action
- **My Productivity** (`/portal/productivity`) — employee self-view with full transparency panel ("what we track / what we never collect")

### Demo flow

```bash
# After docker-compose up + seed:
# 1. Log in as hr@acme.test
# 2. Sidebar → Workforce Intelligence → Productivity
#    — see distribution, dept comparison, top + low performers
# 3. Click any employee → click "Productivity" button
#    — see radial gauge, sub-scores, 30-day trend, burnout panel, AI insights
# 4. Sidebar → Alerts — see burnout / overwork / meeting overload alerts
# 5. Sidebar → Leaderboard — see ranking with medals + streaks
# 6. Sidebar → Reports → "Generate report" → scope: company, period: monthly
# 7. Sidebar → Employee ROI (already enabled in seed) — see cost vs. value
# 8. Sidebar → Settings → Workforce Intelligence — adjust weights, burnout thresholds, toggles
# 9. Log out, log in as emp1@acme.test
# 10. Sidebar → My Productivity — see your own view + the "what we track" transparency panel
```

---

## Future ML Upgrade Roadmap (Productivity Module)

The productivity engine has the same swappable contract:

**Phase 1 — Better signals**
- Real-time integrations: Slack/Teams aggregates, Jira/Linear, GitHub/GitLab, Google/Outlook calendar
- Time-of-day buckets (24-hour `hourlyActivities` already supported by `WorkPatternService`)

**Phase 2 — Per-role baselining**
- Train per-role baselines for "what good looks like" (engineer, designer, sales, support)
- Replace fixed thresholds with learned percentiles

**Phase 3 — Sequence models for burnout**
- LSTM/transformer over 30-day activity sequences
- Predict burnout 14 days before it manifests

**Phase 4 — Causal counterfactuals**
- "If this employee dropped 2 meetings/week, predicted productivity would rise by X"
- Useful for manager coaching, not policy enforcement

---

## Production Hardening Checklist

Before going live with real customer data:

- [ ] Replace JWT secrets with strong random values; rotate refresh tokens server-side (revocation list)
- [ ] Add Helmet CSP, HSTS at the nginx layer + TLS termination
- [ ] Move from in-process rate-limiter to Redis-backed `rate-limit-redis`
- [ ] Move long batch scoring from synchronous endpoint to BullMQ queue
- [ ] Add OpenTelemetry tracing + structured logging (pino)
- [ ] Write the audit log on every state-changing request
- [ ] Add MongoDB replica set + PITR backups
- [ ] DPA + SOC2 controls: encryption at rest, key rotation, access reviews
- [ ] Penetration test, especially around the multi-tenant `organizationId` boundary
- [ ] Email provider integration for the notification service (SES / Postmark / Resend)

---

## License

Proprietary — internal MVP starter. Adapt for your organization.
