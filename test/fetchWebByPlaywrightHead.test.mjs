import assert from 'assert'
import includes from 'lodash-es/includes.js'
import fetchWebByPlaywrightHead from '../src/fetchWebByPlaywrightHead.mjs'
import serverForTest, { MARKER } from './tools/serverForTest.mjs'
import hasChrome from './tools/hasChrome.mjs'


//有頭模式會開啟實體瀏覽器視窗干擾使用中桌面, 故實際抓取案例預設跳過,
//須驗證時以環境變數WFETCHWEB_TEST_HEADED=1開啟
let testHeaded = process.env.WFETCHWEB_TEST_HEADED === '1'


describe('fetchWebByPlaywrightHead', function() {

    let svr = null
    let chromeOk = false

    before(async function() {
        this.timeout(60000)
        svr = await serverForTest()
        if (testHeaded) {
            chromeOk = await hasChrome()
        }
    })

    after(async function() {
        if (svr) {
            await svr.close()
        }
    })

    it('非有效字串網址回傳invalid-url', async function() {
        let r = []
        for (let url of [null, undefined, '', 123, {}]) {
            let t = await fetchWebByPlaywrightHead(url)
            r.push([t.status, t.reason, t.method, t.attempts])
        }
        let rr = [
            ['error', 'invalid-url', 'playwright-headed', 0],
            ['error', 'invalid-url', 'playwright-headed', 0],
            ['error', 'invalid-url', 'playwright-headed', 0],
            ['error', 'invalid-url', 'playwright-headed', 0],
            ['error', 'invalid-url', 'playwright-headed', 0],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('非http與https網址回傳invalid-url', async function() {
        let r = []
        for (let url of ['abc', 'ftp://a.com/', 'file:///c:/a.html']) {
            let t = await fetchWebByPlaywrightHead(url)
            r.push([t.status, t.reason, t.attempts])
        }
        let rr = [
            ['error', 'invalid-url', 0],
            ['error', 'invalid-url', 0],
            ['error', 'invalid-url', 0],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('抓取正常網頁回傳渲染後HTML且無驗證可點', async function() {
        if (!testHeaded || !chromeOk) {
            this.skip()
        }
        this.timeout(120000)
        let t = await fetchWebByPlaywrightHead(svr.url('/article'), { maxRetries: 0, postNavigationWaitMs: 300 })
        let r = [t.status, t.method, t.attempts, t.verificationClicked, includes(t.html, MARKER)]
        let rr = ['success', 'playwright-headed', 1, false, true]
        assert.strict.deepEqual(r, rr)
    })

    it('skipVerificationClick=true時不做驗證點擊', async function() {
        if (!testHeaded || !chromeOk) {
            this.skip()
        }
        this.timeout(120000)
        let t = await fetchWebByPlaywrightHead(svr.url('/article'), { maxRetries: 0, postNavigationWaitMs: 300, skipVerificationClick: true })
        let r = [t.status, t.verificationClicked, includes(t.html, MARKER)]
        let rr = ['success', false, true]
        assert.strict.deepEqual(r, rr)
    })

})
