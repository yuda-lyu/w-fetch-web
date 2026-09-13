import assert from 'assert'
import map from 'lodash-es/map.js'
import fetchWeb from '../src/fetchWeb.mjs'
import parseArticle from '../src/parseArticle.mjs'
import { htmlArticle } from './tools/serverForTest.mjs'


//fetchWeb之調度行為: 判識結果如何影響升級、欄位如何傳遞、錯誤如何收斂、訊息如何輸出。
//以opt._fetchers驅動, 不啟動真實瀏覽器。
//
//階梯升級之主體規格於 unit-escalation.test.mjs; 本檔為其餘調度面向,
//兩檔之假抓取函數簽章不同(該檔支援依序回傳多個結果, 此檔為單發), 故未合併
//
//本檔原名 unit-remainingBranches, 檔頭寫的是「補齊覆蓋率量測後仍為零執行之分支」——
//以覆蓋率數字而非規格為組織原則, 於是inspectHtml的規格被切在兩個檔。
//該區塊已移回 unit-inspectHtml, 其餘依其真實主題重新命名

let mk = (method, result) => async () => ({ method, ...result })
let ok = (html, extra = {}) => ({ status: 'success', html, ...extra })
let URL_PLAIN = 'https://example.com/article'
let run = (fs, extra = {}) => fetchWeb(URL_PLAIN, { useShowLog: false, _fetchers: fs, ...extra })


