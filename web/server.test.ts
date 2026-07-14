import { expect, test } from "bun:test";

test("routes Kling POST requests through the runtime proxy", async () => {
    const { createAppHandler } = await import("./server");
    const handler = createAppHandler({ staticDir: new URL("./dist", import.meta.url).pathname });

    const response = await handler(
        new Request("http://localhost:3000/kling-proxy/api-beijing.klingai.com/v1/videos/text2video", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ code: 401, message: "请填写可灵 API Key" });
});

test("forwards the Kling API Key as a bearer token", async () => {
    const originalFetch = globalThis.fetch;
    let upstreamUrl = "";
    let upstreamAuthorization = "";
    globalThis.fetch = async (input, init) => {
        upstreamUrl = String(input);
        upstreamAuthorization = new Headers(init?.headers).get("authorization") || "";
        return Response.json({ code: 0, data: { task_id: "task-1", task_status: "submitted" } });
    };

    try {
        const { createAppHandler } = await import("./server");
        const handler = createAppHandler({ staticDir: new URL("./dist", import.meta.url).pathname });
        const response = await handler(
            new Request("http://localhost:3000/kling-proxy/api-beijing.klingai.com/v1/videos/text2video", {
                method: "POST",
                headers: { authorization: "Bearer single-api-key", "content-type": "application/json" },
                body: "{}",
            }),
        );

        expect(response.status).toBe(200);
        expect(upstreamUrl).toBe("https://api-beijing.klingai.com/v1/videos/text2video");
        expect(upstreamAuthorization).toBe("Bearer single-api-key");
    } finally {
        globalThis.fetch = originalFetch;
    }
});
