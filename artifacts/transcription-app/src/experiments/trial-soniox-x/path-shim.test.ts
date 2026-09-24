import { describe, expect, it } from "vitest";
import { join } from "./path-shim";

describe("path shim for kuromoji", () => {
  it("joins dict directory and filename the way DictionaryLoader does", () => {
    expect(join("/kuromoji-dict/", "base.dat.gz")).toBe("/kuromoji-dict/base.dat.gz");
    expect(join("/kuromoji-dict", "base.dat.gz")).toBe("/kuromoji-dict/base.dat.gz");
    expect(join("kuromoji-dict/", "tid.dat.gz")).toBe("kuromoji-dict/tid.dat.gz");
  });
});
