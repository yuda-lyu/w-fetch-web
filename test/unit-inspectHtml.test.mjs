import assert from 'assert'
import inspectHtml from '../src/inspectHtml.mjs'
import { htmlArticle, htmlChallenge } from './tools/serverForTest.mjs'


//inspectHtml為純函式, 不需啟動server, 故歸unit層
//另有偵測器分支之補充案例於 unit-remainingBranches.test.mjs
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


//R14: 判識器依證據形態決定是否適用於合成內容。
//
//此區塊取代了先前的「<article>例外」特性化測試。那三個擋板是為了避免對合成內容誤判而加,
//但它同時作用在原始側造成漏判, 且只掛在3個判識器上而未比對兄弟判識器。
//改以evidence分群後, 誤判與漏判由同一個判準一併處理
describe('判識器之證據形態分群', function() {

    //structural類之判準依賴標籤結構, 合成時已被剝除, 只剩字串留在內文
    let structuralCases = [
        ['DataDome CAPTCHA', 'our vendor captcha-delivery.com blocks bots on this page'],
        ['PerimeterX challenge', 'we evaluated perimeterx last year for our stack'],
        ['Cloudflare challenge', 'the class cf-challenge-running is set during the check'],
        ['Cloudflare Turnstile', 'the widget cf-turnstile renders a checkbox for users'],
        ['WeChat verification page', 'the page secitptpage on wx.qq.com asks users to verify'],
        ['Google News wrapper', 'the c-wiz element on news.google.com wraps each card'],
    ]

    let synth = (text) => '<!DOCTYPE html><html><head><title>某篇技術文章</title></head><body><article>' +
        '<p>' + text + '</p><p>' + '這是一段足夠長度的正文內容。'.repeat(20) + '</p></article></body></html>'

    it('原始文件仍比對structural類判準', function() {
        let r = structuralCases.map(([msg, text]) => {
            let v = inspectHtml(synth(text))
            return [v.pass, v.message]
        })
        let rr = structuralCases.map(([msg]) => [false, msg])
        assert.strict.deepEqual(r, rr)
    })

    it('合成內容不比對structural類判準, 故內文提及該些字串不再誤判', function() {

        //這正是先前<article>擋板想解決的問題, 但擋板只涵蓋其中2項(Turnstile與另二者),
        //其餘4項在舊實作下一律誤判
        let r = structuralCases.map(([, text]) => {
            let v = inspectHtml(synth(text), { contentKind: 'synthesized' })
            return [v.pass, v.type]
        })
        let rr = structuralCases.map(() => [true, 'pass'])
        assert.strict.deepEqual(r, rr)
    })

    it('合成內容仍比對semantic類判準, 阻擋頁不會被當成文章放行', function() {

        //此為R14不採「合成內容一律跳過判識」之理由: 阻擋頁文案長度多超過MIN_CONTENT,
        //跳過判識會使其被Readability解析成功而當作文章回傳
        let cases = [
            ['Access Denied', 'You do not have permission to access this document on this server today.', 'access denied (WAF/CDN block)'],
            ['Security Check', 'Please verify you are human before continuing to the requested page.', 'human verification page'],
            ['Error', 'Your request has been blocked by our security rules, please contact support.', 'server security block'],
        ]
        let r = cases.map(([title, text]) => {
            let html = '<!DOCTYPE html><html><head><title>' + title + '</title></head><body><article><p>' + text + '</p></article></body></html>'
            let v = inspectHtml(html, { contentKind: 'synthesized' })
            return [v.pass, v.type, v.message]
        })
        let rr = cases.map(([, , msg]) => [false, 'captcha', msg])
        assert.strict.deepEqual(r, rr)
    })

    it('原始文件含<article>標籤時不再放行真挑戰頁', function() {

        //舊實作之擋板使「含<article>」成為漏判條件: 真挑戰頁只要有該標籤即被放行,
        //且其文案可被解析成功, 呼叫端會取得阻擋頁內容而非文章。
        //文案採真實長度(攔阻頁可見文字極少), 而非為了觸發而灌長
        let html = '<!DOCTYPE html><html><head><title>x</title></head><body><article>' +
            '<div class="cf-turnstile"></div><p>Please wait while we verify your browser.</p>' +
            '</article></body></html>'
        let v = inspectHtml(html)
        let r = [v.pass, v.message]
        let rr = [false, 'Cloudflare Turnstile']
        assert.strict.deepEqual(r, rr)
    })

    it('未指定contentKind時視為原始文件, 行為與先前一致', function() {
        let html = synth('our vendor captcha-delivery.com blocks bots on this page')
        let r = [inspectHtml(html).pass, inspectHtml(html, {}).pass, inspectHtml(html, { contentKind: 'raw' }).pass]
        let rr = [false, false, false]
        assert.strict.deepEqual(r, rr)
    })

})


