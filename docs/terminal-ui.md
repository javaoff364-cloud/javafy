# Javafy CLI terminal style

Javafy CLI uses a small built-in terminal formatter; no runtime color dependency is required.

## Output style

- Javafy orange brand heading
- Green check icon for successful actions
- Cyan information icon and highlighted URLs
- Yellow warning and red error icons
- Bold labels, muted secondary details, and readable spacing

## Compatibility

ANSI colors are enabled only for interactive terminals. Set `NO_COLOR=1` to disable colors or `FORCE_COLOR=1` to force them. Plain-text output remains readable without ANSI escape codes.

The formatter only changes CLI presentation. It does not alter program output, HTTP responses, or generated application files.
