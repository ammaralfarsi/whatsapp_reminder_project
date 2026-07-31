# Home Assistant architecture and installation

This repository has two deliverables:

1. The Home Assistant app in `whatsapp_reminder_platform/` runs the API,
   scheduler, full-screen UI, storage, and gateway adapters.
2. The HACS integration in `custom_components/whatsapp_reminder/` supplies a
   UI config flow, native entities, and Home Assistant actions.

HACS cannot install or start Home Assistant apps. Home Assistant keeps app
and custom-integration installation as separate administrator-approved
operations.

## Companion integration setup

1. Install and start the app from the custom App Store repository.
2. Create one platform user per HA user in the app Settings page.
3. Add this repository to HACS as an Integration, install, and restart HA.
4. Add **WhatsApp Reminder** from **Settings > Devices & services**.
5. Enter the app's direct local URL and that user's platform API key.

The integration creates pending and next-reminder sensors, a gateway
connectivity binary sensor, and `create_reminder` / `send_now` actions.
The app supplies its own full-screen sidebar experience through Ingress.

## Automation boundaries

- Local storage lives in the persistent `addon_config` mount included in HA
  backups.
- Postgres auto-creation works only in ordinary Docker with a writable Docker
  socket. Supervisor exposes a read-only Docker API, so inside HA the wizard
  can test and save an existing Postgres service but cannot install one.
- WAHA sessions can be created and paired from this app.
- `ha-whatsapp` installation and QR pairing stay in its own app/integration;
  this app sends through its documented action after pairing.
- The app does not rewrite Lovelace configuration. Managed and YAML dashboards
  have different ownership rules. Use the Ingress sidebar entry or add the
  native entities to any dashboard.
