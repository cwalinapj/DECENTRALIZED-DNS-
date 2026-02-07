const clients = [];
export function addClient(id, res) {
    clients.push({ id, res });
}
export function removeClient(id) {
    const i = clients.findIndex(c => c.id === id);
    if (i >= 0)
        clients.splice(i, 1);
}
export function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients)
        c.res.write(payload);
}
