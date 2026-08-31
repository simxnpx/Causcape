const legacyBrand = ["excal", "idraw"].join("");

/**
 * Protocol identifiers used by canvas files created before the Causcape rename.
 * Keep these values isolated: they are accepted on read, while every new export
 * uses the Causcape format identifiers.
 */
export const LEGACY_CANVAS_FORMAT = {
  sceneType: legacyBrand,
  clipboardType: `${legacyBrand}/clipboard`,
  apiClipboardType: `${legacyBrand}-api/clipboard`,
  libraryType: `${legacyBrand}lib`,
  sceneMimeType: `application/vnd.${legacyBrand}+json`,
  clipboardMimeType: `application/vnd.${legacyBrand}.clipboard+json`,
  libraryMimeType: `application/vnd.${legacyBrand}lib+json`,
  sceneExtension: legacyBrand,
  libraryExtension: `${legacyBrand}lib`,
} as const;
