import assert from 'assert'
import map from 'lodash-es/map.js'
import fetchWeb from '../src/fetchWeb.mjs'
import { htmlArticle, htmlCnChallenge } from './tools/serverForTest.mjs'
import useServer from './tools/useServer.mjs'


//使用端判識器之接線回歸測試: 驗opt.detectors自fetchWeb經runPlan傳抵inspectHtml。
//
//unit-detectorContract驗的是inspectHtml本身的行為, 通過並不代表接線存在——
//此機制第一次接線完成時, 單獨呼叫inspectHtml已可正確攔下, 但經fetchWeb仍回success,
//故兩層都要有。
describe('使用端判識器之接線', function() {

    let svr = useServer()
    let optBase = { method: 'curl', maxRetries: 0, useShowLog: false }
    let mkDet = (over) => [{ id: 'cn', type: 'captcha', message: '中文攔阻頁', test: (c) => c.lower.includes('正在进行安全检测'), ...over }]

    describe('經fetchWeb之完整路徑', function() {

        it('未註冊時, 長篇中文攔阻頁被當成功文章回傳', async function() {

            //此為缺陷本身而非期望行為: 呼叫端拿到的是status=success與一份挑戰頁樣板文案,
            //且無任何欄位可據以察覺。內建判識器關鍵字全為英文, empty又因文案夠長而不觸發。
            //本條刻意鎖住現況, 使下一條「註冊後被攔下」證明的是機制生效, 而非頁面本來就會被攔
            let t = await fetchWeb(svr.url('/cnchallenge'), optBase)
            let r = [t.status, t.title, t.contentLength > 0]
            let rr = ['success', '安全验证', true]
            assert.strict.deepEqual(r, rr)
        })

        it('註冊後同一頁被攔下, reason與message即呼叫端所定義者', async function() {
            let t = await fetchWeb(svr.url('/cnchallenge'), { ...optBase, detectors: mkDet() })
            let r = [t.status, t.reason, t.message, t.title]
            let rr = ['error', 'captcha', '中文攔阻頁', undefined]
            assert.strict.deepEqual(r, rr)
        })

        it('attempts記錄為blocked, 且type與reason同值', async function() {

            //與內建判識所致之blocked形狀一致: 呼叫端不需區分是誰的判識器攔的
            let t = await fetchWeb(svr.url('/cnchallenge'), { ...optBase, detectors: mkDet() })
            let a = t.attempts[0]
            let r = [t.attempts.length, a.method, a.status, a.type, a.reason, a.message]
            let rr = [1, 'curl', 'blocked', 'captcha', 'captcha', '中文攔阻頁']
            assert.strict.deepEqual(r, rr)
        })

        it('parse=false時判識仍先行, 不因不解析而放行', async function() {

            //判識作用於原始HTML, 與是否以Readability解析無關;
            //兩者若耦合, 呼叫端一改parse就會靜默失去判識保護
            let t = await fetchWeb(svr.url('/cnchallenge'), { ...optBase, parse: false, detectors: mkDet() })
            let r = [t.status, t.reason, t.html]
            let rr = ['error', 'captcha', undefined]
            assert.strict.deepEqual(r, rr)
        })

        it('inspect=false時使用端判識器一併關閉, 與內建同進退', async function() {

            //inspect是判識這件事的總開關, 不因判識器來自呼叫端而例外——
            //呼叫端關掉判識即表示他要自行處理內容
            let t = await fetchWeb(svr.url('/cnchallenge'), { ...optBase, inspect: false, detectors: mkDet() })
            let r = [t.status, t.title]
            let rr = ['success', '安全验证']
            assert.strict.deepEqual(r, rr)
        })

        it('adapter之inspect:false不得關掉呼叫端自己註冊的判識器', async function() {

            //detectorContract檔頭明寫「套件保證註冊的判識器一定會被比對」, 而此前
            //adapter一宣告inspect:false就把呼叫端的判識器一起關掉——兩個不同擁有者共用一個布林。
            //adapter之inspect要豁免的是**套件對全世界頁面所下的猜測**, 不是呼叫端自己下的判準。
            //屬「閘門的軸與被閘的軸必須是同一個」之違反, 亦是no-op形狀的第四次
            let adapters = [{
                id: 'mysite',
                match: /127\.0\.0\.1/,
                parse: () => ({ success: true, title: 'BY-ADAPTER', content: 'C'.repeat(60) }),
                inspect: false,
            }]
            let t = await fetchWeb(svr.url('/cnchallenge'), { ...optBase, detectors: mkDet(), adapters })
            let r = [t.status, t.reason, t.message]
            let rr = ['error', 'captcha', '中文攔阻頁']
            assert.strict.deepEqual(r, rr)
        })

        it('adapter之inspect:false仍豁免內建判識器', async function() {

            //對照組: 上一條不得反過來把豁免整個取消掉。內建之empty仍須被關掉,
            //否則adapter根本輪不到被呼叫——那是該欄位存在的理由
            let big = '<html><head><title>t</title></head><body><script>' + 'v'.repeat(6000) + '</script></body></html>'
            let fs = { curl: async () => ({ method: 'curl', status: 'success', html: big }) }
            let adapters = [{
                id: 'mysite',
                match: /example\.com/,
                parse: () => ({ success: true, title: 'BY-ADAPTER', content: 'C'.repeat(60) }),
                inspect: false,
            }]
            let t = await fetchWeb('https://example.com/a', { method: 'curl', maxRetries: 0, useShowLog: false, _fetchers: fs, detectors: mkDet(), adapters })
            let r = [t.status, t.title]
            let rr = ['success', 'BY-ADAPTER']
            assert.strict.deepEqual(r, rr)
        })

        it('opt.inspect=false則兩邊都關, 那是呼叫端對本次呼叫的明確指示', async function() {

            //與上一條刻意不同: opt是總開關, 呼叫端自己關掉全部判識是他的決定;
            //adapter之inspect則只擁有「套件的通用判識」這一半
            let t = await fetchWeb(svr.url('/cnchallenge'), { ...optBase, detectors: mkDet(), inspect: false })
            let r = [t.status, t.title]
            let rr = ['success', '安全验证']
            assert.strict.deepEqual(r, rr)
        })

        it('不合契約之判識器經fetchWeb亦只略過, 不使抓取失敗', async function() {
            let bad = [null, { type: 'bogus', message: 'm', test: () => true }]
            let t = await fetchWeb(svr.url('/article'), { ...optBase, detectors: bad })
            let r = [t.status, t.title]
            let rr = ['success', 'W Fetch Web Test Article']
            assert.strict.deepEqual(r, rr)
        })

        it('判識器拋錯不使抓取失敗, 正常頁面照常回傳', async function() {
            let bad = [{
                id: 'bad',
                type: 'captcha',
                message: 'm',
                test: () => {
                    throw new Error('boom')
                },
            }]
            let t = await fetchWeb(svr.url('/article'), { ...optBase, detectors: bad })
            let r = [t.status, t.title]
            let rr = ['success', 'W Fetch Web Test Article']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('auto模式下驅動階梯升級', function() {

        //以opt._fetchers置換抓取函數, 與unit-escalation同法。
        //註冊判識器的實際目的不只是回報blocked, 而是讓auto模式據以升級到下一階——
        //只驗「有回blocked」不足以證明這一點
        let mk = (method, html) => {
            let calls = []
            let fun = async () => {
                calls.push(1)
                return { method, status: 'success', html }
            }
            fun.calls = calls
            return fun
        }

        it('curl取回之中文攔阻頁經使用端判識器判定後升級, 次階成功', async function() {
            let fs = {
                curl: mk('curl', htmlCnChallenge),
                playwrightHeadless: mk('playwright-headless', htmlArticle),
            }
            let t = await fetchWeb('https://example.com/a', { useShowLog: false, _fetchers: fs, detectors: mkDet() })
            let r = [
                t.status,
                t.method,
                map(t.attempts, (a) => [a.method, a.status, a.type]),
                [fs.curl.calls.length, fs.playwrightHeadless.calls.length],
            ]
            let rr = [
                'success',
                'playwright-headless',
                [['curl', 'blocked', 'captcha'], ['playwright-headless', 'success', undefined]],
                [1, 1],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('未註冊時同一情境不升級, curl即回傳攔阻頁內容', async function() {

            //對照組: 證明上一條的升級確實由判識器所驅動, 而非階梯本來就會走到次階
            let fs = {
                curl: mk('curl', htmlCnChallenge),
                playwrightHeadless: mk('playwright-headless', htmlArticle),
            }
            let t = await fetchWeb('https://example.com/a', { useShowLog: false, _fetchers: fs })
            let r = [t.status, t.method, t.title, [fs.curl.calls.length, fs.playwrightHeadless.calls.length]]
            let rr = ['success', 'curl', '安全验证', [1, 0]]
            assert.strict.deepEqual(r, rr)
        })

    })

})
