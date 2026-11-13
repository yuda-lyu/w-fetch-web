# 規則帳本

本檔為特有之規則帳本,為要求程式碼須長成什麼樣,包含軸、單一擁有者、已知限制、破壞性變更紀錄,由agent自行編列、擴充與維護.

**盤點指令**（改動涉及某條規則時，動工前跑一次對照數字，改完再跑一次並於回報附輸出）：

| 規則 | 指令 | 現值 |
|---|---|---|
| 站台特化知識之分佈 | `node test/tools/auditSiteRules.mjs`（含掃描範圍自檢，漏掃即非零離開碼） | 站台全集 15、跨處出現 **3**（google／msn／weixin）。msn 已自 inspectHtml 移除（其真殼頁由 empty 接住），但新增為內建 fetch adapter（`defaultAdapters`＋`fetchMsn`），故仍跨處——路由與取得是兩種知識。跨處**不是缺陷**，理由見二之「C1 之裁決」 |
| HTTP 狀態檢核之抓取器涵蓋 | `grep -c "checkHttpStatus" src/fetchWebByCurl.mjs src/runPlaywright.mjs` | 各 1；camofox 取不到狀態碼（見三） |
| 判識器數 | `grep -c "type: DETECT" src/inspectHtml.mjs` 減 2（非成員：空字串入口、pass 出口） | 18 |
| 判識型別數 | `grep -c "^let DETECT_" src/constants.mjs` | 5 |
| 抓取方法數 | `grep -c "^let METHOD_" src/constants.mjs` 減 1（`METHOD_AUTO` 為輸入選項非方法名） | 5（含 `adapter`） |
| 使用端擴充點之錯誤邊界 | `ls src/*Contract.mjs` | 3：`adapterContract`／`detectorContract`／`fetchContract` |
| 盤點腳本自檢之有效性 | `npx mocha test/unit-auditSelfCheck.test.mjs` | 5 條全綠；**逐一移除每個 SOURCES 條目都必須被抓到** |
| 失敗歸因數 | `node -e "import('./src/constants.mjs').then(m=>console.log(Object.keys(m.REASONS).length))"` | 24 |
| `routeByUrl` 之 pattern 組數 | `grep -c "_PATTERNS = \[" src/routeByUrl.mjs` | 5 |
| `runPlan` 單階管線之出口數與 adapterId 展開點 | `grep -c "return done(" src/runPlan.mjs`；`grep -c "\.\.\.stamp" src/runPlan.mjs` | 5（4 個失敗出口＋1 個成功出口）皆經 `done()`；`...stamp` 只出現 2 次（`done` 內對紀錄與結果各展開一次）。此前以 `rec: { method, ...stamp` 計數，只數得到已套者，新出口漏套時照樣回 5（複審指出） |
| Chromium 系之啟動一律經 w-playwright（w-playwright 帳本 R-PW-ONLY） | ``rg -n --glob '*.{mjs,js}' --glob '!**/node_modules/**' --glob '!**/dist/**' "(from\s+\|import\(\s*\|require\(\s*)['\"\`]playwright(-core)?['\"\`/]" .``；`rg -n --glob '**/package.json' --glob '!**/node_modules/**' '"playwright(-core)?"\s*:' .`；防空集合：同一正則對 w-playwright 之 `src/_pw.mjs` 須命中 | 0／0（2026-11-13 遷移後；`src`、`test`、`toolg`、根目錄腳本、含動態 import）。`dist/` 於發布時重產，不在範圍 |
| 可達瀏覽器之測試檔皆裝基底拒絕替身 | `rg -l "from '\.\./src/(runPlaywright\|fetchWebByPlaywrightHeadless\|fetchWebByPlaywrightHead\|runPlan\|fetchWeb\|WFetchWeb)\.mjs'" test` 之每一檔須含 `import './tools/noBrowser.mjs'` 或匯入 `sharedChrome.mjs`（後者已帶入前者）：`rg --files-without-match "tools/(noBrowser\|sharedChrome)\.mjs" <上列檔>` 須 0 行（注意 `rg -L` 是跟隨連結、不是「不含者」，曾因此誤用）；防空集合：把任一檔去掉該匯入之副本須被列出 | 21 檔（2026-11-13）：16 檔直接匯入 `noBrowser`、5 個真 Chrome 檔經 `sharedChrome`。新增匯入上列模組之測試檔未加者即「未套」 |
| 瀏覽器啟動點全集（R-PW-WIRING） | `rg -n "wpw\.(launchChromium\|launchChromiumPersistent)\(" src` | 1：`src/runPlaywright.mjs` 之 `_runOnce`（無頭、有頭兩階以 `cfg.launch` 區分）。接線測試 `unit-playwrightWiring` 逐階斷言；逐點變異（改回不經 wpw 之寫法）見經驗八 |
| jsdom 使用站點全集與其接線（R-JSDOM-QUIET：解析不執行 script、不載子資源、不寫呼叫端 console） | `rg -c "new JSDOM\(" src`；`rg -c "new VirtualConsole\(\)" src`；`rg -c "^\s*(runScripts\|resources\|pretendToBeVisual)\s*:" src`（防空集合：把 `src/parseArticle.mjs` 之 `virtualConsole` 選項去掉之副本，第二條須減為 0） | 1／1／0（2026-11-14，jsdom 31.0.0；站點為 `src/parseArticle.mjs` 之 `new JSDOM`）。接線測試 `unit-parseArticle` 之「src內jsdom使用站點之接線」兩案由程式碼取得站點全集、逐點斷言（新增站點先紅）；逐點變異（去掉 `virtualConsole`；加 `resources:'usable'`）見經驗九。**日後若為任一站點設 `runScripts`／`resources`，須重新決定哪些 jsdomError 要轉印，並重跑經驗九之等價比對** |

