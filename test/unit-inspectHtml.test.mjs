import assert from 'assert'
import inspectHtml, { EMPTY_VISIBLE_MAX } from '../src/inspectHtml.mjs'
import { SHADOW_VISIBLE_THRESHOLD } from '../src/extractPageContent.mjs'
import { htmlArticle, htmlChallenge } from './tools/serverForTest.mjs'


//inspectHtml為純函式, 不需啟動server, 故歸unit層
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

        //標題以載入詞開頭且內容近乎為空, 判為殼頁
        let rWrapper = inspectHtml('<html><head><title>Loading...</title></head><body><div></div></body></html>').type

        //標題以載入詞開頭但內容充足, 不可誤殺為殼頁
        let rReal = inspectHtml('<html><head><title>Loading...</title></head><body><p>' + 'abcde '.repeat(200) + '</p></body></html>').type

        //站台名(msn/google news)已自清單移除: 實測其真殼頁另有更可靠的攔法
        //(MSN殼 35786 bytes/visible 0 由empty接住; Google News由<c-wiz規則接住),
        //而留著它們的淨效果只有「MSNBC被判成MSN殼頁」這種跨站誤判
        let rCrossSite = inspectHtml('<html><head><title>MSNBC 新聞台</title></head><body><p>短</p></body></html>').type

        let r = [rWrapper, rReal, rCrossSite]
        let rr = ['redirect', 'pass', 'pass']
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

    it('判空門檻與Shadow DOM穿透門檻須一致', function() {

        //兩者一致時, 會被判空的頁面正好就是會啟動穿透的頁面。
        //不一致即開縫: 本值較高時中間帶的頁面被判空而升級, 但下一階同樣不啟動穿透,
        //升級後仍是同一份空內容; 本值較低則出現「穿透了卻仍被判空」之頁面。
        //此約束原本只存在於兩個檔各自的數字裡, 改其一而不改另一不會有任何測試失敗
        let r = EMPTY_VISIBLE_MAX === SHADOW_VISIBLE_THRESHOLD
        let rr = true
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
        ['Google News wrapper', 'a <c-wiz> element from news.google.com wraps each card'],
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
            ['<html><body>something went wrong <a href="https://x.com/">x</a></body></html>', 'X/Twitter error page'],
            ['<html><body>secitptpage wx.qq.com</body></html>', 'WeChat verification page'],
            ['<html><head><meta http-equiv="refresh" content="0;url=https://a.com/"></head><body>x</body></html>', 'meta refresh redirect'],
            ['<html><body><c-wiz>news.google.com</c-wiz></body></html>', 'Google News wrapper'],
            ['<html><head><title>Loading...</title></head><body>x</body></html>', 'platform wrapper: "Loading..."'],
        ]
        let r = probes.map(([html]) => inspectHtml(html).message)
        let rr = probes.map(([, msg]) => msg)
        assert.strict.deepEqual(r, rr)
    })

})


