import type { Response } from "express";

type Client = { id: string; res: Response };
const clients: Client[] = [];

export function addClient(id: string, res: Response) {
  clients.push({ id, res });
}

export function removeClient(id: string) {
  const i = clients.findIndex(c => c.id === id);
  if (i >= 0) clients.splice(i, 1);
}

export function broadcast(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.res.write(payload);
}