## 〇、輸入空間之軸（建表與審查的起點）

凡要對本套件建笛卡兒表（全域 §2.1 第 3 條），軸取自下表；**成員數以 grep 自碼取得，不憑記憶**。

| 軸 | 成員 | 取得方式 |
|---|---|---|
| 抓取方法 | 5：curl／playwright-headless／playwright-headed／camofox／adapter | `constants.mjs` 之 `METHOD_*`（`adapter` 為使用端 fetch 掛點所取得，不對應任何內建抓取器） |
| adapter 掛點 | 3：fetch／inspect／parse | `adapterContract.mjs` 之輸入契約；三者各自獨立可只註冊其一 |
| 內容形態 | 2：`raw`／`synthesized` | `extractPageContent` 三出口、`snapshotToHtml` 恆為合成 |
| 判識器 | 18 | `inspectHtml.mjs` 之 `DETECTORS`（grep `type: DETECT` 得 20，扣除非成員 2 處） |
| 判識器來源 | 2：內建／使用端註冊（`opt.detectors`） | `inspectHtml` 合併清單處 |
| 判識型別 | 5：pass／captcha／verify／redirect／empty | `constants.mjs` 之 `DETECT_*`；使用端可註冊者為其中 4 種（不含 pass） |
| 證據形態 | 2：structural／semantic | `DETECTORS` 各項之 `evidence` |
| 證據強度 | 2：strong／weak | `DETECTORS` 各項之 `strength`；**僅內建有此軸**，使用端判識器不受內容量閘門管轄 |
| 失敗歸因 | 24 | `constants.mjs` 之 `REASONS`（含四種判識型別——它們經 `reason: inspection.type` 流入同一欄位） |
| 站台特化規則 | `routeByUrl` 5 組（11 條）＋ `inspectHtml` 3 條 ＋ `defaultAdapters` 3 個（gelonghui／bloomberg／msn）＋ `fetchMsn` 1 份 | 以 `auditSiteRules` 盤點；`inspectHtml` 側原為 5 條，站台名 msn／google news 已自 `WRAPPER_TITLES` 移除 |
| 內建 adapter 清單之取捨 | 3：可逐站覆寫／整份停用（`useDefaultAdapters:false`）／剔除某一個（停用後以匯出之 `defaultAdapters` 過濾） | `fetchWeb.mjs` 組合 adapters 處 |
| 解析路徑 | 3：Readability／內建 adapter／使用端 adapter | `parseArticle` ＋ `findAdapter` |
| 重試結果 | 3：成功／可重試失敗／不可重試失敗 | `withRetry` 之 `retryable` |
| 選項邊界 | 型別不符／0／負數／數字字串／Infinity／超過計時器上限 | `getOpt.mjs` 兩層檢核 |
| 執行環境 | Chrome 有無／camofox 有無／CI／有頭可用 | `test/tools/env.mjs`＋`hasChrome`（2026-11-13 起以 `wpw.findSystemChrome` 只判存在，不啟動瀏覽器） |
| 瀏覽器啟動之拒絕（經 w-playwright） | 5：正常／`PWDEBUG` 為 inspector 值（E_ENV）／`SELENIUM_REMOTE_URL` 有值（E_ENV）／`playwright-core` 版本≠內附表（E_PW_VERSION）／`W_PLAYWRIGHT_LOGON_GUARD` 開且錯誤密碼次數≥1（E_LOGON_GUARD） | w-playwright README〈API〉之 code 表；本套件一律經 `_runOnce` 之 catch 轉為 `playwright-error`（仍依 `maxRetries` 重試） |

**新增擴充點時必問的閘門清單**（新掛點會不會被既有閘門變成 no-op；已踩過三次，見經驗七）：

| 閘門 | 對新掛點的影響 |
|---|---|
| 內容量閘門（`SPARSE_VISIBLE_MAX`） | 會。判識器機制曾因此在其唯一動機情境下失效 |
| `opt.parse` | 會。曾使 `adapter.inspect` 完全不生效 |
| `opt.method` | 會。若拿它閘 `adapter.fetch`，註冊了也不會跑 |
| `opt.inspect` | 會。是判識這件事的總開關 |
| `step.inspect`（camofox 曾為 false） | 會。該階曾把攔阻頁樣板當文章回傳 |
| `adapter.inspect` | 會。曾一併關掉**呼叫端自己註冊的** detectors，違反 `detectorContract` 的明文保證 |
| 內容量閘門（對**內建**判識器） | 會，但**下判斷前必須先量真實頁面**。曾據一個錯誤數字（「真殼頁 1822 字」，實際 /read/ 殼頁為 0、首頁 724~775）把 Google News 判識器改標 strong，使真實 /topics/ 頁由 success 變 error。**強度與粒度必須一起調**，且兩者都要有量測值 |

