import React from "react";
import { vi } from "vitest";

import { resolvablePromise } from "@causcape/common";

import { Causcape, CaptureUpdateAction } from "../../index";
import { API } from "../helpers/api";
import { Pointer } from "../helpers/ui";
import { render, unmountComponent } from "../test-utils";

import type { CauscapeImperativeAPI } from "../../types";

describe("event callbacks", () => {
  const h = window.h;

  let causcapeAPI: CauscapeImperativeAPI;

  const mouse = new Pointer("mouse");

  beforeEach(async () => {
    const causcapeAPIPromise = resolvablePromise<CauscapeImperativeAPI>();
    await render(
      <Causcape
        onCauscapeAPI={(api) => causcapeAPIPromise.resolve(api as any)}
      />,
    );
    causcapeAPI = await causcapeAPIPromise;
  });

  it("should resolve editor:mount/editor:initialize when subscribed before mount", async () => {
    unmountComponent();

    const lifecyclePromise = resolvablePromise<{
      api: CauscapeImperativeAPI;
      mount: Promise<{
        causcapeAPI: CauscapeImperativeAPI;
        container: HTMLDivElement | null;
      }>;
      initialize: Promise<CauscapeImperativeAPI>;
    }>();

    await render(
      <Causcape
        onCauscapeAPI={(api) => {
          if (api) {
            lifecyclePromise.resolve({
              api,
              mount: api.onEvent("editor:mount"),
              initialize: api.onEvent("editor:initialize"),
            });
          }
        }}
      />,
    );

    const { api, mount, initialize } = await lifecyclePromise;
    await expect(mount).resolves.toEqual({
      causcapeAPI: api,
      container: expect.any(HTMLDivElement),
    });
    await expect(initialize).resolves.toBe(api);
  });

  it("should replay editor:mount/editor:initialize to late subscribers", async () => {
    const onMount = vi.fn();
    const onInitialize = vi.fn();

    causcapeAPI.onEvent("editor:mount", onMount);
    causcapeAPI.onEvent("editor:initialize", onInitialize);

    await Promise.resolve();

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onMount).toHaveBeenCalledWith({
      causcapeAPI,
      container: expect.any(HTMLDivElement),
    });
    expect(onInitialize).toHaveBeenCalledTimes(1);
    expect(onInitialize).toHaveBeenCalledWith(causcapeAPI);

    await expect(causcapeAPI.onEvent("editor:mount")).resolves.toEqual({
      causcapeAPI,
      container: expect.any(HTMLDivElement),
    });
    await expect(causcapeAPI.onEvent("editor:initialize")).resolves.toBe(
      causcapeAPI,
    );
  });

  it("should call onMount before onInitialize props", async () => {
    unmountComponent();

    const calls: string[] = [];

    await render(
      <Causcape
        onMount={({ causcapeAPI, container }) => {
          expect(causcapeAPI).toBeDefined();
          expect(container).toBeInstanceOf(HTMLDivElement);
          calls.push("mount");
        }}
        onInitialize={() => {
          calls.push("initialize");
        }}
      />,
    );

    expect(calls).toEqual(["mount", "initialize"]);
  });

  it("should trigger onChange on render", async () => {
    const onChange = vi.fn();

    const origBackgroundColor = h.state.viewBackgroundColor;
    causcapeAPI.onChange(onChange);
    API.updateScene({
      appState: { viewBackgroundColor: "red" },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    expect(onChange).toHaveBeenCalledWith(
      // elements
      [],
      // appState
      expect.objectContaining({
        viewBackgroundColor: "red",
      }),
      // files
      {},
    );
    expect(onChange.mock?.lastCall?.[1].viewBackgroundColor).not.toBe(
      origBackgroundColor,
    );
  });

  it("should trigger onPointerDown/onPointerUp on canvas pointerDown/pointerUp", async () => {
    const onPointerDown = vi.fn();
    const onPointerUp = vi.fn();

    causcapeAPI.onPointerDown(onPointerDown);
    causcapeAPI.onPointerUp(onPointerUp);

    mouse.downAt(100);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(onPointerUp).not.toHaveBeenCalled();
    mouse.up();
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(onPointerUp).toHaveBeenCalledTimes(1);
  });
});
