import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'
import getFiles from 'w-package-tools/src/getFiles.mjs'


let fdSrc = './src'
let fdTar = './dist'


rollupFiles({
    fns: 'WFetchWeb.mjs',
    fdSrc,
    fdTar,
    nameDistType: 'kebabCase', //直接由hookNameDist給予
    globals: {
        'path': 'path',
        'fs': 'fs',
        'child_process': 'child_process',
        'util': 'util',
        'url': 'url',
        '@mozilla/readability': '@mozilla/readability',
        'jsdom': 'jsdom',
        'playwright': 'playwright',
    },
    external: [
        'path',
        'fs',
        'child_process',
        'util',
        'url',
        '@mozilla/readability',
        'jsdom',
        'playwright',
    ],
})
