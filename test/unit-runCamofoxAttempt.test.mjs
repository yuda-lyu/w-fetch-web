import assert from 'assert'
import { killProcessTree } from '../src/runCamofoxAttempt.mjs'
import fetchWebByCamofox from '../src/fetchWebByCamofox.mjs'
import camofoxServerFake from './tools/camofoxServerFake.mjs'
import { isCI, camofoxInstalled } from './tools/env.mjs'


//以stub模擬子行程與平台呼叫, 免於在Windows真跑Unix路徑
let mkProc = (pid = 1234, killed = false) => {
    let calls = []
    return {
        pid,
        killed,
        calls,
        kill: (sig) => {
            calls.push(['proc.kill', sig])
        },
    }
}


describe('killProcessTree', function() {

    it('Windows以taskkill /F /T殺整棵樹', function() {
        let got = []
        let proc = mkProc(4321)
        killProcessTree(proc, {
            isWin: true,
            execFileSync: (exe, args) => {
                got.push([exe, args.join(' ')])
            },
        })
        let r = [got, proc.calls]
        let rr = [[['taskkill', '/F /T /PID 4321']], []]
        assert.strict.deepEqual(r, rr)
    })

    it('Unix以負PID對整個行程群組送SIGTERM, 而非只殺直接子行程', function() {

        //spawn時已detached建立行程群組, 故負PID可涵蓋瀏覽器等後代;
        //只對正PID送訊號會留下孤兒, 這正是本測試要鎖住的差異
        let got = []
        let proc = mkProc(4321)
        killProcessTree(proc, {
            isWin: false,
            killPid: (pid, sig) => {
                got.push([pid, sig])
            },
        })
        let r = [got, proc.calls]
        let rr = [[[-4321, 'SIGTERM']], []]
        assert.strict.deepEqual(r, rr)
    })

    it('群組送訊號失敗時退回只殺直接子行程', function() {
        let proc = mkProc(4321)
        killProcessTree(proc, {
            isWin: false,
            killPid: () => {
                throw new Error('ESRCH')
            },
        })
        let r = proc.calls
        let rr = [['proc.kill', 'SIGTERM']]
        assert.strict.deepEqual(r, rr)
    })

    it('taskkill失敗時亦退回只殺直接子行程', function() {
        let proc = mkProc(4321)
        killProcessTree(proc, {
            isWin: true,
            execFileSync: () => {
                throw new Error('not found')
            },
        })
        let r = proc.calls
        let rr = [['proc.kill', 'SIGTERM']]
        assert.strict.deepEqual(r, rr)
    })

    it('proc為空或已終止時不做任何事', function() {
        let proc = mkProc(4321, true)
        let got = []
        killProcessTree(null, { isWin: true, execFileSync: () => got.push('x') })
        killProcessTree(proc, { isWin: true, execFileSync: () => got.push('x') })
        let r = [got, proc.calls]
        let rr = [[], []]
        assert.strict.deepEqual(r, rr)
    })

})


describe('單次嘗試之資源釋放時序', function() {

    before(function() {
        if (!camofoxInstalled || isCI) {
            this.skip()
        }
    })

    it('重試前server已被關閉, 退避期間不再佔用該埠', async function() {
        this.timeout(180000)

        //以失敗之假server驅動重試; 於每次退避開始時檢查該埠是否仍被本次spawn之server佔用。
        //舊實作把清理放在呼叫端迴圈之finally, 而finally晚於catch內之await delay,
        //故退避的3至15秒期間server仍存活。本測試鎖住「清理早於退避」
        let fake = await camofoxServerFake({ failCreate: true })
        let t = null
        try {
            t = await fetchWebByCamofox('https://mp.weixin.qq.com/s/abc', {
                port: fake.port,
                maxRetries: 1,
                serverStartTimeoutMs: 8000,
            })
        }
        finally {
            await fake.close()
        }

        //兩次嘗試皆完整走完並各自清理, 故POST /tabs剛好兩次
        let nCreate = fake.requests.filter((s) => s === 'POST /tabs').length
        let r = [t.status, t.attempts, nCreate]
        let rr = ['error', 2, 2]
        assert.strict.deepEqual(r, rr)
    })

})
