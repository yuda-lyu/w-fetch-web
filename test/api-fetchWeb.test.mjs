import assert from 'assert'
import includes from 'lodash-es/includes.js'
import fetchWeb from '../src/fetchWeb.mjs'
import { MARKER, htmlArticle } from './tools/serverForTest.mjs'
import useServer from './tools/useServer.mjs'


describe('fetchWeb', function() {

    let svr = useServer()

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
                [{ method: 'curl', status: 'success', htmlLength: htmlArticle.length }],
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

                //blocked有兩種來源(判識與解析失敗), 兩者形狀一致故呼叫端可一律讀reason;
                //判識所致者其reason與type同值
                [{ method: 'curl', status: 'blocked', type: 'captcha', reason: 'captcha', message: 'Cloudflare/anti-bot challenge' }],
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

    describe('adapters', function() {

        //命中本機測試伺服器之adapter, 回傳固定內容供斷言
        let mkAdapter = (parse) => {
            return { id: 'test', match: /127\.0\.0\.1/, parse }
        }
        let optBase = { method: 'curl', maxRetries: 0, showLog: false }

        //通過MIN_CONTENT門檻之內容
        let contentOk = 'ADAPTER CONTENT '.repeat(6)

        it('命中之adapter取代Readability, 內容由adapter產出', async function() {
            let adapters = [mkAdapter(() => {
                return { success: true, title: 'ADAPTER TITLE', content: contentOk }
            })]
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, t.title, t.content, t.contentLength]
            let rr = ['success', 'ADAPTER TITLE', contentOk, contentOk.length]
            assert.strict.deepEqual(r, rr)
        })

        it('adapter內容未達MIN_CONTENT門檻時視為解析失敗, 與Readability路徑同一門檻', async function() {
            let r = []
            for (let v of ['abc', '', undefined, 123]) {
                let adapters = [mkAdapter(() => ({ success: true, title: 't', content: v }))]
                let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
                r.push([t.status, t.message])
            }
            let rr = [
                ['error', 'adapter test content too short (3 chars)'],
                ['error', 'adapter test content too short (0 chars)'],
                ['error', 'adapter test content too short (0 chars)'],
                ['error', 'adapter test content too short (0 chars)'],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('adapter之parse可取得html、url與ctx三個引數', async function() {
            let got = null
            let adapters = [{
                id: 'test',
                match: () => ({ tag: 'ctx-value' }),
                parse: (html, url, ctx) => {
                    got = [includes(html, MARKER), url, ctx]
                    return { success: true, title: 't', content: 'c'.repeat(60) }
                },
            }]
            await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = got
            let rr = [true, svr.url('/article'), { tag: 'ctx-value' }]
            assert.strict.deepEqual(r, rr)
        })

        it('contentLength一律由content計算, 不採信adapter自述值', async function() {
            let adapters = [mkAdapter(() => {
                return { success: true, title: 't', content: contentOk, contentLength: 999 }
            })]
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, t.contentLength]
            let rr = ['success', contentOk.length]
            assert.strict.deepEqual(r, rr)
        })

        it('adapter回傳success:false時視為解析失敗', async function() {
            let adapters = [mkAdapter(() => {
                return { success: false, reason: 'custom-parser-miss', message: 'no content found' }
            })]
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, t.message, t.attempts[0].status, t.attempts[0].type]
            let rr = ['error', 'no content found', 'blocked', 'empty']
            assert.strict.deepEqual(r, rr)
        })

        it('adapter之parse拋錯時不使fetchWeb reject, 落成parse-error', async function() {
            let adapters = [mkAdapter(() => {
                throw new Error('boom')
            })]
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, t.message]
            let rr = ['error', 'adapter test parse error: boom']
            assert.strict.deepEqual(r, rr)
        })

        it('adapter之parse回傳非物件時落成parse-error', async function() {
            let r = []
            for (let v of [undefined, null, 'abc', 123]) {
                let adapters = [mkAdapter(() => v)]
                let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
                r.push([t.status, t.message])
            }
            let rr = [
                ['error', 'adapter test returned invalid result'],
                ['error', 'adapter test returned invalid result'],
                ['error', 'adapter test returned invalid result'],
                ['error', 'adapter test returned invalid result'],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('adapter之match拋錯時顯性回報adapter-error, 不靜默退回Readability', async function() {

            //呼叫端註冊adapter即代表選定該解析階段, 靜默改用Readability
            //會讓呼叫端在不知情下經歷未選擇的處理管線階段
            let adapters = [{
                id: 'bad',
                match: () => {
                    throw new Error('boom')
                },
                parse: () => ({ success: true, title: 'X', content: 'X'.repeat(60) }),
            }]
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, t.message, t.title, t.content]
            let rr = ['error', 'adapter bad match error: boom', undefined, undefined]
            assert.strict.deepEqual(r, rr)
        })

        it('未命中adapter時走Readability, 行為與未傳adapters一致', async function() {
            let adapters = [{ id: 'other', match: /nowhere\.example/, parse: () => ({ success: true, title: 'X', content: 'X' }) }]
            let tA = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let tB = await fetchWeb(svr.url('/article'), optBase)
            let r = [tA.status, tA.title, tA.contentLength === tB.contentLength]
            let rr = ['success', 'W Fetch Web Test Article', true]
            assert.strict.deepEqual(r, rr)
        })

        it('adapters非陣列時視為未傳, 不影響既有行為', async function() {
            let r = []
            for (let v of [null, 'abc', 123, { id: 'x' }]) {
                let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters: v })
                r.push([t.status, t.title])
            }
            let rr = [
                ['success', 'W Fetch Web Test Article'],
                ['success', 'W Fetch Web Test Article'],
                ['success', 'W Fetch Web Test Article'],
                ['success', 'W Fetch Web Test Article'],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('parse=false時不呼叫adapter之parse, 回傳原始html', async function() {
            let called = false
            let adapters = [mkAdapter(() => {
                called = true
                return { success: true, title: 't', content: 'c' }
            })]
            let t = await fetchWeb(svr.url('/article'), { ...optBase, parse: false, adapters })
            let r = [t.status, called, t.html === htmlArticle, t.title]
            let rr = ['success', false, true, undefined]
            assert.strict.deepEqual(r, rr)
        })

        it('auto模式亦套用adapter, 於curl該階即由adapter解析', async function() {
            let adapters = [mkAdapter(() => {
                return { success: true, title: 'AUTO ADAPTER', content: 'x'.repeat(60) }
            })]
            let t = await fetchWeb(svr.url('/article'), { maxRetries: 0, showLog: false, adapters })
            let r = [t.status, t.method, t.title, t.attempts.length]
            let rr = ['success', 'curl', 'AUTO ADAPTER', 1]
            assert.strict.deepEqual(r, rr)
        })

    })

})
