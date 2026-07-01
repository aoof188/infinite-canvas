import axios from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import { modelAllowsVideoReferenceMaterial } from "@/lib/model-adapter";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildSeedancePromptText, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceVideoReferenceError, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { buildApiUrl, modelOptionName, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = { id: string; status?: string; error?: { message?: string } };
type ApiVideoResponse = VideoResponse | { code?: number; data?: VideoResponse | null; msg?: string };
type SeedanceTask = {
    id: string;
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
    error?: { code?: string; message?: string } | null;
    content?: { video_url?: string; last_frame_url?: string } | null;
};
type ApipodTask = {
    task_id?: string;
    id?: string;
    status?: "pending" | "processing" | "completed" | "failed" | "cancelled" | string;
    result?: unknown;
    code?: string | number;
    message?: string;
    msg?: string;
    error?: { message?: string } | string | null;
};
type KlingTask = {
    code?: number;
    message?: string;
    data?: {
        task_id?: string;
        task_status?: "submitted" | "processing" | "succeed" | "failed" | string;
        task_status_msg?: string;
        task_result?: { videos?: Array<{ id?: string; url?: string; watermark_url?: string; duration?: string }> };
    } | null;
};
type ApiEnvelope<T> = T | { code?: number; data?: T | null; msg?: string };
type RequestOptions = { signal?: AbortSignal };

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "openai" | "seedance" | "apipod" | "kling"; model: string; endpoint?: string };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    const task = await createVideoGenerationTask(config, prompt, references, videoReferences, audioReferences, options);
    const delayMs = task.provider === "seedance" || task.provider === "apipod" || task.provider === "kling" ? 5000 : 2500;
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, options);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error);
        if (attempt === 119) throw new Error(`${task.provider === "seedance" ? "Seedance " : task.provider === "apipod" ? "APIPod " : task.provider === "kling" ? "可灵 " : ""}视频生成超时，请稍后重试`);
        await delay(delayMs, options?.signal);
    }
    throw new Error("视频生成超时，请稍后重试");
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (isApipodConfig(requestConfig)) {
        return createApipodVideoTask(requestConfig, selectedModel, prompt, references, videoReferences, audioReferences, options);
    }
    if (isKlingConfig(requestConfig)) {
        return createKlingVideoTask(requestConfig, selectedModel, prompt, references, videoReferences, options);
    }
    if (isSeedanceVideoConfig(requestConfig)) {
        return createSeedanceTask(requestConfig, selectedModel, prompt, references, videoReferences, audioReferences, options);
    }
    if (videoReferences.length || audioReferences.length) {
        throw new Error("当前视频接口不支持参考视频或参考音频，请切换到 Seedance 2.0 / 火山 Agent Plan 模型，或移除参考素材");
    }
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, options);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const requestConfig = resolveModelRequestConfig(config, task.model);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (task.provider === "apipod") return pollApipodVideoTask(requestConfig, task, options);
    if (task.provider === "kling") return pollKlingVideoTask(requestConfig, task, options);
    return task.provider === "seedance" ? pollSeedanceTask(requestConfig, task, options) : pollOpenAIVideoTask(requestConfig, task, options);
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
    throw new Error("视频接口没有返回可播放的视频");
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), signal: options?.signal })).data);
        if (!created.id) throw new Error("视频接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        if (video.status === "completed") {
            const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal });
            await assertVideoBlob(content.data);
            return { status: "completed", result: { blob: content.data } };
        }
        if (video.status === "failed" || video.status === "cancelled") return { status: "failed", error: video.error?.message || "视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务查询失败"));
    }
}

async function createSeedanceTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const requestReferences = videoReferencesForModel(model, references, videoReferences, audioReferences);
    if (requestReferences.audioReferences.length && !requestReferences.references.length && !requestReferences.videoReferences.length) {
        throw new Error("Seedance 参考音频不能单独使用，请同时添加参考图或参考视频");
    }
    assertSeedanceVideoReferences(requestReferences.videoReferences);
    assertSeedanceAudioReferences(requestReferences.audioReferences);
    const content = await buildSeedanceContent(config, prompt, requestReferences.references, requestReferences.videoReferences, requestReferences.audioReferences);
    if (!content.length) throw new Error("请输入视频提示词，或连接参考图片/视频/音频");
    const payload = {
        model: modelOptionName(model),
        content,
        ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeSeedanceResolution(config.vquality, modelOptionName(model)),
        duration: normalizeSeedanceDuration(config.videoSeconds),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
    };

    try {
        const created = unwrapSeedanceTask((await axios.post<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config), payload, { headers: aiHeaders(config, "application/json"), signal: options?.signal })).data);
        if (!created.id) throw new Error("Seedance 接口没有返回任务 ID");
        return { id: created.id, provider: "seedance", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务创建失败"));
    }
}

