---
title: Network requirements
description: Firewall rules and network configuration for Dispatcher.
sidebar:
  order: 2
---

import { Aside } from '@astrojs/starlight/components';

## Outbound connections from teacher workstations

| Destination | Port | Protocol | Required? | Purpose |
|---|---|---|---|---|
| Dispatcher server (LAN IP) | 3001 (default) | HTTPS | **Required** | Extension ↔ API communication |
| `dispatcher.app` | 443 | HTTPS | Required | Licence verification |
| `chromewebstore.google.com` | 443 | HTTPS | Required for CWS install | Extension updates |
| `stripe.com`, `js.stripe.com` | 443 | HTTPS | Required for billing | Subscription payments |

<Aside type="note">
All connections from teacher workstations to the Dispatcher server go to your **own server on your own LAN** — not to an external cloud service.
</Aside>

## Outbound connections from the Dispatcher server

| Destination | Port | Purpose |
|---|---|---|
| `dispatcher.app` | 443 | Licence verification ping (no personal data) |
| Your PostgreSQL host | 5432 | Database (typically localhost in Docker Compose) |
| Your Redis host | 6379 | Queue (typically localhost in Docker Compose) |

The server does **not** make outbound connections to AI cloud providers, analytics platforms, or any external service that receives personal data.

## Firewall rules (school IT)

Add the following inbound rule to the server host's firewall:

```
Source: Teacher VLAN / subnet
Destination: Dispatcher server IP
Port: 3001
Protocol: TCP
Action: Allow
```

If you are running the server on a separate machine from the one teachers access OneSchool from, ensure traffic on port 3001 is not blocked between VLANs.

## GPU passthrough (optional, for faster AI)

By default, the AI model (Ollama) runs on CPU. For significantly faster responses, configure GPU passthrough in Docker:

**NVIDIA GPU:**
```yaml
# In docker-compose.yml, under the ollama service:
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

Install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) on the server first.

**Without GPU:** Expect 15–30 seconds per inference.  
**With GPU (e.g. RTX 3080):** Expect 2–5 seconds per inference.

## Content filter considerations

If your school uses a content filter (Netskope, Zscaler, Symantec, or DoE proxy), you may need to add an exception for:

- `http://<dispatcher-server-ip>:3001` — the local server
- `https://dispatcher.app` — licence verification
- `https://stripe.com` — billing

If the Dispatcher server is on the same LAN as teacher workstations, the local traffic typically bypasses the content filter automatically (it never leaves the school network).

For QLD DoE-managed devices, see the [MOE compatibility notes](/reference/faq/#doe-managed-devices).