判準：**閘門的軸與被閘的軸必須是同一個**，不是的話就是借來的權威。

**已知的軸間耦合**（列表時不可當成獨立軸）：

- 內容形態 × 證據形態：合成內容只比對 semantic 類，structural 類的證據已被剝除
- 判識器來源 × 內容量閘門：閘門只管內建的弱判準。使用端註冊者一律比對——閘門是為了保護套件
  對全世界頁面所下的猜測，而呼叫端是因為內建漏判了他實際遇到的頁面才註冊；且該機制的動機情境
  （長篇非英語攔阻頁）依定義就在閘門之上，套了等於讓它在唯一動機情境下必然無效
- 內容形態 × 內容量門檻：合成與否由 `SHADOW_VISIBLE_THRESHOLD` 決定，與 `EMPTY_VISIBLE_MAX` 必須同值
- 抓取方法 × 判識：四階**一律**做判識。camofox 階原為 `inspect:false`，其兩條理由皆已不成立（見 buildPlan 檔頭）
- 判識型別 × 後續行為：判為 `redirect` 會令後續 Playwright 階改以等待轉址方式抓取
- 解析路徑 × 階梯：adapter 解析失敗**會繼續升級階梯**（換抓取器可能得到不同 html），但**不退回 Readability**；
  命中之**具 fetch 掛點**的 adapter 宣告 `fallback:false` 時其 adapter 階**不續走**——涵蓋該階受 fallback 管的三個失敗出口（fetch／判識／解析），見一之 `_mayEscalate`；
  只有 parse 掛點者沒有 adapter 階，此欄對其無作用（已文件化）
- adapter 階之失敗出口 × `fallback`：三個出口一體適用。曾只在 fetch 出口生效（另兩個無條件續走），由安裝方提案發現；
  結構性原因是三個出口各自手寫尾段，去留決定沒有單一擁有者
- 去留決定 × reason 之來源：去留依**出口**（stage）判斷，不依 reason 字串——fetch 與 parse 出口的 reason 是呼叫端自由值。
  本輪第一版以 reason 反推出口，呼叫端自報保留名即改寫去留（雙複審各自以替身重現）

## 一、已確立的單一擁有者

