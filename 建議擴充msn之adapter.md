# 建議擴充 msn 之 adapter（致 w-fetch-web）

- 撰寫日期：2026-09-11
- 對應版本：w-fetch-web 1.0.17（`node_modules/w-fetch-web/package.json:3`）
- 提案方：tai-kns-trade（量化交易知識庫；本專案已以呼叫端 adapter 在用，見第 8 節）
- 行號皆取自 1.0.17 原始碼，可重跑 `node tmp/msn-proposal-entities.mjs` 核對；實測數據可重跑 `node tmp/msn-proposal-verify.mjs`

---

## 0. 摘要

**w-fetch-web 1.0.17 能不能抓 msn？**

| 使用方式 | 結果 | 依據 |
|---|---|---|
| 預設（無 adapter，`method:'auto'`） | **不能**。msn 被分流為 SPA，跳過 curl 直接走三層瀏覽器，三層都判為空內容；1.0.15、1.0.16 實測單篇 68.8～69.7 秒後失敗 | 分流：讀碼（第 1.1 節）；耗時：實測，1.0.17 未重測（第 1.2 節） |
| `method:'curl'`（無 adapter） | **不能**。只拿到約 15KB 的前端空殼 | 2026-09-09 實測 |
| 註冊本提案的 fetch adapter | **能**。ar（文章）3 篇、vi（影片逐字稿）3 篇，`auto` 與 `curl` 各跑一次共 12 次，12 次成功，每次只經 adapter 一階，0.1～0.3 秒 | 2026-09-11 實測（第 7 節 ③） |

**建議**：把 msn 列為第三個內建 adapter，也是第一個使用 **fetch 掛點**的內建 adapter。它不去爬頁面，而是改打站方的 content API，把回傳的 JSON 組成 HTML，再交給套件既有的 Readability 解析。

**這份提案在 msn 之外還抓到一個套件層的缺口**（第 4.3 節、第 10 節 Q5）：`fallback:false` 只擋得住「fetch 本身失敗」。fetch 成功後若被內建判識擋下，或解析出的正文不足 `MIN_CONTENT`，套件仍會續走後續各階，而且最後回報的歸因會被最後一階蓋掉。這兩條都已用替身重現。本提案在 adapter 內自行處理掉這兩條（`inspect:false` 加上 fetch 內的正文下限檢查），但任何使用 `fallback:false` 的 fetch adapter 都會遇到同一個缺口。

---

## 1. 問題：為何現行版本抓不到

### 1.1 執行計畫（讀碼，靜態控制流）

- msn 網域列在 `HEADLESS_REQUIRED_PATTERNS`（`src/routeByUrl.mjs:99-100`）。
- `method:'auto'` 時，`buildPlan` 因此跳過 curl，計畫變成 `headless → headed → camofox`（`src/buildPlan.mjs:126-127`）。
- 指定 `method` 時只跑單一階、不升級（`src/buildPlan.mjs:101-108`）。

### 1.2 實測

| 日期 | 版本 | 方式 | 結果 |
|---|---|---|---|
| 2026-09-09 | 1.0.15 | curl | HTTP 200、15,319 bytes 空殼、`<title>MSN</title>`；`captcha`／`challenge`／`cloudflare`／`Are you a robot`／`enable JavaScript` 出現 0 次；正文所在的 DOM 節點不在回應中（`執行工作紀錄.md:1840`） |
| 2026-09-09 | 1.0.15 | auto 階梯 | `playwright-headless` 判 empty → `playwright-headed` 判 empty → `camofox` snapshot 87→0→0 字，**69.7 秒全部失敗**（`執行工作紀錄.md:1842`） |
| 2026-09-10 | 1.0.16 | 預設、無 adapter | **68.8 秒失敗**；headless「minimal visible text (48 chars in 61618 bytes HTML)」，headed 48 字／60,190 bytes，camofox 0 字 |
| 2026-09-11 | 1.0.17 | 無 adapter 的瀏覽器階 | **未重測**：會啟動 playwright／camofox，前次觸發 Windows 防火牆詢問。計畫形狀同第 1.1 節；empty 判識門檻（可見文字 <200、HTML >5000 bytes，`src/inspectHtml.mjs:47`、`:50`）下，48 字／61KB 仍會判 empty——**推測結果相同，需實測確認** |

