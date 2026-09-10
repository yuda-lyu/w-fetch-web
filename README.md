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
| `method` | String | `'auto'` | `'auto'`、`'curl'`、`'playwright'`、`'playwright-headed'`、`'camofox'` |
| `parse` | Boolean | `true` | 以Readability解析出`title`與`content`，`false`則回傳原始`html` |
| `showLog` | Boolean | `true` | 是否顯示階梯升級過程訊息 |
| `inspect` | Boolean | `true` | 是否以`inspectHtml`對抓取結果做原始內容判識，關閉後不因判定為挑戰頁或空內容而升級 |
| `adapters` | Array | `[]` | 站台adapter陣列，用於覆寫特定站台之內容解析方式，形狀為`{id,match,parse}`，使用端註冊者優先於內建（gelonghui、bloomberg） |
| `maxRetries` | Integer | `5` | 各抓取方法失敗時之最大重試次數，含初始共執行`maxRetries+1`次 |

其餘設定會轉傳給實際執行抓取之函數，例如`timeoutMs`、`navigationTimeoutMs`、`postNavigationWaitMs`、`port`等。

#### Attempts:
`attempts`為各階嘗試之紀錄，`status`只有三種：

| status | 意義 | 欄位 |
| --- | --- | --- |
| `success` | 取得並解析成功 | `method`、`htmlLength`（**原始HTML長度**，與頂層`contentLength`之正文長度不同） |
| `failed` | 抓取本身失敗 | `method`、`reason`、`message` |
| `blocked` | 取得內容但被判識或解析拒絕 | `method`、`type`、`reason`、`message` |

判識所致之`blocked`，其`reason`與`type`同值，故呼叫端可一律讀`reason`取得失敗歸因。

#### Reasons:
`reason`為失敗歸因，供呼叫端分辨該重試、告警或修adapter。完整值域（權威定義見`src/constants.mjs`之`REASONS`）：

| reason | 意義 | 重試是否有用 |
| --- | --- | --- |
| `invalid-url` | 網址非字串或非http/https | 否 |
| `invalid-method` | `opt.method`不在支援清單內 | 否 |
| `http-error` | HTTP狀態碼為4xx或5xx | 5xx與429會自動重試，4xx否 |
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
| `unknown` | 無上游歸因可用之退路值 | — |

使用端adapter可於`parse`回傳自訂之`reason`，該值會原樣保留至頂層與`attempts`，不受上表限制。

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
