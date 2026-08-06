import fetchWeb from './fetchWeb.mjs'
import fetchWebByCurl from './fetchWebByCurl.mjs'
import fetchWebByPlaywrightHeadless from './fetchWebByPlaywrightHeadless.mjs'
import fetchWebByPlaywrightHead from './fetchWebByPlaywrightHead.mjs'
import fetchWebByCamofox from './fetchWebByCamofox.mjs'


/**
 * 網頁抓取
 *
 * @returns {Object} 回傳物件，其內可呼叫fetchWeb、fetchWebByCurl、fetchWebByPlaywrightHeadless、fetchWebByPlaywrightHead、fetchWebByCamofox之async函數
 * @example
 *
 * 詳見fetchWeb、fetchWebByCurl、fetchWebByPlaywrightHeadless、fetchWebByPlaywrightHead、fetchWebByCamofox範例
 *
 */
let WFetchWeb = {
    fetchWeb,
    fetchWebByCurl,
    fetchWebByPlaywrightHeadless,
    fetchWebByPlaywrightHead,
    fetchWebByCamofox,
}


export default WFetchWeb