**判讀**：這不是反爬蟲。回應裡沒有任何挑戰頁標記，正文根本不在該網址回傳的文件內，是前端渲染後才注入的。camofox 解決的是「被認出是機器人」，解決不了「內容不在這份文件裡」，所以換更強的瀏覽器也沒用，只是付出最貴的代價（約 70 秒）換同一個失敗。

---

## 2. 站方 content API

| 項目 | 內容 | 依據 |
|---|---|---|
| 端點 | `https://assets.msn.com/content/view/v2/Detail/en-us/<id>` | 實測 |
| id | 網址尾碼 `ar-<id>` 或 `vi-<id>` 中的 `<id>` | 實測 |
| 認證 | 不需要，GET 即可 | 實測 |
| 回應 | JSON；ar 與 vi 皆含 `title`、`body`（HTML 片段）、`sourceHref`、`authors`、`type`、`publishedDateTime`，vi 另含 `videoMetadata` | 2026-09-11 ① |
| 以 `fetchWebByCurl` 取得 | 6/6 成功，HTTP 200，10,077～24,550 bytes，皆可 `JSON.parse`。雖然該函數寫死 `Accept: text/html,application/xhtml+xml`（`src/fetchWebByCurl.mjs:97`），站方仍回 JSON | 2026-09-11 ① |
| 語系 | 路徑中的語系不影響內容：同一 id 以 en-us／en-in／zh-tw／ja-jp／en-gb 呼叫，body 雜湊完全相同（2026-09-11 ②）；2026-09-09 另測 15 種語系亦完全相同（`執行工作紀錄.md:1843`） | 實測 |
| 不存在或已下架 | HTTP 410 | 2026-09-11 ① |
| 過往抽測 | 12 篇成功 11（`執行工作紀錄.md:1843`）；20 篇成功 19，平均正文 6,027 字（`執行工作紀錄.md:1846`） | 實測 |
| 官方文件 | **本提案未查到**（未做網路調研），應視為沒有穩定性承諾的端點 | — |

---

## 3. 網址型別與涵蓋範圍

資料來源：本專案佇列中的 msn 文件共 725 篇（2026-09-11 統計），分為 ar 710、vi 12、gm 3。

| 型別 | API 表現（2026-09-11） | 經 fetchWeb＋本提案（2026-09-11） | 處置 |
|---|---|---|---|
| `ar-<id>` 文章 | `type=article`；抽 3 篇，body 可見文字 1,682～6,060 字 | 3/3 成功（auto 與 curl 各一次） | **命中** |
| `vi-<id>` 影片 | `type=video`；body 為影片逐字稿；抽 3 篇，可見文字 1,098～13,263 字 | 3/3 成功（auto 與 curl 各一次） | **命中** |
| `gm-<id>` | 抽 2 篇 API 皆回 410；以 curl 抓網頁亦判 empty（0 字／約 42KB，最終一輪為 42,332 與 42,044 bytes） | 不命中，照原流程走（curl 判 empty） | **不命中**：此端點不提供，無可替代來源 |
| 其他 msn 路徑（首頁、分類頁等） | 無 id | 不命中 | 不命中 |

**match 規則**：`/^https?:\/\/(?:www\.)?msn\.com\/[^?#]*\/(ar|vi)-([A-Za-z0-9]+)(?:[/?#]|$)/i`

- id 之後必須是 `/`、`?`、`#` 或字串結尾：msn 內容 id 不含 `-`，所以 `/ar-foo-bar` 這種一般路徑段不會被誤判成內容 id。全量掃描佇列 725 篇（2026-09-11，`tmp/msn-id-scan.mjs`）：`ar-`／`vi-`／`gm-` 之後的段含 `-` 者 0 篇；本規則命中 ar 710、vi 12，不命中的恰為 gm 3 篇。
- 查詢字串（如 `?ocid=BingNewsSerp`）、語系段、有無 `www.` 都不影響命中。
- `msn.com.evil.example` 這類仿冒網域不命中。
- 命中時回傳 `{ kind, id }`，由 `findAdapter` 當作 ctx 傳給 fetch（`src/findAdapter.mjs:84`）。

---

## 4. 建議實作

