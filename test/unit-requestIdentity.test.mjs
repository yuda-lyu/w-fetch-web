import assert from 'assert'
import {
    DEFAULT_UA,
    DEFAULT_REFERER,
    DEFAULT_ACCEPT_LANG,
    getRequestIdentity,
    getCurlIdentity,
    getBrowserPageOptions
} from '../src/requestIdentity.mjs'


//HTTP請求身分之契約。
//
//此三項先前只有curl階實作, 於Playwright兩階靜默失效; 而auto模式之後三階正是
//「curl被擋才會走到」的階, 也就是最需要偽裝的時候。端對端驗證見 api-requestIdentity.test.mjs


describe('getRequestIdentity', function() {

    it('只回報使用者明確指定者, 未指定為空字串', function() {
        let r = [
            getRequestIdentity({ userAgent: 'X/1.0' }),
            getRequestIdentity({}),
            getRequestIdentity(null),
        ]
        let rr = [
            { userAgent: 'X/1.0', referer: '', acceptLanguage: '' },
            { userAgent: '', referer: '', acceptLanguage: '' },
            { userAgent: '', referer: '', acceptLanguage: '' },
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('非字串或空字串一律視為未指定', function() {
        let r = getRequestIdentity({ userAgent: 123, referer: '', acceptLanguage: {} })
        let rr = { userAgent: '', referer: '', acceptLanguage: '' }
        assert.strict.deepEqual(r, rr)
    })

})


describe('getCurlIdentity', function() {

    it('未指定時採預設值', function() {

        //curl不指定就送出自己的UA而被秒擋, 故此階必須有預設
        let r = getCurlIdentity({})
        let rr = { userAgent: DEFAULT_UA, referer: DEFAULT_REFERER, acceptLanguage: DEFAULT_ACCEPT_LANG }
        assert.strict.deepEqual(r, rr)
    })

    it('指定者覆寫預設', function() {
        let r = getCurlIdentity({ userAgent: 'X/1.0', acceptLanguage: 'ja' })
        let rr = { userAgent: 'X/1.0', referer: DEFAULT_REFERER, acceptLanguage: 'ja' }
        assert.strict.deepEqual(r, rr)
    })

})


describe('getBrowserPageOptions', function() {

    it('全未指定時回空物件, 不硬套curl之預設UA', function() {

        //此為刻意之不對稱: Playwright啟動的就是真實Chrome, 其UA與navigator.*、TLS指紋一致;
        //硬套寫死版本號的UA反而製造指紋不一致, 對反偵測是負面的
        let r = getBrowserPageOptions({})
        let rr = {}
        assert.strict.deepEqual(r, rr)
    })

    it('指定UA時帶入userAgent選項', function() {
        let r = getBrowserPageOptions({ userAgent: 'X/1.0' })
        let rr = { userAgent: 'X/1.0' }
        assert.strict.deepEqual(r, rr)
    })

    it('Referer與Accept-Language以extraHTTPHeaders帶入', function() {

        //瀏覽器無此二者之專屬選項, 須走extraHTTPHeaders
        let r = getBrowserPageOptions({ referer: 'https://a.com/', acceptLanguage: 'zh-TW' })
        let rr = { extraHTTPHeaders: { 'Referer': 'https://a.com/', 'Accept-Language': 'zh-TW' } }
        assert.strict.deepEqual(r, rr)
    })

    it('三者全指定時同時帶入', function() {
        let r = getBrowserPageOptions({ userAgent: 'X/1.0', referer: 'https://a.com/', acceptLanguage: 'zh-TW' })
        let rr = {
            userAgent: 'X/1.0',
            extraHTTPHeaders: { 'Referer': 'https://a.com/', 'Accept-Language': 'zh-TW' },
        }
        assert.strict.deepEqual(r, rr)
    })

})


describe('請求身分之單一擁有者', function() {

    it('src內不得有第二處預設UA字串', async function() {
        let fs = await import('fs')
        let path = await import('path')
        let hits = fs.readdirSync('src')
            .filter((v) => v.endsWith('.mjs') && v !== 'requestIdentity.mjs')
            .filter((v) => fs.readFileSync(path.join('src', v), 'utf8').includes('AppleWebKit/537.36'))
        let r = hits
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

})
