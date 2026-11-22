# CLI terminal UI

The Javafy CLI uses a built-in terminal formatter without adding a runtime dependency.

- Orange Javafy brand heading
- Green success, cyan information, yellow warning and red error symbols
- Bold headings, muted secondary labels and underlined URLs
- Plain-text fallback when color is unavailable

Set `NO_COLOR=1` to disable ANSI styling or `FORCE_COLOR=1` to force it. Output remains readable in terminals without color support.
