---
title: FAQ
description: Frequently asked questions about Dispatcher.
sidebar:
  order: 1
---

## General

**What is Dispatcher?**  
Dispatcher is a Chrome extension that automates repetitive OneSchool administrative tasks (Supervision scheduling, Relief allocation, clash detection) using a local AI model. The AI runs on a server you control within your school network.

**Does Dispatcher use ChatGPT or any cloud AI?**  
No. Dispatcher uses [Ollama](https://ollama.com/) to run open-source AI models on your own hardware. No data is sent to OpenAI, Anthropic, Google, or any cloud AI provider.

**Does Dispatcher store student data?**  
No. The extension tokenises all student identifiers (names, QSNs) in the browser before any data leaves the page. The Dispatcher server only ever sees opaque tokens — it never receives, stores, or processes identifiable student data.

**Can Dispatcher make changes in OneSchool without me approving?**  
No. Every action proposed by the AI must be explicitly confirmed by you before it executes. Dispatcher never acts autonomously.

---

## DoE-managed devices

**Will Dispatcher work on a DoE-issued laptop (MOE device)?**  
This depends on the managed policies applied to your specific device. Chrome extension installation on DoE-issued laptops is controlled by DoE ICT policy. If the Chrome Web Store is blocked on your managed device, you may need IT approval or should try on a personal device.

**Can I use Dispatcher on a personal device at school?**  
Yes, if your personal device can access the Dispatcher server (which is on your school's LAN) and can reach OneSchool via the school's network. Most teachers find that a personal laptop on school Wi-Fi works well.

**Can I use Dispatcher at home?**  
Yes, on your personal device with a home or hotspot connection to the internet. You will need the Dispatcher server to be reachable (some schools set up a VPN for this). For purely read-only tasks (viewing clash reports), you can access OneSchool from home regardless.

**Is Dispatcher approved by QLD DoE?**  
Dispatcher is preparing a Safer Technologies 4 Schools (ST4S) submission to QLD DoE. Until that process completes, Dispatcher is not on the DoE approved-extension list. Check with your school IT lead about using unapproved extensions on DoE-issued devices.

---

## Installation

**Do I need admin access to install Dispatcher?**  
On personal or school-owned non-managed devices, you need Developer mode in Chrome (which requires no admin rights). On DoE-managed devices, extension installation is controlled by policy.

**How much disk space does the AI model need?**  
Approximately 4–8 GB, depending on the model selected. The default model (`gemma4:12b`) is ~8 GB.

**Can multiple teachers share one Dispatcher server?**  
Yes. The server is designed for concurrent use by multiple teachers at the same school. For performance under high load, see the [network requirements](/admin/network-requirements/) page.

---

## Privacy and compliance

**Where is our school's data stored?**  
On the server you install Dispatcher on — typically a machine within your school or on your school network. No data is stored externally.

**What data does Dispatcher send to dispatcher.app?**  
Only a licence verification token (no personal data) is sent to `dispatcher.app`. This is a small HTTPS request that confirms your subscription is active.

**Can we get a Data Processing Agreement (DPA)?**  
Yes. Contact sales@dispatcher.app to request a DPA.

**Is Dispatcher compliant with the Australian Privacy Act?**  
Dispatcher's architecture is designed to comply with the Australian Privacy Principles (APPs). Because student and staff PII is tokenised in the browser and never reaches the server, the privacy surface is minimal. See [Privacy & data retention](/security/privacy/) for full details.

---

## Troubleshooting

**The extension says "Cannot connect to server".**  
Check that (1) the Dispatcher server is running (`docker compose ps`), (2) the server IP and port in the extension settings match your server, and (3) port 3001 is not blocked by a firewall.

**AI responses are taking a long time (> 30 seconds).**  
The AI is running on CPU. Consider enabling GPU passthrough — see [network requirements](/admin/network-requirements/#gpu-passthrough).

**Dispatcher proposes the wrong staff for a supervision slot.**  
This can happen when timetable data in OneSchool is incomplete or when casual staff are not fully entered. Check the "risk level" on the proposal — High-risk proposals should always be manually verified.

**I confirmed an action but OneSchool didn't update.**  
OneSchool occasionally times out or shows a session expiry dialog. Refresh the OneSchool page and check whether the action was applied — if not, re-run the workflow.

---

## Billing

**Is there a free tier?**  
Yes. The Free plan allows 100 AI-assisted actions per month with no charge.

**What counts as an "action"?**  
Each confirmed allocation or change in OneSchool (one supervision slot filled, one relief teacher allocated, etc.) counts as one action.

**What happens when I reach the free tier limit?**  
You'll see a message in the side panel explaining you've reached the monthly limit, with a link to upgrade. Dispatcher will not make further changes until the next calendar month or until you upgrade.

**How do I upgrade?**  
Visit [dispatcher.app/pricing](https://dispatcher.app/pricing) or click the upgrade link shown in the extension when you reach the limit.
