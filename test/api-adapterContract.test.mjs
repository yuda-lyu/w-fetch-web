import assert from 'assert'
import map from 'lodash-es/map.js'
import includes from 'lodash-es/includes.js'
import fetchWeb, { inspectHtml } from '../src/fetchWeb.mjs'
import findAdapter from '../src/findAdapter.mjs'
import { MARKER, htmlNextData } from './tools/serverForTest.mjs'
import useServer from './tools/useServer.mjs'


//本檔為 adapter 邊界契約之回歸測試。
//每條斷言對應 tmp/validate-plan.md 之需求 R01-R07, 目的在於這些缺陷不再復發。
describe('adapter邊界契約(R01-R07回歸)', function() {

    let svr = useServer()
    let optBase = { method: 'curl', maxRetries: 0, showLog: false }
    let mk = (parse) => [{ id: 'test', match: /127\.0\.0\.1/, parse }]
    let contentOk = 'ADAPTER CONTENT '.repeat(6)

    describe('R01 async之match與parse不得產生unhandledRejection', function() {

        //以攔截器記錄整段測試期間之unhandledRejection, 結束後還原
        let rejections = []
        let onRejection = (err) => {
            rejections.push(err?.message || String(err))
        }

        before(function() {
            process.on('unhandledRejection', onRejection)
        })

        after(function() {
            process.off('unhandledRejection', onRejection)
        })

        it('async parse正常回傳時可正確取得內容', async function() {
            let adapters = mk(async () => ({ success: true, title: 'ASYNC', content: contentOk }))
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, t.title, t.contentLength]
            let rr = ['success', 'ASYNC', contentOk.length]
            assert.strict.deepEqual(r, rr)
        })

        it('async parse之reject轉為parse-error, 不外洩為unhandledRejection', async function() {
            let adapters = mk(async () => {
                throw new Error('async boom')
            })
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, t.reason, t.message]
            let rr = ['error', 'parse-error', 'adapter test parse error: async boom']
            assert.strict.deepEqual(r, rr)
        })

        it('async match正常回傳時ctx可用', async function() {
            let got = null
            let adapters = [{
                id: 'am',
                match: async () => ({ tag: 'async-ctx' }),
                parse: (html, url, ctx) => {
                    got = ctx
                    return { success: true, title: 't', content: contentOk }
                },
            }]
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, got]
            let rr = ['success', { tag: 'async-ctx' }]
            assert.strict.deepEqual(r, rr)
        })

        it('async match之reject轉為adapter-error, 不外洩為unhandledRejection', async function() {
            let adapters = [{
                id: 'am',
                match: async () => {
                    throw new Error('async match boom')
                },
                parse: () => ({ success: true, title: 't', content: contentOk }),
            }]
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, t.reason, t.message]
            let rr = ['error', 'adapter-error', 'adapter am match error: async match boom']
            assert.strict.deepEqual(r, rr)
        })

        it('上述四案例期間未出現任何unhandledRejection', async function() {

            //等待一輪microtask與macrotask, 讓潛在之未處理rejection有機會浮現
            await new Promise((resolve) => setTimeout(resolve, 50))
            let r = rejections
            let rr = []
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('R02 inspect開關(與parse對稱)', function() {

        let mkNextAdapter = () => {
            return [{
                id: 'nextdata',
                match: /127\.0\.0\.1/,
                parse: (html) => {
                    let m = html.match(/__NEXT_DATA__[^>]*>(.*?)<\/script>/)
                    if (!m) {
                        return { success: false, reason: 'my-adapter-no-data', message: 'no __NEXT_DATA__' }
                    }
                    return { success: true, title: 'NEXT', content: JSON.parse(m[1]).body }
                },
            }]
        }

        it('inspect預設開啟時, 可見文字過少之頁面於判識即被攔下, adapter不被呼叫', async function() {
            let called = false
            let adapters = [{
                id: 'nextdata',
                match: /127\.0\.0\.1/,
                parse: () => {
                    called = true
                    return { success: true, title: 't', content: contentOk }
                },
            }]
            let t = await fetchWeb(svr.url('/nextdata'), { ...optBase, adapters })
            let r = [t.status, called, t.attempts[0].type]
            let rr = ['error', false, 'empty']
            assert.strict.deepEqual(r, rr)
        })

        it('inspect=false時同一頁面之adapter可正常解析', async function() {
            let t = await fetchWeb(svr.url('/nextdata'), { ...optBase, inspect: false, adapters: mkNextAdapter() })
            let r = [t.status, t.title, t.contentLength]
            let rr = ['success', 'NEXT', 8000]
            assert.strict.deepEqual(r, rr)
        })

        it('inspect=false不影響正常頁面之既有行為', async function() {
            let t = await fetchWeb(svr.url('/article'), { ...optBase, inspect: false })
            let r = [t.status, t.title, includes(t.content, MARKER)]
            let rr = ['success', 'W Fetch Web Test Article', true]
            assert.strict.deepEqual(r, rr)
        })

        it('inspect非布林時採預設true', async function() {
            let r = []
            for (let v of [null, 'false', 0, undefined]) {
                let t = await fetchWeb(svr.url('/challenge'), { ...optBase, inspect: v })
                r.push(t.attempts[0].type)
            }
            let rr = ['captcha', 'captcha', 'captcha', 'captcha']
            assert.strict.deepEqual(r, rr)
        })

        //直接對server實際供應之fixture斷言, 不另造複本, 否則fixture改動後此斷言仍會對舊複本通過
        it('測試伺服器之/nextdata頁面確為inspectHtml判定empty之型態', function() {
            let t = inspectHtml(htmlNextData)
            let r = [t.pass, t.type]
            let rr = [false, 'empty']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('R03 轉址目標二次解碼不得使fetchWeb reject', function() {

        //須用auto模式: 指定method時, 轉址參數提取在流程上根本不會被執行,
        //以method:'curl'測此案例會直接抓原網址而假性通過, 測不到二次解碼
        it('轉址參數為非法百分比序列時回傳結果物件而非拋錯', async function() {
            let r = 'no-throw'
            let t = null
            try {
                t = await fetchWeb('https://www.linkedin.com/redir/redirect?url=%25', { showLog: false, maxRetries: 0 })
            }
            catch (err) {
                r = err.constructor.name + ': ' + err.message
            }
            let rr = ['no-throw', 'error', 'invalid url (must be http/https)', '%']
            assert.strict.deepEqual([r, t?.status, t?.message, t?.url], rr)
        })

        it('合法之轉址參數仍可正確提取目標網址並續走完整流程', async function() {

            //目標指向本機測試伺服器, 使curl該階即成功, 不觸發瀏覽器階梯
            let target = svr.url('/article')
            let t = await fetchWeb('https://www.linkedin.com/redir/redirect?url=' + encodeURIComponent(target), { showLog: false, maxRetries: 0 })
            let r = [t.status, t.url, t.title]
            let rr = ['success', target, 'W Fetch Web Test Article']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('R04 保留欄位不得改變輸出形狀', function() {

        it('adapter回傳html等保留欄位時仍輸出title與content形狀', async function() {
            let adapters = mk(() => ({
                success: true,
                title: 'T',
                content: contentOk,
                html: '<p>debug</p>',
                method: 'hacked',
                snapshot: 'x',
            }))
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, t.title, t.content, t.html, t.snapshot, t.method]
            let rr = ['success', 'T', contentOk, undefined, undefined, 'curl']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('R05 success須為嚴格布林', function() {

        it('success非布林一律判為契約錯誤', async function() {
            let r = []
            for (let v of ['false', 'true', 1, 0, undefined, null, {}]) {
                let adapters = mk(() => ({ success: v, title: 't', content: contentOk }))
                let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
                r.push([t.status, t.reason])
            }
            let rr = map([1, 2, 3, 4, 5, 6, 7], () => ['error', 'parse-error'])
            assert.strict.deepEqual(r, rr)
        })

        it('success為true或false時正常分流', async function() {
            let tT = await fetchWeb(svr.url('/article'), { ...optBase, adapters: mk(() => ({ success: true, title: 't', content: contentOk })) })
            let tF = await fetchWeb(svr.url('/article'), { ...optBase, adapters: mk(() => ({ success: false, reason: 'my-adapter-no-data', message: 'm' })) })
            let r = [tT.status, tF.status]
            let rr = ['success', 'error']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('R06 失敗原因須可辨識', function() {

        it('adapter自述之reason保留至頂層與attempts', async function() {
            let adapters = mk(() => ({ success: false, reason: 'my-adapter-no-data', message: 'no state found' }))
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.status, t.reason, t.message, t.attempts[0].reason]
            let rr = ['error', 'my-adapter-no-data', 'no state found', 'my-adapter-no-data']
            assert.strict.deepEqual(r, rr)
        })

        it('adapter程式錯誤與內容真的為空可由reason區分', async function() {
            let tErr = await fetchWeb(svr.url('/article'), {
                ...optBase,
                adapters: mk(() => {
                    throw new Error('boom')
                })
            })
            let tEmpty = await fetchWeb(svr.url('/article'), { ...optBase, adapters: mk(() => ({ success: true, title: 't', content: 'abc' })) })
            let r = [tErr.reason, tEmpty.reason]
            let rr = ['parse-error', 'empty-content']
            assert.strict.deepEqual(r, rr)
        })

        it('adapter未給reason時填入預設值, 不留空', async function() {
            let adapters = mk(() => ({ success: false }))
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = [t.reason, t.message]
            let rr = ['adapter-parse-failed', 'adapter test parse failed']
            assert.strict.deepEqual(r, rr)
        })

        it('未使用adapter之既有失敗路徑不受影響, 仍無reason欄位', async function() {
            let t = await fetchWeb(svr.url('/challenge'), optBase)
            let r = [t.status, t.message, t.reason]
            let rr = ['error', 'Cloudflare/anti-bot challenge', 'captcha']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('R07 contentLength須為由content計算之整數', function() {

        it('adapter自述之contentLength一律不採信', async function() {
            let r = []
            for (let v of ['999', 999, -1, 1.5, null]) {
                let adapters = mk(() => ({ success: true, title: 't', content: contentOk, contentLength: v }))
                let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
                r.push([t.contentLength, typeof t.contentLength])
            }
            let rr = map([1, 2, 3, 4, 5], () => [contentOk.length, 'number'])
            assert.strict.deepEqual(r, rr)
        })

        it('contentLength與content長度恆一致', async function() {
            let adapters = mk(() => ({ success: true, title: 't', content: contentOk }))
            let t = await fetchWeb(svr.url('/article'), { ...optBase, adapters })
            let r = t.contentLength === t.content.length
            let rr = true
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('findAdapter之async契約', function() {

        it('回傳Promise且不reject', async function() {
            let bad = [{
                id: 'b',
                match: async () => {
                    throw new Error('x')
                },
                parse: () => ({ success: true }),
            }]
            let p = findAdapter('https://a.com/', bad)
            let isPm = typeof p.then === 'function'
            let t = await p
            let r = [isPm, t.type, t.id]
            let rr = [true, 'error', 'b']
            assert.strict.deepEqual(r, rr)
        })

    })

})
