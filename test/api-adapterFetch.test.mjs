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
