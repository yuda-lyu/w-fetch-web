import assert from 'assert'
import map from 'lodash-es/map.js'
import fetchWeb, { inspectHtml } from '../src/fetchWeb.mjs'
import { htmlArticle } from './tools/serverForTest.mjs'


//補齊覆蓋率量測後仍為零執行之分支
//以opt._fetchers驅動, 不啟動真實瀏覽器

let mk = (method, result) => async () => ({ method, ...result })
let ok = (html, extra = {}) => ({ status: 'success', html, ...extra })
let URL_PLAIN = 'https://example.com/article'
let run = (fs, extra = {}) => fetchWeb(URL_PLAIN, { showLog: false, _fetchers: fs, ...extra })


describe('剩餘分支', function() {

    describe('inspectHtml 未覆蓋之偵測器', function() {

        it('同時含captcha與challenge且可見文字極少, 判generic CAPTCHA', function() {
            let t = inspectHtml('<html><head><title>x</title></head><body><p>please solve the captcha to pass this challenge</p></body></html>')
            let r = [t.pass, t.type, t.message]
            let rr = [false, 'captcha', 'generic CAPTCHA']
            assert.strict.deepEqual(r, rr)
        })

        it('內容量足夠時不判generic CAPTCHA, 且有無article標籤皆然', function() {

            //R14前之判準以「不含<article>」為豁免條件, 使真挑戰頁只要含該標籤即漏判。
            //改以內容量為分野後, 兩種形狀的正常文章都放行, 而豁免不再與標籤有關
            let body = '<p>this article explains captcha and challenge design in depth. </p>' +
                '<p>' + 'it continues with enough sentences, commas and length that it reads as a genuine article body rather than boilerplate. '.repeat(5) + '</p>'
            let r = [
                inspectHtml('<html><head><title>x</title></head><body><article>' + body + '</article></body></html>').type,
                inspectHtml('<html><head><title>x</title></head><body>' + body + '</body></html>').type,
            ]
            let rr = ['pass', 'pass']
            assert.strict.deepEqual(r, rr)
        })

        it('含article且可見文字極少時仍判generic CAPTCHA', function() {

            //鎖住R14之修正: <article>標籤不再是豁免條件, 否則真挑戰頁只要帶該標籤即漏判
            let html = '<html><head><title>x</title></head><body><article><p>captcha challenge</p></article></body></html>'
            let r = inspectHtml(html).type
            let rr = 'captcha'
            assert.strict.deepEqual(r, rr)
        })

        it('X與Twitter之錯誤頁判captcha', function() {
            let r = map([
                '<html><head><title>x</title></head><body><p>something went wrong on x.com</p></body></html>',
                '<html><head><title>x</title></head><body><p>something went wrong on twitter.com</p></body></html>',
            ], (h) => [inspectHtml(h).type, inspectHtml(h).message])
            let rr = [['captcha', 'X/Twitter error page'], ['captcha', 'X/Twitter error page']]
            assert.strict.deepEqual(r, rr)
        })

        it('Google News之c-wiz包裝頁判redirect', function() {
            let html = '<html><head><title>x</title></head><body><c-wiz>from news.google.com</c-wiz><p>' + 'z'.repeat(300) + '</p></body></html>'
            let t = inspectHtml(html)
            let r = [t.pass, t.type, t.message]
            let rr = [false, 'redirect', 'Google News wrapper']
            assert.strict.deepEqual(r, rr)
        })

    })

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
            let t = await fetchWeb('https://mp.weixin.qq.com/s/abc', { showLog: false, _fetchers: fs })
            let r = [t.status, t.snapshot]
            let rr = ['success', '- heading "abc" [level=1]']
            assert.strict.deepEqual(r, rr)
        })

        it('camofox回傳之snapshot於parse=false時亦保留', async function() {
            let fs = { camofox: mk('camofox', ok(htmlArticle, { snapshot: '- heading "abc" [level=1]' })) }
            let t = await fetchWeb('https://mp.weixin.qq.com/s/abc', { showLog: false, parse: false, _fetchers: fs })
            let r = [t.status, t.snapshot, t.html === htmlArticle]
            let rr = ['success', '- heading "abc" [level=1]', true]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('Readability解析拋錯', function() {

        it('JSDOM或Readability拋錯時轉為parse-error, 不使fetchWeb reject', async function() {

            //html之toString拋錯, JSDOM於建構時取字串即失敗, 驅動_parseArticle之catch。
            //須同時關閉inspect, 否則inspectHtml會先以isestr判非字串而回empty, 走不到解析
            let bad = {
                toString: () => {
                    throw new Error('jsdom boom')
                },
            }
            let fs = { curl: async () => ({ method: 'curl', status: 'success', html: bad }) }
            let t = 'no-reject'
            let out = null
            try {
                out = await fetchWeb(URL_PLAIN, { showLog: false, method: 'curl', inspect: false, _fetchers: fs })
            }
            catch (err) {
                t = err.message
            }
            let r = [t, out === null ? 'threw' : out.status, out === null ? '' : out.reason]
            let rr = ['no-reject', 'error', 'parse-error']
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
