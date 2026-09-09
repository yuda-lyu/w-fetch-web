import assert from 'assert'
import isValidUrl from '../src/isValidUrl.mjs'


describe('isValidUrl', function() {

    it('http與https網址為有效', function() {
        let r = [
            isValidUrl('https://www.google.com/'),
            isValidUrl('http://www.google.com/'),
            isValidUrl('http://127.0.0.1:8080/abc?q=1'),
            isValidUrl('https://mp.weixin.qq.com/s/xxxxxx'),
        ]
        let rr = [true, true, true, true]
        assert.strict.deepEqual(r, rr)
    })

    it('非http與https協定為無效', function() {
        let r = [
            isValidUrl('ftp://www.google.com/'),
            isValidUrl('file:///c:/tmp/a.html'),
            isValidUrl('data:text/html,abc'),
        ]
        let rr = [false, false, false]
        assert.strict.deepEqual(r, rr)
    })

    it('非網址字串為無效', function() {
        let r = [
            isValidUrl('abc'),
            isValidUrl('www.google.com'),
            isValidUrl('/abc/def'),
        ]
        let rr = [false, false, false]
        assert.strict.deepEqual(r, rr)
    })

    it('非有效字串為無效', function() {
        let r = [
            isValidUrl(''),
            isValidUrl(null),
            isValidUrl(undefined),
            isValidUrl(123),
            isValidUrl({}),
            isValidUrl([]),
        ]
        let rr = [false, false, false, false, false, false]
        assert.strict.deepEqual(r, rr)
    })

})
