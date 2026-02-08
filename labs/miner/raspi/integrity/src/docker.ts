import http from "http";

const DOCKER_SOCKET = "/var/run/docker.sock";

function dockerRequest(path: string, method: string = "GET"): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: DOCKER_SOCKET, path, method }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data || "{}")); }
        catch (e) { reject(new Error(`Docker JSON parse error: ${String(e)}`)); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export async function listContainers(): Promise<any[]> {
  return dockerRequest("/containers/json?all=1");
}
export async function inspectContainer(id: string): Promise<any> {
  return dockerRequest(`/containers/${id}/json`);
}
export async function restartContainer(id: string): Promise<void> {
  await dockerRequest(`/containers/${id}/restart`, "POST");
}
