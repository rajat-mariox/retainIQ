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

The agent stores only the JWT/session metadata in Electron user data. It sends aggregate keyboard/mouse counts, idle/active minute buckets, active app usage, and periodic screenshots to the RetainIQ backend. It does not store actual typed text, passwords, private chat content, webcam, or microphone data.
