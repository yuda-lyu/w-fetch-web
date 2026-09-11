//內建站台adapter之測試用HTML樣本
//依 src/parseGelonghui.mjs 與 src/parseBloomberg.mjs 之實際解析規則構造


//--- 格隆匯 ---
//解析規則: 由Nuxt SSR state中以 <field>:{...content:"..."} 取出content, 再反轉義並剝除標籤
//title取自<title>並剝除尾端「-站名」

let gelonghuiBody = '<p>本週市場焦點在於私募信貸的流動性折價，多家機構重新評估其估值模型。</p>' +
    '<p>分析師指出，流動性溢價只有在不需要流動性時才成立，這是一個結構性的矛盾。</p>'

//以\\u轉義與\\n驗證反轉義路徑
let gelonghuiEscaped = gelonghuiBody.replace(/流動性/g, '\\u6d41\\u52d5\\u6027') + '\\n結語'

let htmlGelonghui = (field = 'articleDetail', content = gelonghuiEscaped) => {
    return '<!DOCTYPE html><html><head><title>流動性溢價的真相 - 格隆匯</title></head><body>' +
        '<script>window.__NUXT__={state:{' + field + ':{id:123,content:"' + content + '"}}}</script>' +
        '</body></html>'
}


//--- Bloomberg ---
//解析規則: 由<script id="__NEXT_DATA__">取props.pageProps.story.body.content陣列,
//跳過SKIP型別, 其餘以value與巢狀content遞迴取文字, 段落間以兩換行相接

let bloombergBlocks = [
    { type: 'ad', value: '這段是廣告不應出現' },
    { type: 'media', value: '這段是媒體不應出現' },
    {
        type: 'paragraph',
        content: [
            { value: '私募信貸的流動性折價正在擴大，' },
            { type: 'link', content: [{ value: '多家機構重新評估其估值模型。' }] },
        ],
    },
    { type: 'paragraph', value: '流動性溢價只有在不需要流動性時才成立，這是結構性矛盾。' },
    { type: 'inline-newsletter', value: '這段是電子報不應出現' },
]

let htmlBloomberg = (story) => {
    let data = { props: { pageProps: { story } } }
    return '<!DOCTYPE html><html><head><title>Illiquidity premium - Bloomberg</title></head><body>' +
        '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify(data) + '</script>' +
        '</body></html>'
}

let storyOk = {
    headline: 'Illiquidity premium works only when liquidity is not needed',
    body: { content: bloombergBlocks },
}


//--- MSN ---
//內容API之回應形狀取自2026-09-11實抓assets.msn.com/content/view/v2/Detail/{locale}/{id}之真實回應:
//頂層欄位含title、body(HTML字串)、type('article')、provider{name}、sourceHref、abstract等(另有多欄與解析無關者略去)。
//文字為自擬, 只保留真實回應之**形狀**, 不複製新聞內文

let URL_MSN = 'https://www.msn.com/zh-tw/news/other/%E6%B8%AC%E8%A9%A6/ar-AA2bZm9d'

let msnApiOk = {
    abstract: '本週市場焦點在於私募信貸的流動性折價。',
    title: '私募信貸流動性折價擴大',
    sourceHref: 'https://example.com/source-article',
    type: 'article',
    provider: { name: '測試來源媒體' },
    //正文長度對齊真實量測(12篇之純文字為505~963字): 過短的fixture會讓Readability走不同分支,
    //測試綠了卻不代表真實長度下也成立
    body: ('<p>本週市場焦點在於私募信貸的流動性折價，多家機構重新評估其估值模型。</p>' +
        '<p>分析師指出，流動性溢價只有在不需要流動性時才成立，這是一個結構性的矛盾。</p>').repeat(8),
}

//影片頁(vi-)之回應形狀取自2026-09-12實抓6篇真實影片(皆HTTP 200):
//type為'video', body為逐字稿(HTML或純文字字串, 6篇為31~8446字), 另有videoMetadata等欄(與解析無關, 內容略去)。
//文字為自擬, 只保留形狀
let URL_MSN_VIDEO = 'https://www.msn.com/en-us/video/news/some-clip/vi-AA2bYtCB'

let msnApiVideo = {
    title: '市場週報：本週三大焦點',
    sourceHref: 'https://example.com/source-video',
    type: 'video',
    provider: { name: '測試來源媒體' },
    videoMetadata: {},
    body: ('<p>大家好，本週市場焦點在於私募信貸的流動性折價，多家機構重新評估其估值模型。</p>' +
        '<p>分析師指出，流動性溢價只有在不需要流動性時才成立，這是一個結構性的矛盾。</p>').repeat(6),
}

//**真實production值**, 不是構造的: 2026-09-12實抓下列影片頁, API回200、type='video',
//逐字稿原文僅31字(低於MIN_CONTENT)。它是「API成功但正文不足」這一格在真實世界的樣子——
//此前套件在此格會續跑三層瀏覽器(43秒)且歸因被蓋成camofox-empty
let URL_MSN_VIDEO_SHORT = 'https://www.msn.com/en-us/video/peopleandplaces/compilation-of-funny-videos/vi-AA1OIlxP'

let msnApiVideoShort = { ...msnApiVideo, title: 'Compilation of Funny Videos', body: 'None. Let\'s go. None. Go. None.' }


export {
    gelonghuiBody,
    gelonghuiEscaped,
    htmlGelonghui,
    bloombergBlocks,
    htmlBloomberg,
    storyOk,
    URL_MSN,
    msnApiOk,
    URL_MSN_VIDEO,
    msnApiVideo,
    URL_MSN_VIDEO_SHORT,
    msnApiVideoShort
}
