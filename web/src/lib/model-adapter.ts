export type ModelCapability = "image" | "video" | "text" | "audio";

export type VideoInputMode = "text-to-video" | "image-to-video" | "reference-to-video" | "video-to-video" | "unknown";

const CHANNEL_MODEL_SEPARATOR = "::";

export function modelName(value: string) {
    const raw = String(value || "").trim();
    const index = raw.indexOf(CHANNEL_MODEL_SEPARATOR);
    return index < 0 ? raw : raw.slice(index + CHANNEL_MODEL_SEPARATOR.length).trim();
}

export function getModelAdapter(value: string) {
    const name = modelName(value);
    const normalized = name.toLowerCase();
    const capabilities = modelCapabilities(normalized);
    return {
        name,
        capabilities,
        videoInputMode: capabilities.includes("video") ? videoInputMode(normalized) : undefined,
        allowsVideoReferenceMaterial: capabilities.includes("video") ? allowsVideoReferenceMaterial(normalized) : false,
    };
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    return getModelAdapter(model).capabilities.includes(capability);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function isSeedanceVideoModelName(model: string) {
    const value = modelName(model).toLowerCase();
    return value.includes("seedance") || value.includes("doubao-seedance");
}

export function isSeedanceFastModelName(model: string) {
    const value = modelName(model).toLowerCase();
    return isSeedanceVideoModelName(value) && value.includes("fast");
}

export function videoInputModeForModel(model: string): VideoInputMode {
    return videoInputMode(modelName(model).toLowerCase());
}

export function modelAllowsVideoReferenceMaterial(model: string) {
    return allowsVideoReferenceMaterial(modelName(model).toLowerCase());
}

function modelCapabilities(value: string): ModelCapability[] {
    if (isVideoModelName(value)) return ["video"];
    if (isImageModelName(value)) return ["image"];
    if (isAudioModelName(value)) return ["audio"];
    return ["text"];
}

function isVideoModelName(value: string) {
    if (value.includes("wan") && value.includes("image")) return false;
    return (
        value.includes("seedance") ||
        value.includes("video") ||
        value.includes("sora") ||
        value.includes("veo") ||
        value.includes("kling") ||
        value.includes("hailuo") ||
        value.includes("grok-imagine") ||
        value.includes("gemini-omni") ||
        value.includes("t2v") ||
        value.includes("i2v") ||
        value.includes("r2v")
    );
}

function isImageModelName(value: string) {
    return (
        !isVideoModelName(value) &&
        !isAudioModelName(value) &&
        (value.includes("seedream") ||
            value.includes("gpt-image") ||
            value.includes("image") ||
            value.includes("dall-e") ||
            value.includes("dalle") ||
            value.includes("imagen") ||
            value.includes("flux") ||
            value.includes("sdxl") ||
            value.includes("stable-diffusion") ||
            value.includes("midjourney") ||
            value.includes("nano-banana"))
    );
}

function isAudioModelName(value: string) {
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function videoInputMode(value: string): VideoInputMode {
    if (value.includes("r2v") || value.includes("ref")) return "reference-to-video";
    if (value.includes("i2v")) return "image-to-video";
    if (value.includes("v2v") || value.includes("videoedit")) return "video-to-video";
    if (value.includes("t2v")) return "text-to-video";
    return "unknown";
}

function allowsVideoReferenceMaterial(value: string) {
    return videoInputMode(value) !== "text-to-video";
}
