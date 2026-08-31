# Causcape CLI

The CLI is the first automation boundary for Causcape projects. It reads and writes the same versioned `.causcape` artifact as the browser app, without introducing a separate agent-only data model.

Build it from the repository root:

```sh
corepack yarn build:causcape-cli
```

Create, inspect, and validate projects:

```sh
node packages/causcape-cli/dist/cli.mjs create \
  --title "Checkout architecture" \
  --template architecture \
  --output checkout.causcape
node packages/causcape-cli/dist/cli.mjs inspect checkout.causcape
node packages/causcape-cli/dist/cli.mjs validate checkout.causcape
```

`apply-patch` previews by default. A write requires both `--apply` and an explicit output path. Patches carry the expected project revision and agent provenance, so stale updates fail without changing the source artifact.

```sh
node packages/causcape-cli/dist/cli.mjs apply-patch \
  checkout.causcape patch.json
node packages/causcape-cli/dist/cli.mjs apply-patch \
  checkout.causcape patch.json --apply --output checkout-next.causcape
```

An optional `model` in a patch accepts technology-neutral nodes and edges. ELK lays them out deterministically and the resulting elements are stored as ordinary Causcape elements with stable Causcape object IDs.

Render SVG or PNG with an explicitly provisioned Chromium executable:

```sh
node packages/causcape-cli/dist/cli.mjs render checkout.causcape \
  --output checkout.svg \
  --chromium "/path/to/chromium"
```

`CAUSCAPE_CHROMIUM_PATH` may be used instead of `--chromium`. The CLI does not download or silently select a browser, keeping headless environments reproducible and under the caller's control.
