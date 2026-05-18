# RetainIQ Backend README

This README is a backend handoff document for RetainIQ. You can give this file to ChatGPT or any developer to quickly understand what the backend does, how it is structured, how to run it, and how the main flows work.

## What This Backend Does

RetainIQ is a multi-tenant employee retention, productivity, and workforce intelligence backend.

It supports:

- Organization registration and super-admin approval.
- Role-based login for super admin, org admin, HR admin, manager, and employee users.
- Employee and department management.
- HR risk signal ingestion and rule-based retention risk scoring.
- Pulse surveys and configurable pulse questions.
- Intervention planning and tracking.
- Activity-agent ingestion for work sessions, app usage, screenshots, active/idle/break time, and end-of-day summaries.
- Productivity scoring, leaderboards, work pattern insights, burnout checks, alerts, reports, and ROI dashboards.

Important privacy/decision-support note: the backend is intended for decision support only. Risk or productivity output must not be used as the sole basis for employment decisions. The activity agent stores aggregate input counts, app usage, active/idle/break time, and optional screenshots. It does not store typed text, passwords, private chat content, webcam, or microphone data.

## Tech Stack

- Runtime: Node.js
- Framework: Express
- Database: MongoDB through Mongoose
- Auth: JWT access tokens plus refresh tokens
- Validation: Zod in controllers
- Security middleware: Helmet, CORS, express-rate-limit
- Logging: Morgan
- Optional AI: OpenAI SDK for recommendations/summaries, with fallback behavior when no API key is present
- Optional jobs: Redis/BullMQ dependencies are present, but most current jobs are script-driven

## Folder Structure

```text
backend/
  src/
    server.js                    Express app bootstrap and route mounting
    config/
      db.js                      MongoDB connection
      constants.js               Roles, risk categories, statuses
    middlewares/
      auth.js                    JWT auth, role guards, org approval checks
      errorHandler.js            HttpError, notFound, global error handler
      validate.js                Validation helper
    routes/                      Express route definitions
    controllers/                 Request handlers and endpoint logic
    models/                      Mongoose schemas
    services/                    Scoring, AI, access-control, reports, ROI
    seed/
      seed.js                    Minimal clean seed for E2E testing
    jobs/
      scoreAllJob.js             Batch scoring script
  uploads/
    screenshots/                 Uploaded activity-agent screenshots
  package.json
  .env.example
```

## Setup

From the backend folder:

```bash
npm install
cp .env.example .env
npm run dev
```

For Windows PowerShell, copy the env file manually if `cp` is not available:

```powershell
Copy-Item .env.example .env
npm run dev
```

Default API URL:

```text
http://localhost:5000
```

Health check:

```text
GET /health
```

## Environment Variables

See `.env.example`.

```env
NODE_ENV=development
PORT=5000
CORS_ORIGIN=http://localhost:5173

MONGO_URI=mongodb://localhost:27017/retainiq

JWT_SECRET=replace-with-strong-random-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=replace-with-different-strong-random-secret
JWT_REFRESH_EXPIRES_IN=7d

REDIS_HOST=localhost
REDIS_PORT=6379

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

OpenAI is optional. When `OPENAI_API_KEY` is absent, AI-oriented services use deterministic fallback summaries/recommendations where implemented.

## Scripts

```bash
npm start       # Run src/server.js
npm run dev     # Run with nodemon
npm run seed    # Clear key collections and seed demo data
npm run score:all
```

## Seed Data

`npm run seed` creates a clean Cravix organization and minimal users for testing. It clears users, organizations, employees, signals, pulse surveys, plans, risk assessments, notifications, activity logs, sessions, events, screenshots, app usage logs, productivity scores, alerts, tasks, and interventions.

Seeded credentials:

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `super@retainiq.dev` | `SuperPass!234` |
| Org Admin | `admin@cravix.test` | `AdminPass!234` |
| HR Admin | `hr@cravix.test` | `HrPass!234` |
| Manager | `manager@cravix.test` | `ManagerPass!234` |
| Employee 1 | `emp1@cravix.test` | `EmployeePass!234` |
| Employee 2 | `emp2@cravix.test` | `EmployeePass!234` |

The seed intentionally does not create fake activity, risk scores, or signals. Generate those by using the app, activity agent, or API endpoints.

## Roles And Access

Roles are defined in `src/config/constants.js`:

- `SUPER_ADMIN`: platform-level admin. Can approve/reject/toggle organizations.
- `ORG_ADMIN`: tenant admin. Can manage org settings, departments, users.
- `HR_ADMIN`: HR admin. Can manage employees, risk/productivity workflows, pulse/admin workflows.
- `MANAGER`: manager user with employee profile. Can view/manage relevant employee workflows.
- `EMPLOYEE`: employee portal user with own activity, pulse, tasks, and productivity data.

`src/middlewares/auth.js`:

- Verifies `Authorization: Bearer <accessToken>`.
- Loads the user.
- Blocks inactive users.
- For non-super-admin users, verifies organization exists, is approved, and is active.
- Attaches `req.user` and `req.organizationId`.
- `requireRoles(...)` gates endpoints by role.

## Main API Mounts

All API routes are mounted under `/api`.

| Mount | Purpose |
| --- | --- |
| `/api/auth` | Register org, login, refresh, logout, current user, activity-agent launch tickets |
| `/api/organizations` | Super-admin org approval/status plus org department management |
| `/api/users` | Org user creation/listing and manager list |
| `/api/employees` | Employee CRUD and bulk import |
| `/api/signals` | HR/risk signal ingestion |
| `/api/risk` | Retention risk scoring and dashboard |
| `/api/interventions` | Retention intervention plans |
| `/api/pulse` | Pulse survey submit/history/dashboard/questions |
| `/api/notifications` | Notification list/read state |
| `/api/settings` | Organization settings, including activity-agent settings |
| `/api/tasks` | Employee task CRUD |
| `/api/activity` | Desktop activity-agent sessions/events/screenshots/app usage/sync/read APIs |
| `/api/productivity` | Productivity scoring, dashboard, leaderboard, work patterns, burnout checks |
| `/api/reports` | Report generation/preview/get/list |
| `/api/roi` | ROI dashboard and employee ROI calculation |
| `/api/alerts` | Productivity/risk alert list, summary, acknowledge |

## Authentication Flow

Key endpoints in `src/routes/auth.routes.js`:

- `POST /api/auth/register-org`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/agent-launch-ticket`
- `POST /api/auth/agent-exchange`

