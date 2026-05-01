import { exec } from "child_process";

export async function GET() {
  return new Promise((resolve) => {
    exec("py -3.8 scripts/spotify.py", (error, stdout, stderr) => {
      if (error) {
        resolve(Response.json({ ok: false, error: stderr }));
        return;
      }

      resolve(Response.json({ ok: true, output: stdout }));
    });
  });
}