import isp0int from 'wsemi/src/isp0int.mjs'


//線性退避之初始與上限毫秒
let INITIAL_WAIT_MS = 3000
let MAX_WAIT_MS = 15000


/**
 * 取得重試前之線性退避等待毫秒
 *
 * 第n次失敗後等待n*3000毫秒，上限15000毫秒，即3000、6000、9000、12000、15000、15000...
 *
 * @param {Integer} attempt 輸入第幾次嘗試之正整數，由1起算
 * @returns {Integer} 回傳等待毫秒整數
 * @example
 *
 * import getRetryWaitMs from './src/getRetryWaitMs.mjs'
 *
 * console.log(getRetryWaitMs(1), getRetryWaitMs(2), getRetryWaitMs(5), getRetryWaitMs(99))
 * // => 3000 6000 15000 15000
 *
 */
function getRetryWaitMs(attempt) {

    //check
    if (!isp0int(attempt)) {
        return INITIAL_WAIT_MS
    }

    return Math.min(INITIAL_WAIT_MS * attempt, MAX_WAIT_MS)
}


export default getRetryWaitMs
