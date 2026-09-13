import assert from 'assert'
import map from 'lodash-es/map.js'
import fetchWeb, { defaultAdapters } from '../src/fetchWeb.mjs'
import { htmlGelonghui, URL_MSN, msnApiOk } from './tools/fixtures.mjs'


//內建 adapter 清單之組成與 opt.useDefaultAdapters。
//
//缺口形狀：此前內建清單恆被附加於 opt.adapters 之後, 呼叫端只能「逐站以同網域 adapter 蓋過」,
//而無法停用整份或剔除其中一個——要讓某站改回走 Readability, 只能註冊一個回 status:'skip'
//的假 fetch 去搶先命中, 形同繞路。內建清單由兩個增為三個之後, 這個缺口的影響隨之擴大。
//
//被 fake 掉的是抓取層（opt._fetchers）, 本檔驗的是 adapter 清單如何組成, 不涉及真實站台
let URL_G = 'https://www.gelonghui.com/p/123456'
let mkCurlHtml = (html) => async () => ({ status: 'success', html, method: 'curl' })
let SHELL = '<html><head><title>MSN</title></head><body><script>' + 'v'.repeat(6000) + '</script></body></html>'


describe('內建adapter清單與useDefaultAdapters', function() {

    it('內建清單之組成、順序與凍結', function() {
        let r = [
            map(defaultAdapters, (a) => a.id),
            Object.isFrozen(defaultAdapters),
            defaultAdapters.every((a) => Object.isFrozen(a)),
        ]
        let rr = [['gelonghui', 'bloomberg', 'msn'], true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('預設附加內建清單', async function() {
        let t = await fetchWeb(URL_G, { useShowLog: false, method: 'curl', _fetchers: { curl: mkCurlHtml(htmlGelonghui('articleDetail')) } })
        let r = [t.status, t.title]
        let rr = ['success', '流動性溢價的真相']
        assert.strict.deepEqual(r, rr)
    })

    it('useDefaultAdapters:false時不附加內建清單', async function() {

        //內建gelonghui不被諮詢, 改走Readability; 該fixture之正文只在script內, Readability取不到
        let t = await fetchWeb(URL_G, { useShowLog: false, method: 'curl', useDefaultAdapters: false, _fetchers: { curl: mkCurlHtml(htmlGelonghui('articleDetail')) } })
        let r = [t.status, t.reason]
        let rr = ['error', 'empty-content']
        assert.strict.deepEqual(r, rr)
    })

    it('useDefaultAdapters:false時, msn網址不再有adapter階', async function() {
        let n = { curl: 0, headless: 0 }
        let fs = {
            curl: async () => {
                n.curl += 1
                return { status: 'success', html: JSON.stringify(msnApiOk), method: 'curl' }
            },
            playwrightHeadless: async () => {
                n.headless += 1
                return { status: 'success', html: SHELL, method: 'playwright-headless' }
            },
            playwrightHead: async () => ({ status: 'success', html: SHELL, method: 'playwright-headed' }),
            camofox: async () => ({ status: 'error', reason: 'camofox-empty', message: 'x', method: 'camofox' }),
        }
        let t = await fetchWeb(URL_MSN, { useShowLog: false, useDefaultAdapters: false, _fetchers: fs })
        let r = [t.attempts[0].method, n.curl, n.headless]
        let rr = ['playwright-headless', 0, 1]
        assert.strict.deepEqual(r, rr)
    })

    it('配合匯出之defaultAdapters可剔除其中一個而保留其餘', async function() {
        let adapters = defaultAdapters.filter((a) => a.id !== 'msn')
        let tG = await fetchWeb(URL_G, { useShowLog: false, method: 'curl', useDefaultAdapters: false, adapters, _fetchers: { curl: mkCurlHtml(htmlGelonghui('articleDetail')) } })
        let n = 0
        let fs = {
            curl: async () => {
                n += 1
                return { status: 'success', html: JSON.stringify(msnApiOk), method: 'curl' }
            },
            playwrightHeadless: async () => ({ status: 'success', html: SHELL, method: 'playwright-headless' }),
            playwrightHead: async () => ({ status: 'success', html: SHELL, method: 'playwright-headed' }),
            camofox: async () => ({ status: 'error', reason: 'camofox-empty', message: 'x', method: 'camofox' }),
        }
        let tM = await fetchWeb(URL_MSN, { useShowLog: false, useDefaultAdapters: false, adapters, _fetchers: fs })
        let r = [tG.title, tM.attempts[0].method, n]
        let rr = ['流動性溢價的真相', 'playwright-headless', 0]
        assert.strict.deepEqual(r, rr)
    })

    it('useDefaultAdapters為非布林時採預設true', async function() {
        let r = []
        for (let v of ['false', 0, null, undefined, {}]) {
            let t = await fetchWeb(URL_G, { useShowLog: false, method: 'curl', useDefaultAdapters: v, _fetchers: { curl: mkCurlHtml(htmlGelonghui('articleDetail')) } })
            r.push(t.title)
        }
        let rr = map([1, 2, 3, 4, 5], () => '流動性溢價的真相')
        assert.strict.deepEqual(r, rr)
    })

})
