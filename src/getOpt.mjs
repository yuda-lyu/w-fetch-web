import isbol from 'wsemi/src/isbol.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import isp0int from 'wsemi/src/isp0int.mjs'
import cint from 'wsemi/src/cint.mjs'
import cbol from 'wsemi/src/cbol.mjs'


//共用之取值與檢核: 型別不符一律採預設值, 不拋錯亦不嘗試強制轉換
//本套件之公開函數皆以「不reject、非法輸入退回預設」為契約, 故各選項一律經此處理
function _pick(opt, key, def, isOk, cast) {
    //單層鍵取值, 不需外部套件; opt非物件或鍵不存在皆得undefined而落入預設
    let v = opt?.[key]
    if (!isOk(v)) {
        return def
    }
    return cast ? cast(v) : v
}


/**
 * 由設定物件取布林選項，型別不符時採預設值
 *
 * @param {Object} opt 輸入設定物件
 * @param {String} key 輸入鍵名字串
 * @param {Boolean} def 輸入預設值布林值
 * @returns {Boolean} 回傳選項布林值
 * @example
 *
 * import { getOptBool } from './src/getOpt.mjs'
 *
 * console.log(getOptBool({ parse: false }, 'parse', true), getOptBool({ parse: 'x' }, 'parse', true))
 * // => false true
 *
 */
function getOptBool(opt, key, def) {
    return _pick(opt, key, def, isbol, cbol)
}


/**
 * 由設定物件取正整數選項，型別不符時採預設值
 *
 * @param {Object} opt 輸入設定物件
 * @param {String} key 輸入鍵名字串
 * @param {Integer} def 輸入預設值整數
 * @returns {Integer} 回傳選項整數
 * @example
 *
 * import { getOptPInt } from './src/getOpt.mjs'
 *
 * console.log(getOptPInt({ timeoutMs: 3000 }, 'timeoutMs', 15000), getOptPInt({ timeoutMs: 0 }, 'timeoutMs', 15000))
 * // => 3000 15000
 *
 */
function getOptPInt(opt, key, def) {
    return _pick(opt, key, def, ispint, cint)
}


/**
 * 由設定物件取非負整數選項，型別不符時採預設值
 *
 * @param {Object} opt 輸入設定物件
 * @param {String} key 輸入鍵名字串
 * @param {Integer} def 輸入預設值整數
 * @returns {Integer} 回傳選項整數
 * @example
 *
 * import { getOptP0Int } from './src/getOpt.mjs'
 *
 * console.log(getOptP0Int({ maxRetries: 0 }, 'maxRetries', 5), getOptP0Int({ maxRetries: -1 }, 'maxRetries', 5))
 * // => 0 5
 *
 */
function getOptP0Int(opt, key, def) {
    return _pick(opt, key, def, isp0int, cint)
}


/**
 * 由設定物件取非空字串選項，型別不符時採預設值
 *
 * @param {Object} opt 輸入設定物件
 * @param {String} key 輸入鍵名字串
 * @param {String} def 輸入預設值字串
 * @returns {String} 回傳選項字串
 * @example
 *
 * import { getOptStr } from './src/getOpt.mjs'
 *
 * console.log(getOptStr({ method: 'curl' }, 'method', 'auto'), getOptStr({ method: '' }, 'method', 'auto'))
 * // => 'curl' 'auto'
 *
 */
function getOptStr(opt, key, def) {
    return _pick(opt, key, def, isestr, null)
}


/**
 * 由設定物件取陣列選項，型別不符時採預設值
 *
 * @param {Object} opt 輸入設定物件
 * @param {String} key 輸入鍵名字串
 * @param {Array} def 輸入預設值陣列
 * @returns {Array} 回傳選項陣列
 * @example
 *
 * import { getOptArr } from './src/getOpt.mjs'
 *
 * console.log(getOptArr({ adapters: [1] }, 'adapters', []), getOptArr({ adapters: 'x' }, 'adapters', []))
 * // => [1] []
 *
 */
function getOptArr(opt, key, def) {
    return _pick(opt, key, def, isarr, null)
}


export {
    getOptBool,
    getOptPInt,
    getOptP0Int,
    getOptStr,
    getOptArr
}
