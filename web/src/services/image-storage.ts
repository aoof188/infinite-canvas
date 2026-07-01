"use client";

import localforage from "localforage";

import { nanoid } from "nanoid";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const objectUrls = new Map<string, string>();
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export async function uploadImage(input: string | Blob): Promise<UploadedImage> {
    const blob = typeof input === "string" ? await fetchImageBlob(input) : input;
    const prepared = await prepareImageBlob(blob);
    const storageKey = `image:${nanoid()}`;
    await store.setItem(storageKey, blob);
    objectUrls.set(storageKey, prepared.url);
    return { url: prepared.url, storageKey, width: prepared.meta.width, height: prepared.meta.height, bytes: blob.size, mimeType: blob.type || prepared.meta.mimeType };
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    const prepared = await prepareImageBlob(blob);
    await store.setItem(storageKey, blob);
    objectUrls.set(storageKey, prepared.url);
    return prepared.url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    const blob = await fetchImageBlob(url);
    await validateImageBlob(blob);
    return blobToDataUrl(blob);
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}

async function fetchImageBlob(url: string) {
    const response = await fetch(remoteHttpUrl(url) ? `/media-proxy?url=${encodeURIComponent(url)}` : url);
    if (!response.ok) throw new Error(await readFetchError(response));
    return response.blob();
}

async function readFetchError(response: Response) {
    try {
        const data = (await response.json()) as { message?: string };
        return data.message || `图片下载失败：${response.status}`;
    } catch {
        return `图片下载失败：${response.status}`;
    }
}

function remoteHttpUrl(value: string) {
    return /^https?:\/\//i.test(value);
}

async function prepareImageBlob(blob: Blob) {
    validateImageBlobShape(blob);
    const url = URL.createObjectURL(blob);
    try {
        const meta = await readImageMetaStrict(url, blob.type || "image/png");
        return { url, meta };
    } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
    }
}

async function validateImageBlob(blob: Blob) {
    validateImageBlobShape(blob);
    const url = URL.createObjectURL(blob);
    try {
        await readImageMetaStrict(url, blob.type || "image/png");
    } finally {
        URL.revokeObjectURL(url);
    }
}

function validateImageBlobShape(blob: Blob) {
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("图片超过大小限制");
    const mimeType = blob.type.toLowerCase();
    if (mimeType && mimeType !== "application/octet-stream" && !mimeType.startsWith("image/")) throw new Error("远程地址没有返回图片");
}

function readImageMetaStrict(url: string, mimeType: string) {
    return new Promise<{ width: number; height: number; mimeType: string }>((resolve, reject) => {
        const image = new Image();
        let done = false;
        const finish = (fn: () => void) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            fn();
        };
        const timer = setTimeout(() => finish(() => reject(new Error("图片读取超时"))), 8000);
        image.onload = () => finish(() => resolve({ width: image.naturalWidth || 1024, height: image.naturalHeight || 1024, mimeType }));
        image.onerror = () => finish(() => reject(new Error("远程地址没有返回图片")));
        image.src = url;
    });
}
