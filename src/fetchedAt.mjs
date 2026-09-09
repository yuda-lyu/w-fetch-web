//時間戳之單一擁有者
//
//本套件對外存在**兩種**fetchedAt, 分屬兩個不同的對外表面, 兩者永不同時出現:
//
//  來源            格式                        取值時機            出現於
//  fetchedAtIso    ISO 8601 UTC                進入函數時(重試前)   直接呼叫fetchWebByXxx之結果
//  fetchedAtLocal  本地時間'YYYY-MM-DD HH:mm:ss' 彙整結果時(重試後)   fetchWeb之結果
//
//兩者不只格式不同, 語意亦不同: 前者是「開始嘗試的時間」, 後者是「完成的時間」,
//重試5次時可相差45秒以上。
//
//之所以能長期分歧而無人察覺, 是因為finalizeResult.mjs之adapt()白名單投影
//({success,html,method,snapshot})會丟棄fetchedAt, 使兩者從不同時出現在同一個結果裡。
//故統一任一邊都是對該表面的破壞性變更, 須另行決定, 不在本模組職權內。
//本模組的職責只有一個: 使這兩個決定各自只有一處實作


/**
 * 取得ISO 8601 UTC格式時間戳
 *
 * 供四個fetchWebByXxx使用，於進入函數時取值，代表「開始嘗試」的時間
 *
 * @returns {String} 回傳ISO 8601 UTC格式時間字串
 * @example
 *
 * import { fetchedAtIso } from './src/fetchedAt.mjs'
 *
 * console.log(fetchedAtIso())
 * // => '2026-09-09T08:00:00.000Z'
 *
 */
function fetchedAtIso() {
    return new Date().toISOString()
}


/**
 * 取得本地時間格式時間戳
 *
 * 供fetchWeb之finalize使用，於彙整結果時取值，代表「完成」的時間
 *
 * @returns {String} 回傳'YYYY-MM-DD HH:mm:ss'格式之本地時間字串
 * @example
 *
 * import { fetchedAtLocal } from './src/fetchedAt.mjs'
 *
 * console.log(fetchedAtLocal())
 * // => '2026-09-09 16:00:00'
 *
 */
function fetchedAtLocal() {
    let d = new Date()
    let pad = (n) => String(n).padStart(2, '0')
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}


export {
    fetchedAtIso,
    fetchedAtLocal
}
