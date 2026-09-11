import assert from 'assert'
import http from 'http'
import fetchWeb from '../src/fetchWeb.mjs'
import { REASONS } from '../src/constants.mjs'


//內容之最終網址（finalUrl）與其衍生之保護。
//
//缺陷形狀：本套件此前完全不追蹤「這份內容實際來自哪裡」。
//curl 帶 `-L` 跟隨轉址、`navigateWithRedirectWait` 更是**刻意等到 host 脫離原 host**，
//但兩者回傳之 `url` 皆為輸入值。三個受害者：
//  一、adapter 以請求網址挑選, 再以請求網址傳入 parse——實測收到「A 站的網址配 B 站的內容」
//  二、Readability 之 JSDOM base url 錯, 文內相對連結解析到轉址來源的 origin
//  三、對外結果之 `url` 宣稱是這份內容的網址, 實際是請求的網址
//
//語意分野：**`url` 是我要了什麼，`finalUrl` 是我拿到了什麼**。
//兩者相同時省略 `finalUrl` 欄, 維持既有形狀
describe('內容之最終網址', function() {

    let srvs = []
    let mkSrv = (handler) => new Promise((resolve) => {
        let s = http.createServer(handler)
        s.listen(0, '127.0.0.1', () => {
            srvs.push(s)
            resolve(s)
        })
    })
    let urlOf = (s, p) => 'http://127.0.0.1:' + s.address().port + p

    after(function() {
        for (let s of srvs) {
            s.close()
        }
        srvs = []
    })

    let bodyOf = (title, mark) => '<html><head><title>' + title + '</title></head><body><article><p>' +
        (mark + ' 這是實際內容，字數充足以通過解析門檻。').repeat(20) +
        '</p><a href="/rel/link">相對連結</a></article></body></html>'

    describe('轉址後之欄位', function() {

        it('有轉址時url為請求值、finalUrl為內容實際來源', async function() {
            let sb = await mkSrv((q, s) => {
                s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
                s.end(bodyOf('B站', 'B'))
            })
            let B = urlOf(sb, '/real')
            let sa = await mkSrv((q, s) => {
                s.writeHead(302, { Location: B })
                s.end()
            })
            let A = urlOf(sa, '/wrap')
            let t = await fetchWeb(A, { method: 'curl', showLog: false, maxRetries: 0 })
            let r = [t.status, t.url, t.finalUrl]
            let rr = ['success', A, B]
            assert.strict.deepEqual(r, rr)
        })

        it('無轉址時不輸出finalUrl欄, 維持既有形狀', async function() {

            //兩者相同時多一個欄位只是雜訊; 呼叫端據「有沒有這個欄位」即知有無轉址
            let s1 = await mkSrv((q, s) => {
                s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
                s.end(bodyOf('直接', 'D'))
            })
            let u = urlOf(s1, '/direct')
            let t = await fetchWeb(u, { method: 'curl', showLog: false, maxRetries: 0 })
            let r = [t.status, t.url, Object.prototype.hasOwnProperty.call(t, 'finalUrl')]
            let rr = ['success', u, false]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('adapter取得最終網址', function() {

        it('parse之第四參數meta帶finalUrl, 使adapter分辨得出內容來自哪', async function() {

            //adapter 必須以**請求網址**挑選(抓取前才知道要不要用fetch掛點),
            //故「選到的adapter配到別站的內容」無法靠改選擇時機解決——
            //正解是把資訊給它, 由知道該站台的人自己判斷, 而非由套件代為猜測
            let sb = await mkSrv((q, s) => {
                s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
                s.end(bodyOf('B站', 'B'))
            })
            let B = urlOf(sb, '/real')
            let sa = await mkSrv((q, s) => {
                s.writeHead(302, { Location: B })
                s.end()
            })
            let A = urlOf(sa, '/wrap')
            let got = null
            let adapters = [{
                id: 'siteA',
                match: () => true,
                parse: (html, url, ctx, meta) => {
                    got = { url, requestUrl: meta?.requestUrl, finalUrl: meta?.finalUrl, method: meta?.method }
                    return { success: true, title: 'X', content: 'C'.repeat(60) }
                },
            }]
            let t = await fetchWeb(A, { method: 'curl', showLog: false, maxRetries: 0, adapters })
            let r = [t.status, got]
            let rr = ['success', { url: A, requestUrl: A, finalUrl: B, method: 'curl' }]
            assert.strict.deepEqual(r, rr)
        })

        it('無轉址時meta.finalUrl即請求網址, 不留undefined', async function() {

            //退回請求網址而非留空: 下游(JSDOM base url、adapter)不必各自處理缺值
            let s1 = await mkSrv((q, s) => {
                s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
                s.end(bodyOf('直接', 'D'))
            })
            let u = urlOf(s1, '/direct')
            let got = null
            let adapters = [{
                id: 'a',
                match: () => true,
                parse: (html, url, ctx, meta) => {
                    got = meta?.finalUrl
                    return { success: true, title: 'X', content: 'C'.repeat(60) }
                },
            }]
            await fetchWeb(u, { method: 'curl', showLog: false, maxRetries: 0, adapters })
            let r = got
            let rr = u
            assert.strict.deepEqual(r, rr)
        })

        it('既有之三參數adapter不受影響', async function() {

            //meta為第四個參數, JS對多餘參數天生相容, 既有adapter一行都不用改
            let s1 = await mkSrv((q, s) => {
                s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
                s.end(bodyOf('直接', 'D'))
            })
            let adapters = [{ id: 'old', match: () => true, parse: (html, url, ctx) => ({ success: true, title: String(ctx), content: 'C'.repeat(60) }) }]
            let t = await fetchWeb(urlOf(s1, '/direct'), { method: 'curl', showLog: false, maxRetries: 0, adapters })
            let r = [t.status, t.title]
            let rr = ['success', 'null']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('推導而來之抓取須以最終網址複驗內網位址(SSRF第三層)', function() {

        //第二層(extractRedirectTarget之目標檢核)只擋得住「提取出的目標本身是內網位址」。
        //但被擋下的攻擊網址會改以原網址走一般流程, 而那些網址恰好命中JS_REDIRECT分流,
        //於是被派到一條**專門跟著轉址走**的路徑上; curl階同理帶 -L。
        //亦即第一、二層擋掉的目標, 可由「讓站方自己轉過去」重新達成
        let mkInternalPair = async () => {
            let hits = []
            let si = await mkSrv((q, s) => {
                hits.push(q.url)
                s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
                s.end(bodyOf('internal', 'INTERNAL-SECRET-TOKEN'))
            })
            let INTERNAL = urlOf(si, '/latest/meta-data/')
            let sw = await mkSrv((q, s) => {
                s.writeHead(302, { Location: INTERNAL })
                s.end()
            })
            return { WRAP: urlOf(sw, '/redir'), hits }
        }

        it('推導而來者(_depth>0)轉址至內網即回internal-address, 不交出內容', async function() {
            let { WRAP } = await mkInternalPair()
            let t = await fetchWeb(WRAP, { method: 'curl', showLog: false, maxRetries: 0, _depth: 1 })
            let r = [t.status, t.reason, String(t.content || t.html || '').includes('INTERNAL-SECRET-TOKEN')]
            let rr = ['error', 'internal-address', false]
            assert.strict.deepEqual(r, rr)
        })

        it('多階計畫下於首階即收攤, 不以其餘抓取器對同一推導網址重發請求', async function() {

            //複審以突變測試指出: 此格此前只由單階計畫之測試涵蓋, 收攤與續走在單階下結果相同而分辨不出;
            //若續走, headless/headed/camofox會對同一推導網址各再發一次請求(跟隨轉址到內網)。
            //被fake掉的是四個抓取器: curl取回內容但回報之最終網址為內網
            let n = { headless: 0 }
            let html = bodyOf('b', 'B')
            let fs = {
                curl: async () => ({ method: 'curl', status: 'success', html, finalUrl: 'http://127.0.0.1/latest/meta-data/' }),
                playwrightHeadless: async () => {
                    n.headless += 1
                    return { method: 'playwright-headless', status: 'success', html }
                },
                playwrightHead: async () => ({ method: 'playwright-headed', status: 'success', html }),
                camofox: async () => ({ method: 'camofox', status: 'success', html }),
            }
            let t = await fetchWeb('https://example.com/a', { showLog: false, _fetchers: fs, _depth: 1 })
            let r = [t.status, t.reason, t.attempts.length, n.headless]
            let rr = ['error', 'internal-address', 1, 0]
            assert.strict.deepEqual(r, rr)
        })

        it('呼叫端明確給定之網址不受此層影響', async function() {

            //本層只把關**套件自己推導出來**的網址。呼叫端要抓自己的內網服務是正當用法,
            //一併擋掉會誤傷正常用途, 且那不是SSRF(沒有繞過任何人的防線)
            let { WRAP } = await mkInternalPair()
            let t = await fetchWeb(WRAP, { method: 'curl', showLog: false, maxRetries: 0 })
            let r = [t.status, String(t.content || t.html || '').includes('INTERNAL-SECRET-TOKEN')]
            let rr = ['success', true]
            assert.strict.deepEqual(r, rr)
        })

        it('internal-address已登記於REASONS', function() {
            let r = Object.hasOwn(REASONS, 'internal-address')
            let rr = true
            assert.strict.deepEqual(r, rr)
        })

    })

})
