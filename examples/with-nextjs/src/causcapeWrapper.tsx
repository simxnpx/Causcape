"use client";
import * as causcapeLib from "@causcape/causcape";
import { Causcape } from "@causcape/causcape";

import "@causcape/causcape/index.css";

import App from "../../with-script-in-browser/components/ExampleApp";

const CauscapeWrapper: React.FC = () => {
  return (
    <>
      <App
        appTitle={"Causcape with Nextjs Example"}
        useCustom={(api: any, args?: any[]) => {}}
        causcapeLib={causcapeLib}
      >
        <Causcape />
      </App>
    </>
  );
};

export default CauscapeWrapper;
