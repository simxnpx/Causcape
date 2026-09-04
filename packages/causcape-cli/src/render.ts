import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright-core";

import type { Project } from "@causcape/core";

const renderBundlePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "render/render.js",
);

export const evaluateProjectRenderer = (
  page: Pick<Page, "evaluate">,
  project: Project,
) =>
  page.evaluate(async (input) => {
    const renderer = (
      window as typeof window & {
        renderCauscapeProject(project: Project): Promise<string>;
      }
    ).renderCauscapeProject;
    return renderer(JSON.parse(input) as Project);
  }, JSON.stringify(project));

export const renderProject = async (
  project: Project,
  options: { executablePath: string; format: "svg" | "png" },
): Promise<string | Buffer> => {
  await readFile(renderBundlePath);
  const browser = await chromium.launch({
    executablePath: options.executablePath,
    headless: true,
  });
  try {
    // SVG export already applies the project's export scale. Doubling it
    // again can exceed Chromium's raster limits on wide architecture canvases.
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ path: renderBundlePath });
    const svg = await evaluateProjectRenderer(page, project);
    if (options.format === "svg") {
      return svg;
    }
    await page.setContent(
      `<!doctype html><html><body style="margin:0;display:inline-block">${svg}</body></html>`,
    );
    return await page.locator("svg").screenshot({ type: "png" });
  } finally {
    await browser.close();
  }
};
