# Contributing

Kalypt handles files people may consider private, sensitive, or untrusted. The main rule for contributions is simple: **be conservative with user data**.

Bug reports, format samples, new inspectors, false-positive fixes, documentation, and platform integrations are all useful.

## Development

Node.js 20+ is supported. The core currently has no runtime npm dependencies.

```bash
npm test
npm run lint
node ./bin/kalypt.js scan ./some-fixture
node ./bin/kalypt.js ui
```

Before opening a pull request, run `npm run check` and add tests for behavior you changed.

## Inspectors

When adding an inspector:

1. Put reusable format parsing in `src/formats/`.
2. Put finding logic in `src/inspectors/`.
3. Emit normalized findings through `finding()`.
4. Never put full credentials, private keys, or other sensitive values in evidence.
5. Test malformed and truncated input, not just valid samples.
6. Keep parsers bounded. Files and archives should not get unlimited memory, recursion, or expansion just because they are syntactically valid.

## Cleaners

A cleaner must write a separate output, preserve the primary payload as much as possible, and be followed by a rescan. If safe mutation is unclear, report the finding and leave the file alone.

## Dependencies

A new runtime dependency should solve a real problem, have a compatible license, and come from a maintained upstream. For large or specialized capabilities, an optional adapter may be a better fit than adding the dependency to core.

## Licensing

By submitting a contribution, you agree that your contribution may be distributed under the GNU General Public License v3.0 only (`GPL-3.0-only`).
