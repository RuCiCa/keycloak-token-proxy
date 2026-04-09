// src/TokenCache.js
// 負責向 Keycloak 取得 Bearer Token 並快取，避免每次請求都重新取號

/**
 * 建立一個 Token 快取實例
 * @param {object} config
 * @param {string} config.tokenUrl      - Keycloak Token 端點完整 URL
 * @param {string} config.clientId      - Keycloak Client ID
 * @param {string} config.clientSecret  - Keycloak Client Secret
 * @param {number} [config.refreshBuffer=30000] - 提前幾毫秒刷新（預設 30 秒）
 */
export function createTokenCache(config) {
    const { tokenUrl, clientId, clientSecret, refreshBuffer = 30_000 } = config;

    // 驗證必要設定
    if (!tokenUrl || !clientId || !clientSecret) {
        throw new Error('[TokenCache] tokenUrl、clientId、clientSecret 為必填項目');
    }

    let _cachedToken = '';
    let _expireAt = 0;

    /**
     * 取得有效的 Bearer Token
     * 若快取還有效直接回傳，否則向 Keycloak 重新取號
     * @returns {Promise<string>} Token 字串，失敗時回傳空字串
     */
    const getToken = async () => {
        // 快取還有效（距離過期還有 refreshBuffer 以上的時間）
        if (_cachedToken && Date.now() < _expireAt - refreshBuffer) {
            return _cachedToken;
        }

        return await _fetchNewToken();
    };

    /**
     * 向 Keycloak 請求新的 Token（內部方法）
     */
    const _fetchNewToken = async () => {
        try {
            // 用 Client Credentials 流程換 Token
            const body = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
            });

            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[TokenCache] 取號失敗 (${response.status}): ${errorText}`);
                return '';
            }

            const data = await response.json();

            _cachedToken = data.access_token;

            // 計算到期時間，expires_in 單位是秒
            _expireAt = Date.now() + (data.expires_in * 1000);

            console.log(`[TokenCache] Token 已刷新，${data.expires_in}s 後過期`);
            return _cachedToken;

        } catch (err) {
            console.error('[TokenCache] 與 Keycloak 連線失敗:', err.message);
            return '';
        }
    };

    /**
     * 清除快取，下次呼叫 getToken() 時強制重新取號
     */
    const invalidate = () => {
        _cachedToken = '';
        _expireAt = 0;
        console.log('[TokenCache] 快取已清除');
    };

    return { getToken, invalidate };
}