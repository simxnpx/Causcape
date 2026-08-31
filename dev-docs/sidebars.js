/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: "category",
      label: "Causcape",
      items: ["causcape/first-vertical-slice"],
    },
    {
      type: "category",
      label: "Introduction",
      link: {
        type: "doc",
        id: "introduction/get-started",
      },
      items: ["introduction/development", "introduction/contributing"],
    },
    {
      type: "category",
      label: "Codebase",
      items: ["codebase/json-schema", "codebase/frames"],
    },
    {
      type: "category",
      label: "@causcape/causcape",
      collapsed: false,
      items: [
        "@causcape/causcape/installation",
        "@causcape/causcape/integration",
        "@causcape/causcape/customizing-styles",
        {
          type: "category",
          label: "API",
          link: {
            type: "doc",
            id: "@causcape/causcape/api/api-intro",
          },
          items: [
            {
              type: "category",
              label: "Props",
              link: {
                type: "doc",
                id: "@causcape/causcape/api/props/props",
              },
              items: [
                "@causcape/causcape/api/props/initialdata",
                "@causcape/causcape/api/props/causcape-api",
                "@causcape/causcape/api/props/render-props",
                "@causcape/causcape/api/props/ui-options",
              ],
            },
            {
              type: "category",
              label: "Children Components",
              link: {
                type: "doc",
                id: "@causcape/causcape/api/children-components/children-components-intro",
              },
              items: [
                "@causcape/causcape/api/children-components/main-menu",
                "@causcape/causcape/api/children-components/welcome-screen",
                "@causcape/causcape/api/children-components/sidebar",
                "@causcape/causcape/api/children-components/footer",
                "@causcape/causcape/api/children-components/live-collaboration-trigger",
              ],
            },
            {
              type: "category",
              label: "Utils",
              link: {
                type: "doc",
                id: "@causcape/causcape/api/utils/utils-intro",
              },
              items: [
                "@causcape/causcape/api/utils/export",
                "@causcape/causcape/api/utils/restore",
              ],
            },
            "@causcape/causcape/api/constants",
            "@causcape/causcape/api/causcape-element-skeleton",
          ],
        },
        "@causcape/causcape/faq",
        "@causcape/causcape/development",
      ],
    },
    {
      type: "category",
      label: "@causcape/mermaid-to-causcape",
      link: {
        type: "doc",
        id: "@causcape/mermaid-to-causcape/installation",
      },
      items: [
        "@causcape/mermaid-to-causcape/api",
        "@causcape/mermaid-to-causcape/development",
        {
          type: "category",
          label: "Codebase",
          link: {
            type: "doc",
            id: "@causcape/mermaid-to-causcape/codebase/codebase",
          },
          items: [
            {
              type: "category",
              label: "How Parser works under the hood?",
              link: {
                type: "doc",
                id: "@causcape/mermaid-to-causcape/codebase/parser/parser",
              },
              items: [
                "@causcape/mermaid-to-causcape/codebase/parser/flowchart",
              ],
            },
            "@causcape/mermaid-to-causcape/codebase/new-diagram-type",
          ],
        },
      ],
    },
  ],
};

module.exports = sidebars;
