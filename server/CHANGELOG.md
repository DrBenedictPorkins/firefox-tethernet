# Changelog

## [1.0.0] - 2025-12-25

### Added - CLI and Daemon Mode

#### New Files
- **`src/cli.ts`** - CLI entry point with commander.js
  - `start` command with `-f/--foreground` option
  - `stop` command
  - `status` command with health check
  - `restart` command
  - `logs` command with `-f/--follow` and `-n/--lines` options
  - PID management in `~/.foxhole/foxhole.pid`
  - Log management in `~/.foxhole/foxhole.log`

- **`CLI.md`** - Comprehensive CLI documentation
  - Installation instructions (local and global via npm link)
  - Command reference with examples
  - Integration with Claude Code MCP
  - Troubleshooting guide

#### Modified Files
- **`src/index.ts`** - Added daemon mode support
  - Writes PID file when `FOXHOLE_DAEMON=1` env var is set
  - Cleans up PID file on exit

- **`package.json`** - Updated for CLI support
  - Added `bin` entry: `"foxhole": "./dist/cli.js"`
  - Added `commander` dependency (^12.0.0)
  - Updated scripts:
    - `start`: Now runs CLI in foreground
    - `dev`: Runs CLI with tsx watch
    - `foxhole`: Direct CLI invocation

- **`README.md`** - Added CLI usage section
  - Quick start updated to include CLI
  - New "CLI Usage" section with examples
  - Development section updated

- **`CLAUDE.md`** - Added CLI documentation
  - Command reference updated
  - New "CLI Details" section

### Features

#### Daemon Mode
- Server runs in background until explicitly stopped
- Survives terminal closure
- Logs written to `~/.foxhole/foxhole.log`
- PID tracking prevents multiple instances
- Graceful shutdown via SIGTERM

#### Foreground Mode
- Logs to stdout (for development and MCP integration)
- Ctrl+C graceful shutdown
- Compatible with Claude Code child process mode

#### Status Monitoring
- Check if server is running with PID
- Health endpoint integration (`/health`)
- Shows extension connection status
- Exit code 0/1 for scripting

#### Log Management
- View last N lines
- Follow logs in real-time (`-f`)
- Persisted in `~/.foxhole/` directory

### Technical Details

#### PID Management
- Directory: `~/.foxhole/`
- PID file: `~/.foxhole/foxhole.pid`
- Log file: `~/.foxhole/foxhole.log`
- Stale PID detection (process.kill(pid, 0))
- Automatic cleanup

#### Port Conflict Handling
- Checks port 19888 availability before start
- Reports error if port in use
- Does NOT auto-kill (prevents accidental service disruption)

#### Process Spawning
- Uses `spawn` with `detached: true`
- `unref()` for process independence
- Separate stdout/stderr to log file
- Environment variable: `FOXHOLE_DAEMON=1`

### Backward Compatibility

All existing functionality preserved:
- MCP integration unchanged (can still run as child process)
- Extension WebSocket unchanged
- All tools and APIs unchanged
- Configuration unchanged

### Installation

```bash
cd server
npm install
npm run build
```

### Usage

```bash
# Local
node dist/cli.js start

# Global (after npm link)
foxhole start
```

### Testing Performed

- ✅ CLI compiles with TypeScript
- ✅ Shebang preserved in dist/cli.js
- ✅ Status command works (exit 1 when not running)
- ✅ Help output displays correctly
- ✅ PID directory created automatically
- ✅ File permissions correct (755 for cli.js)
- ✅ npm scripts updated and functional
