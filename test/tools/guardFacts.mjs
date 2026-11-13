import wpw from 'w-playwright'


let GUARD = 'AutofillAiWalletPrivatePasses'


/**
 * 由w-playwright合併後之args取出守門判讀所需之事實
 *
 * 判準出處: w-playwright規則帳本R-PW-WIRING——args最後一個元素為合併之--disable-features且含AutofillAiWalletPrivatePasses,
 * 全部args恰一串(Chromium對多串只取最後一串)。另確認Playwright之預設停用清單(getPlaywrightInfo)皆在該串內
 *
 * @param {Array} args 輸入合併後之args陣列
 * @returns {Object} 回傳{nDisable,disableIsLast,hasGuard,hasAllDefaults}，nDisable為--disable-features之串數，disableIsLast為恰一串且居末，hasGuard為該串含守門功能，hasAllDefaults為該串含Playwright之預設停用清單全部
 */
function guardFacts(args) {
    let arr = Array.isArray(args) ? args : []
    let idx = []
    arr.forEach((a, i) => {
        if (/^--?disable-features(=|$)/i.test(a)) {
            idx.push(i)
        }
    })
    let last = arr[arr.length - 1] || ''
    let feats = last.includes('=') ? last.slice(last.indexOf('=') + 1).split(',') : []
    let defaults = wpw.getPlaywrightInfo().defaultDisableFeatures
    return {
        nDisable: idx.length,
        disableIsLast: idx.length === 1 && idx[0] === arr.length - 1,
        hasGuard: feats.includes(GUARD),
        hasAllDefaults: defaults.length > 0 && defaults.every((f) => feats.includes(f)),
    }
}


/**
 * 合併後之args是否完整含守門(恰一串、居末、含守門功能與Playwright預設清單)
 *
 * @param {Array} args 輸入合併後之args陣列
 * @returns {Boolean} 回傳是否完整含守門布林值
 */
function isGuarded(args) {
    let f = guardFacts(args)
    return f.nDisable === 1 && f.disableIsLast && f.hasGuard && f.hasAllDefaults
}


export { guardFacts, isGuarded }
export default guardFacts
