import assert from 'assert'
import extractPageContent from '../src/extractPageContent.mjs'


//以stub模擬Playwright之page, 僅需content、evaluate、title三個方法, 並記錄呼叫順序
let mockPage = ({ content, shadow = '', title = '' }) => {
    let calls = []
    return {
        calls,
        content: async () => {
            calls.push('content')
            return content
        },
        evaluate: async () => {
            calls.push('evaluate')
            return shadow
        },
        title: async () => {
            calls.push('title')
            if (title instanceof Error) {
                throw title
            }
            return title
        },
    }
}


describe('extractPageContent', function() {

    it('可見文字達門檻時直接回傳原HTML, 不穿透Shadow DOM', async function() {
        let html = '<html><body><p>' + 'abcde '.repeat(50) + '</p></body></html>'
        let page = mockPage({ content: html, shadow: 'x'.repeat(500), title: 'T' })
        let r = [await extractPageContent(page), page.calls]
        let rr = [{ html, contentKind: 'raw' }, ['content']]
        assert.strict.deepEqual(r, rr)
    })

    it('可見文字過少時穿透Shadow DOM並重組為article HTML', async function() {
        let html = '<html><body><div></div></body></html>'
        let shadow = 'Paragraph one of the shadow dom content here.\n\nParagraph two of the shadow dom content here.'
        let page = mockPage({ content: html, shadow, title: 'T&t' })
        let r = [await extractPageContent(page), page.calls]
        let rr = [
            {
                html: '<!DOCTYPE html><html><head><title>T&amp;t</title></head><body><article>' +
                    '<p>Paragraph one of the shadow dom content here.</p>\n' +
                    '<p>Paragraph two of the shadow dom content here.</p>' +
                    '</article></body></html>',
                contentKind: 'synthesized',
            },
            ['content', 'evaluate', 'title'],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('Shadow DOM內文之HTML特殊字元皆轉義', async function() {
        let html = '<html><body><div></div></body></html>'
        let shadow = 'a<b>&c and this line is long enough to pass the minimum characters check'
        let page = mockPage({ content: html, shadow, title: '' })
        let r = await extractPageContent(page)
        let rr = {
            html: '<!DOCTYPE html><html><head><title></title></head><body><article>' +
                '<p>a&lt;b&gt;&amp;c and this line is long enough to pass the minimum characters check</p>' +
                '</article></body></html>',
            contentKind: 'synthesized',
        }
        assert.strict.deepEqual(r, rr)
    })

    it('Shadow DOM內文過短時仍回傳原HTML', async function() {
        let html = '<html><body><div></div></body></html>'
        let page = mockPage({ content: html, shadow: 'too short', title: 'T' })
        let r = [await extractPageContent(page), page.calls]
        let rr = [{ html, contentKind: 'raw' }, ['content', 'evaluate']]
        assert.strict.deepEqual(r, rr)
    })

    it('Shadow DOM無內文時仍回傳原HTML', async function() {
        let html = '<html><body><div></div></body></html>'
        let page = mockPage({ content: html, shadow: '', title: 'T' })
        let r = [await extractPageContent(page), page.calls]
        let rr = [{ html, contentKind: 'raw' }, ['content', 'evaluate']]
        assert.strict.deepEqual(r, rr)
    })

    it('三個出口各自標明內容形態', async function() {

        //contentKind由本函數決定, 因為只有它知道走了哪個出口;
        //下游(runPlaywright至adapt至runPlan至inspectHtml)一路傳遞而不重新推測
        let long = '<html><body><p>' + 'abcde '.repeat(50) + '</p></body></html>'
        let short = '<html><body><div></div></body></html>'
        let shadowOk = 'This shadow text is long enough to pass the fifty character minimum check.'
        let r = [
            (await extractPageContent(mockPage({ content: long, shadow: shadowOk }))).contentKind,
            (await extractPageContent(mockPage({ content: short, shadow: 'too short' }))).contentKind,
            (await extractPageContent(mockPage({ content: short, shadow: shadowOk }))).contentKind,
        ]
        let rr = ['raw', 'raw', 'synthesized']
        assert.strict.deepEqual(r, rr)
    })

    it('取標題失敗時以空標題合成, 不使整支流程失敗', async function() {

        //page.title()於導航中或頁面關閉時會reject, 該情形只該讓標題留空而非讓抓取失敗
        let short = '<html><body><div></div></body></html>'
        let shadowOk = 'This shadow text is long enough to pass the fifty character minimum check.'
        let page = mockPage({ content: short, shadow: shadowOk, title: new Error('page closed') })
        let t = await extractPageContent(page)
        let r = [t.contentKind, t.html.includes('<title></title>'), page.calls]
        let rr = ['synthesized', true, ['content', 'evaluate', 'title']]
        assert.strict.deepEqual(r, rr)
    })

})
