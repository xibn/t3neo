import { describe, expect, it } from "vite-plus/test";

import { asciiFrameSize } from "./AsciiAnimation";

describe("asciiFrameSize", () => {
  it("measures the widest and tallest frame", () => {
    expect(asciiFrameSize({ delayMs: 100, frames: ["ab\ncd\nef", "abcd"] })).toEqual({
      columns: 4,
      rows: 3,
    });
  });

  it("keeps a declared canvas when the art never reaches its edges", () => {
    expect(
      asciiFrameSize({ delayMs: 100, columns: 70, rows: 39, frames: ["  x\n y", "z"] }),
    ).toEqual({ columns: 70, rows: 39 });
  });

  it("grows past a declared canvas that a frame spills over", () => {
    expect(asciiFrameSize({ delayMs: 100, columns: 2, rows: 1, frames: ["abc\nd"] })).toEqual({
      columns: 3,
      rows: 2,
    });
  });
});
