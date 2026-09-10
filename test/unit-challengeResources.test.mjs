import assert from 'assert'
import { CHALLENGE_RESOURCES, VERIFY_SELECTORS } from '../src/challengeResources.mjs'
import inspectHtml from '../src/inspectHtml.mjs'


//挑戰元件特徵之單一擁有者。
//
//同一份知識先前有兩份形態不同的複本：判識器用字串比對、有頭模式用CSS選擇器點擊。
//新增一種挑戰服務要記得改兩處, 而其中一處的註解已寫明「與另一處同源」卻仍是複製的。
//本檔鎖住「衍生」這件事本身——選擇器由資源位址產生, 不是另一份手寫清單


describe('挑戰資源與選擇器之衍生關係', function() {

    it('每個資源位址都有對應之iframe選擇器', function() {
        let r = CHALLENGE_RESOURCES.map((v) => VERIFY_SELECTORS.includes(`iframe[src*="${v}"]`))
        let rr = CHALLENGE_RESOURCES.map(() => true)
        assert.strict.deepEqual(r, rr)
    })

    it('選擇器數量為資源數加一, 多出者為Turnstile容器class', function() {

        //.cf-turnstile不是資源位址而是容器class, 故不列入資源清單——
        //放進去會與Turnstile判識器重複比對同一個字串
        let r = [VERIFY_SELECTORS.length, VERIFY_SELECTORS[VERIFY_SELECTORS.length - 1]]
        let rr = [CHALLENGE_RESOURCES.length + 1, '.cf-turnstile iframe']
        assert.strict.deepEqual(r, rr)
    })

    it('選擇器之順序與資源清單一致', function() {

        //有頭模式取第一個命中且有boundingBox者, 故此陣列之順序有語意
        let r = VERIFY_SELECTORS.slice(0, CHALLENGE_RESOURCES.length)
        let rr = CHALLENGE_RESOURCES.map((v) => `iframe[src*="${v}"]`)
        assert.strict.deepEqual(r, rr)
    })

    it('資源位址不得放寬為/cdn-cgi/', function() {

        //該路徑於一般Cloudflare託管站台亦大量存在(email-decode、rocket-loader等),
        //放寬會把正常頁面判成攔阻頁
        let r = CHALLENGE_RESOURCES.filter((v) => v === '/cdn-cgi/' || v === '/cdn-cgi')
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

})


describe('判識器與有頭模式認得同一組挑戰頁', function() {

    it('每個資源位址皆被判識器認得', function() {

        //此為本清單存在的理由: 先前有頭模式認得的挑戰頁, 判識器一個都不認得
        let r = CHALLENGE_RESOURCES.map((res) => {
            let html = '<html><head><title>x</title></head><body>' +
                '<p>Verifying you are human.</p><script src="' + res + '"></script></body></html>'
            return inspectHtml(html).message
        })
        let rr = CHALLENGE_RESOURCES.map(() => 'anti-bot challenge resource')
        assert.strict.deepEqual(r, rr)
    })

})


//三大CAPTCHA服務之涵蓋。
//
//此前清單有hCaptcha而無reCAPTCHA, 實測reCAPTCHA挑戰頁完全漏判(回pass)而hCaptcha被攔下——
//同一類元件一個涵蓋一個沒有, 屬對稱破缺。reCAPTCHA是網路上最常見的CAPTCHA, 非推測性風險
describe('CAPTCHA服務之涵蓋(對稱性)', function() {

    let mk = (src) => '<html><head><title>Verify</title></head><body>' +
        '<div class="widget"></div><script src="' + src + '"></script>' +
        '<p>Please complete the security check to continue.</p></body></html>'

    it('三大服務之挑戰頁皆被判為captcha', function() {
        let cases = [
            ['reCAPTCHA(www.google.com)', 'https://www.google.com/recaptcha/api.js'],
            ['reCAPTCHA(recaptcha.net)', 'https://recaptcha.net/recaptcha/api.js'],
            ['hCaptcha', 'https://hcaptcha.com/1/api.js'],
            ['Cloudflare Turnstile', 'https://challenges.cloudflare.com/turnstile/v0/api.js'],
        ]
        let r = cases.map(([k, src]) => [k, inspectHtml(mk(src)).type])
        let rr = cases.map(([k]) => [k, 'captcha'])
        assert.strict.deepEqual(r, rr)
    })

    it('內嵌reCAPTCHA之正常長文頁面不被誤殺', function() {

        //reCAPTCHA大量出現於正常登入頁與留言板, 與/cdn-cgi/那條註解同一種顧慮。
        //此處靠既有的內容量閘門區隔: 攔阻頁可見文字極少, 正常頁面有整篇內容
        let login = '<html><head><title>會員登入</title></head><body>' +
            '<form><input name="u"><input name="p"></form>' +
            '<script src="https://www.google.com/recaptcha/api.js"></script><p>' +
            '歡迎回來，請輸入您的帳號與密碼登入本站，若忘記密碼可透過電子郵件重設，本站採用多重驗證保護您的帳戶安全。'.repeat(12) +
            '</p></body></html>'
        let r = inspectHtml(login).pass
        let rr = true
        assert.strict.deepEqual(r, rr)
    })

    it('內文僅提及recaptcha之文章不被誤殺', function() {

        //資源位址刻意寫成'/recaptcha/'而非裸字'recaptcha': 後者會命中內文與容器class g-recaptcha,
        //亦會使VERIFY_SELECTORS組出的iframe選擇器過寬
        let art = '<html><head><title>談驗證碼</title></head><body><p>' +
            '本文說明 recaptcha 與 g-recaptcha 容器的運作方式，以及它與其他驗證機制的差異。'.repeat(15) +
            '</p></body></html>'
        let r = [inspectHtml(art).pass, CHALLENGE_RESOURCES.includes('recaptcha')]
        let rr = [true, false]
        assert.strict.deepEqual(r, rr)
    })

})
