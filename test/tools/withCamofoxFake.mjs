import camofoxServerFake from './camofoxServerFake.mjs'


/**
 * 以假Camofox server執行一段測試, 並保證關閉
 *
 * 八個案例原本各自寫一份「建立fake→try→finally close」, 漏掉finally就會留下listener,
 * 故收斂於此。每案之fake選項與requests斷言彼此獨立, 因此不使用suite級單例
 *
 * @param {Object} opt 輸入camofoxServerFake之設定物件
 * @param {Function} fun 輸入測試主體async函數，簽章為(fake)
 * @returns {Promise} 回傳Promise，resolve回傳fun之回傳值
 */
async function withCamofoxFake(opt, fun) {
    let fake = await camofoxServerFake(opt)
    try {
        return await fun(fake)
    }
    finally {
        await fake.close()
    }
}


export default withCamofoxFake
