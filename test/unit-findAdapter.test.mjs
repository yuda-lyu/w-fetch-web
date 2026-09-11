import assert from 'assert'
import findAdapter from '../src/findAdapter.mjs'
import { defaultAdapters } from '../src/fetchWeb.mjs'


//最小合法parse, 供測試adapter條目合法性用
let pz = () => {
    return { success: true }
}


//對多組輸入依序取type, 逐一await避免產生Promise陣列
let types = async (items, fun) => {
    let r = []
    for (let v of items) {
        let t = await fun(v)
        r.push(t.type)
    }
    return r
}


describe('findAdapter', function() {

    describe('match形態', function() {

        it('RegExp命中回傳hit且ctx為null', async function() {
            let a = { id: 'a', match: /^https?:\/\/a\.com\//, parse: pz }
            let t = await findAdapter('https://a.com/x', [a])
            let r = [t.type, t.adapter.id, t.ctx]
            let rr = ['hit', 'a', null]
            assert.strict.deepEqual(r, rr)
        })

        it('RegExp未命中回傳miss', async function() {
            let a = { id: 'a', match: /^https?:\/\/a\.com\//, parse: pz }
            let r = await findAdapter('https://b.com/x', [a])
            let rr = { type: 'miss' }
            assert.strict.deepEqual(r, rr)
        })

        it('函數回傳物件時該物件即為ctx', async function() {
            let a = {
                id: 'msn',
                match: (u) => {
                    let m = u.match(/\/ar-([A-Za-z0-9]+)/)
                    return m ? { id: m[1] } : null
                },
                parse: pz,
            }
            let t = await findAdapter('https://www.msn.com/en-us/money/x/ar-AA1X4Z9P', [a])
            let r = [t.type, t.adapter.id, t.ctx]
            let rr = ['hit', 'msn', { id: 'AA1X4Z9P' }]
            assert.strict.deepEqual(r, rr)
        })

        it('函數回傳true時ctx為null', async function() {
            let a = { id: 'a', match: () => true, parse: pz }
            let t = await findAdapter('https://a.com/', [a])
            let r = [t.type, t.ctx]
            let rr = ['hit', null]
            assert.strict.deepEqual(r, rr)
        })

        it('函數回傳falsy時視為未命中', async function() {
            let r = await types([null, false, undefined, 0, ''], (v) => {
                return findAdapter('https://a.com/', [{ id: 'a', match: () => v, parse: pz }])
            })
            let rr = ['miss', 'miss', 'miss', 'miss', 'miss']
            assert.strict.deepEqual(r, rr)
        })

        it('match缺少或型別不符者略過', async function() {
            let r = await types([
                { id: 'a', parse: pz },
                { id: 'a', match: 'a.com', parse: pz },
                { id: 'a', match: 123, parse: pz },
                { id: 'a', match: null, parse: pz },
            ], (a) => findAdapter('https://a.com/', [a]))
            let rr = ['miss', 'miss', 'miss', 'miss']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('match為async時', function() {

        it('async match回傳物件時可正確取得ctx', async function() {
            let a = { id: 'am', match: async () => ({ tag: 'x' }), parse: pz }
            let t = await findAdapter('https://a.com/', [a])
            let r = [t.type, t.ctx]
            let rr = ['hit', { tag: 'x' }]
            assert.strict.deepEqual(r, rr)
        })

        it('async match回傳falsy時視為未命中, 不因Promise為truthy而誤判命中', async function() {
            let a = { id: 'am', match: async () => null, parse: pz }
            let r = (await findAdapter('https://a.com/', [a])).type
            let rr = 'miss'
            assert.strict.deepEqual(r, rr)
        })

        it('async match之reject轉為error, 不外洩為unhandledRejection', async function() {
            let a = {
                id: 'am',
                match: async () => {
                    throw new Error('async boom')
                },
                parse: pz,
            }
            let t = await findAdapter('https://a.com/', [a])
            let r = [t.type, t.id, t.message]
            let rr = ['error', 'am', 'adapter am match error: async boom']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('match執行出錯', function() {

        it('函數match拋錯回傳error, 不視為未命中亦不續試後續adapter', async function() {
            let bad = {
                id: 'bad',
                match: () => {
                    throw new Error('boom')
                },
                parse: pz,
            }
            let good = { id: 'good', match: /a\.com/, parse: pz }
            let t = await findAdapter('https://a.com/', [bad, good])
            let r = [t.type, t.id, t.message]
            let rr = ['error', 'bad', 'adapter bad match error: boom']
            assert.strict.deepEqual(r, rr)
        })

        it('RegExp之test拋錯亦回傳error, 與函數式match同一錯誤邊界', async function() {
            let re = /x/
            re.test = () => {
                throw new Error('regex boom')
            }
            let t = await findAdapter('https://a.com/', [{ id: 'badre', match: re, parse: pz }])
            let r = [t.type, t.id, t.message]
            let rr = ['error', 'badre', 'adapter badre match error: regex boom']
            assert.strict.deepEqual(r, rr)
        })

        it('match出錯時不reject, 由呼叫端以回傳值判斷', async function() {
            let r = 'no-reject'
            try {
                await findAdapter('https://a.com/', [{
                    id: 'bad',
                    match: () => {
                        throw new Error('boom')
                    },
                    parse: pz,
                }])
            }
            catch (err) {
                r = err.message
            }
            let rr = 'no-reject'
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('RegExp狀態不殘留', function() {

        it('帶g旗標之RegExp重複比對同一網址結果穩定', async function() {
            let a = { id: 'g', match: /a\.com/g, parse: pz }
            let r = await types([1, 2, 3, 4], () => findAdapter('https://a.com/x', [a]))
            let rr = ['hit', 'hit', 'hit', 'hit']
            assert.strict.deepEqual(r, rr)
        })

        it('帶y旗標之RegExp重複比對同一網址結果穩定', async function() {
            let a = { id: 'y', match: /https/y, parse: pz }
            let r = await types([1, 2, 3], () => findAdapter('https://a.com/x', [a]))
            let rr = ['hit', 'hit', 'hit']
            assert.strict.deepEqual(r, rr)
        })

        it('不竄改呼叫端持有之RegExp實例lastIndex', async function() {
            let re = /a\.com/g
            re.lastIndex = 5
            await findAdapter('https://a.com/x', [{ id: 'g', match: re, parse: pz }])
            let r = re.lastIndex
            let rr = 5
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('adapter條目合法性', function() {

        it('缺parse者略過', async function() {
            let r = (await findAdapter('https://a.com/', [{ id: 'a', match: /a\.com/ }])).type
            let rr = 'miss'
            assert.strict.deepEqual(r, rr)
        })

        it('缺id或id非非空字串者略過', async function() {
            let r = await types([
                { match: /a\.com/, parse: pz },
                { id: '', match: /a\.com/, parse: pz },
                { id: 123, match: /a\.com/, parse: pz },
            ], (a) => findAdapter('https://a.com/', [a]))
            let rr = ['miss', 'miss', 'miss']
            assert.strict.deepEqual(r, rr)
        })

        it('條目非物件者略過, 且不影響後續合法條目', async function() {
            let good = { id: 'good', match: /a\.com/, parse: pz }
            let t = await findAdapter('https://a.com/', [null, undefined, 123, 'abc', good])
            let r = [t.type, t.adapter.id]
            let rr = ['hit', 'good']
            assert.strict.deepEqual(r, rr)
        })

        it('adapters非陣列或為空時回傳miss', async function() {
            let a = { id: 'a', match: /a\.com/, parse: pz }
            let r = await types([[], null, undefined, 'abc', { 0: a }], (v) => findAdapter('https://a.com/', v))
            let rr = ['miss', 'miss', 'miss', 'miss', 'miss']
            assert.strict.deepEqual(r, rr)
        })

        it('網址非有效字串時回傳miss', async function() {
            let a = { id: 'a', match: () => true, parse: pz }
            let r = await types(['', null, 123], (v) => findAdapter(v, [a]))
            let rr = ['miss', 'miss', 'miss']
            assert.strict.deepEqual(r, rr)
        })

    })

    describe('優先序與內建adapters', function() {

        it('依序試, 第一個命中者勝出', async function() {
            let a1 = { id: 'first', match: /a\.com/, parse: pz }
            let a2 = { id: 'second', match: /a\.com/, parse: pz }
            let r = (await findAdapter('https://a.com/', [a1, a2])).adapter.id
            let rr = 'first'
            assert.strict.deepEqual(r, rr)
        })

        it('內建adapters涵蓋gelonghui、bloomberg與msn', async function() {
            let r = []
            for (let u of [
                'https://www.gelonghui.com/p/123456',
                'https://www.bloomberg.com/news/articles/2026-01-01/abc',
                'https://www.bloomberg.com/opinion/articles/2026-01-01/abc',
                'https://www.bloomberg.com/features/2026-story/',
                'https://www.msn.com/zh-tw/news/other/abc/ar-AA2bZm9d',
            ]) {
                r.push((await findAdapter(u, defaultAdapters)).adapter.id)
            }
            let rr = ['gelonghui', 'bloomberg', 'bloomberg', 'bloomberg', 'msn']
            assert.strict.deepEqual(r, rr)
        })

        it('內建adapters未命中之網址回傳miss, 由Readability接手', async function() {

            //msn之非文章頁(首頁、頻道頁)與影片頁(vi-)不在msn adapter範圍, 維持既有之階梯流程
            let r = await types([
                'https://example.com/',
                'https://www.bloomberg.com/markets',
                'https://www.msn.com/zh-tw/news',
                'https://www.msn.com/en-us/video/x/vi-AA1abcde',
            ], (u) => findAdapter(u, defaultAdapters))
            let rr = ['miss', 'miss', 'miss', 'miss']
            assert.strict.deepEqual(r, rr)
        })

        it('msn命中時以match回傳之locale與id作為ctx', async function() {
            let t = await findAdapter('https://www.msn.com/zh-tw/news/other/abc/ar-AA2bZm9d?ocid=BingNewsSerp', defaultAdapters)
            let r = [t.adapter.id, t.ctx]
            let rr = ['msn', { locale: 'zh-tw', id: 'AA2bZm9d' }]
            assert.strict.deepEqual(r, rr)
        })

        it('使用端adapter排於內建之前時可覆寫內建同網域adapter', async function() {
            let mine = { id: 'my-gelonghui', match: /gelonghui\.com/, parse: pz }
            let t = await findAdapter('https://www.gelonghui.com/p/123456', [mine, ...defaultAdapters])
            let r = t.adapter.id
            let rr = 'my-gelonghui'
            assert.strict.deepEqual(r, rr)
        })

        it('內建adapters之陣列與條目為凍結, 不可新增或替換adapter', function() {

            //註: 僅陣列與條目本身凍結, 條目內之RegExp實例未凍結;
            //比對改以去除g與y之複本進行, 故不會因外部竄改lastIndex而影響選擇結果
            let r = [
                Object.isFrozen(defaultAdapters),
                Object.isFrozen(defaultAdapters[0]),
            ]
            let rr = [true, true]
            assert.strict.deepEqual(r, rr)
        })

    })

})
