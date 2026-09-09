import assert from 'assert'
import includes from 'lodash-es/includes.js'
import fetchWebByCamofox from '../src/fetchWebByCamofox.mjs'
import withCamofoxFake from './tools/withCamofoxFake.mjs'
import { isCI, camofoxInstalled } from './tools/env.mjs'


//本檔以假server驅動camofox完整抓取流程, 不啟動真實反偵測瀏覽器。
//仍會spawn一次node載入真實camofox server(因埠已被佔用而立即退出), 故每案例約需1至3秒。
//
//跳過條件有二:
//① 未安裝@askjo/camofox-browser——無安裝位置可spawn, 為功能性前提
//② 位於CI——本檔會佔用固定埠並spawn子行程, 屬本機驗證性質。
//   GitHub Actions會自動設CI=true與GITHUB_ACTIONS=true, 為偵測CI之直接訊號;
//   注意本檔不以Chrome是否存在判斷, 因其流程完全不啟動瀏覽器, 以Chrome為條件屬錯誤耦合

let URL_T = 'https://mp.weixin.qq.com/s/abcdef'

//足量snapshot: totalChars須大於200方視為足夠
let snapOk = {
    totalChars: 1200,
    snapshot: [
        '- heading "流動性溢價的真相" [level=1]',
        '- paragraph: 本週市場焦點在於私募信貸的流動性折價，多家機構重新評估其估值模型。',
        '- paragraph: 分析師指出，流動性溢價只有在不需要流動性時才成立，這是一個結構性的矛盾。',
    ].join('\n'),
}

//內容不足之snapshot
let snapThin = { totalChars: 30, snapshot: '- paragraph: 短' }


describe('fetchWebByCamofox完整流程(假server)', function() {

    before(function() {
        if (!camofoxInstalled || isCI) {
            this.skip()
        }
    })

    it('完整流程成功: 建立tab、取snapshot、關閉tab, 並轉換為HTML', async function() {
        this.timeout(120000)
        await withCamofoxFake({ snapshots: [snapOk] }, async (fake) => {
            let t = await fetchWebByCamofox(URL_T, { port: fake.port, maxRetries: 0, serverStartTimeoutMs: 10000 })
            let r = [
                t.status,
                t.method,
                t.attempts,
                t.snapshotChars,
                t.snapshot === snapOk.snapshot,
                includes(t.html, '<article>'),
                includes(t.html, '流動性溢價的真相'),
                t.htmlLength === t.html.length,
            ]
            let rr = ['success', 'camofox', 1, 1200, true, true, true, true]
            assert.strict.deepEqual(r, rr)
        })
    })

    it('依序呼叫就緒探測、建立tab、取snapshot、關閉tab', async function() {
        this.timeout(120000)
        await withCamofoxFake({ snapshots: [snapOk] }, async (fake) => {
            await fetchWebByCamofox(URL_T, { port: fake.port, maxRetries: 0, serverStartTimeoutMs: 10000 })
            let r = [
                fake.requests[0],
                includes(fake.requests, 'POST /tabs'),
                fake.requests.some((s) => /^GET \/tabs\/tab-1\/snapshot$/.test(s)),
                includes(fake.requests, 'DELETE /tabs/tab-1'),
            ]
            let rr = ['GET /tabs', true, true, true]
            assert.strict.deepEqual(r, rr)
        })
    })

    it('snapshot內容不足時於內部重試, 補足後成功', async function() {
        this.timeout(120000)
        await withCamofoxFake({ snapshots: [snapThin, snapThin, snapOk] }, async (fake) => {
            let t = await fetchWebByCamofox(URL_T, {
                port: fake.port,
                maxRetries: 0,
                serverStartTimeoutMs: 10000,
                snapshotRetries: 3,
                snapshotWaitMs: 50,
            })
            let nSnap = fake.requests.filter((s) => includes(s, '/snapshot')).length
            let r = [t.status, t.snapshotChars, nSnap]
            let rr = ['success', 1200, 3]
            assert.strict.deepEqual(r, rr)
        })
    })

    it('snapshot始終不足時回camofox-empty', async function() {
        this.timeout(120000)
        await withCamofoxFake({ snapshots: [snapThin] }, async (fake) => {
            let t = await fetchWebByCamofox(URL_T, {
                port: fake.port,
                maxRetries: 0,
                serverStartTimeoutMs: 10000,
                snapshotRetries: 1,
                snapshotWaitMs: 50,
            })
            let r = [t.status, t.reason, includes(t.message, 'snapshot empty')]
            let rr = ['error', 'camofox-empty', true]
            assert.strict.deepEqual(r, rr)
        })
    })

    it('建立tab失敗時回camofox-error並帶站方訊息', async function() {
        this.timeout(120000)
        await withCamofoxFake({ failCreate: true }, async (fake) => {
            let t = await fetchWebByCamofox(URL_T, { port: fake.port, maxRetries: 0, serverStartTimeoutMs: 10000 })
            let r = [t.status, t.reason, includes(t.message, 'browser launch failed')]
            let rr = ['error', 'camofox-error', true]
            assert.strict.deepEqual(r, rr)
        })
    })

    it('依maxRetries重試整體流程', async function() {
        this.timeout(180000)
        await withCamofoxFake({ failCreate: true }, async (fake) => {
            let t = await fetchWebByCamofox(URL_T, { port: fake.port, maxRetries: 1, serverStartTimeoutMs: 10000 })
            let nCreate = fake.requests.filter((s) => s === 'POST /tabs').length
            let r = [t.status, t.attempts, nCreate]
            let rr = ['error', 2, 2]
            assert.strict.deepEqual(r, rr)
        })
    })

    it('port、serverStartTimeoutMs、snapshot相關選項未給時採預設值', async function() {
        this.timeout(120000)

        //預設port為19377, 故假server須綁在該埠方能攔截
        await withCamofoxFake({ snapshots: [snapOk], port: 19377 }, async () => {
            let t = await fetchWebByCamofox(URL_T, {})
            let r = [t.status, t.snapshotChars]
            let rr = ['success', 1200]
            assert.strict.deepEqual(r, rr)
        })
    })

    it('server未於期限內就緒時回camofox-error', async function() {
        this.timeout(120000)

        //以notReady之假server佔住該埠: 就緒探測一律回500使輪詢至逾時,
        //同時真實camofox server因埠被佔而無法綁定, 不致啟動實體瀏覽器
        await withCamofoxFake({ notReady: true }, async (fake) => {
            let t = await fetchWebByCamofox(URL_T, { port: fake.port, maxRetries: 0, serverStartTimeoutMs: 1500 })
            let r = [
                t.status,
                t.reason,
                includes(t.message, 'failed to start'),
                fake.requests.every((s) => s === 'GET /tabs'),
            ]
            let rr = ['error', 'camofox-error', true, true]
            assert.strict.deepEqual(r, rr)
        })
    })

})
