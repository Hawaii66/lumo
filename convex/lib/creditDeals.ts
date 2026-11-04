/** Seeded into `creditDeals` when the catalog is empty. */
export const DEFAULT_CREDIT_DEALS = [
  {
    name: "100 credits",
    description: "Startpack för AI-chatt och studiehjälp.",
    priceSek: 50,
    creditsGranted: 100,
    sortOrder: 10,
  },
  {
    name: "200 credits",
    description: "Mer utrymme för chatt och tvillingproblem.",
    priceSek: 80,
    creditsGranted: 200,
    sortOrder: 20,
  },
  {
    name: "500 credits",
    description: "Största paketet för intensiv pluggning.",
    priceSek: 160,
    creditsGranted: 500,
    sortOrder: 30,
  },
] as const;

export type CreditDealFields = {
  name: string;
  description: string;
  priceSek: number;
  creditsGranted: number;
  sortOrder: number;
};
