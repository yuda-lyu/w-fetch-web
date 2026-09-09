import assert from 'assert'
import includes from 'lodash-es/includes.js'
import fetchWebByCurl from '../src/fetchWebByCurl.mjs'
import fetchWebByPlaywrightHeadless from '../src/fetchWebByPlaywrightHeadless.mjs'
import serverForTest, { MARKER } from './tools/serverForTest.mjs'
import hasChrome from './tools/hasChrome.mjs'


//重試分支之退避為線性3秒起跳, 故本檔案之逾時放寬
describe('抓取函數之重試與選項分支', function() {

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

    describe('fetchWebByCurl', function() {

        it('HTTP 500為可重試, 依maxRetries重試後回http-error', async function() {
            this.timeout(60000)
            let t = await fetchWebByCurl(svr.url('/error500'), { maxRetries: 1 })
            let r = [t.status, t.reason, t.httpCode, t.attempts]
            let rr = ['error', 'http-error', 500, 2]
            assert.strict.deepEqual(r, rr)
        })

        //註: 不可用404推論重試上限——404不重試, 無論預設是0或5, attempts恆為1,
        //該寫法無法證明其標題。此處改以會重試之500並由server計數實際請求數
        it('maxRetries明確指定時, 實際請求數為maxRetries+1', async function() {
            this.timeout(60000)
            let n0 = svr.nCount500()
            let t = await fetchWebByCurl(svr.url('/count500'), { maxRetries: 2 })
            let r = [t.status, t.reason, t.attempts, svr.nCount500() - n0]
            let rr = ['error', 'http-error', 3, 3]
            assert.strict.deepEqual(r, rr)
        })

        it('maxRetries為0時只請求一次', async function() {
            this.timeout(60000)
            let n0 = svr.nCount500()
            let t = await fetchWebByCurl(svr.url('/count500'), { maxRetries: 0 })
            let r = [t.attempts, svr.nCount500() - n0]
            let rr = [1, 1]
            assert.strict.deepEqual(r, rr)
        })

        it('maxRetries為非法值時採預設值5, 實際請求6次', async function() {

            //預設5次重試之退避總和為3+6+9+12+15=45秒, 故逾時放寬
            this.timeout(180000)
            let n0 = svr.nCount500()
            let t = await fetchWebByCurl(svr.url('/count500'), { maxRetries: 'abc' })
            let r = [t.status, t.attempts, svr.nCount500() - n0]
            let rr = ['error', 6, 6]
            assert.strict.deepEqual(r, rr)
        })

        it('curl執行錯誤時依maxRetries重試後回curl-error', async function() {
            this.timeout(60000)
            let t = await fetchWebByCurl('http://127.0.0.1:1/x', { maxRetries: 1, timeoutMs: 2000 })
            let r = [t.status, t.reason, t.attempts]
            let rr = ['error', 'curl-error', 2]
            assert.strict.deepEqual(r, rr)
        })

        it('自訂UA、Referer、Accept-Language皆被採用', async function() {
            this.timeout(60000)
            let t = await fetchWebByCurl(svr.url('/article'), {
                maxRetries: 0,
                userAgent: 'MyUA/1.0',
                referer: 'https://my-referer.example/',
                acceptLanguage: 'zh-TW',
            })
            let r = [t.status, includes(t.html, MARKER)]
            let rr = ['success', true]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('fetchWebByPlaywrightHeadless', function() {

        it('waitForRedirect=true時走轉址等待路徑', async function() {
            if (!chromeOk) {
                this.skip()
            }
            this.timeout(120000)
            let t = await fetchWebByPlaywrightHeadless(svr.url('/article'), { maxRetries: 0, waitForRedirect: true })
            let r = [t.status, includes(t.html, MARKER)]
            let rr = ['success', true]
            assert.strict.deepEqual(r, rr)
        })

        it('導航失敗時依maxRetries重試後回playwright-error', async function() {
            if (!chromeOk) {
                this.skip()
            }
            this.timeout(120000)
            let t = await fetchWebByPlaywrightHeadless('http://127.0.0.1:1/x', { maxRetries: 1, navigationTimeoutMs: 2000 })
            let r = [t.status, t.reason, t.attempts]
            let rr = ['error', 'playwright-error', 2]
            assert.strict.deepEqual(r, rr)
        })

        it('maxRetries與postNavigationWaitMs為非法值時採預設', async function() {
            if (!chromeOk) {
                this.skip()
            }
            this.timeout(120000)
            let t = await fetchWebByPlaywrightHeadless(svr.url('/article'), { maxRetries: 'abc', postNavigationWaitMs: -1, navigationTimeoutMs: 'x' })
            let r = [t.status, includes(t.html, MARKER)]
            let rr = ['success', true]
            assert.strict.deepEqual(r, rr)
        })

    })

})
