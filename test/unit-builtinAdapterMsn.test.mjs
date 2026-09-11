import assert from 'assert'
import map from 'lodash-es/map.js'
import includes from 'lodash-es/includes.js'
import fetchWeb from '../src/fetchWeb.mjs'
import { matchMsn, fetchMsn } from '../src/fetchMsn.mjs'
import { URL_MSN, msnApiOk } from './tools/fixtures.mjs'


//內建 msn adapter 之測試。
//
//**被 fake 掉的是什麼**（原則五第 3 條）：msn 內容 API 之網路回應，經 opt._fetchers.curl 接縫供應。
//真實情境已另行實測（2026-09-11，Bing News RSS 取得之 12 篇真實 msn 文章頁）：
//  預設階梯（無此 adapter）  三層全滅，耗時 43 秒
//  經內容 API               12/12 回 200＋JSON、type='article'、正文 505~963 字；
//                           重組後之 HTML 經 inspectHtml 12/12 通過、經 Readability 12/12 解析成功
//fixture 之回應**形狀**取自該次真實回應（見 tools/fixtures.mjs），文字為自擬。
//本檔不發真實網路請求：外部站台之可用性不應決定本套件測試之成敗
let API_URL = 'https://assets.msn.com/content/view/v2/Detail/zh-tw/AA2bZm9d'

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


describe('內建msn adapter', function() {

    describe('網址比對(match)', function() {

        it('文章頁網址取出locale與id', function() {
            let r = map([
                'https://www.msn.com/zh-tw/news/other/abc/ar-AA2bZm9d',
                'https://msn.com/en-us/money/markets/ar-AA1X4Z9P',
                'https://www.msn.com/EN-US/news/ar-AA1X4Z9P?ocid=BingNewsSerp',
                'http://www.msn.com/ja-jp/news/x/ar-BB1abc#top',
                URL_MSN,
            ], matchMsn)
            let rr = [
                { locale: 'zh-tw', id: 'AA2bZm9d' },
                { locale: 'en-us', id: 'AA1X4Z9P' },
                { locale: 'en-us', id: 'AA1X4Z9P' },
                { locale: 'ja-jp', id: 'BB1abc' },
                { locale: 'zh-tw', id: 'AA2bZm9d' },
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('非文章頁、影片與圖集、缺locale者不命中', function() {

            //影片(vi-)與圖集(ss-)之內容API形狀不同, 不在本adapter範圍, 維持既有之階梯流程
            let r = map([
                'https://www.msn.com/zh-tw/news',
                'https://www.msn.com/en-us/video/x/vi-AA1abcde',
                'https://www.msn.com/en-us/news/x/ss-AA1abcde',
                'https://www.msn.com/news/x/ar-AA1abcde',
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

        let ctx = { locale: 'zh-tw', id: 'AA2bZm9d' }

        it('依locale與id請求內容API, 並原樣轉傳opt', async function() {
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

        it('回應形狀不合預期時回adapter-fetch-miss', async function() {
            let cases = [
                { status: 'success', html: 'not json', method: 'curl' },
                { status: 'success', html: 'null', method: 'curl' },
                okResp({ ...msnApiOk, type: 'video' }),
                okResp({ ...msnApiOk, body: undefined }),
                okResp({ ...msnApiOk, body: 123 }),
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
            let curl = mkCurl(okResp(msnApiOk))
            let r = []
            for (let bad of [null, {}, { locale: 'zh-tw' }, { id: 'AA1' }]) {
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
            let t = await fetchWeb(URL_MSN, { showLog: false, _fetchers: { curl, ...ladder.fs } })
            let r = [t.status, t.method, t.adapterId, t.title, includes(t.content, '本週市場焦點'), t.attempts.length, ladder.total()]
            let rr = ['success', 'adapter', 'msn', '私募信貸流動性折價擴大', true, 1, 0]
            assert.strict.deepEqual(r, rr)
        })

        it('API失敗時不落回階梯(fallback:false)', async function() {

            //落回的存在理由是「還抓得到內容」, 對msn不成立——落回只會白耗兩次Chrome啟動加一次camofox
            let ladder = mkLadder()
            let curl = mkCurl({ status: 'error', reason: 'http-error', message: 'HTTP 410', httpCode: 410, method: 'curl' })
            let t = await fetchWeb(URL_MSN, { showLog: false, _fetchers: { curl, ...ladder.fs } })
            let r = [t.status, t.reason, map(t.attempts, (a) => [a.method, a.status, a.reason]), ladder.total()]
            let rr = ['error', 'http-error', [['adapter', 'failed', 'http-error']], 0]
            assert.strict.deepEqual(r, rr)
        })

        it('API回應形狀不合預期時亦不落回', async function() {
            let ladder = mkLadder()
            let curl = mkCurl(okResp({ ...msnApiOk, type: 'slideshow' }))
            let t = await fetchWeb(URL_MSN, { showLog: false, _fetchers: { curl, ...ladder.fs } })
            let r = [t.status, t.reason, ladder.total()]
            let rr = ['error', 'adapter-fetch-miss', 0]
            assert.strict.deepEqual(r, rr)
        })

        it('parse=false時回傳重組之HTML', async function() {
            let ladder = mkLadder()
            let t = await fetchWeb(URL_MSN, { showLog: false, parse: false, _fetchers: { curl: mkCurl(okResp(msnApiOk)), ...ladder.fs } })
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
            let t = await fetchWeb(URL_MSN, { showLog: false, adapters: [mine], _fetchers: { curl, ...ladder.fs } })
            let r = [t.status, t.adapterId, t.title, curl.calls.length]
            let rr = ['success', 'mine-msn', 'MINE', 0]
            assert.strict.deepEqual(r, rr)
        })

    })

})
