"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import { filterModelsByCapability, modelMatchesCapability, modelName, type ModelCapability } from "@/lib/model-adapter";

export { filterModelsByCapability, modelMatchesCapability };
export type { ModelCapability };

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
    arkModelSeedVersion: string;
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
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const VOLCENGINE_ARK_PLAN_BASE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3";
const APIPOD_MODEL_SEED_VERSION = "2026-07-01";
const ARK_MODEL_SEED_VERSION = "2026-07-01-standard-video";
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
const ARK_KNOWN_MODELS = [
    "doubao-seed-2-0-pro-260215",
    "doubao-seed-2-0-lite-260428",
    "doubao-seed-1-6-251015",
    "doubao-seed-1-6-thinking-251015",
    "doubao-seedream-5-0-260128",
    "doubao-seedream-5-0-lite-260128",
    "doubao-seedream-4-5-251128",
    "doubao-seedream-4-0-250828",
    "doubao-seedance-2-0-260128",
    "doubao-seedance-2-0-fast-260128",
    "doubao-seedance-1-0-pro-250528",
    "doubao-seedance-1-0-lite-t2v-250428",
    "doubao-seedance-1-0-lite-i2v-250428",
];
const ARK_PLAN_KNOWN_MODELS = [
    "doubao-seedance-2-0-260128",
    "doubao-seedance-2-0-fast-260128",
    "doubao-seedance-1-0-pro-250528",
    "doubao-seedance-1-0-lite-t2v-250428",
    "doubao-seedance-1-0-lite-i2v-250428",
];
const ARK_SEED_CHANNELS: ModelChannel[] = [
    {
        id: "volcengine-ark",
        name: "火山方舟",
        baseUrl: VOLCENGINE_ARK_BASE_URL,
        apiKey: "",
        apiFormat: "openai",
        models: ARK_KNOWN_MODELS,
    },
    {
        id: "volcengine-ark-plan",
        name: "火山方舟 Agent Plan",
        baseUrl: VOLCENGINE_ARK_PLAN_BASE_URL,
        apiKey: "",
        apiFormat: "openai",
        models: ARK_PLAN_KNOWN_MODELS,
    },
];
const DEFAULT_OPENAI_CHANNEL: ModelChannel = {
    id: "default",
    name: "默认渠道",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    models: ["gpt-image-2", "grok-imagine-video", "gpt-5.5", "gpt-4o-mini-tts"],
};
const DEFAULT_OPENAI_MODELS = DEFAULT_OPENAI_CHANNEL.models;
const DEFAULT_CHANNELS = [DEFAULT_OPENAI_CHANNEL, ...ARK_SEED_CHANNELS];
const DEFAULT_MODEL_OPTIONS = modelOptionsFromChannels(DEFAULT_CHANNELS);

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    channels: DEFAULT_CHANNELS,
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
    models: DEFAULT_MODEL_OPTIONS,
    imageModels: filterModelsByCapability(DEFAULT_MODEL_OPTIONS, "image"),
    videoModels: filterModelsByCapability(DEFAULT_MODEL_OPTIONS, "video"),
    textModels: filterModelsByCapability(DEFAULT_MODEL_OPTIONS, "text"),
    audioModels: filterModelsByCapability(DEFAULT_MODEL_OPTIONS, "audio"),
    quality: "auto",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
    apipodModelSeedVersion: "",
    arkModelSeedVersion: "",
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

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    return Boolean(model.trim() && channel.baseUrl.trim() && apiKeyForChannel(config, channel).trim());
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
                const shouldSeedArkChannels = config.arkModelSeedVersion !== ARK_MODEL_SEED_VERSION;
                const channels = normalizeChannels(config, shouldSeedArkChannels);
                const models = modelOptionsFromChannels(channels);
                const shouldSeedApipodModelOptions = config.apipodModelSeedVersion !== APIPOD_MODEL_SEED_VERSION && channels.some(isApipodChannel);
                const shouldSeedArkModelOptions = shouldSeedArkChannels && channels.some(isArkChannel);
                const imageModels = normalizeCapabilityModelList(persistedConfig.imageModels, models, channels, "image", shouldSeedApipodModelOptions, shouldSeedArkModelOptions);
                const videoModels = normalizeCapabilityModelList(persistedConfig.videoModels, models, channels, "video", shouldSeedApipodModelOptions, shouldSeedArkModelOptions);
                const textModels = normalizeCapabilityModelList(persistedConfig.textModels, models, channels, "text", shouldSeedApipodModelOptions, shouldSeedArkModelOptions);
                const audioModels = normalizeCapabilityModelList(persistedConfig.audioModels, models, channels, "audio", shouldSeedApipodModelOptions, shouldSeedArkModelOptions);
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
                        arkModelSeedVersion: shouldSeedArkChannels ? ARK_MODEL_SEED_VERSION : config.arkModelSeedVersion || "",
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

function withSeededProviderModelOptions(models: string[], channels: ModelChannel[], capability: ModelCapability, shouldSeedApipod: boolean, shouldSeedArk: boolean) {
    const normalized = normalizeModelList(models, channels);
    if (!shouldSeedApipod && !shouldSeedArk) return normalized;
    const apipodOptions = filterModelsByCapability(
        shouldSeedApipod ? channels.filter(isApipodChannel).flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))) : [],
        capability,
    );
    const arkOptions = filterModelsByCapability(
        shouldSeedArk ? channels.filter(isArkChannel).flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))) : [],
        capability,
    );
    return uniqueModelOptions([...normalized, ...apipodOptions, ...arkOptions]);
}

