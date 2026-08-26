import { build } from "esbuild";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(packageDirectory, "../..");
const packageSources = {
  "@causcape/core": "causcape-core",
  "@excalidraw/common": "common",
  "@excalidraw/element": "element",
  "@excalidraw/excalidraw": "excalidraw",
  "@excalidraw/fractional-indexing": "fractional-indexing",
  "@excalidraw/laser-pointer": "laser-pointer",
  "@excalidraw/math": "math",
  "@excalidraw/utils": "utils",
};

const resolveSource = (basePath) => {
  for (const candidate of [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    resolve(basePath, "index.ts"),
    resolve(basePath, "index.tsx"),
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const workspaceSources = {
  name: "workspace-sources",
  setup(buildApi) {
    buildApi.onResolve({ filter: /^@(causcape|excalidraw)\// }, (args) => {
      const matchingPackage = Object.keys(packageSources)
        .sort((left, right) => right.length - left.length)
        .find(
          (packageName) =>
            args.path === packageName ||
            args.path.startsWith(`${packageName}/`),
        );
      if (!matchingPackage) {
        return null;
      }
      const subpath = args.path.slice(matchingPackage.length + 1);
      const source = resolveSource(
        resolve(
          repositoryDirectory,
          "packages",
          packageSources[matchingPackage],
          "src",
          subpath || "index",
        ),
      );
      return source ? { path: source } : null;
    });
    // CLI renders use system fonts; inlining the complete Excalidraw font set
    // would make the headless-only bundle unnecessarily large.
    buildApi.onLoad({ filter: /\.woff2$/ }, () => ({
      contents: 'export default "";',
      loader: "js",
    }));
  },
};

await mkdir(resolve(packageDirectory, "dist/render"), { recursive: true });

await Promise.all([
  build({
    entryPoints: [resolve(packageDirectory, "src/cli.ts")],
    outfile: resolve(packageDirectory, "dist/cli.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    plugins: [workspaceSources],
    external: ["playwright-core"],
    define: {
      "import.meta.env": JSON.stringify({
        MODE: "production",
        DEV: false,
        PROD: true,
      }),
    },
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: true,
  }),
  build({
    entryPoints: [resolve(packageDirectory, "src/render-entry.ts")],
    outfile: resolve(packageDirectory, "dist/render/render.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "chrome120",
    plugins: [workspaceSources],
    define: {
      "import.meta.env": JSON.stringify({
        MODE: "production",
        DEV: false,
        PROD: true,
        PKG_NAME: "@causcape/cli",
        PKG_VERSION: "0.1.0",
        VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX: false,
      }),
      "process.env.NODE_ENV": '"production"',
    },
    sourcemap: false,
  }),
]);
