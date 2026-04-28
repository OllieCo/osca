---
title: Chrome managed install
description: Deploy Dispatcher to all teacher workstations via Google Admin Console or Microsoft Intune.
sidebar:
  order: 1
---

import { Steps, Tabs, TabItem, Aside } from '@astrojs/starlight/components';

Force-installing Dispatcher via your management console means teachers don't need to install the extension themselves, and it updates automatically when new versions are released.

<Aside type="note">
The Dispatcher extension is pending Chrome Web Store approval. Until the CWS listing is live, use the **developer-mode sideload** method below for pilot deployments. The managed install guide will be updated once the CWS ID is confirmed.
</Aside>

## Option A — Chrome Web Store (recommended once live)

Once the Dispatcher CWS listing is live, you will force-install it using the extension ID.

<Tabs>
<TabItem label="Google Admin Console">

<Steps>
1. Sign in to [admin.google.com](https://admin.google.com) with a super-admin account.

2. Go to **Devices → Chrome → Apps & Extensions → Users & Browsers**.

3. Select the Organisational Unit (OU) that contains your teacher accounts.

4. Click the **+** button → **Add from Chrome Web Store**.

5. Search for **Dispatcher** or paste the extension ID: `[PLACEHOLDER — confirm once CWS listing is live]`.

6. Set the installation policy to **Force install**.

7. Click **Save**. The extension will appear on all managed devices in the OU within a few hours.
</Steps>

</TabItem>
<TabItem label="Microsoft Intune">

<Steps>
1. Sign in to the [Microsoft Intune admin centre](https://intune.microsoft.com).

2. Go to **Apps → All apps → Add**.

3. Select **Microsoft Edge app** (or **Google Chrome** if managing Chrome via Intune).

4. Under **Extension management policy**, add a new entry:
   - Extension ID: `[PLACEHOLDER — confirm once CWS listing is live]`
   - Install type: `force_installed`
   - Update URL: `https://clients2.google.com/service/update2/crx`

5. Assign the policy to your **Teachers** device group.

6. Click **Review + Save**.
</Steps>

</TabItem>
</Tabs>

## Option B — Developer-mode sideload (pilot deployments)

Use this method for pilot deployments while the CWS listing is pending.

<Steps>
1. Copy the `dispatcher-extension/` folder to a shared network location accessible from all teacher devices (e.g., `\\fileserver\apps\dispatcher-extension`).

2. Open **Group Policy Management** (Windows) or your MDM policy editor.

3. Enable the Chrome policy: **ExtensionInstallForcelist**.

4. Add the entry:
   ```
   <extension-id>;file:///\\fileserver\apps\dispatcher-extension
   ```
   Replace `<extension-id>` with the value shown in Chrome's `chrome://extensions` page after loading the unpacked extension once.

5. Apply the policy. Chrome will load the extension on next policy refresh (or restart).
</Steps>

<Aside type="caution">
Sideloaded extensions don't auto-update. When a new version is released, copy the new files to the same network location and the extension will reload on next Chrome restart.
</Aside>

## Configuring the server URL via policy

Instead of asking each teacher to enter the server URL on first run, you can pre-configure it via managed policy:

```json
{
  "serverUrl": "http://192.168.1.100:3001"
}
```

<Tabs>
<TabItem label="Google Admin Console">
In the extension's **Policy for extensions** field (under the App & Extensions settings for Dispatcher), paste the JSON above with your server's IP address.
</TabItem>
<TabItem label="Windows Group Policy">
Create a registry entry at:
```
HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\<extension-id>\policy
```
Value name: `serverUrl`  
Value data: `http://192.168.1.100:3001`
</TabItem>
</Tabs>

## Verifying the deployment

After applying the policy, open Chrome on a managed device and:

1. Navigate to `chrome://extensions`.
2. Confirm **Dispatcher** is listed and enabled.
3. Click the extension icon — it should show "Connected" (green indicator) if the server is reachable.

If the extension shows "Cannot connect to server", see [network requirements](/admin/network-requirements/).

## Removing the extension

To uninstall Dispatcher from all managed devices:

- **Google Admin:** Change the installation policy from **Force install** to **Block** or **Remove**.
- **Intune:** Remove the extension entry from the managed extension policy and reassign.

Changes propagate on next Chrome policy refresh (typically within a few hours, or immediately after running `gpupdate /force` on Windows).
