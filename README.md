# keycloak-token-proxy

一個透明的 Bearer Token 注入代理，專為**不支援 OAuth2 認證的服務**設計。

讓這些服務在完全不知情的狀況下，自動帶上 Keycloak Token 存取受保護的資源。

---

## 解決什麼問題

某些服務（例如 [FUME Community]([https://github.com/outburnltd/fume-fhir-converter](https://github.com/Outburn-IL/fume-community))）在連接外部資源時，只支援無認證或 Basic Auth，無法直接使用 Keycloak 的 Bearer Token。

這個套件在本地啟動一個輕量代理伺服器：

```
你的服務 → localhost:代理Port（不需認證）→ 代理自動注入 Token → 真實目標（需要 Token）
```

---

## 安裝

```bash
npm install git+https://github.com/RuCiCa/keycloak-token-proxy.git
```

如果要鎖定特定版本：

```bash
npm install git+https://github.com/RuCiCa/keycloak-token-proxy.git#v1.0.0
```

---

## 快速開始

### 一行啟動（最常用）

```javascript
import { startKeycloakProxy } from 'keycloak-token-proxy';

await startKeycloakProxy({
    targetUrl:    'https://your-fhir-server/fhir', // 真實目標服務
    proxyPort:    42421,                            // 代理監聽的本地 Port
    tokenUrl:     'https://keycloak/realms/your-realm/protocol/openid-connect/token',
    clientId:     'your-client-id',
    clientSecret: 'your-client-secret',
    label:        'MyProxy',                        // 顯示在 log 裡的名稱（可選）
});

// 之後把你的服務指向 http://127.0.0.1:42421 即可
// 代理會自動帶上 Bearer Token 轉發到真實目標
```

### 分開使用 Token 快取與代理伺服器

有需要單獨控制的情境下，可以分開使用：

```javascript
import { createTokenCache, createProxyServer } from 'keycloak-token-proxy';

// 建立 Token 快取
const cache = createTokenCache({
    tokenUrl:     'https://keycloak/realms/your-realm/protocol/openid-connect/token',
    clientId:     'your-client-id',
    clientSecret: 'your-client-secret',
});

// 手動取得 Token
const token = await cache.getToken();

// 清除快取（下次呼叫 getToken 時強制重新取號）
cache.invalidate();

// 啟動代理伺服器
const server = await createProxyServer({
    targetUrl:  'https://your-fhir-server/fhir',
    proxyPort:  42421,
    getToken:   cache.getToken,
});

// 關閉代理
server.close();
```

---

## API 文件

### `startKeycloakProxy(config)`

一鍵建立 Token 快取並啟動代理伺服器。

| 參數 | 類型 | 必填 | 說明 |
|---|---|---|---|
| `targetUrl` | string | ✓ | 真實目標服務的完整 URL |
| `proxyPort` | number | ✓ | 代理要監聽的本地 Port |
| `tokenUrl` | string | ✓ | Keycloak Token 端點完整 URL |
| `clientId` | string | ✓ | Keycloak Client ID |
| `clientSecret` | string | ✓ | Keycloak Client Secret |
| `label` | string | | Log 顯示名稱，預設 `'Proxy'` |

回傳值：`Promise<{ server, cache }>`

---

### `createTokenCache(config)`

建立一個帶快取的 Token 取得器。

| 參數 | 類型 | 必填 | 說明 |
|---|---|---|---|
| `tokenUrl` | string | ✓ | Keycloak Token 端點完整 URL |
| `clientId` | string | ✓ | Keycloak Client ID |
| `clientSecret` | string | ✓ | Keycloak Client Secret |
| `refreshBuffer` | number | | 提前幾毫秒刷新 Token，預設 `30000`（30 秒） |

回傳值：`{ getToken, invalidate }`

| 方法 | 說明 |
|---|---|
| `getToken()` | 取得有效 Token，快取有效時直接回傳，否則重新向 Keycloak 取號 |
| `invalidate()` | 清除快取，下次呼叫 `getToken()` 時強制重新取號 |

---

### `createProxyServer(config)`

建立並啟動代理伺服器。

| 參數 | 類型 | 必填 | 說明 |
|---|---|---|---|
| `targetUrl` | string | ✓ | 真實目標服務的完整 URL |
| `proxyPort` | number | ✓ | 代理要監聽的本地 Port |
| `getToken` | function | ✓ | 非同步函數，回傳有效的 Bearer Token 字串 |
| `label` | string | | Log 顯示名稱，預設 `'Proxy'` |

回傳值：`Promise<http.Server>`

---

## 實際應用範例：搭配 FUME Node.js 架設的服務器使用，在server.js

FUME 的 `FHIR_SERVER_BASE` 只支援無認證或 Basic Auth，無法直接連接需要 Keycloak Token 的 FHIR Server。以下示範如何在完整的 FUME 伺服器設定中引用本套件。
 
**安裝依賴**
 
```bash
npm install fume-fhir-converter keycloak-connect express-session
npm install git+https://github.com/RuCiCa/keycloak-token-proxy.git
```
 
**需要的環境變數**
 
| 環境變數 | 說明 | 範例 |
|---|---|---|
| `FHIR_SERVER_URL` | 真實 FHIR Server 位址 | `http://192.168.1.1:8888/fhir` |
| `FHIR_PROXY_PORT` | 代理監聽 Port | `42421` |
| `AUTH_SERVER_BASE_URL` | Keycloak 根 URL | `http://192.168.1.1:8081` |
| `AUTH_TOKEN_URL` | Keycloak Token 端點 | `http://192.168.1.1:8081/realms/fhir-realm/protocol/openid-connect/token` |
| `AUTH_CLIENT_ID` | Keycloak Client ID | `fhir-client` |
| `AUTH_CLIENT_SECRET` | Keycloak Client Secret | `your-secret` |
| `KEYCLOAK_REALM` | Keycloak Realm 名稱 | `fhir-realm` |
| `PARENT_PID` | 父程序 PID（由 C# 注入） | `12345` |
 
**完整 server.js**
 
```javascript
import { FumeServer } from 'fume-fhir-converter';
import { startKeycloakProxy } from 'keycloak-token-proxy';
import path from 'path';
import { fileURLToPath } from 'url';
import Keycloak from 'keycloak-connect';
import session from 'express-session';
import express from 'express';
 
// ── 父程序存活監控 ────────────────────────────────────────────
// 當 C# 主程式結束時，Node.js 子程序自動跟著關閉，避免殭屍進程
const parentPid = process.env.PARENT_PID;
if (parentPid) {
    setInterval(() => {
        try { process.kill(parentPid, 0); }
        catch {
            console.warn('[FUME Node] 父程序已離線，啟動安全關閉...');
            process.exit(0);
        }
    }, 2000);
}
 
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
 
// FHIR 對應檔資料夾路徑（存放 .fume 轉換腳本）
const templatesFolder = path.resolve(__dirname, '../FHIRMaps');
 
// ── Keycloak 入站保護設定 ─────────────────────────────────────
// 保護 C# → FUME Engine 這段，確保只有持有合法 Token 的呼叫者才能使用 FUME
const memoryStore = new session.MemoryStore();
const keycloak = new Keycloak({ store: memoryStore }, {
    "realm":                 process.env.KEYCLOAK_REALM || "fhir-realm",
    "auth-server-url":       process.env.AUTH_SERVER_BASE_URL,
    "ssl-required":          "external",
    "resource":              process.env.AUTH_CLIENT_ID,
    "bearer-only":           true,
    "verify-token-audience": false,
    "credentials":           { "secret": process.env.AUTH_CLIENT_SECRET },
    "confidential-port":     0
});
 
const authRouter = express.Router();
authRouter.use(session({
    secret: 'fume-secret',
    resave: false,
    saveUninitialized: true,
    store: memoryStore
}));
authRouter.use(keycloak.middleware());
authRouter.use((req, res, next) => {
    // /health 和 / 為公開路徑，其餘都需要合法的 Bearer Token
    if (req.path === '/health' || req.path === '/') return next();
    keycloak.protect()(req, res, next);
});
 
// ── 主程序 ────────────────────────────────────────────────────
const startServer = async () => {
    try {
        const proxyPort = parseInt(process.env.FHIR_PROXY_PORT || '42421');
 
        // ✨ keycloak-token-proxy 套件負責的部分
        // 啟動本地代理，FUME 透過代理存取 FHIR Server，由代理自動補上 Bearer Token
        await startKeycloakProxy({
            targetUrl:    process.env.FHIR_SERVER_URL,
            proxyPort:    proxyPort,
            tokenUrl:     process.env.AUTH_TOKEN_URL,
            clientId:     process.env.AUTH_CLIENT_ID,
            clientSecret: process.env.AUTH_CLIENT_SECRET,
            label:        'FhirProxy',
        });
 
        // 啟動 FUME 引擎，FHIR_SERVER_BASE 指向本地代理而非真實 FHIR Server
        await FumeServer.create({
            config: {
                SERVER_PORT:      42420,
                FHIR_VERSION:     '4.0.1',
                FHIR_SERVER_BASE: `http://127.0.0.1:${proxyPort}`,
                MAPPINGS_FOLDER:  templatesFolder,
            },
            appMiddleware: authRouter
        });
 
        console.log('[FUME Node] 引擎與 Token 代理均已成功啟動');
 
    } catch (error) {
        console.error('[FUME Node] 啟動失敗:', error);
        process.exit(1);
    }
};
 
startServer();
```
 
**整體架構說明**
 
```
C# 應用程式
  │  Bearer Token（C# → FUME，由 Keycloak 入站保護驗證）
  ▼
FUME Engine :42420
  │  $literal() 等需要查詢 FHIR Server 的操作
  ▼
keycloak-token-proxy :42421   ← 本套件負責這一層
  │  自動注入 Bearer Token
  ▼
真實 FHIR Server
```
 
---
 
## 安全說明
 
- 代理伺服器只綁定 `127.0.0.1`，外網**完全無法**直接存取
- `clientSecret` 建議透過環境變數傳入，不要寫死在程式碼裡
- Token 快取在記憶體中，程式重啟後自動清除
 
---
 
## 系統需求
 
- Node.js 18 以上
- 套件依賴：`express`
 
---

## License

MIT
