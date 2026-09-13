import assert from 'assert'
import map from 'lodash-es/map.js'
import includes from 'lodash-es/includes.js'
import fetchWeb from '../src/fetchWeb.mjs'
import inspectHtml from '../src/inspectHtml.mjs'
import { matchMsn, fetchMsn } from '../src/fetchMsn.mjs'
import { URL_MSN, msnApiOk, URL_MSN_VIDEO, msnApiVideo, URL_MSN_VIDEO_SHORT, msnApiVideoShort } from './tools/fixtures.mjs'


//內建 msn adapter 之測試。
//
//**被 fake 掉的是什麼**（原則五第 3 條）：msn 內容 API 之網路回應，經 opt._fetchers.curl 接縫供應。
//真實情境已另行實測:
//  2026-09-11  Bing News RSS 取得之 12 篇真實文章頁(ar-): 預設階梯三層全滅、43 秒;
//              經內容 API 12/12 回 200＋JSON、type='article'、正文 505~963 字, 經 Readability 皆解析成功
//  2026-09-11  同一 id 以 11 種語系路徑呼叫 API, 回應位元組完全相同; 不合法語系回 400
//  2026-09-12  DuckDuckGo 取得之 6 篇真實影片頁(vi-): 6/6 回 200、type='video'、body 為逐字稿 31~8446 字
//fixture 之回應**形狀**取自該些真實回應（見 tools/fixtures.mjs），文字為自擬（逐字稿 31 字者為真實值）。
//本檔不發真實網路請求：外部站台之可用性不應決定本套件測試之成敗
let API_URL = 'https://assets.msn.com/content/view/v2/Detail/en-us/AA2bZm9d'

let mkCurl = (resp) => {
    let calls = []
    let fn = async (u, o) => {
        calls.push({ u, o })
        return typeof resp === 'function' ? resp(u, o) : resp
    }
    fn.calls = calls
    return fn
}
let okResp = (data) => ({ status: 'success', html: JSON.stringify(data), method: 'curl', httpCode: 200 })

//msn 走 requiresHeadless 分流, 故階梯為 headless→headed→camofox(不含 curl)。
//假殼頁仿真實量測: 大量 script 撐開 HTML 而可見文字近 0, 若被呼叫即會被判 empty
let SHELL = '<html><head><title>MSN</title></head><body><script>' + 'v'.repeat(6000) + '</script></body></html>'
let mkLadder = () => {
    let n = { headless: 0, headed: 0, camofox: 0 }
    let mk = (k, method) => async () => {
        n[k] += 1
        return { method, status: 'success', html: SHELL }
    }
    return {
        fs: { playwrightHeadless: mk('headless', 'playwright-headless'), playwrightHead: mk('headed', 'playwright-headed'), camofox: mk('camofox', 'camofox') },
        total: () => n.headless + n.headed + n.camofox,
        n,
    }
}

//標記重而可見文字少之正文: 300 個 <img> 撐大 HTML(>5000 bytes)而可見文字僅 120 字(<200),
//恰落在內建 empty 判識之條件內。真實情境為圖集式報導; 提案方以替身重現之情境①亦為此形
let heavyBody = '<img src="https://img.example/a.jpg" alt="">'.repeat(300) + '<p>' + '圖說文字。'.repeat(24) + '</p>'

let ctx = { kind: 'ar', id: 'AA2bZm9d' }


