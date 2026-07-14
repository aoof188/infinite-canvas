export type KlingVideoMode = "t2v" | "i2v" | "motion-control";

export function klingEndpoint(mode: KlingVideoMode, referenceImageCount: number) {
    if (mode === "t2v") return "/v1/videos/text2video";
    if (mode === "motion-control") return "/v1/videos/motion-control";
    return referenceImageCount > 1 ? "/v1/videos/multi-image2video" : "/v1/videos/image2video";
}

export function klingApiModelName(modelId: string, mode: KlingVideoMode) {
    const suffix = mode === "motion-control" ? "-motion-control" : `-${mode}`;
    const normalized = modelId.slice(0, -suffix.length).replace(/\./g, "-");
    if (normalized === "kling-v3-0") return "kling-v3";
    if (normalized === "kling-v2-5") return "kling-v2-5-turbo";
    return normalized;
}

export function normalizeKlingDuration(modelId: string, value: string) {
    const seconds = Math.round(Number(value));
    if (klingApiModelName(modelId, modelId.endsWith("-i2v") ? "i2v" : "t2v") === "kling-v3" && seconds >= 3 && seconds <= 15) {
        return String(seconds);
    }
    return seconds >= 10 ? "10" : "5";
}

export function modelSupportsKlingSound(modelId: string) {
    const normalized = modelId.replace(/\./g, "-");
    return normalized.startsWith("kling-v3-0-");
}
