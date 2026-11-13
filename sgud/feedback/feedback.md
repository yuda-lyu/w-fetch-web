# 回饋

任務中發現之自有套件、全域技能、全域設定之調整與抽提提案(全域設定 §12.2).只增不改:處置結果另記一列,寫明承接哪一列.

| # | 日期 | 類別 | 對象 | 內容 | 依據 |
|---|---|---|---|---|---|
| 1 | 2026-11-13 | 自有套件 | w-playwright | 被測函數「每次呼叫自行啟動瀏覽器」之使用端(本套件之 `runPlaywright`、w-dwdata-hub 之 `fetchMops`)要讓測試每檔至多啟動一次,各自都得以 `setBrowserTypeForTest` 寫一份「第一次 `next()` 真啟動、其後共用、`close` 只關 context」之包裝;建議由 w-playwright 之 `test/tools`(或公開之測試輔助)提供一份,使用端不各寫一份 | 本套件 `test/tools/sharedChrome.mjs`;設計 §5.2 第 2 點 |
| 2 | 2026-11-13 | 自有套件 | w-playwright | 使用端之重試迴圈分不出「確定性拒絕」(`E_ENV`、`E_PW_VERSION`、`E_LOGON_GUARD`、`E_BROWSER_MISSING`、`E_ARG`)與「可能暫時」之失敗(`E_LAUNCH`、`E_LAUNCH_TIMEOUT`),只能逐包手寫 code 清單;建議 w-playwright 提供判斷函數或於錯誤上標可否重試,使用端據以不重試確定性拒絕(本套件現況:拒絕仍依 `maxRetries` 重試至多 6 次、白等約 45 秒;w-dwdata-hub 啟動重試 11 次) | `src/runPlaywright.mjs` 之 `_runOnce` catch;w-playwright `README.md` code 表 |
| 3 | 2026-11-13 | 全域技能 | fetch-web | `SKILL.md` 仍寫 `playwright` 為 w-fetch-web 之內部相依(第 46、72 行),本輪起改為 `w-playwright`(帶 `playwright-core` 精確 1.64.1);另宜補「每次啟動一律加守門參數、`PWDEBUG`／`SELENIUM_REMOTE_URL` 拒絕、須安裝 Google Chrome」.設計 §5.1 本套件之列要求連帶更新並提醒各機同步 | `~/.claude/skills/fetch-web/SKILL.md:46,72`;本套件 `README.md`〈Browser launch (w-playwright)〉 |
| 4 | 2026-11-13 | 全域技能 | role-coder-for-test | 「修前之測試不得啟動真瀏覽器」時,只排除已知之瀏覽器測試檔不夠(探測函數與未替換之路徑也會啟動);可行且已實測之作法為 `NODE_OPTIONS=--import=<掛鉤>` 註冊 ESM resolve 掛鉤,把非 `node_modules` 內之 `playwright`／`playwright-core` 匯入改指拋錯並記錄堆疊之 stub(mocha 平行之 worker 經 `NODE_OPTIONS` 繼承),既跑得出修前基線,也跑得出修前紅測;建議收入 §5 或相關章節 | 本套件 `CLAUDE_experience.md` 八;`tmp/quiet-run/20261113-135301-pm-fw-before-blocked.log`(擋下 4 次皆為探測) |
