# Live Change Follower

Watch your terminal-based coding agents work in real-time. Multi-file follow mode, timeline with diff previews, and a diagnostics bridge so CLI agents can see LSP/linter errors.

## Acknowledgments

This extension is a fork of **[File Change Follower](https://github.com/DamianEdwards/vsc-change-agent-watch)** by [Damian Edwards](https://github.com/DamianEdwards). 

Many thanks to Damian for creating the original extension and releasing it under the MIT license. This fork builds on that foundation with additional features:

- Multi-file tracking (configurable window of N recent files)
- Timeline webview with mini-diff previews
- Diagnostics bridge: writes LSP/linter errors to JSON for CLI agents
- Configurable editor column for followed files
- Bug fixes for Apple Silicon Macs

If you find this extension useful, please consider starring both [this repository](https://github.com/MikeHLee/live-change-follower) and the [original project](https://github.com/DamianEdwards/vsc-change-agent-watch).

## Features

### Multi-File Following
Unlike single-file followers, Live Change Follower tracks multiple recently-changed files simultaneously, opening them in a configurable editor column so you can see the full scope of agent activity.

### Timeline with Diff Preview
The playback timeline shows all recorded events with:
- File path and event type (edit/create/delete)
- Line numbers affected
- Code snippet preview of the change
- Click any event to jump to that point

### Diagnostics Bridge
Terminal-based agents (aider, OpenCode, etc.) can't see VS Code's LSP/linter errors. This extension writes diagnostics to a JSON file your agent can read:

```json
{
  "updatedAt": "2026-04-23T16:30:00.000Z",
  "workspaceRoot": "/path/to/project",
  "totals": { "error": 2, "warning": 5, "info": 0, "hint": 0 },
  "files": {
    "src/foo.ts": [
      { "line": 42, "column": 10, "severity": "error", "message": "Cannot find name 'x'.", "source": "ts" }
    ]
  }
}
```

Agent example usage:
```bash
# Read diagnostics
cat .vscode/agent-diagnostics.json

# Check for errors before committing
jq '.totals.error' .vscode/agent-diagnostics.json
```

## Installation

### From VS Code Marketplace
Search for "Live Change Follower" in the Extensions panel or run:
```
code --install-extension MikeHLee.live-change-follower
```

### From VSIX (local)
```bash
code --install-extension live-change-follower-0.4.0.vsix
```

### From Source
```bash
git clone https://github.com/MikeHLee/live-change-follower
cd live-change-follower
npm install
npm run compile
npx vsce package
code --install-extension live-change-follower-0.4.0.vsix
```

## Commands

| Command | Description |
|---------|-------------|
| `Live Change Follower: Toggle Follow Mode` | Enable/disable file following |
| `Live Change Follower: Toggle Diagnostics Bridge` | Enable/disable diagnostics output |
| `Live Change Follower: Flush Diagnostics to File` | Force immediate write of diagnostics |
| `Live Change Follower: Show Timeline Panel` | Open the timeline webview |
| `Live Change Follower: Start/Stop Recording` | Record a session for playback |
| `Live Change Follower: Play/Pause/Stop Playback` | Controls for recorded sessions |

## Configuration

### Follow Mode

| Setting | Default | Description |
|---------|---------|-------------|
| `liveChangeFollower.enabled` | `false` | Enable follow mode on startup |
| `liveChangeFollower.maxTrackedFiles` | `3` | Number of recent files to keep open |
| `liveChangeFollower.openInColumn` | `"beside"` | Editor column for followed files |
| `liveChangeFollower.debounceMs` | `150` | Debounce interval for rapid changes |
| `liveChangeFollower.highlightDuration` | `2000` | ms to highlight changed lines |
| `liveChangeFollower.includePatterns` | `["**/*"]` | Glob patterns to include |
| `liveChangeFollower.excludePatterns` | `[...]` | Glob patterns to exclude |
| `liveChangeFollower.respectGitignore` | `true` | Honor .gitignore patterns |
| `liveChangeFollower.disableOnManualEdit` | `true` | Auto-disable when user edits |

### Diagnostics Bridge

| Setting | Default | Description |
|---------|---------|-------------|
| `liveChangeFollower.diagnosticsBridge.enabled` | `true` | Write diagnostics to file |
| `liveChangeFollower.diagnosticsBridge.outputPath` | `.vscode/agent-diagnostics.json` | Output file path |
| `liveChangeFollower.diagnosticsBridge.severities` | `["error", "warning"]` | Severities to include |
| `liveChangeFollower.diagnosticsBridge.debounceMs` | `500` | Debounce for file writes |
| `liveChangeFollower.diagnosticsBridge.includeSource` | `true` | Include diagnostic source (ts, eslint, etc.) |

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

MIT - See [LICENSE](LICENSE) for details.
