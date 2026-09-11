import assert from 'assert'
import map from 'lodash-es/map.js'
import fetchWeb from '../src/fetchWeb.mjs'
import buildPlan from '../src/buildPlan.mjs'
import { REASONS } from '../src/constants.mjs'


//adapter之fetch掛點(P1)之回歸測試。
//
//動機: 呼叫端手上有更好的取得方式時(官方API、內部快取、已登入session、RSS),
//目前只能在套件外面自己抓——那就用不到本套件的判識、重試、歸因與結果形狀——或硬走階梯。
//
//三個掛點分屬管線的三個階段, 各自獨立:
//  fetch    取得內容    「這次要不要爬」
//  inspect  內容判識    「這份內容能不能用」
//  parse    解析為文章  「怎麼從這份內容取出正文」
describe('adapter之fetch掛點', function() {

    let content = 'ADAPTER FETCHED CONTENT '.repeat(6)
    let htmlFromApi = '<html><head><title>由adapter取得</title></head><body><article><p>' + content + '</p></article></body></html>'
    let htmlScraped = '<html><head><title>爬來的</title></head><body><article><p>' + 'SCRAPED CONTENT '.repeat(20) + '</p></article></body></html>'

    //計數用之假抓取器: 用以區分內容究竟來自adapter或階梯
    let mkFetchers = () => {
        let n = { curl: 0, headless: 0, headed: 0, camofox: 0 }
        let mk = (k, method) => async () => {
            n[k] += 1
            return { method, status: 'success', html: htmlScraped }
        }
        return {
            fs: {
                curl: mk('curl', 'curl'),
                playwrightHeadless: mk('headless', 'playwright-headless'),
                playwrightHead: mk('headed', 'playwright-headed'),
                camofox: mk('camofox', 'camofox'),
            },
            n,
        }
    }

    let run = (fetch, over = {}, optExtra = {}) => {
        let { fs, n } = mkFetchers()
        let adapters = [{
            id: 'api',
            match: /example\.com/,
            fetch,
            parse: (html) => ({ success: true, title: html === htmlFromApi ? 'BY-ADAPTER' : 'BY-SCRAPE', content }),
            ...over,
        }]
        return fetchWeb('https://example.com/a', { showLog: false, _fetchers: fs, adapters, ...optExtra }).then((t) => ({ t, n }))
    }

    let okFetch = async () => ({ status: 'success', html: htmlFromApi })

    describe('計畫形狀', function() {

        it('有fetch掛點時計畫最前多一階, 沒有則不變', function() {
            let r = [
                buildPlan('https://example.com/a', 'auto', true, false).plan.map((s) => s.key),
                buildPlan('https://example.com/a', 'auto', true, true).plan.map((s) => s.key),
            ]
            let rr = [
                ['curl', 'headless', 'headed', 'camofox'],
                ['adapter', 'curl', 'headless', 'headed', 'camofox'],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('指定method時亦插在其前, 網域分流計畫同理', function() {
            let r = [
                buildPlan('https://example.com/a', 'curl', true, true).plan.map((s) => s.key),
                buildPlan('https://mp.weixin.qq.com/s/a', 'auto', true, true).plan.map((s) => s.key),
            ]
            let rr = [['adapter', 'curl'], ['adapter', 'camofox']]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('成功通道', function() {

        it('fetch成功時不動用任何抓取器, method為adapter並帶adapterId', async function() {
            let { t, n } = await run(okFetch)
            let r = [t.status, t.method, t.adapterId, t.title, n]
            let rr = ['success', 'adapter', 'api', 'BY-ADAPTER', { curl: 0, headless: 0, headed: 0, camofox: 0 }]
            assert.strict.deepEqual(r, rr)
        })

        it('attempts亦記錄adapterId', async function() {

            //method只說得出「來自某個adapter」, 說不出是哪一個, 而呼叫端可能同時註冊多個
            let { t } = await run(okFetch)
            let r = t.attempts
            let rr = [{ method: 'adapter', status: 'success', htmlLength: htmlFromApi.length, adapterId: 'api' }]
            assert.strict.deepEqual(r, rr)
        })

        it('未經fetch掛點之結果不帶adapterId, 維持既有形狀', async function() {
            let t = await fetchWeb('https://example.com/a', {
                showLog: false,
                method: 'curl',
                _fetchers: { curl: async () => ({ method: 'curl', status: 'success', html: htmlScraped }) },
            })
            let r = [t.status, t.method, Object.prototype.hasOwnProperty.call(t, 'adapterId')]
            let rr = ['success', 'curl', false]
            assert.strict.deepEqual(r, rr)
        })

        it('ctx由match帶下來, fetch與parse收到同一個', async function() {
            let got = []
            let adapters = [{
                id: 'ctx',
                match: (u) => ({ tag: 'from-match', u }),
                fetch: (url, opt, ctx) => {
                    got.push(['fetch', ctx])
                    return { status: 'success', html: htmlFromApi }
                },
                parse: (html, url, ctx) => {
                    got.push(['parse', ctx])
                    return { success: true, title: 't', content }
                },
            }]
            let t = await fetchWeb('https://example.com/a', { showLog: false, adapters, _fetchers: mkFetchers().fs })
            let r = [t.status, got]
            let rr = ['success', [
                ['fetch', { tag: 'from-match', u: 'https://example.com/a' }],
                ['parse', { tag: 'from-match', u: 'https://example.com/a' }],
            ]]
            assert.strict.deepEqual(r, rr)
        })

        it('只有fetch而無parse之adapter為合法, 解析走Readability', async function() {

            //三個掛點各自獨立, 可只註冊其中之一
            let adapters = [{ id: 'fetchonly', match: /example\.com/, fetch: okFetch }]
            let t = await fetchWeb('https://example.com/a', { showLog: false, adapters, _fetchers: mkFetchers().fs })
            let r = [t.status, t.method, t.adapterId, t.title]
            let rr = ['success', 'adapter', 'fetchonly', '由adapter取得']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('失敗之三個通道', function() {

        it('顯性失敗預設落回階梯, 且留下可見紀錄', async function() {

            //預設落回是「忘記宣告的後果偏保守」那一側: 還抓得到內容, 只是走了爬蟲。
            //但落回必須出聲——attempts留有adapter階的失敗紀錄才不算靜默替換
            let { t, n } = await run(async () => ({ status: 'error', reason: 'my-api-down', message: 'HTTP 503' }))
            let r = [t.status, t.method, t.title, n.curl, map(t.attempts, (a) => [a.method, a.status, a.reason])]
            let rr = ['success', 'curl', 'BY-SCRAPE', 1, [['adapter', 'failed', 'my-api-down'], ['curl', 'success', undefined]]]
            assert.strict.deepEqual(r, rr)
        })

        it('宣告fallback:false時顯性失敗即收攤, 不動用抓取器', async function() {
            let { t, n } = await run(async () => ({ status: 'error', reason: 'my-api-down', message: 'HTTP 503' }), { fallback: false })
            let r = [t.status, t.reason, t.message, n.curl]
            let rr = ['error', 'my-api-down', 'HTTP 503', 0]
            assert.strict.deepEqual(r, rr)
        })

        it('回status:skip表示不適用, 恆落回且不受fallback拘束', async function() {

            //match只看得到網址, 而「我的來源有沒有這一篇」常要查了才知道。
            //既然這是match表達不了的資訊, 它就不是失敗而是「我不該被算進來」
            let a = await run(async () => ({ status: 'skip' }))
            let b = await run(async () => ({ status: 'skip' }), { fallback: false })
            let r = [
                [a.t.status, a.t.method, a.n.curl, a.t.attempts[0].reason],
                [b.t.status, b.t.method, b.n.curl, b.t.attempts[0].reason],
            ]
            let rr = [
                ['success', 'curl', 1, 'adapter-fetch-skip'],
                ['success', 'curl', 1, 'adapter-fetch-skip'],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('契約錯誤一律不落回, 且各種形態歸因一致', async function() {

            //與match拋錯同構: 呼叫端程式碼壞了, 靜默改用爬蟲會讓他永遠不知道
            let cases = [
                async () => {
                    throw new Error('boom')
                },
                () => Promise.reject(new Error('rej')),
                async () => 'not-an-object',
                async () => null,
                async () => ({ status: 'success' }),
                async () => ({ status: 'success', html: 12345 }),
                async () => ({ status: 'success', html: '' }),
            ]
            let r = []
            for (let fn of cases) {
                let { t, n } = await run(fn)
                r.push([t.status, t.reason, n.curl])
            }
            let rr = map(cases, () => ['error', 'adapter-fetch-error', 0])
            assert.strict.deepEqual(r, rr)
        })

        it('契約錯誤即使宣告fallback:true亦不落回', async function() {
            let { t, n } = await run(async () => {
                throw new Error('boom')
            }, { fallback: true })
            let r = [t.status, t.reason, n.curl]
            let rr = ['error', 'adapter-fetch-error', 0]
            assert.strict.deepEqual(r, rr)
        })

        it('fallback為非false之各種值一律落回', async function() {

            //預設安全: 忘記標或標錯型別的後果是偏保守(還抓得到)
            let r = []
            for (let v of [undefined, null, 0, '', 'false', true, 1]) {
                let { t } = await run(async () => ({ status: 'error', reason: 'x', message: 'x' }), { fallback: v })
                r.push(t.status)
            }
            let rr = map([1, 2, 3, 4, 5, 6, 7], () => 'success')
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('fallback涵蓋整個adapter階', function() {

        //fallback此前只在fetch失敗出口生效; fetch成功後被判識擋下或解析失敗仍無條件續走,
        //auto下白跑三層瀏覽器, 且最終歸因被末階蓋掉。由安裝方提案以替身重現、本套件以真實msn影片頁
        //(逐字稿31字)重現後修正。宣告fallback:false說的是「對這個站台, 爬蟲拿不到」,
        //這句話不因失敗發生在fetch、判識或解析而改變。去留決定之唯一實作為runPlan之_mayEscalate。
        //
        //被fake掉的是: 四個抓取器(opt._fetchers, 只計次數)與adapter之fetch來源(直接回傳固定HTML); 判識與解析為真
        let ch = '<html><head><title>Just a moment...</title></head><body><p>x</p></body></html>'
        let short = '<html><head><title>t</title></head><body><p>short</p></body></html>'
        let zero = { curl: 0, headless: 0, headed: 0, camofox: 0 }

        it('fetch失敗之紀錄帶adapterId, 收攤時頂層亦帶', async function() {

            //頂層帶adapterId是fetchWeb JSDoc既有之承諾, 但finalize之錯誤分支此前未輸出(複審指出);
            //可收攤之出口由一個增為三個後, 只讀頂層的呼叫端須知道是哪一個adapter決定的
            let { t } = await run(async () => ({ status: 'error', reason: 'my-api-down', message: 'HTTP 503' }), { fallback: false })
            let r = [t.status, t.adapterId, map(t.attempts, (a) => [a.method, a.status, a.reason, a.adapterId])]
            let rr = ['error', 'api', [['adapter', 'failed', 'my-api-down', 'api']]]
            assert.strict.deepEqual(r, rr)
        })

        it('落回後階梯耗盡者頂層不帶adapterId: 最後決定者不是adapter', async function() {
            let n = { curl: 0, headless: 0, headed: 0, camofox: 0 }
            let mkFail = (k, method) => async () => {
                n[k] += 1
                return { method, status: 'error', reason: 'http-error', message: 'HTTP 500' }
            }
            let fs = { curl: mkFail('curl', 'curl'), playwrightHeadless: mkFail('headless', 'playwright-headless'), playwrightHead: mkFail('headed', 'playwright-headed'), camofox: mkFail('camofox', 'camofox') }
            let adapters = [{ id: 'api', match: /example\.com/, fetch: async () => ({ status: 'error', reason: 'my-api-down', message: 'x' }) }]
            let t = await fetchWeb('https://example.com/a', { showLog: false, _fetchers: fs, adapters })
            let r = [t.status, t.reason, Object.prototype.hasOwnProperty.call(t, 'adapterId'), t.attempts.length, t.attempts[0].adapterId]
            let rr = ['error', 'http-error', false, 5, 'api']
            assert.strict.deepEqual(r, rr)
        })

        it('去留依出口判斷而非reason字串: 自報套件保留名不改變去留', async function() {

            //本輪第一版以reason為鍵反推出口(internal-address→收攤等), 但reason在fetch與parse出口是呼叫端的自由值;
            //雙複審各自以替身重現「自報即改寫去留」。skip與契約錯誤兩個保留名只在fetch出口有語意
            let missIf = (reason) => (html) => (html === htmlFromApi ? { success: false, reason, message: 'x' } : { success: true, title: 'BY-SCRAPE', content })
            let a = await run(okFetch, { parse: missIf('internal-address') })
            let b = await run(okFetch, { parse: missIf('adapter-fetch-error') })
            let c = await run(async () => ({ status: 'error', reason: 'internal-address', message: 'x' }))
            let d = await run(okFetch, { fallback: false, parse: () => ({ success: false, reason: 'adapter-fetch-skip', message: 'x' }) })
            let r = [
                [a.t.status, a.t.method, a.t.title],
                [b.t.status, b.t.method, b.t.title],
                [c.t.status, c.t.method, c.t.title],
                [d.t.status, d.t.reason, d.n.curl],
            ]
            let rr = [
                ['success', 'curl', 'BY-SCRAPE'],
                ['success', 'curl', 'BY-SCRAPE'],
                ['success', 'curl', 'BY-SCRAPE'],
                ['error', 'adapter-fetch-skip', 0],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('fallback:false之adapter回skip後, 爬蟲階之失敗照舊續走', async function() {

            //skip之後的各階都不是adapter階, 其失敗一律續走(內建四階之失敗本來就是升級的理由)
            let { fs, n } = mkFetchers()
            fs.curl = async () => {
                n.curl += 1
                return { method: 'curl', status: 'error', reason: 'http-error', message: 'HTTP 500' }
            }
            let adapters = [{ id: 'api', match: /example\.com/, fetch: async () => ({ status: 'skip' }), fallback: false }]
            let t = await fetchWeb('https://example.com/a', { showLog: false, _fetchers: fs, adapters })
            let r = [t.status, t.method, n.curl, n.headless]
            let rr = ['success', 'playwright-headless', 1, 1]
            assert.strict.deepEqual(r, rr)
        })

        it('只有parse掛點之adapter沒有adapter階, fallback對它無作用(文件化之限制)', async function() {
            let { fs, n } = mkFetchers()
            let adapters = [{ id: 'p', match: /example\.com/, parse: () => ({ success: false, reason: 'my-miss', message: 'x' }), fallback: false }]
            let t = await fetchWeb('https://example.com/a', { showLog: false, _fetchers: fs, adapters })
            let r = [t.status, t.reason, n]
            let rr = ['error', 'my-miss', { curl: 1, headless: 1, headed: 1, camofox: 1 }]
            assert.strict.deepEqual(r, rr)
        })

        it('與其餘選項組合下各出口之收攤皆成立', async function() {

            //method單階×解析出口; opt.inspect:false×解析出口; opt.parse:false×判識出口; _depth>0(推導網址)×判識出口
            let a = await run(okFetch, { fallback: false, parse: () => ({ success: false, reason: 'my-miss', message: 'x' }) }, { method: 'curl' })
            let b = await run(async () => ({ status: 'success', html: short }), { fallback: false, parse: undefined }, { inspect: false })
            let c = await run(async () => ({ status: 'success', html: ch }), { fallback: false }, { parse: false })
            let d = await run(async () => ({ status: 'success', html: ch }), { fallback: false }, { _depth: 1 })
            let r = [[a.t.reason, a.n.curl], [b.t.reason, b.n.curl], [c.t.reason, c.n.curl], [d.t.reason, d.n.curl]]
            let rr = [['my-miss', 0], ['empty-content', 0], ['captcha', 0], ['captcha', 0]]
            assert.strict.deepEqual(r, rr)
        })

        it('fetch成功但被判識擋下時亦收攤, 歸因為判識型別', async function() {
            let { t, n } = await run(async () => ({ status: 'success', html: ch }), { fallback: false })
            let r = [t.status, t.reason, map(t.attempts, (a) => [a.method, a.status, a.type, a.adapterId]), n]
            let rr = ['error', 'captcha', [['adapter', 'blocked', 'captcha', 'api']], zero]
            assert.strict.deepEqual(r, rr)
        })

        it('fetch成功但adapter之parse失敗時亦收攤, 保留其自報歸因', async function() {
            let { t, n } = await run(okFetch, { fallback: false, parse: () => ({ success: false, reason: 'my-miss', message: 'no data' }) })
            let r = [t.status, t.reason, t.message, map(t.attempts, (a) => [a.method, a.status, a.reason]), n]
            let rr = ['error', 'my-miss', 'no data', [['adapter', 'blocked', 'my-miss']], zero]
            assert.strict.deepEqual(r, rr)
        })

        it('只有fetch之adapter, Readability取不出足量正文時亦收攤', async function() {
            let { t, n } = await run(async () => ({ status: 'success', html: short }), { fallback: false, parse: undefined })
            let r = [t.status, t.reason, n]
            let rr = ['error', 'empty-content', zero]
            assert.strict.deepEqual(r, rr)
        })

        it('未宣告時判識擋下與解析失敗皆照舊落回', async function() {

            //預設安全: 忘記宣告的後果是「還抓得到內容, 只是走了爬蟲」, 且attempts留有adapter階之blocked紀錄
            let a = await run(async () => ({ status: 'success', html: ch }))
            let b = await run(okFetch, {
                parse: (html) => (html === htmlFromApi ? { success: false, reason: 'my-miss', message: 'x' } : { success: true, title: 'BY-SCRAPE', content }),
            })
            let r = [
                [a.t.status, a.t.method, a.n.curl, map(a.t.attempts, (x) => [x.status, x.reason])],
                [b.t.status, b.t.method, b.t.title, b.n.curl, map(b.t.attempts, (x) => [x.status, x.reason])],
            ]
            let rr = [
                ['success', 'curl', 1, [['blocked', 'captcha'], ['success', undefined]]],
                ['success', 'curl', 'BY-SCRAPE', 1, [['blocked', 'my-miss'], ['success', undefined]]],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('opt.method指定單階時規則相同: 收攤即不動用該階', async function() {
            let { t, n } = await run(async () => ({ status: 'success', html: ch }), { fallback: false }, { method: 'curl' })
            let r = [t.status, t.reason, n.curl]
            let rr = ['error', 'captcha', 0]
            assert.strict.deepEqual(r, rr)
        })

        it('推導網址複驗至內網時, adapter階之紀錄亦帶adapterId(與其餘紀錄對稱)', async function() {

            //此格此前漏寫adapterId: 同一規則手寫多處必有一處漏, 現由_runStep之stamp一次決定。
            //內網複驗不分階一律收攤, 不受fallback拘束: 換抓取器不會讓內網位址變成外網
            let { fs, n } = mkFetchers()
            let adapters = [{ id: 'api', match: /example\.com/, fetch: async () => ({ status: 'success', html: htmlFromApi, finalUrl: 'http://127.0.0.1/secret' }) }]
            let t = await fetchWeb('https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fexample.com%2Fa', { showLog: false, _fetchers: fs, adapters })
            let r = [t.status, t.reason, t.url, map(t.attempts, (a) => [a.method, a.adapterId, a.status, a.type, a.reason]), n]
            let rr = ['error', 'internal-address', 'https://example.com/a', [['adapter', 'api', 'blocked', 'empty', 'internal-address']], zero]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('與其餘選項之關係', function() {

        it('opt.method非auto時fetch照跑, 落回對象即該階', async function() {

            //opt.method回答「要爬的時候用哪種爬法」, fetch回答「這次要不要爬」——
            //不同問題故不需位階。反之若讓method='curl'跳過fetch, 呼叫端會得到
            //「我註冊了但完全沒反應」這種查不出來的失敗
            let a = await run(okFetch, {}, { method: 'curl' })
            let b = await run(async () => ({ status: 'skip' }), {}, { method: 'playwright' })
            let r = [
                [a.t.status, a.t.method, a.n.curl],
                [b.t.status, b.t.method, b.n.headless],
            ]
            let rr = [['success', 'adapter', 0], ['success', 'playwright-headless', 1]]
            assert.strict.deepEqual(r, rr)
        })

        it('parse=false時fetch照跑, 回傳其html', async function() {

            //fetch掛點與parse:false高度共生:「html給我, 解析我自己來」
            let { t, n } = await run(okFetch, {}, { parse: false })
            let r = [t.status, t.method, t.adapterId, t.html === htmlFromApi, n.curl]
            let rr = ['success', 'adapter', 'api', true, 0]
            assert.strict.deepEqual(r, rr)
        })

        it('fetch取得之內容照常判識, 判為攔阻頁時續走階梯', async function() {

            //判識是「這份內容能不能用」, 與內容從哪來無關
            let ch = '<html><head><title>Just a moment...</title></head><body><p>x</p></body></html>'
            let { t, n } = await run(async () => ({ status: 'success', html: ch }))
            let r = [t.status, t.method, n.curl, map(t.attempts, (a) => [a.method, a.status, a.type])]
            let rr = ['success', 'curl', 1, [['adapter', 'blocked', 'captcha'], ['curl', 'success', undefined]]]
            assert.strict.deepEqual(r, rr)
        })

        it('adapter之inspect:false同時豁免其fetch階', async function() {

            //同一個adapter的三個掛點共用同一份站台知識, 不應各有一套判識政策
            let big = '<html><head><title>t</title></head><body><script>' + 'v'.repeat(6000) + '</script></body></html>'
            let a = await run(async () => ({ status: 'success', html: big }))
            let b = await run(async () => ({ status: 'success', html: big }), { inspect: false })
            let r = [[a.t.method, a.t.attempts[0].type], [b.t.method, b.t.attempts[0].status]]
            let rr = [['curl', 'empty'], ['adapter', 'success']]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('值域與契約', function() {

        it('adapter不得以自報method冒充本套件之抓取器', async function() {

            //該掛點是呼叫端程式碼; 若讓它自稱'curl', 呼叫端事後看結果會以為內容是套件爬來的
            let { t } = await run(async () => ({ status: 'success', html: htmlFromApi, method: 'curl' }))
            let r = [t.method, t.adapterId]
            let rr = ['adapter', 'api']
            assert.strict.deepEqual(r, rr)
        })

        it('三個新歸因皆已登記於REASONS', function() {
            let r = map(['adapter-fetch-error', 'adapter-fetch-skip', 'fetcher-error'], (v) => Object.hasOwn(REASONS, v))
            let rr = [true, true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('既無parse亦無fetch之adapter不合契約, 予以略過', async function() {
            let adapters = [{ id: 'empty', match: /example\.com/ }]
            let t = await fetchWeb('https://example.com/a', { showLog: false, adapters, _fetchers: mkFetchers().fs })
            let r = [t.status, t.method, t.title]
            let rr = ['success', 'curl', '爬來的']
            assert.strict.deepEqual(r, rr)
        })

    })

})
