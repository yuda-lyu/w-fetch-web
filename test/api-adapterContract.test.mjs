import assert from 'assert'
import map from 'lodash-es/map.js'
import includes from 'lodash-es/includes.js'
import fetchWeb, { inspectHtml } from '../src/fetchWeb.mjs'
import findAdapter from '../src/findAdapter.mjs'
import { MARKER, htmlArticle, htmlNextData } from './tools/serverForTest.mjs'
import useServer from './tools/useServer.mjs'


//本檔為 adapter 邊界契約之回歸測試。
//每條斷言對應 tmp/validate-plan.md 之需求 R01-R07, 目的在於這些缺陷不再復發。
describe('adapter邊界契約(R01-R07回歸)', function() {

    let svr = useServer()
    let optBase = { method: 'curl', maxRetries: 0, useShowLog: false }
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
                t = await fetchWeb('https://www.linkedin.com/redir/redirect?url=%25', { useShowLog: false, maxRetries: 0 })
            }
            catch (err) {
                r = err.constructor.name + ': ' + err.message
            }
            let rr = ['no-throw', 'error', 'invalid url (must be http/https)', '%']
            assert.strict.deepEqual([r, t?.status, t?.message, t?.url], rr)
        })

        it('合法之轉址參數仍可正確提取目標網址並續走完整流程', async function() {

            //目標刻意用公開網域而非本機測試伺服器: 提取出之目標須通過內網位址檢核,
            //以127.0.0.1為目標會(正確地)被擋下, 那條路徑另由「不提取內網目標」一組驗證。
            //改以假抓取器供應內容, 使本條專注於「提取→以目標網址重走流程」這件事
            let target = 'https://example.com/real-article'
            let fs = { curl: async (u) => ({ method: 'curl', status: 'success', html: htmlArticle, url: u }) }
            let t = await fetchWeb('https://www.linkedin.com/redir/redirect?url=' + encodeURIComponent(target), { useShowLog: false, maxRetries: 0, _fetchers: fs })
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

    describe('P0 adapter於計畫執行前解析一次', function() {

        //adapter之挑選只取決於網址, 與抓回之HTML無關, 故整個計畫內恆為同一結果。
        //此前挑選寫在parseArticle內, 每成功抓取一階就重跑一次
        let htmlOk = htmlArticle
        let mkFetchers = (over = {}) => {
            let n = 0
            let mk = (method) => async () => {
                n += 1
                return { method, status: 'success', html: htmlOk }
            }
            let fs = {
                curl: mk('curl'),
                playwrightHeadless: mk('playwright-headless'),
                playwrightHead: mk('playwright-headed'),
                camofox: mk('camofox'),
                ...over,
            }
            fs.n = () => n
            return fs
        }

        it('match拋錯時未發出任何請求, attempts為空', async function() {

            //此前實測: 錯誤在解析階才浮現, 而解析失敗會續下一階, 於是**整條階梯4次抓取全部跑完**,
            //每階都得到同一個adapter-error。adapter拋錯是呼叫端程式碼的確定性錯誤,
            //換一個抓取器不會讓它變好
            let fs = mkFetchers()
            let adapters = [{
                id: 'b',
                match: () => {
                    throw new Error('boom')
                },
                parse: () => ({ success: true, title: 't', content: contentOk }),
            }]
            let t = await fetchWeb('https://example.com/a', { useShowLog: false, _fetchers: fs, adapters })
            let r = [t.status, t.reason, t.message, t.attempts, fs.n()]
            let rr = ['error', 'adapter-error', 'adapter b match error: boom', [], 0]
            assert.strict.deepEqual(r, rr)
        })

        it('計畫跨多階時match仍只被呼叫一次', async function() {

            //curl失敗而升級至headless, 兩階共用同一次解析結果
            let calls = []
            let adapters = [{
                id: 'c',
                match: (u) => {
                    calls.push(u)
                    return false
                },
                parse: () => ({ success: true, title: 't', content: contentOk }),
            }]
            let fs = mkFetchers({
                curl: async () => ({ method: 'curl', status: 'error', reason: 'curl-error', message: 'x' }),
            })
            let t = await fetchWeb('https://example.com/a', { useShowLog: false, _fetchers: fs, adapters, maxRetries: 0 })
            let r = [t.status, t.method, calls.length]
            let rr = ['success', 'playwright-headless', 1]
            assert.strict.deepEqual(r, rr)
        })

        it('非決定性之match不再使各階用到不同adapter', async function() {

            //match每次回傳不同結果時, 此前各階會分別解析而用到不同adapter且無從察覺;
            //解析一次後, 全計畫恆為同一個
            let i = 0
            let adapters = [{
                id: 'flip',
                match: () => {
                    i += 1
                    return i % 2 === 1
                },
                parse: () => ({ success: true, title: 'BY-ADAPTER', content: contentOk }),
            }]
            let fs = mkFetchers({
                curl: async () => ({ method: 'curl', status: 'error', reason: 'curl-error', message: 'x' }),
            })
            let t = await fetchWeb('https://example.com/a', { useShowLog: false, _fetchers: fs, adapters, maxRetries: 0 })

            //首次match回true, 故命中adapter; i停在1證明只問過一次
            let r = [t.status, t.title, i]
            let rr = ['success', 'BY-ADAPTER', 1]
            assert.strict.deepEqual(r, rr)
        })

        it('parse=false時仍解析adapter, 其match錯誤照常回報', async function() {

            //此條先前斷言的是相反行為(parse=false即不挑adapter, 亦不回報其錯誤)。
            //那個設計在adapter只有parse一個掛點時說得通, 但adapter加上inspect宣告後前提就消失:
            //外部複審實測parse:false時match呼叫次數為0, 宣告的inspect:false完全不生效。
            //閘門遂改為「挑到之後諮詢哪些掛點」——inspect宣告恆諮詢, parse僅parse=true時諮詢
            let called = false
            let adapters = [{
                id: 'b',
                match: () => {
                    called = true
                    throw new Error('boom')
                },
                parse: () => ({ success: true, title: 't', content: contentOk }),
            }]
            let fs = mkFetchers()
            let t = await fetchWeb('https://example.com/a', { useShowLog: false, _fetchers: fs, adapters, parse: false })
            let r = [t.status, t.reason, called, fs.n()]
            let rr = ['error', 'adapter-error', true, 0]
            assert.strict.deepEqual(r, rr)
        })

        it('parse=false時adapter之inspect宣告仍生效, 不致白跑階梯', async function() {

            //缺陷形狀: 宣告inspect:false之adapter於parse:false時形同不存在, 於是頁面被判empty
            //而逐階升級, 真實環境即兩次Chrome啟動加一次camofox。回報之method還會變成camofox,
            //而站台若不在camofox能力範圍內即整次失敗
            let big = '<html><head><title>t</title></head><body><script>' + 'v'.repeat(6000) + '</script></body></html>'
            let n = 0
            let mk = (method) => async () => {
                n += 1
                return { method, status: 'success', html: big }
            }
            let fs = {
                curl: mk('curl'),
                playwrightHeadless: mk('playwright-headless'),
                playwrightHead: mk('playwright-headed'),
                camofox: mk('camofox'),
            }
            let adapters = [{
                id: 'a',
                match: /example\.com/,
                parse: () => ({ success: true, title: 'T', content: contentOk }),
                inspect: false,
            }]
            let t = await fetchWeb('https://example.com/a', { useShowLog: false, _fetchers: fs, adapters, parse: false })
            let r = [t.status, t.method, n, t.html === big]
            let rr = ['success', 'curl', 1, true]
            assert.strict.deepEqual(r, rr)
        })

        it('parse=false時不呼叫adapter之parse掛點', async function() {

            //恆諮詢的是inspect宣告而非parse: 呼叫端說了不解析就不解析
            let parsed = false
            let adapters = [{
                id: 'a',
                match: /example\.com/,
                parse: () => {
                    parsed = true
                    return { success: true, title: 'T', content: contentOk }
                },
            }]
            let fs = mkFetchers()
            let t = await fetchWeb('https://example.com/a', { useShowLog: false, _fetchers: fs, adapters, parse: false })
            let r = [t.status, parsed, t.title, t.html !== undefined]
            let rr = ['success', false, undefined, true]
            assert.strict.deepEqual(r, rr)
        })

        it('命中之adapter於升級後各階皆生效', async function() {

            //解析結果供全計畫共用, 不因換階而遺失
            let adapters = [{
                id: 'keep',
                match: /example\.com/,
                parse: () => ({ success: true, title: 'BY-ADAPTER', content: contentOk }),
            }]
            let fs = mkFetchers({
                curl: async () => ({ method: 'curl', status: 'error', reason: 'curl-error', message: 'x' }),
            })
            let t = await fetchWeb('https://example.com/a', { useShowLog: false, _fetchers: fs, adapters, maxRetries: 0 })
            let r = [t.status, t.method, t.title]
            let rr = ['success', 'playwright-headless', 'BY-ADAPTER']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('P2 adapter可宣告inspect豁免', function() {

        //通用判識會把「內嵌結構化資料但可見文字極少」的頁面判為空內容而升級,
        //於是註冊了adapter、自知如何解析該站台的呼叫端, 其adapter根本輪不到被呼叫。
        //此前唯一解法是opt.inspect=false, 但那是整次呼叫的開關: 呼叫端得自行先判斷
        //「這個網址是不是我有adapter的站台」——而那正是adapter.match已經在做的事
        let mkNext = (over) => [{
            id: 'nextdata',
            match: /127\.0\.0\.1/,
            parse: (html) => {
                let m = html.match(/__NEXT_DATA__[^>]*>(.*?)<\/script>/)
                if (!m) {
                    return { success: false, reason: 'my-adapter-no-data', message: 'no __NEXT_DATA__' }
                }
                return { success: true, title: 'NEXT', content: JSON.parse(m[1]).body }
            },
            ...over,
        }]

        it('未宣告時維持既有行為: 該頁於判識即被攔下', async function() {
            let t = await fetchWeb(svr.url('/nextdata'), { ...optBase, adapters: mkNext() })
            let r = [t.status, t.attempts[0].type]
            let rr = ['error', 'empty']
            assert.strict.deepEqual(r, rr)
        })

        it('宣告inspect:false後同一頁面之adapter可正常解析', async function() {

            //與既有「opt.inspect=false」那條測試對照: 同樣結果, 但豁免範圍只限此adapter命中之網址
            let t = await fetchWeb(svr.url('/nextdata'), { ...optBase, adapters: mkNext({ inspect: false }) })
            let r = [t.status, t.title, t.contentLength]
            let rr = ['success', 'NEXT', 8000]
            assert.strict.deepEqual(r, rr)
        })

        it('豁免只作用於命中該adapter之網址, 其餘網址照常判識', async function() {

            //此為本欄與opt.inspect的關鍵差異: 註冊一個宣告豁免但不命中的adapter,
            //不得使其他網址失去判識保護
            let adapters = [{
                id: 'other',
                match: /nowhere\.example/,
                parse: () => ({ success: true, title: 't', content: contentOk }),
                inspect: false,
            }]
            let t = await fetchWeb(svr.url('/challenge'), { ...optBase, adapters })
            let r = [t.status, t.reason]
            let rr = ['error', 'captcha']
            assert.strict.deepEqual(r, rr)
        })

        it('opt.inspect=false位階較高, adapter無法把判識開回來', async function() {

            //只做關不做開: opt是呼叫端對本次呼叫的明確指示, 位階高於站台知識;
            //反向若允許adapter強制開啟, 呼叫端就失去一個能一律關閉的總開關
            let adapters = [{
                id: 'x',
                match: /127\.0\.0\.1/,
                parse: () => ({ success: true, title: 'BY-ADAPTER', content: contentOk }),
                inspect: true,
            }]
            let t = await fetchWeb(svr.url('/challenge'), { ...optBase, inspect: false, adapters })
            let r = [t.status, t.title]
            let rr = ['success', 'BY-ADAPTER']
            assert.strict.deepEqual(r, rr)
        })

        it('inspect為非false之各種值一律視為要判識', async function() {

            //預設安全: 忘記標或標錯型別的後果是多判識(保守), 而非漏判識(危險)
            let r = []
            for (let v of [undefined, null, 0, '', 'false', true, 1]) {
                let t = await fetchWeb(svr.url('/nextdata'), { ...optBase, adapters: mkNext({ inspect: v }) })
                r.push(t.status)
            }
            let rr = map([1, 2, 3, 4, 5, 6, 7], () => 'error')
            assert.strict.deepEqual(r, rr)
        })

        it('內建adapter與使用端adapter一視同仁', async function() {

            //此欄不因adapter來自套件或呼叫端而有別; 以使用端覆寫內建同網域adapter之形式驗證
            let mine = { id: 'gelonghui', match: /127\.0\.0\.1/, parse: () => ({ success: true, title: 'MINE', content: contentOk }), inspect: false }
            let t = await fetchWeb(svr.url('/nextdata'), { ...optBase, adapters: [mine] })
            let r = [t.status, t.title]
            let rr = ['success', 'MINE']
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
