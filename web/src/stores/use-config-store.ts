"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

export type ApiCallFormat = "openai" | "gemini";

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: string[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    quality: string;
    size: string;
    count: string;
    canvasImageCount: string;
    apipodModelSeedVersion: string;
};

export type WebdavSyncConfig = {
    proxyMode: "direct" | "nextjs";
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export type ModelCapability = "image" | "video" | "text" | "audio";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const APIPOD_MODEL_SEED_VERSION = "2026-07-01";
// APIPod does not expose every multimodal model through /v1/models, so keep this local seed list for the config UI.
const APIPOD_KNOWN_MODELS = [
    "gpt-image-2",
    "gpt-image-2-edit",
    "nano-banana-2",
    "nano-banana-pro",
    "seedream-v4.5",
    "seedream-v4.5-edit",
    "seedream-5.0-lite",
    "seedream-5.0-lite-edit",
    "wan2.7-image",
    "wan2.7-image-edit",
    "wan2.7-image-pro",
    "wan2.7-image-pro-edit",
    "seedance-2.0-t2v",
    "seedance-2.0-i2v",
    "seedance-2.0-r2v",
    "seedance-2.0-fast-t2v",
    "seedance-2.0-fast-i2v",
    "seedance-2.0-fast-r2v",
    "seedance-1.5-pro-t2v",
    "seedance-1.5-pro-i2v",
    "seedance-1.0-lite-t2v",
    "seedance-1.0-lite-i2v",
    "seedance-1.0-lite-i2v-ref",
    "seedance-1.0-pro-t2v",
    "seedance-1.0-pro-i2v",
    "seedance-1.0-pro-fast-t2v",
    "seedance-1.0-pro-fast-i2v",
    "grok-imagine-t2v",
    "grok-imagine-i2v",
    "grok-imagine-1.5-preview",
    "sora-2",
    "sora-2-pro",
    "sora-2-vip",
    "veo3-1-fast",
    "veo3-1-fast-4k",
    "veo3-1-fast-ref",
    "veo3-1-quality",
    "veo3-1-quality-4k",
    "gemini-omni-t2v",
    "gemini-omni-i2v",
    "gemini-omni-r2v",
    "gemini-omni-extend",
    "wan2.7-t2v",
    "wan2.7-i2v",
    "wan2.7-videoedit",
    "kling-2.6-motion-control",
    "claude-haiku-4-5",
    "claude-opus-4-5",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-sonnet-4-5",
    "claude-sonnet-4-6",
    "gemini-3-pro-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.1-pro-preview",
    "gemini-3.5-flash",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5.1",
    "gpt-5.2",
    "gpt-5.2-chat",
    "gpt-5.3-codex",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.4-pro",
    "grok-4.20-multi-agent",
    "grok-4.20-non-reasoning",
    "grok-4.20-reasoning",
    "gpt-4o-mini-tts",
];

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    channels: [
        {
            id: "default",
            name: "默认渠道",
            baseUrl: OPENAI_BASE_URL,
            apiKey: "",
            apiFormat: "openai",
            models: ["gpt-image-2", "grok-imagine-video", "gpt-5.5", "gpt-4o-mini-tts"],
        },
    ],
    model: "default::gpt-image-2",
    imageModel: "default::gpt-image-2",
    videoModel: "default::grok-imagine-video",
    textModel: "default::gpt-5.5",
    audioModel: "default::gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: ["default::gpt-image-2", "default::grok-imagine-video", "default::gpt-5.5", "default::gpt-4o-mini-tts"],
    imageModels: ["default::gpt-image-2"],
    videoModels: ["default::grok-imagine-video"],
    textModels: ["default::gpt-5.5"],
    audioModels: ["default::gpt-4o-mini-tts"],
    quality: "auto",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
    apipodModelSeedVersion: "",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    proxyMode: "direct",
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function isVideoModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
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

function isImageModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return (
        !isVideoModelName(model) &&
        !isAudioModelName(model) &&
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

function isAudioModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    return Boolean(model.trim() && channel.baseUrl.trim() && channel.apiKey.trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                if (!Array.isArray(persistedConfig.channels)) config.channels = [];
                const channels = normalizeChannels(config);
                const models = modelOptionsFromChannels(channels);
                const shouldSeedApipodModelOptions = config.apipodModelSeedVersion !== APIPOD_MODEL_SEED_VERSION && channels.some(isApipodChannel);
                const imageModels = withSeededApipodModelOptions(Array.isArray(persistedConfig.imageModels) ? config.imageModels : filterModelsByCapability(models, "image"), channels, "image", shouldSeedApipodModelOptions);
                const videoModels = withSeededApipodModelOptions(Array.isArray(persistedConfig.videoModels) ? config.videoModels : filterModelsByCapability(models, "video"), channels, "video", shouldSeedApipodModelOptions);
                const textModels = withSeededApipodModelOptions(Array.isArray(persistedConfig.textModels) ? config.textModels : filterModelsByCapability(models, "text"), channels, "text", shouldSeedApipodModelOptions);
                const audioModels = withSeededApipodModelOptions(Array.isArray(persistedConfig.audioModels) ? config.audioModels : filterModelsByCapability(models, "audio"), channels, "audio", shouldSeedApipodModelOptions);
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        channelMode: "local",
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        channels,
                        models,
                        imageModel: normalizeModelOptionValue(config.imageModel || config.model, channels),
                        videoModel: normalizeModelOptionValue(config.videoModel || "grok-imagine-video", channels),
                        textModel: normalizeModelOptionValue(config.textModel || config.model, channels),
                        audioModel: normalizeModelOptionValue(config.audioModel || defaultConfig.audioModel, channels),
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        canvasImageCount: config.canvasImageCount || "3",
                        imageModels,
                        videoModels,
                        textModels,
                        audioModels,
                        apipodModelSeedVersion: shouldSeedApipodModelOptions ? APIPOD_MODEL_SEED_VERSION : config.apipodModelSeedVersion || "",
                    },
                };
            },
        },
    ),
);

