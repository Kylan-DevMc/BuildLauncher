const { Type } = require('helios-distribution-types')

exports.isModdedServer = server => Array.isArray(server?.modules)
    && server.modules.some(module => [Type.ForgeHosted, Type.Forge, Type.Fabric].includes(module.rawModule?.type))

exports.getServerDisplayName = server => {
    const name = server?.rawServer?.name ?? ''
    return name === 'Cobblemon-Ultra' ? 'Build' : name
}