async function createApipodVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const requestReferences = videoReferencesForModel(model, references, videoReferences, audioReferences);
    const imageUrls = await Promise.all(requestReferences.references.map((image) => imageToDataUrl(image)));
    const videoUrls = await Promise.all(requestReferences.videoReferences.map(resolveSeedanceVideoUrl));
    const audioUrls = await Promise.all(requestReferences.audioReferences.map(resolveSeedanceAudioUrl));
    const requestPrompt = buildSeedancePromptText(prompt, requestReferences.references, requestReferences.videoReferences, requestReferences.audioReferences);
    if (!requestPrompt && !imageUrls.length && !videoUrls.length && !audioUrls.length) throw new Error("请输入视频提示词，或连接参考图片/视频/音频");
    const payload = {
        model: modelOptionName(model),
        prompt: requestPrompt || prompt,
        aspect_ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeSeedanceResolution(config.vquality, modelOptionName(model)),
        duration: normalizeSeedanceDuration(config.videoSeconds),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        return_last_frame: false,
        watermark: boolConfig(config.videoWatermark, false),
        web_search: false,
        ...(imageUrls.length ? { image_urls: imageUrls } : {}),
        ...(videoUrls.length ? { video_urls: videoUrls } : {}),
        ...(audioUrls.length ? { audio_urls: audioUrls } : {}),
    };

    try {
        const created = unwrapApipodTask((await axios.post<ApiEnvelope<ApipodTask>>(aiApiUrl(config, "/videos/generations"), payload, { headers: aiHeaders(config, "application/json"), signal: options?.signal })).data);
        const taskId = created.task_id || created.id;
        if (!taskId) throw new Error("APIPod 接口没有返回任务 ID");
        return { id: taskId, provider: "apipod", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "APIPod 视频任务创建失败"));
    }
}

async function createKlingVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const modelId = modelOptionName(model);
    const mode = klingVideoMode(modelId);
    const endpoint = klingEndpoint(mode, references.length);
    const payload = await buildKlingPayload(config, modelId, mode, prompt, references, videoReferences);
    try {
        const created = unwrapKlingTask((await axios.post<KlingTask>(aiApiUrl(config, endpoint), payload, { headers: aiHeaders(config, "application/json"), signal: options?.signal })).data);
        if (!created.task_id) throw new Error("可灵接口没有返回任务 ID");
        return { id: created.task_id, provider: "kling", model, endpoint };
    } catch (error) {
        throw new Error(readAxiosError(error, "可灵任务创建失败"));
    }
}

function videoReferencesForModel(model: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    if (!modelAllowsVideoReferenceMaterial(model)) return { references: [], videoReferences: [], audioReferences: [] };
    return { references, videoReferences, audioReferences };
}

