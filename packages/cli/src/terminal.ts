const color = (code: string, value: string): string => {
  const enabled = process.env.NO_COLOR === undefined && process.env.TERM !== "dumb" &&
    (Boolean(process.stdout.isTTY) || process.env.FORCE_COLOR !== undefined);
  return enabled ? "\u001b[" + code + "m" + value + "\u001b[0m" : value;
};

export const terminal = {
  title(value: string): void { console.log("\n" + color("1;38;5;208", "✦ Javafy") + " " + color("2", value)); },
  success(value: string): void { console.log(color("1;32", "✓") + " " + value); },
  info(value: string): void { console.log(color("1;36", "ℹ") + " " + value); },
  step(value: string): void { console.log("  " + color("38;5;208", "›") + " " + value); },
  warning(value: string, detail?: unknown): void { console.warn(color("1;33", "⚠") + " " + value); if (detail !== undefined) console.warn(detail); },
  error(value: string, detail?: unknown): void { console.error(color("1;31", "✖") + " " + value); if (detail !== undefined) console.error(detail); },
  url(label: string, value: string): void { console.log("  " + color("2", label) + " " + color("4;36", value)); },
  muted(value: string): string { return color("2", value); },
  bold(value: string): string { return color("1", value); },
  enabled(value: boolean): string { return value ? color("32", "enabled") : color("2", "not detected"); }
};
