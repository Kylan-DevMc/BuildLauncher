const { DistributionAPI } = require('helios-core/common')
const path = require('path')

const ConfigManager = require('./configmanager')
const isDev = require('./isdev')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://launcher.cobblemon-ultra.fr/distribution.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    isDev
)

if(isDev) {
    api.distroDevPath = path.resolve(__dirname, '../../../distribution.json')
}

exports.DistroAPI = api