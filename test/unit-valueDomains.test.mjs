import assert from 'assert'
import fs from 'fs'
import path from 'path'
import map from 'lodash-es/map.js'
import fetchWeb from '../src/fetchWeb.mjs'
import inspectHtml from '../src/inspectHtml.mjs'
import buildPlan from '../src/buildPlan.mjs'
import { VALID_TYPES } from '../src/detectorContract.mjs'
import { htmlArticle } from './tools/serverForTest.mjs'
import {
    METHOD_AUTO, METHOD_CURL, METHOD_PW_HEADLESS, METHOD_PW_HEADED, METHOD_CAMOFOX,
    DETECT_PASS, DETECT_CAPTCHA, DETECT_VERIFY, DETECT_REDIRECT, DETECT_EMPTY
} from '../src/constants.mjs'


//METHOD_*與DETECT_*之值域守門, 與unit-reasons同族。
//
//三個列舉(reason、method、type)同為對外公開之契約, 呼叫端據以分支。reason先前散在12個檔
//而由unit-reasons補上守門, 另二者則一直沒有——集中於constants.mjs只解決了「複本」這一種風險,
//沒解決另兩種:
//  一、值本身被改動即為破壞性變更, 但無任何測試會因此失敗(測試若引用同一常數會跟著改)
//  二、值域之邊界(哪些值算合法、對外訊息列了哪些)與實作可能各說各話
describe('method與type之值域守門', function() {

    describe('公開值以字面量固定(破壞性變更之絆索)', function() {

        //刻意寫字面量而非引用常數: 對外契約是「值」不是「變數名」,
        //測試若引用同一常數, 值改錯時測試會跟著錯而測不到
        it('METHOD_*之值', function() {
            let r = [METHOD_AUTO, METHOD_CURL, METHOD_PW_HEADLESS, METHOD_PW_HEADED, METHOD_CAMOFOX]
            let rr = ['auto', 'curl', 'playwright-headless', 'playwright-headed', 'camofox']
            assert.strict.deepEqual(r, rr)
        })

        it('DETECT_*之值', function() {
            let r = [DETECT_PASS, DETECT_CAPTCHA, DETECT_VERIFY, DETECT_REDIRECT, DETECT_EMPTY]
            let rr = ['pass', 'captcha', 'verify', 'redirect', 'empty']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('opt.method之合法值域', function() {

        it('五個合法值皆產生計畫而不回error', function() {
            let r = map(['auto', 'curl', 'playwright', 'playwright-headed', 'camofox'], (m) => {
                let t = buildPlan('https://example.com/a', m, true)
                return [t.error === undefined, t.plan.length > 0]
            })
            let rr = map([1, 2, 3, 4, 5], () => [true, true])
            assert.strict.deepEqual(r, rr)
        })

        it('不合法值之錯誤訊息須列出完整合法值域, 含auto', async function() {

            //'auto'不在METHOD_OPTIONS內(它不對應單一階而是整條階梯), 此前訊息取自該物件之鍵,
            //於是把預設值本身漏掉——呼叫端打錯大小寫時, 收到的合法清單裡沒有他想用的那個值
            let t = await fetchWeb('https://example.com/', { method: 'Auto', showLog: false, maxRetries: 0 })
            let r = [t.status, t.reason, t.message]
            let rr = ['error', 'invalid-method', 'unknown method "Auto" (valid: auto, curl, playwright, playwright-headed, camofox)']
            assert.strict.deepEqual(r, rr)
        })

        it('公開選項名與結果之method刻意不同名', function() {

            //'playwright'是輸入選項名, 結果之method為'playwright-headless';
            //兩者任一改動皆為破壞性變更, 故各自釘住
            let t = buildPlan('https://example.com/a', 'playwright', true)
            let r = [t.plan.length, t.plan[0].key, t.plan[0].method]
            let rr = [1, 'headless', 'playwright-headless']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('計畫所產生之method皆在值域內', function() {

        it('各分流與各指定方法之每一階, method皆為METHOD_*之一', function() {

            //涵蓋auto之階梯全展開與四條網域分流, 使新增階或改動STEPS時若漏掉常數即在此失敗
            let urls = [
                'https://example.com/a',
                'https://mp.weixin.qq.com/s/a',
                'https://www.msn.com/a',
                'https://news.google.com/a',
                'https://finance.yahoo.com/a',
            ]
            let methods = ['auto', 'curl', 'playwright', 'playwright-headed', 'camofox']
            let known = [METHOD_CURL, METHOD_PW_HEADLESS, METHOD_PW_HEADED, METHOD_CAMOFOX]
            let bad = []
            for (let u of urls) {
                for (let m of methods) {
                    let t = buildPlan(u, m, true)
                    for (let s of t.plan) {
                        if (!known.includes(s.method)) {
                            bad.push([u, m, s.key, s.method])
                        }
                    }
                }
            }
            let r = bad
            let rr = []
            assert.strict.deepEqual(r, rr)
        })

        it('METHOD_AUTO不出現在任何一階之method', function() {

            //'auto'是輸入選項而非結果之方法名, 若流入結果, 呼叫端會收到一個抓取函數不存在的method
            let bad = []
            for (let m of ['auto', 'curl', 'playwright', 'playwright-headed', 'camofox']) {
                let t = buildPlan('https://example.com/a', m, true)
                for (let s of t.plan) {
                    if (s.method === METHOD_AUTO) {
                        bad.push([m, s.key])
                    }
                }
            }
            let r = bad
            let rr = []
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('inspectHtml回傳之type皆在值域內', function() {

        //使用端判識器經isValidDetector檢核type, 內建判識器則無任何檢核——
        //對稱性缺口: 內建若有人打錯type, 呼叫端會收到一個認不得的值而無處可查。
        //DETECTORS未匯出, 故以行為面涵蓋: 逐一觸發每個內建判識器並檢查其type
        let probes = [
            '<html><body>captcha-delivery.com</body></html>',
            '<html><body>perimeterx</body></html>',
            '<html><body><div class="cf-challenge-running"></div></body></html>',
            '<html><head><title>Just a moment...</title></head><body>x</body></html>',
            '<html><body><script src="/cdn-cgi/challenge-platform/x"></script>y</body></html>',
            '<html><body>captcha challenge</body></html>',
            '<html><head><title>Are you a robot?</title></head><body>x</body></html>',
            '<html><body><div class="cf-turnstile"></div></body></html>',
            '<html><body>verify you are human</body></html>',
            '<html><body>request has been blocked</body></html>',
            '<html><body>blocked by our server</body></html>',
            '<html><head><title>Access Denied</title></head><body>x</body></html>',
            '<html><body>access denied edgesuite.net</body></html>',
            '<html><body>something went wrong <a href="https://x.com/">x</a></body></html>',
            '<html><body>secitptpage wx.qq.com</body></html>',
            '<html><head><meta http-equiv="refresh" content="0;url=https://a.com/"></head><body>x</body></html>',
            '<html><body>c-wiz news.google.com</body></html>',
            '<html><head><title>MSN</title></head><body>x</body></html>',
            '<html><head><title>t</title></head><body><script>' + 'v'.repeat(6000) + '</script></body></html>',
            '<html><head><title>t</title></head><body><p>' + 'x'.repeat(300) + '</p></body></html>',
        ]

        it('每個探針之type皆為DETECT_*之一', function() {
            let known = [DETECT_PASS, DETECT_CAPTCHA, DETECT_VERIFY, DETECT_REDIRECT, DETECT_EMPTY]
            let bad = probes.map((h) => inspectHtml(h).type).filter((v) => !known.includes(v))
            let r = bad
            let rr = []
            assert.strict.deepEqual(r, rr)
        })

        it('探針確實涵蓋四種攔阻類型與pass, 非全部落在同一型', function() {

            //上一條若探針全部回pass亦會通過, 故在此鎖住涵蓋面
            let got = [...new Set(probes.map((h) => inspectHtml(h).type))].sort()
            let r = got
            let rr = ['captcha', 'empty', 'pass', 'redirect', 'verify']
            assert.strict.deepEqual(r, rr)
        })

        it('pass不屬於使用端可註冊之type', function() {

            //VALID_TYPES刻意不含pass: 判識器的職責是「指出這頁不能用」,
            //註冊一個回報pass的判識器沒有意義, 且會使首個命中者勝出的語意變成「提前放行」
            let r = [VALID_TYPES.includes(DETECT_PASS), [...VALID_TYPES].sort()]
            let rr = [false, ['captcha', 'empty', 'redirect', 'verify']]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('執行期流出之method亦受值域約束', function() {

        //上一組驗的是buildPlan產生的step.method, 但實際流出的值來自抓取器自報:
        //`r.method || step.method`此前無任何把關, 實測抓取器回method:'MY-OWN-METHOD'時,
        //該值原樣出現在對外結果之method與attempts[].method, 汙染一個對外公開的列舉。
        //今天只因_fetchers是測試接縫而不可達, 但那不是「不該把關」的理由
        let mkFetcher = (method) => async () => ({ method, status: 'success', html: htmlArticle })

        it('抓取器自報之非法method不流出, 退回計畫所宣告者', async function() {
            let r = []
            for (let v of ['MY-OWN-METHOD', '', 123, null, undefined, 'CURL', 'auto']) {
                let t = await fetchWeb('https://example.com/a', { method: 'curl', showLog: false, _fetchers: { curl: mkFetcher(v) } })
                r.push([t.method, t.attempts[0].method])
            }
            let rr = map([1, 2, 3, 4, 5, 6, 7], () => ['curl', 'curl'])
            assert.strict.deepEqual(r, rr)
        })

        it('抓取器自報之合法method予以採信', async function() {

            //抓取器才知道自己實際做了什麼(如轉址後改由他階完成), 故合法值優先於計畫宣告值
            let t = await fetchWeb('https://example.com/a', { method: 'curl', showLog: false, _fetchers: { curl: mkFetcher(METHOD_CAMOFOX) } })
            let r = [t.method, t.attempts[0].method]
            let rr = ['camofox', 'camofox']
            assert.strict.deepEqual(r, rr)
        })

        it('parse=false之結果其method同受約束', async function() {

            //解析與不解析是兩條輸出路徑, 此前各自取method而其中一條未把關
            let t = await fetchWeb('https://example.com/a', { method: 'curl', parse: false, showLog: false, _fetchers: { curl: mkFetcher('BOGUS') } })
            let r = [t.method, t.attempts[0].method]
            let rr = ['curl', 'curl']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('無第二處擁有者', function() {

        it('四個抓取函數之method皆自constants取得, 未各自寫死', function() {

            //新增第五個抓取函數時若自行寫死method字面量即在此失敗
            let files = ['fetchWebByCurl.mjs', 'fetchWebByPlaywrightHeadless.mjs', 'fetchWebByPlaywrightHead.mjs', 'fetchWebByCamofox.mjs']
            let bad = files.filter((fn) => {
                let t = fs.readFileSync(path.join('src', fn), 'utf8')
                return !/import \{ METHOD_[A-Z_]+ as METHOD \} from '\.\/constants\.mjs'/.test(t)
            })
            let r = bad
            let rr = []
            assert.strict.deepEqual(r, rr)
        })

    })

})
