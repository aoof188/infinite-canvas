const APIPOD_BASE_URL = "https://api.apipod.ai";

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
    return proxyApipod(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
    return proxyApipod(request, context);
}

async function proxyApipod(request: Request, context: { params: Promise<{ path?: string[] }> }) {
    const { path = [] } = await context.params;
    const requestUrl = new URL(request.url);
    const targetUrl = new URL(path.map(encodeURIComponent).join("/"), `${APIPOD_BASE_URL}/`);
    targetUrl.search = requestUrl.search;

    const headers = new Headers();
    copyHeader(request.headers, headers, "accept");
    copyHeader(request.headers, headers, "authorization");
    copyHeader(request.headers, headers, "content-type");

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

function copyHeader(source: Headers, target: Headers, key: string) {
    const value = source.get(key);
    if (value) target.set(key, value);
}

function responseHeaders(headers: Headers) {
    const result = new Headers();
    copyHeader(headers, result, "content-type");
    copyHeader(headers, result, "content-length");
    return result;
}
