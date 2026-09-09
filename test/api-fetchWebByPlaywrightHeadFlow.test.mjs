import assert from 'assert'
import includes from 'lodash-es/includes.js'
import fetchWebByPlaywrightHead from '../src/fetchWebByPlaywrightHead.mjs'
import serverForTest, { MARKER } from './tools/serverForTest.mjs'
import hasChrome from './tools/hasChrome.mjs'
import { skipHeaded } from './tools/env.mjs'


//有頭模式會開啟實體瀏覽器視窗, 且需要桌面環境。
//
//跳過條件有三:
//① 位於CI——GitHub Actions自動設CI=true與GITHUB_ACTIONS=true, 為偵測CI之直接訊號。
//   不可只靠有頭探測: Linux runner無DISPLAY確實會探測失敗, 但Windows runner有桌面
//   仍會通過而實際執行, 故仍需此顯性閘門
//② 有頭模式探測失敗——涵蓋非CI但無桌面之環境。
//   此探測必須以有頭進行, 不可用無頭結果推論: Linux常無頭可用而有頭不可用
//③ 設WFETCHWEB_SKIP_HEADED=1——供本機臨時停用, 避免測試期間彈出視窗
//①③之判斷置於 test/tools/env.mjs; ②之探測須留在此處, 因其須與待測模式一致


describe('fetchWebByPlaywrightHead完整流程(有頭)', function() {

    let svr = null

    before(async function() {
        this.timeout(120000)
        if (skipHeaded) {
            this.skip()
        }
        if (!await hasChrome({ headed: true })) {
            this.skip()
        }
        svr = await serverForTest()
    })

    after(async function() {
        if (svr) {
            await svr.close()
        }
    })

    it('一般頁面抓取成功且未偵測到驗證元件', async function() {
        this.timeout(120000)
        let t = await fetchWebByPlaywrightHead(svr.url('/article'), { maxRetries: 0, postNavigationWaitMs: 300 })
        let r = [t.status, t.method, t.attempts, t.verificationClicked, includes(t.html, MARKER)]
        let rr = ['success', 'playwright-headed', 1, false, true]
        assert.strict.deepEqual(r, rr)
    })

    it('偵測到驗證iframe時模擬人類滑鼠軌跡點擊(模式A)', async function() {
        this.timeout(180000)
        let t = await fetchWebByPlaywrightHead(svr.url('/cfchallenge'), { maxRetries: 0, postNavigationWaitMs: 300 })
        let r = [t.status, t.verificationClicked, includes(t.html, 'Please verify')]
        let rr = ['success', true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('僅frames之url命中且有容器時, 依容器座標點擊(模式B)', async function() {
        this.timeout(180000)
        let t = await fetchWebByPlaywrightHead(svr.url('/cfmanaged'), { maxRetries: 0, postNavigationWaitMs: 800 })
        let r = [t.status, t.verificationClicked]
        let rr = ['success', true]
        assert.strict.deepEqual(r, rr)
    })

    it('僅frames之url命中且無容器時, 改以視窗比例座標點擊(模式B)', async function() {
        this.timeout(180000)
        let t = await fetchWebByPlaywrightHead(svr.url('/cfmanaged-nobox'), { maxRetries: 0, postNavigationWaitMs: 800 })
        let r = [t.status, t.verificationClicked]
        let rr = ['success', true]
        assert.strict.deepEqual(r, rr)
    })

    it('skipVerificationClick=true時不做偵測與點擊', async function() {
        this.timeout(120000)
        let t = await fetchWebByPlaywrightHead(svr.url('/cfchallenge'), {
            maxRetries: 0,
            postNavigationWaitMs: 300,
            skipVerificationClick: true,
        })
        let r = [t.status, t.verificationClicked]
        let rr = ['success', false]
        assert.strict.deepEqual(r, rr)
    })

    it('waitForRedirect=true時走轉址等待路徑', async function() {
        this.timeout(120000)
        let t = await fetchWebByPlaywrightHead(svr.url('/article'), { maxRetries: 0, waitForRedirect: true })
        let r = [t.status, includes(t.html, MARKER)]
        let rr = ['success', true]
        assert.strict.deepEqual(r, rr)
    })

    it('導航失敗時依maxRetries重試後回playwright-error', async function() {
        this.timeout(180000)
        let t = await fetchWebByPlaywrightHead('http://127.0.0.1:1/x', { maxRetries: 1, navigationTimeoutMs: 2000 })
        let r = [t.status, t.reason, t.attempts]
        let rr = ['error', 'playwright-error', 2]
        assert.strict.deepEqual(r, rr)
    })

    it('各選項為非法值時採預設且仍可抓取', async function() {
        this.timeout(120000)
        let t = await fetchWebByPlaywrightHead(svr.url('/article'), {
            maxRetries: 'abc',
            navigationTimeoutMs: -1,
            postNavigationWaitMs: 'x',
            waitForRedirect: 'yes',
            skipVerificationClick: 1,
        })
        let r = [t.status, includes(t.html, MARKER)]
        let rr = ['success', true]
        assert.strict.deepEqual(r, rr)
    })

})
