import assert from 'assert'
import includes from 'lodash-es/includes.js'
import fetchWebByCurl from '../src/fetchWebByCurl.mjs'
import { MARKER } from './tools/serverForTest.mjs'
import useServer from './tools/useServer.mjs'


describe('fetchWebByCurl', function() {

    let svr = useServer()

    it('非有效字串網址回傳invalid-url', async function() {
        let r = []
        for (let url of [null, undefined, '', 123, {}]) {
            let t = await fetchWebByCurl(url)
            r.push([t.status, t.reason, t.method, t.attempts])
        }
        let rr = [
            ['error', 'invalid-url', 'curl', 0],
            ['error', 'invalid-url', 'curl', 0],
            ['error', 'invalid-url', 'curl', 0],
            ['error', 'invalid-url', 'curl', 0],
            ['error', 'invalid-url', 'curl', 0],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('非http與https網址回傳invalid-url', async function() {
        let r = []
        for (let url of ['abc', 'ftp://a.com/', 'file:///c:/a.html']) {
            let t = await fetchWebByCurl(url)
            r.push([t.status, t.reason, t.attempts])
        }
        let rr = [
            ['error', 'invalid-url', 0],
            ['error', 'invalid-url', 0],
            ['error', 'invalid-url', 0],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('抓取正常網頁回傳原始HTML', async function() {
        let t = await fetchWebByCurl(svr.url('/article'), { maxRetries: 0 })
        let r = [t.status, t.httpCode, t.method, t.attempts, includes(t.html, MARKER), t.htmlLength === t.html.length]
        let rr = ['success', 200, 'curl', 1, true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('HTTP 404不重試並回傳http-error', async function() {
        let t = await fetchWebByCurl(svr.url('/nothing'), { maxRetries: 5 })
        let r = [t.status, t.reason, t.httpCode, t.attempts]
        let rr = ['error', 'http-error', 404, 1]
        assert.strict.deepEqual(r, rr)
    })

    it('內容過短回傳empty-response', async function() {
        let t = await fetchWebByCurl(svr.url('/short'), { maxRetries: 0 })
        let r = [t.status, t.reason, t.httpCode]
        let rr = ['error', 'empty-response', 200]
        assert.strict.deepEqual(r, rr)
    })

    it('curl執行失敗時依maxRetries決定執行次數', async function() {

        //Windows對127.0.0.1保留埠不會立即拒絕連線, 而是由curl的--max-time收尾,
        //故本案例耗時必大於timeoutMs, 須高於mocha預設的2000ms方不誤判逾時
        this.timeout(30000)

        //連線不到之埠號, 令curl必然失敗, maxRetries=0代表僅執行1次
        let t = await fetchWebByCurl('http://127.0.0.1:1/abc', { maxRetries: 0, timeoutMs: 1000 })
        let r = [t.status, t.reason, t.method, t.attempts]
        let rr = ['error', 'curl-error', 'curl', 1]
        assert.strict.deepEqual(r, rr)
    })

})
