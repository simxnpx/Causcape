import dynamic from "next/dynamic";
import Script from "next/script";

import "../common.scss";

// Since client components get prerenderd on server as well hence importing the causcape stuff dynamically
// with ssr false
const CauscapeWithClientOnly = dynamic(
  async () => (await import("../causcapeWrapper")).default,
  {
    ssr: false,
  },
);

export default function Page() {
  return (
    <>
      <a href="/causcape-in-pages">Switch to Pages router</a>
      <h1 className="page-title">App Router</h1>
      <Script id="load-env-variables" strategy="beforeInteractive">
        {`window["CAUSCAPE_ASSET_PATH"] = window.origin;`}
      </Script>
      {/* @ts-expect-error - https://github.com/vercel/next.js/issues/42292 */}
      <CauscapeWithClientOnly />
    </>
  );
}
