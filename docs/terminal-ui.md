# CLI terminal UI

Javafy includes a zero-dependency terminal presentation layer. It keeps output readable in plain logs and adds richer styling in capable terminals.

## Output components

- Javafy brand title, section headings and dividers
- Semantic success, info, warning, error and debug messages
- Status badges, key/value summaries and tree-style lists
- Aligned tables that account for ANSI escape sequences
- Progress bars with bounded percentages
- Underlined links and OSC 8 clickable hyperlinks where supported
- Inline code, quotes, muted text, bold, italic and underline helpers

## Color and accessibility

- Colors are enabled automatically only when stdout is a TTY.
- `NO_COLOR=1` disables styling, including when `FORCE_COLOR` is also set.
- `FORCE_COLOR=1` enables styling in CI and redirected output.
- `FORCE_COLOR=0` disables styling.
- `TERM=dumb` disables automatic styling.
- Plain output never depends on ANSI codes to convey meaning; symbols and labels remain visible.

## Example

```ts
import { terminal } from "@javafy/cli/terminal";

terminal.title("development server");
terminal.section("Server");
terminal.success("Javafy is ready");
terminal.keyValue("Environment", "development");
terminal.url("Local", "http://localhost:3000");
terminal.progress(3, 4, "Building");
terminal.table(["Route", "Status"], [["/", "ready"], ["/about", "ready"]]);
```

The formatter is also tested for color-off, forced-color, table, progress, and plain-text behavior.
