const KLING_BASE_URL = "https://api-beijing.klingai.com";

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
    return proxyKling(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
    return proxyKling(request, context);
}

async function proxyKling(request: Request, context: { params: Promise<{ path?: string[] }> }) {
    const authorization = request.headers.get("authorization")?.trim() || "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) return Response.json({ code: 401, message: "请填写可灵 API Key" }, { status: 401 });

    const { path = [] } = await context.params;
    const requestUrl = new URL(request.url);
    const { baseUrl, targetPath } = klingTarget(path);
    const targetUrl = new URL(targetPath.map(encodeURIComponent).join("/"), `${baseUrl}/`);
    targetUrl.search = requestUrl.search;

    const headers = new Headers();
    copyHeader(request.headers, headers, "accept");
    copyHeader(request.headers, headers, "content-type");
    headers.set("authorization", authorization);

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

function klingTarget(path: string[]) {
    const [maybeHost, ...rest] = path;
    const host = normalizeKlingHost(maybeHost);
    if (host) return { baseUrl: `https://${host}`, targetPath: rest };
    return { baseUrl: KLING_BASE_URL, targetPath: path };
}

function normalizeKlingHost(value: string | undefined) {
    if (!value) return "";
    try {
        const host = new URL(`https://${value}`).hostname.toLowerCase();
        return host === "klingai.com" || host.endsWith(".klingai.com") ? host : "";
    } catch {
        return "";
    }
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
