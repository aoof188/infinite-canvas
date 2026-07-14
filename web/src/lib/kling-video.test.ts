import { expect, test } from "bun:test";

import { klingApiModelName, klingEndpoint, modelSupportsKlingSound, normalizeKlingDuration } from "./kling-video";

test("maps configured Kling 3.0 aliases to the official model name", () => {
    expect(klingApiModelName("kling-v3-0-t2v", "t2v")).toBe("kling-v3");
    expect(klingApiModelName("kling-v3.0-i2v", "i2v")).toBe("kling-v3");
});

test("uses the official v1 Kling video endpoints", () => {
    expect(klingEndpoint("t2v", 0)).toBe("/v1/videos/text2video");
    expect(klingEndpoint("i2v", 1)).toBe("/v1/videos/image2video");
});

test("keeps Kling 3.0 durations supported by the API", () => {
    expect(normalizeKlingDuration("kling-v3-0-t2v", "6")).toBe("6");
});

test("does not enable sound for Kling 2.6 standard mode", () => {
    expect(modelSupportsKlingSound("kling-v2-6-t2v")).toBe(false);
    expect(modelSupportsKlingSound("kling-v3-0-t2v")).toBe(true);
});
