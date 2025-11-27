I Am Safe - 緊急狀態通報程式 (Cloudflare Worker + D1)

這是一個輕量級、響應迅速的緊急狀態佈告欄應用程式，專為在緊急情況下快速發布和查看人員安全狀態而設計。它完全部署在 Cloudflare Workers 上，使用 D1 作為持久化資料庫，並支援多語言和管理刪除功能。

🚀 主要功能

實時狀態更新： 允許用戶輸入姓名、位置、身份證號碼（不公開顯示）和安全狀態 (Safe, Help, Other)。

數據持久化： 使用 Cloudflare D1 儲存所有記錄。

即時搜尋： 支援按姓名、ID、位置或狀態關鍵字進行即時過濾。

管理刪除： 透過 URL 中的管理令牌 (Admin Token) 實現，確保只有授權用戶才能刪除記錄。

分頁顯示： 支援分頁以處理大量記錄。

行動裝置優化： 專為手機瀏覽器設計的簡潔 UI。

多語言支援： 目前支援繁體中文 (Traditional Chinese, cht)。

🛠️ 部署要求

您需要具備以下環境和服務：

Cloudflare 帳戶： 用於部署 Worker 和 D1 服務。

Wrangler CLI： Cloudflare 的命令列工具，用於開發和部署。

D1 資料庫： 一個已建立並綁定到 Worker 的 D1 資料庫。

ADMIN_TOKEN Secret： 必須設定的管理環境變數。

⚙️ 安裝和設定

請按照以下步驟進行設定和部署：

1. D1 資料庫設定

您需要建立一個 D1 資料庫並定義資料表結構。

a. 建立 D1 資料庫

在您的 Cloudflare 帳戶中建立一個 D1 數據庫，例如命名為 safety-board-db。

b. 創建資料表 (Schema)

在 D1 控制台或使用 Wrangler 執行以下 SQL 語句來建立必要的表格：

CREATE TABLE safety_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    id_number TEXT, -- Used for search, not publicly displayed
    location TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


2. 環境變數和 Secret 設定

這個應用程式需要一個環境變數來連結 D1 資料庫，以及一個 Secret 來儲存管理員密鑰。

a. D1 綁定 (Binding)

確保您的 wrangler.toml 文件包含 D1 綁定，將 DB 變數對應到您的 D1 資料庫。

# 假設您的 D1 資料庫名稱是 safety-board-db
[[d1_databases]]
binding = "DB"
database_name = "safety-board-db"
database_id = "YOUR_DATABASE_ID_HERE"


b. 設定管理員密鑰 (Admin Token)

使用 Wrangler CLI 來設定一個名為 ADMIN_TOKEN 的 Secret。這是確保刪除功能安全的關鍵步驟。請將 YOUR_SECRET_TOKEN 替換為您選擇的密碼或令牌。

npx wrangler secret put ADMIN_TOKEN
# Wrangler 會提示您輸入密鑰值 (e.g., XXXXX)


注意： 您必須將此密鑰值記住，這是您訪問管理刪除權限的唯一憑證。

3. 部署 Worker

將您的 Worker 代碼（即 src/index.js 文件）部署到 Cloudflare。

npx wrangler deploy


🌐 使用方式

普通用戶 (讀/寫權限)

只需訪問您的 Worker URL 即可查看狀態並發布自己的安全狀態。

管理員 (刪除權限)

要以管理員身份訪問，您需要在 URL 中添加 ?admin=YOUR_SECRET_TOKEN 查詢參數。

示例 URL:

[https://your-worker-name.workers.dev/?admin=XXXXX](https://your-worker-name.workers.dev/?admin=XXXXX)


如果密鑰正確，每個記錄旁邊會出現一個紅色的 [X] 按鈕，允許您刪除該記錄。

此程式碼基於 Cloudflare Workers 和 D1 數據庫。
