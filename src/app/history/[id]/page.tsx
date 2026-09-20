import { redirect } from 'next/navigation';

type PageProps = { params: Promise<{ id: string }> };

/** Legacy run URLs now live under /history/runs/[id]. */
export default async function LegacyRunHistoryPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/history/runs/${id}`);
}
