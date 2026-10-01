<p align="center">
  <img src="assets/brand/kalypt-banner.png" alt="Kalypt — See what you're really sharing" width="100%">
</p>

# Kalypt

**See what you're really sharing.**

Files carry baggage. Photos can contain GPS coordinates and device details. Office documents can keep author names, comments, speaker notes, hidden sheets, and external links. Repositories can carry local paths, old credentials, and secrets that were deleted from the working tree but still live in Git history.

Kalypt checks for that stuff **locally, before you share it**.

> **Your files never leave your device. Neither do your scan results.**

No account. No upload service. No background daemon. When Kalypt can clean something safely, it writes a new copy and leaves the original alone.

> **Status:** `0.3.0` is an early public build. The core scanner, cleaners, CLI, local UI, Git integration, policies, baselines, plugin API, reports, tests, and CI are working. Some format support is intentionally conservative; see the [roadmap](docs/ROADMAP.md).

## Try it

Kalypt currently requires Node.js 20 or newer. Until packaged releases are published, clone the repo and run it directly:

```bash
git clone https://github.com/BlackhavenLabs/Kalypt.git
cd Kalypt
npm link

kalypt ./something-you-plan-to-share
```

Or without linking the command:

```bash
node ./bin/kalypt.js scan ./something-you-plan-to-share
```

A scan prints findings with severity, evidence, source, and whether Kalypt has a safe cleaner for them.

```text
Kalypt scan: resume.docx

HIGH    Author identity
        Document creator metadata contains a personal identity.

MEDIUM  Comments present
        The document contains comment data that may travel with the file.

2 findings · 1 removable
```

## Local UI

```bash
kalypt ui
```

That opens the drag-and-drop UI on `127.0.0.1`. Files selected in the browser are sent only to the local Kalypt process.

The UI can inspect multiple files, switch policy profiles, export JSON, and create clean copies for supported formats. Clean output is scanned again before download.

## What Kalypt looks for

| Area | Current checks |
| --- | --- |
| **Images** | EXIF, GPS, device/lens details, timestamps, software, author/copyright, PNG text chunks |
| **Office** | Creator/editor identity, timestamps, custom properties, comments, speaker notes, hidden Excel sheets, external links, embedded objects, VBA, custom XML |
| **PDF** | Document metadata, XMP, embedded-file indicators, JavaScript, open actions, encryption, visible local paths and credential candidates |
| **Media** | MP3 ID3, WAV `INFO`, MP4/MOV metadata-key indicators including location/device-related keys |
| **Archives** | Nested ZIPs, path traversal, sensitive filenames, entry/expanded-size limits |
| **Source repos** | Common credentials, private keys, local paths, emails, Git remotes/authors, sensitive tracked files, dirty trees, `.env` handling, bounded Git-history secret scans |
| **Generic files** | Content-signature detection, hashes, text/string inspection, symlink/share-boundary warnings |

Kalypt does not pretend every finding can be safely removed. Detection is broader than cleaning on purpose.

## Clean copies

Supported built-in cleaners currently include JPEG, PNG, DOCX, XLSX, PPTX, MP3, and WAV.

```bash
kalypt clean photo.jpg
kalypt clean resume.docx --output resume.safe.docx
```

Built-in cleaners follow three rules:

1. Never overwrite the source.
2. Change as little as possible.
3. Scan the output again.

PDF inspection exists today, but Kalypt does **not** yet claim safe general-purpose PDF sanitization.

## Policies

Different things are risky in different contexts, so scans can use a policy profile:

```bash
kalypt scan ./release --policy source-release
kalypt scan ./resume.docx --policy job-application
kalypt scan ./photos --policy photo-share
```

Built-in policies:

- `public`
- `source-release`
- `job-application`
- `photo-share`

## Baselines and CI

Known findings can be captured in a portable baseline:

```bash
kalypt baseline ./project --output .kalypt-baseline.json
kalypt scan ./project --baseline .kalypt-baseline.json --fail-on high
```

`--fail-on` exits with code `2` when a finding reaches the configured severity, which makes Kalypt usable as a release gate.

Reports can be written as terminal text, JSON, Markdown, HTML, or SARIF 2.1.0:

```bash
kalypt scan ./repo --format sarif --output kalypt.sarif
kalypt scan archive.zip --format html --output report.html
```

This repository also ships a reusable composite GitHub Action in [`action.yml`](action.yml).

## Git pre-push hook

```bash
kalypt hook install
```

The hook checks Git-tracked source with the `source-release` policy before a push. Remove it with:

```bash
kalypt hook remove
```

## Plugins

Local inspection plugins can add project-specific checks without changing Kalypt core:

```bash
kalypt scan ./thing --plugin ./examples/plugins/suspicious-filename.mjs
```

Plugins are explicit and trusted code. Kalypt never downloads or auto-discovers them. See [Plugins](docs/PLUGINS.md).

## A few design choices

- **Local first.** Inspection should not require handing private files to another service.
- **Explain findings.** A warning should say what was found and why it matters.
- **Keep evidence safe.** Secret findings redact credentials instead of copying them into reports.
- **Trust content over extensions.** Renaming a file should not defeat basic type detection.
- **Treat parsers as attack surfaces.** Archive limits and conservative failure modes are part of the design.
- **Detect broadly; mutate narrowly.** Kalypt would rather tell you about something it cannot safely remove than make a risky edit.

The engine, CLI, local UI, Git hooks, plugins, and CI all use the same normalized finding model. More detail is in [Architecture](docs/ARCHITECTURE.md).

## Development

```bash
npm test
npm run lint
npm run pack:check
node ./bin/kalypt.js scan . --policy source-release --no-git-history --fail-on high
```

That last command is Kalypt checking its own repository with the same source-release policy intended for CI and release gates.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Plugins](docs/PLUGINS.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE).