//個別判識器之案例。
//
//此區塊原在 unit-remainingBranches.test.mjs——該檔以「補齊覆蓋率量測後仍為零執行之分支」
//為組織原則, 於是同一個模組的規格被切在兩個檔, 讀者要看兩處才知道判識器的完整行為。
//測試該按規格組織而非按覆蓋率數字組織, 故移回此處
describe('個別判識器之案例', function() {

    it('同時含captcha與challenge且可見文字極少, 判generic CAPTCHA', function() {
        let t = inspectHtml('<html><head><title>x</title></head><body><p>please solve the captcha to pass this challenge</p></body></html>')
        let r = [t.pass, t.type, t.message]
        let rr = [false, 'captcha', 'generic CAPTCHA']
        assert.strict.deepEqual(r, rr)
    })

    it('內容量足夠時不判generic CAPTCHA, 且有無article標籤皆然', function() {

        //R14前之判準以「不含<article>」為豁免條件, 使真挑戰頁只要含該標籤即漏判。
        //改以內容量為分野後, 兩種形狀的正常文章都放行, 而豁免不再與標籤有關
        let body = '<p>this article explains captcha and challenge design in depth. </p>' +
            '<p>' + 'it continues with enough sentences, commas and length that it reads as a genuine article body rather than boilerplate. '.repeat(5) + '</p>'
        let r = [
            inspectHtml('<html><head><title>x</title></head><body><article>' + body + '</article></body></html>').type,
            inspectHtml('<html><head><title>x</title></head><body>' + body + '</body></html>').type,
        ]
        let rr = ['pass', 'pass']
        assert.strict.deepEqual(r, rr)
    })

    it('含article且可見文字極少時仍判generic CAPTCHA', function() {

        //鎖住R14之修正: <article>標籤不再是豁免條件, 否則真挑戰頁只要帶該標籤即漏判
        let html = '<html><head><title>x</title></head><body><article><p>captcha challenge</p></article></body></html>'
        let r = inspectHtml(html).type
        let rr = 'captcha'
        assert.strict.deepEqual(r, rr)
    })

    it('X與Twitter之錯誤頁判captcha', function() {

        //網域須以「//」錨定: 裸字串比對會使imgix.com、mybox.com等任何以x.com結尾之網域誤判
        let r = [
            '<html><head><title>x</title></head><body><p>something went wrong <a href="https://x.com/home">retry</a></p></body></html>',
            '<html><head><title>x</title></head><body><p>something went wrong <a href="https://twitter.com/home">retry</a></p></body></html>',
        ].map((h) => [inspectHtml(h).type, inspectHtml(h).message])
        let rr = [['captcha', 'X/Twitter error page'], ['captcha', 'X/Twitter error page']]
        assert.strict.deepEqual(r, rr)
    })

    it('相似網域不因x.com子字串而誤判', function() {

        //imgix.com、mybox.com 等以 x.com 結尾之網域, 其錯誤頁不該被判為X/Twitter攔阻頁
        let r = ['imgix.com', 'mybox.com', 'phoenix.com'].map((d) => {
            return inspectHtml('<html><head><title>Error</title></head><body><p>something went wrong at ' + d + '</p></body></html>').type
        })
        let rr = ['pass', 'pass', 'pass']
        assert.strict.deepEqual(r, rr)
    })

    it('Google News判識器只擋殼頁, 不擋listing頁(內容量閘門之作用)', function() {

        //**本條記錄一次由錯誤數字造成的迴歸**。
        //
        //曾有一輪把此判識器標strong, 理由是「實測真實Google News殼頁可見文字約1822,
        //遠高於閘門故不會執行」。2026-09-10 實抓三種頁面, 那個數字是錯的:
        //  /read/ 真殼頁  visible=0        ← 閘門根本不作用, 弱判準本來就命中
        //  首頁           visible=724~775
        //  /topics/       visible=13359    ← Readability 可解析出萬字內容
        //1822 抄自上一輪自己寫的註解而未重量。改標strong後真實/topics/頁由success變error。
        //
        //閘門在這裡不是障礙, 是它能只擋殼頁的原因: 殼頁 visible≈0, listing 頁動輒上萬,
        //兩者分野極大, 餘裕充足
        let mk = (n) => '<html><head><title>Google 新聞</title></head><body><c-wiz jsrenderer="x">' +
            '<a href="https://news.google.com/read/CBMi">連結</a><p>' +
            '新聞標題摘要與來源媒體名稱。'.repeat(n) + '</p></c-wiz></body></html>'
        let r = [
            inspectHtml(mk(0)).type,
            inspectHtml(mk(3)).type,
            inspectHtml(mk(200)).pass,
            inspectHtml(mk(1200)).pass,
        ]
        let rr = ['redirect', 'redirect', true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('判準粒度為元素起始標記, 談論該主題之短文不受影響', function() {

        //粒度改進與強度無關, 兩者分開看: 比對'<c-wiz'元素起始標記而非裸字'c-wiz',
        //使談論Google News版面的**短文**不致誤判(長文本來就有閘門保護, 短文沒有)
        let short = (s) => '<html><head><title>談新聞聚合器</title></head><body><p>' + s + '</p></body></html>'
        let r = [
            inspectHtml(short('c-wiz 元素用於 news.google.com 之版面設計。')).pass,
            inspectHtml(short('範例碼為 &lt;c-wiz&gt; 元素，見 news.google.com 之實作。')).pass,
        ]
        let rr = [true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('WeChat判識器刻意維持weak, 因無真實頁面之量測值', function() {

        //與Google News那條的差別在證據強弱: 該條有實測數字(真殼頁1822字, 超過閘門),
        //本條沒有。無量測即標strong, 是拿「談論該主題的長文被誤殺」換一個未經證實的漏判
        let long = '<html><head><title>談微信驗證</title></head><body><p>' +
            'secitptpage 出現於 wx.qq.com 之驗證頁，本文說明其運作方式。'.repeat(40) + '</p></body></html>'
        let short = '<html><head><title>驗證</title></head><body><div id="secitptpage"></div>' +
            '<script src="https://wx.qq.com/x.js"></script><p>請完成驗證</p></body></html>'
        let r = [inspectHtml(long).pass, inspectHtml(short).type]
        let rr = [true, 'verify']
        assert.strict.deepEqual(r, rr)
    })

    it('Google News之c-wiz包裝頁判redirect', function() {
        let html = '<html><head><title>x</title></head><body><c-wiz>from news.google.com</c-wiz><p>' + 'z'.repeat(300) + '</p></body></html>'
        let t = inspectHtml(html)
        let r = [t.pass, t.type, t.message]
        let rr = [false, 'redirect', 'Google News wrapper']
        assert.strict.deepEqual(r, rr)
    })

})


//D1回歸: 內容量閘門依證據強度決定是否套用。
//
//先前此欄為 anyContent（語意是「要不要套閘門」），分的不是證據強度而是「例外與否」，
//於是標題型的強證據也被閘門擋掉——這是在補救「閘門沒套齊」時造成的新同型錯誤
describe('內容量閘門依證據強度套用(D1回歸)', function() {

    let mk = (title, n) => '<html><head><title>' + title + '</title></head><body><p>' +
        '請稍候，我們正在驗證您的瀏覽器。'.repeat(n) + '</p></body></html>'

    it('標題型強證據不受內容量影響, 文案再長仍擋下', function() {

        //真實Cloudflare挑戰頁之標題即為「Just a moment...」; 多語系或Enterprise自訂挑戰頁
        //之文案可超過500字, 舊實作於此漏判
        let r = [1, 10, 30, 50, 100].map((n) => inspectHtml(mk('Just a moment...', n)).pass)
        let rr = [false, false, false, false, false]
        assert.strict.deepEqual(r, rr)
    })

    it('access denied之標題型與Akamai內文型分屬不同強度', function() {

        //標題型為頁面自我宣告身分, 屬強證據; Akamai型之兩個條件皆為內文字串, 仍屬弱證據
        let long = '這是一段足夠長度的正文內容用以超過內容量閘門。'.repeat(40)
        let r = [

            //標題型: 內容再長仍擋下
            inspectHtml('<html><head><title>Access Denied - CDN</title></head><body><p>' + long + '</p></body></html>').message,

            //Akamai型: 內容充足時不誤判(一篇談論Akamai攔阻的文章)
            inspectHtml('<html><head><title>技術文章</title></head><body><p>談 access denied 與 edgesuite.net 的關係。' + long + '</p></body></html>').pass,

            //Akamai型: 內容稀少時仍擋下
            inspectHtml('<html><head><title>Error</title></head><body><p>access denied by edgesuite.net</p></body></html>').message,
        ]
        let rr = ['access denied (WAF/CDN block)', true, 'access denied (Akamai)']
        assert.strict.deepEqual(r, rr)
    })

    it('弱證據仍受閘門保護, 正常長文談論反爬蟲不誤判', function() {
        let art = (t) => '<html><head><title>技術文章</title></head><body><article><p>' + t + '</p><p>' +
            '這是一段足夠長度的正文內容。'.repeat(40) + '</p></article></body></html>'
        let r = [
            'perimeterx 是另一家供應商',
            '挑戰頁會顯示 verify you are human',
            'captcha 與 challenge 的設計取捨',
            'your request has been blocked 是常見文案',
        ].map((t) => inspectHtml(art(t)).pass)
        let rr = [true, true, true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('強證據判識器之數量與身分', function() {

        //change-detector: 新增strong標記時應同時確認該判準是否真為「頁面自我宣告」,
        //而非只是想讓某個案例通過
        let strongCases = [
            ['<html><head><title>Just a moment...</title></head><body><p>' + 'x'.repeat(2000) + '</p></body></html>', 'Cloudflare/anti-bot challenge'],
            ['<html><head><title>Access Denied</title></head><body><p>' + 'x'.repeat(2000) + '</p></body></html>', 'access denied (WAF/CDN block)'],
            ['<html><head><meta http-equiv="refresh" content="0;url=https://a.com/"><title>t</title></head><body><p>' + 'x'.repeat(2000) + '</p></body></html>', 'meta refresh redirect'],
        ]
        let r = strongCases.map(([h]) => inspectHtml(h).message)
        let rr = strongCases.map(([, m]) => m)
        assert.strict.deepEqual(r, rr)
    })

})
