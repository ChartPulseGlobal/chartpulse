export async function GET() {
  return Response.json({
    ok: false,
    message: "Update disabled on Vercel. Use GitHub Actions instead."
  });
}
