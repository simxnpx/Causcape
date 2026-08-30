import { validateLibraryUrl } from "./library";

describe("validateLibraryUrl", () => {
  it("should validate hostname & pathname", () => {
    // valid hostnames
    // -------------------------------------------------------------------------
    expect(
      validateLibraryUrl("https://www.causcape.com", ["causcape.com"]),
    ).toBe(true);
    expect(validateLibraryUrl("https://causcape.com", ["causcape.com"])).toBe(
      true,
    );
    expect(
      validateLibraryUrl("https://library.causcape.com", ["causcape.com"]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://library.causcape.com", [
        "library.causcape.com",
      ]),
    ).toBe(true);
    expect(validateLibraryUrl("https://causcape.com/", ["causcape.com/"])).toBe(
      true,
    );
    expect(validateLibraryUrl("https://causcape.com", ["causcape.com/"])).toBe(
      true,
    );
    expect(validateLibraryUrl("https://causcape.com/", ["causcape.com"])).toBe(
      true,
    );

    // valid pathnames
    // -------------------------------------------------------------------------
    expect(
      validateLibraryUrl("https://causcape.com/path", ["causcape.com"]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://causcape.com/path/", ["causcape.com"]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://causcape.com/specific/path", [
        "causcape.com/specific/path",
      ]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://causcape.com/specific/path/", [
        "causcape.com/specific/path",
      ]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://causcape.com/specific/path", [
        "causcape.com/specific/path/",
      ]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://causcape.com/specific/path/other", [
        "causcape.com/specific/path",
      ]),
    ).toBe(true);

    // invalid hostnames
    // -------------------------------------------------------------------------
    expect(() =>
      validateLibraryUrl("https://xcauscape.com", ["causcape.com"]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://x-causcape.com", ["causcape.com"]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://causcape.comx", ["causcape.com"]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://causcape.comx", ["causcape.com"]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://causcape.com.mx", ["causcape.com"]),
    ).toThrow();
    // protocol must be https
    expect(() =>
      validateLibraryUrl("http://causcape.com.mx", ["causcape.com"]),
    ).toThrow();

    // invalid pathnames
    // -------------------------------------------------------------------------
    expect(() =>
      validateLibraryUrl("https://causcape.com/specific/other/path", [
        "causcape.com/specific/path",
      ]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://causcape.com/specific/paths", [
        "causcape.com/specific/path",
      ]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://causcape.com/specific/path-s", [
        "causcape.com/specific/path",
      ]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://causcape.com/some/specific/path", [
        "causcape.com/specific/path",
      ]),
    ).toThrow();
  });
});
