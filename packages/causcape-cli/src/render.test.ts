import { afterEach, describe, expect, it, vi } from "vitest";

import { createProjectFromTemplate } from "@causcape/core";

import { evaluateProjectRenderer } from "./render";

describe("Causcape headless rendering", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "renderCauscapeProject");
  });

  it("evaluates the browser renderer instead of serializing its function", async () => {
    const project = createProjectFromTemplate({
      id: "render-project",
      title: "Render project",
      template: "blank",
      occurredAt: "2026-08-26T10:00:00.000Z",
      provenance: {
        actor: { type: "agent" },
        channel: "cli",
      },
    });
    const renderer = vi.fn(async () => '<svg data-project="render-project"/>');
    (
      window as typeof window & {
        renderCauscapeProject: typeof renderer;
      }
    ).renderCauscapeProject = renderer;
    const page = {
      evaluate: vi.fn(async (callback, input) => callback(input)),
    } as unknown as Parameters<typeof evaluateProjectRenderer>[0];

    await expect(evaluateProjectRenderer(page, project)).resolves.toBe(
      '<svg data-project="render-project"/>',
    );
    expect(renderer).toHaveBeenCalledWith(project);
  });
});
