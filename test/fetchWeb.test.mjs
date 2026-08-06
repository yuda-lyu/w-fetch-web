import assert from 'assert'
import includes from 'lodash-es/includes.js'
import fetchWeb, { inspectHtml } from '../src/fetchWeb.mjs'
import serverForTest, { MARKER, htmlArticle, htmlChallenge } from './tools/serverForTest.mjs'


describe('fetchWeb', function() {

    let svr = null

    before(async function() {
        svr = await serverForTest()
    })

    after(async function() {
        if (svr) {
            await svr.close()
        }
    })

    describe('inspectHtml', function() {

        it('正常文章頁通過檢測', function() {
            let r = inspectHtml(htmlArticle)
            let rr = { pass: true, type: 'pass', message: 'ok' }
            assert.strict.deepEqual(r, rr)
        })

        it('Cloudflare挑戰頁判為captcha', function() {
            let r = inspectHtml(htmlChallenge)
            let rr = { pass: false, type: 'captcha', message: 'Cloudflare/anti-bot challenge' }
            assert.strict.deepEqual(r, rr)
        })

        it('各類反爬蟲頁面判為captcha', function() {
            let r = [
                inspectHtml('<html><body>go to captcha-delivery.com</body></html>').type,
                inspectHtml('<html><body>_pxhd perimeterx blocked</body></html>').type,
                inspectHtml('<html><body><div class="cf-challenge-running"></div></body></html>').type,
                inspectHtml('<html><head><title>Are you a robot?</title></head><body></body></html>').type,
                inspectHtml('<html><body><div class="cf-turnstile"></div></body></html>').type,
                inspectHtml('<html><body>verify you are human</body></html>').type,
                inspectHtml('<html><body>your request has been blocked</body></html>').type,
                inspectHtml('<html><head><title>Access Denied</title></head><body></body></html>').type,
            ]
            let rr = ['captcha', 'captcha', 'captcha', 'captcha', 'captcha', 'captcha', 'captcha', 'captcha']
            assert.strict.deepEqual(r, rr)
        })

        it('微信驗證頁判為verify', function() {
            let r = inspectHtml('<html><body><div id="secitptPage">go wx.qq.com</div></body></html>')
            let rr = { pass: false, type: 'verify', message: 'WeChat verification page' }
            assert.strict.deepEqual(r, rr)
        })

        it('meta refresh轉址頁判為redirect', function() {
            let r = inspectHtml('<html><head><meta http-equiv="refresh" content="0;url=https://a.com/b"></head><body></body></html>')
            let rr = { pass: false, type: 'redirect', message: 'meta refresh redirect' }
            assert.strict.deepEqual(r, rr)
        })

        it('平台殼頁須標題與內容雙條件同時成立才判為redirect', function() {

            //標題含關鍵字且內容近乎為空, 判為殼頁
            let rWrapper = inspectHtml('<html><head><title>MSN</title></head><body><div></div></body></html>').type

            //標題含關鍵字但內容充足, 不可誤殺為殼頁
            let rReal = inspectHtml('<html><head><title>MSN</title></head><body><p>' + 'abcde '.repeat(200) + '</p></body></html>').type

            let r = [rWrapper, rReal]
            let rr = ['redirect', 'pass']
            assert.strict.deepEqual(r, rr)
        })

        it('大量HTML但可見文字過少判為empty', function() {
            let html = '<html><head><title>abc</title></head><body><script>' + 'v'.repeat(6000) + '</script><p>xyz</p></body></html>'
            let r = inspectHtml(html).type
            let rr = 'empty'
            assert.strict.deepEqual(r, rr)
        })

        it('非有效字串判為empty', function() {
            let r = [
                inspectHtml('').type,
                inspectHtml(null).type,
                inspectHtml(123).type,
            ]
            let rr = ['empty', 'empty', 'empty']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('fetchWeb', function() {

        it('非有效字串網址回傳error', async function() {
            let t = await fetchWeb(null, { showLog: false })
            let r = [t.status, t.message, t.attempts]
            let rr = ['error', 'url is required (string)', []]
            assert.strict.deepEqual(r, rr)
        })

        it('非http與https網址即刻回傳error, 不空跑各抓取方法', async function() {
            let t = await fetchWeb('abc', { showLog: false })
            let r = [t.status, t.message, t.attempts]
            let rr = ['error', 'invalid url (must be http/https)', []]
            assert.strict.deepEqual(r, rr)
        })

        it('未知method回傳error', async function() {
            let t = await fetchWeb(svr.url('/article'), { method: 'xxx', showLog: false })
            let r = [t.status, t.message, t.attempts]
            let rr = ['error', 'unknown method "xxx" (valid: curl, playwright, playwright-headed, camofox)', []]
            assert.strict.deepEqual(r, rr)
        })

        it('指定method=curl且parse=true, 回傳解析後標題與內文', async function() {
            let t = await fetchWeb(svr.url('/article'), { method: 'curl', maxRetries: 0, showLog: false })
            let r = [
                t.status,
                t.method,
                t.title,
                includes(t.content, MARKER),
                t.contentLength === t.content.length,
                t.contentLength >= 50,
                t.html,
                t.attempts,
            ]
            let rr = [
                'success',
                'curl',
                'W Fetch Web Test Article',
                true,
                true,
                true,
                undefined,
                [{ method: 'curl', status: 'success', contentLength: htmlArticle.length }],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('指定method=curl且parse=false, 回傳原始HTML', async function() {
            let t = await fetchWeb(svr.url('/article'), { method: 'curl', parse: false, maxRetries: 0, showLog: false })
            let r = [t.status, t.method, t.html === htmlArticle, t.title, t.content]
            let rr = ['success', 'curl', true, undefined, undefined]
            assert.strict.deepEqual(r, rr)
        })

        it('auto模式對可直接抓取之網頁, 於curl即成功不再升級', async function() {
            let t = await fetchWeb(svr.url('/article'), { maxRetries: 0, showLog: false })
            let r = [t.status, t.method, t.attempts.length, t.attempts[0].method, t.attempts[0].status]
            let rr = ['success', 'curl', 1, 'curl', 'success']
            assert.strict.deepEqual(r, rr)
        })

        it('指定method時被inspectHtml判為挑戰頁, 回傳error且attempts記blocked', async function() {
            let t = await fetchWeb(svr.url('/challenge'), { method: 'curl', maxRetries: 0, showLog: false })
            let r = [t.status, t.message, t.attempts]
            let rr = [
                'error',
                'Cloudflare/anti-bot challenge',
                [{ method: 'curl', status: 'blocked', type: 'captcha', message: 'Cloudflare/anti-bot challenge' }],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('抓取失敗時attempts記failed且不reject', async function() {
            let t = await fetchWeb(svr.url('/nothing'), { method: 'curl', maxRetries: 0, showLog: false })
            let r = [t.status, t.attempts]
            let rr = [
                'error',
                [{ method: 'curl', status: 'failed', reason: 'http-error', message: 'HTTP 404' }],
            ]
            assert.strict.deepEqual(r, rr)
        })

    })

})
