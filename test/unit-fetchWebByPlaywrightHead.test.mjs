import assert from 'assert'
import fetchWebByPlaywrightHead from '../src/fetchWebByPlaywrightHead.mjs'


//本檔僅涵蓋不需啟動瀏覽器之輸入檢核案例;
//需實際啟動有頭瀏覽器之案例見 fetchWebByPlaywrightHeadFlow.test.mjs


describe('fetchWebByPlaywrightHead', function() {

    it('非有效字串網址回傳invalid-url', async function() {
        let r = []
        for (let url of [null, undefined, '', 123, {}]) {
            let t = await fetchWebByPlaywrightHead(url)
            r.push([t.status, t.reason, t.method, t.attempts])
        }
        let rr = [
            ['error', 'invalid-url', 'playwright-headed', 0],
            ['error', 'invalid-url', 'playwright-headed', 0],
            ['error', 'invalid-url', 'playwright-headed', 0],
            ['error', 'invalid-url', 'playwright-headed', 0],
            ['error', 'invalid-url', 'playwright-headed', 0],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('非http與https網址回傳invalid-url', async function() {
        let r = []
        for (let url of ['abc', 'ftp://a.com/', 'file:///c:/a.html']) {
            let t = await fetchWebByPlaywrightHead(url)
            r.push([t.status, t.reason, t.attempts])
        }
        let rr = [
            ['error', 'invalid-url', 0],
            ['error', 'invalid-url', 0],
            ['error', 'invalid-url', 0],
        ]
        assert.strict.deepEqual(r, rr)
    })

})
