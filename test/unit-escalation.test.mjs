import assert from 'assert'
import map from 'lodash-es/map.js'
import fetchWeb from '../src/fetchWeb.mjs'
import { htmlArticle, htmlChallenge } from './tools/serverForTest.mjs'


//以opt._fetchers置換四個抓取函數, 精確驅動階梯升級各情境
//真跑階梯需啟動Chrome兩次加camofox一次且有頭模式會彈視窗, 無法作為常規測試

//通過inspect且Readability可解析
let HTML_OK = htmlArticle

//通過inspect但內文不足, Readability解析失敗(html<5000故不會被判empty)
let HTML_THIN = '<html><head><title>x</title></head><body><p>short</p></body></html>'

//被inspect判captcha
let HTML_BLOCK = htmlChallenge

//被inspect判redirect
let HTML_REDIRECT = '<html><head><meta http-equiv="refresh" content="0;url=https://a.com/b"><title>x</title></head><body></body></html>'


//產生假抓取函數, 記錄每次呼叫並依序回傳指定結果(用盡則沿用最後一個)
let mk = (method, results) => {
    let calls = []
    let i = 0
    let fun = async (url, opt) => {
        calls.push({ url, waitForRedirect: opt?.waitForRedirect })
        let r = results[Math.min(i, results.length - 1)]
        i += 1
        return { method, ...r }
    }
    fun.calls = calls
    return fun
}
let ok = (html) => ({ status: 'success', html })
let fail = (reason, message) => ({ status: 'error', reason, message: message || reason })

//四個假抓取函數與其呼叫次數
let mkAll = (o = {}) => {
    let fs = {
        curl: mk('curl', o.curl || [fail('http-error', 'HTTP 500')]),
        playwrightHeadless: mk('playwright-headless', o.playwrightHeadless || [fail('playwright-error', 'nav failed')]),
        playwrightHead: mk('playwright-headed', o.playwrightHead || [fail('playwright-error', 'nav failed')]),
        camofox: mk('camofox', o.camofox || [fail('camofox-error', 'no snapshot')]),
    }
    fs.counts = () => [fs.curl.calls.length, fs.playwrightHeadless.calls.length, fs.playwrightHead.calls.length, fs.camofox.calls.length]
    return fs
}

let URL_PLAIN = 'https://example.com/article'
let run = (url, fs, extra = {}) => fetchWeb(url, { useShowLog: false, _fetchers: fs, ...extra })


