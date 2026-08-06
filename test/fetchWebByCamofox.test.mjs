import assert from 'assert'
import { existsSync } from 'fs'
import { resolve } from 'path'
import fetchWebByCamofox, { snapshotToHtml } from '../src/fetchWebByCamofox.mjs'


//@askjo/camofox-browser為選用相依, 未安裝時fetchWebByCamofox會回傳camofox-not-found
let camofoxInstalled = existsSync(resolve(process.cwd(), 'node_modules/@askjo/camofox-browser'))


//依實作組出預期HTML外殼
let wrap = (title, inner) => {
    return '<!DOCTYPE html><html><head><title>' + title + '</title></head>' +
        '<body><article><h1>' + title + '</h1>\n' + inner + '</article></body></html>'
}


describe('fetchWebByCamofox', function() {

    describe('snapshotToHtml', function() {

        it('各類語意元素轉為對應HTML標籤, 連結與結構容器標記跳過', function() {
            let snapshot = [
                '- heading "Title A" [level=2]',
                '- paragraph: hello world',
                '- listitem: item one',
                '- strong: bold text',
                '- emphasis: em text',
                '- text: "some text"',
                '- img "alt text"',
                '- link "click me"',
                '- /url: https://a.com/',
                '- button "OK"',
                '- navigation',
                '- plain line here',
            ].join('\n')
            let r = snapshotToHtml(snapshot, 'Title A')
            let rr = wrap('Title A', [
                '<h2>Title A</h2>',
                '<p>hello world</p>',
                '<li>item one</li>',
                '<strong>bold text</strong>',
                '<em>em text</em>',
                '<span>some text</span>',
                '<img alt="alt text">',
                '<p>plain line here</p>',
            ].join('\n'))
            assert.strict.deepEqual(r, rr)
        })

        it('內文與標題之HTML特殊字元皆轉義', function() {
            let r = snapshotToHtml('- paragraph: a<b>&c', 'x&y')
            let rr = wrap('x&amp;y', '<p>a&lt;b&gt;&amp;c</p>')
            assert.strict.deepEqual(r, rr)
        })

        it('無內容之行皆略過', function() {
            let r = snapshotToHtml('- paragraph\n- listitem\n   \n', 'T')
            let rr = wrap('T', '')
            assert.strict.deepEqual(r, rr)
        })

        it('非字串輸入視為空字串', function() {
            let r = [
                snapshotToHtml(null),
                snapshotToHtml(undefined, null),
                snapshotToHtml(123, 456),
            ]
            let rr = [
                wrap('', ''),
                wrap('', ''),
                wrap('', ''),
            ]
            assert.strict.deepEqual(r, rr)
        })

    })

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

    })

})