Normal web login calls `/api/auth/login` and receives user/session data including JWTs.

The desktop activity agent can be launched from the web app using a short-lived launch ticket:

1. Web app calls `POST /api/auth/agent-launch-ticket`.
2. Web app opens `retainiq-agent://launch?ticket=...`.
3. Agent calls `POST /api/auth/agent-exchange`.
4. Agent receives full auth data without asking the user to log in again.

## Activity Agent Flow

Routes are in `src/routes/activity.routes.js`, controller in `src/controllers/activity.controller.js`.

Agent write endpoints are employee-only:

- `POST /api/activity/session/start`
- `POST /api/activity/session/break`
- `POST /api/activity/session/resume`
- `POST /api/activity/session/end`
- `POST /api/activity/event`
- `POST /api/activity/event/bulk`
- `POST /api/activity/app-usage`
- `POST /api/activity/app-usage/bulk`
- `POST /api/activity/screenshot`
- `POST /api/activity/sync`
- `POST /api/activity/end-day`

Read endpoints:

- `GET /api/activity/:employeeId`
- `GET /api/activity/:employeeId/screenshots`
- `GET /api/activity/:employeeId/apps`
- `GET /api/activity/:employeeId/ai-summary`

Important models:

- `ActivitySession`: one work session with start/end/status and active/idle/break totals.
- `ActivityEvent`: individual aggregate keyboard/mouse/idle/active events.
- `AppUsageLog`: app/window usage with category and duration.
- `ScreenshotLog`: screenshot metadata and uploaded image URL.
- `ActivityLog`: daily aggregate row, used by dashboards and scoring.

End-of-day behavior:

1. Agent flushes buffered events and app usage.
2. Agent calls `/activity/session/end`.
3. Agent calls `/activity/end-day`.
4. Backend writes/updates the daily `ActivityLog`.
5. Backend recomputes productivity via `calculateAndPersistActivityScore`.

Screenshots are saved under:

```text
backend/uploads/screenshots/
```

The server exposes uploads at:

```text
/uploads
```

## Risk Scoring

Risk logic is in `src/services/riskScoringService.js`.

Engine version:

```text
rule-v1
```

Inputs:

- Employee document
- Recent `Signal` documents
- Recent `PulseSurvey` documents
- Prior `RiskAssessment` documents
- Optional weights

Risk components:

- Attendance
- Performance
- Engagement
- HR
- Behavioral

Output:

- `riskScore` from 0 to 100
- `category`: `Low`, `Medium`, `High`, `Critical`
- `confidence`
- `trend`: `Improving`, `Stable`, `Worsening`
- component scores
- top factors
- recommended action
- engine version

Risk endpoints:

- `POST /api/risk/calculate/:employeeId`
- `POST /api/risk/calculate-all`
- `GET /api/risk/dashboard`
- `GET /api/risk/:employeeId`

## Productivity Scoring

There are two related scoring services:

1. `src/services/productivityScoringService.js`
   - General aggregate productivity scoring.
   - Engine version: `prod-v1`.
   - Uses time utilization, task completion, meeting efficiency, engagement, consistency, and focus.

2. `src/services/activityProductivityService.js`
   - Activity-agent driven daily scoring.
   - Engine version: `activity-agent-v1`.
   - Builds metrics from sessions, daily activity logs, app usage, pulse survey, and tasks.
   - Persists `ProductivityScore` and updates employee current productivity fields.

