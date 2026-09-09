import assert from 'assert'
import map from 'lodash-es/map.js'
import getRetryWaitMs from '../src/getRetryWaitMs.mjs'


describe('getRetryWaitMs', function() {

    it('依次數線性遞增, 上限15000', function() {
        let r = map([1, 2, 3, 4, 5, 6, 99], (v) => getRetryWaitMs(v))
        let rr = [3000, 6000, 9000, 12000, 15000, 15000, 15000]
        assert.strict.deepEqual(r, rr)
    })

    it('非正整數回傳初始等待毫秒', function() {

        //0須一併涵蓋: attempt由1起算, 0不在契約內, 不可回0否則退避失效
        let r = map([0, null, undefined, -1, 1.5, 'abc', {}], (v) => getRetryWaitMs(v))
        let rr = [3000, 3000, 3000, 3000, 3000, 3000, 3000]
        assert.strict.deepEqual(r, rr)
    })

})
