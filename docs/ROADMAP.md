# Roadmap

## Batch 1 — Core engine and CLI — complete

- [x] Normalized findings schema
- [x] Content-signature detection
- [x] Recursive filesystem scanner
- [x] JPEG/PNG metadata inspection and stripping
- [x] PDF surface inspection
- [x] Office Open XML inspection
- [x] Office metadata clean-copy generation
- [x] ZIP parser/writer and archive safety limits
- [x] Secret/local-path/email rules
- [x] Git repository metadata checks
- [x] Text/JSON/Markdown reports
- [x] CI threshold mode
- [x] Tests and cross-platform CI

## Batch 2 — Deep inspection and remediation — substantially complete

- [x] Recursive nested ZIP archives
- [x] Git-history blob secret scanning with bounded object traversal
- [x] Git-tracked-only source/share mode
- [x] ID3/MP4/WAV metadata inspectors
- [x] MP3/WAV metadata cleaners
- [x] Policy profiles (`public`, `source-release`, `job-application`, `photo-share`)
- [x] Baselines with portable finding fingerprints
- [x] SARIF output for GitHub code scanning
- [x] Self-contained HTML reports
- [x] Entropy-assisted generic secret filtering
- [x] Symlink analysis for folder-share boundaries
- [ ] Full PDF object parser adapter and safe PDF metadata cleaner
- [ ] Office comment/note removal with relationship repair
- [ ] Richer Office macro-signature and external-relationship details
- [ ] Configurable PII rule packs

## Batch 3 — UI and integrations — substantially complete

- [x] Local drag-and-drop UI powered by the same engine
- [x] Multi-file queue and finding cards
- [x] Policy switching in UI
- [x] Clean-copy download with automatic post-clean verification
- [ ] Windows Explorer context-menu integration
- [x] Git pre-push hook
- [x] GitHub composite Action
- [x] Explicit local inspector-plugin API
- [x] Release package workflow
- [x] Security, architecture, contribution, and plugin documentation
- [ ] Native desktop shell / signed installers
- [ ] macOS Finder Quick Action
- [ ] Linux file-manager integrations
- [ ] Third-party plugin cleaners with capability permissions
- [ ] Localization-ready message catalog
- [ ] Signed update channel

## Batch 4 — Hardening and breadth

- [ ] Fuzz/property tests for binary parsers
- [ ] ZIP64 support and additional archive formats through optional adapters
- [ ] HEIC/AVIF metadata support
- [ ] Rich MP4 atom parsing and safe cleaning
- [ ] PDF sanitization adapter with explicit dependency/capability detection
- [ ] Office relationship-aware removal of comments, notes, and hidden content
- [ ] GitHub code-scanning upload example workflow
- [ ] Config file and project-level ignore/allow rules
- [ ] Machine-readable capability registry
- [ ] Performance benchmarks and large-tree streaming mode
- [ ] Native packaging proof of concept