async function pollSeedanceTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = unwrapSeedanceTask((await axios.get<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, task.id), { headers: aiHeaders(config), signal: options?.signal })).data);
        if (state.status === "succeeded") {
            const url = state.content?.video_url;
            if (!url) return { status: "failed", error: "Seedance 任务成功但没有返回视频 URL" };
            return { status: "completed", result: await videoResultFromUrl(url, options) };
        }
        if (state.status === "failed" || state.status === "cancelled" || state.status === "expired") return { status: "failed", error: state.error?.message || `Seedance 视频生成${state.status === "expired" ? "超时" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务查询失败"));
    }
}

async function pollApipodVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = unwrapApipodTask((await axios.get<ApiEnvelope<ApipodTask>>(aiApiUrl(config, `/videos/status/${encodeURIComponent(task.id)}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        if (state.status === "completed") {
            const url = apipodResultUrl(state.result);
            if (!url) return { status: "failed", error: "APIPod 任务成功但没有返回视频 URL" };
            return { status: "completed", result: await videoResultFromUrl(url, options) };
        }
        if (state.status === "failed" || state.status === "cancelled") return { status: "failed", error: apipodTaskError(state) || `APIPod 视频生成${state.status === "cancelled" ? "已取消" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "APIPod 视频任务查询失败"));
    }
}

async function pollKlingVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const endpoint = task.endpoint || klingEndpoint(klingVideoMode(modelOptionName(task.model)), 1);
        const state = unwrapKlingTask((await axios.get<KlingTask>(aiApiUrl(config, `${endpoint}/${encodeURIComponent(task.id)}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        if (state.task_status === "succeed") {
            const url = state.task_result?.videos?.find((video) => video.url)?.url;
            if (!url) return { status: "failed", error: "可灵任务成功但没有返回视频 URL" };
            return { status: "completed", result: await videoResultFromUrl(url, options) };
        }
        if (state.task_status === "failed") return { status: "failed", error: state.task_status_msg || "可灵视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "可灵任务查询失败"));
    }
}

function assertSeedanceVideoReferences(videoReferences: ReferenceVideo[]) {
    const error = seedanceVideoReferenceError(videoReferences);
    if (error) throw new Error(error);
    let total = 0;
    for (const video of videoReferences) {
        if (!video.durationMs) continue;
        if (video.durationMs < 2000 || video.durationMs > 15000) throw new Error("Seedance 参考视频单个时长需要在 2-15 秒之间");
        total += video.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考视频总时长不能超过 15 秒");
}

function assertSeedanceAudioReferences(audioReferences: ReferenceAudio[]) {
    let total = 0;
    for (const audio of audioReferences) {
        if (!audio.durationMs) continue;
        if (audio.durationMs < 2000 || audio.durationMs > 15000) throw new Error("Seedance 参考音频单个时长需要在 2-15 秒之间");
        total += audio.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考音频总时长不能超过 15 秒");
}

function seedanceApiUrl(config: AiConfig, taskId?: string) {
    return buildApiUrl(config.baseUrl, `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ""}`);
}

function isApipodConfig(config: Pick<AiConfig, "baseUrl">) {
    const value = config.baseUrl.trim().toLowerCase();
    return value.includes("apipod") || value.includes("/apipod-proxy");
}

function isKlingConfig(config: Pick<AiConfig, "baseUrl">) {
    const value = config.baseUrl.trim().toLowerCase();
    return value.includes("klingai.com") || value.includes("/kling-proxy");
}

async function buildKlingPayload(config: AiConfig, modelId: string, mode: "t2v" | "i2v" | "motion-control", prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[]) {
    const modelName = klingApiModelName(modelId, mode);
    const duration = normalizeKlingDuration(config.videoSeconds);
    const common = klingCommonOptions(config, modelId);
    if (mode === "t2v") {
        if (references.length || videoReferences.length) throw new Error("可灵文生视频模型不支持参考素材，请切换到 i2v 或 motion-control 模型");
        return { model_name: modelName, prompt, aspect_ratio: normalizeKlingAspectRatio(config.size), duration, ...common };
    }
    if (mode === "motion-control") {
        const image = references[0];
        const video = videoReferences[0];
        if (!image || !video) throw new Error("可灵 motion-control 需要连接 1 张角色图和 1 个参考动作视频");
        if (!isPublicMediaUrl(video.url)) throw new Error("可灵 motion-control 的参考视频需要公网 URL");
        return { model_name: modelName, prompt, image_url: await klingImageValue(config, image), video_url: video.url, character_orientation: "image", mode: "std", keep_original_sound: boolConfig(config.videoGenerateAudio, true) ? "yes" : "no", watermark_info: common.watermark_info };
    }
    if (!references.length) throw new Error("可灵图生视频模型需要至少 1 张参考图");
    if (references.length > 1) {
        return { model_name: modelName, prompt, image_list: await Promise.all(references.slice(0, 4).map(async (image) => ({ image: await klingImageValue(config, image) }))), aspect_ratio: normalizeKlingAspectRatio(config.size), duration, ...common };
    }
    return { model_name: modelName, prompt, image: await klingImageValue(config, references[0]), duration, ...common };
}

function klingVideoMode(modelId: string): "t2v" | "i2v" | "motion-control" {
    if (modelId.endsWith("-t2v")) return "t2v";
    if (modelId.endsWith("-i2v")) return "i2v";
    if (modelId.endsWith("-motion-control")) return "motion-control";
    throw new Error("可灵模型名称需以 -t2v、-i2v 或 -motion-control 结尾");
}

function klingEndpoint(mode: "t2v" | "i2v" | "motion-control", referenceImageCount: number) {
    if (mode === "t2v") return "/videos/text2video";
    if (mode === "motion-control") return "/videos/motion-control";
    return referenceImageCount > 1 ? "/videos/multi-image2video" : "/videos/image2video";
}

function klingApiModelName(modelId: string, mode: "t2v" | "i2v" | "motion-control") {
    const suffix = mode === "motion-control" ? "-motion-control" : `-${mode}`;
    return modelId.slice(0, -suffix.length).replace(/\.0$/, "").replace(/\./g, "-");
}

async function klingImageValue(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl)) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("可灵参考图读取失败，请换一张图片或重新上传");
    return dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

function normalizeKlingAspectRatio(value: string) {
    const ratio = normalizeSeedanceRatio(value);
    return ["16:9", "9:16", "1:1"].includes(ratio) ? ratio : "16:9";
}

function normalizeKlingDuration(value: string) {
    return Number(value) >= 10 ? "10" : "5";
}

function klingCommonOptions(config: AiConfig, modelId: string) {
    return {
        ...(modelSupportsKlingSound(modelId) ? { sound: boolConfig(config.videoGenerateAudio, true) ? "on" : "off" } : {}),
        watermark_info: { enabled: boolConfig(config.videoWatermark, false) },
    };
}

function modelSupportsKlingSound(modelId: string) {
    return /kling-v(2\.6|3\.0)/.test(modelId);
}

async function buildSeedanceContent(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    const content: Array<Record<string, unknown>> = [];
    const text = buildSeedancePromptText(prompt, references, videoReferences, audioReferences);
    if (text) content.push({ type: "text", text });
    for (const image of references.slice(0, SEEDANCE_REFERENCE_LIMITS.images)) {
        content.push({ type: "image_url", image_url: { url: await resolveSeedanceImageUrl(config, image) }, role: "reference_image" });
    }
    for (const video of videoReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.videos)) {
        content.push({ type: "video_url", video_url: { url: await resolveSeedanceVideoUrl(video) }, role: "reference_video" });
    }
    for (const audio of audioReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.audios)) {
        content.push({ type: "audio_url", audio_url: { url: await resolveSeedanceAudioUrl(audio) }, role: "reference_audio" });
    }
    return content;
}

