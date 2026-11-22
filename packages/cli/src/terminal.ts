const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;

type Style = (value: string) => string;
type TableRow = readonly (string | number | boolean | null | undefined)[];

const codes = {
  reset: "0", bold: "1", dim: "2", italic: "3", underline: "4",
  black: "30", red: "31", green: "32", yellow: "33", blue: "34",
  magenta: "35", cyan: "36", white: "37", gray: "90",
  orange: "38;5;208", brightCyan: "96", brightGreen: "92",
  brightYellow: "93", brightRed: "91"
} as const;

function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) {
    return process.env.FORCE_COLOR !== "0" && process.env.FORCE_COLOR !== "false";
  }
  return process.env.TERM !== "dumb" && Boolean(process.stdout.isTTY);
}

function style(code: string): Style {
  return (value: string) => colorEnabled()
    ? "\u001b[" + code + "m" + value + "\u001b[0m"
    : value;
}

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

const paint = {
  bold: style(codes.bold),
  dim: style(codes.dim),
  italic: style(codes.italic),
  underline: style(codes.underline),
  orange: style(codes.orange),
  cyan: style(codes.cyan),
  green: style(codes.green),
  yellow: style(codes.yellow),
  red: style(codes.red),
  gray: style(codes.gray),
  magenta: style(codes.magenta),
  blue: style(codes.blue)
};

function visibleLength(value: string): number {
  return [...stripAnsi(value)].length;
}

function cell(value: string | number | boolean | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function padVisible(value: string, width: number): string {
  return value + " ".repeat(Math.max(0, width - visibleLength(value)));
}

export const symbols = {
  success: "✓",
  error: "✖",
  warning: "⚠",
  info: "ℹ",
  bullet: "•",
  pointer: "›",
  line: "─",
  branch: "├",
  corner: "└"
} as const;

export const terminal = {
  get supportsColor(): boolean { return colorEnabled(); },
  get isInteractive(): boolean { return Boolean(process.stdin.isTTY && process.stdout.isTTY); },
  symbols,

  title(value: string): void {
    console.log("\n" + paint.orange(paint.bold("✦ Javafy")) + " " + paint.dim(value));
  },
  subtitle(value: string): void { console.log(paint.dim(value)); },
  section(value: string): void {
    console.log("\n" + paint.bold(value));
    console.log(paint.dim("─".repeat(Math.max(8, Math.min(48, visibleLength(value))))));
  },
  divider(label?: string): void {
    const line = "─".repeat(32);
    console.log(label ? paint.dim("── " + label + " " + "─".repeat(Math.max(2, 28 - visibleLength(label)))) : paint.dim(line));
  },
  success(value: string): void { console.log(paint.green(paint.bold("✓")) + " " + value); },
  info(value: string): void { console.log(paint.cyan(paint.bold("ℹ")) + " " + value); },
  step(value: string): void { console.log("  " + paint.orange("›") + " " + value); },
  bullet(value: string): void { console.log("  " + paint.gray("•") + " " + value); },
  warning(value: string, detail?: unknown): void {
    console.warn(paint.yellow(paint.bold("⚠")) + " " + value);
    if (detail !== undefined) console.warn(detail);
  },
  error(value: string, detail?: unknown): void {
    console.error(paint.red(paint.bold("✖")) + " " + value);
    if (detail !== undefined) console.error(detail);
  },
  debug(value: string): void { console.log(paint.magenta("◆") + " " + paint.dim(value)); },

  badge(value: string, tone: "success" | "info" | "warning" | "error" | "muted" = "muted"): string {
    const format = tone === "success" ? paint.green
      : tone === "info" ? paint.cyan
      : tone === "warning" ? paint.yellow
      : tone === "error" ? paint.red
      : paint.gray;
    return format("[" + value + "]");
  },
  keyValue(label: string, value: string | number | boolean): void {
    console.log("  " + paint.dim(label.padEnd(16)) + " " + value);
  },
  list(items: readonly string[]): void {
    items.forEach((item, index) => {
      const last = index === items.length - 1;
      console.log(paint.gray(last ? "  └" : "  ├") + " " + item);
    });
  },
  table(headers: readonly string[], rows: readonly TableRow[]): void {
    if (headers.length === 0) return;
    const values = rows.map((row) => headers.map((_, index) => cell(row[index])));
    const widths = headers.map((header, index) =>
      Math.max(visibleLength(header), ...values.map((row) => visibleLength(row[index] ?? "")))
    );
    const render = (row: readonly string[]) =>
      "  " + row.map((value, index) => padVisible(value, widths[index] ?? 0)).join("  ");
    console.log(paint.bold(render(headers)));
    console.log(paint.dim("  " + widths.map((width) => "─".repeat(width)).join("  ")));
    values.forEach((row) => console.log(render(row)));
  },
  progress(current: number, total: number, label = "Progress", width = 24): void {
    const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
    const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
    const ratio = safeTotal ? Math.min(1, safeCurrent / safeTotal) : 0;
    const filled = Math.round(ratio * Math.max(1, width));
    const bar = paint.green("█".repeat(filled)) + paint.gray("░".repeat(Math.max(0, width - filled)));
    const percent = Math.round(ratio * 100);
    console.log("  " + bar + " " + paint.bold(String(percent) + "%") + " " + paint.dim(label));
  },
  url(label: string, value: string): void {
    const hyperlink = colorEnabled() && process.env.TERM !== "dumb"
      ? "\u001b]8;;" + value + "\u0007" + paint.underline(paint.cyan(value)) + "\u001b]8;;\u0007"
      : value;
    console.log("  " + paint.dim(label) + " " + hyperlink);
  },
  link(value: string, url: string): string {
    return colorEnabled() && process.env.TERM !== "dumb"
      ? "\u001b]8;;" + url + "\u0007" + paint.underline(paint.cyan(value)) + "\u001b]8;;\u0007"
      : value + " (" + url + ")";
  },
  code(value: string): string { return paint.cyan("`" + value + "`"); },
  quote(value: string): void {
    for (const line of value.split("\n")) console.log("  " + paint.gray("│") + " " + line);
  },
  newline(): void { console.log(); },
  muted(value: string): string { return paint.dim(value); },
  bold(value: string): string { return paint.bold(value); },
  italic(value: string): string { return paint.italic(value); },
  underline(value: string): string { return paint.underline(value); },
  enabled(value: boolean): string { return value ? paint.green("enabled") : paint.gray("not detected"); }
};