> 以下是**提案程式碼，不是 w-fetch-web 現有實作**。其邏輯已原樣寫成呼叫端 adapter，在 `tmp/msn-proposal-verify.mjs` 實跑過（第 7 節）。兩者只在排版與訊息文字上不同（實跑版訊息為中文）。

### 4.1 落點

新增 `src/fetchMsn.mjs`，命名比照既有的 `parseGelonghui.mjs`／`parseBloomberg.mjs`，並在 `src/defaultAdapters.mjs` 加第三筆。

```js
//src/fetchMsn.mjs
import fetchWebByCurl from './fetchWebByCurl.mjs'
import estimateVisibleText from './estimateVisibleText.mjs'
import { MIN_CONTENT } from './constants.mjs'

let API = 'https://assets.msn.com/content/view/v2/Detail/en-us/'
let RE = /^https?:\/\/(?:www\.)?msn\.com\/[^?#]*\/(ar|vi)-([A-Za-z0-9]+)(?:[/?#]|$)/i

let esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function matchMsn(url) {
    let m = String(url).match(RE)
    return m ? { kind: m[1].toLowerCase(), id: m[2] } : null
}

async function fetchMsn(url, opt, ctx) {

    //經curl取得: 沿用請求身分、逾時、重試、HTTP狀態判準與測試接縫
    let curl = typeof opt?._fetchers?.curl === 'function' ? opt._fetchers.curl : fetchWebByCurl
    let r = await curl(API + ctx.id, opt)
    if (r?.status !== 'success') {
        return r
    }

    let j
    try {
        j = JSON.parse(r.html)
    }
    catch (err) {
        return { status: 'error', reason: 'parse-error', message: 'msn api: response is not JSON' }
    }
    let body = typeof j?.body === 'string' ? j.body : ''
    if (!body.trim()) {
        return { status: 'error', reason: 'empty-response', message: 'msn api: no body' }
    }

    //正文不足須於此擋下: 解析失敗會續走後續階, 不受fallback拘束(見runPlan之解析失敗路徑)
    let n = estimateVisibleText(body).length
    if (n < MIN_CONTENT) {
        return { status: 'error', reason: 'empty-content', message: 'msn api: body visible text ' + n + ' < ' + MIN_CONTENT }
    }

    let title = typeof j?.title === 'string' ? j.title.trim() : ''
    return {
        status: 'success',
        html: '<!DOCTYPE html><html><head><title>' + esc(title) + '</title></head><body><article><h1>' + esc(title) + '</h1>' + body + '</article></body></html>',
    }
}

export { matchMsn, fetchMsn }
```

```js
//src/defaultAdapters.mjs 增列(置於gelonghui、bloomberg之後; 三者網域不重疊, 順序不影響命中)
    Object.freeze({
        id: 'msn',
        match: matchMsn,
        fetch: fetchMsn,
        inspect: false,
        fallback: false,
    }),
```

**不會形成循環 import**：`src/` 內只有 `fetchWeb.mjs` 引入 `defaultAdapters.mjs`，而引入 `fetchWeb.mjs` 的只有 `WFetchWeb.mjs`（對 `src/` 全範圍 grep）。`fetchWebByCurl.mjs` 的直接依賴見其 `:1-10`，其中沒有前兩者。

### 4.2 設計取捨

