import { SafeLoot } from '@/components/safeloot';
export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ titulo?: string }>;
}) {
  const { id } = await params;
  const { titulo } = await searchParams;
  return <SafeLoot initialId={Number(id)} initialTitle={titulo || ''} />;
}