describe('fetchWeb之調度行為', function() {

    describe('各判識型別皆觸發續下一階', function() {

        //以能產生各type之HTML驅動: 前一階被判該type後, camofox階(guard=true)是否被呼叫
        let htmlOf = {
            captcha: '<html><head><title>Just a moment</title></head><body></body></html>',
            verify: '<html><head><title>x</title></head><body><p>secitptpage wx.qq.com</p></body></html>',
            redirect: '<html><head><meta http-equiv="refresh" content="0;url=https://a.com/b"><title>x</title></head><body></body></html>',
            empty: '<html><head><title>x</title></head><body><script>' + 'v'.repeat(6000) + '</script></body></html>',
        }

        it('captcha、verify、redirect、empty四種型別皆觸發升級至camofox', async function() {
            let r = []
            for (let k of ['captcha', 'verify', 'redirect', 'empty']) {
                let n = 0
                let fs = {
                    curl: mk('curl', ok(htmlOf[k])),
                    playwrightHeadless: mk('playwright-headless', ok(htmlOf[k])),
                    playwrightHead: mk('playwright-headed', ok(htmlOf[k])),
                    camofox: async () => {
                        n += 1
                        return { method: 'camofox', ...ok(htmlArticle) }
                    },
                }
                let t = await run(fs)
                r.push([k, t.attempts[0].type, n])
            }
            let rr = [
                ['captcha', 'captcha', 1],
                ['verify', 'verify', 1],
                ['redirect', 'redirect', 1],
                ['empty', 'empty', 1],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('前一階成功並解析成功時即回傳, 不再執行後續階', async function() {
            let n = 0
            let fs = {
                curl: mk('curl', ok(htmlOf.captcha)),
                playwrightHeadless: mk('playwright-headless', ok(htmlArticle)),
                playwrightHead: mk('playwright-headed', ok(htmlArticle)),
                camofox: async () => {
                    n += 1
                    return { method: 'camofox', ...ok(htmlArticle) }
                },
            }
            let t = await run(fs)
            let r = [t.method, n]
            let rr = ['playwright-headless', 0]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('snapshot欄位傳遞', function() {

        it('camofox回傳之snapshot於parse=true時保留至輸出', async function() {
            let fs = { camofox: mk('camofox', ok(htmlArticle, { snapshot: '- heading "abc" [level=1]' })) }
            let t = await fetchWeb('https://mp.weixin.qq.com/s/abc', { useShowLog: false, _fetchers: fs })
            let r = [t.status, t.snapshot]
            let rr = ['success', '- heading "abc" [level=1]']
            assert.strict.deepEqual(r, rr)
        })

        it('camofox回傳之snapshot於parse=false時亦保留', async function() {
            let fs = { camofox: mk('camofox', ok(htmlArticle, { snapshot: '- heading "abc" [level=1]' })) }
            let t = await fetchWeb('https://mp.weixin.qq.com/s/abc', { useShowLog: false, parse: false, _fetchers: fs })
            let r = [t.status, t.snapshot, t.html === htmlArticle]
            let rr = ['success', '- heading "abc" [level=1]', true]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('Readability解析拋錯', function() {

        //html之toString拋錯, JSDOM於建構時取字串即失敗, 驅動parseArticle之catch
        let mkBadHtml = () => ({
            toString: () => {
                throw new Error('jsdom boom')
            },
        })

        it('parseArticle攔下JSDOM或Readability之拋錯, 轉為parse-error', async function() {

            //直接對parseArticle驗: 此前是經fetchWeb以「抓取器回傳非字串html」驅動,
            //但那條路徑現在會先被抓取端契約攔下(見下一條), 走不到解析器。
            //解析器自身的錯誤邊界仍須有測試, 故改為直接呼叫
            let t = 'no-reject'
            let out = null
            try {
                out = await parseArticle(mkBadHtml(), URL_PLAIN, null)
            }
            catch (err) {
                t = err.message
            }
            let r = [t, out?.success, out?.reason]
            let rr = ['no-reject', false, 'parse-error']
            assert.strict.deepEqual(r, rr)
        })

        it('抓取器回傳非字串html時於抓取邊界即攔下, 不使fetchWeb reject', async function() {

            //歸因為fetcher-error而非parse-error: 問題出在抓取器違反輸出契約,
            //不是解析器解不出來。此前無此檢核, 該值會一路流到JSDOM才炸
            let fs = { curl: async () => ({ method: 'curl', status: 'success', html: mkBadHtml() }) }
            let t = 'no-reject'
            let out = null
            try {
                out = await fetchWeb(URL_PLAIN, { useShowLog: false, method: 'curl', inspect: false, _fetchers: fs })
            }
            catch (err) {
                t = err.message
            }
            let r = [t, out?.status, out?.reason]
            let rr = ['no-reject', 'error', 'fetcher-error']
            assert.strict.deepEqual(r, rr)
        })

        it('抓取器拋錯或reject時亦不使fetchWeb reject', async function() {

            //fetchWeb之JSDoc明載「本函數不會reject」, 但此前抓取器拋錯會直接穿透——
            //四個內建抓取器不拋錯故不出事, 而opt._fetchers是文件化的測試接縫,
            //adapter之fetch掛點更是呼叫端程式碼
            let r = []
            for (let fn of [async () => {
                throw new Error('boom')
            }, () => Promise.reject(new Error('rej'))]) {
                let out = null
                let t = 'no-reject'
                try {
                    out = await fetchWeb(URL_PLAIN, { useShowLog: false, method: 'curl', _fetchers: { curl: fn } })
                }
                catch (err) {
                    t = err.message
                }
                r.push([t, out?.status, out?.reason])
            }
            let rr = [['no-reject', 'error', 'fetcher-error'], ['no-reject', 'error', 'fetcher-error']]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('showLog輸出路徑', function() {

        it('showLog預設為true且輸出階梯過程, 不影響結果', async function() {
            let logs = []
            let warns = []
            let oL = console.log
            let oW = console.warn
            console.log = (...a) => logs.push(a.join(' '))
            console.warn = (...a) => warns.push(a.join(' '))
            let t = null
            try {
                let fs = {
                    curl: mk('curl', ok('<html><head><title>Just a moment</title></head><body></body></html>')),
                    playwrightHeadless: mk('playwright-headless', ok(htmlArticle)),
                }
                t = await fetchWeb(URL_PLAIN, { _fetchers: fs })
            }
            finally {
                console.log = oL
                console.warn = oW
            }
            let r = [
                t.status,
                logs.some((s) => s.includes('trying curl')),
                warns.some((s) => s.includes('blocked')),
            ]
            let rr = ['success', true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('showLog開啟時各網域分流與轉址提取皆有訊息', async function() {
            let logs = []
            let oL = console.log
            let oW = console.warn
            console.log = (...a) => logs.push(a.join(' '))
            console.warn = () => {}
            try {
                let fs = {
                    curl: mk('curl', ok(htmlArticle)),
                    playwrightHeadless: mk('playwright-headless', ok(htmlArticle)),
                    playwrightHead: mk('playwright-headed', ok(htmlArticle)),
                    camofox: mk('camofox', ok(htmlArticle)),
                }
                await fetchWeb('https://mp.weixin.qq.com/s/a', { _fetchers: fs })
                await fetchWeb('https://www.wsj.com/articles/a', { _fetchers: fs })
                await fetchWeb('https://news.google.com/articles/a', { _fetchers: fs })
                await fetchWeb('https://www.msn.com/en-us/a/ar-A1', { _fetchers: fs })
                await fetchWeb('https://www.linkedin.com/redir/redirect?url=' + encodeURIComponent(URL_PLAIN), { _fetchers: fs })
            }
            finally {
                console.log = oL
                console.warn = oW
            }
            let r = map([
                'camofox-required domain',
                'headed-required domain',
                'JS redirect domain',
                'headless-required SPA domain',
                'redirect param extracted',
            ], (s) => logs.some((v) => v.includes(s)))
            let rr = [true, true, true, true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('showLog開啟時, 抓取失敗、解析失敗、指定方法被攔皆有警告訊息', async function() {
            let warns = []
            let oL = console.log
            let oW = console.warn
            console.log = () => {}
            console.warn = (...a) => warns.push(a.join(' '))
            try {

                //抓取失敗
                await fetchWeb(URL_PLAIN, {
                    _fetchers: {
                        curl: async () => ({ method: 'curl', status: 'error', reason: 'http-error', message: 'HTTP 500' }),
                        playwrightHeadless: mk('playwright-headless', ok(htmlArticle)),
                    },
                })

                //通過inspect但解析失敗而續升級
                await fetchWeb(URL_PLAIN, {
                    _fetchers: {
                        curl: mk('curl', ok('<html><head><title>x</title></head><body><p>short</p></body></html>')),
                        playwrightHeadless: mk('playwright-headless', ok(htmlArticle)),
                    },
                })

                //指定方法時被inspect攔下
                await fetchWeb(URL_PLAIN, {
                    method: 'curl',
                    _fetchers: { curl: mk('curl', ok('<html><head><title>Just a moment</title></head><body></body></html>')) },
                })
            }
            finally {
                console.log = oL
                console.warn = oW
            }
            let r = map([
                'failed: HTTP 500',
                'parse failed',
                'curl blocked',
            ], (s) => warns.some((v) => v.includes(s)))
            let rr = [true, true, true]
            assert.strict.deepEqual(r, rr)
        })

    })

})
