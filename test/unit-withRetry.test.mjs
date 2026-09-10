import assert from 'assert'
import withRetry from '../src/withRetry.mjs'


//共用重試骨架之契約。
//
//三個抓取器的重試皆由本函數執行, 其契約先前只被各抓取器的整合測試間接覆蓋——
//「retryable:false 立即停止」「attempts 為實際執行次數」這類規則沒有一處可查。
//
//注意本檔部分案例會真的等待退避(3秒起, 見getRetryWaitMs), 故指定較長逾時


//收集stderr輸出, 用於驗證退避訊息
let captureStderr = async (fn) => {
    let out = []
    let orig = process.stderr.write
    process.stderr.write = (s) => {
        out.push(String(s))
        return true
    }
    try {
        await fn()
    }
    finally {
        process.stderr.write = orig
    }
    return out.join('')
}


describe('withRetry', function() {

    it('首次即成功時只執行一次, attempts為1', async function() {
        let n = 0
        let r = await withRetry(async () => {
            n += 1
            return { ok: true, value: 'x' }
        }, { maxRetries: 5, tag: 't' })
        let t = [r.ok, r.value, r.attempts, n]
        let tt = [true, 'x', 1, 1]
        assert.strict.deepEqual(t, tt)
    })

    it('失敗後重試, attempts為實際執行次數', async function() {
        this.timeout(30000)
        let n = 0
        let r = await withRetry(async () => {
            n += 1
            return n < 2 ? { ok: false, message: 'boom' } : { ok: true, value: n }
        }, { maxRetries: 3, tag: 't', showLog: false })
        let t = [r.ok, r.value, r.attempts, n]
        let tt = [true, 2, 2, 2]
        assert.strict.deepEqual(t, tt)
    })

    it('retryable為false時立即停止, 不消耗重試次數', async function() {

        //此為curl之4xx與內容過短所走的路徑: 再抓一次仍是同一份回應, 重試無益。
        //若本規則失效, 一個404會白等3+6+9+12+15秒才回報
        let n = 0
        let r = await withRetry(async () => {
            n += 1
            return { ok: false, retryable: false, reason: 'http-error', message: 'HTTP 404' }
        }, { maxRetries: 5, tag: 't' })
        let t = [r.ok, r.reason, r.attempts, n]
        let tt = [false, 'http-error', 1, 1]
        assert.strict.deepEqual(t, tt)
    })

    it('maxRetries為0時只執行一次', async function() {
        let n = 0
        let r = await withRetry(async () => {
            n += 1
            return { ok: false, message: 'boom' }
        }, { maxRetries: 0, tag: 't' })
        let t = [r.ok, r.attempts, n]
        let tt = [false, 1, 1]
        assert.strict.deepEqual(t, tt)
    })

    it('次數用盡後回最後一次之結果並附attempts', async function() {
        this.timeout(30000)
        let n = 0
        let r = await withRetry(async () => {
            n += 1
            return { ok: false, reason: 'curl-error', message: 'fail ' + n, httpCode: 500 }
        }, { maxRetries: 1, tag: 't', showLog: false })
        let t = [r.ok, r.reason, r.message, r.httpCode, r.attempts, n]
        let tt = [false, 'curl-error', 'fail 2', 500, 2, 2]
        assert.strict.deepEqual(t, tt)
    })

    it('原樣帶回單次嘗試之自訂欄位, 不解讀其內容', async function() {

        //抓取器各自回不同欄位(html、snapshot、contentKind、httpCode…),
        //本函數不得只保留自己認得的鍵
        let r = await withRetry(async () => {
            return { ok: true, html: '<p>a</p>', contentKind: 'raw', snapshot: 's', extra: { k: 1 } }
        }, { maxRetries: 0, tag: 't' })
        let t = [r.html, r.contentKind, r.snapshot, r.extra]
        let tt = ['<p>a</p>', 'raw', 's', { k: 1 }]
        assert.strict.deepEqual(t, tt)
    })

    it('attempt序號由1起算並傳入單次嘗試函數', async function() {
        this.timeout(30000)
        let seen = []
        await withRetry(async (attempt) => {
            seen.push(attempt)
            return seen.length < 2 ? { ok: false, message: 'x' } : { ok: true }
        }, { maxRetries: 3, tag: 't', showLog: false })
        let t = seen
        let tt = [1, 2]
        assert.strict.deepEqual(t, tt)
    })

})


describe('withRetry之退避訊息', function() {

    it('採logDetail為訊息主體, 並帶標籤、等待毫秒與次數', async function() {
        this.timeout(30000)
        let out = await captureStderr(async () => {
            let n = 0
            await withRetry(async () => {
                n += 1
                return n < 2 ? { ok: false, message: 'm', logDetail: 'HTTP 500 https://a.com/' } : { ok: true }
            }, { maxRetries: 2, tag: 'fetchWebByCurl' })
        })
        let t = [
            out.includes('[fetchWebByCurl]'),
            out.includes('HTTP 500 https://a.com/'),
            out.includes('等 3000ms 後重試'),
            out.includes('(1/2)'),
        ]
        let tt = [true, true, true, true]
        assert.strict.deepEqual(t, tt)
    })

    it('未給logDetail時以error加訊息為主體', async function() {
        this.timeout(30000)
        let out = await captureStderr(async () => {
            let n = 0
            await withRetry(async () => {
                n += 1
                return n < 2 ? { ok: false, message: 'page.goto failed' } : { ok: true }
            }, { maxRetries: 1, tag: 'playwright-headless' })
        })
        let t = out.includes('error: page.goto failed')
        let tt = true
        assert.strict.deepEqual(t, tt)
    })

    it('showLog為false時不輸出', async function() {
        this.timeout(30000)
        let out = await captureStderr(async () => {
            let n = 0
            await withRetry(async () => {
                n += 1
                return n < 2 ? { ok: false, message: 'm' } : { ok: true }
            }, { maxRetries: 1, tag: 't', showLog: false })
        })
        let t = out
        let tt = ''
        assert.strict.deepEqual(t, tt)
    })

    it('成功與不可重試者皆不輸出退避訊息', async function() {
        let out = await captureStderr(async () => {
            await withRetry(async () => ({ ok: true }), { maxRetries: 3, tag: 't' })
            await withRetry(async () => ({ ok: false, retryable: false, message: 'm' }), { maxRetries: 3, tag: 't' })
        })
        let t = out
        let tt = ''
        assert.strict.deepEqual(t, tt)
    })

})