| 決定 | 理由 | 依據 |
|---|---|---|
| **fetch 掛點**，不用 parse 掛點 | 正文不在網址的 HTML 內，parse 掛點拿到的只是空殼，無從解析 | 第 1.2 節 |
| fetch 內經 **`fetchWebByCurl`** 取 API，不用 Node `fetch` | 沿用請求身分（`src/fetchWebByCurl.mjs:77`）、`timeoutMs`、`withRetry` 重試（`:141`；5xx 與 429 可重試、其餘 4xx 不重試，`src/httpStatus.mjs:17-22`）、HTTP 狀態判準（`:113`），失敗 reason 也直接是登記值；另可經 `opt._fetchers.curl` 以替身測試 | 讀碼；替身路徑見第 7 節 ⑤ |
| 回**完整 HTML 文件**交給 Readability，不自己抽正文 | 結果形狀、`MIN_CONTENT` 判準、`contentLength` 計算都沿用套件既有路徑；`method` 恆為 `adapter`、另帶 `adapterId`（`src/runPlan.mjs:123-125`、`src/finalizeResult.mjs:86-87`） | 第 7 節 ③ |
| **`fallback:false`** | API 失敗時落回爬取，msn 只會拿到空殼或瀏覽器全滅（約 70 秒），還會把「API 失敗」的真正歸因換成 `empty` | `src/runPlan.mjs:207-214`；第 7 節 ④ |
| **`inspect:false`** | 內容來自 API，不是爬回來的頁面；挑戰頁、轉址殼、空殼這些判識對它只可能誤判。只關內建判識器，呼叫端自己的 `opt.detectors` 仍會比對（`src/runPlan.mjs:253-259`）；`opt.inspect=false` 的總開關位階仍較高（`src/fetchWeb.mjs:95`） | 第 4.3 節 ① |
| **fetch 內檢查正文下限** | 見第 4.3 節 ② | 第 4.3 節 ② |
| 一律以 **en-us** 呼叫 | 語系不影響內容，不需解析網址中的語系 | 第 2 節 |
| **不處理 gm** | API 回 410，沒有替代來源 | 第 3 節 |

### 4.3 `fallback:false` 管不到的兩條路（本提案之所以要 `inspect:false` 與正文下限）

`fallback` 只在 adapter 的 fetch **回傳失敗**時生效（`src/runPlan.mjs:207-214`）。fetch 成功之後，執行路徑上還有兩個攔阻點會 `continue` 到下一階：

- **判識未通過** → 記為 blocked，續下一階（`src/runPlan.mjs:261-279`）
- **解析失敗** → 視為 empty，續下一階（`src/runPlan.mjs:299-307`）

全部失敗時，回報的歸因取**最後一階**（`src/runPlan.mjs:311-316`）。另一個攔阻點「內網位址複驗」只在套件自行推導網址（`_depth>0`）時才檢查（`src/runPlan.mjs:238`），這裡不適用。

以 `opt._fetchers` 把四個抓取器全部換成會記錄呼叫的替身，實測如下（2026-09-11，不發網路、不開瀏覽器）：

| 情境 | adapter 設定 | method | 結果 | adapter 之後實際被呼叫的抓取器 | 最終 reason |
|---|---|---|---|---|---|
| ① 標記重（300 個 `<img>`）、可見文字 120 字 | inspect 預設 | auto | error | playwrightHeadless、playwrightHead、camofox | `curl-error`（最後一階替身的歸因） |
| ① 同上 | inspect 預設 | curl | error | curl（打 msn 頁面） | `curl-error` |
| ① 同上 | **inspect:false** | auto | **success**，contentLength 120 | 無 | — |
| ② body 為 `<p>short</p>` | 無正文下限 | auto | error | playwrightHeadless、playwrightHead、camofox | `curl-error` |
| ② 同上 | 無正文下限 | curl | error | curl（打 msn 頁面） | `curl-error` |
| ② 同上 | **有正文下限** | auto | **error**，只經 adapter 一階 | 無 | **`empty-content`** |
| 邊界：可見文字 49 字 | 有正文下限 | auto | error | 無 | `empty-content` |
| 邊界：可見文字 50 字 | 有正文下限 | auto | success，contentLength 50 | 無 | — |

換成真實抓取器，前兩種缺口的代價是：`auto` 模式多開三層瀏覽器（第 1.2 節，約 70 秒），而且呼叫端收到的歸因與真正原因無關。

**殘餘風險**：正文下限用 `estimateVisibleText` 估算 body，Readability 實際取出的正文可能略少。估算剛好 ≥50、而 Readability 取出 <50 的內容仍會續走後續階。實測 50 字邊界時兩者一致（contentLength 50）；本專案 L5 抽測的 msn 8 篇中最短為 231 字（`執行工作紀錄.md:1894`），離邊界很遠。兩者在真實文章上的差距未另做實測。

### 4.4 失敗歸因對照

