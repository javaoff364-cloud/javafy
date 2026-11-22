import os from "node:os";
import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { matchRoute } from "@javafy/core";
import { renderFullstackPage } from "../packages/cli/dist/fullstack.js";

const iterations = Math.max(100, Number.parseInt(process.env.JAVAFY_BENCH_ITERATIONS ?? "5000", 10) || 5000);
const samples = Math.max(3, Number.parseInt(process.env.JAVAFY_BENCH_SAMPLES ?? "5", 10) || 5);
const routes = [
  { path: "/" }, { path: "/about" }, { path: "/users/:id" },
  { path: "/docs/*slug" }, { path: "/assets/*path?" }
];
const manifest = {
  pages: [{
    path: "/bench/:id",
    component: ({ params }) => createElement("main", null,
      createElement("h1", null, "Javafy benchmark"),
      createElement("p", null, params.id)
    ),
    layouts: []
  }],
  apiRoutes: []
};

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samplesMs: values.map((value) => Number(value.toFixed(3))),
    minMs: Number(sorted[0].toFixed(3)),
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
    maxMs: Number(sorted.at(-1).toFixed(3))
  };
}

async function measure(name, operation) {
  for (let index = 0; index < Math.min(1000, iterations); index += 1) await operation(index);
  const durations = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const start = performance.now();
    for (let index = 0; index < iterations; index += 1) await operation(index);
    durations.push(performance.now() - start);
  }
  return { name, iterationsPerSample: iterations, ...summarize(durations) };
}

const results = [
  await measure("route-matching", (index) => {
    matchRoute(index % 2 ? "/users/42" : "/docs/getting-started/routing", routes);
  }),
  await measure("react-ssr", (index) => {
    renderToString(createElement("main", null,
      createElement("h1", null, "Javafy"),
      createElement("p", null, String(index))
    ));
  }),
  await measure("fullstack-page-render", (index) =>
    renderFullstackPage(manifest, "/bench/" + index)
  )
];

const report = {
  benchmark: "javafy-production-baseline",
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? "unknown"
  },
  methodology: {
    warmupIterations: Math.min(1000, iterations),
    samples,
    iterationsPerSample: iterations,
    note: "Times are total milliseconds per sample; compare only on equivalent hardware and Node versions."
  },
  results
};

const json = JSON.stringify(report, null, 2);
if (process.env.JAVAFY_BENCH_OUTPUT) writeFileSync(process.env.JAVAFY_BENCH_OUTPUT, json + "\n");
console.log(json);