function normalizeCapabilityModelList(models: string[] | undefined, allModels: string[], channels: ModelChannel[], capability: ModelCapability, shouldSeedApipodModelOptions: boolean, shouldSeedArkModelOptions: boolean) {
    const suggested = filterModelsByCapability(allModels, capability);
    const configured = Array.isArray(models) && models.length ? models : suggested;
    const normalized = withSeededProviderModelOptions(configured, channels, capability, shouldSeedApipodModelOptions, shouldSeedArkModelOptions);
    return normalized.length ? normalized : suggested;
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
    return modelName(value);
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
        baseUrl: requestBaseUrlForChannel(channel),
        apiKey: apiKeyForChannel(config, channel),
        apiFormat: channel.apiFormat,
    };
}

function apiKeyForChannel(config: AiConfig, channel: ModelChannel) {
    if (channel.apiKey.trim()) return channel.apiKey;
    if (isApipodChannel(channel)) return channel.apiKey;
    if (!isArkChannel(channel)) return channel.apiKey;
    const sharedArkKey = config.channels.find((item) => item.id !== channel.id && isArkChannel(item) && item.apiKey.trim())?.apiKey;
    return sharedArkKey || "";
}

function requestBaseUrlForChannel(channel: ModelChannel) {
    if (isApipodChannel(channel)) return "/apipod-proxy";
    if (isArkChannel(channel)) return arkProxyBaseUrl(channel.baseUrl);
    return channel.baseUrl;
}

function normalizeChannels(config: AiConfig, seedArkChannels = false) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? "默认渠道" : `渠道 ${index + 1}`),
            models: uniqueRawModels([...(channel.models || []), ...seedModelsForChannel(channel)]),
        }),
    );
    if (!channels.length) {
        const fallbackBaseUrl = config.baseUrl || defaultConfig.baseUrl;
        channels.push(
            createModelChannel({
                id: "default",
                name: "默认渠道",
                baseUrl: fallbackBaseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: legacyFallbackChannelModels(config, fallbackBaseUrl),
            }),
        );
    }
    if (seedArkChannels) {
        const existingIds = new Set(channels.map((channel) => channel.id));
        const existingBaseUrls = new Set(channels.map((channel) => normalizeChannelBaseUrl(channel.baseUrl)));
        for (const seedChannel of ARK_SEED_CHANNELS) {
            if (existingIds.has(seedChannel.id)) continue;
            if (existingBaseUrls.has(normalizeChannelBaseUrl(seedChannel.baseUrl))) continue;
            channels.push(createModelChannel(seedChannel));
        }
    }
    return channels.map((channel) => ({ ...channel, models: uniqueRawModels(channel.models) }));
}

function legacyFallbackChannelModels(config: AiConfig, baseUrl: string) {
    const models = [...(config.models || DEFAULT_OPENAI_MODELS), config.model, config.imageModel, config.videoModel, config.textModel, config.audioModel];
    const isLegacyArkChannel = isArkChannel({ id: "default", name: "默认渠道", baseUrl });
    return uniqueRawModels(isLegacyArkChannel ? models : models.filter((model) => !isArkModel(model)));
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    return apiFormat === "gemini" ? GEMINI_BASE_URL : OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" ? "gemini" : "openai";
}

function seedModelsForChannel(channel: Partial<ModelChannel>) {
    if (isApipodChannel(channel)) return APIPOD_KNOWN_MODELS;
    if (!isArkChannel(channel)) return [];
    return isArkPlanChannel(channel) ? ARK_PLAN_KNOWN_MODELS : ARK_KNOWN_MODELS;
}

function isApipodChannel(channel: Partial<ModelChannel>) {
    const marker = `${channel.id || ""} ${channel.name || ""} ${channel.baseUrl || ""}`.toLowerCase();
    return marker.includes("apipod") || marker.includes("api.apipod.ai") || marker.includes("apipod-proxy");
}

function isArkChannel(channel: Partial<ModelChannel>) {
    const marker = `${channel.id || ""} ${channel.name || ""} ${channel.baseUrl || ""}`.toLowerCase();
    return marker.includes("volcengine-ark") || marker.includes("火山方舟") || marker.includes("ark.cn-beijing.volces.com") || marker.includes("/ark-proxy");
}

function isArkPlanChannel(channel: Partial<ModelChannel>) {
    const marker = `${channel.id || ""} ${channel.name || ""} ${channel.baseUrl || ""}`.toLowerCase();
    return marker.includes("agent plan") || marker.includes("api/plan/v3");
}

function arkProxyBaseUrl(baseUrl: string) {
    try {
        const url = new URL(normalizeArkBaseUrl(baseUrl));
        return `/ark-proxy${url.pathname.replace(/\/+$/, "") || "/api/v3"}`;
    } catch {
        return baseUrl.startsWith("/ark-proxy") ? baseUrl.replace(/\/+$/, "") : baseUrl;
    }
}

function normalizeChannelBaseUrl(baseUrl: string) {
    return baseUrl.trim().replace(/\/+$/, "").toLowerCase();
}

function isArkModel(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.startsWith("doubao-seed");
}

function uniqueRawModels(models: string[]) {
    return Array.from(new Set((models || []).map((model) => modelOptionName(model).trim()).filter(Boolean)));
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkApiPath = lowerPath.includes("/api/plan/v3") ? "/api/plan/v3" : lowerPath.includes("/api/v3") ? "/api/v3" : "";
        if (!arkApiPath) return baseUrl;
        const arkApiIndex = lowerPath.indexOf(arkApiPath);
        const end = arkApiIndex + arkApiPath.length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