| 失敗點 | reason | 產生者 | 是否續走後續階 | 實測 |
|---|---|---|---|---|
| HTTP 4xx／5xx（含 410） | `http-error` | `fetchWebByCurl` → `checkHttpStatus` | 否 | 真網路 410（④）；替身 410、503（⑤） |
| 連線失敗／逾時 | `curl-error` | `fetchWebByCurl` | 否 | 替身（⑤） |
| 回應本文 <100 字 | `empty-response` | `fetchWebByCurl`（`:15`、`:123-131`） | 否 | 替身（⑤） |
| 回應非 JSON | `parse-error` | fetchMsn | 否 | 替身（⑤） |
| JSON 無 body | `empty-response` | fetchMsn | 否 | 替身（⑤） |
| 正文可見文字 <`MIN_CONTENT` | `empty-content` | fetchMsn | 否 | 替身（⑤） |
| fetchMsn 或其內部拋錯 | `adapter-fetch-error` | `runFetchSafely`（`src/runPlan.mjs:94`） | 否（`:208-209`） | 替身（⑤） |

以上 reason 皆已登記於 `REASONS`（`src/constants.mjs:39-84`），⑤ 逐筆以 `Object.hasOwn(REASONS, reason)` 驗證為真。`src/` 內新增的 reason 字面量由 `unit-reasons` 的守門測試自動檢查（`test/unit-reasons.test.mjs:22`）。後三列的 reason 選用屬語意延伸，列為第 10 節 Q1 待維護者決定。

### 4.5 `routeByUrl` 的 msn 條目

加入內建 msn 後，ar／vi 網址在 adapter 階就結束：成功直接回傳；失敗因 `fallback:false` 也就此結束（④：`auto` 下 410 只有 `attempts:['adapter']`，0.2 秒）。因此 `HEADLESS_REQUIRED_PATTERNS` 的 msn 條目（`src/routeByUrl.mjs:100`）之後**只影響沒命中的 msn 網址**（gm 與非內容頁）。這些網址在 `auto` 下仍會跳過 curl、直接走三層瀏覽器。gm 走瀏覽器的結果未實測（curl 路徑已知判 empty）。這個條目保留或移除，列為第 10 節 Q3。

---

## 5. 對呼叫端的影響

| 面向 | 變化 | 依據 |
|---|---|---|
| ar／vi 網址，`auto` | 由失敗（1.0.15／1.0.16 實測約 70 秒）變成 0.1～0.3 秒成功 | 第 1.2 節、第 7 節 ③ |
| ar／vi 網址，`curl` | 由判 empty 失敗變成成功 | 同上 |
| ar／vi 網址，`playwright`／`camofox` 單階 | adapter 階仍插在指定 method 之前（`src/buildPlan.mjs:88-93`），成功時不啟動瀏覽器 | ⑤：兩者皆 `attempts:['adapter']` |
| 結果欄位 | `method` 由原本的抓取器名稱變為 `'adapter'`，另帶 `adapterId:'msn'`；有依 `method` 分支的呼叫端會看到新值 | `src/finalizeResult.mjs:71`、`:86-87` |
| 覆寫內建 | 使用端 adapter 排在內建之前（`src/fetchWeb.mjs:97-99`），`findAdapter` 只取第一個命中者（`src/findAdapter.mjs:59`、`:84`） | ⑥：使用端同網域 adapter 勝出 |
| 停用內建 | 沒有停用內建的選項（`src/fetchWeb.mjs:98-99` 無條件合併）。唯一的作法是註冊同網域 adapter 回 `{status:'skip'}` 走原流程；此時**不會再輪到內建 msn** | ⑥：`adapter-fetch-skip` → curl，內建 msn 被呼叫 0 次 |
| gm 與非內容頁 | 不變 | 第 3 節 |
| 速率 | 2026-09-11 以腳本跑 4 輪，每輪約 30 次請求（多數間隔 0.9 秒），未觀察到 429（① ② 未開重試）；2026-09-09 以 44 篇／分跑 20 篇未受限（`執行工作紀錄.md:1846`）。站方限額未知 | 實測 |

README 需同步：`opt.adapters` 說明中的內建清單「gelonghui、bloomberg」（`README.md:91`）要加上 msn。

---

## 6. 測試建議

比照 `test/unit-builtinAdapters.test.mjs` 的結構：各站台各一個 `describe`，另設「經fetchWeb之adapter機制接線」段（`:276`）。

