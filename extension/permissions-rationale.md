# Extension Permissions Rationale

_Updated: 2026-04-25. Review on every manifest change and before each Chrome Web Store submission._

## MV3 permissions

| Permission | Required for | Alternatives considered |
|---|---|---|
| `activeTab` | Triggering scraper on the current tab when the user invokes Dispatcher from the side panel | None — `tabs` would grant access to all tabs; `activeTab` scopes to the user-triggered tab only |
| `scripting` | Injecting `scraper.js` and `actor.js` into OneSchool pages to read DOM fields and execute actions | None — required by MV3 for programmatic script injection |
| `storage` | Persisting the session ID and user preferences across page navigations within the OneSchool session | Could use `sessionStorage` entirely; `storage` retained for cross-tab continuity |

## Host permissions

| Host | Required for | Notes |
|---|---|---|
| `https://oslp.eq.edu.au/*` | OneSchool production environment — where teachers work daily | Scope is intentionally limited to the QLD DoE OneSchool domain |
| `https://oslptrain.eq.edu.au/*` | OneSchool training environment — used for acceptance testing | Remove before publishing if not needed in v1.0 |
| `http://localhost:3001/*` | Local development API (Express server) | **Development only.** Must be replaced with production API URL (`https://api.dispatcher.app/*`) before Chrome Web Store submission |

## CSP — extension_pages

```
script-src 'self'; object-src 'self'; connect-src http://localhost:3001;
```

- `script-src 'self'` — no inline scripts or external script loading permitted.
- `object-src 'self'` — no plugins.
- `connect-src http://localhost:3001` — **development only**. Update to `https://api.dispatcher.app` before CWS submission. Keeping localhost here during development prevents the extension from accidentally calling production from a dev machine.

## Open items before CWS submission

- [ ] Replace `http://localhost:3001/*` host permission with production API URL.
- [ ] Update CSP `connect-src` to `https://api.dispatcher.app`.
- [ ] Remove `https://oslptrain.eq.edu.au/*` if training environment not needed in v1.
- [ ] Confirm `storage` permission is still needed once session management is finalised.
