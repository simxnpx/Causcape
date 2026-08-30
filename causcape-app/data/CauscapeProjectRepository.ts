import {
  openProject,
  serializeProject,
  type Project,
  type ProjectIssue,
} from "@causcape/core";

export type StoredProject = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly revision: number;
  readonly serialized: string;
};

export type ProjectSummary = Omit<StoredProject, "serialized">;

export interface ProjectStoreDriver {
  get(id: string): Promise<StoredProject | undefined>;
  getAll(): Promise<StoredProject[]>;
  put(record: StoredProject): Promise<void>;
  delete(id: string): Promise<void>;
}

export class ProjectFileError extends Error {
  constructor(readonly issues: readonly ProjectIssue[]) {
    super(issues.map((entry) => entry.message).join("; "));
    this.name = "ProjectFileError";
  }
}

export class CauscapeProjectRepository {
  constructor(private readonly driver: ProjectStoreDriver) {}

  async list(): Promise<ProjectSummary[]> {
    return (await this.driver.getAll())
      .map(({ serialized: _serialized, ...summary }) => summary)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async load(id: string): Promise<Project | null> {
    const record = await this.driver.get(id);
    if (!record) {
      return null;
    }
    const opened = openProject(record.serialized);
    if (!opened.ok) {
      throw new ProjectFileError(opened.issues);
    }
    return opened.value.project;
  }

  async save(project: Project): Promise<void> {
    await this.driver.put({
      id: project.id,
      title: project.title,
      updatedAt: project.updatedAt,
      revision: project.revision,
      serialized: serializeProject(project),
    });
  }

  async delete(id: string): Promise<void> {
    await this.driver.delete(id);
  }

  async importCopy(
    source: string,
    identity: { id: string; occurredAt: string },
  ): Promise<Project> {
    const opened = openProject(source);
    if (!opened.ok) {
      throw new ProjectFileError(opened.issues);
    }
    const project = JSON.parse(
      serializeProject(opened.value.project),
    ) as Project;
    (project as { id: string }).id = identity.id;
    (project as { updatedAt: string }).updatedAt = identity.occurredAt;
    await this.save(project);
    return project;
  }
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

export class IndexedDbProjectDriver implements ProjectStoreDriver {
  private readonly database: Promise<IDBDatabase>;

  constructor(factory: IDBFactory) {
    const request = factory.open("causcape-projects", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("projects")) {
        request.result.createObjectStore("projects", { keyPath: "id" });
      }
    };
    this.database = requestResult(request);
  }

  async get(id: string) {
    const database = await this.database;
    return requestResult(
      database
        .transaction("projects", "readonly")
        .objectStore("projects")
        .get(id),
    ) as Promise<StoredProject | undefined>;
  }

  async getAll() {
    const database = await this.database;
    return requestResult(
      database
        .transaction("projects", "readonly")
        .objectStore("projects")
        .getAll(),
    ) as Promise<StoredProject[]>;
  }

  async put(record: StoredProject) {
    const database = await this.database;
    const transaction = database.transaction("projects", "readwrite");
    transaction.objectStore("projects").put(record);
    await transactionComplete(transaction);
  }

  async delete(id: string) {
    const database = await this.database;
    const transaction = database.transaction("projects", "readwrite");
    transaction.objectStore("projects").delete(id);
    await transactionComplete(transaction);
  }
}

const safeFilename = (title: string) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "causcape-project";

export const downloadProjectFile = (
  project: Project,
  ownerDocument: Document,
) => {
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) {
    throw new Error("Project export requires a mounted browser document");
  }
  const blob = new ownerWindow.Blob([serializeProject(project)], {
    type: "application/json",
  });
  const url = ownerWindow.URL.createObjectURL(blob);
  const anchor = ownerDocument.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(project.title)}.causcape`;
  anchor.click();
  ownerWindow.URL.revokeObjectURL(url);
};
