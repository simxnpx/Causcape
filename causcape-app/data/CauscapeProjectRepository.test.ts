import { describe, expect, it } from "vitest";

import { createProjectFromTemplate, serializeProject } from "@causcape/core";

import {
  CauscapeProjectRepository,
  type ProjectStoreDriver,
  type StoredProject,
} from "./CauscapeProjectRepository";

class MemoryDriver implements ProjectStoreDriver {
  private readonly records = new Map<string, StoredProject>();

  get = async (id: string) => this.records.get(id);
  getAll = async () => [...this.records.values()];
  put = async (record: StoredProject) => {
    this.records.set(record.id, record);
  };
  delete = async (id: string) => {
    this.records.delete(id);
  };
}

const project = createProjectFromTemplate({
  id: "payments",
  title: "Payments architecture",
  template: "architecture",
  occurredAt: "2026-08-26T10:00:00.000Z",
  provenance: {
    actor: { type: "human", id: "local-user" },
    channel: "browser",
  },
});

describe("CauscapeProjectRepository", () => {
  it("saves, sorts, and reopens canonical projects", async () => {
    const repository = new CauscapeProjectRepository(new MemoryDriver());
    await repository.save(project);

    expect(await repository.list()).toEqual([
      {
        id: "payments",
        title: "Payments architecture",
        updatedAt: "2026-08-26T10:00:00.000Z",
        revision: 0,
      },
    ]);
    expect(serializeProject((await repository.load("payments"))!)).toBe(
      serializeProject(project),
    );
  });

  it("imports an independent browser-local copy", async () => {
    const repository = new CauscapeProjectRepository(new MemoryDriver());
    const imported = await repository.importCopy(serializeProject(project), {
      id: "payments-copy",
      occurredAt: "2026-08-26T11:00:00.000Z",
    });

    expect(imported).toMatchObject({
      id: "payments-copy",
      title: "Payments architecture",
      updatedAt: "2026-08-26T11:00:00.000Z",
    });
    expect((await repository.load("payments-copy"))?.id).toBe("payments-copy");
  });
});
