import assert from 'assert'
import navigateWithRedirectWait from '../src/navigateWithRedirectWait.mjs'


//以stub模擬Playwright之page, 記錄各方法之呼叫參數, 並保留waitForURL之判斷函數供斷言
let mockPage = ({ gotoErr = null } = {}) => {
    let calls = []
    let predicates = []
    return {
        calls,
        predicates,
        goto: async (url, o) => {
            calls.push(['goto', url, o.waitUntil, o.timeout])
            if (gotoErr) {
                throw new Error(gotoErr)
            }
        },
        waitForURL: async (fun, o) => {
            calls.push(['waitForURL', o.timeout])
            predicates.push(fun)
        },
        waitForLoadState: async (state, o) => {
            calls.push(['waitForLoadState', state, o.timeout])
        },
    }
}


describe('navigateWithRedirectWait', function() {

    it('依序導航、等待轉址、等待networkidle', async function() {
        let page = mockPage()
        await navigateWithRedirectWait(page, 'https://news.google.com/articles/xyz', 15000)
        let r = page.calls
        let rr = [
            ['goto', 'https://news.google.com/articles/xyz', 'domcontentloaded', 15000],
            ['waitForURL', 10000],
            ['waitForLoadState', 'networkidle', 10000],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('轉址判斷函數於網址脫離原host時才成立', async function() {
        let page = mockPage()
        await navigateWithRedirectWait(page, 'https://news.google.com/articles/xyz', 15000)
        let fun = page.predicates[0]
        let r = [
            fun({ href: 'https://news.google.com/articles/xyz' }),
            fun({ href: 'https://news.google.com/rss/articles/abc' }),
            fun({ href: 'https://www.example.com/real-article' }),
        ]
        let rr = [false, false, true]
        assert.strict.deepEqual(r, rr)
    })

    it('等待轉址與networkidle逾時不視為失敗', async function() {
        let page = mockPage()
        page.waitForURL = async () => {
            throw new Error('timeout')
        }
        page.waitForLoadState = async () => {
            throw new Error('timeout')
        }
        let r = 'no-throw'
        try {
            await navigateWithRedirectWait(page, 'https://a.com/b', 15000)
        }
        catch (err) {
            r = err.message
        }
        let rr = 'no-throw'
        assert.strict.deepEqual(r, rr)
    })

    it('導航失敗時往外拋錯, 由呼叫端之重試機制處理', async function() {
        let page = mockPage({ gotoErr: 'net::ERR_CONNECTION_REFUSED' })
        let r = 'no-throw'
        try {
            await navigateWithRedirectWait(page, 'https://a.com/b', 15000)
        }
        catch (err) {
            r = err.message
        }
        let rr = 'net::ERR_CONNECTION_REFUSED'
        assert.strict.deepEqual(r, rr)
    })

})
