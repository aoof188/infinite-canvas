import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 45000;
export const runtime = "nodejs";

type MediaResponse = {
    status: number;
    headers: Headers;
    body: Uint8Array;
};

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const targetUrl = parsePublicMediaUrl(requestUrl.searchParams.get("url") || "");
    if (!targetUrl) {
        return Response.json({ message: "无效的媒体地址" }, { status: 400 });
    }

    try {
        const upstream = await requestPublicMedia(targetUrl, request.headers.get("accept") || "image/*,*/*");
        if (upstream.status < 200 || upstream.status >= 300) {
            return Response.json({ message: `媒体下载失败：${upstream.status}` }, { status: 502 });
        }
        const contentType = imageContentType(upstream.headers, upstream.body);
        if (!contentType) {
            return Response.json({ message: "远程地址没有返回图片" }, { status: 415 });
        }
        return new Response(upstream.body, {
            status: 200,
            headers: responseHeaders(contentType, upstream.body.byteLength),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "媒体下载失败";
        return Response.json({ message }, { status: 502 });
    }
}

async function requestPublicMedia(url: URL, accept: string, redirects = 0): Promise<MediaResponse> {
    const response = await nodeRequest(url, accept);
    if (!REDIRECT_STATUS.has(response.status)) return response;
    if (redirects >= MAX_REDIRECTS) throw new Error("媒体地址重定向过多");

    const location = response.headers.get("location");
    const nextUrl = location ? parsePublicMediaUrl(new URL(location, url).toString()) : null;
    if (!nextUrl) throw new Error("媒体地址重定向无效");
    return requestPublicMedia(nextUrl, accept, redirects + 1);
}

function nodeRequest(url: URL, accept: string) {
    return new Promise<MediaResponse>((resolve, reject) => {
        const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
            url,
            {
                agent: false,
                lookup: guardedLookup,
                ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
                timeout: REQUEST_TIMEOUT_MS,
                headers: { accept },
            },
            (response) => {
                void readResponse(response).then(resolve, reject);
            },
        );
        const timeout = setTimeout(() => request.destroy(new Error("图片下载超时")), REQUEST_TIMEOUT_MS);
        request.on("error", reject);
        request.on("close", () => clearTimeout(timeout));
        request.end();
    });
}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
    const useAll = typeof options !== "number" && Boolean(options?.all);
    const family = typeof options === "number" ? options : options?.family;
    lookup(hostname, { all: true, verbatim: true, family: family || undefined })
        .then((addresses) => {
            const address = addresses.find((item) => !isBlockedIp(item.address));
            if (!address) {
                callback(new Error("无效的媒体地址"), "", 0);
                return;
            }
            if (useAll) {
                callback(null, [address] as never, 0);
                return;
            }
            callback(null, address.address, address.family);
        })
        .catch((error) => callback(error instanceof Error ? error : new Error("媒体地址解析失败"), "", 0));
};

async function readResponse(response: IncomingMessage): Promise<MediaResponse> {
    const headers = responseHeadersFromNode(response.headers);
    if (tooLarge(headers)) throw new Error("图片超过大小限制");

    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of response) {
        const value = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
            response.destroy();
            throw new Error("图片超过大小限制");
        }
        chunks.push(value);
    }
    return {
        status: response.statusCode || 0,
        headers,
        body: concatChunks(chunks, total),
    };
}

function parsePublicMediaUrl(value: string) {
    try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        if (url.username || url.password) return null;
        if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) return null;
        return isBlockedHostname(url.hostname) ? null : url;
    } catch {
        return null;
    }
}

function isBlockedHostname(hostname: string) {
    const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (value === "localhost" || value === "0.0.0.0" || value === "::1" || value.endsWith(".local")) return true;
    if (isIP(value)) return isBlockedIp(value) || isFakeIpV4(value);
    return false;
}

function isBlockedIp(address: string) {
    const value = address.toLowerCase();
    if (isIP(value) === 4) return isBlockedIpv4(value);
    if (value.startsWith("::ffff:")) return isBlockedIpv4(value.slice(7));
    if (isIP(value) === 6) return isBlockedIpv6(value);
    return true;
}

function isBlockedIpv4(value: string) {
    const parts = value.split(".").map(Number);
    const [first, second] = parts;
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    if (first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) || (first === 192 && second === 168)) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;
    if (first === 192 && (second === 0 || (second === 88 && parts[2] === 99))) return true;
    if (first === 198 && second === 51 && parts[2] === 100) return true;
    if (first === 203 && second === 0 && parts[2] === 113) return true;
    return first >= 224;
}

function isFakeIpV4(value: string) {
    const parts = value.split(".").map(Number);
    return parts.length === 4 && parts[0] === 198 && (parts[1] === 18 || parts[1] === 19);
}

function isBlockedIpv6(value: string) {
    const first = parseInt(value.split(":", 1)[0] || "0", 16);
    if (value === "::" || value === "::1") return true;
    if (value.startsWith("64:ff9b:") || value.startsWith("2001:db8:") || value.startsWith("2002:")) return true;
    if (value.startsWith("fc") || value.startsWith("fd")) return true;
    if (first >= 0xfe80 && first <= 0xfebf) return true;
    return first >= 0xff00;
}

function imageContentType(headers: Headers, body: Uint8Array) {
    const contentType = headers.get("content-type") || "";
    const normalized = contentType.toLowerCase();
    if (normalized.startsWith("image/svg")) return "";
    if (normalized.startsWith("image/")) return contentType;
    if (normalized && normalized !== "application/octet-stream") return "";
    return sniffImageContentType(body);
}

function tooLarge(headers: Headers) {
    const contentLength = Number(headers.get("content-length") || "0");
    return Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES;
}

function sniffImageContentType(bytes: Uint8Array) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
    if (ascii(bytes, 4, 8) === "ftypavif" || ascii(bytes, 4, 8) === "ftypavis") return "image/avif";
    return "";
}

function ascii(bytes: Uint8Array, start: number, length: number) {
    return String.fromCharCode(...bytes.slice(start, start + length));
}

function concatChunks(chunks: Uint8Array[], total: number) {
    const body = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    });
    return body;
}

function responseHeadersFromNode(headers: IncomingMessage["headers"]) {
    const result = new Headers();
    Object.entries(headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            result.set(key, value.join(", "));
            return;
        }
        if (value) result.set(key, value);
    });
    return result;
}

function responseHeaders(contentType: string, contentLength: number) {
    const result = new Headers();
    result.set("content-type", contentType);
    result.set("content-length", String(contentLength));
    result.set("cache-control", "no-store");
    result.set("x-content-type-options", "nosniff");
    return result;
}
