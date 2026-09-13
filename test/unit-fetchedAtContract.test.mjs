import assert from 'assert'
import fetchWeb from '../src/fetchWeb.mjs'
import fetchWebByCurl from '../src/fetchWebByCurl.mjs'
import fetchWebByCamofox from '../src/fetchWebByCamofox.mjs'
import fetchWebByPlaywrightHeadless from '../src/fetchWebByPlaywrightHeadless.mjs'
import fetchWebByPlaywrightHead from '../src/fetchWebByPlaywrightHead.mjs'
import { fetchedAtIso, fetchedAtLocal } from '../src/fetchedAt.mjs'


//本檔鎖住fetchedAt之對外契約。
//
//兩種格式與取值時機並非疏漏而是兩個不同的對外表面(見 src/fetchedAt.mjs 檔頭),
//故此處不只斷言格式, 亦斷言「各層用的是哪一個產生器」——
//若日後有人在某個抓取器內就地再寫一次new Date(), 本檔不會失敗, 但下方
//「單一擁有者」一節會失敗
//
//兩層之差異:
//  fetchWebByXxx: ISO 8601之UTC字串, 於**進入函數時**取值, 代表開始嘗試的時間
//  fetchWeb:      本地時間'YYYY-MM-DD HH:mm:ss', 於**彙整結果時**取值, 代表完成的時間
//重試5次時兩者可相差45秒以上。統一任一邊皆為破壞性變更, 須同步更新README與各JSDoc
describe('fetchedAt格式與取值時機', function() {

    //以無效網址驅動, 各層皆於最前段即回傳, 不需server亦不啟動瀏覽器
    let URL_BAD = 'abc'

    let reIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    let reLocal = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

    it('四個fetchWebByXxx之fetchedAt皆為ISO 8601 UTC字串', async function() {
        this.timeout(30000)
        let fns = [fetchWebByCurl, fetchWebByPlaywrightHeadless, fetchWebByPlaywrightHead, fetchWebByCamofox]
        let r = []
        for (let fn of fns) {
            let t = await fn(URL_BAD)
            r.push([t.status, reIso.test(t.fetchedAt)])
        }
        let rr = [
            ['error', true],
            ['error', true],
            ['error', true],
            ['error', true],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('fetchWeb之fetchedAt為本地時間字串, 與下層格式刻意不同', async function() {
        let t = await fetchWeb(URL_BAD, { useShowLog: false })
        let r = [t.status, t.reason, reLocal.test(t.fetchedAt), reIso.test(t.fetchedAt)]
        let rr = ['error', 'invalid-url', true, false]
        assert.strict.deepEqual(r, rr)
    })

    it('fetchWebByXxx於進入時取值, fetchWeb於彙整時取值', async function() {
        this.timeout(30000)

        //以秒為單位比較: 兩者格式不同, 故各自轉為時間戳再比對區間
        let t0 = Date.now()
        let a = await fetchWebByCurl(URL_BAD)
        let b = await fetchWeb(URL_BAD, { useShowLog: false })
        let t1 = Date.now()

        //ISO字串可直接解析; 本地時間字串須補上分隔以供Date解析
        let ta = new Date(a.fetchedAt).getTime()
        let tb = new Date(b.fetchedAt.replace(' ', 'T')).getTime()

        //各自落在本次執行區間內(本地時間字串截去毫秒, 故下界放寬1秒)
        let r = [
            ta >= t0 && ta <= t1,
            tb >= t0 - 1000 && tb <= t1,
        ]
        let rr = [true, true]
        assert.strict.deepEqual(r, rr)
    })

})


describe('fetchedAt之單一擁有者', function() {

    let reIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    let reLocal = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

    it('兩個產生器各自輸出其格式', function() {
        let r = [reIso.test(fetchedAtIso()), reLocal.test(fetchedAtLocal())]
        let rr = [true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('src內不得有第二處時間戳實作', async function() {
        let fs = await import('fs')
        let path = await import('path')
        let fd = 'src'
        let hits = fs.readdirSync(fd)
            .filter((v) => v.endsWith('.mjs') && v !== 'fetchedAt.mjs')
            .filter((v) => {
                let t = fs.readFileSync(path.join(fd, v), 'utf8')
                return t.includes('toISOString()') || t.includes('getFullYear()')
            })
        let r = hits
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

})
