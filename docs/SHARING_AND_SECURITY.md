# Publishing and safety notes

This PUBLIC GitHub edition has: no API keys; no n8n credential object references; no original n8n instance/workflow IDs; no original webhook IDs; no captured live execution data. It contains fictional sample CRM rows to aid table schema import, which MUST be deleted after import.

The supplied screenshots were taken by the author before the QA repairs and are labeled accordingly. Updated maps are programmatically generated from JSON, not live n8n execution screenshots.

Do not publish the separate PRIVATE deployment export: it keeps references to the author's local instance so its already-connected model accounts may still be selected during testing. It has no embedded API secret, but its identifiers should remain private.

Published workflows must be reconfigured after import and remain inactive until the owner's live tests are complete. Internal authenticated n8n Forms are not public-facing customer portals; review actual permissions before enabling them.

No redistribution license has been selected. Add a deliberate LICENSE file if you want to grant public reuse rights.