| 群組 | 案例 | 斷言 |
|---|---|---|
| match | ar／vi 命中並回 `{kind,id}`；語系段、查詢字串、無 `www`、id 後接 `/`／`#`；gm、他站、仿冒網域、`/ar-foo-bar` 不命中 | 值相等 |
| fetchMsn（替身 `opt._fetchers.curl`） | 第 4.4 節七種失敗點；成功時 HTML 含轉義後的標題與原樣 body；以 en-us 端點呼叫一次 | reason 字面量、請求網址、呼叫次數 |
| 正文下限 | 可見文字 49 → `empty-content`；50 → 成功 | 邊界兩側 |
| 經 fetchWeb 接線 | `auto`、`curl`、`playwright`、`camofox` 下成功時 `attempts` 只有一筆 adapter、`method:'adapter'`、`adapterId:'msn'`；失敗時四個抓取器替身皆未被呼叫 | 記錄型替身的呼叫清單為空 |
| 判識豁免 | 標記重（>5000 bytes）、可見文字 50～199 字的 body → 成功 | 替身清單為空 |
| 覆寫 | 使用端同網域 adapter 勝出；回 `skip` 時走原流程 | `adapterId`、attempts |

**fixture 請用真實量級**：同檔「上兩條接線測試對fixture大小之依賴」（`:304-312`）已記錄過小的 fixture 會讓 empty 判識永不觸發。msn 的判識豁免案例必須超過 `EMPTY_HTML_MIN_BYTES`（5000），才驗得到 `inspect:false` 真的生效。建議在 `test/tools/fixtures.mjs` 新增 `msnApiJson({ type, title, body })`。

選配：`api-` 真網路測試各一篇 ar、vi，以及一個 410 id。

---

## 7. 實測紀錄（2026-09-11，w-fetch-web 1.0.17）

腳本：`tmp/msn-proposal-verify.mjs`（樣本取自本專案佇列，唯讀）；輸出：`tmp/msn-proposal-verify.log`、`tmp/msn-proposal-verify.json`。以下為最終一輪的結果。

| # | 內容 | 結果 |
|---|---|---|
| ① | `fetchWebByCurl` 直打 API | ar 3/3、vi 3/3 成功（HTTP 200，10,077～24,550 bytes，各 0.2～0.3 秒）；gm 2/2 回 410；不存在的 id 回 410 |
| ② | 同一 id、5 種語系路徑 | body 雜湊完全相同 |
| ③ | 提案設計經 `fetchWeb` 端到端（ar 3、vi 3 × `auto`／`curl`） | 12/12 成功；`method:'adapter'`、`adapterId:'msn'`、`attempts` 只有 adapter；contentLength：ar 4,992／1,686／6,060，vi 1,550／13,263／1,098；0.1～0.3 秒。gm 2 篇不命中，以 curl 走原流程判 empty |
| ④ | 不存在的 id，`auto` | error、`http-error`、`attempts:['adapter']`、0.2 秒，未落回瀏覽器 |
| ⑤ | 替身失敗點矩陣（18 列） | 第 4.3、4.4 節；所有失敗 reason 皆已登記 |
| ⑥ | 使用端覆寫 | 同網域使用端 adapter 勝出；`skip` → 走原流程，內建 msn 被呼叫 0 次 |

---

## 8. 本專案的參考實作與使用數據

- 實作：`srcPack/fetchers/siteAdapters.mjs`（`msnAdapter`），單元測試 `srcPack/test/unit-siteAdapters.test.mjs` 21 項。
- 與本提案的差異：

| 項目 | 本專案（呼叫端） | 本提案（內建） | 差異原因 |
|---|---|---|---|
| 取 API | Node `fetch`＋`AbortSignal.timeout` | `fetchWebByCurl` | 本專案版先寫成，未改；兩者實測皆可取得。改用套件抓取器的好處（請求身分、重試、測試接縫）對內建 adapter 更重要 |
| 無 body 或正文不足 | `empty` | `empty-response`／`empty-content` | 本專案沿用自身日誌既有的歸因；內建建議分開，以便呼叫端區分（Q1） |
| ctx 缺 id | 回 `adapter-fetch-error` | 不檢查 | 內建的 match 命中時必定帶 id |
| match、`inspect:false`、`fallback:false`、正文下限 | 相同 | 相同 | — |

