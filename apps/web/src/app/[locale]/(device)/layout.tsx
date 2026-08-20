// apps/web/src/app/[locale]/(device)/layout.tsx

export default function DeviceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh w-full">{children}</div>;
}
