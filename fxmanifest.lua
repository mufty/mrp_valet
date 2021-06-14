fx_version 'cerulean'
game 'gta5'

author 'mufty'
description 'MRP Valet parking'
version '0.0.1'

dependencies {
    "mrp_core",
    "mrp_vehicle"
}

files {
    'config/client.json',
}

client_scripts {
    '@mrp_core/shared/debug.js',
    'client.js',
}

server_scripts {
    '@mrp_core/shared/debug.js',
    'server.js',
}