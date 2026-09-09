import isearr from 'wsemi/src/isearr.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import { isValidAdapter } from './adapterContract.mjs'


//以RegExp比對網址, 且不留下狀態
//帶g或y旗標之RegExp其test會推進lastIndex, 使同一網址連查結果交替;
//此處改以去除g與y之複本比對, 既避免狀態殘留, 亦不竄改呼叫端(或內建清單)持有之RegExp實例
function _testRegExp(re, url) {
    if (!re.global && !re.sticky) {
        return re.test(url)
    }
    return new RegExp(re.source, re.flags.replace(/[gy]/g, '')).test(url)
}


/**
 * 由adapter清單中找出第一個命中網址者
 *
 * adapter之形狀與合法性判準以src/adapterContract.mjs為唯一事實來源，本函數只負責挑選。
 *
 * 依序試各adapter，第一個命中者勝出；條目不合法(非物件、缺id、match型別不符、缺parse)一律略過。
 * match執行拋錯時回傳type='error'而非視為未命中——呼叫端註冊了adapter即代表選定該解析階段，
 * 若靜默改用預設解析器，等於讓呼叫端在不知情下經歷未選擇的處理管線階段，故一律顯性回報。
 * match之回傳值一律await，故async match可正常運作，其reject亦被同一錯誤邊界攔下
 *
 * @param {String} url 輸入待比對網址字串
 * @param {Array} adapters 輸入adapter物件陣列，非陣列時視為空陣列
 * @returns {Promise} 回傳Promise，resolve回傳結果物件，命中時為{type:'hit',adapter,ctx}，其中ctx為match函數之回傳值(RegExp或回傳true時為null)；未命中時為{type:'miss'}；match執行拋錯時為{type:'error',id,message}，本函數不會reject
 * @example
 *
 * import findAdapter from './src/findAdapter.mjs'
 *
 * let adapters = [
 *     { id: 'a', match: /^https?:\/\/a\.com\//, parse: () => ({ success: true }) },
 *     { id: 'b', match: (u) => { let m = u.match(/\/ar-(\w+)/); return m ? { id: m[1] } : null }, parse: () => ({ success: true }) },
 * ]
 *
 * console.log(findAdapter('https://a.com/x', adapters).adapter.id)
 * // => 'a'
 *
 * console.log(findAdapter('https://b.com/ar-AA1X', adapters).ctx)
 * // => { id: 'AA1X' }
 *
 * console.log(findAdapter('https://c.com/', adapters))
 * // => { type: 'miss' }
 *
 */
async function findAdapter(url, adapters) {

    //check
    if (!isestr(url)) {
        return { type: 'miss' }
    }
    if (!isearr(adapters)) {
        return { type: 'miss' }
    }

    for (let adapter of adapters) {

        if (!isValidAdapter(adapter)) {
            continue
        }

        //match之執行一律納入同一錯誤邊界
        //RegExp之test亦可能拋錯(被覆寫、subclass自訂exec), 與函數式match同等處理
        let hit = null
        try {
            if (adapter.match instanceof RegExp) {
                hit = _testRegExp(adapter.match, url)
            }
            else {

                //await可同時涵蓋同步拋錯與async reject, 避免async match產生unhandledRejection,
                //亦避免Promise物件被當成truthy而誤判為命中並成為ctx
                hit = await adapter.match(url)
            }
        }
        catch (err) {
            return { type: 'error', id: adapter.id, message: 'adapter ' + adapter.id + ' match error: ' + (err?.message || String(err)) }
        }

        if (hit) {
            return { type: 'hit', adapter, ctx: hit === true ? null : hit }
        }
    }

    return { type: 'miss' }
}


export default findAdapter
