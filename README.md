# Jinni (For GNOME)

A quick access task manager for the GNOME Shell top bar. Click the indicator, type a task, hit Enter — no windows to manage, no context switch.

## Features

- Add, edit, and delete tasks from a small dropdown in the top bar
- Drag and drop to reorder tasks
- Optional hover previews for long task text
- Optional persistence across GNOME Shell restarts
- Configurable window width, preview size, and hover delay in Preferences

## Requirements

GNOME Shell 45 or later.

## Installation

Install from [extensions.gnome.org](https://extensions.gnome.org/) (search "Jinni"), or manually from a clone of this repo (run from the repo root, not from inside `jinni@udqu.github.io/`):

```bash
gnome-extensions pack jinni@udqu.github.io
gnome-extensions install jinni@udqu.github.io.shell-extension.zip
```

Then log out and back in, and enable it in the Extensions app (or `gnome-extensions enable jinni@udqu.github.io`).

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
