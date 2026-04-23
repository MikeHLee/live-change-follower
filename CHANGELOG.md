# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0] - 2026-04-23

### Added
- **Multi-file tracking**: Track up to N recently changed files simultaneously (configurable via `maxTrackedFiles` setting)
- **Configurable editor column**: Open followed files in a specific column via `openInColumn` setting
- **Timeline with diff preview**: Upgraded timeline webview to show event list with file path, type, line numbers, and code snippets
- **Diagnostics bridge**: Write LSP/linter diagnostics to `.vscode/agent-diagnostics.json` so terminal-based agents can read errors they can't see
- New commands: `Toggle Diagnostics Bridge`, `Flush Diagnostics to File`
- New settings for diagnostics bridge: `outputPath`, `severities`, `debounceMs`, `includeSource`

### Fixed
- Fixed unhandled promise rejection in debounce function that caused the extension to silently fail after the first file change (particularly affecting Apple Silicon Macs)
- Added early exit checks in `showChange` to prevent operations on disposed editors

### Changed
- Forked from [File Change Follower](https://github.com/DamianEdwards/vsc-change-agent-watch) by Damian Edwards
- Rebranded as "Live Change Follower"
- Changed command prefix from `fileChangeFollower.*` to `liveChangeFollower.*`
- Changed settings prefix from `fileChangeFollower.*` to `liveChangeFollower.*`

---

## Original Project Changelog

The following entries are from the original [File Change Follower](https://github.com/DamianEdwards/vsc-change-agent-watch) project:

## [0.3.2] - 2026-02-07

### Fixed
- Prevent auto-disable on external file changes

## [0.3.1] - 2026-02-07

### Changed
- Updated icon to 256x256

## [0.3.0] - 2026-01-XX

### Added
- Recording and playback functionality
- Timeline panel
- Live delay mode

## [0.2.1] - 2026-01-XX

### Fixed
- Extension failing to load due to missing ignore package

## [0.2.0] - 2026-01-XX

### Added
- Option to respect .gitignore patterns

## [0.1.0] - 2025-XX-XX

### Added
- Initial release
- Real-time file following
- Change highlighting
- Status bar integration
