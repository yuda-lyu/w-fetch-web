import assert from 'assert'
import snapshotToHtml from '../src/snapshotToHtml.mjs'
import { snapshotToHtml as reExported } from '../src/fetchWebByCamofox.mjs'


//依實作組出預期HTML外殼
let wrap = (title, inner) => {
    return '<!DOCTYPE html><html><head><title>' + title + '</title></head>' +
        '<body><article><h1>' + title + '</h1>\n' + inner + '</article></body></html>'
}


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

    it('option標記(微信附註)轉為段落', function() {
        let r = snapshotToHtml('- option "本文為作者個人觀點"\n- \'option "另一則附註"', 'T')
        let rr = wrap('T', '<p>本文為作者個人觀點</p>\n<p>另一則附註</p>')
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


describe('snapshotToHtml之相容匯出', function() {

    it('由fetchWebByCamofox re-export者與獨立模組為同一函式', function() {
        let r = reExported === snapshotToHtml
        let rr = true
        assert.strict.deepEqual(r, rr)
    })

})
