import assert from 'assert'
import estimateVisibleText from '../src/estimateVisibleText.mjs'


describe('estimateVisibleText', function() {

    it('移除標籤後回傳可見文字', function() {
        let r = estimateVisibleText('<html><body><p>abc</p> <p>def</p></body></html>')
        let rr = 'abc def'
        assert.strict.deepEqual(r, rr)
    })

    it('移除script與style內容', function() {
        let r = estimateVisibleText('<body><script>var a=1</script><style>p{color:red}</style><div>xyz</div></body>')
        let rr = 'xyz'
        assert.strict.deepEqual(r, rr)
    })

    it('僅取body內容, 不計head內文字', function() {
        let r = estimateVisibleText('<html><head><title>ttt</title></head><body><p>bbb</p></body></html>')
        let rr = 'bbb'
        assert.strict.deepEqual(r, rr)
    })

    it('無body標籤時視為全文', function() {
        let r = estimateVisibleText('<div>abc</div>')
        let rr = 'abc'
        assert.strict.deepEqual(r, rr)
    })

    it('HTML實體與連續空白壓縮為單一空白', function() {
        let r = estimateVisibleText('<body><p>a&nbsp;b</p>   <p>c</p></body>')
        let rr = 'a b c'
        assert.strict.deepEqual(r, rr)
    })

    it('非字串回傳空字串', function() {
        let r = [
            estimateVisibleText(null),
            estimateVisibleText(undefined),
            estimateVisibleText(123),
            estimateVisibleText({}),
        ]
        let rr = ['', '', '', '']
        assert.strict.deepEqual(r, rr)
    })

})
