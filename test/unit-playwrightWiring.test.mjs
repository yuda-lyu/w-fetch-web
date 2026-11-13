import assert from 'assert'
import wpw from 'w-playwright'
import fetchWebByPlaywrightHeadless from '../src/fetchWebByPlaywrightHeadless.mjs'
import fetchWebByPlaywrightHead from '../src/fetchWebByPlaywrightHead.mjs'
import fetchWeb from '../src/fetchWeb.mjs'
import guardFacts from './tools/guardFacts.mjs'
import './tools/noBrowser.mjs'


//接線測試: 本套件之瀏覽器啟動一律經 w-playwright(其規則帳本 R-PW-WIRING;設計 §5.1 本套件之列)
//
//本套件之啟動點全集只有一處: src/runPlaywright.mjs 之 _runOnce(無頭與有頭兩階以 cfg.launch 區分),
//fetchWeb 之 'playwright'、'playwright-headed' 兩法亦經由它。故本檔對兩階各自斷言其送出之選項含守門。
//
//被替身取代之部分: w-playwright 之 BrowserType(真 Playwright 之 chromium)。替身收到的是 w-playwright
//合併後之選項(含環境、版本、登入守門之前置檢查), 替身不呼叫 next(), 故本檔不啟動任何瀏覽器;
//替身拋錯使單次嘗試在導航前結束。真啟動之路徑(next())由 test/tools/sharedChrome.mjs 於 api- 檔走過


let FAKE_ERR = 'pm-wiring-fake-launch'


//以替身記錄每次啟動收到之合併後選項; 替身一律拋錯, 不啟動瀏覽器
function useFakeBrowserType() {
    let calls = []
    let restore = null
    before(function() {
        restore = wpw.setBrowserTypeForTest({
            launch: async (merged) => {
                calls.push(merged)
                throw new Error(FAKE_ERR)
            },
        })
    })
    after(function() {
        if (restore) {
            restore()
            restore = null
        }
    })
    return {
        calls,
        reset: () => {
            calls.length = 0
        },
    }
}


describe('瀏覽器啟動經w-playwright之接線', function() {

    let fk = useFakeBrowserType()

    beforeEach(function() {
        fk.reset()
    })

    it('無頭階: 送出之選項含守門且保留本階之啟動設定', async function() {
        this.timeout(60000)
        let t = await fetchWebByPlaywrightHeadless('http://127.0.0.1:1/wiring', { maxRetries: 0 })
        let m = fk.calls[0] || {}
        let r = [
            fk.calls.length, //R-PW-WIRING: 替身之呼叫次數>0(未經w-playwright即為0)
            m.headless, //本階之設定: 無頭
            m.channel, //本階之設定: 系統Chrome(README: 須安裝Google Chrome)
            guardFacts(m.args || []), //R-PW-WIRING: args恰一串--disable-features、為最後一個元素、含守門功能與Playwright預設清單
            [t.status, t.reason, t.attempts], //啟動失敗仍依既有契約回playwright-error, 不reject
        ]
        let rr = [
            1,
            true,
            'chrome',
            { nDisable: 1, disableIsLast: true, hasGuard: true, hasAllDefaults: true },
            ['error', 'playwright-error', 1],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('有頭階: 送出之選項含守門且保留本階之啟動設定與反偵測參數', async function() {
        this.timeout(60000)
        let t = await fetchWebByPlaywrightHead('http://127.0.0.1:1/wiring', { maxRetries: 0 })
        let m = fk.calls[0] || {}
        let args = m.args || []
        let r = [
            fk.calls.length, //R-PW-WIRING: 替身之呼叫次數>0
            m.headless, //本階之設定: 有頭
            m.channel, //本階之設定: 系統Chrome
            args.includes('--disable-blink-features=AutomationControlled'), //本階之反偵測參數經合併後仍在(--disable-blink-features非功能開關, 不被吸收)
            guardFacts(args), //R-PW-WIRING: 恰一串、居末、含守門與預設清單
            [t.status, t.reason, t.attempts],
        ]
        let rr = [
            1,
            false,
            'chrome',
            true,
            { nDisable: 1, disableIsLast: true, hasGuard: true, hasAllDefaults: true },
            ['error', 'playwright-error', 1],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('重試之每次嘗試皆經w-playwright啟動', async function() {
        this.timeout(60000)
        //maxRetries=1: 含初始共2次嘗試, 每次嘗試各自啟動瀏覽器(runPlaywright之單次嘗試擁有browser生命週期)
        let t = await fetchWebByPlaywrightHeadless('http://127.0.0.1:1/wiring', { maxRetries: 1 })
        let r = [t.attempts, fk.calls.length, fk.calls.every((m) => guardFacts(m.args || []).hasGuard)]
        let rr = [2, 2, true]
        assert.strict.deepEqual(r, rr)
    })

    it('fetchWeb之playwright與playwright-headed兩法皆經w-playwright', async function() {
        this.timeout(60000)
        let a = await fetchWeb('http://127.0.0.1:1/wiring', { method: 'playwright', maxRetries: 0, useShowLog: false })
        let b = await fetchWeb('http://127.0.0.1:1/wiring', { method: 'playwright-headed', maxRetries: 0, useShowLog: false })
        let r = [
            a.status,
            b.status,
            fk.calls.map((m) => m.headless), //兩法依序為無頭、有頭
            fk.calls.map((m) => guardFacts(m.args || []).disableIsLast && guardFacts(m.args || []).hasGuard),
        ]
        let rr = ['error', 'error', [true, false], [true, true]]
        assert.strict.deepEqual(r, rr)
    })

    it('w-playwright拒絕之環境(PWDEBUG)不呼叫BrowserType, 回playwright-error且訊息為其固定詞彙', async function() {
        this.timeout(60000)
        let k = 'PWDEBUG'
        let had = Object.prototype.hasOwnProperty.call(process.env, k)
        let v0 = process.env[k]
        process.env[k] = '1'
        let t = null
        try {
            t = await fetchWebByPlaywrightHeadless('http://127.0.0.1:1/wiring', { maxRetries: 0 })
        }
        finally {
            if (had) {
                process.env[k] = v0
            }
            else {
                delete process.env[k]
            }
        }
        let r = [
            fk.calls.length, //環境檢查在呼叫BrowserType之前(w-playwright README: 啟動入口之順序)
            [t.status, t.reason, t.attempts],
            t.message, //行為變更: 啟動失敗之message改為w-playwright之固定詞彙(不含Playwright原錯誤之命令列與路徑)
        ]
        let rr = [0, ['error', 'playwright-error', 1], 'unsupported environment: PWDEBUG']
        assert.strict.deepEqual(r, rr)
    })

})
