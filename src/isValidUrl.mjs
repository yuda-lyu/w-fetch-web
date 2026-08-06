import isestr from 'wsemi/src/isestr.mjs'


/**
 * 檢核是否為有效的http或https網址字串
 *
 * @param {String} url 輸入待檢核網址字串
 * @returns {Boolean} 回傳是否為有效http或https網址之布林值
 * @example
 *
 * import isValidUrl from './src/isValidUrl.mjs'
 *
 * console.log(isValidUrl('https://www.google.com/'))
 * // => true
 *
 * console.log(isValidUrl('http://127.0.0.1:8080/abc'))
 * // => true
 *
 * console.log(isValidUrl('ftp://www.google.com/'))
 * // => false
 *
 * console.log(isValidUrl('www.google.com'))
 * // => false
 *
 */
function isValidUrl(url) {

    //check
    if (!isestr(url)) {
        return false
    }

    try {
        let u = new URL(url)
        return u.protocol === 'http:' || u.protocol === 'https:'
    }
    catch {
        return false
    }
}


export default isValidUrl