async function resolveSeedanceImageUrl(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl) || directUrl.startsWith("asset://")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    return dataUrl;
}

async function resolveSeedanceVideoUrl(video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url) || video.url.startsWith("asset://")) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL、素材 ID，或本地已保存的视频");
    return blobToDataUrl(blob);
}

async function resolveSeedanceAudioUrl(audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url) || audio.url.startsWith("asset://")) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL、素材 ID，或本地已保存的音频");
    return blobToDataUrl(blob);
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置视频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    if (config.apiFormat === "gemini") throw new Error("Gemini 调用格式暂不支持视频生成，请使用 OpenAI 格式渠道");
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, "Seedance 接口没有返回任务");
}

function unwrapApipodTask(payload: ApiEnvelope<ApipodTask>) {
    if (!payload) throw new Error("APIPod 接口没有返回任务");
    if (typeof payload === "object" && "code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0 && payload.code !== 200) throw new Error("msg" in payload && payload.msg ? payload.msg : "APIPod 请求失败");
        if ("data" in payload && payload.data) return payload.data;
        throw new Error("APIPod 接口没有返回任务");
    }
    return payload as ApipodTask;
}

function unwrapKlingTask(payload: KlingTask) {
    if (!payload) throw new Error("可灵接口没有返回任务");
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.message || "可灵请求失败");
    if (!payload.data) throw new Error("可灵接口没有返回任务");
    return payload.data;
}

function apipodTaskError(task: ApipodTask) {
    if (typeof task.error === "string") return task.error;
    return task.error?.message || task.message || task.msg || (task.code ? String(task.code) : "");
}

function apipodResultUrl(result: unknown): string {
    if (typeof result === "string") return result;
    if (Array.isArray(result)) {
        for (const item of result) {
            const url = apipodResultUrl(item);
            if (url) return url;
        }
    }
    if (result && typeof result === "object") {
        const item = result as Record<string, unknown>;
        for (const key of ["url", "video_url", "result_url", "download_url"]) {
            if (typeof item[key] === "string" && item[key]) return item[key];
        }
    }
    return "";
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0) throw new Error(payload.msg || "请求失败");
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string; code?: number }>(error)) {
        const responseData = error.response?.data;
        return responseData?.msg || responseData?.message || responseData?.error?.message || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    return error instanceof Error ? error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "视频下载失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取本地素材失败"));
        reader.readAsDataURL(blob);
    });
}
