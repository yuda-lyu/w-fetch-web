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


export {
    gelonghuiBody,
    gelonghuiEscaped,
    htmlGelonghui,
    bloombergBlocks,
    htmlBloomberg,
    storyOk
}
