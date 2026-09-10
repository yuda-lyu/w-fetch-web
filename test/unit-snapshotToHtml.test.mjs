import assert from 'assert'
import snapshotToHtml from '../src/snapshotToHtml.mjs'
import { snapshotToHtml as reExported } from '../src/fetchWebByCamofox.mjs'
import estimateVisibleText from '../src/estimateVisibleText.mjs'
import inspectHtml from '../src/inspectHtml.mjs'


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


describe('兩種合成物之形狀差異', function() {

    //本套件有兩處會合成內容, 且形狀不同——差異剛好落在判識器讀得到的欄位上:
    //  snapshotToHtml(camofox)      標題同時放進<title>與<body><h1>, 故**計入**可見文字
    //  extractPageContent(playwright) 標題只放進<head><title>, 故**不計入**可見文字
    //
    //兩者都以contentKind='synthesized'交給inspectHtml, 但看可見文字的判識器
    //(platform wrapper與empty)對同一份內容會得到不同結果。
    //camofox階目前inspect為false(見buildPlan)故不影響, 本測試在於: 若日後開啟該階判識,
    //此差異即成為行為分歧, 屆時本測試會指出差異之所在而非讓它靜默生效
    it('camofox合成物之標題計入可見文字, playwright合成物則否', function() {
        let title = 'Access Denied'
        let body = 'hello world'
        let camofox = snapshotToHtml('- paragraph: ' + body, title)
        let playwright = '<!DOCTYPE html><html><head><title>' + title + '</title></head><body><article><p>' + body + '</p></article></body></html>'
        let r = [estimateVisibleText(camofox), estimateVisibleText(playwright)]
        let rr = ['Access Denied hello world', 'hello world']
        assert.strict.deepEqual(r, rr)
    })

    it('內容量落在閘門邊界時, 兩種合成物之判定確實相反', function() {

        //body取497字: playwright側之可見文字即497(低於SPARSE_VISIBLE_MAX之500),
        //camofox側因標題「MSN」與空白亦計入而成為501(高於閘門)。
        //於是同一份內容, 一邊被判為wrapper殼頁而升級, 另一邊被當成正常內容放行
        let title = 'MSN'
        let body = 'x'.repeat(497)
        let camofox = snapshotToHtml('- paragraph: ' + body, title)
        let playwright = '<!DOCTYPE html><html><head><title>' + title + '</title></head><body><article><p>' + body + '</p></article></body></html>'
        let opt = { contentKind: 'synthesized' }
        let r = [
            estimateVisibleText(playwright).length,
            inspectHtml(playwright, opt).type,
            estimateVisibleText(camofox).length,
            inspectHtml(camofox, opt).type,
        ]
        let rr = [497, 'redirect', 501, 'pass']
        assert.strict.deepEqual(r, rr)
    })

})
