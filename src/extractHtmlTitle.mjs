/**
 * 由網頁HTML取出標題，並剝除尾端之「-站名」
 *
 * @param {String} html 輸入網頁HTML字串
 * @returns {String} 回傳標題字串，取不到時回傳空字串
 * @example
 *
 * import extractHtmlTitle from './src/extractHtmlTitle.mjs'
 *
 * console.log(extractHtmlTitle('<html><head><title>流動性溢價的真相 - 格隆匯</title></head></html>'))
 * // => '流動性溢價的真相'
 *
 */
function extractHtmlTitle(html) {
    return html.match(/<title>([^<]*)/i)?.[1]?.replace(/-[^-]*$/, '')?.trim() || ''
}


export default extractHtmlTitle
