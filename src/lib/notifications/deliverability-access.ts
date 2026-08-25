export interface DeliverabilityAccessContext {
  status: string;
  permissionNames: ReadonlySet<string>;
}

export function canViewDeliverability(context: DeliverabilityAccessContext | null): boolean {
  return context?.status === "active" && context.permissionNames.has("Audit Log View");
}