//R21回歸: 判識器對真實反爬蟲攔阻頁之涵蓋範圍。
//舊實作以全等比對標題(titleLower === 'just a moment'), 真實頁面之尾綴一律漏判;
//且fetchWebByPlaywrightHead之VERIFY_SELECTORS所認得的三個挑戰資源位址,
//判識器一個都不在清單內。漏判之攔阻頁文案多超過MIN_CONTENT, 會被當成功文章回傳
describe('反爬蟲攔阻頁之判識涵蓋(R21回歸)', function() {

    let mkTitle = (t) => '<html><head><title>' + t + '</title></head><body>' + 'x'.repeat(300) + '</body></html>'

    it('Cloudflare標題含尾綴時仍判為captcha', function() {
        let titles = [
            'Just a moment',
            'Just a moment...',
            'Just a moment…',
            'Just a moment - example.com',
            'Just a quick check...',
            'Checking your browser before accessing',
            'Attention Required! | Cloudflare',
        ]
        let r = titles.map((t) => {
            let v = inspectHtml(mkTitle(t))
            return [v.pass, v.type]
        })
        let rr = titles.map(() => [false, 'captcha'])
        assert.strict.deepEqual(r, rr)
    })

    it('挑戰資源位址搭配內容過少時判為captcha', function() {
        let mk = (res) => '<html><head><title>x</title></head><body>' +
            '<div>Verifying you are human. This may take a few seconds.</div>' +
            '<script src="' + res + '"></script></body></html>'
        let r = [
            '/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1',
            'https://challenges.cloudflare.com/turnstile/v0/api.js',
            'https://js.hcaptcha.com/1/api.js',
        ].map((res) => {
            let v = inspectHtml(mk(res))
            return [v.pass, v.type, v.message]
        })
        let rr = [
            [false, 'captcha', 'anti-bot challenge resource'],
            [false, 'captcha', 'anti-bot challenge resource'],
            [false, 'captcha', 'anti-bot challenge resource'],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('正常文章頁內嵌挑戰元件時不因資源位址誤判', function() {

        //雙條件之第二條件: 有實質內容者不判為攔阻頁, 避免誤殺內嵌Turnstile表單之正常頁面
        let html = '<html><head><title>如何評估流動性溢價</title></head><body><article>' +
            '<p>' + '本文說明流動性溢價之估算方式與其結構性矛盾。'.repeat(40) + '</p>' +
            '</article><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></body></html>'
        let v = inspectHtml(html)
        let r = [v.pass, v.type]
        let rr = [true, 'pass']
        assert.strict.deepEqual(r, rr)
    })

    it('一般Cloudflare託管站台之cdn-cgi資源不誤判', function() {

        //'/cdn-cgi/'於一般託管站台大量存在(email-decode、rocket-loader), 不可作為判準
        let html = '<html><head><title>某篇文章</title></head><body>' +
            '<script src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>' +
            '<p>短內容</p></body></html>'
        let v = inspectHtml(html)
        let r = v.type !== 'captcha'
        let rr = true
        assert.strict.deepEqual(r, rr)
    })

})


//R29回歸: 內容量閘門之對稱性。
//
//此前閘門由各判識器自行決定要不要寫, 結果17個判識器只有5個有——正是「碰到誤判就補那一個,
//不回頭比對兄弟」的形態, 而該形態本身已在前一輪被指出過一次。改為預設套用後,
//新增判識器不需要記得寫閘門, 忘記標anyContent的後果是偏保守(多擋)而非偏危險(誤放)
describe('內容量閘門之對稱性(R29回歸)', function() {

    //只是「談論」反爬蟲的正常長文, 每則命中一個不同的判識器
    let article = (mention) => '<html><head><title>反爬蟲機制解析</title></head><body><article>' +
        '<p>' + mention + '</p><p>' +
        '本文詳細說明各家反爬蟲服務的運作方式與其對內容抓取的影響, 並比較不同方案的取捨。'.repeat(25) +
        '</p></article></body></html>'

    it('正常長文提及各家反爬蟲特徵字串時皆不誤判', function() {
        let mentions = [
            'Cloudflare的挑戰頁會顯示 verify you are human 這句話',
            '當WAF攔下時會回應 your request has been blocked',
            'perimeterx 是另一家常見的反爬蟲服務供應商',
            'captcha-delivery.com 為DataDome之資源網域',
            'cf-turnstile 是Cloudflare的驗證元件class名稱',
            'secitptpage 出現於 wx.qq.com 之驗證頁',
            'c-wiz 元素用於 news.google.com 之版面',
            '頁面標題為 Access Denied 時多半是CDN攔阻',
        ]
        let r = mentions.map((v) => inspectHtml(article(v)).pass)
        let rr = mentions.map(() => true)
        assert.strict.deepEqual(r, rr)
    })

    it('真攔阻頁內容稀少故仍被擋下', function() {
        let cases = [
            ['Access Denied', 'You do not have permission to access this document.', 'access denied (WAF/CDN block)'],
            ['Attention Required! | Cloudflare', 'Sorry, you have been blocked.', 'Cloudflare/anti-bot challenge'],
            ['x', 'Please verify you are human before continuing.', 'human verification page'],
            ['x', 'Your request has been blocked by our server.', 'server security block'],
        ]
        let r = cases.map(([ti, tx]) => {
            let t = inspectHtml('<html><head><title>' + ti + '</title></head><body><p>' + tx + '</p></body></html>')
            return [t.pass, t.message]
        })
        let rr = cases.map(([, , msg]) => [false, msg])
        assert.strict.deepEqual(r, rr)
    })

    it('標題型判準一律以前綴比對, 帶尾綴之真攔阻頁不漏判', function() {

        //R21只把此規則套用在Cloudflare那一項, 同檔另一項access denied仍為全等比對而漏判
        let titles = ['Access Denied', 'Access Denied - example.com', 'Access Denied | CDN']
        let r = titles.map((ti) => {
            return inspectHtml('<html><head><title>' + ti + '</title></head><body><p>No permission.</p></body></html>').type
        })
        let rr = ['captcha', 'captcha', 'captcha']
        assert.strict.deepEqual(r, rr)
    })

    it('僅比對HTML結構或內容量者不套閘門', function() {

        //meta refresh比對標籤結構, empty本身即內容量判準; 兩者套閘門會使長內容之轉址頁漏判
        let long = '本文內容充足足以超過閘門。'.repeat(60)
        let redirect = '<html><head><meta http-equiv="refresh" content="0;url=https://a.com/b"><title>x</title></head>' +
            '<body><p>' + long + '</p></body></html>'
        let r = inspectHtml(redirect).type
        let rr = 'redirect'
        assert.strict.deepEqual(r, rr)
    })

})


//R23: 判識器之比對順序即語意, 但重排DETECTORS原本不會使任何測試失敗。
//
//17個判識器之兩兩順序組合達136對, 窮舉不可行且無意義。改以「分層」表達真正的意圖:
//  L1 攔阻與驗證(captcha/verify) → L2 轉址(redirect) → L3 空內容(empty)
//層界之所以是意圖: 一個頁面若同時是攔阻頁又內容稀少, 回報「被攔阻」對呼叫端才有用,
//回報「內容太少」會讓人誤以為是網站問題。層內之細部順序只影響message文字, 不影響升級決策
describe('判識器之比對順序(R23)', function() {

    it('同時符合攔阻與空內容時, 回報攔阻', function() {

        //大量script撐開html而可見文字極少, 同時滿足empty; 標題又是攔阻頁標題
        let html = '<html><head><title>Just a moment...</title></head><body>' +
            '<script>' + 'v'.repeat(6000) + '</script><p>x</p></body></html>'
        let t = inspectHtml(html)
        let r = [t.type, t.message]
        let rr = ['captcha', 'Cloudflare/anti-bot challenge']
        assert.strict.deepEqual(r, rr)
    })

    it('同時符合轉址與空內容時, 回報轉址', function() {

        //轉址殼頁天生內容稀少, 若empty排在前面則所有轉址頁都會被誤報為空內容,
        //而runPlan只有在judged為redirect時才會替後續階開啟等待轉址
        let html = '<html><head><meta http-equiv="refresh" content="0;url=https://a.com/b"><title>x</title></head>' +
            '<body><script>' + 'v'.repeat(6000) + '</script></body></html>'
        let r = inspectHtml(html).type
        let rr = 'redirect'
        assert.strict.deepEqual(r, rr)
    })

    it('同時符合攔阻與轉址時, 回報攔阻', function() {

        //部分攔阻頁會附meta refresh導向說明頁; 此時應回報攔阻使階梯升級, 而非當成單純轉址
        let html = '<html><head><meta http-equiv="refresh" content="0;url=https://a.com/b">' +
            '<title>Access Denied</title></head><body><p>No permission.</p></body></html>'
        let r = inspectHtml(html).type
        let rr = 'captcha'
        assert.strict.deepEqual(r, rr)
    })

    it('層內順序之整體快照(change-detector)', function() {

        //本條與上面三條性質不同: 它不表達意圖, 只在有人調動DETECTORS順序時提醒。
        //失敗本身不代表錯誤——若調動是刻意的, 更新本條即可; 但若是誤動, 上面三條會一起失敗
        let probes = [
            ['<html><body>captcha-delivery.com</body></html>', 'DataDome CAPTCHA'],
            ['<html><body>perimeterx</body></html>', 'PerimeterX challenge'],
            ['<html><body><div class="cf-challenge-running"></div></body></html>', 'Cloudflare challenge'],
            ['<html><head><title>Just a moment...</title></head><body>x</body></html>', 'Cloudflare/anti-bot challenge'],
            ['<html><body><script src="/cdn-cgi/challenge-platform/x"></script>y</body></html>', 'anti-bot challenge resource'],
            ['<html><body>captcha challenge</body></html>', 'generic CAPTCHA'],
            ['<html><head><title>Are you a robot?</title></head><body>x</body></html>', 'robot challenge: "Are you a robot?"'],
            ['<html><body><div class="cf-turnstile"></div></body></html>', 'Cloudflare Turnstile'],
            ['<html><body>verify you are human</body></html>', 'human verification page'],
            ['<html><body>request has been blocked</body></html>', 'server security block'],
            ['<html><head><title>Access Denied</title></head><body>x</body></html>', 'access denied (WAF/CDN block)'],
            ['<html><body>something went wrong at x.com</body></html>', 'X/Twitter error page'],
            ['<html><body>secitptpage wx.qq.com</body></html>', 'WeChat verification page'],
            ['<html><head><meta http-equiv="refresh" content="0;url=https://a.com/"></head><body>x</body></html>', 'meta refresh redirect'],
            ['<html><body>c-wiz news.google.com</body></html>', 'Google News wrapper'],
            ['<html><head><title>MSN</title></head><body>x</body></html>', 'platform wrapper: "MSN"'],
        ]
        let r = probes.map(([html]) => inspectHtml(html).message)
        let rr = probes.map(([, msg]) => msg)
        assert.strict.deepEqual(r, rr)
    })

})
