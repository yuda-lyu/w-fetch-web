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
            return title
        },
    }
}


describe('extractPageContent', function() {

    it('可見文字達門檻時直接回傳原HTML, 不穿透Shadow DOM', async function() {
        let html = '<html><body><p>' + 'abcde '.repeat(50) + '</p></body></html>'
        let page = mockPage({ content: html, shadow: 'x'.repeat(500), title: 'T' })
        let r = [await extractPageContent(page), page.calls]
        let rr = [html, ['content']]
        assert.strict.deepEqual(r, rr)
    })

    it('可見文字過少時穿透Shadow DOM並重組為article HTML', async function() {
        let html = '<html><body><div></div></body></html>'
        let shadow = 'Paragraph one of the shadow dom content here.\n\nParagraph two of the shadow dom content here.'
        let page = mockPage({ content: html, shadow, title: 'T&t' })
        let r = [await extractPageContent(page), page.calls]
        let rr = [
            '<!DOCTYPE html><html><head><title>T&amp;t</title></head><body><article>' +
            '<p>Paragraph one of the shadow dom content here.</p>\n' +
            '<p>Paragraph two of the shadow dom content here.</p>' +
            '</article></body></html>',
            ['content', 'evaluate', 'title'],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('Shadow DOM內文之HTML特殊字元皆轉義', async function() {
        let html = '<html><body><div></div></body></html>'
        let shadow = 'a<b>&c and this line is long enough to pass the minimum characters check'
        let page = mockPage({ content: html, shadow, title: '' })
        let r = await extractPageContent(page)
        let rr = '<!DOCTYPE html><html><head><title></title></head><body><article>' +
            '<p>a&lt;b&gt;&amp;c and this line is long enough to pass the minimum characters check</p>' +
            '</article></body></html>'
        assert.strict.deepEqual(r, rr)
    })

    it('Shadow DOM內文過短時仍回傳原HTML', async function() {
        let html = '<html><body><div></div></body></html>'
        let page = mockPage({ content: html, shadow: 'too short', title: 'T' })
        let r = [await extractPageContent(page), page.calls]
        let rr = [html, ['content', 'evaluate']]
        assert.strict.deepEqual(r, rr)
    })

    it('Shadow DOM無內文時仍回傳原HTML', async function() {
        let html = '<html><body><div></div></body></html>'
        let page = mockPage({ content: html, shadow: '', title: 'T' })
        let r = [await extractPageContent(page), page.calls]
        let rr = [html, ['content', 'evaluate']]
        assert.strict.deepEqual(r, rr)
    })

})
