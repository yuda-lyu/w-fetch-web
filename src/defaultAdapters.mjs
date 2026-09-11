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

    //msn: 文章頁(ar-)與影片頁(vi-)為純前端渲染, 四階實測全數取不到正文, 改經其內容API取得(詳見fetchMsn.mjs)
    //
    //fallback:false之理由(有量測才標):
    //落回的存在理由是「忘了宣告時還抓得到內容, 只是走了爬蟲」。對msn此理由不成立——
    //2026-09-11實測預設階梯三層全滅(headless/headed可見文字21、camofox 0字)、成功率0、耗時43秒。
    //API失敗時(如410內容已不存在)落回只會白耗兩次Chrome啟動加一次camofox, 結果仍是失敗。
    //fallback涵蓋整個adapter階(見runPlan之_mayEscalate): 逐字稿不足最低字數時亦於此收攤,
    //以empty-content回報, 不再被末階蓋成camofox-empty
    //
    //inspect:false之理由(靜態控制流即可確定, 不需等誤判被觀察到):
    //內建判識器是對「爬回來的頁面」所下的猜測——挑戰頁、轉址殼、只有框架沒有內容。
    //本adapter之HTML是由API之JSON組出, 來源已知, 該類猜測對它只有誤判一個方向:
    //  empty       圖多字少之圖集式報導(HTML>5000 bytes而可見文字<200)必被判空(以替身重現)
    //  強證據標題  標題恰以access denied、just a moment等開頭之正常內容, 不受內容量閘門保護, 正文再長也被擋
    //  弱證據標題  標題恰以loading、redirecting開頭而可見文字<500者亦被擋(此二者受閘門保護, 長文不受影響)
    //站方若在API前擋挑戰頁, 回應會是HTML而非JSON, 由fetchMsn以adapter-fetch-miss回報, 不靠判識器。
    //此宣告只關內建判識器, 呼叫端自己註冊的detectors照常比對(見inspectHtml之builtin)。
    //上一輪未標, 理由是「實測12篇皆通過判識」——那只證明那12篇通過, 不證明判識器該作用在此類內容上
    Object.freeze({
        id: 'msn',
        match: matchMsn,
        fetch: fetchMsn,
        inspect: false,
        fallback: false,
    }),
])

export default DEFAULT_ADAPTERS
