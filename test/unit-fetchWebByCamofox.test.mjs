import assert from 'assert'
import includes from 'lodash-es/includes.js'
import fetchWebByCamofox from '../src/fetchWebByCamofox.mjs'
import { camofoxInstalled, testCamofox } from './tools/env.mjs'


describe('fetchWebByCamofox', function() {

    describe('fetchWebByCamofox', function() {

        it('非有效字串網址回傳invalid-url', async function() {
            let r = []
            for (let url of [null, undefined, '', 123, {}]) {
                let t = await fetchWebByCamofox(url)
                r.push([t.status, t.reason, t.method, t.attempts])
            }
            let rr = [
                ['error', 'invalid-url', 'camofox', 0],
                ['error', 'invalid-url', 'camofox', 0],
                ['error', 'invalid-url', 'camofox', 0],
                ['error', 'invalid-url', 'camofox', 0],
                ['error', 'invalid-url', 'camofox', 0],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('非http與https網址回傳invalid-url', async function() {
            let r = []
            for (let url of ['abc', 'ftp://a.com/', 'file:///c:/a.html']) {
                let t = await fetchWebByCamofox(url)
                r.push([t.status, t.reason, t.attempts])
            }
            let rr = [
                ['error', 'invalid-url', 0],
                ['error', 'invalid-url', 0],
                ['error', 'invalid-url', 0],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('未安裝@askjo/camofox-browser時回傳camofox-not-found', async function() {
            if (camofoxInstalled) {
                //已安裝時本案例不適用, 跳過以免啟動實體反偵測瀏覽器
                this.skip()
            }
            let t = await fetchWebByCamofox('https://example.com/')
            let r = [t.status, t.reason, t.method, t.attempts]
            let rr = ['error', 'camofox-not-found', 'camofox', 0]
            assert.strict.deepEqual(r, rr)
        })

        it('抓取正常網頁回傳snapshot轉換後之HTML', async function() {
            if (!camofoxInstalled || !testCamofox) {
                this.skip()
            }
            this.timeout(300000)
            let t = await fetchWebByCamofox('https://example.com/', { maxRetries: 0 })
            let r = [
                t.status,
                t.method,
                t.attempts,
                t.snapshotChars > 50,
                includes(t.html, '<article>'),
                includes(t.html, 'Example Domain'),
            ]
            let rr = ['success', 'camofox', 1, true, true, true]
            assert.strict.deepEqual(r, rr)
        })

    })

})
