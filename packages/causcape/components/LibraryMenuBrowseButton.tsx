import { VERSIONS } from "@causcape/common";

import { t } from "../i18n";

import type { CauscapeProps, UIAppState } from "../types";

const LibraryMenuBrowseButton = ({
  theme,
  id,
  libraryReturnUrl,
}: {
  libraryReturnUrl: CauscapeProps["libraryReturnUrl"];
  theme: UIAppState["theme"];
  id: string;
}) => {
  const referrer =
    libraryReturnUrl || window.location.origin + window.location.pathname;
  return (
    <a
      className="library-menu-browse-button"
      href={`${import.meta.env.VITE_APP_LIBRARY_URL}?target=${
        window.name || "_blank"
      }&referrer=${referrer}&useHash=true&token=${id}&theme=${theme}&version=${
        VERSIONS.causcapeLibrary
      }`}
      target="_causcape_libraries"
    >
      {t("labels.libraries")}
    </a>
  );
};

export default LibraryMenuBrowseButton;
