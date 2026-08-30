import type { ProjectTemplate } from "@causcape/core";

import "./CauscapeProjectDashboard.scss";

import type { ChangeEvent } from "react";

import type { ProjectSummary } from "../data/CauscapeProjectRepository";

type CauscapeProjectDashboardProps = {
  projects: readonly ProjectSummary[];
  onOpen: (id: string) => void;
  onCreate: (template: ProjectTemplate) => void;
  onImport: (file: File) => void;
};

export const CauscapeProjectDashboard = ({
  projects,
  onOpen,
  onCreate,
  onImport,
}: CauscapeProjectDashboardProps) => {
  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) {
      onImport(file);
    }
    event.currentTarget.value = "";
  };

  return (
    <main className="causcape-dashboard">
      <header className="causcape-dashboard__header">
        <div>
          <p className="causcape-document-eyebrow">Causcape projects</p>
          <h1>Engineering context, in one place.</h1>
          <p>
            Each project combines one canvas, one living brief, and stable links
            between them.
          </p>
        </div>
        <label className="causcape-dashboard__import">
          Import .causcape
          <input
            type="file"
            accept=".causcape,application/json"
            onChange={handleImport}
          />
        </label>
      </header>

      <section aria-labelledby="new-project-heading">
        <h2 id="new-project-heading">New project</h2>
        <div className="causcape-dashboard__templates">
          <button
            type="button"
            aria-label="Blank"
            onClick={() => onCreate("blank")}
          >
            <strong>Blank</strong>
            <span>Start with an empty brief and infinite canvas.</span>
          </button>
          <button
            type="button"
            aria-label="Architecture"
            onClick={() => onCreate("architecture")}
          >
            <strong>Architecture</strong>
            <span>Components, flows, decisions, risks, and questions.</span>
          </button>
          <button
            type="button"
            aria-label="Post-incident"
            onClick={() => onCreate("post-incident")}
          >
            <strong>Post-incident</strong>
            <span>Impact, timeline, root cause, recovery, and follow-ups.</span>
          </button>
        </div>
      </section>

      <section aria-labelledby="recent-projects-heading">
        <h2 id="recent-projects-heading">Recent projects</h2>
        {projects.length ? (
          <div className="causcape-dashboard__projects">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onOpen(project.id)}
              >
                <strong>{project.title}</strong>
                <span>
                  Updated {new Date(project.updatedAt).toLocaleString()} · rev{" "}
                  {project.revision}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p>No local projects yet.</p>
        )}
        <p className="causcape-dashboard__compatibility">
          Importing creates a browser-local copy. Canvas-only .causcape import
          and export remain available from the canvas menu.
        </p>
      </section>
    </main>
  );
};
