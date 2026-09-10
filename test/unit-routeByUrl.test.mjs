import assert from 'assert'
import { requiresHeaded, requiresCamofox, requiresJsRedirect, requiresHeadless, extractRedirectTarget } from '../src/routeByUrl.mjs'


//網域分流與轉址提取之契約。
//
//本檔先前無專屬測試, 分流行為只由 unit-escalation 之端對端案例間接覆蓋,
//而「哪些網址不該命中」一格都沒有——SSRF 即由此而來


describe('轉址提取之網域錨定(SSRF回歸)', function() {

    it('目標網址出現在路徑中時不得命中', function() {

        //未錨定時「youtube.com/redirect」出現在路徑任一處即命中, 使攻擊者可控制提取結果。
        //實測可指向雲端metadata端點(169.254.169.254)與內網服務, 且fetchWeb會實際發出請求
        let attacks = [
            'https://attacker.example/p/youtube.com/redirect?q=http://169.254.169.254/latest/meta-data/',
            'https://evil.test/linkedin.com/redir/redirect?url=http://127.0.0.1:8080/admin',
            'https://evil.test/?next=youtube.com/redirect&q=http://127.0.0.1/',
        ]
        let r = attacks.map((v) => extractRedirectTarget(v))
        let rr = attacks.map(() => null)
        assert.strict.deepEqual(r, rr)
    })

    it('相似網域不得命中', function() {

        //youtube.com.evil.test 之註冊網域是 evil.test, 不是 youtube.com
        let attacks = [
            'https://youtube.com.evil.test/redirect?q=http://127.0.0.1/',
            'http://x.youtube.com.attacker.io/redirect?q=http://10.0.0.1/',
            'https://notlinkedin.com/redir/redirect?url=http://127.0.0.1/',
        ]
        let r = attacks.map((v) => extractRedirectTarget(v))
        let rr = attacks.map(() => null)
        assert.strict.deepEqual(r, rr)
    })

    it('正當之轉址服務網址仍能提取, 含子網域與無www者', function() {
        let r = [
            extractRedirectTarget('https://www.youtube.com/redirect?q=https://example.com/'),
            extractRedirectTarget('https://youtube.com/redirect?q=https://example.com/'),
            extractRedirectTarget('http://m.youtube.com/redirect?q=https://example.com/'),
            extractRedirectTarget('https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fa.com%2Fb'),
        ]
        let rr = ['https://example.com/', 'https://example.com/', 'https://example.com/', 'https://a.com/b']
        assert.strict.deepEqual(r, rr)
    })

    it('無目標參數或非轉址服務時回null', function() {
        let r = [
            extractRedirectTarget('https://www.youtube.com/redirect'),
            extractRedirectTarget('https://www.youtube.com/watch?v=abc'),
            extractRedirectTarget('https://example.com/'),
            extractRedirectTarget('abc'),
        ]
        let rr = [null, null, null, null]
        assert.strict.deepEqual(r, rr)
    })

    it('非法百分比序列不使函數拋錯', function() {

        //searchParams.get已解碼一次, 再解一次是為處理雙重編碼; 值為'%'時decodeURIComponent會拋URIError
        let r = extractRedirectTarget('https://www.youtube.com/redirect?q=%25')
        let rr = '%'
        assert.strict.deepEqual(r, rr)
    })

})


describe('網域分流之錨定', function() {

    it('四組分流判準皆以協定與網域錨定, 路徑中出現不命中', function() {

        //與轉址提取同一形態: 若未錨定, 攻擊者或誤植之網址會被導向錯誤的抓取階
        let r = [
            requiresHeaded('https://evil.test/p/wsj.com/articles/a'),
            requiresCamofox('https://evil.test/mp.weixin.qq.com/s/a'),
            requiresJsRedirect('https://evil.test/news.google.com/articles/a'),
            requiresHeadless('https://evil.test/msn.com/a'),
        ]
        let rr = [false, false, false, false]
        assert.strict.deepEqual(r, rr)
    })

    it('正當網址仍命中各自之分流', function() {
        let r = [
            requiresHeaded('https://www.wsj.com/articles/a'),
            requiresCamofox('https://mp.weixin.qq.com/s/a'),
            requiresJsRedirect('https://news.google.com/articles/a'),
            requiresHeadless('https://www.msn.com/en-us/news/a'),
        ]
        let rr = [true, true, true, true]
        assert.strict.deepEqual(r, rr)
    })

})
