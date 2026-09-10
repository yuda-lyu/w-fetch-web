import assert from 'assert'
import { getOptBool, getOptPInt, getOptP0Int, getOptStr, getOptArr } from '../src/getOpt.mjs'


//選項取值之契約。
//
//本套件所有公開函數的opt皆經此處理, 其契約為「型別不符一律採預設值, 不拋錯亦不強制轉換」——
//這是「公開函數不reject、非法輸入退回預設」這條對外承諾的實作處。
//此前只被各抓取器的整合測試間接覆蓋, 邊界(0、負數、空字串、null、非物件opt)無一處可查


describe('getOptBool', function() {

    it('布林值原樣取用', function() {
        let r = [getOptBool({ v: true }, 'v', false), getOptBool({ v: false }, 'v', true)]
        let rr = [true, false]
        assert.strict.deepEqual(r, rr)
    })

    it('非布林一律採預設, 不以truthiness判定', function() {

        //字串'false'、數字0、空字串若被當成布林處理, 呼叫端會得到與其書寫相反的行為
        let r = ['true', 'false', 0, 1, '', null, undefined, {}, []].map((v) => {
            return getOptBool({ v }, 'v', true)
        })
        let rr = [true, true, true, true, true, true, true, true, true]
        assert.strict.deepEqual(r, rr)
    })

})


describe('getOptPInt', function() {

    it('正整數原樣取用', function() {
        let r = [getOptPInt({ v: 1 }, 'v', 99), getOptPInt({ v: 15000 }, 'v', 99)]
        let rr = [1, 15000]
        assert.strict.deepEqual(r, rr)
    })

    it('0與負數採預設', function() {

        //逾時、埠號等以本函數取值者, 0或負數無意義
        let r = [getOptPInt({ v: 0 }, 'v', 99), getOptPInt({ v: -1 }, 'v', 99)]
        let rr = [99, 99]
        assert.strict.deepEqual(r, rr)
    })

    it('非整數與非數字採預設', function() {
        let r = [1.5, null, undefined, NaN, Infinity, {}].map((v) => getOptPInt({ v }, 'v', 99))
        let rr = [99, 99, 99, 99, 99, 99]
        assert.strict.deepEqual(r, rr)
    })

})


describe('getOptP0Int', function() {

    it('0為合法值, 與getOptPInt之差別即在此', function() {

        //maxRetries、snapshotRetries等以本函數取值: 0代表「不重試」, 是有意義的指定
        let r = [getOptP0Int({ v: 0 }, 'v', 5), getOptPInt({ v: 0 }, 'v', 5)]
        let rr = [0, 5]
        assert.strict.deepEqual(r, rr)
    })

    it('負數與非整數採預設', function() {
        let r = [-1, 1.5, null, undefined].map((v) => getOptP0Int({ v }, 'v', 5))
        let rr = [5, 5, 5, 5]
        assert.strict.deepEqual(r, rr)
    })

})


