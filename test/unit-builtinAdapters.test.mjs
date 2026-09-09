import assert from 'assert'
import includes from 'lodash-es/includes.js'
import { defaultAdapters } from '../src/fetchWeb.mjs'
import { htmlGelonghui, htmlBloomberg, storyOk } from './tools/fixtures.mjs'


//內建adapter之parse即 src/parseGelonghui.mjs 與 src/parseBloomberg.mjs, 經defaultAdapters取得
let parseGelonghui = defaultAdapters[0].parse
let parseBloomberg = defaultAdapters[1].parse

let URL_G = 'https://www.gelonghui.com/p/123456'
let URL_B = 'https://www.bloomberg.com/news/articles/2026-01-01/abc'


describe('內建站台adapter', function() {

    describe('gelonghui', function() {

        it('由articleDetail欄位取出內文並反轉義', function() {
            let t = parseGelonghui(htmlGelonghui('articleDetail'), URL_G)
            let r = [
                t.success,
                includes(t.content, '流動性溢價'),
                includes(t.content, '結語'),
                t.contentLength === t.content.length,
            ]
            let rr = [true, true, true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('由dtbDetail欄位(快訊)取出內文', function() {
            let t = parseGelonghui(htmlGelonghui('dtbDetail'), URL_G)
            let r = [t.success, includes(t.content, '流動性溢價')]
            let rr = [true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('兩欄位並存且content非首個鍵時, dtbDetail優先(欄位順序即優先序)', function() {
            let html = '<html><head><title>t - 格隆匯</title></head><body><script>window.__NUXT__={state:{' +
                'dtbDetail:{id:1,content:"' + 'D'.repeat(60) + '"},' +
                'articleDetail:{id:2,content:"' + 'A'.repeat(60) + '"}' +
                '}}</script></body></html>'
            let t = parseGelonghui(html, URL_G)
            let r = [t.success, t.content[0]]
            let rr = [true, 'D']
            assert.strict.deepEqual(r, rr)
        })

        //已知缺陷, 待業主裁示後再修:
        //解析regex為 <field>:\{[\s\S]*?(?:,|\{)content:"..."，要求content之前緊鄰逗號或左大括號。
        //當content是該物件的「首個鍵」時, 開頭的左大括號已被 :\{ 消耗, 惰性比對遂跨越物件邊界,
        //抓到後面另一個欄位的content。實測: dtbDetail:{content:"DDD"},articleDetail:{content:"AAA"}
        //會回傳 "AAA"。後果為靜默取到錯誤欄位之內文, 不會報錯。
        //未逕行修正之因: 無法取得真實gelonghui頁面驗證其state結構,
        //收緊regex(如限制中間不得含大括號)可能反而使真實頁面解析失敗。
        it.skip('[已知缺陷]content為首個鍵時, 不應跨物件抓到其他欄位之內容', function() {
            let html = '<html><head><title>t - 格隆匯</title></head><body><script>window.__NUXT__={state:{' +
                'dtbDetail:{content:"' + 'D'.repeat(60) + '"},' +
                'articleDetail:{content:"' + 'A'.repeat(60) + '"}' +
                '}}</script></body></html>'
            let t = parseGelonghui(html, URL_G)
            let r = t.content[0]
            let rr = 'D'
            assert.strict.deepEqual(r, rr)
        })

        it('剝除HTML標籤與實體並壓縮空白', function() {
            let html = htmlGelonghui('articleDetail', '<p>甲</p>&nbsp;&amp;<div>乙</div>   <span>' + '丙'.repeat(60) + '</span>')
            let t = parseGelonghui(html, URL_G)
            let r = [
                includes(t.content, '<'),
                includes(t.content, '&nbsp;'),
                includes(t.content, '  '),
                includes(t.content, '甲 乙'),
            ]
            let rr = [false, false, false, true]
            assert.strict.deepEqual(r, rr)
        })

        it('反轉義涵蓋雙引號與反斜線', function() {
            let html = htmlGelonghui('articleDetail', '前段\\"引號\\"與反斜線\\\\結尾' + '尾'.repeat(60))
            let t = parseGelonghui(html, URL_G)
            let r = [t.success, includes(t.content, '"引號"'), includes(t.content, '\\')]
            let rr = [true, true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('標題剝除尾端站名', function() {
            let t = parseGelonghui(htmlGelonghui('articleDetail'), URL_G)
            let r = t.title
            let rr = '流動性溢價的真相'
            assert.strict.deepEqual(r, rr)
        })

        it('內文未達MIN_CONTENT時回empty-content', function() {
            let t = parseGelonghui(htmlGelonghui('articleDetail', '太短'), URL_G)
            let r = [t.success, t.reason, includes(t.message, 'content too short')]
            let rr = [false, 'empty-content', true]
            assert.strict.deepEqual(r, rr)
        })

        it('找不到任何欄位時回custom-parser-miss', function() {
            let html = '<html><head><title>t - 格隆匯</title></head><body><p>沒有NUXT state</p></body></html>'
            let t = parseGelonghui(html, URL_G)
            let r = [t.success, t.reason, includes(t.message, 'gelonghui')]
            let rr = [false, 'custom-parser-miss', true]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('bloomberg', function() {

        it('由__NEXT_DATA__取出story內文, 段落以兩換行相接', function() {
            let t = parseBloomberg(htmlBloomberg(storyOk), URL_B)
            let r = [
                t.success,
                includes(t.content, '私募信貸的流動性折價正在擴大'),
                includes(t.content, '\n\n'),
                t.contentLength === t.content.length,
            ]
            let rr = [true, true, true, true]
            assert.strict.deepEqual(r, rr)
        })

        it('跳過廣告、媒體、電子報等SKIP型別區塊', function() {
            let t = parseBloomberg(htmlBloomberg(storyOk), URL_B)
            let r = [
                includes(t.content, '這段是廣告不應出現'),
                includes(t.content, '這段是媒體不應出現'),
                includes(t.content, '這段是電子報不應出現'),
            ]
            let rr = [false, false, false]
            assert.strict.deepEqual(r, rr)
        })

        it('遞迴取出巢狀content之文字', function() {
            let t = parseBloomberg(htmlBloomberg(storyOk), URL_B)
            let r = includes(t.content, '多家機構重新評估其估值模型。')
            let rr = true
            assert.strict.deepEqual(r, rr)
        })

        it('標題取自story.headline', function() {
            let t = parseBloomberg(htmlBloomberg(storyOk), URL_B)
            let r = t.title
            let rr = 'Illiquidity premium works only when liquidity is not needed'
            assert.strict.deepEqual(r, rr)
        })

        it('headline非字串時退回由title標籤取得', function() {
            let t = parseBloomberg(htmlBloomberg({ headline: 123, body: { content: storyOk.body.content } }), URL_B)
            let r = t.title
            let rr = 'Illiquidity premium'
            assert.strict.deepEqual(r, rr)
        })

        it('無__NEXT_DATA__時回custom-parser-miss', function() {
            let html = '<html><head><title>t</title></head><body><p>沒有next data</p></body></html>'
            let t = parseBloomberg(html, URL_B)
            let r = [t.success, t.reason, includes(t.message, 'no __NEXT_DATA__')]
            let rr = [false, 'custom-parser-miss', true]
            assert.strict.deepEqual(r, rr)
        })

        it('__NEXT_DATA__非合法JSON時回custom-parser-miss且不拋錯', function() {
            let html = '<html><body><script id="__NEXT_DATA__" type="application/json">{壞掉的JSON</script></body></html>'
            let t = parseBloomberg(html, URL_B)
            let r = [t.success, t.reason, includes(t.message, 'JSON parse failed')]
            let rr = [false, 'custom-parser-miss', true]
            assert.strict.deepEqual(r, rr)
        })

        it('story結構缺漏或content非陣列時回custom-parser-miss', function() {
            let r = []
            for (let story of [
                undefined,
                {},
                { body: {} },
                { body: { content: 'abc' } },
                { body: { content: [] } },
            ]) {
                let t = parseBloomberg(htmlBloomberg(story), URL_B)
                r.push([t.success, t.reason])
            }
            let rr = [
                [false, 'custom-parser-miss'],
                [false, 'custom-parser-miss'],
                [false, 'custom-parser-miss'],
                [false, 'custom-parser-miss'],
                [false, 'custom-parser-miss'],
            ]
            assert.strict.deepEqual(r, rr)
        })

        it('內文未達MIN_CONTENT時回empty-content', function() {
            let story = { headline: 'h', body: { content: [{ type: 'paragraph', value: '太短' }] } }
            let t = parseBloomberg(htmlBloomberg(story), URL_B)
            let r = [t.success, t.reason, includes(t.message, 'bloomberg: content too short')]
            let rr = [false, 'empty-content', true]
            assert.strict.deepEqual(r, rr)
        })

        it('區塊為null或非物件時不拋錯, 視為無文字', function() {
            let story = {
                headline: 'h',
                body: { content: [null, 'abc', 123, { type: 'paragraph', value: '有效內文'.repeat(20) }] },
            }
            let t = parseBloomberg(htmlBloomberg(story), URL_B)
            let r = [t.success, includes(t.content, '有效內文')]
            let rr = [true, true]
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('經fetchWeb之adapter機制接線', function() {

        it('gelonghui網址由內建adapter解析, 不走Readability', async function() {
            let { default: fetchWeb } = await import('../src/fetchWeb.mjs')
            let t = await fetchWeb(URL_G, {
                showLog: false,
                method: 'curl',
                _fetchers: { curl: async () => ({ status: 'success', html: htmlGelonghui('articleDetail'), method: 'curl' }) },
            })
            let r = [t.status, t.title, includes(t.content, '流動性溢價')]
            let rr = ['success', '流動性溢價的真相', true]
            assert.strict.deepEqual(r, rr)
        })

        it('bloomberg網址由內建adapter解析, 不走Readability', async function() {
            let { default: fetchWeb } = await import('../src/fetchWeb.mjs')
            let t = await fetchWeb(URL_B, {
                showLog: false,
                method: 'curl',
                _fetchers: { curl: async () => ({ status: 'success', html: htmlBloomberg(storyOk), method: 'curl' }) },
            })
            let r = [t.status, t.title]
            let rr = ['success', 'Illiquidity premium works only when liquidity is not needed']
            assert.strict.deepEqual(r, rr)
        })

    })

})
