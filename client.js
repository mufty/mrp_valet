MRP_CLIENT = null;

emit('mrp:vehicle:getSharedObject', obj => MRP_CLIENT = obj);

while (MRP_CLIENT == null) {
    print('Waiting for shared object....');
}

configFile = LoadResourceFile(GetCurrentResourceName(), 'config/client.json');

eval(LoadResourceFile('mrp_core', 'client/helpers.js'));

config = JSON.parse(configFile);

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

let buildMenu = (blip) => {
    emit('mrp:radial_menu:removeMenuItem', {
        id: 'park'
    });
    let char = MRP_CLIENT.GetPlayerData();
    MRP_CLIENT.TriggerServerCallback('mrp:valet:getCarsAtLocation', [blip.id, char._id], (cars) => {
        let submenu;
        if (cars && cars.length > 0) {
            submenu = [];
            submenu.push({
                id: 'PARK_VEHICLE',
                text: "Park current vehicle",
                action: 'https://mrp_valet/park'
            });
            for (let car of cars) {
                let displayName = GetDisplayNameFromVehicleModel(car.model);
                displayName = GetLabelText(displayName);
                submenu.push({
                    id: car.plate,
                    text: displayName + " [" + car.plate + "]",
                    action: 'https://mrp_valet/takeOut'
                });
            }
        }
        emit('mrp:radial_menu:addMenuItem', {
            id: 'park',
            text: config.locale.park,
            submenu: submenu,
            action: 'https://mrp_valet/park'
        });
    });
};

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
        valetCfg.id = "valet_" + info.id;
        RequestModel(valetCfg.model);
        if (valetCfg.area >= distanceFromBlip) {
            foundBlip = valetCfg;
        }
    }

    if (currentlyAtBlip == null && foundBlip != null) {
        //entered blip add menu
        buildMenu(foundBlip);
    } else if (currentlyAtBlip != null && foundBlip == null) {
        //leaving blip remove menu
        emit('mrp:radial_menu:removeMenuItem', {
            id: 'park'
        });
    }
    currentlyAtBlip = foundBlip;
}, 500);

let getNearestVehicle = (ped, area) => {
    return new Promise((resolve) => {
        MRP_CLIENT.findNearestAccessibleVehicle(ped, 30, false, (veh) => {
            resolve(veh);
        });
    });
};

let vehiclesParking = {};

let isTimedout = (startTime) => {
    let currentTs = Date.now();
    if (!currentlyAtBlip)
        return true;

    if (currentTs - startTime > currentlyAtBlip.timeout) {
        return true;
    }
    return false;
};

on("mrp:valet:startParkingScenario", () => {
    let exec = async () => {
        let actionStarted = Date.now();
        let ped = PlayerPedId();
        let nearestVehicle = await getNearestVehicle(ped, config.nearestVehicleArea);
        if (!nearestVehicle || !nearestVehicle.vehicle)
            return;

        if (!vehiclesParking[nearestVehicle.vehicle])
            vehiclesParking[nearestVehicle.vehicle] = true;
        else
            return; //parking in progress don't do multiple valets

        let modelHash = GetHashKey(currentlyAtBlip.npcSpawn.model);
        RequestModel(modelHash);
        while (currentlyAtBlip && !HasModelLoaded(modelHash) && !isTimedout(actionStarted)) {
            await utils.sleep(100);
        }

        if (!currentlyAtBlip)
            return;

        let valetNPCPed = CreatePed(1, modelHash, currentlyAtBlip.npcSpawn.x, currentlyAtBlip.npcSpawn.y, currentlyAtBlip.npcSpawn.z, currentlyAtBlip.npcSpawn.heading, true, true);
        await utils.sleep(150);
        //tell guy to get into vehicle
        TaskEnterVehicle(valetNPCPed, nearestVehicle.vehicle, 10000, -1, 2.0, 1, 0);
        await utils.sleep(150);
        //task numbers from https://alloc8or.re/gta5/doc/enums/eScriptTaskHash.txt
        while (GetScriptTaskStatus(valetNPCPed, 0x950B6492) != 7 && !isTimedout(actionStarted)) {
            //wait until NPC in vehicle
            await utils.sleep(100);
        }

        //786603 = normal driving mode more at https://gtaforums.com/topic/822314-guide-driving-styles/
        TaskVehicleDriveToCoord(valetNPCPed,
            nearestVehicle.vehicle,
            currentlyAtBlip.parkAt.x,
            currentlyAtBlip.parkAt.y,
            currentlyAtBlip.parkAt.z,
            currentlyAtBlip.parkAt.speed,
            1.0,
            GetEntityModel(nearestVehicle.vehicle),
            786603,
            1.0,
            1.0);

        while (GetScriptTaskStatus(valetNPCPed, 0x93A5526E) != 7 && !isTimedout(actionStarted)) {
            //wait they finish a drive
            await utils.sleep(100);
        }

        //parked despawn and save
        delete vehiclesParking[nearestVehicle.vehicle];
        DeleteEntity(valetNPCPed);
        DeleteEntity(nearestVehicle.vehicle);
    };

    exec();
});

