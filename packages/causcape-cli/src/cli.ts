import { randomUUID } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { extname, resolve } from "node:path";

import {
  createProjectFromTemplate,
  openProject,
  serializeProject,
  type Project,
  type ProjectTemplate,
} from "@causcape/core";

import { applyAgentPatch, inspectProject } from "./commands";
import { renderProject } from "./render";

import type { AgentPatch } from "./contracts";

const usage = `Causcape CLI

Commands:
  create --title <title> --template <blank|architecture|post-incident> --output <file>
  inspect <project.causcape>
  validate <project.causcape>
  apply-patch <project.causcape> <patch.json> [--apply --output <file>]
  render <project.causcape> --output <file.svg|file.png> --chromium <path>
`;

const option = (args: readonly string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const requiredOption = (args: readonly string[], name: string) => {
  const value = option(args, name);
  if (!value) {
    throw new Error(`Missing required option ${name}`);
  }
  return value;
};

const readProject = async (path: string): Promise<Project> => {
  const opened = openProject(await readFile(path, "utf8"));
  if (!opened.ok) {
    throw Object.assign(new Error("Project validation failed"), {
      issues: opened.issues,
    });
  }
  return opened.value.project;
};

const atomicWrite = async (path: string, data: string | Uint8Array) => {
  const destination = resolve(path);
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(data);
    await handle.close();
    await rename(temporary, destination);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
};

const output = (value: unknown) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const run = async (args: readonly string[]) => {
  const [command, ...rest] = args;
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(usage);
    return 0;
  }

  if (command === "create") {
    const title = requiredOption(rest, "--title");
    const template = requiredOption(rest, "--template") as ProjectTemplate;
    if (
      !(["blank", "architecture", "post-incident"] as const).includes(template)
    ) {
      throw new Error(`Unknown project template ${template}`);
    }
    const destination = requiredOption(rest, "--output");
    const project = createProjectFromTemplate({
      id: option(rest, "--id") ?? randomUUID(),
      title,
      template,
      occurredAt: new Date().toISOString(),
      provenance: {
        actor: { type: "agent", id: option(rest, "--actor") },
        channel: "cli",
        summary: `Created from the ${template} template`,
      },
    });
    await atomicWrite(destination, serializeProject(project));
    output({
      ok: true,
      command,
      output: resolve(destination),
      project: inspectProject(project),
    });
    return 0;
  }

  if (command === "inspect") {
    const project = await readProject(rest[0] ?? "");
    output({ ok: true, command, project: inspectProject(project) });
    return 0;
  }

  if (command === "validate") {
    const opened = openProject(await readFile(rest[0] ?? "", "utf8"));
    if (!opened.ok) {
      output({ ok: false, command, issues: opened.issues });
      return 2;
    }
    output({
      ok: true,
      command,
      project: inspectProject(opened.value.project),
    });
    return 0;
  }

  if (command === "apply-patch") {
    const project = await readProject(rest[0] ?? "");
    const patch = JSON.parse(
      await readFile(rest[1] ?? "", "utf8"),
    ) as AgentPatch;
    const result = await applyAgentPatch(project, patch);
    if (!result.ok) {
      output({ ok: false, command, issues: result.issues });
      return 2;
    }
    const shouldApply = rest.includes("--apply");
    if (shouldApply) {
      const destination = requiredOption(rest, "--output");
      await atomicWrite(destination, serializeProject(result.value));
      output({
        ok: true,
        command,
        applied: true,
        output: resolve(destination),
        project: inspectProject(result.value),
      });
    } else {
      output({
        ok: true,
        command,
        applied: false,
        project: inspectProject(result.value),
        serializedProject: serializeProject(result.value),
      });
    }
    return 0;
  }

  if (command === "render") {
    const project = await readProject(rest[0] ?? "");
    const destination = requiredOption(rest, "--output");
    const extension = extname(destination).toLowerCase();
    const format =
      extension === ".png" ? "png" : extension === ".svg" ? "svg" : null;
    if (!format) {
      throw new Error("Render output must end in .svg or .png");
    }
    const executablePath =
      option(rest, "--chromium") ?? process.env.CAUSCAPE_CHROMIUM_PATH;
    if (!executablePath) {
      throw new Error("Render requires --chromium or CAUSCAPE_CHROMIUM_PATH");
    }
    const rendered = await renderProject(project, { executablePath, format });
    await atomicWrite(destination, rendered);
    output({ ok: true, command, output: resolve(destination), format });
    return 0;
  }

  throw new Error(`Unknown command ${command}`);
};

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    output({
      ok: false,
      error: {
        code: "CLI_ERROR",
        message: error instanceof Error ? error.message : String(error),
        ...(typeof error === "object" && error && "issues" in error
          ? { issues: error.issues }
          : {}),
      },
    });
    process.exitCode = 1;
  });
