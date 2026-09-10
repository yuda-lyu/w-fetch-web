import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { REASONS } from '../src/constants.mjs'


//失敗歸因(reason)之值域守門。
//
//reason與METHOD_*、DETECT_*同為對外公開之列舉, 呼叫端據以分支決定重試、告警或修adapter。
//此前另二者集中於constants.mjs而reason散在12個檔共35處, 無處可查其完整值域。
//
//實作端刻意仍寫字串字面量: 對外契約是「值域」不是「變數名」, 而測試須以字面量斷言
//才測得到值本身。兩者之一致性改由本檔強制——src內出現的每個reason都須登記於REASONS


//取src內所有 reason: '...' 之字面量
let collectReasons = () => {
    let out = new Map()
    for (let fn of fs.readdirSync('src').filter((v) => v.endsWith('.mjs'))) {
        let t = fs.readFileSync(path.join('src', fn), 'utf8')
        for (let m of t.matchAll(/reason:\s*'([a-z-]+)'/g)) {
            if (!out.has(m[1])) {
                out.set(m[1], [])
            }
            out.get(m[1]).push(fn)
        }
    }
    return out
}


describe('reason值域之單一權威', function() {

    it('src內出現的每個reason皆已登記於REASONS', function() {

        //新增一個未登記的reason即在此失敗, 迫使其進入值域清單與README
        let used = collectReasons()
        let unlisted = [...used.keys()].filter((v) => !Object.hasOwn(REASONS, v)).sort()
        let r = unlisted
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

    it('REASONS內每一項皆有說明文字', function() {
        let bad = Object.entries(REASONS).filter(([, v]) => typeof v !== 'string' || v === '')
        let r = bad.map(([k]) => k)
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

    it('已無custom-parser等adapter機制之前的舊名', function() {

        //adapter機制取代custom parser後, 內建adapter仍回'custom-parser-miss',
        //使同一種情形(adapter命中網域但頁面缺少預期結構)對呼叫端呈現舊術語
        let used = collectReasons()
        let legacy = [...used.keys()].filter((v) => v.includes('custom-parser'))
        let r = legacy
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

    it('內建adapter與使用端adapter之失敗歸因語意可區分', function() {

        //兩者刻意不同名: 前者為「命中網域但頁面缺少預期結構」, 後者為「adapter說失敗但沒說原因」
        let r = [
            Object.hasOwn(REASONS, 'adapter-parse-miss'),
            Object.hasOwn(REASONS, 'adapter-parse-failed'),
            REASONS['adapter-parse-miss'] !== REASONS['adapter-parse-failed'],
        ]
        let rr = [true, true, true]
        assert.strict.deepEqual(r, rr)
    })

})
