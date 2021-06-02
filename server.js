MRP_SERVER = null;

emit('mrp:getSharedObject', obj => MRP_SERVER = obj);

while (MRP_SERVER == null) {
    print('Waiting for shared object....');
}

onNet('mrp:valet:getCarsAtLocation', (source, locationId, ownerId) => {
    let query = {
        location: locationId,
        owner: ownerId
    };

    let options = {
        sort: {
            plate: -1
        },
        projection: {
            _id: 0,
            plate: 1,
            location: 1,
            model: 1
        }
    };

    MRP_SERVER.find('vehicle', query, options, (result) => {
        emitNet('mrp:valet:getCarsAtLocation:response', source, result);
    });
});