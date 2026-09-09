import assert from 'assert'
import includes from 'lodash-es/includes.js'
import fetchWebByPlaywrightHeadless from '../src/fetchWebByPlaywrightHeadless.mjs'
import serverForTest, { MARKER } from './tools/serverForTest.mjs'
import hasChrome from './tools/hasChrome.mjs'


describe('fetchWebByPlaywrightHeadless', function() {

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

    it('非有效字串網址回傳invalid-url', async function() {
        let r = []
        for (let url of [null, undefined, '', 123, {}]) {
            let t = await fetchWebByPlaywrightHeadless(url)
            r.push([t.status, t.reason, t.method, t.attempts])
        }
        let rr = [
            ['error', 'invalid-url', 'playwright-headless', 0],
            ['error', 'invalid-url', 'playwright-headless', 0],
            ['error', 'invalid-url', 'playwright-headless', 0],
            ['error', 'invalid-url', 'playwright-headless', 0],
            ['error', 'invalid-url', 'playwright-headless', 0],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('非http與https網址回傳invalid-url', async function() {
        let r = []
        for (let url of ['abc', 'ftp://a.com/', 'file:///c:/a.html']) {
            let t = await fetchWebByPlaywrightHeadless(url)
            r.push([t.status, t.reason, t.attempts])
        }
        let rr = [
            ['error', 'invalid-url', 0],
            ['error', 'invalid-url', 0],
            ['error', 'invalid-url', 0],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('抓取正常網頁回傳渲染後HTML', async function() {
        if (!chromeOk) {
            //執行環境無Chrome(channel='chrome')則跳過, 不誤報失敗
            this.skip()
        }
        this.timeout(60000)
        let t = await fetchWebByPlaywrightHeadless(svr.url('/article'), { maxRetries: 0, postNavigationWaitMs: 300 })
        let r = [t.status, t.method, t.attempts, includes(t.html, MARKER), includes(t.html, 'W Fetch Web Test Article'), t.htmlLength === t.html.length]
        let rr = ['success', 'playwright-headless', 1, true, true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('導航失敗時依maxRetries決定執行次數', async function() {
        if (!chromeOk) {
            this.skip()
        }
        this.timeout(60000)

        //連線不到之埠號, 令導航必然失敗, maxRetries=0代表僅執行1次
        let t = await fetchWebByPlaywrightHeadless('http://127.0.0.1:1/abc', { maxRetries: 0, navigationTimeoutMs: 3000 })
        let r = [t.status, t.reason, t.method, t.attempts]
        let rr = ['error', 'playwright-error', 'playwright-headless', 1]
        assert.strict.deepEqual(r, rr)
    })

})
