# @causcape/utils

## Install

```bash
npm install @causcape/utils
```

If you prefer Yarn over npm, use this command to install the Causcape utils package:

```bash
yarn add @causcape/utils
```

## API

### `serializeAsJSON`

See [`serializeAsJSON`](https://github.com/causcape/causcape/blob/master/src/packages/causcape/README.md#serializeAsJSON) for API and description.

### `exportToBlob` (async)

Export a Causcape diagram to a [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob).

### `exportToSvg`

Export a Causcape diagram to a [SVGElement](https://developer.mozilla.org/en-US/docs/Web/API/SVGElement).

## Usage

Causcape utils is published as a UMD (Universal Module Definition). If you are using a module bundler (for instance, Webpack), you can import it as an ES6 module:

```js
import { exportToSvg, exportToBlob } from "@causcape/utils";
```

To use it in a browser directly:

```html
<script src="https://unpkg.com/@causcape/utils@0.1.0/dist/causcape-utils.min.js"></script>
<script>
  // CauscapeUtils is a global variable defined by causcape.min.js
  const { exportToSvg, exportToBlob } = CauscapeUtils;
</script>
```

Here's the `exportToBlob` and `exportToSvg` functions in action:

```js
const causcapeDiagram = {
  type: "causcape",
  version: 2,
  source: "https://causcape.com",
  elements: [
    {
      id: "vWrqOAfkind2qcm7LDAGZ",
      type: "ellipse",
      x: 414,
      y: 237,
      width: 214,
      height: 214,
      angle: 0,
      strokeColor: "#000000",
      backgroundColor: "#15aabf",
      fillStyle: "hachure",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      roundness: null,
      seed: 1041657908,
      version: 120,
      versionNonce: 1188004276,
      isDeleted: false,
      boundElementIds: null,
    },
  ],
  appState: {
    viewBackgroundColor: "#ffffff",
    gridSize: null,
  },
};

// Export the Causcape diagram as SVG string
const svg = exportToSvg(causcapeDiagram);
console.log(svg.outerHTML);

// Export the Causcape diagram as PNG Blob URL
(async () => {
  const blob = await exportToBlob({
    ...causcapeDiagram,
    mimeType: "image/png",
  });

  const urlCreator = window.URL || window.webkitURL;
  console.log(urlCreator.createObjectURL(blob));
})();
```
