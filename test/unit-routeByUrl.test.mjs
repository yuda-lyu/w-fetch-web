import assert from 'assert'
import { requiresHeaded, requiresCamofox, requiresJsRedirect, requiresHeadless, extractRedirectTarget } from '../src/routeByUrl.mjs'


//網域分流與轉址提取之契約。
//
//本檔先前無專屬測試, 分流行為只由 unit-escalation 之端對端案例間接覆蓋,
//而「哪些網址不該命中」一格都沒有——SSRF 即由此而來


//SSRF 防護分兩層, 兩層各有自己的一組測試。
//
//此前只有第一層(網域錨定), 而它只擋掉整類威脅的一個變體——「攻擊者自有網域模仿 pattern」。
//主變體不需要攻擊者自有網域: 直接用**真正的**轉址服務網址帶任意目標即可, 它完整符合錨定。
//實測(以本機端點代替內網位址)該端點確實收到請求, 內容原樣回到呼叫端。
//
//修一個輸入而非一類——同型錯誤, 且發生在一個已被標記為「已修」的安全缺陷上
describe('轉址提取之目標位址檢核(SSRF第二層)', function() {

    let viaLinkedin = (target) => extractRedirectTarget('https://www.linkedin.com/redir/redirect?url=' + encodeURIComponent(target))

    it('指向迴環位址之目標不得提取', function() {
        let attacks = [
            'http://127.0.0.1/admin',
            'http://127.0.0.1:8080/admin',
            'http://127.1.2.3/x',
            'http://localhost/admin',
            'http://localhost:9200/_cluster/health',
            'http://sub.localhost/x',
            'http://[::1]/x',
            'http://0.0.0.0/x',
        ]
        let r = attacks.map(viaLinkedin)
        let rr = attacks.map(() => null)
        assert.strict.deepEqual(r, rr)
    })

    it('指向雲端metadata與link-local之目標不得提取', function() {

        //169.254.169.254 為AWS/GCP/Azure之metadata端點, 取得後可換出臨時憑證
        let attacks = [
            'http://169.254.169.254/latest/meta-data/',
            'http://169.254.169.254/computeMetadata/v1/',
            'http://169.254.1.1/x',
        ]
        let r = attacks.map(viaLinkedin)
        let rr = attacks.map(() => null)
        assert.strict.deepEqual(r, rr)
    })

    it('指向私有網段之目標不得提取', function() {
        let attacks = [
            'http://10.0.0.5/x',
            'http://10.255.255.254/x',
            'http://172.16.0.1/x',
            'http://172.31.255.254/x',
            'http://192.168.1.1/x',
            'http://100.64.0.1/x',
        ]
        let r = attacks.map(viaLinkedin)
        let rr = attacks.map(() => null)
        assert.strict.deepEqual(r, rr)
    })

    it('私有網段之邊界外側仍視為公開, 不得誤擋', function() {

        //172.15/172.32 在12位元遮罩之外; 11.x 與 9.x 不屬10/8; 100.128 在CGNAT之外
        let ok = [
            'https://172.15.0.1/x',
            'https://172.32.0.1/x',
            'https://11.0.0.1/x',
            'https://9.255.255.255/x',
            'https://100.128.0.1/x',
            'https://8.8.8.8/x',
        ]
        let r = ok.map(viaLinkedin)
        let rr = [...ok]
        assert.strict.deepEqual(r, rr)
    })

    it('單標籤主機名與內網後綴不得提取', function() {

        //http://intranet/ 一類無法是公開站台, 於推導路徑一律視為內網
        let attacks = [
            'http://intranet/admin',
            'http://metadata/computeMetadata/v1/',
            'http://printer.local/x',
            'http://db.internal/x',
        ]
        let r = attacks.map(viaLinkedin)
        let rr = attacks.map(() => null)
        assert.strict.deepEqual(r, rr)
    })

    it('非http與https之目標不得提取', function() {
        let attacks = ['javascript:alert(1)', 'file:///etc/passwd', 'gopher://127.0.0.1:11211/x', 'data:text/html,<p>x</p>']
        let r = attacks.map(viaLinkedin)
        let rr = attacks.map(() => null)
        assert.strict.deepEqual(r, rr)
    })

    it('本層對兩組pattern一視同仁', function() {

        //對稱性: 只修linkedin那條而漏掉youtube, 即為「修一個不比對兄弟」
        let r = [
            extractRedirectTarget('https://www.youtube.com/redirect?q=' + encodeURIComponent('http://169.254.169.254/')),
            extractRedirectTarget('https://www.linkedin.com/redir/redirect?url=' + encodeURIComponent('http://169.254.169.254/')),
        ]
        let rr = [null, null]
        assert.strict.deepEqual(r, rr)
    })

    it('呼叫端直接給定之內網網址不受本層影響', function() {

        //本層只把關**套件自己推導出來**的網址。呼叫端要抓自己的內網服務是正當用法,
        //把它一併擋掉會誤傷正常用途, 且那不是SSRF(沒有繞過任何人的防線)
        let r = extractRedirectTarget('http://127.0.0.1:8080/admin')
        let rr = null
        assert.strict.deepEqual(r, rr)
    })

})


describe('轉址提取之網域錨定(SSRF第一層)', function() {

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

    it('linkedin之兩組pattern子網域寬度一致', function() {

        //同一站台同一份知識, 此前轉址提取用 (?:[\w-]+\.)* 而路由用 (?:www\.)?,
        //兩種寬度而無理由。子網域寬度之取捨原則見routeByUrl檔頭
        let sub = 'https://tw.linkedin.com/redir/redirect?url=https%3A%2F%2Fa.com%2Fb'
        let r = [
            extractRedirectTarget(sub),
            requiresJsRedirect('https://tw.linkedin.com/redir/redirect?url=x'),
            requiresJsRedirect('https://tw.linkedin.com/feed/update/x'),
        ]
        let rr = ['https://a.com/b', true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('news.google之路由涵蓋現行網頁版網址形態', function() {

        //2026-09-10實抓其首頁: ./read/ 20筆、./articles/ 0筆——清單只涵蓋舊形態時,
        //代價是白跑一次curl抓回1.8MB殼頁(內容層會兜底, 故非失敗)
        let r = [
            requiresJsRedirect('https://news.google.com/read/CBMi'),
            requiresJsRedirect('https://news.google.com/stories/CAAq'),
            requiresJsRedirect('https://news.google.com/articles/CBMi'),
            requiresJsRedirect('https://news.google.com/rss/articles/CBMi'),
        ]
        let rr = [true, true, true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('google.com本身不因news.google之規則而被納入', function() {

        //該知識只屬於news.google.com此一子網域, 放寬成整個註冊網域會把整個Google誤納
        let r = [
            requiresJsRedirect('https://www.google.com/read/x'),
            requiresJsRedirect('https://google.com/articles/x'),
            requiresJsRedirect('https://evil.news.google.com.attacker.io/read/x'),
        ]
        let rr = [false, false, false]
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
