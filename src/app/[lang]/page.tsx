interface HomeProps {
  params: Promise<{ lang: string }>;
}

export default async function Home({ params }: HomeProps) {
  const { lang } = await params;

  return (
    <div className="flex-1 flex items-center justify-center py-24">
      <div className="text-center space-y-4">
        <h1 className="font-heading text-4xl font-bold">easyRecharge</h1>
        <p className="text-muted-foreground">
          Migration in progress — {lang.toUpperCase()}
        </p>
      </div>
    </div>
  );
}