function normalizeModelList(models: string[], channels: ModelChannel[]) {
    const allModelOptions = channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model)));
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)))
        .map((model) => normalizeModelOptionValue(model, channels))
        .filter((model) => !allModelOptions.length || allModelOptions.includes(model) || !isChannelModelValue(model));
}

function withSeededApipodModelOptions(models: string[], channels: ModelChannel[], capability: ModelCapability, shouldSeed: boolean) {
    const normalized = normalizeModelList(models, channels);
    if (!shouldSeed) return normalized;
    const apipodOptions = filterModelsByCapability(
        channels.filter(isApipodChannel).flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))),
        capability,
    );
    return uniqueModelOptions([...normalized, ...apipodOptions]);
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || "新渠道",
        baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
        apiKey: channel?.apiKey || "",
        apiFormat,
        models: uniqueRawModels(channel?.models || []),
    };
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel ? `${decoded.model}（${channel.name}）` : decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.includes(decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.includes(model)) || channels[0];
    return channel && channel.models.includes(model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.includes(model));
    return matched || config.channels[0] || createModelChannel({ id: "default", name: "默认渠道", baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat, models: config.models.map(modelOptionName) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    return {
        ...config,
        model: modelOptionName(value || config.model),
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: channel.apiFormat,
    };
}

function normalizeChannels(config: AiConfig) {
    const shouldSeedApipodModels = config.apipodModelSeedVersion !== APIPOD_MODEL_SEED_VERSION;
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? "默认渠道" : `渠道 ${index + 1}`),
            models: uniqueRawModels([...(channel.models || []), ...(shouldSeedApipodModels && isApipodChannel(channel) ? APIPOD_KNOWN_MODELS : [])]),
        }),
    );
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: "默认渠道",
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: uniqueRawModels([...(config.models || []), config.model, config.imageModel, config.videoModel, config.textModel, config.audioModel]),
            }),
        );
    }
    return channels.map((channel) => ({ ...channel, models: uniqueRawModels(channel.models) }));
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    return apiFormat === "gemini" ? GEMINI_BASE_URL : OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" ? "gemini" : "openai";
}

function isApipodChannel(channel: Partial<ModelChannel>) {
    const marker = `${channel.id || ""} ${channel.name || ""} ${channel.baseUrl || ""}`.toLowerCase();
    return marker.includes("apipod") || marker.includes("api.apipod.ai") || marker.includes("apipod-proxy");
}

function uniqueRawModels(models: string[]) {
    return Array.from(new Set((models || []).map((model) => modelOptionName(model).trim()).filter(Boolean)));
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