describe('階梯升級', function() {

    describe('升級觸發條件', function() {

        it('curl即成功時不升級, 僅一筆attempt', async function() {
            let fs = mkAll({ curl: [ok(HTML_OK)] })
            let t = await run(URL_PLAIN, fs)
            let r = [t.status, t.method, t.attempts.length, fs.counts()]
            let rr = ['success', 'curl', 1, [1, 0, 0, 0]]
            assert.strict.deepEqual(r, rr)
        })

        it('curl抓取失敗(fetch failed)時升級至headless', async function() {
            let fs = mkAll({ curl: [fail('http-error', 'HTTP 500')], playwrightHeadless: [ok(HTML_OK)] })
            let t = await run(URL_PLAIN, fs)
            let r = [
                t.status,
                t.method,
                map(t.attempts, (a) => [a.method, a.status]),
                fs.counts(),
            ]
            let rr = ['success', 'playwright-headless', [['curl', 'failed'], ['playwright-headless', 'success']], [1, 1, 0, 0]]
            assert.strict.deepEqual(r, rr)
        })

        it('curl被inspect判blocked時升級至headless', async function() {
            let fs = mkAll({ curl: [ok(HTML_BLOCK)], playwrightHeadless: [ok(HTML_OK)] })
            let t = await run(URL_PLAIN, fs)
            let r = [t.status, map(t.attempts, (a) => [a.method, a.status, a.type]), fs.counts()]
            let rr = ['success', [['curl', 'blocked', 'captcha'], ['playwright-headless', 'success', undefined]], [1, 1, 0, 0]]
            assert.strict.deepEqual(r, rr)
        })

        it('curl通過inspect但解析失敗時, 視為empty續升級', async function() {
            let fs = mkAll({ curl: [ok(HTML_THIN)], playwrightHeadless: [ok(HTML_OK)] })
            let t = await run(URL_PLAIN, fs)
            let r = [t.status, map(t.attempts, (a) => [a.method, a.status, a.type]), fs.counts()]
            let rr = ['success', [['curl', 'blocked', 'empty'], ['playwright-headless', 'success', undefined]], [1, 1, 0, 0]]
            assert.strict.deepEqual(r, rr)
        })

        it('headless成功時不再往headed升級', async function() {
            let fs = mkAll({ curl: [ok(HTML_BLOCK)], playwrightHeadless: [ok(HTML_OK)] })
            await run(URL_PLAIN, fs)
            let r = fs.counts()
            let rr = [1, 1, 0, 0]
            assert.strict.deepEqual(r, rr)
        })

        it('headless亦失敗時升級至headed', async function() {
            let fs = mkAll({ curl: [ok(HTML_BLOCK)], playwrightHeadless: [ok(HTML_BLOCK)], playwrightHead: [ok(HTML_OK)] })
            let t = await run(URL_PLAIN, fs)
            let r = [t.status, t.method, fs.counts()]
            let rr = ['success', 'playwright-headed', [1, 1, 1, 0]]
            assert.strict.deepEqual(r, rr)
        })

        it('headed亦失敗時升級至camofox', async function() {
            let fs = mkAll({
                curl: [ok(HTML_BLOCK)],
                playwrightHeadless: [ok(HTML_BLOCK)],
                playwrightHead: [ok(HTML_BLOCK)],
                camofox: [ok(HTML_OK)],
            })
            let t = await run(URL_PLAIN, fs)
            let r = [t.status, t.method, fs.counts()]
            let rr = ['success', 'camofox', [1, 1, 1, 1]]
            assert.strict.deepEqual(r, rr)
        })

        it('四階皆失敗時回error, reason取最後一筆attempt', async function() {
            let fs = mkAll()
            let t = await run(URL_PLAIN, fs)
            let r = [
                t.status,
                t.attempts.length,
                map(t.attempts, (a) => a.method),
                t.message,
                fs.counts(),
            ]
            let rr = ['error', 4, ['curl', 'playwright-headless', 'playwright-headed', 'camofox'], 'no snapshot', [1, 1, 1, 1]]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('redirect旗標傳遞', function() {

        it('某階被判redirect後, 後續playwright階收到waitForRedirect=true', async function() {
            let fs = mkAll({
                curl: [ok(HTML_REDIRECT)],
                playwrightHeadless: [ok(HTML_BLOCK)],
                playwrightHead: [ok(HTML_OK)],
            })
            await run(URL_PLAIN, fs)
            let r = [
                fs.playwrightHeadless.calls[0].waitForRedirect,
                fs.playwrightHead.calls[0].waitForRedirect,
            ]
            let rr = [true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('未被判redirect時playwright階之waitForRedirect為false', async function() {
            let fs = mkAll({ curl: [ok(HTML_BLOCK)], playwrightHeadless: [ok(HTML_OK)] })
            await run(URL_PLAIN, fs)
            let r = fs.playwrightHeadless.calls[0].waitForRedirect
            let rr = false
            assert.strict.deepEqual(r, rr)
        })

        it('呼叫端傳入之waitForRedirect須生效, 不被計畫靜默覆寫', async function() {

            //此前為直接覆寫: 呼叫端傳true, 抓取器實收false(實測), 選項靜默失效。
            //而它是fetchWebByPlaywrightHeadless之公開選項, fetchWeb亦宣稱其餘鍵值會轉傳,
            //兩份文件都讓呼叫端以為有效。與UA/Referer/Accept-Language在playwright階
            //靜默失效同型(該次已修, 此處為同型的第二處)
            let fs = mkAll({ playwrightHeadless: [ok(HTML_OK)] })
            await run(URL_PLAIN, fs, { method: 'playwright', waitForRedirect: true })
            let r = fs.playwrightHeadless.calls[0].waitForRedirect
            let rr = true
            assert.strict.deepEqual(r, rr)
        })

        it('計畫判定為轉址時, 呼叫端傳false不得把它關掉', async function() {

            //取聯集而非讓呼叫端全權決定: 計畫判定是有證據的(前一階實際抓到轉址殼頁)
            let fs = mkAll({ curl: [ok(HTML_REDIRECT)], playwrightHeadless: [ok(HTML_OK)] })
            await run(URL_PLAIN, fs, { waitForRedirect: false })
            let r = fs.playwrightHeadless.calls[0].waitForRedirect
            let rr = true
            assert.strict.deepEqual(r, rr)
        })

        it('waitForRedirect為非布林時採預設false', async function() {
            let r = []
            for (let v of ['true', 1, {}, null]) {
                let fs = mkAll({ playwrightHeadless: [ok(HTML_OK)] })
                await run(URL_PLAIN, fs, { method: 'playwright', waitForRedirect: v })
                r.push(fs.playwrightHeadless.calls[0].waitForRedirect)
            }
            let rr = map([1, 2, 3, 4], () => false)
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('四階皆做inspect(含Camofox)', function() {

        //鑑別用內容: 正文充足可被Readability解析, 但含inspect之captcha特徵字串
        let HTML_TRAP = '<html><head><title>驗證機制的技術分析</title></head><body><article>' +
            '<p>本文討論網站如何要求使用者 verify you are human，' + '這是一段足夠長的正文內容以便通過最低字數門檻。'.repeat(6) + '</p>' +
            '</article></body></html>'

        it('camofox階亦做inspect, 攔阻頁不再被當文章回傳', async function() {

            //此條先前斷言的是相反行為(camofox階不判識, 故含攔截特徵之內容仍回成功)。
            //該豁免有兩條理由, 現皆不成立: 「合成內容」已被contentKind機制取代(該機制成立於豁免之後),
            //「末階擋下無可升級」則與method:'curl'單階計畫矛盾——後者同樣無可升級卻照常判識。
            //實測後果: 四階皆取回同一份Cloudflare挑戰頁時, camofox階把樣板當文章回傳
            //(status:'success', title:'Just a moment...'), 呼叫端無任何欄位可據以察覺
            let fs = mkAll({
                curl: [ok(HTML_BLOCK)],
                playwrightHeadless: [ok(HTML_BLOCK)],
                playwrightHead: [ok(HTML_BLOCK)],
                camofox: [ok(HTML_TRAP)],
            })
            let t = await run(URL_PLAIN, fs)
            let last = t.attempts[3]
            let r = [t.status, t.reason, last.method, last.status, last.type]
            let rr = ['error', 'captcha', 'camofox', 'blocked', 'captcha']
            assert.strict.deepEqual(r, rr)
        })

        it('camofox階取回正常內容時照常成功', async function() {

            //對照組: 判識開啟不得使原本可用的內容被擋
            let fs = mkAll({
                curl: [ok(HTML_BLOCK)],
                playwrightHeadless: [ok(HTML_BLOCK)],
                playwrightHead: [ok(HTML_BLOCK)],
                camofox: [ok(HTML_OK)],
            })
            let t = await run(URL_PLAIN, fs)
            let r = [t.status, t.method, t.attempts[3].status]
            let rr = ['success', 'camofox', 'success']
            assert.strict.deepEqual(r, rr)
        })

        it('同一內容於四階之判識結果一致', async function() {

            //對稱性: 同一份內容不因走到哪一階而得到不同判定
            let fs = mkAll({ curl: [ok(HTML_TRAP)], playwrightHeadless: [ok(HTML_OK)] })
            let t = await run(URL_PLAIN, fs)
            let r = [t.attempts[0].method, t.attempts[0].status, t.attempts[0].type]
            let rr = ['curl', 'blocked', 'captcha']
            assert.strict.deepEqual(r, rr)
        })

        it('前三階之attempt type為實際判識結果', async function() {
            let fs = mkAll({
                curl: [ok(HTML_BLOCK)],
                playwrightHeadless: [ok(HTML_BLOCK)],
                playwrightHead: [ok(HTML_BLOCK)],
                camofox: [ok(HTML_OK)],
            })
            let t = await run(URL_PLAIN, fs)
            let r = map(t.attempts.slice(0, 3), (a) => a.type)
            let rr = ['captcha', 'captcha', 'captcha']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('網域分流', function() {

        it('wsj.com跳過curl與headless, 直接headed', async function() {
            let fs = mkAll({ playwrightHead: [ok(HTML_OK)] })
            let t = await run('https://www.wsj.com/articles/abc', fs)
            let r = [t.status, t.method, fs.counts()]
            let rr = ['success', 'playwright-headed', [0, 0, 1, 0]]
            assert.strict.deepEqual(r, rr)
        })

        it('wsj.com之headed失敗時仍會升級至camofox', async function() {
            let fs = mkAll({ camofox: [ok(HTML_OK)] })
            let t = await run('https://www.wsj.com/articles/abc', fs)
            let r = [t.method, fs.counts()]
            let rr = ['camofox', [0, 0, 1, 1]]
            assert.strict.deepEqual(r, rr)
        })

        it('news.google.com跳過curl且以waitForRedirect=true進headless', async function() {
            let fs = mkAll({ playwrightHeadless: [ok(HTML_OK)] })
            let t = await run('https://news.google.com/articles/CBMiabc', fs)
            let r = [t.status, t.method, fs.counts(), fs.playwrightHeadless.calls[0].waitForRedirect]
            let rr = ['success', 'playwright-headless', [0, 1, 0, 0], true]
            assert.strict.deepEqual(r, rr)
        })

        it('msn.com跳過curl直接headless, 且不帶waitForRedirect', async function() {

            //本條驗的是**路由規則**, 故以useDefaultAdapters:false隔離adapter層:
            //msn文章頁現有內建fetch adapter, 不隔離時計畫最前會多一個adapter階而先被它處理
            //(該adapter之行為另見unit-builtinAdapterMsn)。不改期望值去遷就, 是因為路由規則本身沒變
            let fs = mkAll({ playwrightHeadless: [ok(HTML_OK)] })
            let t = await run('https://www.msn.com/en-us/money/x/ar-AA1', fs, { useDefaultAdapters: false })
            let r = [t.status, fs.counts(), fs.playwrightHeadless.calls[0].waitForRedirect]
            let rr = ['success', [0, 1, 0, 0], false]
            assert.strict.deepEqual(r, rr)
        })

        it('mp.weixin.qq.com直達camofox, 其餘三階完全不呼叫', async function() {
            let fs = mkAll({ camofox: [ok(HTML_OK)] })
            let t = await run('https://mp.weixin.qq.com/s/abcdef', fs)
            let r = [t.status, t.method, t.attempts.length, fs.counts()]
            let rr = ['success', 'camofox', 1, [0, 0, 0, 1]]
            assert.strict.deepEqual(r, rr)
        })

        it('mp.weixin.qq.com之camofox抓取失敗時直接回error, 不退回其他方法', async function() {
            let fs = mkAll()
            let t = await run('https://mp.weixin.qq.com/s/abcdef', fs)
            let r = [t.status, map(t.attempts, (a) => [a.method, a.status]), fs.counts()]
            let rr = ['error', [['camofox', 'failed']], [0, 0, 0, 1]]
            assert.strict.deepEqual(r, rr)
        })

        it('mp.weixin.qq.com之camofox解析失敗時attempt記blocked', async function() {
            let fs = mkAll({ camofox: [ok(HTML_THIN)] })
            let t = await run('https://mp.weixin.qq.com/s/abcdef', fs)
            let r = [t.status, t.attempts[0].status, t.attempts[0].type]
            let rr = ['error', 'blocked', 'empty']
            assert.strict.deepEqual(r, rr)
        })

        it('一般網域走完整四階', async function() {
            let fs = mkAll()
            await run(URL_PLAIN, fs)
            let r = fs.counts()
            let rr = [1, 1, 1, 1]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('轉址參數提取', function() {

        it('linkedin轉址參數提取後以目標網址重走流程', async function() {
            let fs = mkAll({ curl: [ok(HTML_OK)] })
            let t = await run('https://www.linkedin.com/redir/redirect?url=' + encodeURIComponent(URL_PLAIN), fs)
            let r = [t.status, t.url, fs.curl.calls[0].url]
            let rr = ['success', URL_PLAIN, URL_PLAIN]
            assert.strict.deepEqual(r, rr)
        })

        it('youtube轉址以q參數提取', async function() {
            let fs = mkAll({ curl: [ok(HTML_OK)] })
            let t = await run('https://www.youtube.com/redirect?q=' + encodeURIComponent(URL_PLAIN), fs)
            let r = [t.status, t.url]
            let rr = ['success', URL_PLAIN]
            assert.strict.deepEqual(r, rr)
        })

        it('轉址遞迴達深度上限後不再提取, 改以當前轉址網址本身走流程', async function() {

            //自我指向之轉址網址, 每層都可提取, 用以觸發深度上限(MAX_REDIRECT_DEPTH=3)
            let self = 'https://www.linkedin.com/redir/redirect?url='
            let u = self + encodeURIComponent(self + encodeURIComponent(self + encodeURIComponent(self + encodeURIComponent(URL_PLAIN))))
            let fs = mkAll({ curl: [ok(HTML_OK)] })
            let t = await run(u, fs)

            //第4層(depth=3)不再提取, 該網址本身命中_requiresJsRedirect故跳過curl,
            //三個瀏覽器階皆由假函數回失敗, 最終為error。curl未被呼叫即證明分流生效
            let r = [t.status, t.url.startsWith(self), t.url === URL_PLAIN, fs.counts()]
            let rr = ['error', true, false, [0, 1, 1, 1]]
            assert.strict.deepEqual(r, rr)
        })

        it('未達深度上限時逐層提取至最終目標', async function() {
            let self = 'https://www.linkedin.com/redir/redirect?url='
            let u = self + encodeURIComponent(self + encodeURIComponent(URL_PLAIN))
            let fs = mkAll({ curl: [ok(HTML_OK)] })
            let t = await run(u, fs)
            let r = [t.status, t.url]
            let rr = ['success', URL_PLAIN]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('指定方法時不走階梯', function() {

        it('四種method各自只呼叫對應之抓取函數', async function() {
            let r = []
            for (let m of ['curl', 'playwright', 'playwright-headed', 'camofox']) {
                let fs = mkAll({
                    curl: [ok(HTML_OK)],
                    playwrightHeadless: [ok(HTML_OK)],
                    playwrightHead: [ok(HTML_OK)],
                    camofox: [ok(HTML_OK)],
                })
                let t = await run(URL_PLAIN, fs, { method: m })
                r.push([t.status, fs.counts()])
            }
            let rr = [
                ['success', [1, 0, 0, 0]],
                ['success', [0, 1, 0, 0]],
                ['success', [0, 0, 1, 0]],
                ['success', [0, 0, 0, 1]],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('指定方法失敗時不升級, attempts僅一筆', async function() {
            let fs = mkAll()
            let t = await run(URL_PLAIN, fs, { method: 'curl' })
            let r = [t.status, t.attempts.length, fs.counts()]
            let rr = ['error', 1, [1, 0, 0, 0]]
            assert.strict.deepEqual(r, rr)
        })

        it('指定方法時網域分流不生效', async function() {
            let fs = mkAll({ curl: [ok(HTML_OK)] })
            let t = await run('https://mp.weixin.qq.com/s/abcdef', fs, { method: 'curl' })
            let r = [t.status, fs.counts()]
            let rr = ['success', [1, 0, 0, 0]]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('parse=false時之階梯行為', function() {

        it('parse=false時仍做inspect並會因blocked而升級', async function() {
            let fs = mkAll({ curl: [ok(HTML_BLOCK)], playwrightHeadless: [ok(HTML_THIN)] })
            let t = await run(URL_PLAIN, fs, { parse: false })
            let r = [t.status, t.method, t.html === HTML_THIN, fs.counts()]
            let rr = ['success', 'playwright-headless', true, [1, 1, 0, 0]]
            assert.strict.deepEqual(r, rr)
        })

    })

})
