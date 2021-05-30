configFile = LoadResourceFile(GetCurrentResourceName(), 'config/client.json');

config = JSON.parse(configFile);

console.log("creating blips");

let blips = config.blips;
for (let info of blips) {
    info.blip = AddBlipForCoord(info.x, info.y, info.z);
    SetBlipSprite(info.blip, info.blipId);
    SetBlipDisplay(info.blip, 4);
    SetBlipScale(info.blip, 1.0);
    SetBlipColour(info.blip, info.color);
    SetBlipAsShortRange(info.blip, true);
    BeginTextCommandSetBlipName("STRING");
    AddTextComponentString(info.title);
    EndTextCommandSetBlipName(info.blip);
}

let currentlyAtBlip = null;

setInterval(() => {
    let ped = PlayerPedId();
    if (!ped)
        return;

    let [pX, pY, pZ] = GetEntityCoords(ped);
    let foundBlip = null;
    for (let info of blips) {
        if (!info.blip)
            continue;

        let [blipX, blipY, blipZ] = GetBlipCoords(info.blip);
        let distanceFromBlip = Vdist(pX, pY, pZ, blipX, blipY, blipZ);
        let valetCfg = config["valet_" + info.id];
        if (valetCfg.area >= distanceFromBlip) {
            foundBlip = valetCfg;
        }
    }

    if (currentlyAtBlip == null && foundBlip != null) {
        //entered blip add menu
        emit('mrp:radial_menu:addMenuItem', {
            id: 'park',
            text: config.locale.park,
            action: 'https://mrp_valet/park'
        });
    } else if (currentlyAtBlip != null && foundBlip == null) {
        //leaving blip remove menu
        emit('mrp:radial_menu:removeMenuItem', {
            id: 'park'
        });
    }
    currentlyAtBlip = foundBlip;
}, 500);