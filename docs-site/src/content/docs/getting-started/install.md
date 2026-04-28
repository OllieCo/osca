---
title: Quick install
description: Get Dispatcher running at your school in 15 minutes.
sidebar:
  order: 1
---

import { Steps, Aside, Tabs, TabItem } from '@astrojs/starlight/components';

This guide walks through installing the Dispatcher backend server and the Chrome extension. You need both — the extension is the interface teachers use, and the server runs the AI that powers it.

## Before you start

| Requirement | Minimum |
|---|---|
| Server OS | Ubuntu 22.04 LTS or Debian 12 (Windows Server supported via Docker Desktop) |
| RAM | 8 GB (16 GB recommended for concurrent staff usage) |
| CPU | 4 cores (8 recommended) |
| Storage | 20 GB free (for the AI model) |
| Network | School LAN access; outbound HTTPS to `dispatcher.app` for licensing |
| Chrome | Version 114 or later, on every teacher workstation |

<Aside type="note">
The server runs entirely within your school network. No student or staff data is sent to external servers.
</Aside>

## Step 1 — Install Docker

<Tabs>
<TabItem label="Ubuntu / Debian">
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker --version
```
</TabItem>
<TabItem label="Windows Server">
Install [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/) and ensure WSL 2 is enabled. Use the **Linux containers** mode.
</TabItem>
</Tabs>

## Step 2 — Download Dispatcher

```bash
curl -fsSL https://dispatcher.app/install.sh | bash
cd dispatcher
```

This downloads the `docker-compose.yml` and a `.env` template to a new `dispatcher/` directory.

## Step 3 — Configure your environment

```bash
cp .env.example .env
nano .env   # or use any text editor
```

Required settings:

```ini
# Your school's domain (used for CORS and branding)
SCHOOL_DOMAIN=your-school.eq.edu.au

# Port the server listens on (default: 3001)
PORT=3001

# Secret key — generate with: openssl rand -hex 32
JWT_SECRET=<paste generated key here>
```

<Aside type="caution">
Never commit `.env` to a public repository. It contains secrets.
</Aside>

## Step 4 — Start the server

```bash
docker compose up -d
```

This starts four services:

| Service | Description |
|---|---|
| `api` | Express backend — handles extension requests |
| `postgres` | Database — stores audit logs and usage data |
| `redis` | Queue — manages AI inference jobs |
| `ollama` | Local AI — runs the language model on your hardware |

The first startup pulls the AI model (~4 GB). This may take 5–10 minutes depending on your internet connection.

**Verify everything is running:**

```bash
curl http://localhost:3001/api/health
# Expected: {"status":"ok","db":"ok","redis":"ok"}
```

## Step 5 — Install the Chrome extension

<Steps>
1. Open Chrome on any teacher workstation.
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `dispatcher-extension/` folder inside your downloaded directory.
5. Pin the Dispatcher icon to the Chrome toolbar.
</Steps>

<Aside type="tip">
For deployment across many workstations, see the [Chrome managed install guide](/admin/managed-install/) — this avoids the manual steps above for each device.
</Aside>

## Step 6 — Connect the extension to your server

When the extension loads for the first time, it shows a setup screen:

1. Enter your server URL: `http://<server-ip>:3001` (replace with your server's local IP address).
2. Click **Connect**. The extension verifies the connection.
3. You're ready to run your [first workflow](/getting-started/first-workflow/).

## Keeping Dispatcher updated

```bash
cd dispatcher
docker compose pull
docker compose up -d
```

Run this whenever a new version is announced in the [changelog](/reference/changelog/). The extension updates automatically via the Chrome Web Store (once the CWS listing is live).

## Troubleshooting

**Health endpoint returns `"db":"error"`**
The Postgres container may still be starting. Wait 30 seconds and retry.

**AI responses are very slow (> 30 seconds)**
The AI model is running on CPU only. For better performance, enable GPU passthrough — see the [network requirements page](/admin/network-requirements/).

**Extension says "Cannot connect to server"**
Check that the server IP is correct and that port `3001` is not blocked by a firewall rule on the server host.
