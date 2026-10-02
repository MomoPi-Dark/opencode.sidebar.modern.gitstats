# OpenCode Git Status Plugin (`opencode.sidebar.modern.gitstats`)

> **Note**: This plugin is specifically designed for **OpenCode v2** (`>= 2.0.0`) using the modern TUI slot architecture (`context.ui.slot`) and SolidJS (`@opentui/solid`).

A real-time Git status monitor and branch manager widget for the [OpenCode](https://opencode.ai) v2 TUI sidebar.

```text
┌ Git Status ─────────────────────┐
│ Branch   ⎇ main                 │
│ Status   2 modified  [↻]        │
│ Branches [3]                    │
│   ● main (HEAD)                 │
│   ○ feat/user-auth              │
│   ○ fix/alignment               │
└─────────────────────────────────┘
```

---

## Compatibility

- **OpenCode**: `v2.0.0` or higher (OpenCode v1 is not supported due to TUI slot API differences).
- **Runtime**: Bun (`>= 1.0.0`)

---

## Features

- **Active Branch Indicator**: Displays current HEAD branch with truncation for long branch names.
- **Modified File Count**: Shows dirty working directory status and modified file count in real-time.
- **Interactive Branch Switching**: Click on any listed branch to checkout directly from the TUI.
- **Worktree Awareness**: Detects and handles Git worktrees cleanly without throwing runtime conflicts.
- **Debounced Auto-Refresh**: Automatically syncs on filesystem and VCS branch update events.
- **Theme-Aware**: Seamlessly integrates with active OpenCode v2 color schemes.

---

## Installation

### Method 1: Local Plugin Directory (Recommended)

Clone the repository into your OpenCode plugins folder:

```bash
git clone https://github.com/MomoPi-Dark/opencode.sidebar.modern.gitstats.git ~/.config/opencode/plugins/opencode.sidebar.modern.gitstats
```

Install dependencies:

```bash
cd ~/.config/opencode/plugins/opencode.sidebar.modern.gitstats
bun install
```

### Method 2: Configure in `opencode.jsonc`

Add the plugin to your `plugin` array in `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": [
    "opencode.sidebar.modern.gitstats"
  ]
}
```

---

## Development & Testing

Run unit tests:

```bash
bun test.ts
```

Validate build:

```bash
bun run build
```

---

## License

[MIT](./LICENSE) © 2026 Gamflaz
