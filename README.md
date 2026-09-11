# w-fetch-web
A tool for fetch web.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-fetch-web.svg?style=flat)](https://npmjs.org/package/w-fetch-web) 
[![license](https://img.shields.io/npm/l/w-fetch-web.svg?style=flat)](https://npmjs.org/package/w-fetch-web) 
[![npm download](https://img.shields.io/npm/dt/w-fetch-web.svg)](https://npmjs.org/package/w-fetch-web) 
[![npm download](https://img.shields.io/npm/dm/w-fetch-web.svg)](https://npmjs.org/package/w-fetch-web) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-fetch-web.svg)](https://www.jsdelivr.com/package/npm/w-fetch-web)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-fetch-web/global.html).

## Installation

### Using npm(ES6 module):
```alias
npm i w-fetch-web
```

Note:
- `fetchWebByCurl` needs `curl` in system PATH.
- `fetchWebByPlaywrightHeadless` and `fetchWebByPlaywrightHead` need Chrome installed (playwright uses `channel: 'chrome'`).
- `fetchWebByCamofox` spawns the `@askjo/camofox-browser` server as a child process, and needs the Camoufox binaries fetched by that package's postinstall.

Concurrency:
- `fetchWebByCamofox` binds a **fixed port** (default `19377`) and **must not run concurrently on the same port**. A second concurrent call fails to bind, then mistakes the first call's server for its own; whichever finishes first kills that server, and the other one fails with `camofox-error`. To run several at once, give each call a distinct `port`.
- This also applies to `fetchWeb` in `auto` mode, since its last escalation step is `fetchWebByCamofox`. Methods ①②③ have no such limit.

#### Functions:
| function | description |
| --- | --- |
| `fetchWeb(url, opt)` | fetch and parse an article, auto escalating through the 4 methods below |
| `fetchWebByCurl(url, opt)` | fetch raw html by system curl |
| `fetchWebByPlaywrightHeadless(url, opt)` | fetch raw html by playwright headless Chrome |
| `fetchWebByPlaywrightHead(url, opt)` | fetch raw html by playwright headed Chrome, with verification checkbox auto click |
| `fetchWebByCamofox(url, opt)` | fetch raw html by Camofox anti-detect browser, through accessibility snapshot |

#### Example for fetchWeb:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-fetch-web/blob/master/g.mjs)]
```alias
import w from 'wsemi'
import wi from 'w-fetch-web'

let test = async () => {

    let url = 'https://example.com/'

    //auto模式, 自動由curl起階梯升級, 並以Readability解析出標題與內文
    let r1 = await wi.fetchWeb(url)
    console.log('auto+parse:', r1.status, r1.method, r1.title, r1.contentLength)
    // => auto+parse: success curl Example Domain 111

    //不解析, 直接取原始HTML
    let r2 = await wi.fetchWeb(url, { parse: false })
    console.log('auto+html:', r2.status, r2.method, r2.html.length)
    // => auto+html: success curl 559

    //指定抓取方法, 並關閉階梯升級過程訊息
    await w.pmSeries(['curl', 'playwright'], async (method) => {
        let r = await wi.fetchWeb(url, { method, showLog: false })
        console.log('method=' + method + ':', r.status, r.method, r.contentLength)
        // => method=curl: success curl 111
        // => method=playwright: success playwright-headless 125
    })

    //直接呼叫單一抓取方法, 回傳原始HTML不解析
    let r3 = await wi.fetchWebByCurl(url)
    console.log('byCurl:', r3.status, r3.httpCode, r3.htmlLength, r3.attempts)
    // => byCurl: success 200 559 1

    //失敗時回傳error結果物件, 不會reject
    let r4 = await wi.fetchWeb('abc')
    console.log('invalid:', r4.status, r4.message)
    // => invalid: error invalid url (must be http/https)

}
await test()
    .catch((err) => {
        console.log(err)
    })
```

#### Options for fetchWeb:
| key | type | default | description |
| --- | --- | --- | --- |
| `method` | String | `'auto'` | `'auto'`、`'curl'`、`'playwright'`、`'playwright-headed'`、`'camofox'`。塑形的是「要爬的時候用哪一種爬法」，不影響adapter之`fetch`是否執行 |
| `parse` | Boolean | `true` | 以Readability解析出`title`與`content`，`false`則回傳原始`html` |
| `showLog` | Boolean | `true` | 是否顯示階梯升級過程訊息 |
| `inspect` | Boolean | `true` | 是否以`inspectHtml`對抓取結果做原始內容判識，關閉後不因判定為挑戰頁或空內容而升級。此為**整次呼叫**之總開關，只想豁免特定站台請改用adapter之`inspect` |
| `adapters` | Array | `[]` | 站台adapter陣列，用於覆寫特定站台之取得、判識與解析方式，形狀為`{id,match,fetch,parse,inspect,fallback}`，使用端註冊者優先於內建（gelonghui、bloomberg） |
| `detectors` | Array | `[]` | 判識器陣列，用於補充內建判識器所不涵蓋之攔阻頁形態，形狀為`{type,message,test}`，使用端註冊者優先於內建 |
| `maxRetries` | Integer | `5` | 各抓取方法失敗時之最大重試次數，含初始共執行`maxRetries+1`次 |

其餘設定會轉傳給實際執行抓取之函數，例如`timeoutMs`、`navigationTimeoutMs`、`postNavigationWaitMs`、`port`等。

#### Attempts:
`attempts`為各階嘗試之紀錄，`status`只有三種：

| status | 意義 | 欄位 |
| --- | --- | --- |
| `success` | 取得並解析成功 | `method`、`htmlLength`（**原始HTML長度**，與頂層`contentLength`之正文長度不同） |
| `failed` | 抓取本身失敗 | `method`、`reason`、`message` |
| `blocked` | 取得內容但被判識或解析拒絕 | `method`、`type`、`reason`、`message` |

經adapter之`fetch`掛點者其`method`為`'adapter'`，且該筆紀錄另帶`adapterId`。

#### url 與 finalUrl:
結果之`url`是**本套件最後實際發出請求的網址**（含轉址參數提取後之目標）；內容若來自HTTP轉址或JS轉址之後的另一個網址，另帶`finalUrl`欄。一句話分辨：**`url`是我要了什麼，`finalUrl`是我拿到了什麼**。兩者相同時不輸出`finalUrl`，故呼叫端據「有沒有這個欄位」即知本次有無轉址。

兩者刻意分開：知識庫類呼叫端以`url`對回自己送出的網址、當主鍵，把它改成最終值會拿走那個能力；而不給`finalUrl`則使「內容其實來自別站」無從察覺。

判識所致之`blocked`，其`reason`與`type`同值，故呼叫端可一律讀`reason`取得失敗歸因。

#### Reasons:
`reason`為失敗歸因，供呼叫端分辨該重試、告警或修adapter。完整值域（權威定義見`src/constants.mjs`之`REASONS`）：

| reason | 意義 | 重試是否有用 |
| --- | --- | --- |
| `invalid-url` | 網址非字串或非http/https | 否 |
| `invalid-method` | `opt.method`不在支援清單內 | 否 |
| `http-error` | HTTP狀態碼為4xx或5xx（curl與Playwright兩階皆檢核，camofox階取不到狀態碼） | 5xx與429會自動重試，4xx否 |
| `empty-response` | HTTP回應本文過短（curl階） | 否 |
| `curl-error` | curl執行失敗（連線失敗、逾時等） | 是（已自動重試） |
| `playwright-error` | Playwright導航或取內容失敗 | 是（已自動重試） |
| `camofox-not-found` | 未安裝`@askjo/camofox-browser` | 否 |
| `camofox-error` | Camofox server啟動、tab建立或snapshot傳輸失敗 | 是（已自動重試） |
| `camofox-empty` | Camofox取得之snapshot確實無足量內容 | 否 |
| `parse-error` | Readability或adapter之`parse`拋錯或回傳非法結果 | 否 |
| `empty-content` | 解析出之正文未達最低字數 | 否 |
| `adapter-error` | adapter之`match`拋錯（顯性回報，不靜默改用預設解析器） | 否，須修adapter |
| `adapter-parse-failed` | adapter回`success:false`且未自報`reason` | 否 |
| `adapter-parse-miss` | adapter命中網域但頁面缺少其預期之結構 | 否 |
| `adapter-fetch-error` | adapter之`fetch`拋錯或回傳形狀不合契約（不落回階梯） | 否，須修adapter |
| `adapter-fetch-skip` | adapter之`fetch`表明此網址不適用，改由階梯抓取 | — |
| `fetcher-error` | 抓取器拋錯或回傳形狀不合契約 | 否 |
| `internal-address` | 套件自行推導之網址（轉址參數提取）於抓取後解析至內網或保留位址 | 否 |
| `captcha` | 判識為CAPTCHA或反爬蟲攔阻頁 | 否，該站需更高階抓取方法 |
| `verify` | 判識為驗證頁 | 否 |
| `redirect` | 判識為轉址包裝頁 | 否 |
| `empty` | 判識為空內容，或解析未取得足量正文 | 否 |
| `unknown` | 無上游歸因可用之退路值 | — |

後四者即`attempts`中`blocked`紀錄之`type`，判識所致者其`reason`與`type`同值。

使用端adapter可於`parse`回傳自訂之`reason`，該值會原樣保留至頂層與`attempts`，不受上表限制。

#### Adapters:
adapter用於覆寫特定站台之取得、判識與解析方式，形狀為`{id, match, fetch, parse, inspect, fallback}`。

三個掛點分屬管線的三個階段，**各自獨立，可只註冊其中之一**：

| 掛點 | 階段 | 回答的問題 |
| --- | --- | --- |
| `fetch` | 取得內容 | 這次要不要爬 |
| `inspect` | 內容判識 | 這份內容能不能用 |
| `parse` | 解析為文章 | 怎麼從這份內容取出正文 |


```js
let r = await fetchWeb(url, {
    adapters: [
        {
            id: 'mysite',                                  //必填, 供稽核與錯誤訊息
            match: /^https?:\/\/(?:www\.)?mysite\.com\//,  //必填, RegExp或(url)=>truthy
            parse: (html, url, ctx) => {                   //必填
                let m = html.match(/__NEXT_DATA__[^>]*>(.*?)<\/script>/)
                if (!m) {
                    return { success: false, reason: 'mysite-no-data', message: 'no __NEXT_DATA__' }
                }
                return { success: true, title: 'x', content: JSON.parse(m[1]).body }
            },
            inspect: false,                                //選填, 見下
        },
    ],
})
```

`match`為函數時其回傳值會作為`ctx`傳給`parse`（回`true`時`ctx`為`null`）。`parse`回傳`success:false`時可自報`reason`，該值原樣保留至頂層與`attempts`。

`parse`另有**第四個參數`meta`**，形狀為`{requestUrl, finalUrl, httpCode, method, contentKind}`。它存在的理由是：adapter必須以**請求網址**挑選（抓取前才知道要不要用`fetch`掛點），但內容可能來自轉址後的別站——`navigateWithRedirectWait`更是刻意等到host脫離原host。故套件把「這份內容實際來自哪裡」交給adapter，由知道該站台的人自己判斷，而不是由套件代為猜測。既有的三參數adapter不受影響（JS對多餘參數天生相容）。

**`inspect: false` 的用途**：通用判識會把「內嵌結構化資料但可見文字極少」的頁面判為空內容而升級，於是註冊了adapter、自知如何解析該站台的呼叫端，其adapter根本輪不到被呼叫。此欄使豁免範圍**只限該adapter命中之網址**；`opt.inspect`則是整次呼叫的總開關。

兩者不對稱是刻意的：`opt.inspect=false`位階較高，adapter不能把判識開回來——否則呼叫端就失去一個能一律關閉的總開關。此欄對內建與使用端adapter一視同仁。

adapter的挑選在計畫執行前只做一次（`match`只被呼叫一次，即使階梯升級跨多階）；`match`拋錯時**不發出任何請求**即回報`adapter-error`，`attempts`為空陣列。完整契約以`src/adapterContract.mjs`為唯一事實來源。

##### `fetch`：取代爬取

呼叫端手上若有更好的取得方式——官方API、內部快取、已登入的session、RSS——可用`fetch`掛點取代爬取，同時仍沿用本套件的判識、重試、歸因與結果形狀：

```js
let r = await fetchWeb(url, {
    adapters: [
        {
            id: 'my-api',
            match: /^https?:\/\/(?:www\.)?mysite\.com\//,
            fetch: async (url, opt, ctx) => {
                let id = url.match(/\/(\d+)$/)?.[1]
                if (!id) {
                    return { status: 'skip' }            //這篇我沒有, 交還給階梯
                }
                let res = await myApi.getArticle(id)
                if (!res.ok) {
                    return { status: 'error', reason: 'my-api-down', message: 'HTTP ' + res.status }
                }
                return { status: 'success', html: res.html }
            },
            fallback: true,                              //選填, 預設true
        },
    ],
})
// => { status: 'success', method: 'adapter', adapterId: 'my-api', title, content, ... }
```

命中時該階插在計畫**最前面**，成功即不動用任何抓取器。結果之`method`為`'adapter'`，並另帶`adapterId`（`method`只說得出「來自某個adapter」，說不出是哪一個）。`adapterId`亦出現在對應的`attempts`紀錄中。

**失敗分三個通道**：

| 回傳 | 處置 | `reason` |
| --- | --- | --- |
| `{status:'error', reason, message}` | 顯性失敗，依`fallback`決定續走階梯或收攤 | 保留你自報的值 |
| `{status:'skip'}` | 此網址不適用，**恆**續走階梯（不受`fallback`拘束） | `adapter-fetch-skip` |
| 拋錯／reject／非物件／`success`卻無`html`字串 | 契約錯誤，**一律不落回** | `adapter-fetch-error` |

`'skip'`獨立於`fallback`，是因為`match`只看得到網址，而「我的來源有沒有這一篇」常常要查了才知道——那不是失敗，是「我不該被算進來」。契約錯誤不落回則與`match`拋錯同構：呼叫端的程式碼壞了，靜默改用爬蟲會讓他永遠不知道。

**`opt.method`不影響`fetch`是否執行**。兩者回答的是不同問題：`opt.method`是「要爬的時候用哪一種爬法」，`fetch`是「這次要不要爬」；`method`指定的那一階就是`fetch`失敗後的落回對象。

`fetch`取得的內容**照常經過判識**（判識問的是「這份內容能不能用」，與內容從哪來無關）；不需要判識時以同一個adapter的`inspect: false`表達，不必另設旗標。

#### Detectors:
內建判識器之關鍵字全為英文。非英語之攔阻頁（如簡體中文之「正在进行安全检测」）內建一個都不認得，唯一的兜底是「可見文字過少」，而攔阻頁文案一長即失效——該頁會被當成一篇標題為「安全验证」的文章正常回傳，呼叫端無任何欄位可據以察覺。

套件的發版次數必然少於安裝方遇到新情況的次數，故此處提供註冊機制而非持續追加清單：

```js
let r = await fetchWeb(url, {
    detectors: [
        {
            id: 'cn-sec',                                        //選填, 供錯誤訊息辨識
            type: 'captcha',                                     //必填, 須為captcha/verify/redirect/empty之一
            message: '中文攔阻頁',                                //必填, 字串或(ctx)=>字串
            test: (c) => c.lower.includes('正在进行安全检测'),     //必填, (ctx)=>布林
        },
    ],
})
```

`test`收到的`ctx`為`{html, lower, title, titleLower, visible}`，其中`visible`為估算之可見文字且為惰性計算。命中者使該階判為`blocked`，`type`與`message`即所註冊者，`auto`模式據此升級至下一階。

須知的三點：

- **註冊者一定會被比對**。內建之弱判準受一道「內容量閘門」保護（可見文字過多即不比對，以免談論反爬蟲的正常長文被誤殺），該閘門**不套用於**使用端判識器——否則長篇攔阻頁這個唯一動機情境正好落在閘門之上，註冊了也不會生效。相對地，**判準之精確度由呼叫端負責**：請取攔阻頁專屬之字串，不要用該站正常文章也會出現的詞。
- **`evidence`選填**。判準若依賴script來源、class、id或meta標籤，標`evidence:'structural'`；Camofox階之內容由accessibility snapshot合成，結構已被剝除，標記後該階即不比對此判識器。未標時視為`'semantic'`。
- **不合契約者略過，拋錯只略過該項**。判識器是補充保護，一個寫壞不會使整次抓取失敗（與adapter刻意不同：adapter是內容來源，`match`拋錯會顯性回報`adapter-error`）。

完整契約以`src/detectorContract.mjs`為唯一事實來源。`opt.inspect=false`會一併關閉內建與使用端判識器。

#### Result of fetchWeb:
```alias
//parse=true, 成功
{
    status: 'success',
    url: 'https://example.com/',
    method: 'curl',
    fetchedAt: '2026-08-06 23:38:10',
    attempts: [{ method: 'curl', status: 'success', htmlLength: 559 }],
    title: 'Example Domain',
    content: 'This domain is for use in documentation examples without needing permission. ...',
    contentLength: 111,
}

//parse=false, 成功
{
    status: 'success',
    url: 'https://example.com/',
    method: 'curl',
    fetchedAt: '2026-08-06 23:38:10',
    attempts: [{ method: 'curl', status: 'success', htmlLength: 559 }],
    html: '<!doctype html><html lang="en"><head><title>Example Domain</title><lin ...',
}

//失敗, 本套件各函數皆不reject
{
    status: 'error',
    url: 'abc',
    message: 'invalid url (must be http/https)',
    fetchedAt: '2026-08-06 23:38:10',
    attempts: [],
}
```
