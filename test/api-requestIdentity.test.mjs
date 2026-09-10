import assert from 'assert'
import fetchWeb from '../src/fetchWeb.mjs'
import useServer from './tools/useServer.mjs'
import hasChrome from './tools/hasChrome.mjs'
import { DEFAULT_UA, DEFAULT_REFERER } from '../src/requestIdentity.mjs'


//端對端驗證HTTP請求身分是否確實送出到站方。
//
//本檔以真實server收到的標頭為斷言對象, 而非只檢查opt有沒有被讀到——
//此缺陷先前之所以長期未被發現, 正是因為沒有任何測試看過「實際送出了什麼」:
//opt.userAgent在curl階生效, 於Playwright兩階則被靜默丟棄(newPage未帶任何選項)


let UA = 'WFetchWebProbe/9.9'
let REF = 'https://referer.example.com/'
let LANG = 'zh-TW,zh;q=0.9'


describe('HTTP請求身分之端對端驗證', function() {

    let svr = useServer()

    describe('curl階', function() {

        it('指定之三項皆送出', async function() {
            await fetchWeb(svr.url('/article'), {
                method: 'curl',
                maxRetries: 0,
                showLog: false,
                userAgent: UA,
                referer: REF,
                acceptLanguage: LANG,
            })
            let h = svr.lastHeaders()
            let r = [h.userAgent, h.referer, h.acceptLanguage]
            let rr = [UA, REF, LANG]
            assert.strict.deepEqual(r, rr)
        })

        it('未指定時採預設身分, 不送出curl自己的UA', async function() {
            await fetchWeb(svr.url('/article'), { method: 'curl', maxRetries: 0, showLog: false })
            let h = svr.lastHeaders()
            let r = [h.userAgent, h.referer, h.userAgent.startsWith('curl/')]
            let rr = [DEFAULT_UA, DEFAULT_REFERER, false]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('Playwright無頭階', function() {

        let chromeOk = false

        before(async function() {
            this.timeout(120000)
            chromeOk = await hasChrome()
        })

        it('指定之三項皆送出', async function() {
            this.timeout(120000)
            if (!chromeOk) {
                this.skip()
            }
            await fetchWeb(svr.url('/article'), {
                method: 'playwright',
                maxRetries: 0,
                showLog: false,
                userAgent: UA,
                referer: REF,
                acceptLanguage: LANG,
            })
            let h = svr.lastHeaders()
            let r = [h.userAgent, h.referer, h.acceptLanguage]
            let rr = [UA, REF, LANG]
            assert.strict.deepEqual(r, rr)
        })

        it('未指定時沿用瀏覽器自身之UA, 不套用curl之預設值', async function() {
            this.timeout(120000)
            if (!chromeOk) {
                this.skip()
            }

            //刻意之不對稱: 硬套寫死版本號的UA會與navigator.*、TLS等其餘指紋不一致,
            //對反偵測是負面的。故此階未指定時交由瀏覽器用自己的真實身分
            await fetchWeb(svr.url('/article'), { method: 'playwright', maxRetries: 0, showLog: false })
            let h = svr.lastHeaders()
            let r = [h.userAgent === DEFAULT_UA, h.userAgent.includes('Chrome'), h.referer]
            let rr = [false, true, '']
            assert.strict.deepEqual(r, rr)
        })

    })

})