| 決定 | 擁有者 | 備註 |
|---|---|---|
| 失敗歸因 `reason` 之值域 | `src/constants.mjs` 之 `REASONS` | 實作端仍寫字面量，一致性由 `unit-reasons` 守門；對外契約是值域不是變數名 |
| 抓取方法名稱 | `src/constants.mjs` 之 `METHOD_*` | 守門於 `unit-valueDomains`；`METHOD_AUTO` 為**輸入**選項，不得流入結果之 `method` |
| `opt.method` 之合法值域 | `src/buildPlan.mjs` 之 `METHOD_VALID` | 錯誤訊息由它產生；此前取自 `METHOD_OPTIONS` 之鍵而漏掉 `'auto'` |
| 判識型別 | `src/constants.mjs` 之 `DETECT_*` | 守門於 `unit-valueDomains`；使用端可註冊之子集見 `detectorContract` 之 `VALID_TYPES` |
| 判識器契約 | `src/detectorContract.mjs` | 輸入形狀、預設值、錯誤邊界，以及**內容量閘門不適用於使用端判識器**之理由 |
| 內容量閘門之適用範圍 | `src/inspectHtml.mjs` 之 `_isVolumeGated` | 單一判斷點；此前散在迴圈條件式內 |
| 時間戳格式與取值時機 | `src/fetchedAt.mjs` | 兩種格式分屬兩個對外表面，統一任一邊皆為破壞性變更 |
| adapter 契約 | `src/adapterContract.mjs` | 輸入形狀、輸出檢核、錯誤邊界、MIN_CONTENT 門檻；三個掛點（fetch／inspect／parse）各自獨立 |
| 抓取端契約 | `src/fetchContract.mjs` | 抓取器之輸出檢核與錯誤邊界；對四個內建抓取器與 adapter 之 fetch 一視同仁 |
| 測試接縫（`opt._fetchers`）之取用規則 | `src/fetcherSeam.mjs` | 原寫在 `runPlan` 內；內建 msn adapter 之 fetch 亦經同一接縫呼叫 curl，故抽出，不在 adapter 內手寫第二份 |
| msn 之網址比對與內容 API 端點 | `src/fetchMsn.mjs` | `defaultAdapters` 只登記 `{id, match, fetch, inspect, fallback}`；站台知識本體在此檔（已列入 `auditSiteRules` 之 SOURCES）。收 `ar-`（文章）與 `vi-`（影片，逐字稿），語系固定 en-us（11 種語系實測回應相同） |
| 某階失敗後是否續走 | `src/runPlan.mjs` 之 `_mayEscalate` | 四個失敗出口皆諮詢此一函數；決定表以**出口**為鍵：guard 否、非 adapter 階 是、fetch 出口之契約錯誤 否、fetch 出口之 skip 是、其餘依 `wantsFallback`。此前只有 fetch 出口諮詢 `fallback`；本輪第一版以 reason 字串反推出口，呼叫端自報保留名即改寫去留（雙複審抓到） |
| adapter 階紀錄與結果之 `adapterId` | `src/runPlan.mjs` 之 `_runStep` 的 `done()` | 一次決定、單一展開點；各出口只描述自己特有的欄位，漏帶在語法上不可能。此前四處手寫、第五處（內網複驗）漏寫；本輪第一版改為五處各自展開 `...stamp`，複審以突變測試證實拿掉其中一處無測試會紅。收攤時頂層之 `adapterId` 由 `runPlan` 自紀錄帶入、`finalize` 錯誤分支輸出 |
| 單階管線（抓取→內網複驗→判識→解析） | `src/runPlan.mjs` 之 `_runStep` | 只回報 `{stage, rec, parsed, redirectHint}`，不做去留決定；`runPlan` 迴圈只剩推入紀錄、記錄訊息、更新轉址旗標、問 `_mayEscalate` |
| 內建 adapter 清單之組合 | `src/fetchWeb.mjs` 之 `useDefaultAdapters` 處 | 前置 `opt.adapters`、依旗標決定是否附加內建；剔除單一內建由呼叫端以匯出之 `defaultAdapters` 過濾 |
| HTTP 請求身分 | `src/requestIdentity.mjs` | curl 帶預設、瀏覽器只帶明確指定者（理由見該檔） |
| 挑戰元件特徵 | `src/challengeResources.mjs` | 判識器與有頭模式點擊共用；後者由前者衍生。三大 CAPTCHA（reCAPTCHA／hCaptcha／Turnstile）皆須涵蓋。**含 managed challenge 之 frame host 與 Turnstile 容器選擇器**——這兩項曾是該知識的第三份手寫複本，留在 `fetchWebByPlaywrightHead` 內，而本檔第 1 行自稱單一擁有者 |
| SSRF 之目標位址檢核 | `src/isInternalHost.mjs` | 只把關**套件自行推導**之網址（轉址參數提取），不把關呼叫端給定者——後者是呼叫端的決定 |
| HTTP 狀態之失敗判準與可重試性 | `src/httpStatus.mjs` | 四個抓取器共用；此前只寫在 `fetchWebByCurl` 內，playwright 兩階完全看不到狀態碼 |
| adapter 之挑選時機 | `src/fetchWeb.mjs` 之 `findAdapter` 呼叫處 | 計畫產生前一次；只取決於網址，與抓回之 HTML 無關。內容可能來自轉址後的別站，故 `parse` 另收 `meta.finalUrl` 供其自行判斷 |
| 轉址旗標之最終值 | `src/runPlan.mjs` 之 `_runFetcher` | 取「計畫判定」與「呼叫端指定」之聯集，不是覆寫 |
| 判識豁免之站台範圍 | adapter 之 `inspect` 欄（契約見 `adapterContract`） | 只做關不做開；`opt.inspect` 位階較高 |
| 重試骨架與退避訊息 | `src/withRetry.mjs` | |
| 抓取器註冊表 | `src/runPlan.mjs` 之 `FETCHER_BY_KEY` | 四套命名的唯一交會點 |
| 測試環境開關 | `test/tools/env.mjs` | `hasChrome` 例外，留在自己的檔（理由見該檔） |
| 瀏覽器之啟動（參數合併、守門、Playwright 版本） | 自有套件 `w-playwright`（`wpw.launchChromium`） | 本套件只決定 `cfg.launch`（各階之 headless／channel／args），唯一啟動點為 `src/runPlaywright.mjs` 之 `_runOnce`；不直接依賴 `playwright`／`playwright-core`（版本由 w-playwright 精確釘定） |
| 測試之真瀏覽器共用（每檔至多啟動一次） | `test/tools/sharedChrome.mjs` | 以 `wpw.setBrowserTypeForTest` 使同檔之全部嘗試共用一個瀏覽器行程；各檔之真啟動以跨行程鎖（`test/_tmp/sharedChrome/launch.lock`）依序進行；被替身取代之部分寫於該檔 |
| 測試中禁止未經共用之真啟動 | `test/tools/noBrowser.mjs` | 載入即安裝且永不還原之基底替身（一律拒絕）；`sharedChrome`／接線測試之替身疊其上，還原後回到它——擋住 auto 模式意外升級與逾時後殘存之重試（外審 terra #1、#2） |
| 測試之守門判讀（恰一串、居末、含守門與預設清單） | `test/tools/guardFacts.mjs` | 接線測試與各真 Chrome 檔之「至多一次」案共用 |
| 測試執行參數 | `package.json` 之 `scripts.test` | 由外部統一控制器管理；`runCoverage` 從此處解析，不另寫一份 |

**跨模組耦合**（改一處必須同時改另一處，已有測試守門）：
`inspectHtml` 之 `EMPTY_VISIBLE_MAX` ＝ `extractPageContent` 之 `SHADOW_VISIBLE_THRESHOLD`。