describe('內建msn adapter', function() {

    describe('網址比對(match)', function() {

        it('文章頁與影片頁網址取出kind與id', function() {
            let r = map([
                'https://www.msn.com/zh-tw/news/other/abc/ar-AA2bZm9d',
                'https://msn.com/en-us/money/markets/ar-AA1X4Z9P',
                'https://www.msn.com/EN-US/news/ar-AA1X4Z9P?ocid=BingNewsSerp',
                'http://www.msn.com/ja-jp/news/x/ar-BB1abc#top',
                URL_MSN,
                URL_MSN_VIDEO,
                'https://www.msn.com/en-us/video/news/abc/vi-AA2bYtCB/',
                'https://www.msn.com/en-us/video/news/abc/VI-AA2bYtCB?cvid=1',
                'https://www.msn.com/ar-ae/news/other/slug/ar-AA1abcde',
                'https://www.msn.com/vi-vn/video/news/slug/vi-AA1abcde',
            ], matchMsn)
            let rr = [
                { kind: 'ar', id: 'AA2bZm9d' },
                { kind: 'ar', id: 'AA1X4Z9P' },
                { kind: 'ar', id: 'AA1X4Z9P' },
                { kind: 'ar', id: 'BB1abc' },
                { kind: 'ar', id: 'AA2bZm9d' },
                { kind: 'vi', id: 'AA2bYtCB' },
                { kind: 'vi', id: 'AA2bYtCB' },
                { kind: 'vi', id: 'AA2bYtCB' },
                { kind: 'ar', id: 'AA1abcde' },
                { kind: 'vi', id: 'AA1abcde' },
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('不要求語系段之形態: 語系已不用於請求, 內容段前只要有一段即可', function() {
            let r = matchMsn('https://www.msn.com/news/x/ar-AA1abcde')
            let rr = { kind: 'ar', id: 'AA1abcde' }
            assert.strict.deepEqual(r, rr)
        })

        it('語系代碼本身以ar-/vi-開頭者(ar-ae、ar-sa、vi-vn), 其首頁與頻道頁不命中', function() {

            //本檔第一版允許內容段直接接在主機之後, 於是 /ar-ae/news 被解成 id 為 ae 的內容頁去打 API(實測回 410);
            //複審以真實網址抓到。內容段之前至少須有一段
            let r = map([
                'https://www.msn.com/ar-ae',
                'https://www.msn.com/ar-ae/',
                'https://www.msn.com/ar-ae/news',
                'https://www.msn.com/ar-sa/money',
                'https://www.msn.com/vi-vn',
                'https://www.msn.com/vi-vn/news',
                'https://www.msn.com/ar-ae/news/other/x/gm-AA1abcde',
                'https://www.msn.com/ar-ae/x/ar-AA1abcde-extra',
            ], matchMsn)
            let rr = [null, null, null, null, null, null, null, null]
            assert.strict.deepEqual(r, rr)
        })

        it('非內容頁、gm與ss型、id段含連字號者不命中', function() {

            //gm 型實測 API 回 410 無來源; 圖集(ss-)未取得樣本, 沒有量測就不加。
            //內容 id 不含 -, 故 /ar-foo-bar 這類一般路徑段不得被誤判
            let r = map([
                'https://www.msn.com/zh-tw/news',
                'https://www.msn.com/en-us/video/browse/mostwatchedtoday',
                'https://www.msn.com/en-us/x/gm-AA1abcde',
                'https://www.msn.com/en-us/news/x/ss-AA1abcde',
                'https://www.msn.com/zh-tw/x/ar-AA1abcde-extra',
            ], matchMsn)
            let rr = [null, null, null, null, null]
            assert.strict.deepEqual(r, rr)
        })

        it('網域須錨定, 路徑中或相似網域出現msn.com不命中', function() {

            //與routeByUrl同一條教訓: 未錨定時該子字串出現在路徑任一處即命中
            let r = map([
                'https://evil.example/www.msn.com/zh-tw/x/ar-AA1abcde',
                'https://msn.com.evil.example/zh-tw/x/ar-AA1abcde',
                'https://notmsn.com/zh-tw/x/ar-AA1abcde',
            ], matchMsn)
            let rr = [null, null, null]
            assert.strict.deepEqual(r, rr)
        })

        it('非字串輸入不命中且不拋錯', function() {
            let r = map([null, undefined, 123, {}], matchMsn)
            let rr = [null, null, null, null]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('取得內容(fetch)', function() {

        it('固定以en-us請求內容API(不取網址語系), 並原樣轉傳opt', async function() {

            //實測 11 種語系路徑回應完全相同、不合法語系回 400: 取網址語系只會多一個失敗點
            let curl = mkCurl(okResp(msnApiOk))
            await fetchMsn(URL_MSN, { _fetchers: { curl }, maxRetries: 2, timeoutMs: 9000 }, ctx)
            let r = [curl.calls.length, curl.calls[0].u, curl.calls[0].o.maxRetries, curl.calls[0].o.timeoutMs]
            let rr = [1, API_URL, 2, 9000]
            assert.strict.deepEqual(r, rr)
        })

        it('成功時回重組之HTML, contentKind為synthesized', async function() {

            //這份HTML由JSON組出, 不是站方原始文件; 判識器據此只比對semantic類判準
            let t = await fetchMsn(URL_MSN, { _fetchers: { curl: mkCurl(okResp(msnApiOk)) } }, ctx)
            let r = [
                t.status,
                t.contentKind,
                includes(t.html, '<title>私募信貸流動性折價擴大</title>'),
                includes(t.html, '<p>本週市場焦點'),
            ]
            let rr = ['success', 'synthesized', true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('影片型別之回應同樣重組, body即逐字稿', async function() {
            let t = await fetchMsn(URL_MSN_VIDEO, { _fetchers: { curl: mkCurl(okResp(msnApiVideo)) } }, { kind: 'vi', id: 'AA2bYtCB' })
            let r = [t.status, includes(t.html, '<h1>市場週報：本週三大焦點</h1>'), includes(t.html, '<p>大家好，本週市場焦點')]
            let rr = ['success', true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('不以type白名單擋: 未知型別只要有body即交給解析', async function() {

            //套件給機制: 站方若再增一種帶 body 的型別, 交給判識與解析仍是正確的預設,
            //以白名單擋掉只會多一個要發版才能解的失敗
            let t = await fetchMsn(URL_MSN, { _fetchers: { curl: mkCurl(okResp({ ...msnApiOk, type: 'slideshow' })) } }, ctx)
            let r = [t.status, includes(t.html, '<p>本週市場焦點')]
            let rr = ['success', true]
            assert.strict.deepEqual(r, rr)
        })

        it('標題經HTML轉義', async function() {
            let data = { ...msnApiOk, title: 'A<script>x</script>&"' }
            let t = await fetchMsn(URL_MSN, { _fetchers: { curl: mkCurl(okResp(data)) } }, ctx)
            let r = [includes(t.html, '<script>x'), includes(t.html, 'A&lt;script&gt;x&lt;/script&gt;&amp;&quot;')]
            let rr = [false, true]
            assert.strict.deepEqual(r, rr)
        })

        it('API抓取失敗時原樣帶回抓取層之歸因', async function() {

            //實測不存在之id回410; 歸因沿用抓取層已登記之http-error, 不另造新值
            let curl = mkCurl({ status: 'error', reason: 'http-error', message: 'HTTP 410', httpCode: 410, method: 'curl' })
            let t = await fetchMsn(URL_MSN, { _fetchers: { curl } }, ctx)
            let r = [t.status, t.reason, t.message]
            let rr = ['error', 'http-error', 'msn api: HTTP 410']
            assert.strict.deepEqual(r, rr)
        })

        it('回應非JSON、非物件或無body時回adapter-fetch-miss', async function() {
            let cases = [
                { status: 'success', html: 'not json', method: 'curl' },
                { status: 'success', html: 'null', method: 'curl' },
                { status: 'success', html: '[1,2]', method: 'curl' },
                okResp({ ...msnApiOk, body: undefined }),
                okResp({ ...msnApiOk, body: 123 }),
                okResp({ ...msnApiOk, body: '' }),
            ]
            let r = []
            for (let c of cases) {
                let t = await fetchMsn(URL_MSN, { _fetchers: { curl: mkCurl(c) } }, ctx)
                r.push([t.status, t.reason])
            }
            let rr = map(cases, () => ['error', 'adapter-fetch-miss'])
            assert.strict.deepEqual(r, rr)
        })

        it('ctx不合法時不發請求', async function() {

            //內建之 match 命中時必帶 id, 但 fetchMsn 對外匯出、可配呼叫端自己的 match 使用, 故仍檢核
            let curl = mkCurl(okResp(msnApiOk))
            let r = []
            for (let bad of [null, {}, { kind: 'ar' }, { id: '' }]) {
                let t = await fetchMsn(URL_MSN, { _fetchers: { curl } }, bad)
                r.push(t.reason)
            }
            let rr = ['adapter-fetch-miss', 'adapter-fetch-miss', 'adapter-fetch-miss', 'adapter-fetch-miss']
            assert.strict.deepEqual([r, curl.calls.length], [rr, 0])
        })

        it('接縫函數拋錯時不reject', async function() {
            let curl = async () => {
                throw new Error('boom')
            }
            let out = 'no-reject'
            let t = null
            try {
                t = await fetchMsn(URL_MSN, { _fetchers: { curl } }, ctx)
            }
            catch (err) {
                out = err.message
            }
            let r = [out, t?.status, t?.reason]
            let rr = ['no-reject', 'error', 'fetcher-error']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('經fetchWeb之完整流程', function() {

        it('msn文章頁經內容API取得並解析, 不動用瀏覽器階梯', async function() {

            //動機情境本身: 此前預設階梯三層全滅(實測43秒、成功率0)
            let ladder = mkLadder()
            let curl = mkCurl(okResp(msnApiOk))
            let t = await fetchWeb(URL_MSN, { useShowLog: false, _fetchers: { curl, ...ladder.fs } })
            let r = [t.status, t.method, t.adapterId, t.title, includes(t.content, '本週市場焦點'), t.attempts.length, ladder.total()]
            let rr = ['success', 'adapter', 'msn', '私募信貸流動性折價擴大', true, 1, 0]
            assert.strict.deepEqual(r, rr)
        })

        it('msn影片頁經內容API取得逐字稿並解析', async function() {
            let ladder = mkLadder()
            let curl = mkCurl(okResp(msnApiVideo))
            let t = await fetchWeb(URL_MSN_VIDEO, { useShowLog: false, _fetchers: { curl, ...ladder.fs } })
            let r = [t.status, t.method, t.adapterId, t.title, includes(t.content, '本週市場焦點'), t.attempts.length, ladder.total()]
            let rr = ['success', 'adapter', 'msn', '市場週報：本週三大焦點', true, 1, 0]
            assert.strict.deepEqual(r, rr)
        })

        it('API失敗時不落回階梯(fallback:false)', async function() {

            //落回的存在理由是「還抓得到內容」, 對msn不成立——落回只會白耗兩次Chrome啟動加一次camofox
            let ladder = mkLadder()
            let curl = mkCurl({ status: 'error', reason: 'http-error', message: 'HTTP 410', httpCode: 410, method: 'curl' })
            let t = await fetchWeb(URL_MSN, { useShowLog: false, _fetchers: { curl, ...ladder.fs } })
            let r = [t.status, t.reason, t.adapterId, map(t.attempts, (a) => [a.method, a.status, a.reason, a.adapterId]), ladder.total()]
            let rr = ['error', 'http-error', 'msn', [['adapter', 'failed', 'http-error', 'msn']], 0]
            assert.strict.deepEqual(r, rr)
        })

        it('opt.method指定任一種爬法時adapter階仍在其前, 成功即不動用該爬法', async function() {
            let r = []
            for (let m of ['curl', 'playwright', 'playwright-headed', 'camofox']) {
                let ladder = mkLadder()
                let curl = mkCurl(okResp(msnApiOk))
                let t = await fetchWeb(URL_MSN, { useShowLog: false, method: m, _fetchers: { curl, ...ladder.fs } })
                r.push([t.status, t.method, t.attempts.length, curl.calls.length, ladder.total()])
            }
            let rr = map([1, 2, 3, 4], () => ['success', 'adapter', 1, 1, 0])
            assert.strict.deepEqual(r, rr)
        })

        it('API回應無body時亦不落回', async function() {
            let ladder = mkLadder()
            let curl = mkCurl(okResp({ ...msnApiOk, body: undefined }))
            let t = await fetchWeb(URL_MSN, { useShowLog: false, _fetchers: { curl, ...ladder.fs } })
            let r = [t.status, t.reason, ladder.total()]
            let rr = ['error', 'adapter-fetch-miss', 0]
            assert.strict.deepEqual(r, rr)
        })

        it('正文不足MIN_CONTENT時即以empty-content收攤, 不續跑瀏覽器階梯(真實值)', async function() {

            //fixture 為 2026-09-12 實抓之真實影片頁: API 回 200 而逐字稿僅 31 字。
            //此前 fallback 只擋 fetch 失敗, 此格會續跑三層瀏覽器(43 秒)且歸因被末階蓋成 camofox-empty——
            //呼叫端看不出真正原因是「這篇本來就沒有正文」。fallback 現涵蓋整個 adapter 階(runPlan 之 _mayEscalate)
            let ladder = mkLadder()
            let curl = mkCurl(okResp(msnApiVideoShort))
            let t = await fetchWeb(URL_MSN_VIDEO_SHORT, { useShowLog: false, _fetchers: { curl, ...ladder.fs } })
            let r = [t.status, t.reason, t.adapterId, map(t.attempts, (a) => [a.method, a.adapterId, a.status, a.reason]), ladder.total()]
            let rr = ['error', 'empty-content', 'msn', [['adapter', 'msn', 'blocked', 'empty-content']], 0]
            assert.strict.deepEqual(r, rr)
        })

        it('inspect:false: 標記重而可見文字少之正文不被內建empty判識誤擋', async function() {

            //對照組先證明這份重組 HTML 若經內建判識即判 empty(HTML>5000 bytes 且可見文字<200),
            //亦即本條驗的是 inspect:false 真的生效, 而不是 fixture 剛好落在判識條件之外
            let data = { ...msnApiOk, body: heavyBody }
            let html = (await fetchMsn(URL_MSN, { _fetchers: { curl: mkCurl(okResp(data)) } }, ctx)).html
            let ladder = mkLadder()
            let t = await fetchWeb(URL_MSN, { useShowLog: false, _fetchers: { curl: mkCurl(okResp(data)), ...ladder.fs } })
            let r = [html.length > 5000, inspectHtml(html, { contentKind: 'synthesized' }).type, t.status, t.method, t.contentLength >= 50, ladder.total()]
            let rr = [true, 'empty', 'success', 'adapter', true, 0]
            assert.strict.deepEqual(r, rr)
        })

        it('inspect:false只關內建判識器, 呼叫端註冊之判識器照常比對, 擋下即收攤', async function() {

            //detectorContract 保證註冊的判識器一定會被比對; adapter 之豁免不歸它管。
            //擋下後因 fallback:false 不續走, 歸因為呼叫端判識器之 type
            let ladder = mkLadder()
            let detectors = [{ id: 'mine', type: 'verify', message: '呼叫端判識', test: (c) => c.lower.includes('本週市場焦點') }]
            let t = await fetchWeb(URL_MSN, { useShowLog: false, detectors, _fetchers: { curl: mkCurl(okResp(msnApiOk)), ...ladder.fs } })
            let r = [t.status, t.reason, map(t.attempts, (a) => [a.method, a.adapterId, a.status, a.type, a.message]), ladder.total()]
            let rr = ['error', 'verify', [['adapter', 'msn', 'blocked', 'verify', '呼叫端判識']], 0]
            assert.strict.deepEqual(r, rr)
        })

        it('parse=false時回傳重組之HTML', async function() {
            let ladder = mkLadder()
            let t = await fetchWeb(URL_MSN, { useShowLog: false, parse: false, _fetchers: { curl: mkCurl(okResp(msnApiOk)), ...ladder.fs } })
            let r = [t.status, t.method, t.adapterId, includes(t.html, '<article><h1>私募信貸流動性折價擴大</h1>')]
            let rr = ['success', 'adapter', 'msn', true]
            assert.strict.deepEqual(r, rr)
        })

        it('呼叫端自己的msn adapter排在前面時, 內建者不被使用', async function() {

            //安裝方已自行開發msn adapter之情境: 升級後不會被內建者搶走
            let ladder = mkLadder()
            let curl = mkCurl(okResp(msnApiOk))
            let mine = {
                id: 'mine-msn',
                match: /msn\.com/,
                fetch: async () => ({ status: 'success', html: '<html><head><title>MINE</title></head><body><article><p>' + '自有來源之正文內容。'.repeat(20) + '</p></article></body></html>' }),
            }
            let t = await fetchWeb(URL_MSN, { useShowLog: false, adapters: [mine], _fetchers: { curl, ...ladder.fs } })
            let r = [t.status, t.adapterId, t.title, curl.calls.length]
            let rr = ['success', 'mine-msn', 'MINE', 0]
            assert.strict.deepEqual(r, rr)
        })

    })

})
