configFile = LoadResourceFile(GetCurrentResourceName(), 'config/client.json');

eval(LoadResourceFile('mrp_core', 'client/helpers.js'));

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
let lastVehicle = null;

setInterval(() => {
    let ped = PlayerPedId();
    if (!ped)
        return;

    let vehicle = GetVehiclePedIsIn(ped, true);
    lastVehicle = vehicle;

    let [pX, pY, pZ] = GetEntityCoords(ped);
    let foundBlip = null;
    for (let info of blips) {
        if (!info.blip)
            continue;

        let [blipX, blipY, blipZ] = GetBlipCoords(info.blip);
        let distanceFromBlip = Vdist(pX, pY, pZ, blipX, blipY, blipZ);
        let valetCfg = config["valet_" + info.id];
        valetCfg.id = config["valet_" + info.id];
        RequestModel(valetCfg.model);
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

RegisterNuiCallbackType('park');
on('__cfx_nui:park', (data, cb) => {
    //TODO change lastVehicle to nearest vehicle
    if (lastVehicle == 0 || currentlyAtBlip == null)
        return;

    let exec = async () => {
        let modelHash = GetHashKey(currentlyAtBlip.npcSpawn.model);
        RequestModel(modelHash);
        while (currentlyAtBlip && !HasModelLoaded(modelHash)) {
            await utils.sleep(100);
        }

        if (!currentlyAtBlip)
            return;

        let valetNPCPed = CreatePed(1, modelHash, currentlyAtBlip.npcSpawn.x, currentlyAtBlip.npcSpawn.y, currentlyAtBlip.npcSpawn.z, currentlyAtBlip.npcSpawn.heading, true, true);
        await utils.sleep(150);
        //tell guy to get into vehicle
        TaskEnterVehicle(valetNPCPed, lastVehicle, 10000, -1, 2.0, 1, 0);
        await utils.sleep(150);
        //task numbers from https://alloc8or.re/gta5/doc/enums/eScriptTaskHash.txt
        while (GetScriptTaskStatus(valetNPCPed, 0x950B6492) != 7) {
            //wait until NPC in vehicle
            await utils.sleep(100);
        }

        //786603 = normal driving mode more at https://gtaforums.com/topic/822314-guide-driving-styles/
        TaskVehicleDriveToCoord(valetNPCPed,
            lastVehicle,
            currentlyAtBlip.parkAt.x,
            currentlyAtBlip.parkAt.y,
            currentlyAtBlip.parkAt.z,
            currentlyAtBlip.parkAt.speed,
            1.0,
            GetEntityModel(lastVehicle),
            786603,
            1.0,
            1.0);

        while (GetScriptTaskStatus(valetNPCPed, 0x93A5526E) != 7) {
            //wait they finish a drive
            await utils.sleep(100);
        }

        //parked despawn and save
        DeleteEntity(valetNPCPed);
        DeleteEntity(lastVehicle);
        //TODO save
    };

    exec();

    cb();
});