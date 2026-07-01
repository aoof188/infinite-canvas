const KLING_BASE_URL = "https://api-singapore.klingai.com";

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
    return proxyKling(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
    return proxyKling(request, context);
}

async function proxyKling(request: Request, context: { params: Promise<{ path?: string[] }> }) {
    const credentials = parseKlingCredentials(request.headers.get("authorization"));
    if (!credentials) return Response.json({ code: 401, message: "请将可灵 API Key 填为 accessKey:secretKey" }, { status: 401 });

    const { path = [] } = await context.params;
    const requestUrl = new URL(request.url);
    const targetUrl = new URL(path.map(encodeURIComponent).join("/"), `${KLING_BASE_URL}/`);
    targetUrl.search = requestUrl.search;

    const headers = new Headers();
    copyHeader(request.headers, headers, "accept");
    copyHeader(request.headers, headers, "content-type");
    headers.set("authorization", `Bearer ${await createKlingJwt(credentials.accessKey, credentials.secretKey)}`);

    const upstream = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
        cache: "no-store",
    });

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders(upstream.headers),
    });
}

function parseKlingCredentials(value: string | null) {
    const token = (value || "").replace(/^Bearer\s+/i, "").trim();
    const separator = token.includes(":") ? ":" : token.includes("|") ? "|" : "";
    if (!separator) return null;
    const index = token.indexOf(separator);
    const accessKey = token.slice(0, index).trim();
    const secretKey = token.slice(index + separator.length).trim();
    return accessKey && secretKey ? { accessKey, secretKey } : null;
}

async function createKlingJwt(accessKey: string, secretKey: string) {
    const now = Math.floor(Date.now() / 1000);
    const signingInput = `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }))}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
    return `${signingInput}.${base64url(String.fromCharCode(...new Uint8Array(signature)))}`;
}

function base64url(value: string) {
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function copyHeader(source: Headers, target: Headers, key: string) {
    const value = source.get(key);
    if (value) target.set(key, value);
}

function responseHeaders(headers: Headers) {
    const result = new Headers();
    copyHeader(headers, result, "content-type");
    return result;
}