## 二、同一決定曾分裂的紀錄

**已收斂（勿再分裂）**：

| 曾分裂處 | 後果 |
|---|---|
| adapter 契約散在 3 處＋MIN_CONTENT 散在 4 處 | 文件、範例、測試只能各自從實作反推 |
| 挑戰資源清單 2 份（字串版／selector 版） | 加第二份時註解已寫明「同源」卻仍複製 |
| `reason` 35 處 13 值 12 檔 | 無處可查完整值域，README 亦未列舉 |
| 預設 UA 字串 2 處（實作＋JSDoc） | JSDoc 改了實作不會失效 |
| 測試前綴分類同時寫在全域規範與 `.mocharc.yml` | 全域改了專案內複本不會跟著改 |

**待收斂**：

| 分裂處 | 現況 |
|---|---|
| 站台知識之**可覆寫性**不對稱 | `defaultAdapters` 可經 `opt.adapters` 覆寫，`routeByUrl` 的 5 組完全不可；兩者同屬「安裝方要維護的知識」，應然是兩者都可覆寫（`CLAUDE.md` 原則一：內建清單是預設值）。方向見下方「C1 之裁決」 |

### C1 之裁決：站台知識**不合併**（經雙獨立複審）

「同一站台出現在多處」曾被列為唯一的待收斂項。**該問題陳述本身是錯的**，故不再視為待收斂。

跨處出現者（現為 google／weixin），其兩處知識**本來就該分開**：

| | 路由（`routeByUrl`） | 判識（`inspectHtml`） |
|---|---|---|
| 判準 | 網址 | HTML 內容狀態 |
| 時機 | 抓取前 | 抓取後 |

**以網址為鍵的合併方案（C1a）已否決**，理由不是成本而是判準不成立，且有兩個方向：

1. **誤判**（更嚴重，會打壞現行主流程）：msn 走 `requiresHeadless`、weixin 走 `requiresCamofox`，
   兩者**都不換網址**。該站的「JS 未跑的空殼」與「渲染完成的文章」網址完全相同——
   網址在那裡**零判別力**。現行靠內容量閘門區分（實測空殼 visible=0、真文章 2520）。
   改以 host 為鍵會對兩者都命中，四階皆 block，**該站永久抓不到**。
2. **漏判**：`navigateWithRedirectWait` 刻意等待網址離開原 host，故 JS_REDIRECT 那 4 條
   （linkedin ×2、news.google ×2）的內容依設計來自別的網域，而結果之 `url` 仍為請求值。

「判識綁站台卻不看網址」不是缺陷，是正確的分工。

**盤點腳本仍是這件事的控制手段**（`node test/tools/auditSiteRules.mjs`），且已加入**掃描範圍自檢**：
SOURCES 以外的 `src` 檔案若出現已知廠商或站台識別字串即以非零離開碼結束。
加自檢的理由是該腳本自己漏過兩次（見經驗一之第 10、11 次）。

**待辦（下一步，非本輪）**：讓路由可被呼叫端覆寫。兩位複審都認為值得做，
但都指出它**不解分佈問題**（adapter 的 `inspect` 只是布林，承載不了判識知識），
故它解的是上表那條可覆寫性不對稱，不是「跨處出現」。
另 `URL_PARAM_PATTERNS` 發生在 `fetchWeb` 最開頭且會遞迴重入，時序上未必能一併下放。

## 三、已知限制與刻意不修

| 項目 | 狀態 |
|---|---|
| **camofox 不可並發** | 固定埠 19377，就緒探測不驗證 server 身分。已文件化於 `fetchWebByCamofox`／`fetchWeb` JSDoc 與 README；需並行時須給不同 `port` |
| 2 個 pending 測試 | camofox 未安裝分支（已安裝機器不適用）、真實瀏覽器測試（需 `WFETCHWEB_TEST_CAMOFOX=1`），皆為環境相依 |
| `postNavigationWaitMs` 兩階不同值 | headless 3000／headed 5000，差異自初版即存在且未見記錄，兩數字未經量測；已於註解標明而非編造理由 |
| Linux `killProcessTree` | 只有 stub 測試，未在真 Linux 主機執行過 |
| **camofox 階取不到 HTTP 狀態** | 其 snapshot 回應無目標頁之狀態碼（但**有** `url`，故 `finalUrl` 四階皆可填）。故四階中僅此階無 HTTP 狀態檢核——限制來自上游 API 而非本套件疏漏 |
| playwright 之狀態檢核只看首次導航 | 頁面內 JS 轉址後之最終頁狀態不在該 Response 內。要涵蓋須掛 `page.on('response')` 逐一比對，成本與收益不成比例，暫不做 |
| **不追蹤內容的最終網址** | curl 帶 `-L`、`navigateWithRedirectWait` 刻意等網址離開原 host，但兩者回傳之 `url` 皆為請求值（`page.url()` 全專案只出現於一則 JSDoc 範例）。複審指出這已在傷害既有的以網址為鍵者（adapter 可能被餵到別站的 HTML、JSDOM base url 錯），且是任何「以網址為鍵」方案的硬前置。**取得方式不難（curl `%{url_effective}`、`page.url()`），本輪未做是因排序在四個必修缺陷之後** |
| SSRF 檢核擋不住 DNS rebinding | `isInternalHost` 只看字面主機名；公開網域名解析到私有位址者看不出來。要擋須解析 DNS 並釘住位址後再連線，而連線由 curl 與 playwright 執行，非本套件直接控制 |
| `parse-error` 混用「parse 拋錯」與「回傳形狀錯誤」 | 後者（非物件、`success` 非布林）多為確定性程式錯，對任何 html 都一樣錯，卻與拋錯同樣續走階梯（`fallback` 預設下至多白走三次瀏覽器）。要區分須新增 reason 值（值域變更），複審 A 提出，**另案待決** |
| `isValidAdapter` 接受 `{fetch: fn, parse: 'oops'}` | 只要求 fetch 與 parse 至少一個是函數；型別錯的另一個被靜默忽略（parseArticle 走 Readability、fetchWeb 不插 adapter 階）。屬「有 prop 卻無效」，複審 A 提出，**另案待決** |
| `fallback` 對只有 parse 掛點之 adapter 無作用 | 沒有 fetch 掛點就沒有 adapter 階；其 parse 失敗恆續走（換抓取器可能得到不同 html）。已於 adapterContract／README 文件化並有測試釘住；要讓它生效屬新語意（「我的 parse 失敗時別再換爬法」），未有需求前不做 |
| 未執行的 43 行 | 20 行瀏覽器內 callback（結構性不可測）、16 行環境相依、其餘為錯誤邊界 |

