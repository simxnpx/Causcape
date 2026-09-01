import React from "react";
import { describe, expect, it } from "vitest";

import { Causcape } from "../index";

import { render } from "./test-utils";

describe("Causcape edge label rendering", () => {
  it("forwards the host choice to suppress duplicate canvas labels", async () => {
    await render(<Causcape renderCauscapeEdgeLabels={false} />);

    expect(window.h.app.props.renderCauscapeEdgeLabels).toBe(false);
  });
});
