import parseGelonghui from './parseGelonghui.mjs'
import parseBloomberg from './parseBloomberg.mjs'
import { matchMsn, fetchMsn } from './fetchMsn.mjs'


//內建站台adapter, 使用端可經opt.adapters註冊同網域adapter覆寫之,
//或以opt.useDefaultAdapters:false整份停用
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

    //msn: 文章頁為純前端渲染, 四階實測全數取不到正文, 改經其內容API取得(詳見fetchMsn.mjs)
    //
    //fallback:false之理由(有量測才標, 與inspect同一判準):
    //落回的存在理由是「忘了宣告時還抓得到內容, 只是走了爬蟲」。對msn此理由不成立——
    //2026-09-11實測預設階梯三層全滅(headless/headed可見文字21、camofox 0字)、成功率0、耗時43秒。
    //API失敗時(如410文章已不存在)落回只會白耗兩次Chrome啟動加一次camofox, 結果仍是失敗。
    //
    //未標inspect:false: 實測12篇重組後之HTML經判識全數通過, 沒有需要豁免的證據
    Object.freeze({
        id: 'msn',
        match: matchMsn,
        fetch: fetchMsn,
        fallback: false,
    }),
])

export default DEFAULT_ADAPTERS