on("mrp:valet:saveVehicle", () => {
    let exec = async () => {
        let ped = PlayerPedId();
        let nearestVehicle = await getNearestVehicle(ped, config.nearestVehicleArea);
        if (!nearestVehicle || !nearestVehicle.vehicle)
            return;

        let vehicleProperties = MRP_CLIENT.getVehicleProperties(nearestVehicle.vehicle);
        let char = MRP_CLIENT.GetPlayerData();
        vehicleProperties.owner = char._id;
        vehicleProperties.location = currentlyAtBlip.id;
        let source = GetPlayerServerId(PlayerId());
        emitNet('mrp:vehicle:save', source, vehicleProperties);
    };

    exec();
});

onNet('mrp:vehicle:saved', () => {
    if (currentlyAtBlip) {
        console.log("updating radial menu");
        buildMenu(currentlyAtBlip);
    }
});

on('mrp:valet:takeOut', (data) => {
    //TODO take out vehicle
    MRP_CLIENT.TriggerServerCallback('mrp:valet:takeoutVehicle', [data.id], (vehicle) => {
        if (!vehicle)
            return;

        if (!currentlyAtBlip)
            return;

        //check parking vehicles and despawn them if one is already out to prevent douplicate vehicles
        if (vehiclesParking) {
            let vehiclesToRemove = [];
            for (let parkingVehicle in vehiclesParking) {
                let parkingPlate = GetVehicleNumberPlateText(parkingVehicle).trim();
                if (parkingPlate == vehicle.plate) {
                    DeleteEntity(parkingVehicle);
                    vehiclesToRemove.push(parkingVehicle);
                }
            }

            if (vehiclesToRemove.length > 0) {
                for (let i in vehiclesToRemove) {
                    let veh = vehiclesToRemove[i];
                    delete vehiclesParking[veh];
                }
            }
        }

        let exec = async () => {
            let actionStarted = Date.now();
            RequestModel(vehicle.model);
            while (currentlyAtBlip && !HasModelLoaded(vehicle.model) && !isTimedout(actionStarted)) {
                await utils.sleep(100);
            }

            let spawnedVehicle = CreateVehicle(vehicle.model,
                currentlyAtBlip.parkAt.x,
                currentlyAtBlip.parkAt.y,
                currentlyAtBlip.parkAt.z,
                currentlyAtBlip.parkAt.heading,
                true,
                true);

            //apply modification and look
            MRP_CLIENT.setVehicleProperties(spawnedVehicle, vehicle);

            buildMenu(currentlyAtBlip);

            let modelHash = GetHashKey(currentlyAtBlip.npcSpawn.model);
            RequestModel(modelHash);
            while (currentlyAtBlip && !HasModelLoaded(modelHash) && !isTimedout(actionStarted)) {
                await utils.sleep(100);
            }

            if (!currentlyAtBlip)
                return;

            let valetNPCPed = CreatePed(1, modelHash, currentlyAtBlip.parkAt.x,
                currentlyAtBlip.parkAt.y,
                currentlyAtBlip.parkAt.z,
                currentlyAtBlip.parkAt.heading, true, true);
            TaskEnterVehicle(valetNPCPed, spawnedVehicle, 10000, -1, 2.0, 16, 0); // teleport into the vehicle as driver

            let [playerX, playerY, playerZ] = GetEntityCoords(PlayerPedId());

            TaskVehicleDriveToCoord(valetNPCPed,
                spawnedVehicle,
                playerX,
                playerY,
                playerZ,
                currentlyAtBlip.parkAt.speed,
                1.0,
                vehicle.model,
                786603,
                1.0,
                1.0);

            while (GetScriptTaskStatus(valetNPCPed, 0x93A5526E) != 7 && !isTimedout(actionStarted)) {
                await utils.sleep(100);
            }

            TaskLeaveVehicle(valetNPCPed, spawnedVehicle, 0);

            while (GetScriptTaskStatus(valetNPCPed, 0x1AE73569) != 7 && !isTimedout(actionStarted)) {
                await utils.sleep(100);
            }

            //TODO TaskGoToCoordAnyMeans isn't documented very well need to look at how all the params work
            /*TaskGoToCoordAnyMeans(valetNPCPed,
                currentlyAtBlip.npcSpawn.x,
                currentlyAtBlip.npcSpawn.y,
                currentlyAtBlip.npcSpawn.z,
                currentlyAtBlip.parkAt.speed, 1, true, 786603, 1);

            while (GetScriptTaskStatus(valetNPCPed, 0x93399E79) != 7) {
                await utils.sleep(100);
            }
            console.log("done walking");*/

            DeleteEntity(valetNPCPed);
        };
        exec();
    });
});

RegisterNuiCallbackType('park');
on('__cfx_nui:park', (data, cb) => {
    if (currentlyAtBlip == null)
        return;

    emit("mrp:valet:startParkingScenario");
    emit("mrp:valet:saveVehicle");

    cb({});
});

RegisterNuiCallbackType('takeOut');
on('__cfx_nui:takeOut', (data, cb) => {
    if (currentlyAtBlip == null)
        return;

    emit("mrp:valet:takeOut", data);

    cb({});
});