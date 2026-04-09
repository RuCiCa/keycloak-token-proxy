// src/index.js
// Library 的對外入口，只匯出使用者需要的東西

export { createTokenCache } from './TokenCache.js';
export { createProxyServer } from './ProxyServer.js';

/**
 * 一鍵啟動：建立 Token 快取並同時啟動代理伺服器
 * 這是最常用的便利函數，把 TokenCache 和 ProxyServer 組合在一起
 *
 * @param {object} config
 * @param {string} config.targetUrl      - 真實目標服務 URL
 * @param {number} config.proxyPort      - 代理監聽 Port
 * @param {string} config.tokenUrl       - Keycloak Token 端點
 * @param {string} config.clientId       - Keycloak Client ID
 * @param {string} config.clientSecret   - Keycloak Client Secret
 * @param {string} [config.label]        - Log 顯示名稱
 * @returns {Promise<{server, cache}>}   - 代理 Server 實例與 Token 快取實例
 */
export async function startKeycloakProxy(config) {
    const { createTokenCache } = await import('./TokenCache.js');
    const { createProxyServer } = await import('./ProxyServer.js');

    // 建立 Token 快取
    const cache = createTokenCache({
        tokenUrl: config.tokenUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
    });

    // 預先取得一次 Token，確保代理一啟動就有效
    await cache.getToken();

    // 啟動代理伺服器
    const server = await createProxyServer({
        targetUrl: config.targetUrl,
        proxyPort: config.proxyPort,
        getToken: cache.getToken,
        label: config.label,
    });

    return { server, cache };
}