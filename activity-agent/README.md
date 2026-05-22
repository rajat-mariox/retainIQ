# RetainIQ Activity Agent

Electron desktop tracker for RetainIQ employees.

## Setup

```bash
cd activity-agent
npm install
npm run dev
```

Set `API_BASE_URL` if your backend is not running at `http://localhost:5000/api`.

```bash
$env:API_BASE_URL="http://localhost:5000/api"
npm run dev
```

On macOS/Linux, set environment variables inline:

```bash
API_BASE_URL="http://localhost:5000/api" npm run dev
```

## Build for macOS

Build the macOS app on a Mac:

```bash
cd activity-agent
npm install
npm run build:mac
```

The generated `.dmg` and `.zip` files are written to `dist/`.
Copy `dist/RetainIQ-Activity-Agent-mac.dmg` to the backend downloads folder
before deploying:

```bash
cp dist/RetainIQ-Activity-Agent-mac.dmg ../backend/static/downloads/
```

For a quick unpacked app build during testing:

```bash
npm run build:mac:dir
```

After installing, macOS may ask for permissions. Enable RetainIQ Activity Agent
in System Settings > Privacy & Security for Screen Recording, Accessibility,
and Input Monitoring so screenshots, active app usage, and aggregate
keyboard/mouse activity can be tracked.

The agent stores only the JWT/session metadata in Electron user data. It sends aggregate keyboard/mouse counts, idle/active minute buckets, active app usage, and periodic screenshots to the RetainIQ backend. It does not store actual typed text, passwords, private chat content, webcam, or microphone data.
