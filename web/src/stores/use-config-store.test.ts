import { expect, test } from "bun:test";

import { defaultConfig, encodeChannelModel, resolveModelRequestConfig } from "./use-config-store";

test("reuses a configured Kling API key across Kling channels", () => {
    const config = {
        ...defaultConfig,
        channels: [
            {
                id: "kling-seed",
                name: "可灵",
                baseUrl: "https://api-singapore.klingai.com",
                apiKey: "",
                apiFormat: "openai" as const,
                models: ["kling-v2-6-t2v"],
            },
            {
                id: "kling-configured",
                name: "可灵 API",
                baseUrl: "https://api-beijing.klingai.com",
                apiKey: "configured-api-key",
                apiFormat: "openai" as const,
                models: [],
            },
        ],
    };

    const requestConfig = resolveModelRequestConfig(config, encodeChannelModel("kling-seed", "kling-v2-6-t2v"));

    expect(requestConfig.apiKey).toBe("configured-api-key");
    expect(requestConfig.baseUrl).toBe("/kling-proxy/api-beijing.klingai.com");
});
