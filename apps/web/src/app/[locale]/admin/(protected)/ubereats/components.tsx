import type { PropsWithChildren } from "react";

function Panel({
  children,
  className = "space-y-4",
}: PropsWithChildren<{ className?: string }>) {
  return <section className={className}>{children}</section>;
}

export function OAuthConnectionPanel({ children }: PropsWithChildren) {
  return <Panel>{children}</Panel>;
}
export function StoreMappingPanel({ children }: PropsWithChildren) {
  return <Panel>{children}</Panel>;
}
export function MenuDraftPanel({ children }: PropsWithChildren) {
  return <>{children}</>;
}
export function PublishHistoryPanel({ children }: PropsWithChildren) {
  return <>{children}</>;
}
export function OrdersPanel({ children }: PropsWithChildren) {
  return <Panel className="rounded-xl border bg-white p-4">{children}</Panel>;
}
export function ReconciliationPanel({ children }: PropsWithChildren) {
  return <>{children}</>;
}
export function OperationsTicketsPanel({ children }: PropsWithChildren) {
  return <>{children}</>;
}
