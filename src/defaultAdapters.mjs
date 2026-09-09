import parseGelonghui from './parseGelonghui.mjs'
import parseBloomberg from './parseBloomberg.mjs'


//內建站台adapter, 使用端可經opt.adapters註冊同網域adapter覆寫之
let DEFAULT_ADAPTERS = Object.freeze([
    Object.freeze({
        id: 'gelonghui',
        match: /^https?:\/\/(?:www\.)?gelonghui\.com\//,
        parse: parseGelonghui,
    }),
    Object.freeze({
        id: 'bloomberg',
        match: /^https?:\/\/(?:www\.)?bloomberg\.com\/(?:news\/articles|opinion|features)\//,
        parse: parseBloomberg,
    }),
])

export default DEFAULT_ADAPTERS