## 四、破壞性變更紀錄

| 時點 | 變更 | 理由 |
|---|---|---|
| R7 | `attempts` 成功紀錄之 `contentLength` 改名 `htmlLength` | 與頂層 `contentLength`（正文長度）同名不同義 |
| 第四輪 | `custom-parser-miss` → `adapter-parse-miss` | `custom parser` 為 adapter 機制之前的舊稱；且需與 `adapter-parse-failed` 區分語意 |
| D4 | `invalid-method` 之訊息補上 `'auto'` | 原訊息列舉合法值時漏掉 `'auto'`——它既合法又是預設值。安裝方若曾以字串全等比對該訊息需改；改為比對 `reason === 'invalid-method'` 即不受影響 |
| P0 | adapter 之 `match` 拋錯改為**抓取前**回報，`attempts` 由 4 筆變 0 筆 | 原本錯誤在解析階才浮現，而解析失敗會續下一階，於是整條階梯 4 次網路抓取全部跑完、每階得到同一個錯誤。安裝方若曾讀 `attempts[0]` 取此類失敗之細節需改讀頂層 `reason`／`message`（兩者值不變）。與 `invalid-url`／`invalid-method` 之形狀就此一致 |
| — | playwright 兩階新增 HTTP 狀態檢核 | 同一個回 4xx／5xx 的網址，此前 curl 回 `error`／`http-error` 而 playwright 回 **`success` 並帶回錯誤頁 HTML**（實測）。安裝方若原本在 playwright 階拿到站台 404 頁的內容並自行處理，現在會改收到 `reason:'http-error'`。這正是要消除的靜默出錯：錯誤頁多半有完整版面與大量文字，不會被 `empty` 攔下，呼叫端無從察覺拿到的是錯誤頁 |
| — | playwright 兩階之結果新增 `httpCode` 欄 | 純新增欄位，與 curl 階之結果同形。curl 自初版即有此欄，playwright 沒有 |
| — | `waitForRedirect` 改為聯集而非覆寫 | 呼叫端傳 `true` 此前被靜默丟棄（實測抓取器實收 `false`），而它是 `fetchWebByPlaywrightHeadless` 之公開選項。安裝方若倚賴「傳了也沒用」之現況（不太可能）才會受影響 |
| — | camofox 階改為做判識 | 該階原 `inspect:false`，其兩條理由現皆不成立（「合成內容」已被 `contentKind` 取代、「末階無可升級」與 `method:'curl'` 單階矛盾）。實測四階皆取回同一份 Cloudflare 挑戰頁時，camofox 階把樣板當文章回傳。安裝方若原本會在該階拿到攔阻頁內容並自行處理，現在改收到 `reason:'captcha'` |
| — | `REASONS` 補上 `captcha`／`verify`／`redirect`／`empty` | 此四值呼叫端本來就收得到（`reason: inspection.type`），但不在自稱「完整值域」的表內，依 README 寫的分支會落到 default。純補登記，行為不變 |
| — | `parse:false` 時仍解析 adapter | 此前 `parse:false` 即不挑 adapter，於是其 `inspect` 宣告形同不存在（實測 `match` 呼叫次數 0、白跑四階）。安裝方若在 `parse:false` 下註冊了會拋錯 `match` 的 adapter，現在會新收到 `adapter-error` |
| P1 | 新增 `METHOD_ADAPTER='adapter'` 與 `adapterId` 欄 | `method` 是呼叫端據以分支的公開列舉，新增值屬破壞性變更。理由夠格：內容來源確實不是本套件任一抓取器，沿用四值之一即為不實回報；而呼叫端因此獲得「以自有來源取得內容、同時沿用套件之判識與歸因」這個原本拿不到的能力。安裝方若有 `switch(method)` 需加一分支 |
| P1 | 抓取器之錯誤邊界 | 抓取器拋錯此前會使 `fetchWeb` **reject**，違反其 JSDoc 明載之「本函數不會 reject」。現轉為 `reason:'fetcher-error'`。安裝方若對 `_fetchers` 測試接縫寫過 try/catch，該 catch 不再被觸發 |
| — | 結果新增 `finalUrl` 欄、`parse` 新增第四參數 `meta` | 皆為純新增。`url` 語意不動（本套件最後實際發出請求的網址），`finalUrl` 為內容實際來源，兩者相同時不輸出。理由：此前 adapter 收到「A 站的網址配 B 站的內容」（實測），Readability 之 JSDOM base url 亦錯 |
| — | `WRAPPER_TITLES` 移除 `msn`／`google news`，比對改前綴 | 實測 MSN 真殼頁 title 完全相等於 `"MSN"`、visible=0、35786 bytes，`empty` 本來就接得住；Google News 中文標題為「Google 新聞」，該條目根本認不得。留著的淨效果只有「MSNBC 被判成 MSN 殼頁」這種跨站誤判，且 msn 被歸錯類（SPA 卻判 `redirect`）使有頭階空等轉址 20 秒。安裝方若倚賴 msn 殼頁回 `reason:'redirect'`，現改回 `'empty'` |
| — | 內建 adapter 新增 `msn`（fetch 掛點、`fallback:false`） | msn 文章頁（`/ar-`）改經內容 API 取得。此前預設路徑實測三層全滅、每篇白耗 43 秒；改後 12/12 真實文章成功、每篇約 0.2 秒。安裝方若已自行註冊 msn adapter：其排在內建之前，**行為不變**，可視需要移除自己的那份；若要維持舊行為，傳 `useDefaultAdapters:false` 或以 `defaultAdapters.filter` 剔除 `msn` |
| — | 新增 `opt.useDefaultAdapters`（預設 `true`） | 純新增。此前內建清單恆被附加、無法停用或剔除，只能以回 `status:'skip'` 之假 fetch 搶先命中來繞過 |
| — | 推導而來之抓取新增 `internal-address` 歸因 | 轉址參數提取所得之網址（`_depth>0`），抓取後若解析至內網位址即回此歸因而不交出內容。呼叫端明確給定之網址不受影響 |
| — | `fallback:false` 改為涵蓋**整個 adapter 階** | 此前只擋 fetch 失敗；fetch 成功後被判識擋下或解析未取得足量正文時仍續走其餘各階（auto 下為三層瀏覽器），且最終歸因被末階蓋掉。以真實 msn 影片頁重現：逐字稿 31 字 → 應回 `empty-content`，實回 `camofox-empty` 且白耗 43 秒。安裝方唯一受影響的情況是倚賴「宣告了 `fallback:false` 但判識擋下後仍落回」——那正是被消除的靜默出錯，不成立。安裝方若曾在 adapter 內自行檢查正文下限以繞過此缺口（提案方即如此），現可移除 |
| — | 內建 msn adapter：改收 `/vi-` 影片頁、語系固定 en-us、加 `inspect:false`、不再以 `type` 白名單擋 | vi 以 6 篇真實影片頁實測（`type:'video'`、body 為逐字稿）；11 種語系路徑回應完全相同而不合法語系回 400，取網址語系只多一個失敗點；`inspect:false` 之理由見 `defaultAdapters.mjs`（API 組出之 HTML 來源已知，內建判識對它只有誤判一個方向，圖多字少者已以替身重現被判 `empty`）。match 要求內容段之前至少一段路徑：語系代碼 ar-ae／ar-sa／vi-vn 本身以 ar-／vi- 開頭，否則其首頁會被當成內容頁（複審以真實網址抓到）。安裝方若倚賴 vi 網址走瀏覽器階梯（該路徑對 ar 實測成功率 0，vi 未另量），可以 `useDefaultAdapters:false` 或自行註冊同網域 adapter 覆寫 |
| 2026-11-13（排程第 442 項） | 瀏覽器改經 w-playwright 啟動；移除 `playwright` 依賴 | 原本直接以 playwright 之 `chromium.launch` 啟動；Windows 上 Chromium 153 起每啟動一個根行程即以無效密碼呼叫一次 `LogonUser`，10 分鐘 10 次即鎖帳號，而本套件每次嘗試各啟動一次（預設至多 6 次），屬「會靜默出錯」之行為（使用者帳號被鎖、抓取端毫無徵兆）。新行為：每次啟動恰一串 `--disable-features`（含 `AutofillAiWalletPrivatePasses`）；`PWDEBUG`（inspector 值）／`SELENIUM_REMOTE_URL`／版本不符／登入守門拒絕時回 `playwright-error`；**啟動失敗之 `message` 改為 w-playwright 之固定詞彙**（不含 Playwright 原錯誤之命令列與路徑）。安裝方須配合：仍須安裝 Google Chrome；若曾以 `message` 字串判斷啟動失敗之細節需改讀 `reason`；勿另裝 `playwright`。實際引擎版本不變（遷移前 `playwright@1.64.1` 帶巢狀之 `playwright-core@1.64.1`；頂層 1.65.0 為 camofox 之相依，未被本套件之啟動使用） |
| — | 於 adapter 階收攤之失敗結果，頂層新增 `adapterId` | 純新增。`fetchWeb` JSDoc 此前即宣稱「紀錄與頂層皆另帶」，但 `finalize` 之錯誤分支未輸出（複審指出）；可收攤之出口由一個增為三個後，只讀頂層的呼叫端須知道是哪一個 adapter 決定的。落回後階梯耗盡者不帶 |
| 2026-11-14（jd-fw2） | `jsdom` 由 `^30.1.3` 升至 `31.0.0`（major）；`parseArticle` 之 `new JSDOM` 改傳不轉印之 `virtualConsole` | 依使用者 2026-11-09 之升級原則（新版滿冷卻期且調研無疑慮即升，破壞性更新連動調適）。**等價比對**（88 個輸入：既有測試輸入 12、合成 script／style／style 屬性／大型／畸形 66〔含 13 種邊界輸入〕、真實頁面 10；修前＝HEAD 之 src 加鎖定樹 jsdom 30.1.3，修後＝31.0.0）：`parseArticle` 對外輸出（success／reason／message／title／content）差 **1／88**——`style="DISPLAY:NONE"`（屬性名大寫）此前被判無效而元素「可見」，31 起正確判為隱藏，Readability（只讀 `node.style.display/visibility`）據此少取該區塊，**與瀏覽器一致，屬解析改善，不調適**，已寫入 README 並以測試鎖定；其餘 87 項輸出逐字相同。**須調適者 1 項**：31 起每個無法解析之樣式表經預設 virtualConsole 在呼叫端 `console.error` 印一行「Could not parse CSS stylesheet」（30.x 靜默；實測一個括號不成對、宣告未結束之樣式表，每解析一次印 4 行），故改傳 `new VirtualConsole()`，行為回到升級前，安裝方不需配合。**未造成差異之 31 破壞性變更**：①解析改非同步、遇阻塞式 script 暫停——本套件未設 `runScripts`／`resources`，84 個可建構之輸入皆同步時與 settle 後元素數相同、零請求、阻塞點之後內容完整（建構子返回時 `document.readyState` 由 `loading` 變 `interactive`，無人讀取）；②CSS 引擎重寫之 computed style 差異——Readability 不呼叫 `getComputedStyle`；③canvas 後端改 `@napi-rs/canvas`——本套件不用。**連帶之傳遞相依**：parse5 8.0.1→8.1.0 使序列化時屬性值內之 `<`／`>` 轉義為 `&lt;`／`&gt;`（4／88 之 DOM 序列化位元組不同、1 個頁面之 Readability `content` HTML 不同）；`parseArticle` 只回傳 `textContent` 衍生之 `content`，故無外部影響。詳見經驗九 |