Productivity endpoints:

- `POST /api/productivity/calculate/:employeeId`
- `POST /api/productivity/calculate-all`
- `GET /api/productivity/dashboard`
- `GET /api/productivity/leaderboard`
- `GET /api/productivity/:employeeId/scores`
- `GET /api/productivity/:employeeId/work-pattern`
- `GET /api/productivity/:employeeId/burnout-check`

## Pulse Surveys

Routes are in `src/routes/pulse.routes.js`.

Endpoints:

- `POST /api/pulse`
- `GET /api/pulse/me`
- `GET /api/pulse/dashboard`
- `GET /api/pulse/questions`
- `POST /api/pulse/questions`
- `PUT /api/pulse/questions/:id`
- `DELETE /api/pulse/questions/:id`

Employees submit mood/workload/support/growth scores plus optional comments and callback requests.

Org/HR admins can manage custom pulse questions.

## Employees, Users, And Organizations

Organization lifecycle:

- Users can register a new organization through `/api/auth/register-org`.
- New organizations are pending by default.
- Super admin can approve/reject/toggle active status using `/api/organizations`.
- Non-super-admin users are blocked if their organization is pending, rejected, missing, or inactive.

Employee management:

- `GET /api/employees`
- `GET /api/employees/:id`
- `POST /api/employees` HR admin only
- `POST /api/employees/bulk-import` HR admin only
- `PUT /api/employees/:id` HR admin only
- `DELETE /api/employees/:id` HR admin only

User management:

- `GET /api/users` org admin only
- `POST /api/users` org admin only
- `GET /api/users/managers` org admin or HR admin

Managers are both users and employees in the seed data. This lets managers appear in reporting hierarchy and use the desktop activity agent.

## Signals And Interventions

Signals:

- `POST /api/signals`
- `POST /api/signals/bulk`
- `GET /api/signals/:employeeId`

Signals are HR-domain metrics used by the risk engine, such as attendance, performance, engagement, HR, and behavioral indicators.

Interventions:

- `GET /api/interventions`
- `GET /api/interventions/employee/:employeeId`
- `POST /api/interventions`
- `PUT /api/interventions/:id`

Intervention types and statuses are defined in `src/config/constants.js`.

## Reports, ROI, Alerts, Notifications, Tasks

Reports:

- `GET /api/reports`
- `POST /api/reports/generate`
- `GET /api/reports/preview/:employeeId`
- `GET /api/reports/:id`

ROI:

- `GET /api/roi/dashboard`
- `POST /api/roi/calculate/:employeeId`

Alerts:

- `GET /api/alerts`
- `GET /api/alerts/summary`
- `PUT /api/alerts/:id/acknowledge`

Notifications:

- `GET /api/notifications`
- `PUT /api/notifications/:id/read`
- `PUT /api/notifications/read-all`

Tasks:

- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`

## Key Models

Core tenant/auth:

- `Organization`
- `Plan`
- `Department`
- `User`
- `Employee`

Risk/retention:

- `Signal`
- `RiskAssessment`
- `Intervention`
- `PulseSurvey`
- `PulseQuestion`
- `Notification`
- `Alert`

Activity/productivity:

- `ActivityLog`
- `ActivitySession`
- `ActivityEvent`
- `AppUsageLog`
- `ScreenshotLog`
- `ProductivityScore`
- `WorkPattern`
- `Task`

Business/reporting:

- `Report`
- `ROIData`
- `AuditLog`

## Data Access Rules

The backend is multi-tenant. Most documents include `organizationId`, and controllers/services should always scope queries by `req.organizationId`.

Activity access helper:

```text
src/services/activityAccessService.js
```

Use this helper when reading or writing employee activity data. It enforces employee self-access, manager access, and org-level admin access patterns.

## Common Developer Notes

- Server entrypoint: `src/server.js`.
- Every protected route should use `authenticate`.
- Use `requireRoles(...)` for role-gated endpoints.
- Prefer service functions for scoring/reporting/business logic rather than putting that logic directly in route files.
- Use Zod in controllers for request payload validation.
- Screenshots are uploaded as base64 and stored on disk under `uploads/screenshots`.
- `express.json({ limit: '15mb' })` is set because screenshot upload payloads can be large.
- Rate limit is `200` requests per minute under `/api/`.
- CORS origins come from `CORS_ORIGIN`, comma-separated.

## Useful ChatGPT Prompt

If you are giving this README to ChatGPT, use a prompt like:

```text
You are helping me work on the RetainIQ backend. Read this README as the source of truth for the backend architecture, roles, routes, data models, seed users, activity-agent flow, and scoring services. When suggesting changes, preserve multi-tenant organization scoping, JWT auth, role-based access, privacy constraints, and the decision-support disclaimer. Ask for specific source files if you need implementation details beyond this README.
```

