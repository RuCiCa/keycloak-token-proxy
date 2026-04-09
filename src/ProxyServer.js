// src/ProxyServer.js
// 負責啟動本地代理伺服器，攔截請求並自動注入 Bearer Token 後轉發

import express from 'express';
import { createServer } from 'http';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';

/**
 * 建立並啟動 Token 注入代理伺服器
 * @param {object} config
 * @param {string}   config.targetUrl  - 真實目標服務的完整 URL
 * @param {number}   config.proxyPort  - 代理要監聽的本地 Port
 * @param {Function} config.getToken   - 非同步函數，回傳有效的 Bearer Token 字串
 * @param {string}   [config.label]    - 顯示在 log 裡的名稱（預設 'Proxy'）
 * @returns {Promise<import('http').Server>} 啟動完成的 HTTP Server 實例
 */
export function createProxyServer(config) {
    const { targetUrl, proxyPort, getToken, label = 'Proxy' } = config;

    // 驗證必要設定
    if (!targetUrl) throw new Error(`[${label}] targetUrl 為必填項目`);
    if (!proxyPort) throw new Error(`[${label}] proxyPort 為必填項目`);
    if (typeof getToken !== 'function') throw new Error(`[${label}] getToken 必須是一個函數`);

    const parsedTarget = new URL(targetUrl);
    const isHttps = parsedTarget.protocol === 'https:';
    const requester = isHttps ? httpsRequest : httpRequest;

    const app = express();

    // 攔截所有打到代理的請求
    app.use((req, res) => {
        getToken()
            .then(token => _forwardRequest(req, res, token, parsedTarget, requester, label))
            .catch(err => {
                console.error(`[${label}] 取得 Token 時發生例外:`, err.message);
                // Token 取得失敗仍嘗試轉發，只是不帶 Token
                _forwardRequest(req, res, '', parsedTarget, requester, label);
            });
    });

    // 回傳 Promise，等代理真正開始監聽才 resolve
    return new Promise((resolve, reject) => {
        const server = createServer(app);

        server.on('error', (err) => {
            console.error(`[${label}] 代理啟動失敗:`, err.message);
            reject(err);
        });

        // 只綁定 127.0.0.1，外網完全無法直接存取
        server.listen(proxyPort, '127.0.0.1', () => {
            console.log(`[${label}] 已啟動: localhost:${proxyPort} → ${targetUrl}`);
            resolve(server);
        });
    });
}

/**
 * 實際執行請求轉發（內部函數）
 */
function _forwardRequest(req, res, token, parsedTarget, requester, label) {
    // 組合轉發目標路徑，移除結尾斜線避免雙斜線問題
    const targetPath = parsedTarget.pathname.replace(/\/$/, '') + req.url;

    const headers = {
        ...req.headers,
        'Accept': 'application/fhir+json',
    };

    // 移除 host header，讓 Node.js 用 options.hostname 處理，避免 SNI 錯誤
    delete headers['host'];

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn(`[${label}] 警告：無有效 Token，請求將不帶認證轉發`);
    }

    const options = {
        hostname: parsedTarget.hostname,
        port: parsedTarget.port || (requester === require('https').request ? 443 : 80),
        path: targetPath,
        method: req.method,
        headers,
    };

    const proxyReq = requester(options, (proxyRes) => {
        // 把目標回應的狀態碼和 Headers 原樣回傳
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        // 用 Stream pipe 直接傳遞 body，不佔用額外記憶體
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error(`[${label}] 轉發失敗:`, err.message);
        if (!res.headersSent) {
            res.status(502).json({ error: 'Proxy error', detail: err.message });
        }
    });

    // 把進來的請求 body 也原樣轉送（POST/PUT 等有 body 的請求）
    req.pipe(proxyReq, { end: true });
}