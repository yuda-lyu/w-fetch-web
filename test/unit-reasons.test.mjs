import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { REASONS, DETECT_PASS, DETECT_CAPTCHA, DETECT_VERIFY, DETECT_REDIRECT, DETECT_EMPTY } from '../src/constants.mjs'


//失敗歸因(reason)之值域守門。
//
//reason與METHOD_*、DETECT_*同為對外公開之列舉, 呼叫端據以分支決定重試、告警或修adapter。
//此前另二者集中於constants.mjs而reason散在12個檔共35處, 無處可查其完整值域。
//
//實作端刻意仍寫字串字面量: 對外契約是「值域」不是「變數名」, 而測試須以字面量斷言
//才測得到值本身。兩者之一致性改由本檔強制——src內出現的每個reason都須登記於REASONS


//取src內所有 reason: '...' 之字面量
//
//整行註解不計: 註解會提及reason值以說明行為(如「回reason:'captcha'」),
//把它算成使用處會產生假陽性, 而假陽性會逼人改寫註解去閃避守門——那等於讓守門反過來壓抑說明
let collectReasons = () => {
    let out = new Map()
    for (let fn of fs.readdirSync('src').filter((v) => v.endsWith('.mjs'))) {
        let t = fs.readFileSync(path.join('src', fn), 'utf8')
        let code = t.split('\n').filter((line) => {
            let s = line.trim()
            return !s.startsWith('//') && !s.startsWith('*')
        }).join('\n')
        let add = (v) => {
            if (!out.has(v)) {
                out.set(v, [])
            }
            out.get(v).push(fn)
        }
        for (let m of code.matchAll(/reason:\s*'([a-z-]+)'/g)) {
            add(m[1])
        }

        //第二種發出形態: 先以REASON_*常數命名, 再於控制流中比對與發出(runPlan)。
        //守門此前看不見此形態——internal-address由字面量改為常數後即自掃描消失(複審指出),
        //與經驗一之16同型: 守門認不出本專案的一種書寫形態, 等於對該形態沒有守門
        for (let m of code.matchAll(/\bREASON_[A-Z_]+\s*=\s*'([a-z-]+)'/g)) {
            add(m[1])
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

    it('以REASON_常數發出之歸因亦在掃描範圍內', function() {

        //runPlan以常數形態發出internal-address等四值; 掃描若只認字面量, 這些發出站點就不受守門
        let used = collectReasons()
        let r = ['internal-address', 'adapter-fetch-error', 'adapter-fetch-skip', 'fetcher-error'].map((v) => (used.get(v) || []).includes('runPlan.mjs'))
        let rr = [true, true, true, true]
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

    it('四種判識型別皆已登記於REASONS', function() {

        //字面量掃描抓不到這四個: runPlan是以 reason: inspection.type 指派的(變數而非字面量)。
        //此前它們確實不在REASONS內, 而該表同時宣稱自己是「完整值域」與「唯一權威」——
        //呼叫端依README列舉寫的分支, 碰到攔阻頁就會落到default。
        //守門機制自己漏了一種賦值形態, 故補上此條以型別清單而非字面量比對
        let unlisted = [DETECT_CAPTCHA, DETECT_VERIFY, DETECT_REDIRECT, DETECT_EMPTY].filter((v) => !Object.hasOwn(REASONS, v))
        let r = unlisted
        let rr = []
        assert.strict.deepEqual(r, rr)
    })

    it('pass不得成為reason', function() {

        //判識通過不會產生失敗歸因; 若它出現在REASONS內, 代表有人把「通過」也當成一種失敗
        let r = Object.hasOwn(REASONS, DETECT_PASS)
        let rr = false
        assert.strict.deepEqual(r, rr)
    })

    it('呼叫端實際收到的判識歸因確實可由REASONS查得', function() {

        //以行為面複驗上一條: 不只是清單有登記, 而是實際流出的值就是那四個
        let types = [DETECT_CAPTCHA, DETECT_VERIFY, DETECT_REDIRECT, DETECT_EMPTY]
        let r = types.map((v) => typeof REASONS[v] === 'string' && REASONS[v].length > 0)
        let rr = types.map(() => true)
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
