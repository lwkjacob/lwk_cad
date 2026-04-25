fx_version 'cerulean'
game 'gta5'

name        'lwk_cad'
description 'LWK Police CAD/MDT — ERS Integration'
author      'LWK'
version     '1.0.0'

shared_scripts {
    'config.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/server.lua'
}

client_scripts {
    'client/client.lua'
}

ui_page 'ui/index.html.html'

files {
    'ui/index.html.html',
    'ui/nui.js',
    'ui/images/nypd_logo.png',
    'ui/images/nysp_logo.png',
    'ui/images/lcmap.png'
}
