# Architecture

Kalypt is intentionally split into a small set of layers so a CLI, local UI, shell extension, CI action, or future native desktop shell can all consume the same inspection engine.

```text
Input
  │
  ├── file / directory walker
  ├── raw bytes from local UI
  └── nested archive member
  │
  ▼
Type detection
  │
  ▼
Built-in inspectors ─────── Explicit local plugins
  │
  ▼
Normalized findings
  │
  ├── policy adjustment
  ├── baseline suppression
  └── severity threshold
  │
  ▼
Reporters
  ├── terminal
  ├── JSON
  ├── Markdown
  ├── HTML
  └── SARIF

Optional clean path
  Input bytes → conservative cleaner → new bytes → rescan
```

## Core contract

Inspectors do not print, write files, or decide presentation. They emit normalized findings. The finding schema is deliberately small and stable: category, severity, title, explanation, source/path, safe evidence, confidence, tags, and whether a safe cleaner exists.

## Parsers

The current core has zero runtime npm dependencies. JPEG/PNG metadata, ZIP/Open XML packages, ID3, WAV INFO, basic PDF surface indicators, and several generic content checks are implemented in-repo. This keeps the first public release easy to audit and avoids pulling restrictive licenses into the core accidentally.

That does **not** mean every format should ultimately be reimplemented. Richer PDF/media support can live behind adapters where mature libraries or optional system tools make more sense.

## Cleaning model

Detection is intentionally broader than mutation. A detector may report a condition that Kalypt refuses to remove automatically. Cleaners must meet three rules:

1. Never overwrite the source.
2. Modify the narrowest representation possible.
3. Rescan the output before reporting success.

## Hostile input

Every parser should be treated as an attack surface. ZIP processing has entry-count and expanded-size limits. Archive inspection does not extract members onto the filesystem. The local UI limits body size and binds only to the loopback interface.

## Future native desktop shell

The local browser UI proves the interaction model without binding the engine to Electron/Tauri. A future native shell should call the same byte-level and path-level APIs rather than reimplementing inspection logic.
