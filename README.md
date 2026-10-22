# Expiry Tracker — 部署指南（免手動設定 Secrets 版）

## 專案內容

- `index.html`：PWA 前端、Supabase CRUD、匿名登入及 Push 訂閱
- `manifest.json`、`sw.js`、`icon.svg`、`icon-180.png`、`icon-192.png`、`icon-512.png`：PWA 安裝、PNG 圖示及通知點擊處理
- `supabase/schema.sql`：資料表與 RLS
- `supabase/functions/send-expiry-push/index.ts`：每日到期檢查及 VAPID 推播
- `supabase/cron.sql`：每日定時呼叫 Edge Function

## 重要：此版本如何免設定 Secrets

為配合個人使用，VAPID 金鑰及排程驗證字串已直接寫入 **Edge Function 伺服器端程式碼**，`cron.sql` 亦已填好排程 URL 和驗證字串，所以不需要你到 Dashboard 手動建立 Secrets。Supabase 會自動提供 Edge Function 使用的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。

**不要把 `supabase/` 資料夾上載到公開 GitHub repository。** 只把 `index.html`、`manifest.json`、`sw.js`、`icon.svg`、`icon-180.png`、`icon-192.png`、`icon-512.png` 放到 GitHub Pages；`supabase/` 資料夾留在自己的電腦，用 Supabase CLI 部署。這個免 Secrets 版本是為自用方便而設，若程式碼公開，推播私鑰及排程驗證字串亦會曝光。

## 帳戶復原與換手機（重要）

1. 在**目前有資料的舊手機**開啟網站，進入「帳戶與換手機」，輸入你自己的電郵及密碼，按「綁定此手機現有資料」。
2. 如 Supabase 寄出確認電郵，先完成確認。請確認舊手機仍看得到原有紀錄。
3. 新手機開啟同一個網站，在相同區域輸入同一電郵及密碼，按「登入已綁定帳戶」。不要在新手機按「綁定此手機現有資料」來代替登入。
4. 建議定期按「下載 JSON 備份」，把檔案保存到安全位置。需要還原時登入目標帳戶後按「匯入 JSON 備份」。匯入會合併／更新相同 ID 紀錄，不會刪除其他現有紀錄。
5. 每部手機都要獨立按「開啟到期通知」。帳戶同步資料，但推播訂閱是每部裝置分開的。

> 這個更新不會自動把兩部手機各自建立的匿名帳戶合併。如果資料已分散在兩個匿名帳戶，請先在各手機分別下載 JSON 備份，再登入你選定的主帳戶匯入另一份備份。

## 1. 設定資料庫

1. Supabase Dashboard → SQL Editor，執行 `supabase/schema.sql`。
2. Authentication → Sign In / Providers，啟用 **Anonymous Sign-Ins**。
3. 資料表保留 RLS；不要向 `anon` 開放 `expiry_items` 或 `push_subscriptions`。
4. 未綁定電郵的匿名帳戶沒有傳統帳號復原流程；請先使用前端的「綁定此手機現有資料」功能，再換手機。

## 2. 部署前端到 GitHub Pages

只上載以下四個檔案到網站根目錄：

- `index.html`
- `manifest.json`
- `sw.js`
- `icon.svg`

確保網站使用 HTTPS。用 Android Chrome 開啟網站、加到主畫面，再按「開啟到期通知」並允許通知。

## 3. 部署 Edge Function（只需一次）

在電腦安裝 Node.js 及 Supabase CLI，然後於解壓後的專案資料夾執行：

```bash
supabase login
supabase link --project-ref wanknivxcsrasdkkxmfr
supabase functions deploy send-expiry-push
```

部署時不需要執行 `supabase secrets set`。

## 4. 啟用每日自動排程（只需一次）

1. Supabase Dashboard → Database → Extensions，啟用 `pg_cron` 及 `pg_net`。
2. 開啟 SQL Editor，執行 `supabase/cron.sql`。
3. 範例排程每日 **02:15 UTC** 執行。若已執行過，請勿重複建立同名排程；如需重設，先執行 `select cron.unschedule('expiry-tracker-daily-push');` 再重新執行排程 SQL。

## 5. 測試

1. 在手機 HTTPS 網站按「開啟到期通知」，允許通知。
2. Supabase Table Editor → `push_subscriptions`，確認有訂閱紀錄。
3. 新增測試物品，將到期日設成今天或未來 1、3、7、14 日。
4. 等待每日排程執行，或到 Edge Functions → `send-expiry-push` 的 Logs 查看結果。

提醒節點為到期前 14、7、3、1 日及到期當日。同一項目、同一到期日、同一節點只會記錄一次成功推播。

## 注意事項

- 此版本的 VAPID 私鑰和排程驗證字串寫在伺服器端程式碼，雖然不用手動設定 Secrets，但請勿公開 `supabase/` 資料夾。
- Edge Function 使用 Supabase 自動提供的 `SUPABASE_SERVICE_ROLE_KEY`；該 key 不會寫入前端 HTML。
- 日期判斷使用 UTC 日期；若要嚴格按香港／中國時區判斷「今日」，需再調整時區邏輯。
- Push 是否能送達亦取決於手機瀏覽器、系統通知權限及省電限制。
