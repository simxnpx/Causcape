import React from "react";
import { render as renderDOM } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { THEME } from "@causcape/common";
import { newCauscapeNodeElement } from "@causcape/element";

import { CauscapeNodeOverlay } from "./CauscapeNodeOverlay";

describe("CauscapeNodeOverlay", () => {
  it("renders architecture nodes as semantic HTML with native reference links", () => {
    const node = newCauscapeNodeElement({
      x: 0,
      y: 0,
      label: "Booking API",
      kind: "service",
      environment: "prod-eu-west-1",
      health: "healthy",
      description: "Processes reservation requests",
      references: [
        {
          type: "repository",
          url: "https://github.com/acme/payments",
          label: "Payments repository",
        },
        {
          type: "dashboard",
          url: "https://grafana.example.com/booking",
          label: "Latency dashboard",
        },
      ],
      technologies: ["Python", "Celery"],
    });

    const { container } = renderDOM(
      <CauscapeNodeOverlay
        element={node}
        theme={THEME.LIGHT}
        linksEnabled={true}
      />,
    );

    const card = container.querySelector(
      '[data-testid="causcape-node-overlay"]',
    );
    expect(card?.tagName).toBe("ARTICLE");
    expect(card?.querySelector("h3")?.textContent).toBe("Booking API");
    expect(card?.querySelectorAll("svg")).toHaveLength(4);
    expect(card?.querySelectorAll("a")).toHaveLength(2);
    expect(card?.querySelectorAll("a")[0]).toMatchObject({
      href: "https://github.com/acme/payments",
      textContent: "Payments repository",
    });
    expect(card?.querySelectorAll("a")[1]).toMatchObject({
      href: "https://grafana.example.com/booking",
      textContent: "Latency dashboard",
    });
    expect(
      card?.querySelector(
        ".causcape-node-overlay-card__context-chip--environment",
      ),
    ).toHaveTextContent("prod-eu-west-1");
    expect(
      card?.querySelector(".causcape-node-overlay-card__references"),
    ).toHaveAttribute("aria-label", "Component references");
    expect(
      card?.querySelector(".causcape-node-overlay-card__metadata"),
    ).toBeNull();
    expect(card).not.toHaveTextContent("Environmentprod-eu-west-1");
  });

  it("omits optional sections without changing the node interface", () => {
    const node = newCauscapeNodeElement({
      x: 0,
      y: 0,
      label: "Cache",
      kind: "datastore",
    });

    const { container } = renderDOM(
      <CauscapeNodeOverlay
        element={node}
        theme={THEME.LIGHT}
        linksEnabled={true}
      />,
    );

    expect(
      container.querySelector('[data-testid="causcape-node-overlay"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(".causcape-node-overlay-card__description"),
    ).toBeNull();
    expect(
      container.querySelector(".causcape-node-overlay-card__context"),
    ).toHaveTextContent("Datastore");
    expect(
      container.querySelector(".causcape-node-overlay-card__technologies"),
    ).toBeNull();
  });
});