## 五、驗證慣例

- 覆蓋率：`npm run cov`。報表分「整行未執行」與「行內分支未覆蓋」——
  兩者混報會把「少一個 `||` fallback」誇大成「整行未測」，曾因此誤判主要業務路徑沒被測到。
- 覆蓋率原始資料須**逐 process 計算後取聯集**：測試會 spawn 子行程，跨份混算會得出錯誤數字。
- 新增 `src/` 模組時一併建同名測試檔；共用核心（被多處 import 者）尤其不可只靠整合測試覆蓋。
- **真瀏覽器之測試**（2026-11-13 起）：會啟動真 Chrome 者只有 5 檔——`api-fetchWebByPlaywrightHeadless`、`api-httpStatus`、`api-fetcherRetry`、`api-requestIdentity`（無頭）、`api-fetchWebByPlaywrightHeadFlow`（有頭，會開可見視窗）；每檔經 `sharedChrome` 至多啟動一次並以末案斷言之。跑之前後讀目前使用者之錯誤密碼次數（增加即停）；在有人使用之主機上以 `WFETCHWEB_SKIP_HEADED=1` 略過有頭檔。其餘檔不啟動瀏覽器（以「封鎖 playwright 匯入」之掛鉤實測確認，見經驗八）。
- **改動範圍 → 測試檔**（本套件無 e2e）：瀏覽器啟動（`runPlaywright`、`fetchWebByPlaywright*` 之 `cfg.launch`）→ `unit-playwrightWiring` ＋ 上列 5 檔；`test/tools/sharedChrome.mjs`、`hasChrome.mjs`、`guardFacts.mjs` → 上列 5 檔＋`unit-playwrightWiring`；`jsdom`／`@mozilla/readability` 升版或 `src/parseArticle.mjs` → `unit-parseArticle`＋全部非瀏覽器測試（Readability 路徑被 `api-fetchWeb`、`api-finalUrl`、`unit-escalation`、`unit-fetchWebDispatch` 等多檔經 `parseArticle` 走到），另依經驗九重跑修前／修後等價比對；其餘依上方盤點表各規則之測試。
