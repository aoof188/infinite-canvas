import { GET as proxyMedia } from "./src/app/media-proxy/route";
import { GET as getApipod, POST as postApipod } from "./src/app/apipod-proxy/[...path]/route";
import { GET as getArk, POST as postArk } from "./src/app/ark-proxy/[...path]/route";
import { GET as getKling, POST as postKling } from "./src/app/kling-proxy/[...path]/route";

declare const Bun: any;

type AppHandlerOptions = {
    staticDir: string;
};

type ProxyHandler = (request: Request, context: { params: Promise<{ path?: string[] }> }) => Promise<Response>;

export function createAppHandler({ staticDir }: AppHandlerOptions) {
    return async function handleRequest(request: Request) {
        const url = new URL(request.url);

        if (url.pathname === "/media-proxy") {
            return request.method === "GET" ? proxyMedia(request) : methodNotAllowed();
        }

        const proxy = matchProxy(url.pathname, request.method);
        if (proxy) {
            return proxy.handler(request, { params: Promise.resolve({ path: proxy.path }) });
        }

        if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed();
        return serveStaticFile(staticDir, url.pathname, request.method === "HEAD");
    };
}

function matchProxy(pathname: string, method: string): { handler: ProxyHandler; path: string[] } | null {
    const routes = [
        { prefix: "/apipod-proxy", get: getApipod, post: postApipod },
        { prefix: "/ark-proxy", get: getArk, post: postArk },
        { prefix: "/kling-proxy", get: getKling, post: postKling },
    ];

    const route = routes.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (!route) return null;
    const handler = method === "GET" ? route.get : method === "POST" ? route.post : null;
    if (!handler) return { handler: async () => methodNotAllowed(), path: [] };
    return { handler, path: decodePath(pathname.slice(route.prefix.length)) };
}

function decodePath(pathname: string) {
    return pathname
        .replace(/^\/+/, "")
        .split("/")
        .filter(Boolean)
        .map((part) => decodeURIComponent(part));
}

async function serveStaticFile(staticDir: string, pathname: string, headOnly: boolean) {
    const relativePath = safeStaticPath(pathname);
    const asset = relativePath ? Bun.file(`${staticDir}/${relativePath}`) : null;
    const file = asset && (await asset.exists()) ? asset : Bun.file(`${staticDir}/index.html`);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(headOnly ? null : file, { headers: { "cache-control": relativePath ? "public, max-age=3600" : "no-cache" } });
}

function safeStaticPath(pathname: string) {
    try {
        const decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
        if (!decoded || decoded.split("/").includes("..")) return "";
        return decoded;
    } catch {
        return "";
    }
}

function methodNotAllowed() {
    return Response.json({ message: "Method not allowed" }, { status: 405 });
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
    const port = Number(process.env.PORT || "3000");
    const handler = createAppHandler({ staticDir: process.env.STATIC_DIR || new URL("./dist", import.meta.url).pathname });
    Bun.serve({ port, hostname: "0.0.0.0", fetch: handler });
    console.log(`Infinite Canvas listening on http://0.0.0.0:${port}`);
}
