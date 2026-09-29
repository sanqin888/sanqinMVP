export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    {
      status: 'ok',
      component: 'web',
    },
    {
      status: 200,
      headers: {
        'cache-control': 'no-store',
      },
    },
  );
}
