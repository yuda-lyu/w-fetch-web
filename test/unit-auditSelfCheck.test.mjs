import assert from 'assert'
import fs from 'fs'
import path from 'path'
import map from 'lodash-es/map.js'
import { SOURCES, KNOWN_TOKENS, selfCheck } from './tools/auditSiteRules.mjs'


//盤點腳本之**自檢的有效性**測試。
//
//為什麼需要「測試守門本身」：`auditSiteRules.mjs` 是為了防「grep 範圍不夠就下結論」而寫的，
//而它自己已經在同一個形狀上錯過三次：
//  一、漏掉 `challengeResources.mjs`
//  二、漏掉 `fetchWebByPlaywrightHead.mjs` 內手寫的 Cloudflare 複本
//  三、加了自檢之後，該自檢**看不見 regex 字面量形態**——本專案的路由正是那樣寫的
//      （`/wsj\.com\//` 之中網域的點是跳脫的，故 `includes('wsj.com')` 恆為 false）。
//      把 `routeByUrl.mjs` 自 SOURCES 拿掉，自檢仍回報「通過」且離開碼 0。
//
//第三次的教訓不是「再修一次」，是**守門必須自己有測試**：
//一個永遠回報通過的守門，與沒有守門完全一樣，而且更糟——它讓人以為有保護。
//全域 §2 完成判準之「驗產物是否落地」，套用在守門上就是「驗它真的會不通過」
describe('盤點腳本之自檢有效性', function() {

    it('現況下自檢通過', function() {

        //本條同時是回歸: src 內新增站台或廠商知識而忘了登記 SOURCES 時, 此條會失敗
        let r = selfCheck(SOURCES.map((s) => s.file))
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

    it('任一掃描對象被移出SOURCES時, 自檢必須抓得到', function() {

        //守門的守門: 逐一把每個 SOURCES 條目拿掉, 自檢都必須回報該檔外洩。
        //若某個檔拿掉後自檢仍回報通過, 代表自檢看不見該檔的書寫形態——
        //那正是第三次錯誤的樣子(routeByUrl 以 regex 寫, 自檢看不見)
        let files = SOURCES.map((s) => s.file)
        let r = map(files, (skip) => {
            let leaks = selfCheck(files.filter((f) => f !== skip))
            return [skip, leaks.some(([f]) => f === skip)]
        })
        let rr = map(files, (f) => [f, true])
        assert.strict.deepEqual(r, rr)
    })

    it('regex字面量形態之網域可被自檢看見', function() {

        //直接鎖住第三次錯誤的根因: 路由檔內的網域是跳脫過的。
        //須以**去註解後的程式碼**為準——原始文字含JSDoc範例, 那裡的網域沒有跳脫,
        //拿原始文字斷言會看不出問題(我第一版就是這樣寫的)
        let raw = fs.readFileSync(path.join('src', 'routeByUrl.mjs'), 'utf8')
        let code = raw.split('\n').filter((line) => {
            let s = line.trim()
            return !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*')
        }).join('\n')
        let leaks = selfCheck(SOURCES.map((s) => s.file).filter((f) => !f.includes('routeByUrl')))
        let r = [
            code.includes('wsj\\.com'),
            code.includes('wsj.com'),
            leaks.some(([f, tok]) => f === 'src/routeByUrl.mjs' && tok === 'wsj.com'),
        ]
        let rr = [true, false, true]
        assert.strict.deepEqual(r, rr)
    })

    it('KNOWN_TOKENS涵蓋每一個掃描對象內的知識', function() {

        //自檢靠 KNOWN_TOKENS 認人; 某個掃描對象若一個 token 都不含,
        //它被移出 SOURCES 時自檢就抓不到——上一條只驗了 routeByUrl, 此條驗全部
        let files = SOURCES.map((s) => s.file)
        let bad = files.filter((f) => {
            let leaks = selfCheck(files.filter((v) => v !== f))
            return !leaks.some(([lf]) => lf === f)
        })
        let r = bad
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

    it('KNOWN_TOKENS本身非空且皆為非空字串', function() {
        let bad = KNOWN_TOKENS.filter((v) => typeof v !== 'string' || v === '')
        let r = [KNOWN_TOKENS.length > 0, bad]
        let rr = [true, []]
        assert.strict.deepEqual(r, rr)
    })

})
