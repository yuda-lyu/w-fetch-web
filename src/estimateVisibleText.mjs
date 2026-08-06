import isstr from 'wsemi/src/isstr.mjs'


/**
 * 由網頁HTML估算可見文字內容
 *
 * 取<body>內容後移除script、style、標籤與HTML實體，再壓縮空白，用以粗估頁面實質可見字數，
 * 供轉址殼頁、空內容頁之判識使用
 *
 * @param {String} html 輸入網頁HTML字串
 * @returns {String} 回傳估算之可見文字字串
 * @example
 *
 * import estimateVisibleText from './src/estimateVisibleText.mjs'
 *
 * console.log(estimateVisibleText('<html><body><p>abc</p> <p>def</p></body></html>'))
 * // => 'abc def'
 *
 * console.log(estimateVisibleText('<body><script>var a=1</script><div>xyz</div></body>'))
 * // => 'xyz'
 *
 */
function estimateVisibleText(html) {

    //check
    if (!isstr(html)) {
        return ''
    }

    //body, 無body標籤時視為全文
    let body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html

    return body
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}


export default estimateVisibleText
