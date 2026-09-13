import assert from 'assert'
import fetchWebByCurl from '../src/fetchWebByCurl.mjs'
import fetchWebByPlaywrightHeadless from '../src/fetchWebByPlaywrightHeadless.mjs'
import serverForTest from './tools/serverForTest.mjs'
import hasChrome from './tools/hasChrome.mjs'


//HTTP狀態處理之跨抓取器對稱性回歸。
//
//缺陷形狀: curl階自初版即檢核HTTP狀態, playwright兩階則丟棄page.goto()之Response,
//於是同一個回500或404的網址, curl回error/http-error, playwright回success並帶回錯誤頁HTML。
//curl被擋而升級至playwright時, 站台的404或403頁面會被當成抓取成功的內容送進判識與解析——
//錯誤頁多半有完整版面與大量文字, 故不會被empty攔下, 呼叫端最後收到一篇「找不到頁面」的文章。
//
//與UA/Referer/Accept-Language在playwright階靜默失效同型(該次已修), 此為同型的第三處。
//
//本檔以真Chrome執行(非fake): 被fake掉的只有目標站台, 導航、Response與狀態碼皆為真實行為
describe('HTTP狀態處理之跨抓取器對稱性', function() {

    let svr = null
    let chromeOk = false

    before(async function() {
        this.timeout(60000)
        svr = await serverForTest()
        chromeOk = await hasChrome()
    })

    after(async function() {
        if (svr) {
            await svr.close()
        }
    })

    let opt = { useShowLog: false, maxRetries: 0, postNavigationWaitMs: 300 }

    it('curl與playwright對5xx之歸因一致', async function() {
        this.timeout(60000)
        if (!chromeOk) {
            this.skip()
        }
        let a = await fetchWebByCurl(svr.url('/error500'), opt)
        let b = await fetchWebByPlaywrightHeadless(svr.url('/error500'), opt)
        let r = [[a.status, a.reason, a.httpCode], [b.status, b.reason, b.httpCode]]
        let rr = [['error', 'http-error', 500], ['error', 'http-error', 500]]
        assert.strict.deepEqual(r, rr)
    })

    it('curl與playwright對4xx之歸因一致', async function() {
        this.timeout(60000)
        if (!chromeOk) {
            this.skip()
        }
        let a = await fetchWebByCurl(svr.url('/nope-xyz'), opt)
        let b = await fetchWebByPlaywrightHeadless(svr.url('/nope-xyz'), opt)
        let r = [[a.status, a.reason, a.httpCode], [b.status, b.reason, b.httpCode]]
        let rr = [['error', 'http-error', 404], ['error', 'http-error', 404]]
        assert.strict.deepEqual(r, rr)
    })

    it('200正常頁兩者皆成功且皆回報httpCode', async function() {
        this.timeout(60000)
        if (!chromeOk) {
            this.skip()
        }
        let a = await fetchWebByCurl(svr.url('/article'), opt)
        let b = await fetchWebByPlaywrightHeadless(svr.url('/article'), opt)
        let r = [[a.status, a.httpCode], [b.status, b.httpCode]]
        let rr = [['success', 200], ['success', 200]]
        assert.strict.deepEqual(r, rr)
    })

    it('playwright之4xx不重試, 5xx才重試', async function() {
        this.timeout(120000)
        if (!chromeOk) {
            this.skip()
        }

        //可重試性亦須與curl一致: 以attempts欄位(實際執行次數)驗證, 不看訊息
        let b4 = await fetchWebByPlaywrightHeadless(svr.url('/nope-xyz'), { ...opt, maxRetries: 1 })
        let b5 = await fetchWebByPlaywrightHeadless(svr.url('/error500'), { ...opt, maxRetries: 1 })
        let r = [b4.attempts, b5.attempts]
        let rr = [1, 2]
        assert.strict.deepEqual(r, rr)
    })

})