describe('各型別之寬容度', function() {

    it('數字類接受數字字串並轉為數字', function() {

        //逾時、埠號、重試次數常來自環境變數、CLI參數或JSON設定, 到手即為字串;
        //要求每個呼叫端自行parseInt只會讓同一段轉型散落各處
        let a = getOptPInt({ v: '3' }, 'v', 99)
        let b = getOptP0Int({ v: '0' }, 'v', 5)
        let r = [a, typeof a, b, typeof b]
        let rr = [3, 'number', 0, 'number']
        assert.strict.deepEqual(r, rr)
    })

    it('布林類不接受字串, 與數字類刻意不同', function() {

        //'false'為truthy: 一旦接受字串, 呼叫端寫'false'卻得到true, 與其書寫相反。
        //此不對稱有理由, 見getOpt.mjs檔頭
        let r = [
            getOptBool({ v: 'true' }, 'v', false),
            getOptBool({ v: 'false' }, 'v', true),
            getOptBool({ v: '1' }, 'v', false),
        ]
        let rr = [false, true, false]
        assert.strict.deepEqual(r, rr)
    })

    it('字串類與陣列類只接受該型別本身', function() {
        let r = [
            getOptStr({ v: 123 }, 'v', 'd'),
            getOptArr({ v: '[]' }, 'v', ['d']),
        ]
        let rr = ['d', ['d']]
        assert.strict.deepEqual(r, rr)
    })

    it('數字類拒絕Infinity(第一層: wsemi之useLimitSafe)', function() {

        //不加useLimitSafe時ispint(Infinity)為true: cdbl以lodash之toFinite把Infinity
        //夾成Number.MAX_VALUE, 而該值是整數故判定通過。此為型別層的事, 由wsemi負責
        let r = [
            getOptPInt({ v: Infinity }, 'v', 15000),
            getOptP0Int({ v: Infinity }, 'v', 5),
            getOptPInt({ v: Number.MAX_VALUE }, 'v', 15000),
        ]
        let rr = [15000, 5, 15000]
        assert.strict.deepEqual(r, rr)
    })

    it('數字類拒絕超過計時器上限之安全整數(第二層: 本套件之契約)', function() {

        //3e9是合法的安全整數, 故第一層放行; 但setTimeout與child_process之timeout
        //只吃32位元有號整數, 超過即溢位而被Node設為1毫秒——實測 timeout:3e9 使curl
        //於22毫秒內被SIGTERM殺掉。wsemi無從得知該值要進計時器, 故此層由本套件負責
        let r = [
            getOptPInt({ v: 3e9 }, 'v', 15000),
            getOptPInt({ v: 2147483648 }, 'v', 15000),
            getOptPInt({ v: 2147483647 }, 'v', 15000),
        ]
        let rr = [15000, 15000, 2147483647]
        assert.strict.deepEqual(r, rr)
    })

    it('正常範圍之值不受上限檢核影響', function() {
        let r = [
            getOptPInt({ v: 15000 }, 'v', 99),
            getOptPInt({ v: 19377 }, 'v', 99),
            getOptP0Int({ v: 0 }, 'v', 99),
            getOptPInt({ v: '3' }, 'v', 99),
        ]
        let rr = [15000, 19377, 0, 3]
        assert.strict.deepEqual(r, rr)
    })

})


describe('getOptStr', function() {

    it('非空字串原樣取用', function() {
        let r = getOptStr({ v: 'curl' }, 'v', 'auto')
        let rr = 'curl'
        assert.strict.deepEqual(r, rr)
    })

    it('空字串採預設', function() {

        //空字串視為未指定: 呼叫端給空字串多為變數未賦值所致, 而非有意指定空值
        let r = getOptStr({ v: '' }, 'v', 'auto')
        let rr = 'auto'
        assert.strict.deepEqual(r, rr)
    })

    it('非字串採預設', function() {
        let r = [123, null, undefined, {}, []].map((v) => getOptStr({ v }, 'v', 'auto'))
        let rr = ['auto', 'auto', 'auto', 'auto', 'auto']
        assert.strict.deepEqual(r, rr)
    })

})


describe('getOptArr', function() {

    it('陣列原樣取用, 空陣列亦為合法值', function() {
        let r = [getOptArr({ v: [1] }, 'v', ['d']), getOptArr({ v: [] }, 'v', ['d'])]
        let rr = [[1], []]
        assert.strict.deepEqual(r, rr)
    })

    it('非陣列採預設', function() {
        let r = ['x', 123, null, undefined, {}].map((v) => getOptArr({ v }, 'v', ['d']))
        let rr = [['d'], ['d'], ['d'], ['d'], ['d']]
        assert.strict.deepEqual(r, rr)
    })

})


describe('opt本身非物件時之行為', function() {

    it('opt為null、undefined或純值時一律採預設, 不拋錯', function() {

        //公開函數之opt有預設值{}, 但內部轉傳與測試接縫可能傳入其他值;
        //本套件對外承諾「不reject」, 故此處不得拋錯
        let r = [null, undefined, 'x', 123, true].map((opt) => {
            return [
                getOptBool(opt, 'v', true),
                getOptPInt(opt, 'v', 9),
                getOptStr(opt, 'v', 'd'),
                getOptArr(opt, 'v', []),
            ]
        })
        let rr = [
            [true, 9, 'd', []],
            [true, 9, 'd', []],
            [true, 9, 'd', []],
            [true, 9, 'd', []],
            [true, 9, 'd', []],
        ]
        assert.strict.deepEqual(r, rr)
    })

    it('鍵不存在時採預設', function() {
        let r = [getOptBool({}, 'nope', true), getOptStr({ other: 'x' }, 'nope', 'd')]
        let rr = [true, 'd']
        assert.strict.deepEqual(r, rr)
    })

})
