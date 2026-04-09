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

## 實際應用範例：搭配 FUME FHIR Converter

FUME 的 `FHIR_SERVER_BASE` 只支援無認證或 Basic Auth，無法直接連接需要 Keycloak Token 的 FHIR Server。

```javascript
import { FumeServer } from 'fume-fhir-converter';
import { startKeycloakProxy } from 'keycloak-token-proxy';

const proxyPort = 42421;

// 啟動代理，FUME 指向代理而非真實 FHIR Server
await startKeycloakProxy({
    targetUrl:    process.env.FHIR_SERVER_URL,
    proxyPort:    proxyPort,
    tokenUrl:     process.env.AUTH_TOKEN_URL,
    clientId:     process.env.AUTH_CLIENT_ID,
    clientSecret: process.env.AUTH_CLIENT_SECRET,
});

// FUME 完全不知道代理的存在，以為 localhost:42421 就是 FHIR Server
await FumeServer.create({
    config: {
        SERVER_PORT:      42420,
        FHIR_SERVER_BASE: `http://127.0.0.1:${proxyPort}`,
    },
});
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
