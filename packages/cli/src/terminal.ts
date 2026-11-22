const isColorEnabled =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== "dumb" &&
  (Boolean(process.stdout.isTTY) || process.env.FORCE_COLOR !== undefined);

function paint(code: string, value: string): string {
  return isColorEnabled ? "\u001b[" + code + "m" + value + "\u001b[0m" : value;
}

const icons = { brand: "✦", success: "✓", error: "✖", warning: "⚠", info: "ℹ", bullet: "›" };

export const terminal = {
  title(value: string): void {
    console.log("\n" + paint("1;38;5;208", icons.brand + " Javafy") + " " + paint("2", value));
  },
  success(value: string): void {
    console.log(paint("1;32", icons.success) + " " + value);
  },
  info(value: string): void {
    console.log(paint("1;36", icons.info) + " " + value);
  },
  step(value: string): void {
    console.log("  " + paint("38;5;208", icons.bullet) + " " + value);
  },
  warning(value: string, detail?: unknown): void {
    console.warn(paint("1;33", icons.warning) + " " + value);
    if (detail !== undefined) console.warn(detail);
  },
  error(value: string, detail?: unknown): void {
    console.error(paint("1;31", icons.error) + " " + value);
    if (detail !== undefined) console.error(detail);
  },
  url(label: string, value: string): void {
    console.log("  " + paint("2", label) + " " + paint("4;36", value));
  },
  bold(value: string): string {
    return paint("1", value);
  },
  enabled(value: boolean, yes = "enabled", no = "not detected"): string {
    return value ? paint("32", yes) : paint("2", no);
  }
};