- 使用數據：
  - 呼叫端 adapter 接入前以腳本試跑 20 篇，成功 19（`執行工作紀錄.md:1846`）。
  - 以真實組裝路徑（抓取器 → adapter → 正規化 → 落庫）對佇列 msn 8 篇（原本 new 4、已判 dead 4）加非 msn 2 篇跑補全文階段：10/10 成功、共 4.6 秒（`執行工作紀錄.md:1894`）。
  - 升版 1.0.15 → 1.0.17 同網址 A/B 35 篇：退化 0（`執行工作紀錄.md:1870`）。
  - 佇列中 msn 725 篇，改用 adapter 前 curl 路徑成功率為 0%。

---

## 9. 驗收判準

1. 以預設選項 `fetchWeb(<ar 網址>)` → `status:'success'`、`method:'adapter'`、`adapterId:'msn'`、`attempts.length === 1`。
2. vi 網址同上，正文為逐字稿。
3. `method` 為 `curl`、`playwright`、`playwright-headed`、`camofox` 時，成功路徑都不呼叫任何抓取器。
4. 410 → `status:'error'`、`reason:'http-error'`、`attempts` 只有 adapter，不啟動瀏覽器。
5. 正文可見文字 49 → `empty-content` 且不續走；50 → 成功。
6. 標記重、可見文字 50～199 字 → 成功（`inspect:false` 生效）。
7. gm 網址行為與加入前相同。
8. 使用端同網域 adapter 可覆寫內建；回 `skip` 時走原流程。
9. `unit-reasons` 仍全綠；既有測試全綠。

---

## 10. 待維護者決定

| # | 問題 | 本提案的預設 | 取捨 |
|---|---|---|---|
| Q1 | 非 JSON 用 `parse-error`、無 body 用 `empty-response`、正文不足用 `empty-content`，是否接受？ | 接受 | 三者的登記說明分別寫「Readability或adapter之parse」「curl階」「解析出之正文」（`src/constants.mjs:47`、`:55`、`:56`），用在 fetch 內屬語意延伸。另一個作法是新增專用值（如 `adapter-fetch-empty`），需登記於 `REASONS`，由 `unit-reasons` 守門 |
| Q2 | 內建 adapter 內部讀取 `opt._fetchers.curl` 是否可接受？ | 接受 | 該接縫目前的註解定位是測試用途（`src/runPlan.mjs:57-60`），內建 adapter 使用等於擴大它的涵蓋範圍。另一個作法是讓 `fetchMsn` 以參數注入 curl，測試直接呼叫 `fetchMsn`，但接線測試就驗不到 fetch 內部 |
| Q3 | `routeByUrl` 的 msn 條目保留或移除？ | 保留（不擴大本提案範圍） | 保留：gm 與非內容頁在 `auto` 下仍走三層瀏覽器（gm 瀏覽器路徑未實測）。移除：改走 curl 起始的四階，1.0.17 下未實測 |
| Q4 | 是否輸出 `sourceHref`（原出版商網址）、`authors`、`publishedDateTime`？ | 不輸出 | `finalize` 成功結果只帶固定欄位（`src/finalizeResult.mjs:71-102`），要輸出須擴充結果形狀；`sourceHref` 對知識庫類呼叫端追溯原出處有用 |
| Q5 | （套件層，不限 msn）`fallback:false` 是否應該也涵蓋 fetch 成功後的判識攔阻與解析失敗？ | 本提案先在 adapter 內處理 | 第 4.3 節的兩條缺口對所有 `fallback:false` 的 fetch adapter 都成立。若不改語意，至少建議在 `adapterContract.mjs` 的 fallback 說明（`:21`）註明「只管 fetch 失敗」 |

---

## 11. 風險與限制

- **端點穩定性**：沒有查到官方文件，站方隨時可能改變路徑、欄位或加上限制。應有 `api-` 真網路測試定期偵測。
- **速率限制**：站方限額未知（第 5 節）。
- **gm 型別**不支援（第 3 節）。
- **1.0.17 無 adapter 的瀏覽器路徑未重測**（第 1.2 節）。
- **正文下限的殘餘風險**（第 4.3 節末）。
- **`en-us` 固定**：已測 5 種（2026-09-11）與 15 種（2026-09-09）語系內容相同；未涵蓋的語系或地區限定內容未測。
