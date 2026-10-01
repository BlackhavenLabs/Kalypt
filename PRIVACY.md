# Privacy

Kalypt is built around a simple rule:

> **Your files never leave your device. Neither do your scan results.**

Kalypt does not have a file-processing service, user account system, telemetry endpoint, analytics collector, or training-data pipeline. The project does not need any of those things to inspect a file.

## Local use

When you use the CLI, Kalypt reads files from your machine and processes them locally. The CLI does not make network requests.

When you use the local UI, Kalypt starts a server bound to `127.0.0.1`. The browser sends selected file bytes to that local process only. Scan results stay in the local UI unless you explicitly export them.

Cleaners create a new file or browser download. They do not overwrite the original.

## What Kalypt stores

Kalypt does not maintain a database or background cache of scans.

A report is written only when you ask Kalypt to export one. A clean copy is written only when you ask Kalypt to create one. Those files remain wherever you choose to save them.

Archive members are inspected in memory rather than extracted into a working directory.

## GitHub Actions

If you run Kalypt in GitHub Actions, your repository is already present on a GitHub-hosted or self-hosted runner. Kalypt inspects that checkout on the runner; it does not send the files or findings to a Kalypt service because no such service exists.

Your workflow can still choose to upload a report as an artifact or send it somewhere else. That is controlled by the workflow, not by Kalypt.

## Plugins

Plugins are different. A plugin is explicitly loaded local code and runs with the same permissions as Kalypt. A plugin can make network requests if its author wrote it to do so. Kalypt never downloads or auto-loads plugins.

## Telemetry and training

There is no usage telemetry and no opt-in training checkbox because Kalypt does not collect user files or scan results in the first place. Nothing is retained by Blackhaven Labs for model training or any other purpose.

If a future feature would require sending user data off-device, it must be separate, clearly disclosed, and explicitly opt-in. It must not change the default local-only behavior.
