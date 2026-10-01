# Security policy

Kalypt processes files that may be malformed, private, or intentionally hostile. Please report security problems privately when public disclosure could put users at risk.

## Security boundaries

- The CLI performs no network requests.
- The local UI binds to `127.0.0.1` and sends selected files only to the local Kalypt process.
- Built-in cleaners never overwrite the source file.
- ZIP members are inspected in memory instead of being extracted to disk.
- Archive recursion, entry count, and expanded-size limits are enforced.
- Built-in secret findings redact credential evidence.
- Plugins are never auto-loaded. `--plugin` executes explicitly trusted local code with the same permissions as Kalypt.

## What Kalypt is not

Kalypt is a file inspector, not a malware sandbox or antivirus engine. It does not claim that a file is safe to execute or open. It does not execute Office macros, PDF JavaScript, scripts discovered in archives, or embedded executables.

## Reporting a vulnerability

Use GitHub's private security-advisory flow for this repository when possible. Please include the affected version, file type or code path, reproduction steps, and the security impact. Avoid attaching genuinely sensitive user data when a minimal synthetic fixture will reproduce the problem.
