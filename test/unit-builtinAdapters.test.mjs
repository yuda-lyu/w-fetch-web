import assert from 'assert'
import includes from 'lodash-es/includes.js'
import { defaultAdapters, inspectHtml } from '../src/fetchWeb.mjs'
import estimateVisibleText from '../src/estimateVisibleText.mjs'
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

        it('content為首個鍵時, 不跨物件抓到其他欄位之內容', function() {

            //舊實作以單一regex「<field>:\{[\s\S]*?(?:,|\{)content:"...」直接找content,
            //當content是該物件首個鍵時, 開頭的左大括號已被 :\{ 消耗, 惰性比對遂跨越物件邊界
            //而抓到後面另一個欄位的內文, 且靜默成功不報錯(此處會取到"AAA")。
            //改以大括號配對切出物件範圍後再找, 邊界與鍵的順序無關
            let html = '<html><head><title>t - 格隆匯</title></head><body><script>window.__NUXT__={state:{' +
                'dtbDetail:{content:"' + 'D'.repeat(60) + '"},' +
                'articleDetail:{content:"' + 'A'.repeat(60) + '"}' +
                '}}</script></body></html>'
            let t = parseGelonghui(html, URL_G)
            let r = [t.success, t.content[0], t.contentLength]
            let rr = [true, 'D', 60]
            assert.strict.deepEqual(r, rr)
        })

        it('欄位物件含巢狀物件時仍能取出content', function() {

            //真實頁面之articleDetail確實含巢狀物件(實測含 tag:{name,color}),
            //故不可用「中間不得含大括號」來收緊比對——那會使真實頁面直接解析不到
            let html = '<html><head><title>t - 格隆匯</title></head><body><script>window.__NUXT__={state:{' +
                'articleDetail:{id:1,tag:{name:"原创",color:"#999999"},content:"' + 'N'.repeat(60) + '"}' +
                '}}</script></body></html>'
            let t = parseGelonghui(html, URL_G)
            let r = [t.success, t.content[0]]
            let rr = [true, 'N']
            assert.strict.deepEqual(r, rr)
        })

        it('欄位存在但其物件內無content時, 續試下一個欄位', function() {

            //dtbDetail存在卻只有其他鍵; 舊實作因regex找不到而整段不匹配, 效果相同,
            //但新實作是「切出物件後於其內找不到content」, 為不同的路徑
            let html = '<html><head><title>t - 格隆匯</title></head><body><script>window.__NUXT__={state:{' +
                'dtbDetail:{id:1,title:"x"},' +
                'articleDetail:{id:2,content:"' + 'A'.repeat(60) + '"}' +
                '}}</script></body></html>'
            let t = parseGelonghui(html, URL_G)
            let r = [t.success, t.content[0], t.contentLength]
            let rr = [true, 'A', 60]
            assert.strict.deepEqual(r, rr)
        })

        it('兩個欄位皆無content時回adapter-parse-miss', function() {
            let html = '<html><head><title>t - 格隆匯</title></head><body><script>window.__NUXT__={state:{' +
                'dtbDetail:{id:1},articleDetail:{id:2}' +
                '}}</script></body></html>'
            let t = parseGelonghui(html, URL_G)
            let r = [t.success, t.reason]
            let rr = [false, 'adapter-parse-miss']
            assert.strict.deepEqual(r, rr)
        })

        it('大括號未配對完成時視為找不到, 不拋錯', function() {
            let html = '<html><head><title>t - 格隆匯</title></head><body><script>window.__NUXT__={state:{' +
                'articleDetail:{id:1,content:"' + 'N'.repeat(60) + '"' +
                '</script></body></html>'
            let t = parseGelonghui(html, URL_G)
            let r = [t.success, t.reason]
            let rr = [false, 'adapter-parse-miss']
            assert.strict.deepEqual(r, rr)
        })

        it('字串內之大括號不影響邊界判定', function() {

            //內文本身可能含大括號(程式碼片段、JSON範例), 掃描時字串內容不計入配對
            let html = '<html><head><title>t - 格隆匯</title></head><body><script>window.__NUXT__={state:{' +
                'dtbDetail:{id:1,content:"' + '{程式碼}'.repeat(20) + '"},' +
                'articleDetail:{content:"' + 'A'.repeat(60) + '"}' +
                '}}</script></body></html>'
            let t = parseGelonghui(html, URL_G)
            let r = [t.success, t.content.includes('程式碼'), t.content.includes('A'.repeat(60))]
            let rr = [true, true, false]
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

        it('找不到任何欄位時回adapter-parse-miss', function() {
            let html = '<html><head><title>t - 格隆匯</title></head><body><p>沒有NUXT state</p></body></html>'
            let t = parseGelonghui(html, URL_G)
            let r = [t.success, t.reason, includes(t.message, 'gelonghui')]
            let rr = [false, 'adapter-parse-miss', true]
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

        it('無__NEXT_DATA__時回adapter-parse-miss', function() {
            let html = '<html><head><title>t</title></head><body><p>沒有next data</p></body></html>'
            let t = parseBloomberg(html, URL_B)
            let r = [t.success, t.reason, includes(t.message, 'no __NEXT_DATA__')]
            let rr = [false, 'adapter-parse-miss', true]
            assert.strict.deepEqual(r, rr)
        })

        it('__NEXT_DATA__非合法JSON時回adapter-parse-miss且不拋錯', function() {
            let html = '<html><body><script id="__NEXT_DATA__" type="application/json">{壞掉的JSON</script></body></html>'
            let t = parseBloomberg(html, URL_B)
            let r = [t.success, t.reason, includes(t.message, 'JSON parse failed')]
            let rr = [false, 'adapter-parse-miss', true]
            assert.strict.deepEqual(r, rr)
        })

        it('story結構缺漏或content非陣列時回adapter-parse-miss', function() {
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
                [false, 'adapter-parse-miss'],
                [false, 'adapter-parse-miss'],
                [false, 'adapter-parse-miss'],
                [false, 'adapter-parse-miss'],
                [false, 'adapter-parse-miss'],
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

    describe('上兩條接線測試對fixture大小之依賴', function() {

        //上兩條看似驗證了「內建adapter於完整流程中生效」, 但它們通過的真正原因是
        //fixture只有291與585位元組——低於empty判識之HTML位元組下限(5000), 故該判識永不觸發。
        //兩個fixture之可見文字皆為0, 亦即**真實頁面該有的東西它們沒有**:
        //真實gelonghui頁面實測為362834位元組、可見文字7281(通過判識, 故該站無虞),
        //而任何「HTML很大但可見文字極少」的JS渲染頁面, 其內建adapter都會在判識階就被攔下。
        //
        //本組把這層隱性依賴寫成明文, 使fixture日後被改大時能立刻看出後果

        let inflate = (html) => html.replace('</body>', '<script>' + 'v'.repeat(6000) + '</script></body>')

        it('fixture低於empty之位元組下限, 故該判識於上兩條中永不觸發', function() {
            let g = htmlGelonghui('articleDetail')
            let b = htmlBloomberg(storyOk)
            let r = [g.length < 5000, b.length < 5000, estimateVisibleText(g).length, estimateVisibleText(b).length]
            let rr = [true, true, 0, 0]
            assert.strict.deepEqual(r, rr)
        })

        it('同一份內容撐大至真實量級後即被判empty, adapter不被呼叫', function() {
            let r = [inspectHtml(inflate(htmlGelonghui('articleDetail'))).type, inspectHtml(inflate(htmlBloomberg(storyOk))).type]
            let rr = ['empty', 'empty']
            assert.strict.deepEqual(r, rr)
        })

        it('內建adapter亦可用inspect:false豁免, 與使用端adapter一視同仁', async function() {

            //P2之機制對內建與使用端無差別待遇。內建之gelonghui與bloomberg**未**宣告豁免:
            //gelonghui之真實頁面實測可見文字7281而通過判識, 無此需要;
            //bloomberg之真實頁面未取得(curl回403), 未經量測即宣告豁免屬臆測, 故不加。
            //msn則宣告inspect:false, 理由與驗證見defaultAdapters.mjs與unit-builtinAdapterMsn:
            //其HTML由API之JSON組出, 內建判識器對此類來源已知之內容只有誤判一個方向
            let { default: fetchWeb } = await import('../src/fetchWeb.mjs')
            let big = inflate(htmlGelonghui('articleDetail'))
            let mk = (adapters) => fetchWeb(URL_G, {
                showLog: false,
                method: 'curl',
                adapters,
                _fetchers: { curl: async () => ({ status: 'success', html: big, method: 'curl' }) },
            })
            let tOff = await mk([])
            let tOn = await mk([{ id: 'gelonghui', match: /gelonghui\.com/, parse: parseGelonghui, inspect: false }])
            let r = [tOff.status, tOff.attempts[0].type, tOn.status, tOn.title]
            let rr = ['error', 'empty', 'success', '流動性溢價的真相']
            assert.strict.deepEqual(r, rr)
        })

    })

})
