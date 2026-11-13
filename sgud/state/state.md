# 狀態（現況）

本檔記**現況**：各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證之結果；只記現況，不寫過程（過程見 `sgud/exp/experience.md`，藍圖見 `sgud/rule/rulebook.md`）。
本檔自 2026-11-14 起建立，**只記已當場核實者**；未列之功能其現況以規則帳本與測試為準。

## 版本與相依

| 項目 | 現況 |
|---|---|
| `package.json` 版本 | 1.0.44（2026-11-14 本輪未動） |
| 瀏覽器啟動 | 一律經 `w-playwright`（帳本 R-PW-ONLY、R-PW-WIRING；經驗八） |
| `jsdom` | 31.0.0（宣告 `^31.0.0`；2026-11-14 由 30.1.3 升級，帳本四有逐項差異與判讀）。傳遞相依：`parse5` 8.1.0、新增 `bcp-47`／`bcp-47-match`／`parse5-parser-stream`(8.1.0) |
| `@mozilla/readability` | 0.6.0 |
| Node.js 需求 | 隨 `jsdom` 之 `engines`：`^22.22.2 \|\| ^24.15.0 \|\| >=26`（與 30.1.3 相同） |

## Readability 解析路徑（`src/parseArticle.mjs`）

| 項目 | 現況 |
|---|---|
| jsdom 使用站點 | 全專案一處：`parseArticle.mjs` 之 `new JSDOM(html, { url, virtualConsole })`；未設 `runScripts`／`resources` → 不執行 script、不載子資源、不發請求（帳本 R-JSDOM-QUIET） |
| 對呼叫端 console | 靜音（`new VirtualConsole()`）：jsdom 31 起畸形 CSS 會對預設 console 印「Could not parse CSS stylesheet」，已隔絕 |
| 對外結果之已知差異（相對 jsdom 30.x） | `style="DISPLAY:NONE"` 等屬性名大寫之 inline style 現判為隱藏（與瀏覽器一致），README 已載明 |
| 測試 | `test/unit-parseArticle.test.mjs` 46 案（不對外取資源、script 不執行、inline style 隱藏判定 18 列、不寫 console、錯誤邊界與輸入形態 15 列、title、站點接線 2 案）；另有多檔經 `parseArticle` 走到 Readability 路徑 |
| 已知缺口（未修） | `parseArticle` 對深層巢狀頁面無守門：Readability 耗時超線性（800 層約 1.5 秒、1600 層約 14.6 秒、3000 層逾 3 分鐘不返回，同步佔滿事件迴圈），與 jsdom 版本無關；**待裁示**（`sgud/feedback/feedback.md` 第 5 列） |

## 最近一次驗證

- 2026-11-14：`WFETCHWEB_SKIP_HEADED=1 npm test`（經測試鎖）**570 passing／11 pending／0 failing**（修前同法 524／11／0，差 46＝`unit-parseArticle` 新增案；pending 名單修前修後逐項相同）。有頭檔 `api-fetchWebByPlaywrightHeadFlow` 依規範略過，**該檔未跑**。跑前、跑後讀 Windows 錯誤密碼次數皆 0。
- 本輪成果尚未提交與發布（由主控處理）；`dist/` 於發布時重產，本輪未建置。
